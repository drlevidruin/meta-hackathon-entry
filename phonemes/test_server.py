import io
import json
import os
import sys
import unittest
from contextlib import redirect_stderr
from email.message import Message
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from server import Handler, MODEL, REVISION, AUDIO_LIMIT
import server as service
from test_wav import make_wav


class QuietHandler(Handler):
    def send_response(self, status):
        self.status = status

    def send_header(self, name, value):
        pass

    def end_headers(self):
        pass


def request(path, data=b'', content_type='audio/wav', length=None, infer=None):
    handler = QuietHandler.__new__(QuietHandler)
    handler.path = path
    handler.headers = Message()
    handler.headers['Content-Type'] = content_type
    handler.headers['Content-Length'] = str(len(data) if length is None else length)
    handler.rfile = io.BytesIO(data)
    handler.wfile = io.BytesIO()
    handler.server = SimpleNamespace(infer=infer or (lambda samples: []))
    return handler


class ServerTests(unittest.TestCase):
    def test_health_names_the_pinned_model_and_revision(self):
        handler = request('/health')
        handler.do_GET()
        self.assertEqual(handler.status, 200)
        self.assertEqual(json.loads(handler.wfile.getvalue()), {'ok': True, 'model': MODEL, 'revision': REVISION})

    def test_phonemes_decodes_in_memory_and_returns_tokens(self):
        tokens = [{'token': 'ɑ', 'start': 0, 'end': 0.02, 'top': [['ɑ', 0.9]]}]
        calls = []

        def infer(samples):
            calls.append(samples)
            return tokens

        handler = request('/phonemes', make_wav(np.array([0, 8192], dtype='<i2').tobytes()), infer=infer)
        handler.do_POST()
        self.assertEqual(handler.status, 200)
        self.assertEqual(json.loads(handler.wfile.getvalue()), {'tokens': tokens})
        np.testing.assert_array_equal(calls[0], np.array([0, 0.25], dtype=np.float32))

    def test_invalid_requests_never_reach_inference_or_echo_audio(self):
        secret = b'PRIVATE_AUDIO_BYTES'
        for content_type, data, length, expected in [
            ('audio/webm', secret, None, 415), ('audio/wav', b'', None, 400),
            ('audio/wav', secret, None, 400), ('audio/wav', secret, AUDIO_LIMIT + 1, 413),
            ('audio/wav', secret, 'bad', 400), ('audio/wav', secret, -1, 400),
            ('audio/wav', secret, 100, 400),
        ]:
            with self.subTest(status=expected, length=length):
                handler = request('/phonemes', data, content_type, length,
                                  infer=lambda _: self.fail('invalid audio reached inference'))
                handler.do_POST()
                self.assertEqual(handler.status, expected)
                response = json.loads(handler.wfile.getvalue())
                self.assertEqual(list(response), ['error'])
                self.assertNotIn('PRIVATE', response['error'])

    def test_inference_errors_are_generic_and_requests_are_silent(self):
        def infer(samples):
            raise RuntimeError('PRIVATE_AUDIO_BYTES')

        handler = request('/phonemes', make_wav(bytes(8)), infer=infer)
        handler.do_POST()
        self.assertEqual(handler.status, 500)
        self.assertEqual(json.loads(handler.wfile.getvalue()), {'error': 'failed'})
        self.assertIsNone(handler.log_message('PRIVATE_AUDIO_BYTES'))

    def test_disconnected_requests_do_not_log_a_traceback(self):
        server = service.Server.__new__(service.Server)
        output = io.StringIO()
        with redirect_stderr(output):
            server.handle_error(None, ('127.0.0.1', 1234))
        self.assertEqual(output.getvalue(), '')

    def test_normal_startup_binds_only_loopback_and_closes_without_loading_a_model(self):
        infer = lambda samples: []
        server = SimpleNamespace(serve_forever=Mock(side_effect=KeyboardInterrupt), server_close=Mock())
        with patch.object(service, 'load_inference', return_value=infer), \
                patch.object(service, 'Server', return_value=server) as factory, \
                patch.dict(os.environ, {'PHONEME_PORT': '9123'}), \
                patch.object(sys, 'argv', ['server.py']):
            service.main()
        factory.assert_called_once_with(('127.0.0.1', 9123), Handler)
        self.assertIs(server.infer, infer)
        server.server_close.assert_called_once_with()

    def test_download_requests_only_the_pinned_snapshot_and_exits(self):
        download = Mock()
        with patch.dict(sys.modules, {'huggingface_hub': SimpleNamespace(snapshot_download=download)}), \
                patch.object(service, 'load_inference', side_effect=AssertionError('no model load')), \
                patch.object(sys, 'argv', ['server.py', '--download']):
            service.main()
        download.assert_called_once_with('facebook/wav2vec2-lv-60-espeak-cv-ft',
                                         revision='ae45363bf3413b374fecd9dc8bc1df0e24c3b7f4',
                                         allow_patterns=['*.json', 'pytorch_model.bin'])


if __name__ == '__main__':
    unittest.main()

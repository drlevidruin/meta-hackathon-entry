import io
import itertools
import json
import os
import sys
import threading
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


def request(path, data=b'', content_type='audio/wav', length=None, infer=None, admission=None, timeout=None):
    handler = QuietHandler.__new__(QuietHandler)
    handler.path = path
    handler.headers = Message()
    handler.headers['Content-Type'] = content_type
    handler.headers['Content-Length'] = str(len(data) if length is None else length)
    if timeout is not None:
        handler.headers['X-Timeout-Ms'] = timeout
    handler.rfile = io.BytesIO(data)
    handler.wfile = io.BytesIO()
    handler.server = SimpleNamespace(infer=infer or (lambda samples: []), lock=threading.Lock(),
                                     admission=admission or threading.BoundedSemaphore(service.ADMISSION_LIMIT))
    return handler


def tensor(pointer, size):
    storage = SimpleNamespace(data_ptr=lambda: pointer, nbytes=lambda: size)
    return SimpleNamespace(untyped_storage=lambda: storage)


class PinTests(unittest.TestCase):
    def test_each_distinct_storage_is_locked_once_and_returns_the_total(self):
        calls = []

        def mlock(pointer, size):
            calls.append((pointer, size))
            return 0

        munlock = Mock(return_value=0)
        self.assertEqual(service.pin([tensor(100, 16), tensor(200, 32), tensor(100, 16)], mlock, munlock), 48)
        self.assertEqual(calls, [(100, 16), (200, 32)])
        munlock.assert_not_called()

    def test_empty_storages_are_skipped(self):
        mlock = Mock(return_value=0)
        self.assertEqual(service.pin([tensor(0, 0), tensor(100, 0), tensor(100, 16)], mlock, Mock()), 16)
        mlock.assert_called_once_with(100, 16)

    def test_a_failed_lock_unlocks_what_was_locked_and_returns_zero(self):
        for failure in [-1, OSError('cannot lock')]:
            with self.subTest(failure=failure):
                mlock = Mock(side_effect=[0, failure, 0])
                munlock = Mock(return_value=0)
                self.assertEqual(service.pin([tensor(100, 16), tensor(200, 32), tensor(300, 64)], mlock, munlock), 0)
                self.assertEqual(mlock.call_args_list, [((100, 16),), ((200, 32),)])
                munlock.assert_called_once_with(100, 16)

    def test_a_tensor_that_fails_mid_list_unlocks_the_earlier_ones(self):
        broken = SimpleNamespace(untyped_storage=Mock(side_effect=RuntimeError('no storage')))
        munlock = Mock(side_effect=[OSError('cannot unlock'), 0])
        self.assertEqual(service.pin([tensor(100, 16), tensor(200, 32), broken], Mock(return_value=0), munlock), 0)
        self.assertEqual(munlock.call_args_list, [((100, 16),), ((200, 32),)])

    def test_ctypes_failures_return_zero(self):
        for error in [OSError('cannot load libc'), service.ctypes.ArgumentError('invalid argument')]:
            with self.subTest(error=type(error).__name__):
                with patch.object(service.ctypes.util, 'find_library', return_value='libc'), \
                        patch.object(service.ctypes, 'CDLL', side_effect=error):
                    self.assertEqual(service.pin([tensor(100, 16)]), 0)

    def test_libc_mlock_and_munlock_use_pointer_and_size_types(self):
        mlock, munlock = Mock(return_value=0), Mock(return_value=0)
        with patch.object(service.ctypes.util, 'find_library', return_value='libc') as find, \
                patch.object(service.ctypes, 'CDLL', return_value=SimpleNamespace(mlock=mlock, munlock=munlock)) as load:
            self.assertEqual(service.pin([tensor(2 ** 40, 16)]), 16)
        find.assert_called_once_with('c')
        load.assert_called_once_with('libc', use_errno=True)
        for function in (mlock, munlock):
            self.assertEqual(function.argtypes, [service.ctypes.c_void_p, service.ctypes.c_size_t])
            self.assertIs(function.restype, service.ctypes.c_int)
        mlock.assert_called_once_with(2 ** 40, 16)
        munlock.assert_not_called()

    def test_startup_pins_parameters_and_buffers_after_eval_and_prints_one_line(self):
        parameters = [tensor(100, 16)]
        buffers = [tensor(200, 32)]
        model = SimpleNamespace(eval=Mock(), parameters=lambda: iter(parameters), buffers=lambda: iter(buffers))
        modules = {
            'torch': SimpleNamespace(set_num_threads=Mock()),
            'huggingface_hub': SimpleNamespace(hf_hub_download=Mock(return_value='vocab.json')),
            'transformers': SimpleNamespace(Wav2Vec2FeatureExtractor=Mock(),
                                            Wav2Vec2ForCTC=SimpleNamespace(from_pretrained=Mock(return_value=model))),
        }
        for locked, expected in [
            (1288490189, 'Model pinned in memory (1.2 GB).\n'),
            (0, 'Could not pin the model in memory; readings may be slow when this Mac is short of memory.\n'),
        ]:
            with self.subTest(locked=locked):
                model.eval.reset_mock()
                output = io.StringIO()

                def pin(tensors):
                    model.eval.assert_called_once_with()
                    self.assertEqual(tensors, parameters + buffers)
                    return locked

                with patch.dict(sys.modules, modules), patch.dict(os.environ), \
                        patch.object(service, 'pin', side_effect=pin) as lock, \
                        patch('builtins.open', return_value=io.StringIO('{"a": 1}')), redirect_stderr(output):
                    service.load_inference()
                lock.assert_called_once()
                self.assertEqual(output.getvalue(), expected)


class ServerTests(unittest.TestCase):
    def test_a_full_queue_answers_busy_before_reading_the_upload(self):
        admission = threading.BoundedSemaphore(service.ADMISSION_LIMIT)
        for _ in range(service.ADMISSION_LIMIT):
            admission.acquire()
        handler = request('/phonemes', make_wav(bytes(8)), admission=admission,
                          infer=lambda _: self.fail('a busy request reached inference'))
        handler.do_POST()
        self.assertEqual(handler.status, 503)
        self.assertEqual(json.loads(handler.wfile.getvalue()), {'error': 'busy'})
        self.assertEqual(handler.rfile.tell(), 0)
        self.assertTrue(handler.close_connection)

    def test_the_wait_header_sets_a_deadline_and_bad_values_set_none(self):
        headers = Message()
        headers['X-Timeout-Ms'] = '15000'
        self.assertEqual(service.deadline(headers, 100.0), 115.0)
        for value in [None, '', 'soon', '0', '-5', '600001', '1.5']:
            with self.subTest(value=value):
                headers = Message()
                if value is not None:
                    headers['X-Timeout-Ms'] = value
                self.assertIsNone(service.deadline(headers, 100.0))

    def test_a_reading_still_waiting_after_its_deadline_is_skipped_and_frees_its_slot(self):
        admission = threading.BoundedSemaphore(1)
        clock = itertools.count(0, 10)  # every reading of the clock is 10 seconds later
        handler = request('/phonemes', make_wav(bytes(8)), admission=admission, timeout='5000',
                          infer=lambda _: self.fail('a late reading reached inference'))
        with patch.object(service.time, 'monotonic', side_effect=lambda: next(clock)):
            handler.do_POST()
        self.assertEqual(handler.status, 503)
        self.assertEqual(json.loads(handler.wfile.getvalue()), {'error': 'too late'})
        self.assertTrue(admission.acquire(blocking=False))

    def test_a_reading_inside_its_deadline_runs(self):
        clock = itertools.count(0, 10)
        handler = request('/phonemes', make_wav(bytes(8)), timeout='60000')
        with patch.object(service.time, 'monotonic', side_effect=lambda: next(clock)):
            handler.do_POST()
        self.assertEqual(handler.status, 200)

    def test_unreadable_audio_frees_its_slot(self):
        admission = threading.BoundedSemaphore(1)
        handler = request('/phonemes', b'not WAV', admission=admission)
        handler.do_POST()
        self.assertEqual(handler.status, 400)
        self.assertTrue(admission.acquire(blocking=False))

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

    def test_download_requests_only_the_pinned_snapshot_into_the_service_folder_and_exits(self):
        homes = []
        download = Mock(side_effect=lambda *args, **kwargs: homes.append(os.environ.get('HF_HOME')))
        with patch.dict(sys.modules, {'huggingface_hub': SimpleNamespace(snapshot_download=download)}), \
                patch.dict(os.environ), \
                patch.object(service, 'load_inference', side_effect=AssertionError('no model load')), \
                patch.object(sys, 'argv', ['server.py', '--download']):
            os.environ.pop('HF_HOME', None)
            service.main()
        download.assert_called_once_with('facebook/wav2vec2-lv-60-espeak-cv-ft',
                                         revision='ae45363bf3413b374fecd9dc8bc1df0e24c3b7f4',
                                         allow_patterns=['*.json', 'pytorch_model.bin'])
        self.assertEqual(homes, [str(Path(service.__file__).resolve().parent / '.models')])

    def test_a_model_folder_already_set_is_kept(self):
        with patch.dict(os.environ, {'HF_HOME': '/elsewhere'}):
            service.use_model_home()
            self.assertEqual(os.environ['HF_HOME'], '/elsewhere')


if __name__ == '__main__':
    unittest.main()

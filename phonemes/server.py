import argparse
import json
import os
import select
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Isolated Python does not add this script's directory to the import path.
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from decode import decode
from wav import read_wav

MODEL = 'facebook/wav2vec2-lv-60-espeak-cv-ft'
REVISION = 'ae45363bf3413b374fecd9dc8bc1df0e24c3b7f4'
AUDIO_LIMIT = 25 * 1024 * 1024
# One reading runs and three wait. More get a fast 503, which the app treats as
# referee off for that reading, instead of a queue that outlasts its callers.
ADMISSION_LIMIT = 4


def load_inference():
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    import torch
    from huggingface_hub import hf_hub_download
    from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC

    torch.set_num_threads(4)
    extractor = Wav2Vec2FeatureExtractor.from_pretrained(MODEL, revision=REVISION, local_files_only=True)
    model = Wav2Vec2ForCTC.from_pretrained(MODEL, revision=REVISION, local_files_only=True)
    model.eval()
    vocab_path = hf_hub_download(MODEL, 'vocab.json', revision=REVISION, local_files_only=True)
    with open(vocab_path, encoding='utf-8') as vocab_file:
        id_to_token = {index: token for token, index in json.load(vocab_file).items()}

    def infer(samples):
        with torch.no_grad():
            inputs = extractor(samples, sampling_rate=16000, return_tensors='pt')
            probs = model(**inputs).logits.softmax(dim=-1)[0].cpu().numpy()
            return decode(probs, id_to_token, model.config.pad_token_id)

    return infer


class Server(ThreadingHTTPServer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lock = threading.Lock()
        self.admission = threading.BoundedSemaphore(ADMISSION_LIMIT)

    def handle_error(self, request, client_address):
        # A disconnected request must not print a traceback or request details.
        pass


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def reply(self, status, value):
        data = json.dumps(value).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def client_gone(self):
        # A caller that timed out has closed its socket, so nobody will read this answer.
        try:
            readable, _, _ = select.select([self.connection], [], [], 0)
            return bool(readable) and self.connection.recv(1, socket.MSG_PEEK) == b''
        except (OSError, ValueError):
            return True

    def do_GET(self):
        if self.path != '/health':
            self.reply(404, {'error': 'not found'})
            return
        self.reply(200, {'ok': True, 'model': MODEL, 'revision': REVISION})

    def do_POST(self):
        try:
            if self.path != '/phonemes':
                self.reply(404, {'error': 'not found'})
                return
            if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'audio/wav':
                self.reply(415, {'error': 'use audio/wav'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                self.reply(400, {'error': 'invalid length'})
                return
            if length > AUDIO_LIMIT:
                self.reply(413, {'error': 'audio too large'})
                return
            if length <= 0:
                self.reply(400, {'error': 'empty audio'})
                return
            data = self.rfile.read(length)
            if len(data) != length:
                self.reply(400, {'error': 'incomplete audio'})
                return
            if not self.server.admission.acquire(blocking=False):
                self.reply(503, {'error': 'busy'})
                return
            try:
                try:
                    samples = read_wav(data)
                except ValueError:
                    self.reply(400, {'error': 'unreadable audio'})
                    return
                with self.server.lock:
                    if self.client_gone():
                        return
                    tokens = self.server.infer(samples)
            finally:
                self.server.admission.release()
            self.reply(200, {'tokens': tokens})
        except Exception:
            self.reply(500, {'error': 'failed'})


def main():
    parser = argparse.ArgumentParser(description='Local phoneme service')
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    if args.download:
        from huggingface_hub import snapshot_download
        snapshot_download(MODEL, revision=REVISION, allow_patterns=['*.json', 'pytorch_model.bin'])
        return
    infer = load_inference()
    server = Server(('127.0.0.1', int(os.environ.get('PHONEME_PORT', '8791'))), Handler)
    server.infer = infer
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()

import io
import wave

import numpy as np


def read_wav(data: bytes):
    try:
        with wave.open(io.BytesIO(data), 'rb') as reader:
            channels = reader.getnchannels()
            rate = reader.getframerate()
            frames = reader.getnframes()
            if reader.getcomptype() != 'NONE' or reader.getsampwidth() != 2 or channels not in (1, 2):
                raise ValueError('use 16-bit PCM mono or stereo')
            if rate <= 0 or frames <= 0:
                raise ValueError('empty audio')
            raw = reader.readframes(frames)
            if len(raw) != frames * channels * 2:
                raise ValueError('incomplete WAV')
    except (wave.Error, EOFError, OSError, TypeError):
        raise ValueError('invalid WAV') from None
    samples = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
    if channels == 2:
        samples = samples.reshape(-1, 2).mean(axis=1)
    if rate != 16000:
        length = max(1, round(len(samples) * 16000 / rate))
        samples = np.interp(np.arange(length) / 16000, np.arange(len(samples)) / rate, samples)
    return samples.astype(np.float32, copy=False)

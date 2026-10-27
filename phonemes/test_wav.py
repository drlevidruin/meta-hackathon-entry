import io
import sys
import unittest
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from wav import read_wav


def make_wav(samples, rate=16000, channels=1, width=2):
    output = io.BytesIO()
    with wave.open(output, 'wb') as writer:
        writer.setnchannels(channels)
        writer.setsampwidth(width)
        writer.setframerate(rate)
        writer.writeframes(samples)
    return output.getvalue()


class WavTests(unittest.TestCase):
    def test_mono_16khz_is_unchanged_float32(self):
        samples = np.array([-32768, -8192, 0, 8192, 32767], dtype='<i2')
        result = read_wav(make_wav(samples.tobytes()))
        self.assertEqual(result.dtype, np.float32)
        np.testing.assert_array_equal(result, samples.astype(np.float32) / 32768)

    def test_stereo_is_averaged_without_integer_overflow(self):
        samples = np.array([[32767, 32767], [-32768, 32767], [8192, -8192]], dtype='<i2')
        result = read_wav(make_wav(samples.tobytes(), channels=2))
        np.testing.assert_array_equal(result, np.array([32767 / 32768, -0.5 / 32768, 0], dtype=np.float32))

    def test_8khz_is_linearly_interpolated_to_16khz(self):
        result = read_wav(make_wav(np.array([0, 8192, 16384, 24576], dtype='<i2').tobytes(), rate=8000))
        self.assertEqual(len(result), 8)
        np.testing.assert_array_equal(result, np.array([0, .125, .25, .375, .5, .625, .75, .75], dtype=np.float32))

    def test_44100hz_has_the_right_length_and_sample_values(self):
        samples = np.full(4410, 8192, dtype='<i2')
        result = read_wav(make_wav(samples.tobytes(), rate=44100))
        self.assertEqual(len(result), 1600)
        self.assertEqual(result.dtype, np.float32)
        np.testing.assert_array_equal(result, np.full(1600, 0.25, dtype=np.float32))

    def test_unsupported_and_unreadable_audio_raise_short_value_errors(self):
        valid = make_wav(np.array([0, 8192], dtype='<i2').tobytes())
        for data in [b'not WAV', b'', make_wav(bytes([0, 127, 255]), width=1),
                     make_wav(b''), valid[:-1], make_wav(bytes(12), channels=3)]:
            with self.subTest(data_length=len(data)):
                with self.assertRaises(ValueError) as raised:
                    read_wav(data)
                self.assertLess(len(str(raised.exception)), 60)


if __name__ == '__main__':
    unittest.main()

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from decode import decode


class DecodeTests(unittest.TestCase):
    def test_repeats_collapse_and_pad_separates_repeats(self):
        probs = np.eye(3)[[1, 1, 0, 0, 1, 2, 2]]
        tokens = decode(probs, {0: '<pad>', 1: 'a', 2: 'o'}, 0)
        self.assertEqual([value['token'] for value in tokens], ['a', 'a', 'o'])
        self.assertEqual([(value['start'], value['end']) for value in tokens],
                         [(0.0, 0.04), (0.08, 0.1), (0.1, 0.14)])

    def test_timing_uses_frame_bounds_and_rounds_to_two_places(self):
        tokens = decode(np.eye(2)[[0, 1, 1, 1]], {0: '<pad>', 1: 'ɑ'}, 0,
                        frame_seconds=0.0125)
        self.assertEqual(tokens[0]['start'], 0.01)
        self.assertEqual(tokens[0]['end'], 0.05)

    def test_top_five_are_run_means_in_descending_order_with_rounding(self):
        probs = np.array([[0.01, 0.5014, 0.2, 0.12, 0.1, 0.0672],
                          [0.03, 0.4014, 0.1, 0.16, 0.2, 0.1072]])
        tokens = decode(probs, dict(enumerate(['<pad>', 'ɑ', 'a', 'e', 'i', 'b'])), 0)
        self.assertEqual(tokens, [{'token': 'ɑ', 'start': 0.0, 'end': 0.04,
                                  'top': [['ɑ', 0.451], ['a', 0.15], ['i', 0.15],
                                          ['e', 0.14], ['b', 0.087]]}])

    def test_blank_and_empty_inputs_have_no_tokens(self):
        self.assertEqual(decode(np.eye(2)[[0, 0]], {0: '<pad>', 1: 'a'}, 0), [])
        self.assertEqual(decode(np.empty((0, 2)), {0: '<pad>', 1: 'a'}, 0), [])

    def test_probe_pools_first_and_last_tokens_with_six_frames_of_context(self):
        probs = np.eye(3)[[0] * 2 + [1] * 2 + [0] * 16 + [2] * 2 + [0] * 8]
        frames = np.arange(30, dtype=float)
        hidden = np.column_stack((frames, frames ** 2))
        tokens = decode(probs, {0: '<pad>', 1: 'a', 2: 'o'}, 0, hidden=hidden)
        self.assertEqual([value['probe'] for value in tokens], [[4.5, 28.5], [20.5, 436.5]])

    def test_probe_clips_context_at_nearby_non_pad_tokens_including_consonants(self):
        probs = np.eye(4)[[0] * 2 + [1] * 2 + [0] * 2 + [2] * 2 + [0] + [3] * 2 + [0] * 3]
        frames = np.arange(14, dtype=float)
        hidden = np.column_stack((frames, frames ** 2))
        tokens = decode(probs, {0: '<pad>', 1: 'a', 2: 'b', 3: 'o'}, 0, hidden=hidden)
        self.assertEqual([value['probe'] for value in tokens],
                         [[2.5, 9.1667], [6.0, 38.0], [10.5, 113.1667]])

    def test_probe_pools_a_single_token_using_integer_spans_and_clips_to_the_audio(self):
        probs = np.eye(2)[[0, 0, 1, 1, 0, 0]]
        hidden = np.array([[value, value + 0.123456] for value in range(6)])
        tokens = decode(probs, {0: '<pad>', 1: 'a'}, 0, frame_seconds=0.0125, hidden=hidden)
        self.assertEqual(tokens, [{'token': 'a', 'start': 0.03, 'end': 0.05,
                                  'top': [['a', 1.0], ['<pad>', 0.0]], 'probe': [2.5, 2.6235]}])


if __name__ == '__main__':
    unittest.main()

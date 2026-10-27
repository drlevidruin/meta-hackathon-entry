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


if __name__ == '__main__':
    unittest.main()

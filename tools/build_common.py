#!/usr/bin/env python3
"""Build common.json: the checking-list words that are common English (Zipf frequency 3.0 or higher).

Common words count toward the core. Obscure words (below the cut) are still allowed as guesses
and always score as bonus. Zipf 3.0 is about one occurrence per million words.

Usage:
  pip install wordfreq
  python3 tools/build_common.py path/to/words.json          # writes common.json in the repo root
"""
import json
import os
import sys

from wordfreq import zipf_frequency

CUT = 3.0
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        words = json.load(f)
    common = sorted(w for w in words if zipf_frequency(w, "en") >= CUT)
    with open(os.path.join(ROOT, "common.json"), "w", encoding="utf-8") as f:
        json.dump(common, f, separators=(",", ":"))
    print(f"{len(common)} of {len(words)} words are common (Zipf >= {CUT}).")


if __name__ == "__main__":
    main()

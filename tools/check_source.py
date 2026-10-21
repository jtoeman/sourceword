#!/usr/bin/env python3
"""Check a curator's source word against the daily band (15 to 50 valid words).

Usage:
  python3 tools/check_source.py garden silent      # check words
  python3 tools/check_source.py --puzzles          # check every entry in puzzles.json

Valid words are the checking list (words.json) that fit the source word, at 4+ letters,
excluding the source word itself. Exit status is 1 if any word is outside the band.
"""
import json
import os
import sys
from collections import Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MIN_LENGTH = 4
LOW, HIGH = 15, 50


def valid_words(source, words):
    avail = Counter(source)
    out = []
    for w in words:
        if len(w) < MIN_LENGTH or w == source:
            continue
        need = Counter(w)
        if all(need[ch] <= avail[ch] for ch in need):
            out.append(w)
    return out


def report(source, words):
    v = valid_words(source, words)
    by = Counter(len(w) for w in v)
    ok = LOW <= len(v) <= HIGH
    lengths = ", ".join(f"{n} ({by[n]})" for n in sorted(by)) or "none"
    status = "OK" if ok else "OUT OF BAND"
    print(f"{source:12} {len(v):4} words  {status:12} {lengths}")
    return ok


def main(argv):
    words = json.load(open(os.path.join(ROOT, "words.json")))
    if not argv:
        print(__doc__)
        return 2
    if argv == ["--puzzles"]:
        puzzles = json.load(open(os.path.join(ROOT, "puzzles.json")))
        sources = [(date, p["source"]) for date, p in sorted(puzzles.items())]
        results = [report(source, words) for _, source in sources]
    else:
        results = [report(w.lower(), words) for w in argv]
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

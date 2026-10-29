#!/usr/bin/env python3
"""Apply curated word reports to the checking list (words.json) and optionally common.json.

Players report words from the game. Each report is a row in the "Sourceword suggestions" tab of
the Caseboard sheet with a Status column. Set Status to "added" for words to accept, then export
that tab as CSV and run this script on the export.

Usage:
  python3 tools/apply_word_reports.py suggestions.csv               # add to words.json only
  python3 tools/apply_word_reports.py suggestions.csv --common      # also add to common.json (counts as core-eligible)
  python3 tools/apply_word_reports.py suggestions.csv --dry-run     # show what would change, write nothing

Rows with any Status other than "added" are ignored. Words already present are skipped.
Words are checked to be lowercase a-z and at least 3 letters. Both files are rewritten sorted.
"""
import argparse
import csv
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
WORDS_PATH = os.path.join(ROOT, "words.json")
COMMON_PATH = os.path.join(ROOT, "common.json")
WORD_RE = re.compile(r"^[a-z]{3,}$")


def load_added(csv_path):
    """Return the unique words whose Status is 'added', in first-seen order."""
    seen = []
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = {h.strip().lower(): h for h in (reader.fieldnames or [])}
        for needed in ("word", "status"):
            if needed not in headers:
                sys.exit(f"CSV has no '{needed}' column. Columns found: {list(headers.values())}")
        for row in reader:
            if row[headers["status"]].strip().lower() != "added":
                continue
            word = row[headers["word"]].strip().lower()
            if not WORD_RE.match(word):
                print(f"skip (not a plain word): {row[headers['word']]!r}")
                continue
            if word not in seen:
                seen.append(word)
    return seen


def merge(path, new_words):
    """Add new_words to the JSON list at path. Returns the words that were actually new."""
    with open(path, encoding="utf-8") as f:
        existing = json.load(f)
    present = set(existing)
    added = [w for w in new_words if w not in present]
    if added:
        merged = sorted(present | set(added))
        with open(path, "w", encoding="utf-8") as f:
            json.dump(merged, f, separators=(",", ":"))
    return added


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", help="CSV export of the 'Sourceword suggestions' tab")
    parser.add_argument("--common", action="store_true", help="also add the words to common.json")
    parser.add_argument("--dry-run", action="store_true", help="report what would change, write nothing")
    parser.add_argument("--words", default=WORDS_PATH, help=argparse.SUPPRESS)
    parser.add_argument("--common-file", default=COMMON_PATH, help=argparse.SUPPRESS)
    args = parser.parse_args()

    words = load_added(args.csv)
    if not words:
        print("No rows with Status 'added'. Nothing to do.")
        return

    if args.dry_run:
        with open(args.words, encoding="utf-8") as f:
            present = set(json.load(f))
        new = [w for w in words if w not in present]
        print(f"{len(words)} added words, {len(new)} new to words.json:")
        print(", ".join(new) or "(none)")
        return

    new_words = merge(args.words, words)
    print(f"words.json: {len(new_words)} added" + (f": {', '.join(new_words)}" if new_words else ""))
    if args.common:
        new_common = merge(args.common_file, words)
        print(f"common.json: {len(new_common)} added" + (f": {', '.join(new_common)}" if new_common else ""))
    if not new_words:
        print("Every word was already in the list.")


if __name__ == "__main__":
    main()

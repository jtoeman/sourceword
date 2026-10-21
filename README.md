# Sourceword

A daily word game. The curator picks a source word, and players build as many words as they can from its letters.

Part of [Froobaloo](https://froobaloo.com).

## Status

Step 1 (build 0.1.0-b1): a static page with one hardcoded puzzle, guess checking against a sample list, and length scoring.

Step 4 (build 0.2.0-b17): local stats (played, current and best streak, best score) and a share result. Finished days are saved on the device. The share text lists a square grid per word length.

## Run locally

Open `index.html` in a browser. No build step.

## Curator rule: source word band

Each daily source word must have 15 to 50 valid words (4+ letters). Check a candidate before it goes in the sheet:

    python3 tools/check_source.py garden silent
    python3 tools/check_source.py --puzzles    # checks every day in puzzles.json

Step 5 (build 0.3.0-b18): three modes. Easy counts 3-letter words (1 point each). Normal is 4+ letters. Hard is Normal with the countdown, rank, length counts and bonus slots hidden. The mode is set from the header row and is locked once the day has a word.

## Word list

`words.json` is the checking list: every guess must be in it. It is the intersection of two lists:

- the Wordnik word list (https://github.com/wordnik/wordlist), MIT licensed. The license text is in `LICENSE-wordnik.txt`.
- the common-word list `popular.txt` from https://github.com/dolph/dictionary, whose README says it is built from Wiktionary word-frequency data. The shipped list is derived from that data, so it needs share-alike attribution (CC BY-SA). This license is taken from the README and has not been checked against the primary source yet.

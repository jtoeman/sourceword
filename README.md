# Sourceword

A daily word game. The curator picks a source word, and players build as many words as they can from its letters.

Part of [Froobaloo](https://froobaloo.com).

## Status

Step 1 (build 0.1.0-b1): a static page with one hardcoded puzzle, guess checking against a sample list, and length scoring.

Step 4 (build 0.2.0-b17): local stats (played, current and best streak, best score) and a share result. Finished days are saved on the device. The share text lists a square grid per word length.

## Run locally

Open `index.html` in a browser. No build step.

## Where the daily words come from

The game reads the `Sourceword` tab of the froobaloodb Google Sheet in the browser on every load (the sheet is link-viewable, the same way Caseboard reads its Puzzles tab). Edits to the sheet go live on the next page load, with no build step and no hub redeploy.

- It picks today's date in ET. If today has no row, it uses the most recent earlier row.
- Rows that are marked `draft` in Status, have no usable date, or have a source word that is not letters only are skipped.
- Rows outside the band (15 to 50 valid words) are skipped, so the fallback date is always a playable one.
- Dates in the sheet have no year. The game assumes 2026 (`SHEET_YEAR` in `app.js`).
- If the sheet cannot be reached, the game uses `puzzles.json`.

The sheet has an Apps Script checker (`sheets/sourceword-check.gs`) that fills the Subwords and Band columns when a source word or its valid words are edited.

## Curator rule: source word band

Each daily source word must have 15 to 50 valid words (4+ letters). Check a candidate before it goes in the sheet:

    python3 tools/check_source.py garden silent
    python3 tools/check_source.py --puzzles    # checks every day in puzzles.json

Step 6 (build 0.3.0-b19): daily words are read from the Google Sheet in the browser, with puzzles.json as the fallback.

Step 5 (build 0.3.0-b18): three modes. Easy counts 3-letter words (1 point each). Normal is 4+ letters. Hard is Normal with the countdown, rank, length counts and bonus slots hidden. The mode is set from the header row and is locked once the day has a word.

## Word list

`words.json` is the checking list: every guess must be in it. It is the intersection of two lists:

- the Wordnik word list (https://github.com/wordnik/wordlist), MIT licensed. The license text is in `LICENSE-wordnik.txt`.
- the common-word list `popular.txt` from https://github.com/dolph/dictionary, whose README says it is built from Wiktionary word-frequency data. The shipped list is derived from that data, so it needs share-alike attribution (CC BY-SA). This license is taken from the README and has not been checked against the primary source yet.

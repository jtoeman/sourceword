#!/usr/bin/env bash
# Copy the game files from this repo into a checkout of the site branch, and regenerate admin37/.
#
# Usage: tools/make_site.sh <path-to-site-checkout>
#
# Used by .github/workflows/publish-site.yml. Also works by hand: create a worktree of origin/site,
# run this script on it, then commit and push.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:?usage: make_site.sh <site-checkout>}"

SKIP=" .git .github tools sheets admin37 README.md "

# Remove what the site currently serves (except the parts it keeps), then copy the game in.
for name in $(ls -A "$DEST"); do
  case "$SKIP" in *" $name "*) continue ;; esac
  rm -rf "${DEST:?}/$name"
done
for name in $(ls -A "$SRC"); do
  case "$SKIP" in *" $name "*) continue ;; esac
  cp -R "$SRC/$name" "$DEST/"
done

# Admin copy: the same page, with its own title and a base href so it loads from /sourceword/admin37/.
mkdir -p "$DEST/admin37"
sed \
  -e 's|<title>Sourceword</title>|<title>Sourceword admin</title>|' \
  -e 's|<meta name="robots" content="noindex">|<meta name="robots" content="noindex, nofollow">|' \
  -e 's|<head>|<head>\n  <base href="/sourceword/">|' \
  "$DEST/index.html" > "$DEST/admin37/index.html"

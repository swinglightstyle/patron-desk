#!/bin/sh
# go-live: schedule the coming week's posts on Patreon, after Beth says yes.
# The Mac (and any other machine with a shell) twin of go-live.ps1.
#
#     sh go-live.sh                 the coming 7 days
#     sh go-live.sh --days 10       another span
#     sh go-live.sh --preview-only  show the batch, approve nothing
#
# 1. Lists the posts dated from today to the days ahead that are not yet
#    scheduled, and opens a preview page with every post in full.
# 2. Asks Beth to type yes. Typing yes approves this batch only.
# 3. Opens the browser on Patreon's new post page with the batch marker.
#    The extension opens its desk; Beth presses "Start the batch" there.
# No server, nothing listening, no login kept.

set -e
cd "$(dirname "$0")"

DAYS=7
PREVIEW_ONLY=0
while [ $# -gt 0 ]; do
    case "$1" in
        --days) DAYS="$2"; shift 2 ;;
        --preview-only) PREVIEW_ONLY=1; shift ;;
        *) echo "Unknown option: $1"; exit 2 ;;
    esac
done

PY=python3
command -v "$PY" >/dev/null 2>&1 || PY=python
command -v "$PY" >/dev/null 2>&1 || { echo "Python was not found. It is needed to read the packages."; exit 2; }

open_file() {
    if command -v open >/dev/null 2>&1; then open "$1"; else xdg-open "$1" >/dev/null 2>&1 || true; fi
}

set +e
SHOWN=$("$PY" -B desk.py batch --days "$DAYS")
CODE=$?
set -e
printf '%s\n' "$SHOWN" | grep -v '^PREVIEW ' | grep -v '^BATCH ' || true
if [ "$CODE" -ne 0 ]; then
    echo
    echo "Nothing to approve."
    exit "$CODE"
fi
BATCH=$(printf '%s\n' "$SHOWN" | sed -n 's/^BATCH //p' | tail -n 1)
PREVIEW=$(printf '%s\n' "$SHOWN" | sed -n 's/^PREVIEW //p' | tail -n 1)
echo
echo "Batch $BATCH. The preview page is opening: read every post in it."
open_file "$PREVIEW"

[ "$PREVIEW_ONLY" -eq 1 ] && exit 0

echo
printf 'Type yes to approve this batch and schedule it on Patreon (anything else stops): '
read -r ANSWER
if [ "$ANSWER" != "yes" ]; then
    echo "Nothing approved. Nothing scheduled."
    exit 1
fi

set +e
APPROVED=$("$PY" -B desk.py approve --days "$DAYS" --batch-id "$BATCH")
CODE=$?
set -e
printf '%s\n' "$APPROVED" | grep -v '^OPEN ' || true
[ "$CODE" -ne 0 ] && exit "$CODE"
URL=$(printf '%s\n' "$APPROVED" | sed -n 's/^OPEN //p' | tail -n 1)

set +e
FOUND=$("$PY" -B desk.py browser)
CODE=$?
set -e
if [ "$CODE" -ne 0 ]; then printf '%s\n' "$FOUND"; exit "$CODE"; fi
BROWSER=$(printf '%s\n' "$FOUND" | sed -n 's/^BROWSER //p' | tail -n 1)
PROFILE=$(printf '%s\n' "$FOUND" | sed -n 's/^PROFILE //p' | tail -n 1)
if [ -n "$PROFILE" ]; then
    "$BROWSER" "--profile-directory=$PROFILE" "$URL" >/dev/null 2>&1 &
else
    "$BROWSER" "$URL" >/dev/null 2>&1 &
fi

echo
echo "Patreon is opening. The patron desk opens beside it."
echo "Press 'Start the batch' in the desk. The first time, choose the packages folder there first."
echo "The desk schedules each post only when every check passes, and stops on any miss."

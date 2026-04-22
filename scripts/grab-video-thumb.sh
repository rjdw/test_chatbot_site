#!/usr/bin/env bash
# Grab a frame from a YouTube video at a specific timestamp and save it
# as a JPEG thumbnail suitable for content.json.
#
# Usage:
#   scripts/grab-video-thumb.sh <youtube-url-or-id> <timestamp> <output-name>
#
# Example:
#   scripts/grab-video-thumb.sh \
#     'https://www.youtube.com/watch?v=dAmGwYH4d74' \
#     01:06:59 \
#     tbpn-yc-demo-day-dec-2025
#
# Produces:
#   src/public/media-thumbs/<output-name>.jpg
#
# Requires: yt-dlp and ffmpeg on your PATH. Both are installable via
#   pipx install yt-dlp        (Homebrew: brew install yt-dlp)
#   brew install ffmpeg        (Ubuntu: sudo apt install ffmpeg)
#
# If YouTube asks for authentication (common on cloud VMs), pass cookies:
#   YTDL_COOKIES_FROM=chrome scripts/grab-video-thumb.sh ...
# or
#   YTDL_COOKIES=/path/to/cookies.txt scripts/grab-video-thumb.sh ...

set -euo pipefail

if [ $# -lt 3 ]; then
  echo "Usage: $0 <youtube-url-or-id> <timestamp> <output-name>" >&2
  echo "Example: $0 'https://www.youtube.com/watch?v=dAmGwYH4d74' 01:06:59 tbpn-yc-demo-day" >&2
  exit 64
fi

URL="$1"
TS="$2"
NAME="$3"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/src/public/media-thumbs"
mkdir -p "$OUT_DIR"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

YTDL_ARGS=(
  --no-playlist
  --no-progress
  -f 'bestvideo[height<=1080][ext=mp4]/bestvideo[height<=1080]/best'
)
if [ -n "${YTDL_COOKIES_FROM:-}" ]; then
  YTDL_ARGS+=(--cookies-from-browser "$YTDL_COOKIES_FROM")
fi
if [ -n "${YTDL_COOKIES:-}" ]; then
  YTDL_ARGS+=(--cookies "$YTDL_COOKIES")
fi

# Convert HH:MM:SS or seconds into both formats.
if [[ "$TS" =~ ^[0-9]+$ ]]; then
  SECS="$TS"
  # Build HH:MM:SS from seconds.
  HH=$(printf '%02d' $((SECS / 3600)))
  MM=$(printf '%02d' $(( (SECS % 3600) / 60 )))
  SS=$(printf '%02d' $((SECS % 60)))
  HMS="$HH:$MM:$SS"
else
  HMS="$TS"
  IFS=':' read -r h m s <<<"$TS"
  SECS=$(( ${h:-0} * 3600 + ${m:-0} * 60 + ${s:-0} ))
fi

# Grab ~4-second window around the target so ffmpeg has a keyframe to
# work with; then extract the exact frame.
START_SECS=$(( SECS - 2 ))
[ "$START_SECS" -lt 0 ] && START_SECS=0
END_SECS=$(( SECS + 3 ))
START_HMS=$(printf '%02d:%02d:%02d' $((START_SECS / 3600)) $(( (START_SECS % 3600) / 60 )) $((START_SECS % 60)) )
END_HMS=$(printf '%02d:%02d:%02d' $((END_SECS / 3600)) $(( (END_SECS % 3600) / 60 )) $((END_SECS % 60)) )

echo "Downloading clip $START_HMS → $END_HMS from $URL"
yt-dlp "${YTDL_ARGS[@]}" \
  --download-sections "*$START_HMS-$END_HMS" \
  --force-keyframes-at-cuts \
  -o "$TMP_DIR/clip.%(ext)s" \
  "$URL"

# Pick whatever mp4/webm landed.
CLIP=$(ls "$TMP_DIR"/clip.* 2>/dev/null | head -n 1)
if [ -z "$CLIP" ]; then
  echo "error: no clip downloaded" >&2
  exit 1
fi

# Seek to (SECS - START_SECS) seconds into the clip, grab one high-quality JPEG.
SEEK_INTO=$(( SECS - START_SECS ))
OUT_PATH="$OUT_DIR/$NAME.jpg"
echo "Extracting frame at +${SEEK_INTO}s from clip → $OUT_PATH"
ffmpeg -hide_banner -loglevel error -y \
  -ss "$SEEK_INTO" -i "$CLIP" \
  -frames:v 1 -q:v 2 \
  "$OUT_PATH"

echo ""
echo "Done. Point content.json at:"
echo "  \"thumbnail\": \"/media-thumbs/$NAME.jpg\""

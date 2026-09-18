#!/usr/bin/env bash
# Download private backup copies of every source video, for insurance against
# takedowns. Files land in archive/<event>/<lang>/<series>-g<n>-<ytid>.mp4 and
# are never referenced by the site. Re-running skips what is already there.
#
#   pip install yt-dlp        (ffmpeg needed for merging)
#   tools/archive.sh data/ti3.json [more event files...]
#
# Keep the archive folder out of the web root and out of git (see .gitignore).
set -euo pipefail
cd "$(dirname "$0")/.."
command -v yt-dlp >/dev/null || { echo "yt-dlp not found"; exit 1; }
command -v jq >/dev/null || { echo "jq not found"; exit 1; }

for f in "${@:-data/ti3.json}"; do
  ev=$(jq -r .id "$f")
  jq -r '.series[] as $s | $s.games[] as $g | $g.sources[] | select(.provider=="youtube") | "\($s.id) \($g.n) \(.lang) \(.id)"' "$f" |
  while read -r sid n lang id; do
    dir="archive/$ev/$lang"; mkdir -p "$dir"
    out="$dir/${sid}-g${n}-${id}.%(ext)s"
    if ls "$dir/${sid}-g${n}-${id}."* >/dev/null 2>&1; then continue; fi
    echo ">> $ev $sid g$n [$lang] $id"
    yt-dlp -f "bv*[height<=1080]+ba/b" --merge-output-format mp4 --no-playlist \
      --download-archive "archive/$ev/.done" -o "$out" "https://www.youtube.com/watch?v=$id" || echo "!! failed: $id"
  done
done

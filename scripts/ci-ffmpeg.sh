#!/usr/bin/env bash
# ffmpeg on a GitHub runner (4.1.15), ffprobe along. A static build from GitHub first (#261): one download of 150 MB
# from GitHub's CDN, where apt fetched about a hundred packages from an Azure mirror that sat 20 minutes without a
# byte (7 October 2026) or served 50 kB/s (23 October). The release branch's build (n8.1), not master's. apt last,
# bounded.
set -u
# Root in Playwright's container (#261), where there is no sudo; the runner's user elsewhere.
SUDO=sudo; [ "$(id -u)" = 0 ] && SUDO=
command -v ffmpeg >/dev/null 2>&1 && { ffmpeg -version | head -1; exit 0; }
name=ffmpeg-n8.1-latest-linux64-gpl-8.1
url=https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/$name.tar.xz
tmp=$(mktemp -d)
if curl -fsSL --retry 3 --max-time 300 "$url" -o "$tmp/ffmpeg.tar.xz"; then
  # The container has no xz: Python's lzma then (Python is set up before this script wherever it runs).
  if command -v xz >/dev/null 2>&1; then tar -xJf "$tmp/ffmpeg.tar.xz" -C "$tmp"
  else python3 -c 'import sys, tarfile; tarfile.open(sys.argv[1]).extractall(sys.argv[2])' "$tmp/ffmpeg.tar.xz" "$tmp"; fi
  if $SUDO install -m 0755 "$tmp/$name/bin/ffmpeg" "$tmp/$name/bin/ffprobe" /usr/local/bin/; then
    ffmpeg -version | head -1; exit 0
  fi
fi
echo "the static build failed: apt instead" >&2
for i in 1 2; do
  if timeout 240 $SUDO apt-get update -qq && timeout 240 $SUDO apt-get install -y -qq ffmpeg; then ffmpeg -version | head -1; exit 0; fi
  echo "apt attempt $i failed or hung; retrying" >&2; sleep 10
done
echo "no ffmpeg: the static build and apt both failed" >&2
exit 1

#!/bin/sh
# Screenshot the app in an iPhone-sized frame: tools/shot.sh OUT.png '?cfg={...}&seed=1&auto=20'
# Needs the repository root served on port 8471: python3 -m http.server 8471 --bind 127.0.0.1
out="$1"; query="$2"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=390,844 --virtual-time-budget=6000 --screenshot="$out" "http://127.0.0.1:8471/tools/frame.html$query" >/dev/null 2>&1

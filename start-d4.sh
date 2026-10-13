#!/bin/zsh
cd /Users/noi/wp/view

PORT="${PORT:-5173}"
(
  sleep 1
  open "http://127.0.0.1:${PORT}"
) &

npm start -- "/Volumes/SHARE1TB/D4"

#!/bin/zsh
set -e

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"

RAW_FOLDER="${1:-${RAW_FOLDER:-}}"

if [[ -z "$RAW_FOLDER" ]]; then
  echo 'Usage: ./start-d4.sh "/path/to/raw-folder"'
  echo '   or: RAW_FOLDER="/path/to/raw-folder" ./start-d4.sh'
  exit 1
fi

PORT="${PORT:-5173}"
(
  sleep 1
  open "http://127.0.0.1:${PORT}"
) &

npm start -- "$RAW_FOLDER"

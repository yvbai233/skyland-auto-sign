#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CONFIG_FILE="$SCRIPT_DIR/maa-curl.env"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "[Skyland] Missing config: $CONFIG_FILE" >&2
  echo "[Skyland] Copy maa-curl.env.example to maa-curl.env and fill in your values." >&2
  exit 2
fi

set -a
# The config file is local and trusted by the current user.
# shellcheck disable=SC1090
. "$CONFIG_FILE"
set +a

: "${WORKER_URL:?WORKER_URL is required in maa-curl.env}"
: "${WORKER_AUTH:?WORKER_AUTH is required in maa-curl.env}"
: "${SKLAND_TOKEN:?SKLAND_TOKEN is required in maa-curl.env}"

case "$SKLAND_TOKEN" in
  *\"*|*\\*)
    echo "[Skyland] SKLAND_TOKEN must be the data.content value, not the complete JSON response." >&2
    exit 2
    ;;
esac

echo "[Skyland] Starting check-in..."
printf '{"token":"%s"}' "$SKLAND_TOKEN" \
  | curl --fail-with-body --silent --show-error --request POST "$WORKER_URL" \
      --header "Authorization: Bearer $WORKER_AUTH" \
      --header "Content-Type: application/json" \
      --data-binary @-
printf '\n[Skyland] Check-in request completed.\n'

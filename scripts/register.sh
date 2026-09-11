#!/usr/bin/env bash
# One-time registration of Blackjack Lab on Usion. Needs a human: the deployed URL and the creator's token.
#   Usage: scripts/register.sh https://<deployed-app-url>
#   Token: $USION_TOKEN, or the first line of ./token.txt (gitignored; never commit or deploy it).
set -euo pipefail

IFRAME_URL="${1:?usage: scripts/register.sh https://<deployed-app-url>}"
API_URL="${USION_API_URL:-https://mobile.mongolai.mn}"
TOKEN="${USION_TOKEN:-$(head -n1 "$(dirname "$0")/../token.txt" 2>/dev/null | tr -d '[:space:]' || true)}"

if [[ -z "$TOKEN" ]]; then
  echo "No token: set USION_TOKEN or put it in token.txt" >&2
  exit 1
fi
# The URL is interpolated into JSON below, so allow only plain https URLs.
if [[ ! "$IFRAME_URL" =~ ^https://[A-Za-z0-9./_-]+$ ]]; then
  echo "Expected a plain https URL, got: $IFRAME_URL" >&2
  exit 1
fi

# Usion has two token kinds (see /opt/projects/usion-app/references): registry tokens and creator keys.
case "$TOKEN" in
  usion_sk_*) ENDPOINT="$API_URL/registry/services/register" ;;
  usk_live_*) ENDPOINT="$API_URL/services" ;;
  *)
    echo "Unrecognised token type (expected usion_sk_… or usk_live_…)" >&2
    exit 1
    ;;
esac

BODY=$(cat <<JSON
{
  "name": "Blackjack Lab",
  "description": "Play blackjack, drill basic strategy, and track your accuracy.",
  "service_type": "game",
  "iframe_url": "$IFRAME_URL",
  "cost": 0,
  "genre": "strategy",
  "tags": ["blackjack", "cards", "strategy", "trainer"],
  "is_published": true,
  "leaderboard": { "enabled": true, "order": "desc", "mode": "best", "metric": "score", "max_score": 10000 }
}
JSON
)

echo "POST $ENDPOINT"
# The token goes in via stdin so it never shows up in the process list.
printf 'Authorization: Bearer %s\n' "$TOKEN" |
  curl --fail-with-body -sS -X POST "$ENDPOINT" -H @- -H 'Content-Type: application/json' --data "$BODY"
echo
echo "Done. Read the service back and check the leaderboard block was stored (see README)."

#!/usr/bin/env bash
# Publish app/ to GitHub Pages. The Pages repo holds only the public app files, never docs,
# tests or token files; its history is the deploy log. Needs `gh` logged in with repo scope.
#   Usage: scripts/deploy-pages.sh            (PAGES_REPO overrides the target repo)
set -euo pipefail

REPO="${PAGES_REPO:-zorigtbaatarAst/blackjack-lab}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILES=(index.html app.js engine.js strings.js style.css guide.js)
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo clone "$REPO" "$WORK" -- -q
else
  gh repo create "$REPO" --public --description "Blackjack Lab: Usion mini-app (static build)" >/dev/null
  git init -q -b main "$WORK"
  git -C "$WORK" remote add origin "https://github.com/$REPO.git"
fi

# Replace everything but .git with the current build.
find "$WORK" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
for f in "${FILES[@]}"; do cp "$ROOT/app/$f" "$WORK/$f"; done
touch "$WORK/.nojekyll" # serve files as-is, no Jekyll processing

VERSION="$(git -C "$ROOT" rev-parse --short HEAD)"
git -C "$WORK" add -A
if git -C "$WORK" diff --cached --quiet; then
  echo "Nothing changed since the last deploy ($VERSION)."
else
  git -C "$WORK" commit -q -m "Deploy $VERSION"
  git -C "$WORK" push -q -u origin main
fi

# Turn Pages on the first time (serve the main branch root).
if ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/$REPO/pages" -f 'source[branch]=main' -f 'source[path]=/' >/dev/null
fi

OWNER="$(echo "${REPO%%/*}" | tr '[:upper:]' '[:lower:]')"
echo "Deployed $VERSION → https://$OWNER.github.io/${REPO#*/}/ (Pages takes about a minute to update)"

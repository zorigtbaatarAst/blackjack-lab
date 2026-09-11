# Blackjack Lab

Solo blackjack game + basic-strategy trainer, published as a Usion mini-app. Glossary in `CONTEXT.md`, decisions in `docs/adr/`, spec and tickets in `.scratch/blackjack-lab/`.

## Commands

- `npm run dev`: local game on http://localhost:8765 with a fake Usion SDK (see README for query params).
- `npm test`: node:test suites. The engine is the only test seam; the shell is verified in a browser.
- `scripts/deploy-pages.sh`: deploy `app/` to GitHub Pages, which is what the Usion service `blackjack-lab-b54b6313` loads.

## Agent skills

### Issue tracker

Local markdown: specs and tickets live under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

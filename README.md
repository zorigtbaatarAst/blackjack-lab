# Blackjack Lab

Play blackjack, drill basic strategy, and track your accuracy. It's a solo Usion mini-app built as a static site with vanilla JS, no build step and no dependencies.

- Rules and behaviour: `.scratch/blackjack-lab/spec.md`
- Glossary: `CONTEXT.md`
- Decisions: `docs/adr/`

## Layout

| Path | What |
|---|---|
| `app/engine.js` | Every game rule, pure (no DOM, no Usion). The only test seam. |
| `app/app.js` | Shell: rendering, i18n, Usion SDK, storage, leaderboard. |
| `app/strings.js` | All UI text, English and Mongolian. |
| `test/` | `node --test` suites for the engine and the strings. |
| `scripts/register.sh` | One-time Usion registration. |

## Develop

```sh
npm test                                              # Node 20+, zero dependencies
python3 -m http.server 8765 --directory app           # then open http://127.0.0.1:8765
```

Outside Usion the app runs in **preview mode**, with no saving and no leaderboard. Inside Usion it saves through `Usion.storage`. On desktop: H/S/D/P act, 1–4 add chips, Enter deals or moves to the next Situation, C clears, R rebets, Esc closes dialogs.

## Deploy

These steps need a human.

1. **Deploy only `app/`.** The token file, docs and tests must stay local.
   ```sh
   cd app && npx vercel --prod      # first time: npx vercel login
   ```
2. **Register once.** The token comes from `USION_TOKEN` or `token.txt`, and the script picks the endpoint from its prefix.
   ```sh
   scripts/register.sh https://<your-app>.vercel.app
   ```
3. **Verify.** Read the service back, for example with `GET /registry/services/my`, or `GET /services` for a `usk_live_` key. Confirm that the `leaderboard` block (`enabled`, `order: desc`, `mode: best`) was stored. If it wasn't, set it with the matching update endpoint.
4. **Updates.** Redeploy step 1 and the app updates in place. Metadata changes go through the registry update endpoint.

## Before publishing

- Get the Mongolian strings in `app/strings.js` reviewed by a native speaker, especially the Rules of thumb.
- Usion's `image` field needs a service icon URL. There's no icon yet.

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

The game is live at **https://zorigtbaatarast.github.io/blackjack-lab/** on GitHub Pages. It's registered on Usion as `blackjack-lab-b54b6313`.

1. **Deploy.** This needs `gh` logged in.
   ```sh
   scripts/deploy-pages.sh
   ```
   It copies only the five public app files into the Pages repo `zorigtbaatarAst/blackjack-lab`, commits them and pushes. Pages updates in about a minute. Docs, tests and token files are never copied.
2. **Point Usion at a new URL.** Only needed if the URL changes. This uses the `usion_sk_` token in `token.txt`.
   ```sh
   USION_SERVICE_ID=blackjack-lab-b54b6313 scripts/register.sh https://<new-url>
   ```
3. **Register a brand-new service.** Run `scripts/register.sh https://<url>`. Then read it back with `GET /registry/services/my` and check that the `leaderboard` block was stored.

`app/vercel.json` makes a Vercel deploy static with no build, in case you ever move back to `blackjacklab.vercel.app`. See ADR 0006.

## Before publishing

- Get the Mongolian strings in `app/strings.js` reviewed by a native speaker, especially the Rules of thumb.
- Usion's `image` field needs a service icon URL. There's no icon yet.

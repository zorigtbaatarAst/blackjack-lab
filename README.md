# Blackjack Lab

Play blackjack, drill basic strategy, learn Hi-Lo card counting, and track your accuracy. It's a solo Usion mini-app built as a static site with vanilla JS, no build step and no dependencies.

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
npm run dev      # http://localhost:8765: edit anything in app/, then refresh the browser
npm test         # the engine and strings suites (Node 20+, zero dependencies)
```

`npm run dev` serves `app/` with a **fake Usion SDK** (`dev/fake-usion-sdk.js`). You get a profile, saving and a leaderboard straight away, with no deploy and no Usion. Saved progress lives in the browser's localStorage, one store per fake user. Change the setup with query params:

| URL | What you get |
|---|---|
| `http://localhost:8765/?name=Bat` | Logged in as "Bat" |
| `?user=guest_1` | A Guest (no leaderboard) |
| `?lang=mn`, `?theme=dark` | Mongolian, dark theme |
| `?avatar=https://…` | A profile picture |
| `?failSet=1` / `?failGet=1` | Save or load failures |
| `?real=1` | The real SDK, which drops to preview mode after 8 s like any page outside Usion |

To press the host's back button, run `usionBack()` in the browser console. On desktop: H/S/D/P act, 1–4 add chips, Enter deals or moves to the next Situation, C clears, R rebets, A toggles Auto bet (re-deal the same Bet after every Round), Esc closes dialogs. In Values, ← ↓ → (or 1 2 3) answer −1 / 0 / +1. In Count, 1 2 3 set the speed, digits and − type a count, ← → adjust it, Enter answers, and 1–8 pick the Bet.

When it looks right, ship it with `scripts/deploy-pages.sh`, described below.

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

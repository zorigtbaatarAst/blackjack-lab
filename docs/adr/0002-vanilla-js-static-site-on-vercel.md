# Vanilla JS static site on Vercel, no build step

Usion mini-apps are static iframes. The platform strips every external script except its own engines, and card games should use no engine at all. We therefore write plain HTML/CSS/JS with no framework, no bundler and no npm dependencies, modelled on the «13» reference card game. The site is hosted on Vercel and registered with `POST /registry/services/register`. It's deliberately not Next.js, even though that's our usual stack: Next.js adds a build step and a runtime that a card game doesn't need.

## Considered Options

- **Mini App Creator (one inlined `index.html`, hosted on Usion's S3):** rejected because it forces everything into a single file, which leaves the engine untestable in isolation.
- **Vite + TypeScript + Vitest:** rejected because it adds a build step and `node_modules` for little gain at this size.

## Consequences

- `engine.js` is a pure ES module with no DOM and no Usion calls. It is tested with `node --test` against a seeded Shoe. `app.js` owns the UI, the SDK and storage.
- Assets must be inline, so cards are drawn with CSS and the game has no sound.

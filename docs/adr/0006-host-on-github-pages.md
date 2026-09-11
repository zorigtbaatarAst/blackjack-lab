# Host on GitHub Pages instead of Vercel

We had planned to host on Vercel at `blackjacklab.vercel.app`. That Vercel project still served an older Next.js BlackjackLab, which never answers the Usion SDK handshake, so Usion reported the service as not responding. This machine also had no Vercel login, while `gh` was already authenticated. We therefore publish to GitHub Pages at `https://zorigtbaatarast.github.io/blackjack-lab/` and pointed the Usion service there through the registry API.

## Consequences

- The Pages repo `zorigtbaatarAst/blackjack-lab` is public and deploy-only. `scripts/deploy-pages.sh` copies in just the five public app files, so docs, tests and tokens never leave this repo. Its commit history is the deploy log.
- Moving hosts later means redeploying, then updating `iframe_url` with `USION_SERVICE_ID=… scripts/register.sh <url>`. Players' progress is keyed to the Usion service id, so it survives a URL change.
- `app/vercel.json` stays, so a Vercel deploy remains a static, no-build option.

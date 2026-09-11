# Solo first, despite Usion's multiplayer default

Usion's game checklist says "if the game could be played with other people, build it multiplayer". We ship v1 as solo only, with a leaderboard, and plan a shared table (2–5 seats against one dealer) for v2. In blackjack every seat plays the dealer independently, so a second player makes it more social but no more competitive. Blackjack Lab is also a trainer first, which fits the platform's "genuinely solo" exception. Building multiplayer would roughly double v1's scope: waiting hall, bots, invite, chat, a host-run Shoe, a turn clock with proxy moves, and a forfeit grace period.

## Consequences

- The Round engine stays pure state plus Actions, so a host can run it for a shared table later without a rewrite.
- `Usion.getLaunchParams().mode` is still honoured. `'single'` drops straight onto the Play table.

# Play Chips, not Usion wallet credits

Bets use free Chips kept in the player's storage, never Usion wallet credits. The game is free, with no in-app purchases. Wallet charges are escrow holds that our own server has to settle, or Usion refunds them after 72 hours, and a static site has no server. Real-credit gambling would also turn a trainer into a casino. The Bankroll starts at 1,000 and Refills to 1,000 whenever it drops below the table minimum.

## Consequences

- Chips carry no stakes, so a leaderboard ranked on Chips would mostly measure variance and Refill abuse. See ADR 0005.
- The Bankroll is saved only at Settlement, so leaving mid-Round voids the Round and refunds the Bet. We accept that this lets players dodge bad hands, because Chips are free.

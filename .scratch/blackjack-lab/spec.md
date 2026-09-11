# Spec: Blackjack Lab v1

Status: ready-for-agent

Vocabulary follows `CONTEXT.md`. Decisions with lasting weight are in `docs/adr/0001`–`0005`.

## Problem Statement

People who play blackjack lose chips to the house edge, and they lose more to bad decisions they don't know they're making. They hit 12 against a 4, stand on soft 18 against a 10, or split tens. Basic strategy fixes most of this, but people learn it from a static chart, and a chart gives no practice, no feedback in the moment and no picture of where they personally go wrong. Blackjack games give practice without teaching, and strategy charts teach without practice. Nothing on Usion combines the two.

## Solution

Blackjack Lab is a free, solo Usion mini-app with three tabs:

- **Play:** a realistic blackjack table using free Chips. It plays by one fixed rule set: 6 decks, dealer stands on soft 17, Blackjack pays 3:2, double after split, dealer Peeks. A Coach checks every Decision against the Book and flags Mistakes right after the Action. An optional Hint shows the Book action in advance.
- **Train:** Drills that deal one Situation at a time, with no Chips. The default Weighted drill favours Soft totals, Pairs and Close calls. The Mistakes drill re-deals the player's Pending cells until they're fixed. Every answer gets instant feedback with a Rule of thumb.
- **Improve:** accuracy overall and by category, the recent Mistakes, Play results, a heat-map of the Strategy chart coloured by the player's accuracy, and the leaderboard. The leaderboard ranks the Best streak in the Weighted drill.

The app opens straight onto the table, follows Usion's theme and language (English or Mongolian), and saves progress per user through Usion storage.

## User Stories

### Play: table and betting

1. As a player, I want the app to open ready to play, on the tab I last used (the table, with my last Bet ready, on first launch), so that I can start with one tap.
2. As a first-time player, I want to start with 1,000 Chips and a Bet of 10 ready, so that I can play right away without any setup.
3. As a player, I want to add 10, 25, 100 and 500 chips to my Bet with single taps, so that I can size a Bet with one thumb.
4. As a player, I want chips that would push my Bet above 500, or above my Bankroll, to be disabled, so that I can never place an invalid Bet.
5. As a player, I want a Clear button, so that I can reset my Bet and size it again.
6. As a player, I want a Rebet button that restores my previous Bet after I've cleared, so that I can go back to my usual stake quickly.
7. As a player, I want Deal disabled until my Bet reaches the table minimum of 10, so that I understand why I can't deal yet.
8. As a player, I want my Bankroll visible at all times, so that I always know where I stand.
9. As a player, I want to see how many cards are left in the Shoe, so that I know when a reshuffle is coming.
10. As a player, I want the Shoe reshuffled only after the Round in which the Cut card comes out, never mid-Round, so that the game behaves like a real table.

### Play: dealing and dealer rules

11. As a player, I want the dealer to Peek for Blackjack when showing an ace or a ten-value card, so that I never lose Doubles or Splits to a dealer Blackjack.
12. As a player, I want a dealer Blackjack to end the Round immediately, taking only my original Bet (or Pushing against my own Blackjack), so that the peek rule is honoured.
13. As a player, I want my Blackjack to be paid 3:2 immediately, so that I get the payout the table promises.
14. As a player, I want Blackjack paid at exactly 3:2 even on an odd Bet (a Bet of 25 wins 37.5), so that the payout is never silently rounded against me.
15. As a player, I want the dealer to draw to 17 and stand on every 17, soft 17 included, so that the game matches the Book it teaches.
16. As a player, I want the dealer's hole card reveal and draws animated briefly, so that I can follow what happened.
17. As a player, I want the dealer not to draw when every one of my Hands has Busted, so that the Round ends without pointless cards.

### Play: player Actions

18. As a player, I want to be offered only the Actions allowed right now (Hit, Stand, Double, Split), so that I never tap something that doesn't work.
19. As a player, I want Double to add a Bet equal to my original and deal me exactly one more card, so that it works like a real Double.
20. As a player, I want to Double on any first two cards, including after a Split, so that every Double the Book recommends is available.
21. As a player, I want to Split any Pair, including two different ten-value cards, into two Hands with equal Bets, so that Splitting works like a real table.
22. As a player, I want to re-split up to four Hands in total, so that repeat Pairs can be played the way the Book says.
23. As a player, I want split aces to get exactly one card each and then stand automatically, so that the aces rule is enforced.
24. As a player, I want 21 on a split Hand to pay 1:1 instead of as a Blackjack, so that the payout rules are correct.
25. As a player, I want any Hand that reaches 21 to stand automatically, so that I'm never asked a pointless question.
26. As a player, I want Double and Split to be unavailable when my Bankroll can't cover the extra Bet, so that I never stake Chips I don't have.
27. As a player, I want to play split Hands one at a time with the active Hand clearly marked, so that I always know which Hand I'm deciding on.
28. As a player, I want a Busted Hand to lose even if the dealer Busts afterwards, so that the house rules are honest.

### Play: Settlement and Chips

29. As a player, I want each Hand's result (Blackjack, Win, Push, Lose or Bust) and the Round's net shown after Settlement, so that I can see the outcome at a glance.
30. As a player, I want to be Refilled to 1,000 Chips whenever my Bankroll drops below 10, so that I can always keep playing.
31. As a player, I want to be told when a Refill happens, so that a sudden jump in my Bankroll isn't confusing.
32. As a player, I want a Round I leave or reload mid-way to be voided with my Bet refunded, so that I never end up in a half-saved state.

### Coach and Hint

33. As a player, I want the Coach to flag a Mistake right after my Action, showing the Book action and a Rule of thumb, so that I learn during real play.
34. As a player, I want nothing to interrupt me when my Action matches the Book, so that correct play stays fast.
35. As a player, I want the Hand to continue with the Action I actually chose (no undo), so that Play keeps real consequences.
36. As a player, I want a Hint toggle that shows the Book action before I act, so that I can play guided while I'm still learning.
37. As a player, I want Decisions made with the Hint on to stay out of my stats, so that my accuracy reflects what I know myself.
38. As a player, I want my Hint preference remembered, so that I don't have to set it every time.
39. As a player, I want the Coach to account for Actions I can't take, such as standing on a three-card soft 18 instead of Doubling, so that its advice is always possible to follow.

### Train

40. As a learner, I want a Weighted drill that deals one Situation at a time without Chips, so that I can practise Decisions quickly.
41. As a learner, I want drills to favour Soft totals, Pairs and Close calls and never deal trivial hands (8 or less, hard 17+, soft 19+), so that practice time goes where mistakes happen.
42. As a learner, I want about 15% of non-Pair Situations dealt as three or more cards (no Double available), so that I learn what to do when I can't Double.
43. As a learner, I want the dealer's Upcard shown with my Hand, so that each Situation is complete.
44. As a learner, I want only the Actions valid for the Situation offered, so that the drill matches real play.
45. As a learner, I want an instant "correct" signal and automatic advance after about 0.6 s, so that I can drill at speed.
46. As a learner, I want a Mistake to show the Book action and a Rule of thumb and wait for my tap, so that I have time to absorb the correction.
47. As a learner, I want my current Streak and Best streak visible while drilling, so that I have something to chase.
48. As a learner, I want my Streak to survive closing and reopening the app, so that a long run isn't lost to a reload.
49. As a learner, I want a Mistakes drill that deals only my Pending cells, so that I can fix exactly what I get wrong.
50. As a learner, I want a cell to leave my Mistakes drill after two consecutive correct Decisions there, so that I can see myself improving and eventually empty the drill.
51. As a learner, I want a clear empty state in the Mistakes drill when I have no Pending cells, so that I know I'm caught up.
52. As a learner, I want Decisions in the Mistakes drill and in Play to leave my Streak alone, so that the leaderboard stays fair.

### Improve

53. As a player, I want my overall accuracy percentage, so that I can see how well I know the Book.
54. As a player, I want accuracy split into Hard totals, Soft totals and Pairs, so that I know which area to practise.
55. As a player, I want my last 50 Mistakes listed with the Situation, my Action, the Book action and where it happened (Play, Weighted drill or Mistakes drill), so that I can review specific errors.
56. As a player, I want Play stats (Hands played, wins, losses, Pushes and net Chips, not counting Refills), so that I can see how I'm doing at the table.
57. As a player, I want a heat-map of all 280 Chart cells, coloured by my accuracy, with the Book action in each cell and cells I've never played shown neutral, so that I can see my weak spots at a glance.
58. As a new player, I want a helpful empty state in Improve before I've made any Decisions, so that the tab doesn't look broken.
59. As a player, I want a Reset stats button with a confirmation step, so that I can start my record over without losing my Chips, Streak or rank.

### Leaderboard

60. As a logged-in player, I want every Streak that ends to be submitted to the leaderboard, so that my Best streak is ranked.
61. As a logged-in player, I want a card showing my rank, my friends' records and the global top 10 when a Streak of 5 or more sets a new Best streak, so that a new best feels rewarding.
62. As a logged-in player, I want a leaderboard section in Improve with a Friends/Global toggle and my own rank, so that I can check my standing any time.
63. As a Guest, I want to play and train fully, with my Chips and stats kept on this device, so that I get the real app before signing up.
64. As a Guest, I want a "Log in to rank" note where the leaderboard would be, and no surprise login prompts mid-drill, so that practice isn't interrupted.

### Platform, language, theme and reliability

65. As a Mongolian speaker, I want the whole UI, Rules of thumb included, in Mongolian when my Usion language is Mongolian, so that I can learn in my language.
66. As an English speaker, I want English whenever my Usion language isn't Mongolian, so that the app always has a sensible default.
67. As a player, I want the app to follow Usion's light or dark theme, so that it feels native to the host.
68. As a mobile player, I want a portrait, one-thumb layout with no text selection, zoom or rubber-band scrolling, so that it feels like a game rather than a web page.
69. As a player, I want the host's back button to return from Train or Improve to Play, close any open card or dialog, and exit the app from Play, so that navigation behaves as I expect.
70. As a player, I want to be told if my progress fails to save, so that I don't lose progress without knowing.
71. As a player, I want the app to keep working without overwriting my saved progress when that progress can't be loaded, so that a temporary failure never wipes my history.
72. As a player who uses a screen reader, I want cards and buttons to have spoken labels (such as "Ace of spades"), so that the game is usable without sight.
73. As a player who prefers reduced motion, I want animations minimised, so that the app respects my system setting.

### Creator

74. As the creator, I want every game rule testable with `node --test` without a browser or Usion, so that I can change rules safely.
75. As the creator, I want to deploy by uploading static files to Vercel with no build step, so that shipping stays trivial.
76. As the creator, I want the service registered on Usion through the API as a free strategy game with a leaderboard, so that it appears in Explore and Game Center.
77. As the creator, I want the token file, docs and tests never deployed, so that no secret or internal document goes public.
78. As the creator, I want the app to boot in a plain browser outside Usion, so that I can check the UI by hand while developing.

## Implementation Decisions

### Architecture (see ADR 0002)

- **Two modules.** The design follows a functional-core / imperative-shell split.
  - **Engine:** a pure ES module with no DOM, no Usion, no clock, and randomness only through an injected function. It holds every rule: Shoe, Hand values, the Round state machine, Settlement, Refill, the Book, Coach, Hint, Drills, Streak, stats and the snapshot format.
  - **Shell:** rendering, i18n, the Usion SDK, storage, the leaderboard, timers and animation.
- **Engine interface** (the only test seam):
  - `newLab(saved, { rng, cards? })` returns a state. `saved` may be empty, which means a first launch. `rng` returns numbers in [0, 1). The optional `cards` stacks the top of the Shoe in a fixed order, for tests. The Shoe itself is a 6-deck shuffle using an unbiased Fisher–Yates shuffle driven by `rng`.
  - `step(state, event)` returns a new state and never mutates its input. An event that isn't valid in the current state throws, because it's a shell bug. The shell must only offer what the state says is allowed.
  - `snapshot(state)` returns only settled, persistable data.
  - `bookAction(situation)` returns the Book action and a Rule of thumb id. A Situation is the player's cards, the dealer's Upcard and the Actions currently allowed.
  - The engine also exports the Strategy chart layout (rows × Upcards, with each cell's id and Book code) so that the heat-map and the tests share one source of truth.
- **Events:**
  - Play: `bet(chip)`, `clearBet`, `rebet`, `deal`, `act(hit | stand | double | split)` and `toggleHint`.
  - Train: `startDrill(weighted | mistakes)`, `answer(action)` and `next`.
  - Improve: `resetStats`.
- **State exposes:**
  - Play: Bankroll, pending Bet and which chips are enabled; the current Round (phase, dealer cards, player Hands with Bets, the active Hand, allowed Actions, results); Shoe cards left.
  - Coach and Hint: the Hint setting and hinted Book action; a one-shot Coach flag for a Mistake; a one-shot Refill signal.
  - Train and progress: the Drill (mode, Situation, feedback, empty flag); Streak and Best streak; a one-shot "Streak ended" signal with its length and whether it's a new Best streak; stats (per-cell counters, recent Mistakes, Play stats).
  - One-shot signals clear on the next event. The shell reacts to them (toast, leaderboard submit, new-best card).
- **Timing lives in the shell.** The engine resolves the dealer's whole turn and the Settlement in the step that ends the player's turn, and the shell animates from the resulting state. The 0.6 s auto-advance after a correct drill answer is a shell timer that dispatches `next`.

### Table rules (see ADR 0003)

- 6 decks (312 cards). The Cut card sits at 75%: once 234 cards have been dealt, the Shoe reshuffles after the current Round ends. Cards left is shown.
- The dealer stands on all 17s and Peeks with an ace or ten-value Upcard. A dealer Blackjack settles the Round immediately. Player Blackjack against dealer Blackjack is a Push. There's no insurance and no even money.
- Blackjack pays exactly 3:2. The Bankroll may hold half Chips (for example 1,037.5). Other wins pay 1:1.
- Bets run from 10 to 500, built from 10/25/100/500 chips. The table maximum applies to the initial Bet only, so Doubles and Splits may take the total stake above 500.
- **Double:** any first two cards, including after a Split; exactly one more card; the Bankroll must cover it.
- **Split:** any two cards of equal value (ten-value cards count as equal), up to four Hands in total, and the Bankroll must cover it. Split aces get one card each and can't be re-split. 21 on a split Hand is not a Blackjack.
- Hands auto-stand on 21 (hard or soft) and after split aces are dealt. A Busted Hand loses regardless of the dealer. The dealer doesn't draw if every player Hand has Busted.
- **Bet lifecycle:** the Bet is deducted from the live Bankroll at deal, and again for each Double or Split. It becomes the last Bet only at Settlement. The snapshot always reports the Bankroll and last Bet as of the last Settlement. That is why a Round interrupted by a reload is voided and its Bet effectively refunded (ADR 0004). Decisions are saved as they're made, voided Round or not.
- **Refill:** at Settlement, if the Bankroll is below 10, it is reset to 1,000 and the Refill signal is raised. Refills don't count toward net Chips.
- **Pending Bet:** it is pre-filled with the last Bet, or 10 on first launch or if the last Bet isn't affordable. That happens at launch and after every Settlement, so Deal is always one tap away. Clear empties it, and Rebet restores the last Bet.

### The Book (Strategy chart)

The Book is basic strategy for 4–8 decks, dealer stands on soft 17, double after split, no surrender. Codes: H = hit, S = stand, D = double (hit if you can't double), Ds = double (stand if you can't double), P = split.

Hard totals:

| Hand | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| 8 or less | H | H | H | H | H | H | H | H | H | H |
| 9 | H | D | D | D | D | H | H | H | H | H |
| 10 | D | D | D | D | D | D | D | D | H | H |
| 11 | D | D | D | D | D | D | D | D | D | H |
| 12 | H | H | S | S | S | H | H | H | H | H |
| 13–16 | S | S | S | S | S | H | H | H | H | H |
| 17 or more | S | S | S | S | S | S | S | S | S | S |

Soft totals:

| Hand | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A,2 / A,3 (soft 13–14) | H | H | H | D | D | H | H | H | H | H |
| A,4 / A,5 (soft 15–16) | H | H | D | D | D | H | H | H | H | H |
| A,6 (soft 17) | H | D | D | D | D | H | H | H | H | H |
| A,7 (soft 18) | S | Ds | Ds | Ds | Ds | S | S | H | H | H |
| A,8 / A,9 (soft 19–20) | S | S | S | S | S | S | S | S | S | S |

Pairs:

| Pair | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| 2,2 / 3,3 / 7,7 | P | P | P | P | P | P | H | H | H | H |
| 4,4 | H | H | H | P | P | H | H | H | H | H |
| 5,5 | D | D | D | D | D | D | D | D | H | H |
| 6,6 | P | P | P | P | P | H | H | H | H | H |
| 8,8 / A,A | P | P | P | P | P | P | P | P | P | P |
| 9,9 | P | P | P | P | P | S | P | P | S | S |
| 10,10 | S | S | S | S | S | S | S | S | S | S |

- **Fallbacks:** if Double isn't allowed, D becomes H and Ds becomes S. If Split isn't allowed (four Hands already, or the Bankroll can't cover it), the Pair is played as its total. Unsplittable aces are soft 12, which is a Hit.
- **Chart cells:** there are 28 rows × 10 Upcards = **280 cells**:
  - Hard rows: 8-or-less, 9, 10, 11, 12, 13, 14, 15, 16, 17-or-more.
  - Soft rows: soft 13 to soft 20.
  - Pair rows: 2,2 to A,A.
- **Cell ids are a persisted contract:** class letter + row + `-` + Upcard. Examples: `H16-10`, `H8-5` (8 or less), `H17-A` (17 or more), `S18-9`, `P8-A`, `PA-6`, `P10-5`. Upcards are `2`–`10` and `A`.
- **Classification:** a two-card Pair always lands in its Pair cell, whether or not Split is allowed. Any other Hand lands in its Soft or Hard cell. The Book action inside a cell can vary with the allowed Actions. For example, cell `S18-4` is Double with two cards and Stand with three.
- **Close calls** are computed from the chart rather than kept as a hand-made list. A Close call is a cell whose Book code differs from a horizontal or vertical neighbour in the same table.
- **Rules of thumb** (~19 ids, each covering a chart region; the text lives in the shell's strings table):
  - **Pairs:**
    - Always split aces and eights.
    - Never split tens.
    - Never split fives; play them as a hard 10.
    - Split 2s, 3s and 7s against 2–7.
    - Split 6s against 2–6.
    - Split 4s only against 5–6.
    - Split 9s except against 7, 10 and ace.
  - **Hard totals:**
    - Always hit 8 or less.
    - Double 9 against 3–6.
    - Double 10 against 2–9.
    - Double 11 against everything except an ace.
    - Stand on 12 against 4–6.
    - Stand on 13–16 against 2–6, hit against 7+.
    - Always stand on hard 17+.
  - **Soft totals:**
    - Double soft 13–17 against the dealer's weak cards (A2–A3 vs 5–6, A4–A5 vs 4–6, A6 vs 3–6), otherwise hit.
    - Soft 18: double against 3–6, stand against 2/7/8, hit against 9/10/A.
    - Always stand on soft 19+.
  - **Fallbacks:**
    - "Can't double? Hit — but stand on soft 18."
    - "Can't split? Play the pair as its total."
  - When the Book action is a fallback, the fallback rule is shown, not the region rule.

### Coach, Hint, Drills and stats

- **Coach:** on every Play `act`, the engine works out the Book action for the Situation as it stood before the Action.
  - With the Hint off, it records the Decision and raises the Coach flag only on a Mistake.
  - With the Hint on, the Book action is shown before the player acts. Once the Hint has been shown in a Round, even if it's turned off again, no Decision in that Round is recorded.
  - Auto-stand Hands and split aces involve no Decision.
- **The Hint exists only in Play.** Drills have no Hint, which protects the Streak.
- **Weighted drill:**
  - Picks a Chart cell by weight. The rows 8-or-less, hard 17-or-more, soft 19 and soft 20 are excluded. Close calls weigh 3×, and all other cells 1×.
  - The chosen cell is then realised as concrete cards, with random suits and a random ten-value rank for a 10. Pair cells are always two cards. Other cells are two cards about 85% of the time and three or more cards about 15% of the time, when possible. Multi-card Situations never allow Double or Split.
  - A realised Hard or Soft cell is never accidentally a Pair.
- **Mistakes drill:**
  - Picks uniformly among Pending cells and realises them the same way.
  - A Mistake in any mode marks its cell pending, needing two fixes. Each Book-matching Decision in that cell counts down, and the cell clears at zero.
  - With no Pending cells, the drill is flagged empty.
- **Streak:**
  - Only Weighted drill answers change it: +1 on a match with the Book. A Mistake ends the Streak, raising the "Streak ended" signal with its length and whether it's a new Best streak, then resets it to 0.
  - Best streak is stored as the best *ended* Streak, so "new best" is exact. The UI shows whichever is larger, the Best streak or the Streak still running.
  - Both Streak and Best streak are persisted, so a Streak survives reloads.
- **Stats:**
  - Per cell: total Decisions, correct Decisions and the pending countdown.
  - Recent Mistakes: newest first, capped at 50. Each entry holds the cell, the player's cards, the Upcard, the chosen Action, the Book action and the source (`play`, `weighted` or `mistakes`).
  - Play stats: Hands, wins (Blackjacks included), losses, Pushes and net Chips.
  - Overall and category accuracy are derived from the cells.
- **`resetStats`** clears the cells (counters and pending), recent Mistakes and Play stats. It keeps the Bankroll, the last Bet, the Hint setting, the Streak and the Best streak.

### Persistence

- **Format:** one storage key holds the snapshot, as versioned JSON. It contains the version (1), settled Bankroll, last Bet, Hint setting, Streak, Best streak, per-cell stats, recent Mistakes, Play stats and the open (unanswered) Weighted-drill Situation. Saving that Situation means a reload can't skip it, just as a mode switch can't. It's a few kilobytes, far under Usion's 512 KB per-value limit. The shell keeps the last-used tab in a separate small key.
- **Loading:** the shell loads the snapshot once, after `Usion.init` fires, and builds the Lab from it. `newLab` rejects a snapshot it can't validate (including cell ids that aren't on the chart and unknown Actions or sources) or whose version it doesn't know. A saved Bankroll below the table minimum is Refilled on load rather than rejected.
- **Writes:** the shell saves after any step that changes persisted data (Settlement, a recorded Decision, Hint toggle, reset). Writes are coalesced: at most one is in flight, and the newest queued snapshot replaces older ones.
- **Save failure:** the shell logs it with context and shows a non-blocking "progress not saved" notice, then retries on the next save.
- **Load failure or a rejected snapshot:** the session runs on defaults **without ever saving**, and a notice says progress won't be saved. A transient failure must never overwrite real progress.
- **Guests:** Usion storage works per device for Guests, keyed by their `guest_` id, so it's used for everyone. No separate browser-storage fallback is needed, and nothing migrates when a Guest logs in.

### Usion integration

- **SDK loading:** the entry page loads the SDK script from Usion itself, which Path B requires, and starts everything inside `Usion.init`. The app uses only documented SDK methods.
- **Launch:** always solo. The app never calls any multiplayer API, so Usion won't tag it as multiplayer (ADR 0001). It opens the last-used tab, or Play on first launch, with the Pending Bet pre-filled.
- **Language and theme:** language `mn` means Mongolian, and anything else means English. The theme (light or dark) comes from init/`getTheme()` and drives CSS custom properties.
- **Leaderboard:**
  - On a "Streak ended" signal of length ≥ 1, logged-in users submit their Best streak with `leaderboard.submit`. Usion keeps the best, so re-sending it is harmless and repairs any earlier submit that failed. A board loaded before the submit landed is reloaded.
  - If the signal marks a new Best streak of 5 or more, the new-best card shows the rank from the submit result, `friends()` and `top({limit: 10})`.
  - The Improve tab shows friends/global boards and `me()`.
  - Guests (user id starting `guest_`) never submit, which avoids the host's mid-drill login prompt. They see a "Log in to rank" note instead.
- **Back button:** the host back claim is one-shot, so it's re-claimed on every screen change. Train and Improve go back to Play, and a card or dialog closes. Play releases the button so the host shows close.
- **The "not a web page" reset:** viewport locked, no selection, no callout, no tap highlight, no double-tap zoom, no overscroll.
- **Outside the Usion host** (plain browser, local development): if the SDK is missing or init doesn't fire within 8 s, the app boots with English, the system colour scheme, no persistence and no leaderboard. 8 s is the SDK's own recommendation: timing out inside Usion would mean an unsaved session without the player's profile.

### UI

- **Style:** mobile-first portrait, full viewport, with the bottom tab bar Play | Train | Improve and one-thumb controls at the bottom. The look is flat and minimal black/white, per Usion's design guidance.
- **Usion profile:** a header on every tab shows the player's Usion avatar and name (from init's `userName`/`userAvatar`, falling back to `Usion.user.getProfile()`), their Chips and Best streak. Guests see "Guest · Log in to rank"; outside Usion it reads "Preview". Only https avatars are shown; anything else falls back to the initial.
- **Stable layout:** nothing on screen moves between turns. The bet line (the pending Bet, or the Round's stake), the chip tray (dimmed outside betting) and one bottom row are always present. Only the bottom row's contents swap, between Clear/Rebet/Deal and the Actions, and both are the same height. Coach Mistakes, the Hint and the Round's result appear in a fixed-height slot printed on the felt, not in a panel that grows and shrinks.
- **Auto bet:** a session-only toggle (key A). After each Round's reveal it re-deals the current Bet 1.5 s later, so the player only makes Decisions. Turning it on at an idle table deals right away. It stops, with a notice, if Settlement had to lower the Bet because the last one no longer fits the Bankroll. It pauses while another tab or a dialog is open, and resumes on returning to Play.
- **Desktop:** cards size to the smaller of window width and height (46–112 px); from 900 px wide the column widens to 760 px. Keyboard: H/S/D/P for the Actions and drill answers, 1–4 for chips, Enter to deal or go to the next Situation, C to clear, R to rebet, Esc to close a dialog. Keys press the same buttons a tap would. Key hints and hover states show only on devices with a mouse.
- **Cards:** drawn in CSS (rank plus suit glyph, red hearts and diamonds, a CSS card back). They carry spoken labels, animate with short deal and flip transitions, respect reduced motion, and have no sound.
- **Play screen:** dealer Hand, player Hand(s) with the active Hand marked, Bankroll, Shoe cards left, chips/Clear/Rebet/Deal while betting, and the allowed Action buttons during the player's turn. It also has the Hint toggle, the Coach Mistake toast, per-Hand results and the Round net.
- **Train screen:**
  - Header: the Weighted/Mistakes switch, plus the Streak and Best streak.
  - Body: the Situation (Upcard plus Hand) and the allowed Action buttons.
  - Feedback: a correct answer auto-advances; a Mistake shows the Book action, the Rule of thumb and a Next button.
  - The Mistakes drill has an empty state.
- **Improve screen:** accuracy (overall and by category), recent Mistakes, Play stats, the heat-map (28×10, coloured by accuracy, Book code in each cell, neutral when there's no data), the leaderboard section, and Reset stats with a confirmation.
- **Loading, empty and error states:** a brief loading state while the snapshot loads, empty states in Improve and the Mistakes drill, and the save/load notices described above.
- **i18n:** one strings table with English and Mongolian, covering every UI string and every Rule of thumb. The engine returns ids, never text.

### Deployment and registration

- **Deploy:** only the app's own public files (entry page, stylesheet, engine, shell, strings) are published, as static files with no build step, to GitHub Pages through a deploy-only repo (ADR 0006). Tests, docs, `.scratch` and the token file are never uploaded.
- **Registration:** the service is registered once through the Usion registry API with the creator's token. The fields are:
  - name: "Blackjack Lab"
  - service type: game
  - `iframe_url`: the GitHub Pages URL
  - cost: 0
  - genre: strategy
  - tags: blackjack, cards, strategy, trainer
  - published: yes
  - guest access: the default (open)
  - leaderboard: enabled, order descending, mode best, metric score, `max_score` 10000
- **Updates:** re-running the deploy script updates the app in place. Metadata and URL changes go through the registry update endpoint (`PUT /registry/services/my/{id}`).

## Testing Decisions

- **What makes a good test:** tests go through the engine interface only (`newLab`, `step`, `snapshot`, `bookAction` and the exported chart). They feed events and assert observable state. They never reach into internal helpers, so the engine's insides can be refactored freely. Each test reads as a table scenario ("stacked Shoe A, 6, K, 5 → deal → Blackjack → Bankroll +15 on a Bet of 10").
- **Tooling:** Node's built-in test runner and assert module, with zero npm dependencies. Stacked `cards` pin exact deals, and a seeded `rng` makes drills and shuffles reproducible.
- **Table and Settlement cover:**
  - Blackjack pays 3:2, including a Bet of 25 paying 37.5.
  - A dealer Peek Blackjack ends the Round and takes only the original Bet; Blackjack against Blackjack Pushes.
  - Dealer stands on soft 17 and hits soft 16.
  - A Bust loses even when the dealer Busts; no dealer draw when every Hand has Busted.
  - Double doubles the Bet and gives exactly one card; no Double on three cards; Double after Split.
  - Split makes equal Bets; re-split up to four Hands.
  - Split aces get one card each with no further Action; 21 on a split Hand pays 1:1; auto-stand on 21.
  - Double and Split are refused when the Bankroll can't cover them.
  - Refill below 10, and Refills excluded from net.
  - Reshuffle after the Cut-card Round, never mid-Round; cards left counts down.
  - Invalid events throw.
- **Book coverage:**
  - Table-driven over all 280 cells against the chart in this spec.
  - The fallbacks (Double not allowed → H/S; Split not allowed → total; unsplittable aces → hit).
  - The rule id for each region, and fallback rule ids.
- **Coach and Hint cover:**
  - A Mistake is recorded with source `play` and raises the flag.
  - A correct Decision raises no flag.
  - Hinted Decisions aren't recorded.
- **Drills cover:**
  - Over thousands of seeded samples: the Weighted drill never deals an excluded row; about 85% of non-Pair Situations are two cards, within a tolerance; Close calls appear about 3× as often as other cells.
  - Multi-card Situations never allow Double or Split, and Hard/Soft realisations never form a Pair.
  - The Mistakes drill deals only Pending cells, a cell clears after two correct answers, and the drill is empty when none remain.
- **Streak covers:**
  - +1 on a Weighted-drill match with the Book.
  - A Weighted-drill Mistake raises "Streak ended" with its length and whether it's a new best, and resets to 0.
  - The signal clears on the next event.
  - Mistakes-drill and Play Decisions leave the Streak unchanged.
- **Stats and snapshot cover:**
  - Accuracy by category; recent Mistakes capped at 50, newest first.
  - `resetStats` clears exactly what it should.
  - A mid-Round `snapshot` keeps the pre-deal Bankroll and last Bet (voided Round).
  - `newLab(snapshot(state))` round-trips; invalid or unknown-version snapshots are rejected.
- **The shell is not unit-tested.** Each ticket that touches it closes with a manual checklist:
  - In a plain browser: boots with defaults.
  - In the Usion iframe, as a Guest and logged in: persistence across reload, leaderboard submit and new-best card, "Log in to rank" for Guests.
  - Both themes, both languages, the back-button behaviour, and the save-failure notice.
- **Prior art:** none in the repo, which is greenfield. The «13» reference card game (github.com/nelsuh/13) is the model for structure and Usion integration, but it has no tests.

## Out of Scope

- A multiplayer shared table (v2, ADR 0001).
- Configurable rules, surrender, insurance and even money (ADR 0003).
- Usion wallet credits, real-money play and in-app purchases (ADR 0004).
- Resuming a Round after a reload. Interrupted Rounds are voided instead.
- Migrating Guest progress on login.
- A card-counting trainer (running count, true count, deviations).
- Sound, a custom card-art deck, and animation beyond short CSS transitions.
- Heat-map drill-down (tapping a cell to see details or drill it), bankroll-over-time charts, rolling accuracy windows and timestamps on Mistakes.
- Analytics and custom notifications. "Friend beat your record" comes free from the platform.
- A service icon and Explore artwork. See Further Notes.

## Further Notes

- **Choices made while writing this spec** that weren't settled in the grilling. Any of them can be overruled.
  1. Blackjack pays exactly 3:2 on odd Bets, so the Bankroll can hold half Chips.
  2. The table maximum applies to the initial Bet only.
  3. Hands auto-stand on 21.
  4. Two different ten-value cards can be Split.
  5. A Pending cell clears after two consecutive correct Decisions.
  6. Close calls are computed from the chart, and trivial rows are excluded from the Weighted drill.
  7. The Streak persists across reloads and is submitted only when it ends. A never-ending Streak is never ranked.
  8. There's no Hint in Train.
  9. Reset stats also clears Play stats and Pending cells.
  10. The Pending Bet is pre-filled after every Settlement.
- **A fact changed one grilling answer.** The grilling assumed Guests couldn't write Usion storage, hence the "localStorage fallback". The SDK reference says local storage keeps working for Guests, so Usion storage is used for everyone. Behaviour is identical and there's one less code path.
- **Open deployment facts,** for the deploy ticket, which needs the human in the loop:
  - Is the local token file a registry token (`usion_sk_…`, service management only, used with `/registry/services/register`) or a creator key (`usk_live_…`, full account, used with `/services`)?
  - Does the registry body accept the `leaderboard` config? Verify by reading the service back after registration.
  - The Vercel login and project creation need the human.
- **Mongolian copy:** the Mongolian strings, especially the Rules of thumb, need review by a Mongolian speaker before publishing.
- **Last writer wins:** each save replaces the whole snapshot, so a stale session left open on a second device can overwrite newer progress. Accepted for v1; merging per-field is the upgrade if it ever matters.
- **Screen readers:** feedback, notices and Round results are announced through one live region that sits outside the re-rendered app. Dialogs take focus and make the page behind them inert.
- **Service icon:** Usion's `image` field is a URL. An icon hosted with the Vercel deploy would do; the design is still to be decided.

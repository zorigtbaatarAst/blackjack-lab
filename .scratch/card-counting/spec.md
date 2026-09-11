# Spec: Card counting in Train

Status: ready-for-agent

Vocabulary follows `CONTEXT.md` (see its Counting section). Builds on `.scratch/blackjack-lab/spec.md` (v1) and `.scratch/train-full-hands/spec.md` (sub-project 3), whose table functions it reuses. It is sub-project 4 of 4 from the 2026-09-11 brainstorm. Multiplayer stays a future, separate project.

## Problem Statement

Blackjack Lab teaches basic strategy: how to play a hand. It doesn't teach the other half of beating the game, card counting: knowing when the rest of the Shoe favours the player, and betting more then. A player who wants to learn it has nowhere in the app to:

- learn the card values;
- keep a count while cards are dealt;
- turn that count into a true count;
- size a Bet from it.

## Solution

Train gets two counting Drills next to Drill and My mistakes. Both teach **Hi-Lo**.

- **Values:** a 30-second sprint. You tap each card's Count value (+1 / 0 / −1) as fast as you can. Your Best sprint is saved.
- **Count:** rounds are dealt from a real 6-deck **Count Shoe** at Slow, Normal or Fast. The Book plays the hands while you keep the **Running count**. At a random point every 1–4 rounds, a **Count check** asks three questions:
  - the Running count;
  - the **True count**, reading the **Decks left** from a **Discard tray**;
  - the Bet, from the **Bet ramp**.

  Each answer is graded, with the working shown.

Improve shows the counting accuracy and the Best sprint.

## User Stories

1. As a learner, I want to learn the Hi-Lo Count values (+1 for 2–6, 0 for 7–9, −1 for tens and aces), so that I can start counting.
2. As a learner, I want a 30-second sprint where I give cards their Count values, so that recognising the values becomes automatic.
3. As a learner, I want a wrong tap to show the right value, so that I learn from it straight away.
4. As a learner, I want random tapping never to pay off in the sprint, so that my score reflects real skill.
5. As a learner, I want my Best sprint saved and a "New best!" when I beat it, so that I can see myself getting faster.
6. As a learner, I want the sprint clock visible while I play, so that I can pace myself.
7. As a learner, I want to keep the Running count while real rounds are dealt from a Shoe, so that I practise counting at a table.
8. As a learner, I want the Book to play the hands for me, so that I can focus on counting.
9. As a learner, I want to choose the dealing speed (Slow, Normal or Fast) and have it remembered, so that I can start slowly and speed up.
10. As a learner, I want to be asked for the Running count at unpredictable moments (every 1–4 rounds), so that I carry the count across rounds as at a real table.
11. As a learner, I want to see the right Running count after each check, so that I can correct my count and carry on.
12. As a learner, I want the answer stepper to start at the last count I was shown, so that answering takes only a few taps.
13. As a learner, I want to read the Decks left from a Discard tray, so that I practise it as at a real table.
14. As a learner, I want to turn the Running count into a True count and be graded on it, with the working shown when I'm wrong, so that I learn the conversion.
15. As a learner, I want to size my Bet from the True count by the Bet ramp and be graded on it, so that I learn how counting turns into betting.
16. As a learner, I want each question graded against the real count, not against my earlier answer, so that one slip doesn't spoil the next question.
17. As a learner, I want right answers to move on by themselves and wrong ones to wait for Next, so that drilling stays quick and I can read my mistakes.
18. As a learner, I want the Count Shoe reshuffled at the Cut card with a clear "New Shoe" notice, so that I know to start the count again at 0.
19. As a learner, I want a check that falls on the Cut-card round to use the Shoe I was counting, so that the answer matches what I saw.
20. As a learner, I want the Count header to show this session's checks (right / asked) and my all-time accuracy, so that I know how I'm doing.
21. As a player, I want Improve to show my Best sprint, my Count-value accuracy, and my Running count, True count and Bet accuracy, so that I can track my counting.
22. As a player, I want Reset stats to clear my counting accuracy but keep my Best sprint, as it keeps my Best streak.
23. As a player, I want counting practice never to touch my Chips, table stats, last Bet, Streak, Chart-cell stats or Mistakes.
24. As a phone player, I want the four Train tabs and their stats to fit, and the table not to move when I switch tabs or when a drill moves between phases.
25. As a keyboard player, I want keys for every counting control (values, stepper, Bet, speed, Next), with the key hints shown when Hint is on.
26. As a Mongolian speaker, I want all counting text in Mongolian.
27. As a returning player, I want my existing save to load unchanged, with counting starting from zero.

## Implementation Decisions

### Counting rules

- **Count value:** +1 for 2–6, 0 for 7–9, −1 for 10, J, Q, K and A.
- **Running count:** the sum of the Count values of every card dealt from the Count Shoe since its shuffle. That includes every card of each round, the hole card too, because it's always turned over by the end of the round.
- **Decks dealt:** the cards dealt since the shuffle, rounded to the nearest half deck (26 cards). A count exactly between two marks rounds up. For example, 13 cards is 0.5 decks and 12 cards is 0.
- **Decks left:** 6 minus the decks dealt. A check near the Cut card (4.5 decks) usually sees 1.5 decks left. A long split round can leave 1, but never 0.
- **True count:** the Running count ÷ the Decks left, with the fraction dropped (truncated toward zero). For example, +7 ÷ 2.5 = 2.8 → +2, and −3 ÷ 2 = −1.5 → −1.
- **Bet ramp:** the True count minus 1, in units of the table minimum (10 Chips), at least 1 and at most 8.

### Train modes

- Train has four tabs: Drill (the Weighted drill), My mistakes, Values and Count. The engine's start-drill event accepts all four.
- Each counting drill's state is created on its first visit. It's kept while the app stays open, so switching tabs doesn't reset it.
- The Values and Count drills each deal from their own Shoe, separate from the Play Shoe and the Training Shoes.
- For tests, the existing `trainingCards` option stacks the first Shoe created in Train, whichever drill creates it.

### Values drill

- Its phases are ready → running → over. Start is allowed from ready or over.
- **Start:** resets the score and the misses, and shows the first card.
- **Tag (value):**
  - It needs a running sprint and a value of +1, 0 or −1.
  - A right value adds 1 to the score.
  - A wrong one adds a miss and exposes it (the card and its right value).
  - Either way the next card is drawn, and the Count-value tally in stats is updated.
- **End:**
  - It needs a running sprint. The phase becomes over.
  - The result is the score, the misses, and whether it's a new best.
  - The Best sprint becomes the higher of the old best and this score.
- The cards come from a 6-deck Shoe, reshuffled if it ever runs out.
- **Shell responsibilities:**
  - The shell owns the 30-second clock, shown as "Time" in the header, and ends the sprint at 0.
  - After a miss, the right value flashes on the card for 0.6 s and taps are ignored meanwhile.
  - Leaving the Values tab or Train mid-sprint ends the sprint. A partial score can't beat a full one.

### Count drill

- **State:**
  - the Count table (a round and the Count Shoe);
  - the Running count;
  - the cards dealt since the shuffle;
  - the rounds until the next check, drawn uniformly from 1–4;
  - the open question: none, Running count, True count or Bet;
  - the feedback;
  - the New Shoe flag;
  - this session's right / asked tally;
  - the speed.
- **Next:**
  - An open question without feedback makes Next invalid.
  - An open question with feedback moves to the next question: Running count → True count → Bet. After the Bet, the check closes, a new gap of 1–4 rounds is drawn, and the next round is dealt.
  - With no question open and a check due, Next opens the check at the Running count question.
  - Otherwise, Next deals the next round.
  - The first visit deals the first round.
- **Dealing a round:**
  - If the previous round reshuffled the Shoe, the Running count and the cards dealt reset to 0 and the New Shoe flag is set. The flag clears on the following deal.
  - The cards are drawn in Play's order: player, upcard, player, hole.
  - An ace or ten-value upcard with a dealer Blackjack ends the round (peek), and so does a player Blackjack.
  - Otherwise, every Decision takes the Book action for the active Hand.
    - The Bet is 0, so Double and Split are always affordable.
    - A Round holds up to 4 Hands, split aces get one card, and a Hand stands automatically on 21.
  - Then the dealer plays (S17) and the round resolves.
  - Every card of the round is added to the Running count and the cards dealt, and the rounds until the check drop by one.
- **Answer (value):**
  - It needs an open question without feedback, and an integer value; for the Bet, 1–8.
  - The value is graded against the expected answer, which always comes from the real count.
  - The answer is recorded in the stats and in the session tally.
  - The feedback holds the question, whether the answer was right, the value and the expected answer.
    - For the True count it adds the Running count, the Decks left and the exact quotient.
    - For the Bet it adds the True count that was used.
- **Speed:** slow, normal or fast. It's a saved preference.
- **The state exposes:**
  - the round;
  - the Running count, which the shell shows only in feedback;
  - the half decks dealt, for the tray;
  - the open question and its feedback;
  - the New Shoe flag;
  - the session tally;
  - the speed.
- Nothing in either counting drill touches the Bankroll, table stats, the last Bet, the Streak, Chart-cell stats or Mistakes.

### Screens

- **Train header:**
  - The four tabs sit next to two stats.
  - On phones (under 600px) the tabs take a full row and the stats sit on a row underneath, in every mode, so switching tabs never moves the table. Desktop stays one row.
  - Stats per mode:
    - Drill and My mistakes: Streak and Best, as today.
    - Values: Time and Best sprint.
    - Count: Checks (this session, right / asked) and Accuracy (all-time, every check question).
- **Values screen:**
  - One large card sits in the middle of the felt.
  - The felt message shows:
    - before a sprint: the rule, "+1 for 2–6 · 0 for 7–9 · −1 for 10–A";
    - during a sprint: nothing;
    - after it: the result, e.g. "31 right · 2 misses · New best!".
  - Controls: Start, then −1 / 0 / +1 during the sprint, then Again.
  - Keys: ← ↓ → or 1 2 3 for the values, and Enter to start.
- **Count screen, the felt:**
  - It uses the Train felt: the dealer, the Hands and the results.
  - The shell reveals the dealt round card by card, in this order:
    - player, upcard, player, and the hole card face down;
    - then each Hand's further cards, Hand by Hand;
    - then the hole card turns over, followed by the dealer's draws.
  - Split Hands show side by side from the start.
  - Speed is the time per card: Slow 1.0 s, Normal 0.6 s, Fast 0.35 s. After the result there's a pause of about two card intervals before the next step.
- **Count screen, the Discard tray:**
  - It sits in the felt's top-right corner.
  - It has a line at each deck and a tick at each half deck, and it fills in half-deck steps.
- **Count screen, the felt message** shows:
  - the question: "Running count?", "True count?" or "Bet (units)?";
  - then ✓ or ✗ with the working, e.g. "+7 ÷ 2.5 decks = 2.8 → +2" or "True count +3 → 2 units";
  - "New Shoe: the count starts at 0" while the first round after a reshuffle is dealt.
- **Count screen, the controls:** one row with one height in every phase, using stacked panels as in Play.
  - While dealing: the speed switch, Slow / Normal / Fast, with keys 1 2 3.
  - For the Running count and the True count: a stepper, − [value] + OK.
    - For the Running count it starts at the last Running count revealed (0 after a reshuffle). For the True count it starts at 0.
    - Keys: ←/→ or −/+ to adjust, digits and a minus sign to type, Backspace to edit, Enter to answer.
  - For the Bet: eight buttons, 1 to 8, with keys 1–8.
  - After a miss: Next.
  - A right answer moves on after 0.6 s. A wrong one waits for Next or Enter.
- **Count screen, leaving the tab:** leaving Count pauses the drill. Coming back shows the current round fully revealed (or the open question) and carries on from there.
- **Improve:**
  - A Counting block comes after the Play stats.
  - It shows the Best sprint and the Count-value accuracy.
  - It shows the accuracy for the Running count, True count and Bet, each as a percentage with its count.
- **Everywhere:**
  - Key hints follow the existing rule: they show only with Hint on and on a keyboard or mouse device.
  - Every new string exists in English and Mongolian.

### Persistence

- The snapshot stays at version 1 and gains three fields.
  - **The Best sprint.** Missing means 0.
  - **The Count speed.** Missing means normal.
  - **Counting stats inside the stats.** These are right / total tallies for Count values, Running count, True count and Bet. Missing means all zero.
- **Validation on load:**
  - The Best sprint must be a non-negative integer.
  - The speed must be one of the three.
  - Each tally must be non-negative integers, with right ≤ total.
  - A bad value rejects the save, like any other bad save.
- Reset stats clears the counting stats, since they're part of the stats, and keeps the Best sprint.
- An unfinished sprint or Count Shoe isn't saved, so a reload starts both fresh. No leaderboard metric depends on them, so there's nothing to protect.

## Testing Decisions

- **Engine tests only**, through the public interface (`step`), in a new counting test file. The Shoes are stacked with the existing `trainingCards` option, and a seeded rng is used for distributions.
- **Values drill:**
  - Every rank gets the right Count value.
  - Score and misses; the Best sprint and "new best" (a lower score keeps the old best).
  - A tag outside a running sprint is invalid, and so is a value other than +1, 0 or −1.
- **Count drill, dealing:**
  - Rounds are auto-played by the Book: a stacked 16 against a 10 hits, and a pair of 8s splits.
  - Peek ends the round on a dealer Blackjack.
  - The Running count over several stacked rounds equals the sum of the Count values dealt.
  - Check gaps: over a seeded sample, every gap is 1–4 rounds and each of the four occurs.
- **Count drill, checks:**
  - The questions come in the order Running count → True count → Bet.
  - The grading of each question is exact, including a negative True count, the Bet clamped at 1 and at 8, and half-deck rounding at a boundary.
  - Next before answering is invalid, and so is answering twice.
  - A check due on the Cut-card round uses the old Shoe; after it, the Running count is 0 and the New Shoe flag is set.
- **Isolation:** counting leaves the Bankroll, table stats, the last Bet, the Streak, Chart cells and Mistakes unchanged.
- **Persistence:**
  - The Best sprint, speed and counting stats round-trip through the snapshot and a new Lab.
  - A save from before this change loads with the defaults.
  - Malformed counting fields are rejected.
  - Reset stats keeps the Best sprint.
- **Unchanged tests:** all existing engine tests stay as they are.
- **Browser:**
  - A Values sprint played with the keyboard, with a miss.
  - A Count run at Fast through at least three checks.
  - The layout-stability measurement for all four Train modes at 1920×1080 and 390×844: one layout per mode across its phases.

## Out of Scope

- Index plays (Book deviations by True count, such as the Illustrious 18).
- Other counting systems (KO, Hi-Opt, Omega, Zen).
- Counting in Play: no count display and no checks during real Rounds.
- Several seats at the Count table.
- Insurance, which doesn't exist in this game.
- A counting leaderboard: a Usion service has one leaderboard, and it stays the Best streak.
- Saving an unfinished sprint or Count Shoe across reloads.

## Further Notes

- The speeds, the 0.6 s miss pause and the pause after a round are shell constants; tune them after play-testing.
- No new app files are needed, so `scripts/deploy-pages.sh` is unchanged.

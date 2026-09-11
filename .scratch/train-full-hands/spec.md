# Spec: Train plays the hand out

Status: done

Vocabulary follows `CONTEXT.md`. Builds on `.scratch/blackjack-lab/spec.md` (v1). It is sub-project 3 of 4 from the 2026-09-11 brainstorm: 1 Auto bet and 2 Starting chips are done; 4 Card counting comes after this and reuses its hand-dealing.

## Problem Statement

A Drill today is one Decision: two cards against an Upcard, you answer, and the next unrelated Situation appears. Real hands don't stop after the first Decision. You hit, get a card, and decide again; you split and play two hands; the dealer plays out and you win or lose. Training only on first Decisions never practises the follow-up Decisions (hard 16 after a hit, the second hand of a split), and it never shows what your choices lead to.

## Solution

In Train, every Drill is a **Training hand**: a full Round without Chips.

- It starts from the usual weighted pick (soft hands, Pairs, Close calls), or from a Pending cell in the Mistakes drill.
- Every later card comes from a real shuffled 6-deck **Training Shoe**.
- You make each Decision until your hand ends. Each Decision is graded against the Book, with feedback.
- Then the dealer reveals and draws, and the result shows: win, lose, push or bust, with no Chips.
- Then the next hand deals.

## User Stories

1. As a learner, I want each training hand to continue after I hit, so that I practise the follow-up Decisions and not only the first one.
2. As a learner, I want to play both hands after a Split in Train, so that I learn how to play split hands.
3. As a learner, I want Double to give me one card and end my hand, as in Play.
4. As a learner, I want the dealer to play out once my hand is done, and to see whether I won, lost or pushed, so that I see what my choices lead to.
5. As a learner, I want every Decision in the hand graded against the Book with a Rule of thumb, so that I get feedback at every step.
6. As a learner, I want a Mistake to show the correction and wait for my tap, then continue the hand with the move I actually made, so that I see the real consequence.
7. As a learner, I want correct Decisions to move on by themselves (0.6 s, and 1.2 s to read the result when the hand is over), so that drilling stays fast.
8. As a learner, I want training hands to start from the interesting situations the Weighted drill picks (soft hands, Pairs, Close calls), so that practice time isn't wasted on trivial hands.
9. As a learner, I want the cards after the start to come from a real Shoe, so that follow-up Situations are realistic.
10. As a learner, I want training hands never to start with a dealer Blackjack, because the Book assumes the dealer has already checked for one.
11. As a learner, I want every Decision in a Weighted hand to count toward my Streak, and any Mistake to end it, so that the leaderboard reflects every choice.
12. As a learner, I want the Mistakes drill to play out whole hands that start from my Pending cells.
13. As a learner, I want a reload mid-hand to bring back the same hand at the same Decision, so that nobody can skip a hard Decision to protect a Streak.
14. As a player, I want training hands never to touch my Chips, table stats or last Bet.
15. As a returning player, I want my saved progress, including an open drill Situation from before this change, to load without problems.

## Implementation Decisions

### One set of rules for two kinds of table

- A **table** is any object with a `round` and a `shoe`.
  - Play's table is the Lab state itself (`state.round`, `state.shoe`), exactly as today, so every Play event, test and saved field is unchanged.
  - Each drill mode has its own training table: `drill.slots[mode] = { round, shoe, feedback }`, with its own Training Shoe.
- The Round functions take the table they act on: draw a card, Hit/Stand/Double/Split, move to the next Hand, the dealer's turn, and the Actions allowed. Play passes the state and Train passes the slot.
- **Settlement is split in two:**
  - **Resolve** (both tables): every Hand's result; the Round becomes `settled`; the table's Shoe reshuffles at the Cut card.
  - **Pay out** (Play only): the Bankroll, table stats, the last Bet, Refill, and the Bankroll before payouts.
- A training Round has Bet 0. Double and Split therefore cost nothing, and "can the Bankroll cover it?" is always true. The Hands limit (4), split aces and auto-stand on 21 apply as in Play.

### Training hands

- **Start:**
  - The Weighted drill picks a cell as today, including Close-call weighting, excluded trivial rows and about 15% multi-card starts. The Mistakes drill picks a Pending cell, and when there are none it's empty as today.
  - `realise(cell)` gives the first cards and the Upcard. The hole card is drawn from the slot's Training Shoe.
  - If the Upcard is an ace or ten-value card and the hole card would make a dealer Blackjack, the hole card is redrawn. The Book assumes the dealer has already checked.
- **`answer(action)`:**
  - It needs the slot's Round in the player phase, no feedback showing, and an allowed action.
  - It grades the Decision for the active Hand (`recordDecision`: cell stats, Pending, recent Mistakes with source `weighted` or `mistakes`).
  - It updates the Streak in the Weighted drill: +1 on a Book match; a Mistake raises the existing "Streak ended" signal and resets it.
  - It applies the chosen action. When every Hand is done, the dealer plays (S17) and the hand resolves.
  - It sets feedback `{ correct, chosen, book, rule }`.
- **`next`:**
  - If the Round is settled, it deals a new training hand.
  - Otherwise it clears the feedback and continues. Calling `next` mid-hand with no feedback showing is an invalid event.
- **State exposes:** `drill.round` (dealer cards, Hands, the active Hand, allowed Actions, phase, per-Hand results), `drill.situation` (the active Hand vs the Upcard while deciding; otherwise null), `drill.feedback` and `drill.empty`.

### Screen and pacing

- The Train table uses Play's felt, cards and Hand markup:
  - The hole card is face down while you decide, then flips at the end.
  - New cards animate in.
  - Split Hands show side by side with the active one outlined in gold.
- **Felt message slot (fixed height):**
  - While deciding: "What would the Book do?"
  - After a Decision: "✓ Correct" or "✗ Book: X", plus the Rule of thumb.
  - When the hand is over, the result is added: "You win · Dealer 19", "Dealer wins", "Push", "Bust".
- **Pacing (shell timers):**
  - A correct Decision mid-hand calls `next` after 0.6 s.
  - A correct final Decision calls `next` after 1.2 s, which deals the next hand.
  - A Mistake waits for the Next button (Enter).
- **Controls:** stacked panels as in Play. The Action row (locked while feedback shows or the hand is over) and the Next button share one space, so nothing moves.

### Persistence

- The snapshot's `openSituation` field becomes `openHand`: the Weighted slot's Round while it is in the player phase (dealer cards, Hands with their cards and flags, the active index). This keeps the no-skip-by-reload guarantee at every Decision.
  - Feedback and the Training Shoe are not saved; a restored hand continues from a fresh Shoe.
  - `openHand` is validated on load: real cards, 2 dealer cards, 1–4 Hands, an active Hand that isn't finished. A malformed one is rejected like any bad save.
- **Legacy saves:** a save with `openSituation` (the deployed build writes one) loads as a new training hand starting from that Situation's cards and Upcard, with a fresh hole card.
- No other snapshot fields change, and the version stays 1.

## Testing Decisions

- **Engine tests only**, through the public interface. They use a stacked **Training Shoe**: `newLab`'s `cards` option stacks the Play Shoe, and a new `trainingCards` option stacks the training Shoe the same way.
- **New tests:**
  - A correct Hit continues the hand with a new Decision.
  - Stand makes the dealer play and the hand resolve, while Bankroll, table stats and last Bet are unchanged.
  - A Mistake mid-hand records the Mistake and continues with the chosen move.
  - Streak counts every Decision in a Weighted hand; a Mistake ends it with the signal.
  - Split plays both Hands, and each Decision is graded.
  - Double deals one card and ends the Hand.
  - A training hand never starts with a dealer Blackjack: stack a hole card that would make one, and it's redrawn.
  - `next` mid-hand needs feedback; after the hand is over it deals a new hand.
  - The Mistakes drill plays out hands from Pending cells and is empty without any.
  - `openHand` round-trips through snapshot and newLab mid-hand; a legacy `openSituation` loads as a fresh hand; a malformed `openHand` is rejected.
- **Rewritten tests:** the one-decision drill tests are rewritten for hands. The weighted-start distribution test samples only hand starts, by standing to end each hand.
- **Unchanged tests:** every Play test stays as it is and guards the refactor.
- **Browser:** a play-through (Hits, a Split, a Mistake, the result and auto next hand), plus the layout-stability measurement on Train at 1920×1080 and 390×844.

## Out of Scope

- Chips, Bets or Insurance in Train.
- A Hint in Train (unchanged: Drills have none).
- Card counting (sub-project 4).
- Multiplayer (a future, separate project; ADR 0001).
- Saving the Training Shoe or the feedback across reloads.

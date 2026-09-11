# Train Plays the Hand Out: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Drill becomes a full Training hand: a Bet-0 Round played Decision by Decision until your hand ends, then the dealer plays out and the result shows.

**Architecture:** The engine's Round functions are generalised to act on a **table** (`{ round, shoe }`). Play's table is the Lab state itself, unchanged. Each drill mode gets its own training table (`drill.slots[mode] = { round, shoe, feedback }`). Settlement splits into `resolveRound` (both tables) and payout (Play only), so training hands never touch Chips. The save writes the open Weighted hand (`openHand`) instead of the open Situation; legacy `openSituation` saves restart as a hand.

**Tech Stack:** Vanilla ES modules, `node:test` + `node:assert/strict`, zero npm dependencies. The shell is verified in headless Chromium via the scratchpad QA harness.

**Spec:** `.scratch/train-full-hands/spec.md` (glossary: `CONTEXT.md`; v1 spec: `.scratch/blackjack-lab/spec.md`)

## Global Constraints

- `app/engine.js` stays pure: no DOM, no Usion, no clock. Randomness only through the injected `rng`. It is the only unit-test seam.
- Zero npm dependencies. Tests run with `npm test` (`node --test`).
- Training hands never change `bankroll`, `lastBet`, `pendingBet` or `stats.play`.
- Every Play test in `test/engine.test.js` passes unchanged. They guard the refactor.
- Nothing on screen moves between turns: fixed felt message slot, and stacked control panels in one grid cell.
- Every user-facing string exists in `app/strings.js` in both `en` and `mn` (`test/strings.test.js` enforces parity).
- The snapshot version stays 1. Old saves (with `openSituation`, or without `startingChips`) must keep loading.
- Commit after each task. Commit messages end with the repo's Co-Authored-By and Claude-Session lines.

---

### Task 1: Round functions act on a table; Settlement splits into resolve + payout

No behaviour change. The existing 84 tests are the test for this task.

**Files:**
- Modify: `app/engine.js` (the `draw`, `ACTIONS`, `act`, `advance`, `dealerTurn`, `settle`, `allowedActions` and `activeSituation` functions, and the `derive` call sites)

**Interfaces:**
- Produces:
  - `draw(table)`
  - `ACTIONS[action](s, table, hand)`
  - `advance(table) → boolean` (true when every Hand is done and the dealer has played)
  - `dealerTurn(table)`
  - `resolveRound(table, rng)` (sets `hand.result` and `round.phase = 'settled'`; reshuffles `table.shoe` at the Cut card)
  - `settle(s)`, which is `resolveRound(s, s.rng)` plus payout
  - `allowedActions(s, table)`
  - `activeSituation(table)`
  - A table is any object with `.round` and `.shoe`. The Lab state `s` is Play's table.

- [ ] **Step 1: Run the suite to record the baseline**

Run: `cd /opt/projects/blackjack && npm test 2>&1 | grep -E 'ℹ (pass|fail)'`
Expected: `ℹ pass 84` and `ℹ fail 0`

- [ ] **Step 2: Generalise the Round functions**

In `app/engine.js`, replace `function draw(s)` with:

```js
function draw(table) {
  return table.shoe.cards[table.shoe.next++]
}
```

Replace the whole `const ACTIONS = { ... }` block with:

```js
// Each Action works on any table (Play's, or a training one). A training Bet is 0, so Double and Split cost nothing.
const ACTIONS = {
  hit(s, table, hand) {
    hand.cards.push(draw(table))
    if (handTotal(hand.cards).total >= 21) hand.done = true
  },
  stand(s, table, hand) {
    hand.done = true
  },
  double(s, table, hand) {
    s.bankroll -= hand.bet
    hand.bet *= 2
    hand.cards.push(draw(table))
    hand.done = true
  },
  split(s, table, hand) {
    const { round } = table
    s.bankroll -= hand.bet
    const aces = hand.cards[0].rank === 'A'
    const moved = hand.cards.pop()
    hand.cards.push(draw(table)) // the first Hand gets its second card first
    const sibling = { cards: [moved, draw(table)], bet: hand.bet, fromSplit: true, splitAces: aces, done: false }
    hand.fromSplit = true
    hand.splitAces = aces
    round.hands.splice(round.active + 1, 0, sibling)
    // Split aces get exactly one card; any Hand that reaches 21 stands.
    for (const h of [hand, sibling]) {
      if (h.splitAces || handTotal(h.cards).total === 21) h.done = true
    }
  },
}
```

In the `act` handler, replace the last two lines (`ACTIONS[action](s, hand)` and `advance(s)`) with:

```js
    ACTIONS[action](s, s, hand)
    if (advance(s)) settle(s)
```

Replace `advance`, `dealerTurn` and `settle` with:

```js
// Moves to the next unfinished Hand. Once there is none, the dealer plays; true means the Round can resolve.
function advance(table) {
  const next = table.round.hands.findIndex((hand) => !hand.done)
  if (next >= 0) {
    table.round.active = next
    return false
  }
  dealerTurn(table)
  return true
}

function dealerTurn(table) {
  const { round } = table
  if (round.hands.every((hand) => handTotal(hand.cards).total > 21)) return
  // S17: draw below 17, stand on every 17 including soft 17.
  while (handTotal(round.dealer).total < 17) round.dealer.push(draw(table))
}

// Every Hand's result, the Round over, the table's Shoe reshuffled at the Cut card. Chips are Play's business.
function resolveRound(table, rng) {
  const { round } = table
  const dealer = handTotal(round.dealer).total
  const dealerBlackjack = round.dealer.length === 2 && dealer === 21
  for (const hand of round.hands) hand.result = resultOf(hand, dealer, dealerBlackjack)
  round.phase = 'settled'
  if (table.shoe.next >= CUT_CARD) table.shoe = newShoe(rng)
}

// Play's Settlement: resolve the Round, then pay out Chips, table stats, the last Bet and any Refill.
function settle(s) {
  resolveRound(s, s.rng)
  const { round, stats } = s
  let staked = 0
  let returned = 0
  for (const hand of round.hands) {
    hand.payout = hand.bet * PAYOUT[hand.result]
    staked += hand.bet
    returned += hand.payout
    stats.play.hands++
    if (hand.result === 'win' || hand.result === 'blackjack') stats.play.wins++
    else if (hand.result === 'push') stats.play.pushes++
    else stats.play.losses++
  }
  round.bankrollBeforePayout = s.bankroll
  s.bankroll += returned
  s.lastBet = round.bet
  round.net = returned - staked
  stats.play.net += round.net
  if (s.bankroll < MIN_BET) {
    s.bankroll = s.startingChips
    s.refilled = true
  }
  s.pendingBet = prefillBet(s)
}
```

Replace `allowedActions` and `activeSituation` with:

```js
function allowedActions(s, table) {
  const { round } = table
  const hand = round.hands[round.active]
  const allowed = ['hit', 'stand']
  const affordable = s.bankroll >= hand.bet // always true at a training table's Bet of 0
  if (hand.cards.length === 2 && affordable) allowed.push('double')
  if (isPair(hand.cards) && round.hands.length < MAX_HANDS && affordable) allowed.push('split')
  return allowed
}

function activeSituation(table) {
  const { round } = table
  return { cards: round.hands[round.active].cards, upcard: round.dealer[0], allowed: round.allowed }
}
```

In `derive`, change `allowedActions(s)` to `allowedActions(s, s)`. The `deal` handler still calls `draw(s)` and `settle(s)` unchanged, because `s` is Play's table.

- [ ] **Step 3: Run the suite to verify no behaviour changed**

Run: `npm test 2>&1 | grep -E '✖|ℹ (pass|fail)'`
Expected: `ℹ pass 84` and `ℹ fail 0`

- [ ] **Step 4: Commit**

```bash
git add app/engine.js
git commit -m "Engine: Round functions act on a table; resolve and payout split

No behaviour change (84 tests unchanged). Prepares training hands."
```

---

### Task 2: Training hands in the engine

**Files:**
- Modify: `app/engine.js` (the `newLab` options, `freshProgress`, `restore`, `snapshot`, and the `startDrill`/`answer`/`next`/`resetStats` handlers; drill `derive`; new helpers)
- Modify: `test/engine.test.js` (add `handTotal` to the import; new tests; rewrite the one-decision drill tests)

**Interfaces:**
- Consumes (Task 1): `draw`, `ACTIONS`, `advance`, `resolveRound`, `allowedActions(s, table)`, `activeSituation(table)`
- Produces:
  - `newLab(saved, { rng, cards = [], trainingCards = [] })`. `trainingCards` stacks the first Training Shoe (ranks in draw order).
  - `drill.slots[mode] = { round, shoe, feedback }`
  - Derived state: `drill.round`, `drill.feedback`, `drill.situation` (`{ cards, upcard, allowed, cell }` while deciding, otherwise null) and `drill.empty`
  - Events:
    - `answer(action)` grades, applies the action, and resolves the hand when every Hand is done.
    - `next` clears the feedback mid-hand, or deals a new hand once the hand is over.
  - Snapshot field `openHand: { dealer, hands: [{ cards, fromSplit, splitAces, done }], active } | null`. Legacy `openSituation` is still read.

- [ ] **Step 1: Write the failing tests**

In `test/engine.test.js`, change the engine import to:

```js
import { newLab, step, snapshot, bookAction, handTotal, CHART_ROWS, UPCARDS, STARTING_CHIPS } from '../app/engine.js'
```

Delete these tests and replace them with the code below:
- `the Mistakes drill deals only Pending cells and empties once they are fixed`
- `the Weighted drill skips trivial rows, triples Close calls, and deals ~15% multi-card`
- `an open Weighted-drill Situation is saved, so a reload cannot skip it`
- `answered and Mistakes-drill Situations are not saved`
- `a saved open Situation must really belong to its cell`

Then append:

```js
// ---------------------------------------------------------------- Training hands

// A training table set up exactly: a save with an open hand, and a stacked Training Shoe for what follows.
const handSave = (dealer, cards, extra = {}) =>
  saved({
    openHand: { dealer: dealer.map(c), hands: [{ cards: cards.map(c), fromSplit: false, splitAces: false, done: false }], active: 0 },
    ...extra,
  })
const trainLab = (dealer, cards, draws = [], extra = {}) =>
  newLab(handSave(dealer, cards, extra), { rng: seeded(), trainingCards: draws })

// Answers every Decision of the current Training hand by the Book, then deals the next hand.
function playOutByTheBook(s) {
  for (;;) {
    s = step(s, right(s))
    const over = s.drill.round.phase === 'settled'
    s = step(s, next)
    if (over) return s
  }
}

test('a correct Hit keeps the training hand going with a new Decision', () => {
  // Hard 12 vs 2: the Book hits. The 3 makes hard 15 vs 2.
  let s = run(trainLab(['2', '9'], ['10', '2'], ['3']), startDrill('weighted'), answer('hit'))
  assert.equal(s.drill.feedback.correct, true)
  assert.equal(s.drill.round.phase, 'player')
  assert.deepEqual(s.drill.round.hands[0].cards.map((x) => x.rank), ['10', '2', '3'])
  s = step(s, next)
  assert.equal(s.drill.feedback, null)
  assert.equal(s.drill.situation.cell, 'H15-2')
})

test('standing ends the hand: the dealer plays and results resolve without touching Chips', () => {
  // Hard 16 vs 5 stands; dealer 5,10 = 15 draws a 10 and Busts.
  const before = trainLab(['5', '10'], ['10', '6'], ['10'])
  const s = run(before, startDrill('weighted'), answer('stand'))
  assert.equal(s.drill.feedback.correct, true)
  assert.equal(s.drill.round.phase, 'settled')
  assert.equal(s.drill.round.hands[0].result, 'win')
  assert.deepEqual(s.drill.round.dealer.map((x) => x.rank), ['5', '10', '10'])
  assert.deepEqual([s.bankroll, s.lastBet, s.pendingBet], [before.bankroll, before.lastBet, before.pendingBet])
  assert.deepEqual(s.stats.play, before.stats.play)
})

test('a Mistake mid-hand is recorded and the hand goes on with the move actually made', () => {
  // Hard 13 vs 2: the Book stands. Hitting is a Mistake; the 2 makes 15 and the hand goes on.
  const s = run(trainLab(['2', '9'], ['10', '3'], ['2']), startDrill('weighted'), answer('hit'))
  assert.deepEqual([s.drill.feedback.correct, s.drill.feedback.book], [false, 'stand'])
  assert.deepEqual([s.stats.mistakes[0].cell, s.stats.mistakes[0].source], ['H13-2', 'weighted'])
  assert.equal(s.drill.round.phase, 'player')
  assert.equal(handTotal(s.drill.round.hands[0].cards).total, 15)
})

test('every Decision of a Weighted hand counts toward the Streak', () => {
  // Hard 12 vs 2: hit (right); the 3 makes 15 vs 2: stand (right). The dealer's 11 draws a 10.
  const s = run(trainLab(['2', '9'], ['10', '2'], ['3', '10']), startDrill('weighted'), answer('hit'), next, answer('stand'))
  assert.equal(s.streak, 2)
  assert.equal(s.drill.round.phase, 'settled')
})

test('a Split in Train plays both Hands, each Decision graded', () => {
  // 8,8 vs 6: split. First Hand 8,3 = 11 vs 6: double (one card). Second Hand 8,10 = 18: stand. Dealer 16 draws 5.
  let s = run(trainLab(['6', '10'], ['8', '8'], ['3', '10', '9', '5']), startDrill('weighted'), answer('split'))
  assert.equal(s.drill.round.hands.length, 2)
  s = run(s, next, answer('double'))
  assert.equal(s.drill.round.hands[0].cards.length, 3)
  s = run(s, next, answer('stand'))
  assert.equal(s.drill.round.phase, 'settled')
  assert.equal(s.streak, 3)
  assert.equal(s.stats.cells['P8-6'].correct, 1)
})

test('training hands never start with a dealer Blackjack', () => {
  // A legacy open Situation (hard 16 vs ace) restarts as a hand; the King that would make Blackjack is set aside.
  const start = { cards: [c('10'), c('6')], upcard: c('A'), allowed: ['hit', 'stand', 'double'], cell: 'H16-A' }
  const s = run(newLab(saved({ openSituation: start }), { rng: seeded(), trainingCards: ['K', '5'] }), startDrill('weighted'))
  assert.deepEqual(s.drill.round.dealer.map((x) => x.rank), ['A', '5'])
  assert.equal(s.drill.situation.cell, 'H16-A')
})

test('next needs an answer mid-hand, and deals a new hand once the hand is over', () => {
  assert.throws(() => step(run(trainLab(['2', '9'], ['10', '2'], ['3']), startDrill('weighted')), next), /answer/)
  const over = run(trainLab(['10', '8'], ['10', '6']), startDrill('weighted'), answer('stand'))
  const fresh = step(over, next)
  assert.equal(fresh.drill.round.phase, 'player')
  assert.equal(fresh.drill.feedback, null)
  assert.notDeepEqual(fresh.drill.round.dealer, over.drill.round.dealer)
})

test('Mistakes-drill hands start from Pending cells and the drill empties once they are fixed', () => {
  const pending = ['H16-10', 'S18-2']
  const history = pendingHistory({
    'H16-10': { total: 1, correct: 0, pending: 2 },
    'S18-2': { total: 3, correct: 2, pending: 1 },
    'P9-7': { total: 4, correct: 3, pending: 0 },
  })
  let s = run(lab([], history), startDrill('mistakes'))
  let starts = 0
  while (!s.drill.empty) {
    assert.ok(pending.includes(s.drill.situation.cell), `hand started in ${s.drill.situation.cell}`)
    s = playOutByTheBook(s)
    starts++
    assert.ok(starts <= 3, 'more starts than fixes needed')
  }
  assert.equal(s.drill.round, null)
})

test('an open Weighted hand is saved, so a reload brings back the same Decision', () => {
  const s = run(trainLab(['2', '9'], ['10', '2'], ['3']), startDrill('weighted'), answer('hit'), next)
  const snap = snapshot(s)
  assert.deepEqual(snap.openHand.hands[0].cards.map((x) => x.rank), ['10', '2', '3'])
  const back = step(newLab(snap, { rng: seeded(9) }), startDrill('weighted'))
  assert.deepEqual(back.drill.situation, s.drill.situation)
  assert.deepEqual(back.drill.round.dealer, s.drill.round.dealer)
})

test('finished and Mistakes-drill hands are not saved', () => {
  const over = run(trainLab(['10', '8'], ['10', '6']), startDrill('weighted'), answer('stand'))
  assert.equal(snapshot(over).openHand, null)
  const history = pendingHistory({ 'H16-10': { total: 1, correct: 0, pending: 2 } })
  assert.equal(snapshot(run(lab([], history), startDrill('mistakes'))).openHand, null)
})

test('a malformed open hand or a forged legacy Situation is rejected', () => {
  assert.throws(() => lab([], saved({ openHand: { dealer: [c('10')], hands: [], active: 0 } })), /open hand/)
  const forged = { cards: [c('10'), c('6')], upcard: c('A'), allowed: ['hit', 'stand', 'double'], cell: 'H8-2' }
  assert.throws(() => lab([], saved({ openSituation: forged })), /situation/)
})

test('Weighted hand starts skip trivial rows, triple Close calls, and are ~15% multi-card', () => {
  const close = closeCalls()
  const counts = new Map()
  let nonPair = 0
  let twoCard = 0
  let s = run(lab(), startDrill('weighted'))
  for (let i = 0; i < 6000; i++) {
    const sit = s.drill.situation
    assert.equal(bookAction(sit).cell, sit.cell, 'realised cards land in their cell')
    assert.doesNotMatch(sit.cell, /^(H8|H17|S19|S20)-/)
    counts.set(sit.cell, (counts.get(sit.cell) ?? 0) + 1)
    if (sit.cell.startsWith('P')) {
      assert.deepEqual(sit.allowed, ['hit', 'stand', 'double', 'split'])
    } else {
      nonPair++
      if (sit.cards.length === 2) {
        twoCard++
        assert.deepEqual(sit.allowed, ['hit', 'stand', 'double'])
      } else {
        assert.deepEqual(sit.allowed, ['hit', 'stand'])
      }
    }
    s = run(s, answer('stand'), next) // end the hand at once; next deals the next start
  }
  const candidates = EXPECTED_CHART.filter(([row]) => !/^(H8|H17|S19|S20)$/.test(row))
    .flatMap(([row]) => UPCARDS.map((up) => `${row}-${up}`))
  const mean = (cells) => cells.reduce((n, cell) => n + (counts.get(cell) ?? 0), 0) / cells.length
  const ratio = mean(candidates.filter((x) => close.has(x))) / mean(candidates.filter((x) => !close.has(x)))
  assert.ok(ratio > 2.5 && ratio < 3.5, `close-call ratio ${ratio}`)
  const share = twoCard / nonPair
  assert.ok(share > 0.82 && share < 0.88, `two-card share ${share}`)
})
```

These helpers are already in the test file and are used above: `seeded`, `lab`, `run`, `saved`, `pendingHistory`, `c`, `right`, `wrong`, `answer`, `next`, `startDrill`, `closeCalls`, `EXPECTED_CHART`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | grep -E '✖|ℹ (pass|fail)'`
Expected: the new Training-hand tests FAIL, for example `Cannot read properties of undefined (reading 'phase')` or `Invalid event` from the old `answer`. All Play tests still pass.

- [ ] **Step 3: Implement training hands**

In `app/engine.js`:

(a) Change the `newLab` signature and body:

```js
export function newLab(saved, { rng, cards = [], trainingCards = [] } = {}) {
  if (typeof rng !== 'function') throw new Error('newLab: rng function required')
  const { openHand, openStart, ...progress } = saved == null ? freshProgress() : restore(saved)
  // Same rule as Settlement: a Bankroll that can't cover the minimum is Refilled, never left stuck.
  if (progress.bankroll < MIN_BET) progress.bankroll = progress.startingChips
  const s = {
    ...progress,
    rng,
    shoe: newShoe(rng, cards),
    pendingBet: 0,
    round: null,
    drill: null,
    trainingCards, // stacks the first Training Shoe (tests); consumed by newTrainingSlot
    coachFlag: null,
    refilled: false,
    streakEnded: null,
  }
  // An unfinished Weighted hand comes back after a reload, just as it does after a mode switch.
  if (openHand || openStart) {
    const slot = newTrainingSlot(s)
    slot.round = openHand ? resumedRound(openHand) : trainingRound(slot, openStart)
    s.drill = { mode: 'weighted', slots: { weighted: slot } }
  }
  s.pendingBet = prefillBet(s)
  return derive(s)
}
```

(b) In `freshProgress`, replace `openSituation: null,` with `openHand: null,` and `openStart: null,`.

(c) In `restore`, replace the two `openSituation` lines and the `openSituation:` return field. Before the `return {`:

```js
  const openHand = saved.openHand ?? null
  if (openHand !== null && !isResumableHand(openHand)) fail(`open hand ${JSON.stringify(openHand)}`)
  // The first deployed build saved an open Situation instead; it restarts as a hand from that Situation.
  const legacy = saved.openSituation ?? null
  if (legacy !== null && !isRealSituation(legacy)) fail(`open situation ${JSON.stringify(legacy)}`)
```

Change the return fields to:

```js
    openHand: structuredClone(openHand),
    openStart: legacy && { cards: structuredClone(legacy.cards), upcard: structuredClone(legacy.upcard) },
```

(d) Add a module-level `isCard`, use it in `isRealSituation` (drop its local copy), and add `isResumableHand` and `resumedRound`:

```js
function isCard(card) {
  return RANKS.includes(card?.rank) && SUITS.includes(card?.suit)
}

// A saved unfinished hand: real cards, the dealer's two, 1–4 Hands, and an active Hand still to play.
function isResumableHand(hand) {
  const isHand = (h) =>
    Array.isArray(h?.cards) &&
    h.cards.length >= 2 &&
    h.cards.every(isCard) &&
    [h.fromSplit, h.splitAces, h.done].every((flag) => typeof flag === 'boolean')
  const { dealer, hands, active } = hand ?? {}
  return (
    Array.isArray(dealer) &&
    dealer.length === 2 &&
    dealer.every(isCard) &&
    Array.isArray(hands) &&
    hands.length >= 1 &&
    hands.length <= MAX_HANDS &&
    hands.every(isHand) &&
    Number.isInteger(active) &&
    active >= 0 &&
    active < hands.length &&
    !hands[active].done &&
    handTotal(hands[active].cards).total < 21
  )
}

function resumedRound({ dealer, hands, active }) {
  return {
    phase: 'player',
    dealer,
    hands: hands.map((hand) => ({ ...hand, bet: 0 })),
    active,
    bet: 0,
    hinted: false,
    net: 0,
    allowed: [],
  }
}
```

(e) In `snapshot`, replace `openSituation: openWeightedSituation(state),` with `openHand: openWeightedHand(state),`. Replace `function openWeightedSituation` with:

```js
// The Weighted hand still in play (a reload must not skip its Decision). The Training Shoe is not saved.
function openWeightedHand(state) {
  const round = state.drill?.slots.weighted?.round
  if (round?.phase !== 'player') return null
  const hands = round.hands.map(({ cards, fromSplit, splitAces, done }) => ({ cards, fromSplit, splitAces, done }))
  return { dealer: round.dealer, hands, active: round.active }
}
```

(f) Replace the `resetStats`, `startDrill`, `answer` and `next` handlers with:

```js
  resetStats(s) {
    s.stats = emptyStats()
    const mistakes = s.drill?.slots.mistakes
    if (mistakes) dealTrainingHand(s, mistakes, 'mistakes')
  },

  startDrill(s, { mode }) {
    if (!DRILL_MODES.includes(mode)) invalid(`no ${mode} drill`)
    s.drill ??= { mode, slots: {} }
    s.drill.mode = mode
    const slot = (s.drill.slots[mode] ??= newTrainingSlot(s))
    // An unfinished hand is kept, so switching modes can't skip a Decision; an empty slot deals.
    if (!slot.round) dealTrainingHand(s, slot, mode)
  },

  answer(s, { action }) {
    const slot = s.drill?.slots[s.drill.mode]
    const round = slot?.round
    if (round?.phase !== 'player') invalid('no Decision to answer')
    if (slot.feedback) invalid('Decision already answered')
    if (!round.allowed.includes(action)) invalid(`${action} is not allowed in this Situation`)
    const { mode } = s.drill
    const { correct, book } = recordDecision(s, activeSituation(slot), action, mode)
    slot.feedback = { correct, chosen: action, book: book.action, rule: book.rule }
    if (mode === 'weighted') updateStreak(s, correct)
    // Right or wrong, the hand goes on with the move actually made.
    ACTIONS[action](s, slot, round.hands[round.active])
    if (advance(slot)) resolveRound(slot, s.rng)
  },

  next(s) {
    const slot = s.drill?.slots[s.drill.mode]
    if (slot?.round?.phase === 'settled') {
      dealTrainingHand(s, slot, s.drill.mode)
      return
    }
    if (!slot?.feedback) invalid('answer the Decision before next')
    slot.feedback = null
  },
```

(g) In the Drills section, replace `function dealSituation` with:

```js
// Each drill mode has its own training table. Tests stack the first Training Shoe; later ones are plain shuffles.
function newTrainingSlot(s) {
  const slot = { round: null, shoe: newShoe(s.rng, s.trainingCards), feedback: null }
  s.trainingCards = []
  return slot
}

// A new Training hand in the slot: the Weighted pick (or a Pending cell) gives the start, the Training Shoe the rest.
function dealTrainingHand(s, slot, mode) {
  slot.feedback = null
  const cell = mode === 'weighted' ? pickWeighted(s.rng) : pickPending(s)
  slot.round = cell ? trainingRound(slot, realise(cell, s.rng)) : null
}

// A Bet-0 Round from a start. The Book assumes the dealer has already peeked, so a hole card that would make a
// dealer Blackjack is set aside for the next card.
function trainingRound(table, { cards, upcard }) {
  let hole = draw(table)
  while (handTotal([upcard, hole]).total === 21) hole = draw(table)
  return {
    phase: 'player',
    dealer: [upcard, hole],
    hands: [{ cards, bet: 0, fromSplit: false, splitAces: false, done: false }],
    active: 0,
    bet: 0,
    hinted: false,
    net: 0,
    allowed: [],
  }
}
```

(h) In `derive`, replace the `if (s.drill) { ... }` block with:

```js
  if (s.drill) {
    for (const slot of Object.values(s.drill.slots)) {
      if (slot.round) slot.round.allowed = slot.round.phase === 'player' ? allowedActions(s, slot) : []
    }
    const slot = s.drill.slots[s.drill.mode]
    const round = slot?.round ?? null
    s.drill.round = round
    s.drill.feedback = slot?.feedback ?? null
    s.drill.situation = null
    if (round?.phase === 'player') {
      const situation = activeSituation(slot)
      s.drill.situation = { ...situation, cell: bookAction(situation).cell }
    }
    s.drill.empty = s.drill.mode === 'mistakes' && round === null
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test 2>&1 | grep -E '✖|ℹ (pass|fail)'`
Expected: `ℹ fail 0`. The count goes from 84 to 84 − 5 (replaced) + 12 (new) = 91.

- [ ] **Step 5: Commit**

```bash
git add app/engine.js test/engine.test.js
git commit -m "Train plays the hand out: training hands in the engine

Each Drill is a Bet-0 Round on its own Training Shoe from a weighted (or
Pending) start; answer grades and applies the move, the dealer plays out
and the hand resolves without touching Chips; next continues or deals.
Save writes the open Weighted hand (openHand); legacy openSituation saves
restart as a hand. Test-first."
```

---

### Task 3: The Train screen plays the hand out

**Files:**
- Modify: `app/app.js` (`trainScreen`, new `trainDealerHtml`/`trainHandHtml`/`trainMessage`, `react`, `scheduleAdvance`, and the `ui` fields)
- Test: browser QA scripts in the session scratchpad (`qa-train-hands.mjs`, plus the existing `qa-stable.mjs` pattern)

**Interfaces:**
- Consumes (Task 2): `state.drill.round` (`phase`, `dealer`, `hands[].cards/result`, `active`, `allowed`), `state.drill.feedback`, `state.drill.empty`, and the events `answer`/`next`/`startDrill`
- Produces: none (shell only)

- [ ] **Step 1: Add the timing constant and ui token**

In `app/app.js`, below `const AUTO_ADVANCE_MS = 600`:

```js
const HAND_RESULT_MS = 1200 // a finished training hand stays on screen this long before the next deals
```

In the `ui` object, add `advanceToken: 0, // invalidates a pending auto-advance when anything else happens first`.

- [ ] **Step 2: Replace `trainScreen` and add the table helpers**

Replace everything in `trainScreen` after the `if (drill.empty) { ... }` block with:

```js
  const { round, feedback } = drill
  const locked = Boolean(feedback) || round.phase === 'settled'
  const needsNext = Boolean(feedback && !feedback.correct)
  const controls = `
    <div class="panel acting${needsNext ? ' off' : ''}">${actionButtons('answer', locked ? [] : round.allowed)}</div>
    <div class="panel next${needsNext ? '' : ' off'}">
      <button class="primary wide" data-do="next" data-k="next" ${needsNext ? '' : 'disabled'}>${t('next')}<kbd>↵</kbd></button>
    </div>`
  return `${header}
    <section class="table">
      ${trainDealerHtml(round)}
      ${trainMessage(round, feedback)}
      <div class="hands${round.hands.length > 2 ? ' many' : ''}">${round.hands.map((hand, i) => trainHandHtml(round, hand, i)).join('')}</div>
    </section>
    <footer class="controls">${controls}<p class="keys muted small">${t('keysTrain')}</p></footer>`
}

// The training table: the hole card stays face down while you decide and turns over when your hand is done.
function trainDealerHtml(round) {
  const key = (i) => `t${ui.situationSerial}-d${i}`
  const cards =
    round.phase === 'player'
      ? [cardFace(round.dealer[0], key(0), ui.drillSeen), cardBack(key('back'), ui.drillSeen)]
      : round.dealer.map((card, i) => cardFace(card, key(i), ui.drillSeen, i === 1 ? 'flip' : 'enter'))
  const total = round.phase === 'settled' ? ` · <strong>${totalLabel(round.dealer)}</strong>` : ''
  return `<div class="dealer"><div class="label">${t('dealer')}${total}</div><div class="cards">${cards.join('')}</div></div>`
}

function trainHandHtml(round, hand, i) {
  const active = round.phase === 'player' && i === round.active
  const cards = hand.cards.map((card, j) => cardFace(card, `t${ui.situationSerial}-h${i}-${j}`, ui.drillSeen))
  const result = round.phase === 'settled' ? ` <span class="badge ${hand.result}">${t(`result.${hand.result}`)}</span>` : ''
  return `<div class="hand${active ? ' active' : ''}">
    <div class="cards">${cards.join('')}</div>
    <div class="meta"><strong>${totalLabel(hand.cards)}</strong>${result}</div>
  </div>`
}

// The fixed felt slot: the last Decision's feedback (plus the result once the hand is over), else the prompt.
function trainMessage(round, feedback) {
  const result = round.phase === 'settled' ? ` · ${round.hands.map((hand) => t(`result.${hand.result}`)).join(' · ')}` : ''
  if (feedback?.correct) return feltMessage('good', `✓ ${t('correct')}${result}`, t(`rule.${feedback.rule}`))
  if (feedback) return feltMessage('bad', `✗ ${t('coachMistake', { action: actionName(feedback.book) })}${result}`, t(`rule.${feedback.rule}`))
  return feltMessage('', t('feltTrain'), t('feltTrainSub'))
}
```

Delete the old single-Situation rendering (`const { situation, feedback } = drill`, `const up = ...`, `const cards = ...`, the old `message`, `needsNext` and `controls`, and the old `return`).

- [ ] **Step 3: Serial per hand, and pacing that knows the hand is over**

In `react(prev, event)`, replace the block that compares `JSON.stringify(prev.drill?.situation)` with:

```js
  // New cards animate in once per training hand (not on every Decision): a new serial means a new hand.
  const prevRound = prev.drill?.round
  const round = state.drill?.round
  const newHand =
    prev.drill?.mode !== state.drill?.mode ||
    (round && (!prevRound || (prevRound.phase === 'settled' && round.phase === 'player')))
  if (newHand) {
    ui.situationSerial++
    ui.drillSeen.clear()
  }
  if (event.type === 'answer' && round?.phase === 'settled') {
    announce(round.hands.map((hand) => t(`result.${hand.result}`)).join(' · '))
  }
```

Replace `scheduleAdvance` with:

```js
function scheduleAdvance() {
  clearTimeout(advanceTimer)
  const token = ++ui.advanceToken
  // Mid-hand the next Decision comes quickly; once the hand is over, leave time to read the result.
  const delay = state.drill.round?.phase === 'settled' ? HAND_RESULT_MS : AUTO_ADVANCE_MS
  advanceTimer = setTimeout(() => {
    if (ui.advanceToken === token && state.drill?.feedback?.correct) dispatch({ type: 'next' })
  }, delay)
}
```

- [ ] **Step 4: Run the unit tests (the shell must not break the engine suite)**

Run: `node --check app/app.js && npm test 2>&1 | grep -E 'ℹ (pass|fail)'`
Expected: `ℹ pass 91`, `ℹ fail 0`

- [ ] **Step 5: Browser QA: a training hand plays out**

With `npm run dev` running, create `qa-train-hands.mjs` in the scratchpad QA folder (it uses the existing `cdp.mjs` driver):

```js
import { launch, sleep } from './cdp.mjs'
const book = `(async () => {
  const { bookAction } = await import('/engine.js')
  const hand = [...document.querySelectorAll('.hand.active .card .rank')].map((e) => e.textContent)
  const up = document.querySelector('.dealer .card .rank').textContent
  const allowed = [...document.querySelectorAll('[data-do=answer]:not([disabled])')].map((b) => b.dataset.action)
  return bookAction({ cards: hand.map((rank) => ({ rank })), upcard: { rank: up }, allowed }).action
})()`
const b = await launch({ port: 9370, realSdk: true })
try {
  await b.viewport(1280, 800, true, true)
  await b.goto('http://localhost:8765/?name=Z', 300)
  await b.eval('localStorage.clear()')
  await b.goto('http://localhost:8765/?name=Z', 800)
  await b.click('[data-k=tab-train]', 400)
  let decisions = 0
  let hands = 0
  let sawContinue = false
  for (let i = 0; i < 40 && hands < 4; i++) {
    const before = await b.eval(`document.querySelectorAll('.hand .card').length`)
    const action = await b.eval(book)
    await b.click(`[data-k=answer-${action}]`, 100)
    decisions++
    const over = await b.eval(`!!document.querySelector('.badge')`)
    if (!over && action === 'hit') sawContinue ||= (await b.eval(`document.querySelectorAll('.hand .card').length`)) > before
    await sleep(over ? 1500 : 800)
    if (over) hands++
  }
  console.log({ decisions, hands, sawContinue, streak: await b.text('.bar .stat strong') })
  console.log('errors:', b.errors)
} finally {
  b.close()
}
```

Run: `node qa-train-hands.mjs`
Expected: `hands` ≥ 1, `decisions` ≥ `hands` (continuations happened), `sawContinue: true` whenever a Hit was made mid-hand, and `errors: []`.

- [ ] **Step 6: Browser QA: layout stability on Train**

Create `qa-train-stable.mjs` next to the other QA scripts:

```js
import { launch, sleep } from './cdp.mjs'
const rects = `(() => {
  const r = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b ? [Math.round(b.top), Math.round(b.height)] : null }
  return JSON.stringify({ table: r('.table'), felt: r('.felt-print'), controls: r('.controls') })
})()`
const allowedNow = `[...document.querySelectorAll('[data-do=answer]:not([disabled])')].map((b) => b.dataset.action)`
async function measure(width, height, desktop, port) {
  const b = await launch({ port, realSdk: true })
  try {
    await b.viewport(width, height, true, desktop)
    await b.goto('http://localhost:8765/?name=Z', 300)
    await b.eval('localStorage.clear()')
    await b.goto('http://localhost:8765/?name=Z', 800)
    await b.click('[data-k=tab-train]', 400)
    const seen = new Set([await b.eval(rects)])
    for (let i = 0; i < 20; i++) {
      const allowed = await b.eval(allowedNow)
      if (allowed.length) await b.click(`[data-k=answer-${allowed[i % allowed.length]}]`, 150) // right and wrong mixed
      seen.add(await b.eval(rects))
      if (await b.eval(`!!document.querySelector('[data-k=next]:not([disabled])')`)) await b.click('[data-k=next]', 150)
      else await sleep(1400)
      seen.add(await b.eval(rects))
    }
    console.log(`${width}x${height}: ${seen.size} distinct layout(s)`, [...seen][0])
    console.log('errors:', b.errors)
  } finally {
    b.close()
  }
}
await measure(1920, 1080, true, 9371)
await measure(390, 844, false, 9372)
```

Run: `node qa-train-stable.mjs`
Expected: `1 distinct layout(s)` at each size, and `errors: []`.

- [ ] **Step 7: Commit**

```bash
git add app/app.js
git commit -m "Train screen plays the hand out

The training table shows the dealer (hole card down until your hand is
done), your Hand(s) with the active one outlined, per-Hand results, and
the felt slot carries feedback plus the result. Correct Decisions move on
in 0.6 s, a finished hand shows 1.2 s, Mistakes wait for Next. Cards
animate once per hand; layout measured stable."
```

---

### Task 4: Docs, full verification

**Files:**
- Modify: `.scratch/blackjack-lab/spec.md` (point the Train section at the new spec)
- Modify: `.scratch/train-full-hands/spec.md` (`Status: done`)

- [ ] **Step 1: Update the v1 spec's Train section**

In `.scratch/blackjack-lab/spec.md`, directly under the `- **Weighted drill:**` bullet, add the line:

```markdown
  - Since sub-project 3, every Drill plays a whole Training hand from this start: see `.scratch/train-full-hands/spec.md`.
```

In `.scratch/train-full-hands/spec.md`, change `Status: ready-for-agent` to `Status: done`.

- [ ] **Step 2: Full verification**

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ fail 0`

Run the Play regression QA scripts (`qa-stable.mjs`, `qa-auto2.mjs`, `qa-bankroll.mjs`).
Expected: unchanged results, `errors: []`

- [ ] **Step 3: Commit**

```bash
git add .scratch/blackjack-lab/spec.md .scratch/train-full-hands/spec.md
git commit -m "Docs: Train plays the hand out is done"
```

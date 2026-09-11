# Card Counting in Train Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Train gains two Hi-Lo counting drills. Values is a 30-second sprint of Count values. Count deals real rounds played by the Book, with a Count check every 1–4 rounds that asks the Running count, the True count and the Bet. Counting progress is shown in Improve.

**Architecture:** The pure engine (`app/engine.js`) owns every counting rule, as it owns every other rule.
- New events: `sprintStart`, `sprintAnswer`, `sprintEnd`, `countNext`, `countAnswer` and `countSpeed`.
- Each counting drill's state lives in `state.drill.values` or `state.drill.count`.
- One `countNext` deals a whole Count round and auto-plays it with the sub-project 3 table functions (`draw`, `ACTIONS`, `advance`, `resolveRound`).
- The shell (`app/app.js`) owns the clocks: the 30-second sprint, the card-by-card reveal and the auto-advance.

**Tech Stack:** Vanilla ES modules, no build and no dependencies. `node --test`. Browser QA uses the headless-Chromium CDP harness in the session scratchpad (`qa/cdp.mjs`) against `npm run dev` on port 8765.

**Spec:** `.scratch/card-counting/spec.md`. Glossary: `CONTEXT.md`, Counting section.

## Global Constraints

- The engine stays pure: no DOM, no Usion, no clock. Every rule is tested through `step()`, `newLab()` and `snapshot()` only. `engine.js` is the only test seam.
- `step()` never mutates its input and throws `Invalid event: …` on any event the state doesn't allow.
- Counting never changes the Bankroll, `stats.play`, `lastBet`, the Streak, the Best streak, `stats.cells` or `stats.mistakes`.
- The snapshot stays `v: 1`. The new fields are `sprintBest`, `countSpeed` and `stats.counting`. A save without them loads with defaults; a malformed one is rejected.
- Every new string exists in both `en` and `mn` with the same `{placeholders}`, which `test/strings.test.js` enforces.
- Layout stability: within a Train mode, `.table`, `.felt-print` and `.controls` never move between phases at 1920×1080 or 390×844.
- Key hints (`kbd`, `.keys`) show only with Hint on and on a keyboard/mouse device. That's the existing CSS rule, and no new rule is needed.
- No new app files: `scripts/deploy-pages.sh` copies `index.html`, `app.js`, `engine.js`, `strings.js` and `style.css`.
- Commits end with the session's attribution lines, and all work happens on branch `card-counting`, not `master`.
- Constants from the spec:
  - sprint: 30 s;
  - pause after a miss: 0.6 s;
  - speeds: Slow 1.0 s, Normal 0.6 s, Fast 0.35 s per card;
  - pause after a round: 2 card intervals;
  - check gap: 1–4 rounds;
  - Bet ramp: TC − 1, clamped 1–8;
  - half deck: 26 cards, rounded to nearest with halves up;
  - True count: truncated toward zero.

## File Structure

| File | Change |
|---|---|
| `app/engine.js` | Count values, Train modes, Values drill, Count drill, counting persistence, `endsAtDeal`, `freeRound` and `trainingShoe` helpers |
| `test/counting.test.js` | **New**: every counting engine test |
| `app/app.js` | Four Train tabs, header stats, Values screen, Count screen (reveal, Discard tray, stepper, Bet buttons, speed), keys, Improve Counting block |
| `app/style.css` | Two-row Train header on phones, Values card, Discard tray, stepper, Bet row, speed switch |
| `app/strings.js` | New `en` and `mn` strings |
| `.scratch/blackjack-lab/spec.md`, `.scratch/card-counting/spec.md`, `README.md` | Docs (Task 5) |

## Task 0: Branch

- [ ] **Step 1:** create the branch from `master`.

```bash
cd /opt/projects/blackjack && git checkout -b card-counting && git status --short
```

Expected: `Switched to a new branch 'card-counting'` and a clean tree.

---

### Task 1: Engine — Train modes, the Values drill, counting progress

**Files:**
- Modify: `app/engine.js`
- Create: `test/counting.test.js`

**Interfaces:**
- Produces:
  - `export const TRAIN_MODES = [...DRILL_MODES, 'values']` (Task 2 appends `'count'`) and `export const COUNT_SPEEDS = ['slow', 'normal', 'fast']`.
  - Events:
    - `{ type: 'startDrill', mode: 'values' }`;
    - `{ type: 'sprintStart' }`;
    - `{ type: 'sprintAnswer', countValue: 1 | 0 | -1 }`;
    - `{ type: 'sprintEnd' }`.
  - State:
    - `state.drill.values = { phase: 'ready'|'running'|'over', card, score, misses, miss: null | { card, value }, result: null | { score, misses, isNewBest } }`;
    - `state.sprintBest`;
    - `state.countSpeed`;
    - `state.stats.counting = { values, runningCount, trueCount, bet }`, each tally `{ correct, total }`.
  - Internal helpers used by Task 2: `countValue(rank)`, `tally(counter, correct)` and `trainingShoe(s)`.

- [ ] **Step 1: Write the failing tests**

Create `test/counting.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newLab, step, snapshot } from '../app/engine.js'

// mulberry32, as in engine.test.js: reproducible shuffles and Count-check gaps.
function seeded(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const run = (state, ...events) => events.reduce(step, state)
const startDrill = (mode) => ({ type: 'startDrill', mode })
const sprintStart = { type: 'sprintStart' }
const sprintAnswer = (countValue) => ({ type: 'sprintAnswer', countValue })
const sprintEnd = { type: 'sprintEnd' }
const resetStats = { type: 'resetStats' }

// The test's own Hi-Lo table, independent of the engine's.
const HI_LO = { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0, 9: 0, 10: -1, J: -1, Q: -1, K: -1, A: -1 }

// `draws` stacks the first Shoe created in Train: here the Values or the Count Shoe.
const trainLab = (draws = [], saved = null) => newLab(saved, { rng: seeded(), trainingCards: draws })

// A valid save from before counting existed.
const saved = (overrides = {}) => ({
  v: 1,
  bankroll: 1000,
  lastBet: 10,
  hint: false,
  streak: 0,
  bestStreak: 0,
  stats: { cells: {}, mistakes: [], play: { hands: 0, wins: 0, losses: 0, pushes: 0, net: 0 } },
  ...overrides,
})

// ---------------------------------------------------------------- Values drill

test('Values drill: every rank has its Hi-Lo Count value', () => {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
  let s = run(trainLab(ranks), startDrill('values'), sprintStart)
  for (const rank of ranks) {
    assert.equal(s.drill.values.card.rank, rank)
    s = step(s, sprintAnswer(HI_LO[rank]))
  }
  assert.equal(s.drill.values.score, 13)
  assert.equal(s.drill.values.misses, 0)
  assert.deepEqual(s.stats.counting.values, { correct: 13, total: 13 })
})

test('Values drill: a wrong answer is a miss that shows the right value, and the next card follows', () => {
  const s = run(trainLab(['K', '5']), startDrill('values'), sprintStart, sprintAnswer(1))
  assert.equal(s.drill.values.misses, 1)
  assert.equal(s.drill.values.score, 0)
  assert.equal(s.drill.values.miss.card.rank, 'K')
  assert.equal(s.drill.values.miss.value, -1)
  assert.equal(s.drill.values.card.rank, '5')
  assert.equal(step(s, sprintAnswer(1)).drill.values.miss, null) // a right answer clears it
})

test('Values drill: the sprint result and the Best sprint', () => {
  let s = run(trainLab(['2', '3', '7']), startDrill('values'), sprintStart)
  s = run(s, sprintAnswer(1), sprintAnswer(1), sprintAnswer(1), sprintEnd) // the 7 is 0, not +1
  assert.equal(s.drill.values.phase, 'over')
  assert.deepEqual(s.drill.values.result, { score: 2, misses: 1, isNewBest: true })
  assert.equal(s.sprintBest, 2)
  s = run(s, sprintStart, sprintAnswer(0), sprintEnd) // one card: at most 1 right
  assert.equal(s.drill.values.result.isNewBest, false)
  assert.equal(s.sprintBest, 2)
})

test('Values drill: invalid events', () => {
  const ready = run(trainLab(), startDrill('values'))
  assert.throws(() => step(ready, sprintAnswer(1)), /no sprint running/)
  assert.throws(() => step(ready, sprintEnd), /no sprint running/)
  const running = step(ready, sprintStart)
  assert.throws(() => step(running, sprintStart), /already running/)
  assert.throws(() => step(running, sprintAnswer(2)), /not a Count value/)
  assert.throws(() => step(run(trainLab(), startDrill('weighted')), sprintStart), /outside the Values drill/)
})

test('Values drill: switching Train tabs keeps the drill as it was', () => {
  const s = run(trainLab(['2', '3']), startDrill('values'), sprintStart, sprintAnswer(1))
  const back = run(s, startDrill('weighted'), startDrill('values'))
  assert.deepEqual(back.drill.values, s.drill.values)
})

// ---------------------------------------------------------------- counting progress

test('counting progress round-trips through a save', () => {
  const s = run(trainLab(['2', '3']), startDrill('values'), sprintStart, sprintAnswer(1), sprintAnswer(0), sprintEnd)
  const back = newLab(snapshot(s), { rng: seeded() })
  assert.equal(back.sprintBest, 1)
  assert.deepEqual(back.stats.counting.values, { correct: 1, total: 2 })
  const fast = newLab(saved({ countSpeed: 'fast' }), { rng: seeded() })
  assert.equal(fast.countSpeed, 'fast')
  assert.equal(snapshot(fast).countSpeed, 'fast')
})

test('a save from before counting loads with counting at zero', () => {
  const s = newLab(saved(), { rng: seeded() })
  assert.equal(s.sprintBest, 0)
  assert.equal(s.countSpeed, 'normal')
  for (const key of ['values', 'runningCount', 'trueCount', 'bet']) {
    assert.deepEqual(s.stats.counting[key], { correct: 0, total: 0 })
  }
})

test('malformed counting progress is rejected', () => {
  const load = (overrides) => () => newLab(saved(overrides), { rng: seeded() })
  const withCounting = (counting) => ({ stats: { ...saved().stats, counting } })
  const zero = { correct: 0, total: 0 }
  const counting = { values: zero, runningCount: zero, trueCount: zero, bet: zero }
  assert.throws(load({ sprintBest: -1 }), /sprintBest/)
  assert.throws(load({ sprintBest: 2.5 }), /sprintBest/)
  assert.throws(load({ countSpeed: 'warp' }), /countSpeed/)
  assert.throws(load(withCounting({ ...counting, bet: { correct: 3, total: 2 } })), /stats.counting.bet/)
  assert.throws(load(withCounting({ values: zero })), /stats.counting.runningCount/)
  assert.doesNotThrow(load(withCounting(counting)))
})

test('Reset stats clears counting accuracy but keeps the Best sprint', () => {
  const s = run(trainLab(['2']), startDrill('values'), sprintStart, sprintAnswer(1), sprintEnd, resetStats)
  assert.equal(s.sprintBest, 1)
  assert.deepEqual(s.stats.counting.values, { correct: 0, total: 0 })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/counting.test.js 2>&1 | grep -E '^(not ok|ok)' | head -20`
Expected: every test reports `not ok`. The Values tests fail with `Invalid event: no values drill`. The progress tests fail on `sprintBest` / `stats.counting` being `undefined`.

- [ ] **Step 3: Implement**

In `app/engine.js`:

(a) Replace the `DRILL_MODES` line (line 19) with:

```js
export const DRILL_MODES = ['weighted', 'mistakes'] // the Drills that play Training hands
export const TRAIN_MODES = [...DRILL_MODES, 'values']
export const COUNT_SPEEDS = ['slow', 'normal', 'fast']
const COUNTING_TALLIES = ['values', 'runningCount', 'trueCount', 'bet']
```

(b) Directly after `function isBlackjack(hand) { … }`, add:

```js
// Hi-Lo: a low card leaving the Shoe helps the player (+1), a ten or an ace leaving it hurts (−1).
function countValue(rank) {
  const points = value(rank)
  if (points <= 6) return 1
  if (points <= 9) return 0
  return -1
}
```

(c) In `newLab`, change the comment on `trainingCards` to `// stacks the first Shoe created in Train (tests); consumed by trainingShoe`.

(d) In `freshProgress()`, after `bestStreak: 0,` add:

```js
    sprintBest: 0,
    countSpeed: 'normal',
```

(e) Replace `emptyStats()` with:

```js
function emptyStats() {
  return { cells: {}, mistakes: [], play: { hands: 0, wins: 0, losses: 0, pushes: 0, net: 0 }, counting: emptyCounting() }
}

function emptyCounting() {
  return Object.fromEntries(COUNTING_TALLIES.map((key) => [key, { correct: 0, total: 0 }]))
}
```

(f) In `restore()`, after the line that fails on `stats.play`, add:

```js
  // Saves from before counting existed have none of these: counting starts at zero.
  const sprintBest = saved.sprintBest ?? 0
  if (!isCount(sprintBest)) fail(`sprintBest ${saved.sprintBest}`)
  const countSpeed = saved.countSpeed ?? 'normal'
  if (!COUNT_SPEEDS.includes(countSpeed)) fail(`countSpeed ${saved.countSpeed}`)
  const counting = stats.counting ?? emptyCounting()
  for (const key of COUNTING_TALLIES) {
    const tally = counting[key]
    if (!isCount(tally?.total) || !isCount(tally.correct) || tally.correct > tally.total) fail(`stats.counting.${key}`)
  }
```

In the object `restore()` returns, add `sprintBest,` and `countSpeed,` after `bestStreak: saved.bestStreak,`. Replace `stats: structuredClone(stats),` with:

```js
    stats: { ...structuredClone(stats), counting: structuredClone(counting) },
```

(g) In `snapshot()`, after `bestStreak: state.bestStreak,` add:

```js
    sprintBest: state.sprintBest,
    countSpeed: state.countSpeed,
```

(h) Replace the `startDrill` handler with:

```js
  startDrill(s, { mode }) {
    if (!TRAIN_MODES.includes(mode)) invalid(`no ${mode} drill`)
    s.drill ??= { mode, slots: {} }
    s.drill.mode = mode
    if (mode === 'values') {
      s.drill.values ??= newValuesDrill(s)
      return
    }
    const slot = (s.drill.slots[mode] ??= newTrainingSlot(s))
    // An unfinished hand is kept, so switching modes can't skip a Decision; an empty slot deals.
    if (!slot.round) dealTrainingHand(s, slot, mode)
  },
```

(i) In `HANDLERS`, after the `next` handler, add:

```js
  sprintStart(s) {
    const values = s.drill?.mode === 'values' ? s.drill.values : null
    if (!values) invalid('sprintStart outside the Values drill')
    if (values.phase === 'running') invalid('the sprint is already running')
    Object.assign(values, { phase: 'running', score: 0, misses: 0, miss: null, result: null })
    values.card = drawSprintCard(s, values)
  },

  sprintAnswer(s, { countValue: answer }) {
    const values = s.drill?.values
    if (values?.phase !== 'running') invalid('no sprint running')
    if (![1, 0, -1].includes(answer)) invalid(`${answer} is not a Count value`)
    const expected = countValue(values.card.rank)
    const correct = answer === expected
    tally(s.stats.counting.values, correct)
    if (correct) values.score++
    else values.misses++
    values.miss = correct ? null : { card: values.card, value: expected }
    values.card = drawSprintCard(s, values)
  },

  // The clock is the shell's: it ends the sprint at 0 s, or when the player leaves the drill.
  sprintEnd(s) {
    const values = s.drill?.values
    if (values?.phase !== 'running') invalid('no sprint running')
    values.phase = 'over'
    values.result = { score: values.score, misses: values.misses, isNewBest: values.score > s.sprintBest }
    s.sprintBest = Math.max(s.sprintBest, values.score)
    values.card = null
    values.miss = null
  },
```

(j) Replace `newTrainingSlot` (and its comment) with:

```js
// Tests stack the first Shoe created in Train, whichever drill creates it; later ones are plain shuffles.
function trainingShoe(s) {
  const shoe = newShoe(s.rng, s.trainingCards)
  s.trainingCards = []
  return shoe
}

// Each drill mode has its own training table.
function newTrainingSlot(s) {
  return { round: null, shoe: trainingShoe(s), feedback: null }
}
```

(k) At the end of the file, add:

```js
// ------------------------------------------------------------------ Counting (Hi-Lo)

// The Values drill: a sprint through its own Shoe. The engine grades; the 30-second clock is the shell's.
function newValuesDrill(s) {
  return { phase: 'ready', shoe: trainingShoe(s), card: null, score: 0, misses: 0, miss: null, result: null }
}

function drawSprintCard(s, values) {
  if (values.shoe.next >= values.shoe.cards.length) values.shoe = newShoe(s.rng)
  return draw(values)
}

function tally(counter, correct) {
  counter.total++
  if (correct) counter.correct++
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/counting.test.js 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 9`, `ℹ pass 9`, `ℹ fail 0`.

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 100`, `ℹ fail 0`: the 91 existing tests still pass, which guards the `trainingShoe` refactor.

- [ ] **Step 5: Commit**

```bash
git add app/engine.js test/counting.test.js
git commit -m "Engine: Values drill (Hi-Lo sprint) and counting progress in the save"
```

---

### Task 2: Engine — the Count drill

**Files:**
- Modify: `app/engine.js`
- Modify: `test/counting.test.js` (append)

**Interfaces:**
- Consumes (Task 1): `countValue(rank)`, `tally(counter, correct)`, `trainingShoe(s)`, `TRAIN_MODES`, `COUNT_SPEEDS`. It also uses the existing `draw`, `ACTIONS`, `advance`, `resolveRound`, `allowedActions` and `bookAction`.
- Produces:
  - `TRAIN_MODES` becomes `[...DRILL_MODES, 'values', 'count']`, and `export const MAX_BET_UNITS = 8`.
  - Events:
    - `{ type: 'startDrill', mode: 'count' }`, which deals the first round on the first visit;
    - `{ type: 'countNext' }`;
    - `{ type: 'countAnswer', answer: <integer> }`;
    - `{ type: 'countSpeed', speed: 'slow'|'normal'|'fast' }`.
  - `state.drill.count` holds:
    - `round`: a settled Round;
    - `runningCount`;
    - `dealt`;
    - `halfDecksDealt` (derived);
    - `roundsToCheck`;
    - `question`: `null|'runningCount'|'trueCount'|'bet'`;
    - `feedback`;
    - `newShoe`;
    - `reshuffled`;
    - `session`: `{ correct, total }`.
  - `feedback` is `{ question, correct, answer, expected }`. A `trueCount` question adds `runningCount, decksLeft, exact`; a `bet` question adds `trueCount`.
  - `state.checkAccuracy = { correct, total }`: every check question, all time (derived).

- [ ] **Step 1: Write the failing tests**

In `test/counting.test.js`, change the engine import to:

```js
import { newLab, step, snapshot, MAX_BET_UNITS } from '../app/engine.js'
```

Append:

```js
// ---------------------------------------------------------------- Count drill

const countNext = { type: 'countNext' }
const countAnswer = (answer) => ({ type: 'countAnswer', answer })
const cardsOf = (round) => [...round.dealer, ...round.hands.flatMap((hand) => hand.cards)]
const ranks = (cards) => cards.map((card) => card.rank)

// The test's own answers for a Count check, from every card dealt since the shuffle.
function oracle(seen) {
  const runningCount = seen.reduce((sum, card) => sum + HI_LO[card.rank], 0)
  const decksLeft = 6 - Math.round(seen.length / 26) / 2
  const trueCount = Math.trunc(runningCount / decksLeft) || 0
  return { runningCount, decksLeft, trueCount, bet: Math.min(Math.max(trueCount - 1, 1), 8) }
}

// Drives the Count drill and keeps the test's own record of the Count Shoe: every card since the shuffle.
// After every round it checks the engine's Running count and Discard tray against that record.
function countTable(s) {
  let seen = []
  const record = () => {
    const count = s.drill.count
    seen = count.newShoe ? cardsOf(count.round) : [...seen, ...cardsOf(count.round)]
    assert.equal(count.runningCount, oracle(seen).runningCount)
    assert.equal(count.halfDecksDealt, Math.round(seen.length / 26))
  }
  record() // the first round, dealt by startDrill
  return {
    get s() {
      return s
    },
    get seen() {
      return seen
    },
    // Deals until a Count check opens.
    toCheck() {
      for (;;) {
        s = step(s, countNext)
        if (s.drill.count.question) return
        record()
      }
    },
    answer(value) {
      s = step(s, countAnswer(value))
      return s.drill.count.feedback
    },
    // The next question, or after the Bet the next round.
    next() {
      s = step(s, countNext)
      if (!s.drill.count.question) record()
    },
    // The whole check, answered right by the oracle.
    answerAll() {
      const o = oracle(seen)
      for (const answer of [o.runningCount, o.trueCount, o.bet]) {
        assert.equal(this.answer(answer).correct, true)
        this.next()
      }
    },
  }
}

test('Count drill: the first visit deals a round and the Book plays it', () => {
  const s = run(trainLab(['10', '10', '6', '7', '5']), startDrill('count'))
  const { round } = s.drill.count
  assert.deepEqual(ranks(round.hands[0].cards), ['10', '6', '5']) // hard 16 against a 10 hits
  assert.equal(round.phase, 'settled')
  assert.equal(round.hands[0].result, 'win')
  assert.equal(s.drill.count.question, null)
})

test('Count drill: the Book splits a pair of 8s and plays each Hand', () => {
  const s = run(trainLab(['8', '10', '8', '7', '3', '2', '9', '10']), startDrill('count'))
  const { round } = s.drill.count
  // 8,3 = 11 doubles against the 10; 8,2 = 10 hits against it, then stands on 20.
  assert.deepEqual(round.hands.map((hand) => ranks(hand.cards)), [['8', '3', '9'], ['8', '2', '10']])
  assert.deepEqual(round.hands.map((hand) => hand.result), ['win', 'win'])
  assert.equal(s.drill.count.runningCount, 0) // 8 10 8 7 3 2 9 10 → 0 −1 0 0 +1 +1 0 −1
})

test('Count drill: the dealer Peeks, so a dealer Blackjack ends the round at once', () => {
  const s = run(trainLab(['9', 'A', '7', 'K']), startDrill('count'))
  const { round } = s.drill.count
  assert.deepEqual(ranks(round.hands[0].cards), ['9', '7'])
  assert.equal(round.hands[0].result, 'lose')
})

test('Count drill: the Running count and the Discard tray follow every card since the shuffle', () => {
  const table = countTable(run(trainLab(), startDrill('count'))) // countTable checks both after every round
  for (let check = 0; check < 30; check++) {
    table.toCheck()
    table.answerAll()
  }
})

test('Count drill: a Count check comes after 1 to 4 rounds, at random', () => {
  let s = run(trainLab(), startDrill('count'))
  let rounds = 1
  const gaps = new Set()
  for (let checks = 0; checks < 200; ) {
    s = step(s, countNext)
    if (!s.drill.count.question) {
      rounds++
      continue
    }
    gaps.add(rounds)
    checks++
    s = run(s, countAnswer(0), countNext, countAnswer(0), countNext, countAnswer(1), countNext) // deals on
    rounds = 1
  }
  assert.deepEqual([...gaps].sort(), [1, 2, 3, 4])
})

test('Count drill: a check asks the Running count, then the True count, then the Bet', () => {
  const dealing = run(trainLab(), startDrill('count'))
  assert.throws(() => step(dealing, countAnswer(0)), /no Count check open/)
  const table = countTable(dealing)
  table.toCheck()
  let { s } = table
  assert.equal(s.drill.count.question, 'runningCount')
  assert.throws(() => step(s, countNext), /answer the Count check first/)
  assert.throws(() => step(s, countAnswer(1.5)), /not a whole number/)
  s = step(s, countAnswer(0))
  assert.throws(() => step(s, countAnswer(0)), /already answered/)
  s = step(s, countNext)
  assert.equal(s.drill.count.question, 'trueCount')
  s = run(s, countAnswer(0), countNext)
  assert.equal(s.drill.count.question, 'bet')
  assert.throws(() => step(s, countAnswer(0)), /no Bet of 0 units/)
  assert.throws(() => step(s, countAnswer(MAX_BET_UNITS + 1)), /no Bet of 9 units/)
  const before = s.drill.count.round
  s = run(s, countAnswer(1), countNext)
  assert.equal(s.drill.count.question, null) // the check closed
  assert.equal(s.drill.count.feedback, null)
  assert.notDeepEqual(s.drill.count.round, before) // and the next round was dealt
})

test('Count drill: every question is graded against the real count', () => {
  const table = countTable(run(trainLab(), startDrill('count')))
  for (let check = 0; check < 60; check++) {
    table.toCheck()
    const o = oracle(table.seen)
    assert.equal(table.answer(o.runningCount).correct, true)
    table.next()
    const tc = table.answer(o.trueCount)
    assert.equal(tc.correct, true)
    assert.deepEqual([tc.runningCount, tc.decksLeft, tc.exact], [o.runningCount, o.decksLeft, o.runningCount / o.decksLeft])
    table.next()
    const bet = table.answer(o.bet)
    assert.equal(bet.correct, true)
    assert.equal(bet.trueCount, o.trueCount)
    table.next()
  }
})

test('Count drill: a wrong answer shows the right one, and the next question still uses the real count', () => {
  const table = countTable(run(trainLab(), startDrill('count')))
  table.toCheck()
  const o = oracle(table.seen)
  const rc = table.answer(o.runningCount + 1)
  assert.deepEqual([rc.correct, rc.answer, rc.expected], [false, o.runningCount + 1, o.runningCount])
  table.next()
  assert.equal(table.answer(o.trueCount).correct, true)
  table.next()
  const bet = table.answer(o.bet === 1 ? 2 : 1)
  assert.deepEqual([bet.correct, bet.expected], [false, o.bet])
  const { s } = table
  assert.deepEqual(s.drill.count.session, { correct: 1, total: 3 })
  assert.deepEqual(s.stats.counting.runningCount, { correct: 0, total: 1 })
  assert.deepEqual(s.stats.counting.trueCount, { correct: 1, total: 1 })
  assert.deepEqual(s.checkAccuracy, { correct: 1, total: 3 })
})

test('Count drill: the True count drops the fraction, toward zero below zero', () => {
  const highs = Array.from({ length: 100 }, (_, i) => ['10', 'J', 'Q', 'K', 'A'][i % 5])
  const table = countTable(run(trainLab(highs), startDrill('count')))
  let negativeFraction = false
  for (let check = 0; check < 5; check++) {
    table.toCheck()
    const { runningCount, decksLeft, trueCount, bet } = oracle(table.seen)
    const exact = runningCount / decksLeft
    if (exact < 0 && !Number.isInteger(exact)) negativeFraction = true // where trunc and floor differ
    table.answer(runningCount)
    table.next()
    assert.equal(table.answer(trueCount).correct, true)
    table.next()
    assert.equal(bet, 1) // the Bet ramp never goes below 1 unit
    assert.equal(table.answer(1).correct, true)
    table.next()
  }
  assert.ok(negativeFraction, 'a stack of tens and aces gives negative True counts with a fraction')
})

test('Count drill: the Bet ramp tops out at 8 units', () => {
  const lows = Array.from({ length: 110 }, (_, i) => ['2', '3', '4', '5', '6'][i % 5])
  const table = countTable(run(trainLab(lows), startDrill('count')))
  let topped = false
  for (let check = 0; check < 12 && !topped; check++) {
    table.toCheck()
    const o = oracle(table.seen)
    table.answer(o.runningCount)
    table.next()
    table.answer(o.trueCount)
    table.next()
    const bet = table.answer(o.bet)
    assert.equal(bet.correct, true)
    if (o.trueCount - 1 > MAX_BET_UNITS) {
      topped = true
      assert.equal(bet.expected, MAX_BET_UNITS)
    }
    table.next()
  }
  assert.ok(topped, 'a stack of low cards pushes the True count above 9')
})

test('Count drill: a check on the Cut-card round uses the old Shoe, then the count starts again at 0', () => {
  const table = countTable(run(trainLab(), startDrill('count')))
  let checkedAtCut = false
  for (let check = 0; check < 400 && !checkedAtCut; check++) {
    table.toCheck()
    checkedAtCut = table.seen.length >= 234 // the last round crossed the Cut card, so the engine has reshuffled
    table.answerAll() // graded on the old Shoe's cards; its last next() deals the new Shoe's first round
  }
  assert.ok(checkedAtCut, 'some check should fall on a Cut-card round')
  const count = table.s.drill.count
  assert.equal(count.newShoe, true)
  assert.equal(count.runningCount, cardsOf(count.round).reduce((sum, card) => sum + HI_LO[card.rank], 0))
})

test('counting never touches Chips, table stats, the last Bet, the Streak, Chart cells or Mistakes', () => {
  const before = trainLab()
  const table = countTable(run(before, startDrill('count')))
  for (let check = 0; check < 5; check++) {
    table.toCheck()
    table.answer(99) // wrong on purpose: still no Mistake and no Chart cell
    table.next()
    table.answer(0)
    table.next()
    table.answer(8)
    table.next()
  }
  const after = run(table.s, startDrill('values'), sprintStart, sprintAnswer(1), sprintEnd)
  const untouched = ({ bankroll, lastBet, streak, bestStreak, stats }) => ({
    bankroll, lastBet, streak, bestStreak, cells: stats.cells, mistakes: stats.mistakes, play: stats.play,
  })
  assert.deepEqual(untouched(after), untouched(before))
})

test('Count speed: a saved preference, one of three', () => {
  const s = run(trainLab(), startDrill('count'), { type: 'countSpeed', speed: 'fast' })
  assert.equal(s.countSpeed, 'fast')
  assert.equal(snapshot(s).countSpeed, 'fast')
  assert.throws(() => step(s, { type: 'countSpeed', speed: 'warp' }), /no warp speed/)
})

test('Count drill: switching Train tabs keeps the table as it was', () => {
  const s = run(trainLab(), startDrill('count'), countNext)
  const back = run(s, startDrill('values'), startDrill('count'))
  assert.deepEqual(back.drill.count, s.drill.count)
})

test('Count events only work in the Count drill', () => {
  assert.throws(() => step(run(trainLab(), startDrill('values')), countNext), /outside the Count drill/)
  assert.throws(() => step(run(trainLab(), startDrill('values')), countAnswer(0)), /no Count check open/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/counting.test.js 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 24` with `ℹ fail 15`. The new tests fail with `Invalid event: no count drill`; the 9 Task 1 tests still pass.

- [ ] **Step 3: Implement**

In `app/engine.js`:

(a) Replace the `TRAIN_MODES` line with the following, and add the constants after `COUNTING_TALLIES`:

```js
export const TRAIN_MODES = [...DRILL_MODES, 'values', 'count']
```

```js
export const MAX_BET_UNITS = 8 // the Bet ramp's top: 8 units of the table minimum
const CHECK_QUESTIONS = ['runningCount', 'trueCount', 'bet']
const MAX_CHECK_GAP = 4 // a Count check comes after 1–4 rounds, at random
const HALF_DECK = 26
```

(b) In the `deal` handler, replace the three lines from `const peeks = …` to `… settle(s)` with:

```js
    if (endsAtDeal(s.round)) settle(s)
```

After `prefillBet`, add:

```js
// Peek: an ace or ten-value Upcard with a dealer Blackjack ends the Round at once, and so does a player Blackjack.
function endsAtDeal(round) {
  const upcard = round.dealer[0]
  const peeks = upcard.rank === 'A' || value(upcard.rank) === 10
  return (peeks && handTotal(round.dealer).total === 21) || isBlackjack(round.hands[0])
}
```

(c) In `startDrill`, after the `values` branch, add:

```js
    if (mode === 'count') {
      if (!s.drill.count) {
        s.drill.count = newCountDrill(s)
        dealCountRound(s, s.drill.count)
      }
      return
    }
```

(d) In `HANDLERS`, after `sprintEnd`, add:

```js
  countNext(s) {
    const count = s.drill?.mode === 'count' ? s.drill.count : null
    if (!count) invalid('countNext outside the Count drill')
    if (count.question) {
      if (!count.feedback) invalid('answer the Count check first')
      count.feedback = null
      const next = CHECK_QUESTIONS[CHECK_QUESTIONS.indexOf(count.question) + 1]
      if (next) {
        count.question = next
        return
      }
      // The Bet was the last question: the check closes and the table deals on.
      count.question = null
      count.roundsToCheck = checkGap(s.rng)
      dealCountRound(s, count)
      return
    }
    if (count.roundsToCheck === 0) {
      count.question = CHECK_QUESTIONS[0]
      return
    }
    dealCountRound(s, count)
  },

  countAnswer(s, { answer }) {
    const count = s.drill?.mode === 'count' ? s.drill.count : null
    if (!count?.question) invalid('no Count check open')
    if (count.feedback) invalid('the Count check is already answered')
    if (!Number.isInteger(answer)) invalid(`${answer} is not a whole number`)
    if (count.question === 'bet' && (answer < 1 || answer > MAX_BET_UNITS)) invalid(`no Bet of ${answer} units`)
    const { expected, ...working } = expectedAnswer(count)
    const correct = answer === expected
    tally(s.stats.counting[count.question], correct)
    tally(count.session, correct)
    count.feedback = { question: count.question, correct, answer, expected, ...working }
  },

  countSpeed(s, { speed }) {
    if (!COUNT_SPEEDS.includes(speed)) invalid(`no ${speed} speed`)
    s.countSpeed = speed
  },
```

(e) In `derive()`, directly before `return s`, add:

```js
  if (s.drill?.count) s.drill.count.halfDecksDealt = halfDecksDealt(s.drill.count)
  s.checkAccuracy = checkAccuracyOf(s.stats.counting)
```

(f) Replace `trainingRound`'s `return { … }` object with `return freeRound([upcard, hole], cards)`, and add above `trainingRound`:

```js
// A Bet-0 Round for Train's tables: no Chips at stake, so Double and Split cost nothing.
function freeRound(dealer, cards) {
  return {
    phase: 'player',
    dealer,
    hands: [{ cards, bet: 0, fromSplit: false, splitAces: false, done: false }],
    active: 0,
    bet: 0,
    hinted: false,
    net: 0,
    allowed: [],
  }
}
```

(g) At the end of the file (the Counting section), add:

```js
// The Count drill: real rounds from the Count Shoe, played by the Book, with a Count check every 1–4 rounds.
function newCountDrill(s) {
  return {
    round: null,
    shoe: trainingShoe(s),
    runningCount: 0,
    dealt: 0, // cards dealt since the shuffle: what the Discard tray holds
    roundsToCheck: checkGap(s.rng),
    question: null, // 'runningCount' | 'trueCount' | 'bet' while a Count check is open
    feedback: null,
    newShoe: false, // this round is the first from a fresh Shoe
    reshuffled: false, // the last round crossed the Cut card; its count stands until the next deal
    session: { correct: 0, total: 0 },
  }
}

function checkGap(rng) {
  return 1 + Math.floor(rng() * MAX_CHECK_GAP)
}

// Deals and plays one round, then counts every card in it. A check due on the Cut-card round still sees the
// old Shoe's count: the reset waits for this, the next deal.
function dealCountRound(s, count) {
  count.newShoe = count.reshuffled
  if (count.reshuffled) {
    count.runningCount = 0
    count.dealt = 0
  }
  const shoe = count.shoe
  playCountRound(s, count)
  count.reshuffled = count.shoe !== shoe // resolveRound swaps in a new Shoe at the Cut card
  const cards = [...count.round.dealer, ...count.round.hands.flatMap((hand) => hand.cards)]
  for (const card of cards) count.runningCount += countValue(card.rank)
  count.dealt += cards.length
  count.roundsToCheck--
}

// Dealt in Play's order with Play's Peek, then every Decision by the Book and the dealer by S17.
function playCountRound(s, table) {
  const first = draw(table)
  const upcard = draw(table)
  const second = draw(table)
  const hole = draw(table)
  table.round = freeRound([upcard, hole], [first, second])
  if (!endsAtDeal(table.round)) {
    let dealerPlayed = false
    while (!dealerPlayed) {
      const { round } = table
      const hand = round.hands[round.active]
      const { action } = bookAction({ cards: hand.cards, upcard, allowed: allowedActions(s, table) })
      ACTIONS[action](s, table, hand)
      dealerPlayed = advance(table)
    }
  }
  resolveRound(table, s.rng)
}

function halfDecksDealt(count) {
  return Math.round(count.dealt / HALF_DECK)
}

// The answers for the open Count check, always from the real count, never from the player's earlier answers.
function expectedAnswer(count) {
  const { question, runningCount } = count
  if (question === 'runningCount') return { expected: runningCount }
  const decksLeft = DECKS - halfDecksDealt(count) / 2
  const exact = runningCount / decksLeft
  const trueCount = Math.trunc(exact) || 0 // || 0: never −0
  if (question === 'trueCount') return { expected: trueCount, runningCount, decksLeft, exact }
  return { expected: Math.min(Math.max(trueCount - 1, 1), MAX_BET_UNITS), trueCount }
}

// Every Count-check question answered, all time: the Count header's Accuracy.
function checkAccuracyOf({ runningCount, trueCount, bet }) {
  return {
    correct: runningCount.correct + trueCount.correct + bet.correct,
    total: runningCount.total + trueCount.total + bet.total,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/counting.test.js 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 24`, `ℹ fail 0`.

If a stacked-scenario test fails its own `assert.ok(...)` guard, the seeded run never reached the case. The guards are "negativeFraction", "topped" and "checkedAtCut". This isn't an engine bug: raise that test's loop bound (or, for "topped", the stack length, up to 120 low cards). Never weaken the grading assertions.

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 115`, `ℹ fail 0`. The Play tests guard the `endsAtDeal` refactor, and the Training-hand tests guard `freeRound`.

- [ ] **Step 5: Commit**

```bash
git add app/engine.js test/counting.test.js
git commit -m "Engine: Count drill — Book-played rounds, random Count checks, Hi-Lo grading"
```

---

### Task 3: Shell — Train tabs and the Values screen

**Files:**
- Modify: `app/app.js`, `app/style.css`, `app/strings.js`
- QA (scratchpad, not committed): `qa/cdp.mjs` (keys), new `qa/qa-values.mjs`

**Interfaces:**
- Consumes (Tasks 1–2): `TRAIN_MODES`, `state.drill.values`, `state.sprintBest`, and the events `startDrill`, `sprintStart`, `sprintAnswer({ countValue })` and `sprintEnd`.
- Produces for Task 4:
  - `trainScreen()` dispatches on `drill.mode`, and `trainStats(drill)` renders a mode's two header stats.
  - `digitTargets(n)` maps a digit to on-screen buttons.
  - `leaveValues()` and `reactValues(event)` are also available.
  - During this task only, `SHOWN_MODES` hides the Count tab; Task 4 deletes it.

The shell has no unit tests: the engine is the one test seam. This task is verified by `npm test` (string parity) and the browser QA in Steps 6–7.

- [ ] **Step 1: Strings**

In `app/strings.js`, add to `en` after `backToDrill`:

```js
    'drill.values': 'Values',
    time: 'Time',
    bestSprint: 'Best sprint',
    start: 'Start',
    again: 'Again',
    feltValues: 'Values sprint · 30 s',
    feltValuesSub: '+1 for 2–6 · 0 for 7–9 · −1 for 10–A',
    sprintResult: '{score} right · {misses} missed',
    sprintNewBest: 'New best sprint!',
    sprintBestWas: 'Best sprint: {n}',
    sprintMiss: 'Missed: it was {value}',
    keysValues: 'Keys: ← −1 · ↓ 0 · → +1 (or 1 2 3) · Enter start',
```

and to `mn` after `backToDrill`:

```js
    'drill.values': 'Утга',
    time: 'Хугацаа',
    bestSprint: 'Шилдэг спринт',
    start: 'Эхлэх',
    again: 'Дахин',
    feltValues: 'Утгын спринт · 30 с',
    feltValuesSub: '2–6: +1 · 7–9: 0 · 10–A: −1',
    sprintResult: '{score} зөв · {misses} алдсан',
    sprintNewBest: 'Шинэ шилдэг спринт!',
    sprintBestWas: 'Шилдэг спринт: {n}',
    sprintMiss: 'Алдлаа: {value} байсан',
    keysValues: 'Товч: ← −1 · ↓ 0 · → +1 (эсвэл 1 2 3) · Enter эхлэх',
```

Run: `node --test test/strings.test.js 2>&1 | grep -E 'ℹ (pass|fail)'`
Expected: `ℹ fail 0`.

- [ ] **Step 2: Shell state, clock and events**

In `app/app.js`:

(a) In the engine import, replace `DRILL_MODES,` with `TRAIN_MODES,`.

(b) After `const NEW_BEST_CARD_MIN = 5`, add:

```js
const SPRINT_MS = 30000
const MISS_PAUSE_MS = 600 // a missed card shows its right value this long, and taps are ignored meanwhile
const VALUE_BUTTONS = [
  { value: -1, k: 'value-minus', key: '←' },
  { value: 0, k: 'value-zero', key: '↓' },
  { value: 1, k: 'value-plus', key: '→' },
]
// ponytail: the Count tab arrives with its screen in Task 4, which deletes this line.
const SHOWN_MODES = TRAIN_MODES.filter((mode) => mode !== 'count')
```

(c) In `ui`, after `autoBet: false, …`, add:

```js
  valuesSeen: new Set(),
  valuesSerial: 0,
  sprintEndsAt: null, // the sprint clock, while one is running
  missFlash: null, // { card, value }: the card just missed, shown with its right value
```

After `let autoDealTimer = null`, add:

```js
let sprintTimer = null
let missTimer = null
```

(d) At the end of `react()`, add `reactValues(event)`. After `scheduleAdvance()`, add:

```js
// The sprint clock starts with the sprint, a miss flashes the right value, and the result is announced.
function reactValues(event) {
  const values = state.drill?.values
  if (event.type === 'sprintStart') {
    ui.valuesSerial++
    ui.valuesSeen.clear()
    startSprintClock()
  }
  if (event.type === 'sprintAnswer' && values.miss) flashMiss(values.miss)
  if (event.type === 'sprintEnd') announce(sprintResultText(values.result))
}

function startSprintClock() {
  clearTimeout(sprintTimer)
  ui.sprintEndsAt = Date.now() + SPRINT_MS
  sprintTimer = setTimeout(sprintTick, 1000)
}

// Redraws the clock on each whole second and ends the sprint at 0.
function sprintTick() {
  const msLeft = ui.sprintEndsAt - Date.now()
  if (msLeft <= 0) {
    endSprint()
    return
  }
  render()
  sprintTimer = setTimeout(sprintTick, msLeft % 1000 || 1000)
}

function sprintSecondsLeft() {
  return Math.max(0, Math.ceil((ui.sprintEndsAt - Date.now()) / 1000))
}

function endSprint() {
  clearTimeout(sprintTimer)
  clearTimeout(missTimer)
  ui.sprintEndsAt = null
  ui.missFlash = null
  dispatch({ type: 'sprintEnd' })
}

// Leaving the Values drill mid-sprint ends the sprint: a partial score can't beat a full one.
function leaveValues() {
  if (state.drill?.values?.phase === 'running') endSprint()
}

function flashMiss(miss) {
  clearTimeout(missTimer)
  ui.missFlash = miss
  announce(t('sprintMiss', { value: countValueLabel(miss.value) }))
  missTimer = setTimeout(() => {
    ui.missFlash = null
    render()
  }, MISS_PAUSE_MS)
}
```

(e) At the top of `switchTab`, before `ui.tab = tab`, add:

```js
  if (tab !== 'train') leaveValues()
```

(f) In `CLICKS`, replace `drillMode` and add the sprint clicks:

```js
  drillMode: ({ mode }) => {
    if (mode === state.drill?.mode) return
    leaveValues()
    dispatch({ type: 'startDrill', mode })
  },
  sprintStart: () => dispatch({ type: 'sprintStart' }),
  sprintAnswer: ({ value }) => dispatch({ type: 'sprintAnswer', countValue: Number(value) }),
```

(g) In `keyTargets`:
- Add `'sprint-start'` to the Enter/Space list, so it reads `['deal', 'next', 'back-to-drill', 'sprint-start']`.
- Replace the two `chip` lines with the lines below.
- After `keyTargets`, add `digitTargets`.

The replacement lines:

```js
  if (key === 'arrowleft') return ['value-minus']
  if (key === 'arrowdown') return ['value-zero']
  if (key === 'arrowright') return ['value-plus']
  if (/^[1-9]$/.test(key)) return digitTargets(Number(key))
```

The new function:

```js
// A digit presses whichever numbered button is on screen: a chip in Play, a Count value in Values.
function digitTargets(n) {
  const targets = []
  if (n <= CHIPS.length) targets.push(`chip-${CHIPS[n - 1]}`)
  if (n <= VALUE_BUTTONS.length) targets.push(VALUE_BUTTONS[n - 1].k)
  return targets
}
```

- [ ] **Step 3: Train header and the Values screen**

In `app/app.js`, replace the start of `trainScreen()` (from `function trainScreen() {` through the `const header = …` line) with:

```js
function trainScreen() {
  const { drill } = state
  if (!drill) return ''
  const tabs = SHOWN_MODES.map(
    (mode) =>
      `<button role="tab" aria-selected="${drill.mode === mode}" data-do="drillMode" data-mode="${mode}" data-k="mode-${mode}">${t(`drill.${mode}`)}</button>`,
  )
  const header = `<header class="bar train-bar"><div class="segmented" role="tablist">${tabs.join('')}</div><div class="stats">${trainStats(drill)}</div></header>`
  if (drill.mode === 'values') return header + valuesScreen(drill.values)
```

The rest of `trainScreen` (the `drill.empty` branch and the Training-hand table) stays as it is. After `trainScreen`, add:

```js
// Each mode's two numbers, always in the same two slots, so the header never changes shape.
function trainStats(drill) {
  const stat = (label, value) => `<div class="stat"><span class="label">${label}</span><strong>${value}</strong></div>`
  if (drill.mode === 'values') return stat(t('time'), sprintClock(drill.values)) + stat(t('bestSprint'), fmt(state.sprintBest))
  return stat(t('streak'), state.streak) + stat(t('best'), Math.max(state.bestStreak, state.streak))
}

function sprintClock(values) {
  if (values.phase === 'running') return sprintSecondsLeft()
  return values.phase === 'over' ? 0 : SPRINT_MS / 1000
}

// Values: one big card above the felt print; the three answers sit where the Actions sit in the other drills.
function valuesScreen(values) {
  const running = values.phase === 'running'
  const flash = running ? ui.missFlash : null
  const dealt = values.score + values.misses // one key per card this sprint, so each new card animates in
  let card = cardBack('v-back', ui.valuesSeen)
  if (flash) card = cardFace(flash.card, `v${ui.valuesSerial}-${dealt - 1}`, ui.valuesSeen)
  else if (values.card) card = cardFace(values.card, `v${ui.valuesSerial}-${dealt}`, ui.valuesSeen)
  const badge = flash ? `<span class="value-badge">${countValueLabel(flash.value)}</span>` : ''
  return `
    <section class="table values">
      <div class="sprint-card${flash ? ' missed' : ''}">${card}${badge}</div>
      ${valuesMessage(values)}
    </section>
    <footer class="controls">
      <div class="panel${running ? ' off' : ''}">
        <button class="primary wide" data-do="sprintStart" data-k="sprint-start" ${running ? 'disabled' : ''}>${t(values.phase === 'over' ? 'again' : 'start')}<kbd>↵</kbd></button>
      </div>
      <div class="panel acting${running ? '' : ' off'}">${valueButtons(running && !flash)}</div>
      <p class="keys muted small">${t('keysValues')}</p>
    </footer>`
}

function valuesMessage(values) {
  if (values.phase === 'running') return feltMessage('', '', '') // nothing to read while the clock runs
  if (values.phase === 'over') {
    const { isNewBest } = values.result
    const sub = isNewBest ? t('sprintNewBest') : t('sprintBestWas', { n: fmt(state.sprintBest) })
    return feltMessage(isNewBest ? 'good' : 'net', sprintResultText(values.result), sub)
  }
  return feltMessage('', t('feltValues'), t('feltValuesSub'))
}

function sprintResultText({ score, misses }) {
  return t('sprintResult', { score: fmt(score), misses: fmt(misses) })
}

function countValueLabel(value) {
  if (value > 0) return '+1'
  return value < 0 ? '−1' : '0'
}

function valueButtons(enabled) {
  const buttons = VALUE_BUTTONS.map(
    ({ value, k, key }) =>
      `<button data-do="sprintAnswer" data-value="${value}" data-k="${k}" ${enabled ? '' : 'disabled'}>${countValueLabel(value)}<kbd>${key}</kbd></button>`,
  )
  return `<div class="values-row">${buttons.join('')}</div>`
}
```

- [ ] **Step 4: Styles**

In `app/style.css`, after the `.segmented.small button { … }` rule, add:

```css
/* Train: the tabs and the mode's two numbers. On a phone they take two rows in every mode, so switching
   tabs never moves the table. */
.train-bar .stats {
  display: flex;
  gap: 16px;
}
@media (max-width: 600px) {
  .train-bar {
    flex-wrap: wrap;
    row-gap: 6px;
  }
  .train-bar .segmented {
    flex: 1 1 100%;
  }
  .train-bar .segmented button {
    flex: 1 1 auto;
    padding: 0 6px;
    font-size: 13px;
    white-space: nowrap;
  }
  .train-bar .stats {
    flex: 1 1 100%;
    justify-content: flex-end;
  }
}
```

After the `.empty { … }` rule, add:

```css
/* ---------------------------------------------------------------- counting */

/* Values: one big card in the upper felt, the print below it. */
.table.values {
  grid-template-rows: minmax(0, 1fr) auto;
  --card-w: clamp(84px, min(26vw, 20vh), 150px);
}
.sprint-card {
  position: relative;
  justify-self: center;
}
.sprint-card.missed .card {
  outline: 4px solid #ff6b5e;
  outline-offset: 2px;
}
.value-badge {
  position: absolute;
  top: -12px;
  right: -14px;
  padding: 2px 10px;
  border-radius: 999px;
  background: #c0392b;
  color: #fff;
  font-size: 18px;
  font-weight: 800;
}
.values-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.values-row button {
  height: var(--control-h);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Unit tests still pass**

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 115`, `ℹ fail 0`.

- [ ] **Step 6: Browser QA — the Values sprint**

The dev server must be up (`curl -s -o /dev/null -w '%{http_code}' http://localhost:8765/` prints `200`; otherwise run `npm run dev` in the background). The QA files live in the session scratchpad's `qa/` folder.

First, teach the harness the extra keys. In `qa/cdp.mjs`, replace the `named` lookup inside `key()` with:

```js
      const named = {
        Enter: { code: 'Enter', keyCode: 13, text: '\r' },
        Escape: { code: 'Escape', keyCode: 27 },
        ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
        ArrowRight: { code: 'ArrowRight', keyCode: 39 },
        ArrowDown: { code: 'ArrowDown', keyCode: 40 },
        Backspace: { code: 'Backspace', keyCode: 8 },
        '-': { code: 'Minus', keyCode: 189, text: '-' },
      }[key]
```

Create `qa/qa-values.mjs`:

```js
import { launch, sleep } from './cdp.mjs'
const rects = `(() => {
  const r = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b ? [Math.round(b.top), Math.round(b.height)] : null }
  return JSON.stringify({ table: r('.table'), felt: r('.felt-print'), controls: r('.controls') })
})()`
const HI_LO = { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0, 9: 0, 10: -1, J: -1, Q: -1, K: -1, A: -1 }
const KEY_OF = { 1: 'ArrowRight', 0: 'ArrowDown', '-1': 'ArrowLeft' }
async function run(width, height, desktop, port) {
  const b = await launch({ port, realSdk: true })
  try {
    await b.viewport(width, height, true, desktop)
    await b.goto('http://localhost:8765/?name=Z', 300)
    await b.eval('localStorage.clear()')
    await b.goto('http://localhost:8765/?name=Z', 800)
    await b.key('Escape', 200) // the first-launch chip picker
    await b.click('[data-k=tab-train]', 300)
    await b.click('[data-k=mode-values]', 300)
    const layouts = new Set([await b.eval(rects)])
    await b.key('Enter', 200) // Start
    for (let i = 0; i < 12; i++) {
      const rank = await b.eval(`document.querySelector('.sprint-card .rank')?.textContent`)
      const wrong = i === 3
      const value = wrong ? (HI_LO[rank] === 1 ? 0 : 1) : HI_LO[rank]
      await b.key(KEY_OF[value], 80)
      layouts.add(await b.eval(rects))
      if (wrong) {
        const badge = await b.text('.value-badge')
        const blocked = await b.eval(`document.querySelector('[data-k=value-plus]').disabled`)
        console.log('miss →', { badge, blocked })
        await sleep(700)
      }
    }
    if (!desktop) await b.shot('values-phone')
    await sleep(30500)
    layouts.add(await b.eval(rects))
    const best = await b.eval(`document.querySelectorAll('.train-bar .stat strong')[1].textContent`)
    console.log('result:', await b.text('.felt-print'), '| best sprint:', best)
    console.log(`${width}x${height}: ${layouts.size} distinct layout(s)`)
    console.log('errors:', b.errors)
  } finally {
    b.close()
  }
}
await run(1920, 1080, true, 9381)
await run(390, 844, false, 9382)
```

Run: `cd /tmp/claude-1000/-opt-projects-blackjack/3679f096-99b4-4e78-8a8f-4f20d3575227/scratchpad/qa && node qa-values.mjs`
Expected, for each viewport:
- `miss → { badge: '<the right value>', blocked: true }`;
- `result: 11 right · 1 missed` plus the best-sprint line, and `best sprint: 11`;
- `1 distinct layout(s)`;
- `errors: []`.

Look at `qa/values-phone.png`: the tabs on one row (three for now: Count arrives in Task 4), Time and Best sprint underneath, the big card, and the three value buttons.

- [ ] **Step 7: Browser QA — nothing else moved**

Run: `node qa-train-stable.mjs && node qa-stable.mjs 2>&1 | grep -E 'distinct|errors'`
Expected: Drill still 1 distinct layout at both sizes; Play unchanged; `errors: []`. On the phone, Drill's table sits lower than before because the Train header is now two rows. That's expected: it's the same in every mode.

- [ ] **Step 8: Commit**

```bash
git add app/app.js app/style.css app/strings.js
git commit -m "Train: Values sprint screen; the Train header shows each mode's stats"
```

---

### Task 4: Shell — the Count screen

**Files:**
- Modify: `app/app.js`, `app/style.css`, `app/strings.js`
- QA (scratchpad): new `qa/qa-count.mjs`

**Interfaces:**
- Consumes:
  - From Task 2:
    - `state.drill.count`: `round`, `question`, `feedback`, `newShoe`, `halfDecksDealt`, `session`;
    - `state.countSpeed`, `state.checkAccuracy`;
    - `COUNT_SPEEDS`, `MAX_BET_UNITS`;
    - the events `startDrill('count')`, `countNext`, `countAnswer({ answer })` and `countSpeed({ speed })`.
  - From Task 3: `trainScreen`, `trainStats`, `digitTargets`, `leaveValues` and `SHOWN_MODES`, which this task deletes.
- Produces: the finished Train screen. Task 5 reuses `units(n)` and the `label.*` strings.

- [ ] **Step 1: Strings**

In `app/strings.js`, add to `en` after the Task 3 block:

```js
    'drill.count': 'Count',
    checks: 'Checks',
    'speed.slow': 'Slow',
    'speed.normal': 'Normal',
    'speed.fast': 'Fast',
    feltCount: 'Keep the count',
    feltCountSub: 'Hi-Lo · +1 for 2–6 · 0 for 7–9 · −1 for 10–A',
    newShoe: 'New Shoe',
    newShoeSub: 'The count starts at 0',
    'ask.runningCount': 'Running count?',
    'askSub.runningCount': 'Every card since the shuffle',
    'ask.trueCount': 'True count?',
    'askSub.trueCount': 'Running count ÷ decks left (read the tray)',
    'ask.bet': 'Bet (units)?',
    'askSub.bet': 'True count − 1, from 1 to 8 units',
    'label.runningCount': 'Running count',
    'label.trueCount': 'True count',
    'label.bet': 'Bet size',
    itWas: '{what} was {n}',
    youSaid: 'You said {n}',
    carryOn: 'Keep counting from here',
    tcWorking: '{rc} ÷ {decks} decks = {exact} → {tc}',
    betWorking: 'True count {tc} → {units}: true count − 1, from 1 to 8',
    betUnit: '{n} unit',
    betUnits: '{n} units',
    oneLess: 'One less',
    oneMore: 'One more',
    answerOk: 'OK',
    trayLabel: 'Discard tray: {n} decks dealt',
    keysCount: 'Keys: 1 2 3 speed · ← → adjust · digits and − type · Enter answer · 1–8 Bet',
```

and to `mn`:

```js
    'drill.count': 'Тоолох',
    checks: 'Шалгалт',
    'speed.slow': 'Удаан',
    'speed.normal': 'Дунд',
    'speed.fast': 'Хурдан',
    feltCount: 'Тоогоо барь',
    feltCountSub: 'Hi-Lo · 2–6: +1 · 7–9: 0 · 10–A: −1',
    newShoe: 'Шинэ хайрцаг',
    newShoeSub: 'Тоолол 0-ээс эхэлнэ',
    'ask.runningCount': 'Явцын тоо?',
    'askSub.runningCount': 'Холисноос хойшхи бүх карт',
    'ask.trueCount': 'Жинхэнэ тоо?',
    'askSub.trueCount': 'Явцын тоо ÷ үлдсэн багц (тавиурыг хар)',
    'ask.bet': 'Бооцоо (нэгж)?',
    'askSub.bet': 'Жинхэнэ тоо − 1, 1-ээс 8 нэгж',
    'label.runningCount': 'Явцын тоо',
    'label.trueCount': 'Жинхэнэ тоо',
    'label.bet': 'Бооцооны хэмжээ',
    itWas: '{what}: {n} байсан',
    youSaid: 'Та {n} гэж хэлсэн',
    carryOn: 'Эндээс үргэлжлүүлэн тоол',
    tcWorking: '{rc} ÷ {decks} багц = {exact} → {tc}',
    betWorking: 'Жинхэнэ тоо {tc} → {units}: жинхэнэ тоо − 1, 1-ээс 8',
    betUnit: '{n} нэгж',
    betUnits: '{n} нэгж',
    oneLess: 'Нэгээр бага',
    oneMore: 'Нэгээр их',
    answerOk: 'OK',
    trayLabel: 'Хаягдлын тавиур: {n} багц тараагдсан',
    keysCount: 'Товч: 1 2 3 хурд · ← → өөрчлөх · тоо ба − бичих · Enter хариулах · 1–8 бооцоо',
```

Run: `node --test test/strings.test.js 2>&1 | grep -E 'ℹ (pass|fail)'`
Expected: `ℹ fail 0`.

- [ ] **Step 2: Shell state, pacing and events**

In `app/app.js`:

(a) Add `COUNT_SPEEDS,` and `MAX_BET_UNITS,` to the engine import. Delete the `SHOWN_MODES` line and its `ponytail:` comment. In `trainScreen`, change `SHOWN_MODES.map(` back to `TRAIN_MODES.map(`, and after the `values` line add:

```js
  if (drill.mode === 'count') return header + countScreen(drill.count)
```

(b) After the `VALUE_BUTTONS` constant, add:

```js
const COUNT_CARD_MS = { slow: 1000, normal: 600, fast: 350 } // the Count drill's deal speed, per card
const ROUND_PAUSE_CARDS = 2 // after a round's last card, this many card intervals before the next step
const STEPPER_MAX_DIGITS = 3
```

(c) In `ui`, after `missFlash`, add:

```js
  countSeen: new Set(),
  countSerial: 0,
  countShown: Infinity, // reveal steps shown of the current Count round
  stepper: '0', // the Count-check answer as typed
  stepperTyped: false, // typing replaces the pre-filled value; after that it edits it
  lastRunningCount: 0, // the last Running count revealed: where the stepper starts
```

After `let missTimer = null`, add `let countTimer = null`.

(d) At the end of `react()`, after `reactValues(event)`, add `reactCount(prev, event)`.

(e) In `switchTab`, replace the Task 3 line `if (tab !== 'train') leaveValues()` with:

```js
  if (tab !== 'train') {
    leaveValues()
    clearCountTimer() // leaving pauses the Count drill; coming back resumes it
  }
```

(f) In `CLICKS`, add `clearCountTimer()` to `drillMode` directly after `leaveValues()`, and add:

```js
  countSpeed: ({ speed }) => dispatch({ type: 'countSpeed', speed }),
  countAnswer: ({ answer }) => dispatch({ type: 'countAnswer', answer: Number(answer) }),
  countNext: () => {
    clearCountTimer()
    dispatch({ type: 'countNext' })
  },
  stepperAdjust: ({ by }) => {
    ui.stepper = String(stepperValue() + Number(by))
    ui.stepperTyped = false
    render()
  },
  stepperOk: () => dispatch({ type: 'countAnswer', answer: stepperValue() }),
```

(g) In `keyTargets`:
- Enter/Space: add `'stepper-ok'`, giving `['deal', 'next', 'back-to-drill', 'sprint-start', 'stepper-ok']`.
- Make the arrow lines `['value-minus', 'stepper-minus']` and `['value-plus', 'stepper-plus']`.
- In `digitTargets`, add these lines before `return targets`, and change its comment to `// A digit presses whichever numbered button is on screen: a chip, a Count value, a speed or a Bet.`:

```js
  if (n <= COUNT_SPEEDS.length) targets.push(`speed-${COUNT_SPEEDS[n - 1]}`)
  if (n <= MAX_BET_UNITS) targets.push(`bet-${n}`)
```

(h) In `onKey`, directly after the `if (ui.overlay) { … }` block, add:

```js
  if (stepperActive() && stepperKey(key)) {
    e.preventDefault()
    render()
    return
  }
```

(i) After the Values functions from Task 3, add the pacing:

```js
// Count pacing: each dealt round is revealed card by card, then a pause, then the next deal or the due check.
function reactCount(prev, event) {
  const count = state.drill?.mode === 'count' ? state.drill.count : null
  if (!count) return
  if (event.type === 'startDrill') {
    if (prev.drill?.count) resumeCount(count)
    else startCountReveal(count) // the first visit dealt the first round
    return
  }
  if (event.type === 'countNext') {
    if (count.question) openQuestion(count)
    else startCountReveal(count)
    return
  }
  if (event.type === 'countAnswer') {
    const { feedback } = count
    if (feedback.question === 'runningCount') ui.lastRunningCount = feedback.expected
    const { title, detail } = countFeedbackParts(feedback)
    announce(`${title}. ${detail}`)
    if (feedback.correct) scheduleCount(AUTO_ADVANCE_MS)
  }
}

function startCountReveal(count) {
  if (count.newShoe) ui.lastRunningCount = 0
  ui.countSerial++
  ui.countSeen.clear()
  const total = revealSteps(count.round).length
  // With reduced motion the round shows at once and stays up as long as its reveal would have taken.
  ui.countShown = reducedMotion ? total : 1
  scheduleCount(reducedMotion ? (total + ROUND_PAUSE_CARDS) * cardMs() : cardMs())
}

// Back on the Count tab: the round shows in full, and the drill carries on from where it stopped.
function resumeCount(count) {
  ui.countShown = Infinity
  if (!count.question) scheduleCount(ROUND_PAUSE_CARDS * cardMs())
  else if (count.feedback?.correct) scheduleCount(AUTO_ADVANCE_MS)
}

function openQuestion(count) {
  ui.stepper = count.question === 'runningCount' ? String(ui.lastRunningCount) : '0'
  ui.stepperTyped = false
  announce(t(`ask.${count.question}`))
}

// One reveal tick: the next card; after the last card, the pause; after the pause, the next step.
function countStep() {
  const total = revealSteps(state.drill.count.round).length
  if (ui.countShown >= total) {
    dispatch({ type: 'countNext' })
    return
  }
  ui.countShown++
  render()
  scheduleCount(ui.countShown >= total ? ROUND_PAUSE_CARDS * cardMs() : cardMs())
}

// The Count drill's one timer: a reveal step while dealing, or moving on after a right answer.
function scheduleCount(ms) {
  clearCountTimer()
  countTimer = setTimeout(() => {
    countTimer = null
    if (!countActive()) return
    const { question, feedback } = state.drill.count
    if (!question) countStep()
    else if (feedback?.correct) dispatch({ type: 'countNext' })
  }, ms)
}

function clearCountTimer() {
  clearTimeout(countTimer)
  countTimer = null
}

function countActive() {
  return ui.tab === 'train' && state.drill?.mode === 'count'
}

function cardMs() {
  return COUNT_CARD_MS[state.countSpeed]
}

// The order a Count round appears in: the deal (hole card face down), each Hand's draws in turn, then the
// hole card turning over and the dealer's draws. Split Hands show side by side from the start.
function revealSteps(round) {
  const player = round.hands.flatMap((hand, h) => hand.cards.map((_, c) => ({ hand: h, card: c })))
  const [first, second, ...rest] = player
  const dealerDraws = round.dealer.slice(2).map((_, i) => ({ dealer: i + 2 }))
  return [first, { dealer: 0 }, second, { back: true }, ...rest, { dealer: 1 }, ...dealerDraws]
}

function countVisibility(round, shown) {
  const steps = revealSteps(round)
  const seen = steps.slice(0, shown)
  const dealerUp = seen.filter((step) => step.dealer !== undefined).length // face-up dealer cards, in order
  return {
    hands: round.hands.map((_, h) => seen.filter((step) => step.hand === h).length),
    dealerUp,
    holeBack: seen.some((step) => step.back) && dealerUp < 2,
    complete: shown >= steps.length,
  }
}

function stepperValue() {
  return Number(ui.stepper) || 0 // '', '-' and '-0' all answer 0
}

function stepperDisplay() {
  return ui.stepper === '-' ? '−' : signed(stepperValue())
}

function stepperActive() {
  const count = countActive() ? state.drill.count : null
  return Boolean(count && !count.feedback && (count.question === 'runningCount' || count.question === 'trueCount'))
}

// Typing replaces the pre-filled count; after that digits append, '-' flips the sign, Backspace deletes.
function stepperKey(key) {
  const text = ui.stepperTyped ? ui.stepper : ''
  if (/^[0-9]$/.test(key)) {
    if (text.replace('-', '').length >= STEPPER_MAX_DIGITS) return true
    ui.stepper = text + key
  } else if (key === '-') {
    ui.stepper = text.startsWith('-') ? text.slice(1) : `-${text}`
  } else if (key === 'backspace') {
    ui.stepper = ui.stepper.slice(0, -1)
  } else {
    return false
  }
  ui.stepperTyped = true
  return true
}
```

- [ ] **Step 3: The Count screen**

In `app/app.js`, add the Count stats to `trainStats`, directly after its `values` line:

```js
  if (drill.mode === 'count') {
    const { session } = drill.count
    return stat(t('checks'), `${fmt(session.correct)}/${fmt(session.total)}`) + stat(t('accuracy'), pct(state.checkAccuracy))
  }
```

After `valueButtons`, add:

```js
// Count: the Train felt plus the Discard tray. The controls row swaps between speed, stepper, Bet and Next,
// all one height.
function countScreen(count) {
  const { round, question, feedback } = count
  const vis = countVisibility(round, ui.countShown)
  const needsNext = Boolean(feedback && !feedback.correct)
  const stepping = question === 'runningCount' || question === 'trueCount'
  return `
    <section class="table count">
      ${discardTray(count.halfDecksDealt)}
      ${countDealerHtml(round, vis)}
      ${countMessage(count)}
      <div class="hands${handsClass(round)}">${round.hands.map((hand, i) => countHandHtml(hand, i, vis)).join('')}</div>
    </section>
    <footer class="controls">
      <div class="panel${question ? ' off' : ''}">${speedSwitch(!question)}</div>
      <div class="panel${stepping && !needsNext ? '' : ' off'}">${stepperHtml(stepping && !feedback)}</div>
      <div class="panel${question === 'bet' && !needsNext ? '' : ' off'}">${betButtons(question === 'bet' && !feedback)}</div>
      <div class="panel next${needsNext ? '' : ' off'}">
        <button class="primary wide" data-do="countNext" data-k="next" ${needsNext ? '' : 'disabled'}>${t('next')}<kbd>↵</kbd></button>
      </div>
      <p class="keys muted small">${t('keysCount')}</p>
    </footer>`
}

function countDealerHtml(round, vis) {
  const key = (i) => `c${ui.countSerial}-d${i}`
  const cards = round.dealer
    .slice(0, vis.dealerUp)
    .map((card, i) => cardFace(card, key(i), ui.countSeen, i === 1 ? 'flip' : 'enter')) // the hole card turns over
  if (vis.holeBack) cards.push(cardBack(key('back'), ui.countSeen))
  const total = vis.complete ? ` · <strong>${totalLabel(round.dealer)}</strong>` : ''
  return `<div class="dealer"><div class="label">${t('dealer')}${total}</div><div class="cards">${cards.join('')}</div></div>`
}

function countHandHtml(hand, i, vis) {
  const shown = hand.cards.slice(0, vis.hands[i])
  const cards = shown.map((card, j) => cardFace(card, `c${ui.countSerial}-h${i}-${j}`, ui.countSeen))
  const total = shown.length > 0 ? `<strong>${totalLabel(shown)}</strong>` : ''
  const result = vis.complete ? ` <span class="badge ${hand.result}">${t(`result.${hand.result}`)}</span>` : ''
  return `<div class="hand"><div class="cards">${cards.join('')}</div><div class="meta">${total}${result}</div></div>`
}

function countMessage(count) {
  const { question, feedback } = count
  if (feedback) {
    const { kind, title, detail } = countFeedbackParts(feedback)
    return feltMessage(kind, title, detail)
  }
  if (question) return feltMessage('hint', t(`ask.${question}`), t(`askSub.${question}`))
  if (count.newShoe) return feltMessage('hint', t('newShoe'), t('newShoeSub'))
  return feltMessage('', t('feltCount'), t('feltCountSub'))
}

// The verdict on a Count-check answer, with the working for the True count and the Bet.
function countFeedbackParts(feedback) {
  const { question, correct, expected, answer } = feedback
  const shown = (n) => (question === 'bet' ? units(n) : signed(n))
  const what = t(`label.${question}`)
  const title = correct ? `✓ ${what}: ${shown(expected)}` : `✗ ${t('itWas', { what, n: shown(expected) })}`
  let detail = correct ? t('carryOn') : t('youSaid', { n: shown(answer) })
  if (question === 'trueCount') {
    const { runningCount, decksLeft, exact } = feedback
    detail = t('tcWorking', { rc: signed(runningCount), decks: fmt(decksLeft), exact: signed(exact), tc: signed(expected) })
  }
  if (question === 'bet') detail = t('betWorking', { tc: signed(feedback.trueCount), units: units(expected) })
  return { kind: correct ? 'good' : 'bad', title, detail }
}

function units(n) {
  return t(n === 1 ? 'betUnit' : 'betUnits', { n })
}

// The Discard tray: a line at each deck, a tick at each half deck, filled in half-deck steps. Reading it is
// the skill, so it shows no number; screen readers get the decks dealt in its label.
function discardTray(halfDecks) {
  const label = esc(t('trayLabel', { n: fmt(halfDecks / 2) }))
  return `<div class="tray" role="img" aria-label="${label}"><div class="tray-fill" style="--half-decks: ${halfDecks}"></div></div>`
}

function speedSwitch(enabled) {
  const buttons = COUNT_SPEEDS.map(
    (speed, i) =>
      `<button role="tab" aria-selected="${state.countSpeed === speed}" data-do="countSpeed" data-speed="${speed}" data-k="speed-${speed}" ${enabled ? '' : 'disabled'}>${t(`speed.${speed}`)}<kbd>${i + 1}</kbd></button>`,
  )
  return `<div class="segmented speed" role="tablist">${buttons.join('')}</div>`
}

function stepperHtml(enabled) {
  const off = enabled ? '' : 'disabled'
  return `<div class="stepper">
    <button data-do="stepperAdjust" data-by="-1" data-k="stepper-minus" aria-label="${t('oneLess')}" ${off}>−<kbd>←</kbd></button>
    <output class="stepper-value">${stepperDisplay()}</output>
    <button data-do="stepperAdjust" data-by="1" data-k="stepper-plus" aria-label="${t('oneMore')}" ${off}>+<kbd>→</kbd></button>
    <button class="primary" data-do="stepperOk" data-k="stepper-ok" ${off}>${t('answerOk')}<kbd>↵</kbd></button>
  </div>`
}

function betButtons(enabled) {
  const buttons = Array.from({ length: MAX_BET_UNITS }, (_, i) => i + 1).map(
    (n) =>
      `<button data-do="countAnswer" data-answer="${n}" data-k="bet-${n}" aria-label="${esc(units(n))}" ${enabled ? '' : 'disabled'}>${n}</button>`,
  )
  return `<div class="bet-row">${buttons.join('')}</div>`
}
```

- [ ] **Step 4: Styles**

In `app/style.css`, after the Task 3 `.values-row button` rule, add:

```css
/* Count: the Discard tray in the felt's corner. 12 half decks × 7px; a line at each deck, a tick at each half. */
.tray {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 22px;
  height: 84px;
  display: flex;
  align-items: flex-end;
  border: 2px solid rgb(240 249 243 / 0.55);
  border-top: 0;
  border-radius: 0 0 5px 5px;
  background: rgb(0 0 0 / 0.2);
}
.tray::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(to top, transparent 0 13px, rgb(240 249 243 / 0.75) 13px 14px),
    repeating-linear-gradient(to top, transparent 0 6px, rgb(240 249 243 / 0.45) 6px 7px) left / 6px 100% no-repeat;
  pointer-events: none;
}
.tray-fill {
  width: 100%;
  height: calc(var(--half-decks) * 7px);
  background: repeating-linear-gradient(to top, var(--back-a) 0 2px, #f3ece0 2px 3px);
  transition: height 0.3s ease-out;
}
.stepper {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1fr 1.4fr;
  gap: 8px;
  align-items: center;
}
.stepper button {
  height: var(--control-h);
  font-size: 22px;
}
.stepper button.primary {
  font-size: 16px;
}
.stepper-value {
  text-align: center;
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}
.bet-row {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
}
.bet-row button {
  height: var(--control-h);
  padding: 0;
  font-size: 18px;
}
/* The speed switch fills the controls row: buttons + the segmented padding and border = one control height. */
.segmented.speed {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
.segmented.speed button {
  height: calc(var(--control-h) - 6px);
}
```

In the `@media (prefers-reduced-motion: reduce)` block, add `.tray-fill` to the rule so it reads:

```css
  .card.enter,
  .card.flip,
  .tray-fill {
    animation: none;
    transition: none;
  }
```

- [ ] **Step 5: Unit tests still pass**

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 115`, `ℹ fail 0`.

- [ ] **Step 6: Browser QA — a Count run at Fast, answered from the cards on screen**

This is the check that the reveal shows every card before a check, which the engine tests can't see. The QA keeps its own count of the ranks it sees on screen, reads the tray's label, and answers. Every answer should come back ✓, except one wrong on purpose, which should come back ✗ and wait for Next.

Create `qa/qa-count.mjs`:

```js
import { launch, sleep } from './cdp.mjs'
const rects = `(() => {
  const r = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b ? [Math.round(b.top), Math.round(b.height)] : null }
  return JSON.stringify({ table: r('.table'), felt: r('.felt-print'), controls: r('.controls') })
})()`
const probe = `(() => {
  const q = (sel) => document.querySelector(sel)
  return {
    done: !!q('.table.count .badge'),
    ranks: [...document.querySelectorAll('.table.count .card:not(.back) .rank')].map((el) => el.textContent),
    felt: q('.felt-print')?.innerText ?? '',
    stepper: !!q('[data-k=stepper-ok]:not([disabled])'),
    bet: !!q('[data-k=bet-1]:not([disabled])'),
    tray: q('.tray')?.getAttribute('aria-label') ?? '',
  }
})()`
const HI_LO = { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0, 9: 0, 10: -1, J: -1, Q: -1, K: -1, A: -1 }
const trueCountOf = (rc, tray) => Math.trunc(rc / (6 - Number(tray.match(/[\d.]+/)[0]))) || 0

async function typeAnswer(b, n) {
  for (const ch of String(n)) await b.key(ch, 40) // '-' then the digits: typing replaces the pre-filled value
  await b.key('Enter', 150)
}

async function run(width, height, desktop, port) {
  const b = await launch({ port, realSdk: true })
  const layouts = new Set()
  const log = []
  try {
    await b.viewport(width, height, true, desktop)
    await b.goto('http://localhost:8765/?name=Z', 300)
    await b.eval('localStorage.clear()')
    await b.goto('http://localhost:8765/?name=Z', 800)
    await b.key('Escape', 200) // the first-launch chip picker
    await b.click('[data-k=tab-train]', 300)
    await b.click('[data-k=mode-count]', 100)
    await b.key('3', 100) // Fast
    let seen = []
    let counted = false
    let checks = 0
    for (let tick = 0; tick < 3000 && checks < 4; tick++) {
      const p = await b.eval(probe)
      layouts.add(await b.eval(rects))
      if (!p.done) counted = false
      else if (!counted) {
        if (p.felt.includes('New Shoe')) seen = []
        seen.push(...p.ranks)
        counted = true
      }
      const rc = seen.reduce((sum, rank) => sum + HI_LO[rank], 0)
      if (p.stepper && p.felt.includes('Running count?')) {
        const wrongOnPurpose = checks === 1
        await typeAnswer(b, wrongOnPurpose ? rc + 1 : rc)
        log.push({ q: 'running', rc, verdict: (await b.eval(probe)).felt.split('\n')[0] })
        layouts.add(await b.eval(rects))
        if (wrongOnPurpose) await b.key('Enter', 200) // Next
        else await sleep(700)
      } else if (p.stepper) {
        const tc = trueCountOf(rc, p.tray)
        await typeAnswer(b, tc)
        log.push({ q: 'true', tc, verdict: (await b.eval(probe)).felt.split('\n')[0] })
        await sleep(700)
      } else if (p.bet) {
        const bet = Math.min(Math.max(trueCountOf(rc, p.tray) - 1, 1), 8)
        await b.key(String(bet), 150)
        log.push({ q: 'bet', bet, verdict: (await b.eval(probe)).felt.split('\n')[0] })
        layouts.add(await b.eval(rects))
        checks++
        if (checks === 2 && !desktop) await b.shot('count-phone')
        await sleep(700)
      } else await sleep(60)
    }
    console.table(log)
    await b.goto('http://localhost:8765/?name=Z', 800)
    await b.click('[data-k=tab-train]', 300)
    await b.click('[data-k=mode-count]', 300)
    console.log('speed after reload:', await b.eval(`document.querySelector('[data-k=speed-fast]').getAttribute('aria-selected')`))
    console.log(`${width}x${height}: ${layouts.size} distinct layout(s)`, [...layouts][0])
    console.log('errors:', b.errors)
  } finally {
    b.close()
  }
}
await run(1920, 1080, true, 9383)
await run(390, 844, false, 9384)
```

Run: `cd /tmp/claude-1000/-opt-projects-blackjack/3679f096-99b4-4e78-8a8f-4f20d3575227/scratchpad/qa && node qa-count.mjs`
Expected, for each viewport:
- `console.table` lists 12 answers (4 checks × 3). Every verdict starts with `✓`, except the second check's running count, which starts with `✗ Running count was …`.
- `speed after reload: true`.
- `1 distinct layout(s)`.
- `errors: []`.

A `✓` running count proves every card was shown before the check. A `✗` anywhere else means the reveal hid a card, or the screen and the engine disagree. Debug with superpowers:systematic-debugging; don't loosen the QA.

Look at `qa/count-phone.png`: the tray in the corner, the Bet question with 1–8 buttons, four tabs on one row, and Checks and Accuracy underneath.

- [ ] **Step 7: Browser QA — the whole of Train stays put**

Run: `node qa-values.mjs 2>&1 | grep -E 'distinct|errors' && node qa-train-stable.mjs && node qa-stable.mjs 2>&1 | grep -E 'distinct|errors'`
Expected: every run shows `1 distinct layout(s)` and `errors: []`.

- [ ] **Step 8: Commit**

```bash
git add app/app.js app/style.css app/strings.js
git commit -m "Train: Count drill screen — card-by-card reveal, Discard tray, Count checks"
```

---

### Task 5: Improve's Counting block, docs, full verification

**Files:**
- Modify: `app/app.js`, `app/strings.js`, `README.md`, `.scratch/blackjack-lab/spec.md`, `.scratch/card-counting/spec.md`
- QA (scratchpad): new `qa/qa-improve-counting.mjs`

**Interfaces:**
- Consumes: `state.sprintBest`, `state.stats.counting` (Task 1), and the `label.*` and `bestSprint` strings (Tasks 3–4).
- Produces: the finished feature.

- [ ] **Step 1: Strings**

In `app/strings.js`, add to `en`:

```js
    countingTitle: 'Card counting',
    countValues: 'Count values',
    sprintUnit: 'cards in 30 s',
```

and to `mn`:

```js
    countingTitle: 'Карт тоолох',
    countValues: 'Картын утга',
    sprintUnit: '30 секундэд',
```

Replace `resetConfirm` in `en` with:

```js
    resetConfirm: 'Reset your accuracy, mistakes, table results and counting accuracy? Chips, streaks and your best sprint stay.',
```

and in `mn` with:

```js
    resetConfirm: 'Нарийвчлал, алдаа, ширээний үр дүн, тоолох нарийвчлалыг арилгах уу? Жетон, цуврал, шилдэг спринт хэвээр үлдэнэ.',
```

- [ ] **Step 2: The Counting block**

In `app/app.js`:
- Replace `accuracyHtml` with the version below, which moves its tile out so the Counting block shares it.
- Add `countingHtml` after it.
- In `improveScreen`, add `<section class="block">${countingHtml()}</section>` directly after the `playStatsHtml` section.

```js
function accuracyTile(key, tally) {
  return `<div class="tile"><span class="label">${t(key)}</span><strong>${pct(tally)}</strong><span class="muted small">${t('ofDecisions', tally)}</span></div>`
}

function accuracyHtml(accuracy) {
  return `<div class="hero">${pct(accuracy.overall)}<span class="muted small">${t('ofDecisions', accuracy.overall)}</span></div>
    <div class="tiles">${accuracyTile('group.hard', accuracy.hard)}${accuracyTile('group.soft', accuracy.soft)}${accuracyTile('group.pairs', accuracy.pairs)}</div>`
}

// Counting progress: the Best sprint, then each counting skill's accuracy.
function countingHtml() {
  const { counting } = state.stats
  return `<h2>${t('countingTitle')}</h2>
    <div class="tiles">
      <div class="tile"><span class="label">${t('bestSprint')}</span><strong>${fmt(state.sprintBest)}</strong><span class="muted small">${t('sprintUnit')}</span></div>
      ${accuracyTile('countValues', counting.values)}
      ${accuracyTile('label.runningCount', counting.runningCount)}
      ${accuracyTile('label.trueCount', counting.trueCount)}
      ${accuracyTile('label.bet', counting.bet)}
    </div>`
}
```

- [ ] **Step 3: Docs**

- `.scratch/card-counting/spec.md`: change `Status: ready-for-agent` to `Status: done`.
- `.scratch/blackjack-lab/spec.md`: directly under the `- **Train:** …` summary bullet (line 16), add:

```markdown
  - Since sub-project 4, Train also teaches Hi-Lo card counting (the Values and Count drills): see `.scratch/card-counting/spec.md`.
```

- `README.md`:
  - Change the first line to `Play blackjack, drill basic strategy, learn Hi-Lo card counting, and track your accuracy. It's a solo Usion mini-app built as a static site with vanilla JS, no build step and no dependencies.`
  - At the end of the "On desktop: …" sentence, add: ` In Values, ← ↓ → (or 1 2 3) answer −1 / 0 / +1. In Count, 1 2 3 set the speed, digits and − type a count, ← → adjust it, Enter answers, and 1–8 pick the Bet.`

- [ ] **Step 4: Full verification**

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 115`, `ℹ pass 115`, `ℹ fail 0`.

Create `qa/qa-improve-counting.mjs`:

```js
import { launch } from './cdp.mjs'
const b = await launch({ port: 9385, realSdk: true })
try {
  await b.viewport(390, 844, false, false)
  await b.goto('http://localhost:8765/?name=Z', 300)
  await b.eval('localStorage.clear()')
  await b.goto('http://localhost:8765/?name=Z', 800)
  await b.key('Escape', 200)
  await b.click('[data-k=tab-train]', 300)
  await b.click('[data-k=mode-values]', 300)
  await b.key('Enter', 200)
  for (let i = 0; i < 5; i++) await b.key('ArrowDown', 60) // any five answers
  await b.click('[data-k=tab-improve]', 400) // leaving Train ends the sprint
  const block = await b.eval(`[...document.querySelectorAll('.block')].find((el) => el.querySelector('h2')?.textContent === 'Card counting')?.innerText`)
  console.log(block)
  await b.shot('improve-counting')
  console.log('errors:', b.errors)
} finally {
  b.close()
}
```

Run, in the scratchpad `qa/` folder:
- `node qa-improve-counting.mjs`. Expected:
  - the Card counting block lists Best sprint (the partial sprint's score), Count values "…% · … of 5 correct", and "—" for the three check skills;
  - `errors: []`;
  - `improve-counting.png` looks right.
- `node qa-values.mjs && node qa-count.mjs && node qa-train-stable.mjs && node qa-stable.mjs && node qa-auto2.mjs && node qa-bankroll.mjs`. Expected: every layout line is `1 distinct layout(s)`, every `errors: []`, and the Play regressions print what they printed before this branch.

- [ ] **Step 5: Commit**

```bash
git add app/app.js app/strings.js README.md .scratch/blackjack-lab/spec.md .scratch/card-counting/spec.md
git commit -m "Improve: Card counting block; docs: card counting is done"
```

---

## Finish

Use superpowers:finishing-a-development-branch for `card-counting` → `master`. Deploying (`scripts/deploy-pages.sh`) is a separate step and happens only when the user asks.

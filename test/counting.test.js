import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newLab, step, snapshot, MAX_BET_UNITS } from '../app/engine.js'

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

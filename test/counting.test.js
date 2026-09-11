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

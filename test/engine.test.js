import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newLab, step, snapshot, bookAction, CHART_ROWS, UPCARDS } from '../app/engine.js'

// mulberry32: tiny seeded PRNG so shuffles and drills are reproducible.
function seeded(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Stacked cards are in deal order: player, dealer Upcard, player, dealer Hole card, then draws.
const lab = (cards = [], saved = null) => newLab(saved, { rng: seeded(), cards })
const run = (state, ...events) => events.reduce(step, state)
const deal = { type: 'deal' }
const act = (action) => ({ type: 'act', action })
const bet = (chip) => ({ type: 'bet', chip })
const clearBet = { type: 'clearBet' }
const rebet = { type: 'rebet' }

// ---------------------------------------------------------------- Round basics

test('first launch: 1,000 Chips and a Bet of 10 ready', () => {
  const s = lab()
  assert.equal(s.bankroll, 1000)
  assert.equal(s.pendingBet, 10)
  assert.equal(s.canDeal, true)
  assert.equal(s.round, null)
})

test('Blackjack pays 3:2 immediately', () => {
  const s = run(lab(['A', '6', 'K', '5']), deal)
  assert.equal(s.round.phase, 'settled')
  assert.equal(s.round.hands[0].result, 'blackjack')
  assert.equal(s.bankroll, 1015)
  assert.equal(s.round.net, 15)
})

test('Blackjack on an odd Bet pays exactly 3:2 in half Chips', () => {
  const s = run(lab(['A', '6', 'K', '5']), clearBet, bet(25), deal)
  assert.equal(s.bankroll, 1037.5)
})

test('deal deducts the Bet and starts the player turn', () => {
  const s = run(lab(['10', '9', '7', '8']), deal)
  assert.equal(s.round.phase, 'player')
  assert.equal(s.bankroll, 990)
  assert.deepEqual(s.round.allowed, ['hit', 'stand', 'double'])
})

test('dealer Peeks: dealer Blackjack ends the Round and takes only the original Bet', () => {
  const s = run(lab(['10', 'A', '7', 'K']), deal)
  assert.equal(s.round.phase, 'settled')
  assert.equal(s.round.hands[0].result, 'lose')
  assert.equal(s.bankroll, 990)
})

test('dealer Peeks with a ten-value Upcard too', () => {
  const s = run(lab(['9', 'Q', '9', 'A']), deal)
  assert.equal(s.round.phase, 'settled')
  assert.equal(s.bankroll, 990)
})

test('Blackjack against dealer Blackjack is a Push', () => {
  const s = run(lab(['A', 'A', 'K', 'Q']), deal)
  assert.equal(s.round.hands[0].result, 'push')
  assert.equal(s.bankroll, 1000)
})

test('standing on a higher total wins 1:1', () => {
  const s = run(lab(['10', '9', '10', '8']), deal, act('stand'))
  assert.equal(s.round.hands[0].result, 'win')
  assert.equal(s.bankroll, 1010)
})

test('equal totals Push', () => {
  const s = run(lab(['10', '10', '8', '8']), deal, act('stand'))
  assert.equal(s.round.hands[0].result, 'push')
  assert.equal(s.bankroll, 1000)
})

test('dealer stands on soft 17', () => {
  // Dealer A,6 = soft 17. Player 10,7 = 17 → Push, and the dealer draws nothing.
  const s = run(lab(['10', 'A', '7', '6', '5']), deal, act('stand'))
  assert.equal(s.round.dealer.length, 2)
  assert.equal(s.round.hands[0].result, 'push')
})

test('dealer hits soft 16 and hard 16', () => {
  // Dealer A,5 = soft 16 → draws 10 → hard 16 → draws 5 → 21.
  const s = run(lab(['10', 'A', '9', '5', '10', '5']), deal, act('stand'))
  assert.deepEqual(s.round.dealer.map((c) => c.rank), ['A', '5', '10', '5'])
  assert.equal(s.round.hands[0].result, 'lose')
})

test('a Busted Hand loses and the dealer does not draw', () => {
  const s = run(lab(['10', '6', '6', '10', 'K', '9']), deal, act('hit'))
  assert.equal(s.round.phase, 'settled')
  assert.equal(s.round.hands[0].result, 'bust')
  assert.equal(s.round.dealer.length, 2)
  assert.equal(s.bankroll, 990)
})

test('a Busted Hand loses even when the dealer Busts', () => {
  // 8,8 vs 6 split: 8,4 hits K and Busts; 8,10 stands; dealer 6,10 draws 10 and Busts.
  const s = run(lab(['8', '6', '8', '10', '4', '10', 'K', '10']), deal, act('split'), act('hit'), act('stand'))
  assert.deepEqual(s.round.hands.map((h) => h.result), ['bust', 'win'])
  assert.equal(s.round.dealer.length, 3)
})

test('dealer Bust pays every standing Hand', () => {
  const s = run(lab(['10', '6', '8', '10', '10']), deal, act('stand'))
  assert.equal(s.round.hands[0].result, 'win')
  assert.equal(s.bankroll, 1010)
})

test('a Hand reaching 21 stands automatically', () => {
  const s = run(lab(['5', '10', '6', '7', '10']), deal, act('hit'))
  assert.equal(s.round.phase, 'settled')
  assert.equal(s.round.hands[0].result, 'win')
})

// A valid saved Lab, for starting from a given Bankroll or history.
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

// ---------------------------------------------------------------- Double and Split

test('Double adds an equal Bet and deals exactly one card', () => {
  const s = run(lab(['6', '6', '5', '10', '9', '10']), deal, act('double'))
  const hand = s.round.hands[0]
  assert.equal(hand.cards.length, 3)
  assert.equal(hand.bet, 20)
  assert.equal(hand.result, 'win')
  assert.equal(s.bankroll, 1020)
})

test('no Double on three cards', () => {
  const s = run(lab(['2', '9', '3', '8', '4']), deal, act('hit'))
  assert.deepEqual(s.round.allowed, ['hit', 'stand'])
  assert.throws(() => step(s, act('double')), /not allowed/)
})

test('Split makes two Hands with equal Bets, and Double after Split is allowed', () => {
  const s = run(lab(['8', '9', '8', '10', '3', '2', 'K', '9']), deal, act('split'))
  assert.equal(s.round.hands.length, 2)
  assert.deepEqual(s.round.hands.map((h) => h.bet), [10, 10])
  assert.equal(s.bankroll, 980)
  assert.deepEqual(s.round.allowed, ['hit', 'stand', 'double'])

  const end = run(s, act('double'), act('double'))
  assert.deepEqual(end.round.hands.map((h) => h.result), ['win', 'push'])
  assert.equal(end.round.net, 20)
  assert.equal(end.bankroll, 1020)
})

test('re-split up to four Hands, then no more', () => {
  const s = run(
    lab(['8', '10', '8', '10', '8', '8', '8', '2', '3', '4']),
    deal, act('split'), act('split'), act('split'),
    act('stand'), act('stand'), act('stand'),
  )
  assert.equal(s.round.hands.length, 4)
  assert.equal(s.round.active, 3)
  assert.deepEqual(s.round.allowed, ['hit', 'stand', 'double'])
})

test('two different ten-value cards can be Split', () => {
  const s = run(lab(['K', '9', '10', '8']), deal)
  assert.ok(s.round.allowed.includes('split'))
})

test('split aces get one card each and the Round moves on', () => {
  const s = run(lab(['A', '9', 'A', '10', 'K', '5']), deal, act('split'))
  assert.equal(s.round.phase, 'settled')
  assert.deepEqual(s.round.hands.map((h) => h.cards.length), [2, 2])
})

test('21 on a split Hand pays 1:1, not 3:2', () => {
  const s = run(lab(['A', '9', 'A', '10', 'K', '5']), deal, act('split'))
  assert.equal(s.round.hands[0].result, 'win')
  assert.equal(s.round.hands[0].payout, 20)
  assert.equal(s.bankroll, 1000)
})

test('Double and Split are refused when the Bankroll cannot cover them', () => {
  const s = run(lab(['8', '9', '8', '10'], saved({ bankroll: 30 })), clearBet, bet(25), deal)
  assert.deepEqual(s.round.allowed, ['hit', 'stand'])
})

// ---------------------------------------------------------------- betting

test('chips that would pass 500 or the Bankroll are disabled', () => {
  const s = run(lab(), bet(100), bet(100), bet(100), bet(100))
  assert.equal(s.pendingBet, 410)
  assert.deepEqual(s.chipsEnabled, [10, 25])
  assert.throws(() => step(s, bet(100)), /table maximum/)
})

test('Clear empties the Bet, and Deal needs the table minimum', () => {
  const s = run(lab(), clearBet)
  assert.equal(s.pendingBet, 0)
  assert.equal(s.canDeal, false)
  assert.throws(() => step(s, deal), /cannot deal/)
})

test('after Settlement the last Bet is ready again, and Rebet restores it after Clear', () => {
  const s = run(lab(['10', '9', '10', '8']), clearBet, bet(25), deal, act('stand'))
  assert.equal(s.pendingBet, 25)
  assert.equal(run(s, clearBet, rebet).pendingBet, 25)
})

test('betting is closed during a Round', () => {
  const s = run(lab(['10', '9', '7', '8']), deal)
  assert.throws(() => step(s, bet(10)), /closed/)
})

test('unknown events throw', () => {
  assert.throws(() => step(lab(), { type: 'nope' }), /unknown event/)
})

// ---------------------------------------------------------------- Chips, Refill, Shoe

test('Refill to 1,000 when the Bankroll drops below 10; Refills are not net Chips', () => {
  const s = run(lab(['10', '9', '6', '10'], saved({ bankroll: 15 })), deal, act('stand'))
  assert.equal(s.bankroll, 1000)
  assert.equal(s.refilled, true)
  assert.equal(s.stats.play.net, -10)
  assert.equal(run(s, clearBet).refilled, false)
})

test('Play stats count Hands, results and net Chips', () => {
  const s = run(lab(['8', '9', '8', '10', '3', '2', 'K', '9']), deal, act('split'), act('double'), act('double'))
  assert.deepEqual(s.stats.play, { hands: 2, wins: 1, losses: 0, pushes: 1, net: 20 })
})

test('cards left counts down from 312', () => {
  const s = lab()
  assert.equal(s.cardsLeft, 312)
  assert.equal(run(s, deal).cardsLeft, 308)
})

test('the Shoe reshuffles only after the Round in which the Cut card comes out', () => {
  let s = lab()
  let reshuffles = 0
  for (let round = 0; round < 200; round++) {
    const before = s.cardsLeft
    s = step(s, deal)
    while (s.round.phase === 'player') s = step(s, act('stand'))
    const used = s.round.dealer.length + s.round.hands.reduce((n, h) => n + h.cards.length, 0)
    if (s.cardsLeft === 312) {
      reshuffles++
      assert.ok(312 - before + used >= 234, 'reshuffled before the Cut card')
    } else {
      assert.equal(s.cardsLeft, before - used)
      assert.ok(312 - s.cardsLeft < 234, 'missed the Cut card')
    }
  }
  assert.ok(reshuffles >= 3)
})

// ---------------------------------------------------------------- the Book

// Independent copy of the spec's chart (4-8 decks, S17, DAS, no surrender).
const EXPECTED_CHART = `
H8   H H H H H H H H H H
H9   H D D D D H H H H H
H10  D D D D D D D D H H
H11  D D D D D D D D D H
H12  H H S S S H H H H H
H13  S S S S S H H H H H
H14  S S S S S H H H H H
H15  S S S S S H H H H H
H16  S S S S S H H H H H
H17  S S S S S S S S S S
S13  H H H D D H H H H H
S14  H H H D D H H H H H
S15  H H D D D H H H H H
S16  H H D D D H H H H H
S17  H D D D D H H H H H
S18  S Ds Ds Ds Ds S S H H H
S19  S S S S S S S S S S
S20  S S S S S S S S S S
P2   P P P P P P H H H H
P3   P P P P P P H H H H
P4   H H H P P H H H H H
P5   D D D D D D D D H H
P6   P P P P P H H H H H
P7   P P P P P P H H H H
P8   P P P P P P P P P P
P9   P P P P P S P P S S
P10  S S S S S S S S S S
PA   P P P P P P P P P P`
  .trim()
  .split('\n')
  .map((line) => line.trim().split(/\s+/))

const c = (rank) => ({ rank, suit: 's' })
const ACTION_OF = { H: 'hit', S: 'stand', D: 'double', Ds: 'double', P: 'split' }
const TWO_CARD = ['hit', 'stand', 'double']
const PAIR = ['hit', 'stand', 'double', 'split']

// A two-card Hand that lands in the given chart row.
function representative(row) {
  const cls = row[0]
  const n = row.slice(1)
  if (cls === 'P') return n === '10' ? ['10', 'K'] : [n, n]
  if (cls === 'S') return ['A', String(n - 11)]
  return Number(n) <= 12 ? ['2', String(n - 2)] : [String(n - 10), '10']
}

test('the chart has 28 rows × 10 Upcards = 280 cells', () => {
  assert.deepEqual(UPCARDS, ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'])
  assert.deepEqual(CHART_ROWS.map((r) => r.id), EXPECTED_CHART.map(([id]) => id))
  assert.ok(CHART_ROWS.every((r) => r.codes.length === 10))
})

test('bookAction matches the Book in all 280 cells', () => {
  for (const [row, ...codes] of EXPECTED_CHART) {
    const allowed = row.startsWith('P') ? PAIR : TWO_CARD
    UPCARDS.forEach((up, i) => {
      const book = bookAction({ cards: representative(row).map(c), upcard: c(up), allowed })
      assert.equal(book.action, ACTION_OF[codes[i]], `${row} vs ${up}`)
      assert.equal(book.cell, `${row}-${up}`)
    })
  }
})

test('the chart layout carries each row group and its cell ids', () => {
  const h16 = CHART_ROWS.find((r) => r.id === 'H16')
  assert.equal(h16.group, 'hard')
  assert.equal(h16.cells[8], 'H16-10')
  assert.equal(CHART_ROWS.find((r) => r.id === 'S18').group, 'soft')
  assert.equal(CHART_ROWS.find((r) => r.id === 'PA').group, 'pairs')
})

test('the exported chart is the Book', () => {
  for (const [row, ...codes] of EXPECTED_CHART) {
    assert.deepEqual(CHART_ROWS.find((r) => r.id === row).codes, codes, row)
  }
})

test('ten-value Upcards share the 10 column', () => {
  const book = bookAction({ cards: [c('10'), c('6')], upcard: c('J'), allowed: TWO_CARD })
  assert.equal(book.cell, 'H16-10')
  assert.equal(book.action, 'hit')
})

test("can't Double: D falls back to Hit and Ds to Stand", () => {
  const hard11 = bookAction({ cards: [c('2'), c('4'), c('5')], upcard: c('6'), allowed: ['hit', 'stand'] })
  assert.deepEqual(hard11, { action: 'hit', rule: 'no-double', cell: 'H11-6' })
  const soft18 = bookAction({ cards: [c('A'), c('3'), c('4')], upcard: c('4'), allowed: ['hit', 'stand'] })
  assert.deepEqual(soft18, { action: 'stand', rule: 'no-double', cell: 'S18-4' })
})

test("can't Split: the Pair is played as its total, in its Pair cell", () => {
  const eights = (up) => bookAction({ cards: [c('8'), c('8')], upcard: c(up), allowed: TWO_CARD })
  assert.deepEqual(eights('10'), { action: 'hit', rule: 'no-split', cell: 'P8-10' })
  assert.deepEqual(eights('6'), { action: 'stand', rule: 'no-split', cell: 'P8-6' })
  const aces = bookAction({ cards: [c('A'), c('A')], upcard: c('6'), allowed: TWO_CARD })
  assert.deepEqual(aces, { action: 'hit', rule: 'no-split', cell: 'PA-6' })
})

test('multi-card Hands land in their total cell', () => {
  const book = bookAction({ cards: [c('4'), c('5'), c('7')], upcard: c('10'), allowed: ['hit', 'stand'] })
  assert.equal(book.cell, 'H16-10')
  const low = bookAction({ cards: [c('2'), c('2'), c('2')], upcard: c('5'), allowed: ['hit', 'stand'] })
  assert.equal(low.cell, 'H8-5')
})

test('every region has its Rule of thumb', () => {
  const rule = (cards, up, allowed = TWO_CARD) => bookAction({ cards: cards.map(c), upcard: c(up), allowed }).rule
  assert.equal(rule(['8', '8'], 'A', PAIR), 'aces-eights')
  assert.equal(rule(['A', 'A'], '6', PAIR), 'aces-eights')
  assert.equal(rule(['10', 'K'], '5', PAIR), 'never-tens')
  assert.equal(rule(['5', '5'], '6', PAIR), 'never-fives')
  assert.equal(rule(['7', '7'], '2', PAIR), 'small-pairs')
  assert.equal(rule(['6', '6'], '3', PAIR), 'sixes')
  assert.equal(rule(['4', '4'], '5', PAIR), 'fours')
  assert.equal(rule(['9', '9'], '7', PAIR), 'nines')
  assert.equal(rule(['2', '6'], '5'), 'hard-8')
  assert.equal(rule(['2', '7'], '3'), 'hard-9')
  assert.equal(rule(['2', '8'], '9'), 'hard-10')
  assert.equal(rule(['2', '9'], 'A'), 'hard-11')
  assert.equal(rule(['2', '10'], '4'), 'hard-12')
  assert.equal(rule(['5', '10'], '10'), 'stiff')
  assert.equal(rule(['7', '10'], 'A'), 'hard-17')
  assert.equal(rule(['A', '2'], '5'), 'soft-double')
  assert.equal(rule(['A', '7'], '9'), 'soft-18')
  assert.equal(rule(['A', '8'], '6'), 'soft-19')
})

// ---------------------------------------------------------------- Coach and Hint

const toggleHint = { type: 'toggleHint' }
const resetStats = { type: 'resetStats' }

test('Coach flags a Mistake after the Action, and the Hand plays on as chosen', () => {
  // Hard 16 vs 10: the Book hits. Standing is a Mistake.
  const s = run(lab(['10', '10', '6', '8']), deal, act('stand'))
  assert.deepEqual(s.coachFlag, { chosen: 'stand', book: 'hit', rule: 'stiff', cell: 'H16-10' })
  assert.equal(s.round.hands[0].result, 'lose')
  assert.deepEqual(s.stats.cells['H16-10'], { total: 1, correct: 0, pending: 2 })
  assert.deepEqual(s.stats.mistakes[0], {
    cell: 'H16-10', cards: ['10', '6'], upcard: '10', chosen: 'stand', book: 'hit', source: 'play',
  })
})

test('a Book-matching Decision raises no flag and is counted', () => {
  const s = run(lab(['10', '10', '6', '8', '4']), deal, act('hit'))
  assert.equal(s.coachFlag, null)
  assert.deepEqual(s.stats.cells['H16-10'], { total: 1, correct: 1, pending: 0 })
})

test('the Coach flag clears on the next event', () => {
  const s = run(lab(['10', '10', '6', '8']), deal, act('stand'), clearBet)
  assert.equal(s.coachFlag, null)
})

test('the Coach judges with the Actions actually allowed', () => {
  // A,3 vs 4 hits into A,3,4 = soft 18 with three cards: can't Double, so Stand is the Book.
  const s = run(lab(['A', '4', '3', '10', '4', '10']), deal, act('hit'), act('stand'))
  assert.equal(s.coachFlag, null)
  assert.deepEqual(s.stats.cells['S18-4'], { total: 1, correct: 1, pending: 0 })
})

test('Hint shows the Book action before acting, and hinted Decisions are not recorded', () => {
  const s = run(lab(['10', '10', '6', '8']), toggleHint, deal)
  assert.equal(s.hint, true)
  assert.deepEqual(s.hintAction, { action: 'hit', rule: 'stiff' })
  const after = step(s, act('stand'))
  assert.equal(after.coachFlag, null)
  assert.deepEqual(after.stats.cells, {})
  assert.deepEqual(after.stats.mistakes, [])
})

test('a Round in which the Hint was shown records no Decisions, even after turning it off', () => {
  const peeked = run(lab(['10', '10', '6', '8', '4']), deal, toggleHint, toggleHint, act('hit'))
  assert.deepEqual(peeked.stats.cells, {})
  const fromDeal = run(lab(['10', '10', '6', '8', '4']), toggleHint, deal, toggleHint, act('hit'))
  assert.deepEqual(fromDeal.stats.cells, {})
})

test('no Hint when the Hint is off', () => {
  assert.equal(run(lab(['10', '10', '6', '8']), deal).hintAction, null)
})

test('a Mistake makes its cell Pending until two consecutive Book-matching Decisions', () => {
  // Three Rounds of hard 16 vs 10: stand (Mistake), then hit, hit.
  const round = ['10', '10', '6', '8']
  let s = run(lab([...round, ...round, 'K', ...round, 'K']), deal, act('stand'))
  assert.equal(s.stats.cells['H16-10'].pending, 2)
  s = run(s, deal, act('hit'))
  assert.equal(s.stats.cells['H16-10'].pending, 1)
  s = run(s, deal, act('hit'))
  assert.equal(s.stats.cells['H16-10'].pending, 0)
})

test('accuracy is derived overall and by category', () => {
  const round = ['10', '10', '6', '8']
  const s = run(lab([...round, ...round, 'K']), deal, act('stand'), deal, act('hit'))
  assert.deepEqual(s.accuracy, {
    overall: { correct: 1, total: 2 },
    hard: { correct: 1, total: 2 },
    soft: { correct: 0, total: 0 },
    pairs: { correct: 0, total: 0 },
  })
})

// ---------------------------------------------------------------- snapshot

test('mid-Round the snapshot keeps the pre-deal Bankroll and last Bet (the Round would be voided)', () => {
  const s = run(lab(['8', '9', '8', '10', '3', '2']), clearBet, bet(25), deal, act('split'))
  assert.equal(s.bankroll, 950)
  assert.equal(snapshot(s).bankroll, 1000)
  assert.equal(snapshot(s).lastBet, 10)
})

test('newLab(snapshot(state)) round-trips all progress', () => {
  const s = run(lab(['10', '10', '6', '8']), toggleHint, toggleHint, clearBet, bet(25), deal, act('stand'))
  const snap = snapshot(s)
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap)
  const restored = newLab(snap, { rng: seeded(2) })
  assert.deepEqual(snapshot(restored), snap)
  assert.equal(restored.bankroll, 975)
  assert.equal(restored.pendingBet, 25)
})

test('unknown versions and malformed snapshots are rejected', () => {
  assert.throws(() => lab([], saved({ v: 2 })), /version/)
  assert.throws(() => lab([], saved({ bankroll: 'lots' })), /bankroll/)
  assert.throws(() => lab([], saved({ stats: null })), /stats/)
  assert.throws(() => lab([], saved({ stats: { cells: { 'H16-10': { total: 'x' } }, mistakes: [], play: saved().stats.play } })), /cell/)
  assert.throws(() => lab([], saved({ stats: { cells: {}, mistakes: [{ cell: 'H16-10' }], play: saved().stats.play } })), /mistake/)
  const offChart = { 'H99-Z': { total: 1, correct: 0, pending: 1 } }
  assert.throws(() => lab([], saved({ stats: { ...saved().stats, cells: offChart } })), /cell/)
  const badAction = { cell: 'H16-10', cards: ['10', '6'], upcard: '10', chosen: 'surrender', book: 'hit', source: 'play' }
  assert.throws(() => lab([], saved({ stats: { ...saved().stats, mistakes: [badAction] } })), /mistake/)
})

test('a saved Bankroll below the table minimum is Refilled on load', () => {
  const s = lab([], saved({ bankroll: 5 }))
  assert.equal(s.bankroll, 1000)
  assert.equal(s.canDeal, true)
})

test('Reset stats clears cells, Mistakes and Play stats, and keeps Chips, Hint and Streaks', () => {
  const history = saved({
    bankroll: 1234,
    lastBet: 25,
    hint: true,
    streak: 3,
    bestStreak: 7,
    stats: {
      cells: { 'H16-10': { total: 1, correct: 0, pending: 2 } },
      mistakes: [{ cell: 'H16-10', cards: ['10', '6'], upcard: '10', chosen: 'stand', book: 'hit', source: 'play' }],
      play: { hands: 5, wins: 2, losses: 3, pushes: 0, net: -30 },
    },
  })
  const s = step(lab([], history), resetStats)
  assert.deepEqual(s.stats, { cells: {}, mistakes: [], play: { hands: 0, wins: 0, losses: 0, pushes: 0, net: 0 } })
  assert.deepEqual(
    [s.bankroll, s.lastBet, s.hint, s.streak, s.bestStreak],
    [1234, 25, true, 3, 7],
  )
})

// ---------------------------------------------------------------- Drills and Streak

const startDrill = (mode) => ({ type: 'startDrill', mode })
const answer = (action) => ({ type: 'answer', action })
const next = { type: 'next' }
const right = (s) => answer(bookAction(s.drill.situation).action)
const wrong = (s) => answer(s.drill.situation.allowed.find((a) => a !== bookAction(s.drill.situation).action))
const pendingHistory = (cells) => saved({ stats: { ...saved().stats, cells } })

test('startDrill deals a Situation with the Actions it allows', () => {
  const s = run(lab(), startDrill('weighted'))
  assert.equal(s.drill.mode, 'weighted')
  assert.equal(s.drill.feedback, null)
  const { situation } = s.drill
  assert.ok(situation.cards.length >= 2)
  assert.ok(situation.upcard.rank)
  assert.ok(situation.allowed.includes('hit') && situation.allowed.includes('stand'))
})

test('a Book-matching answer extends the Streak and shows feedback', () => {
  let s = run(lab(), startDrill('weighted'))
  const book = bookAction(s.drill.situation)
  s = step(s, answer(book.action))
  assert.deepEqual(s.drill.feedback, { correct: true, chosen: book.action, book: book.action, rule: book.rule })
  assert.equal(s.streak, 1)
})

test('a Weighted-drill Mistake ends the Streak with a one-shot signal', () => {
  let s = run(lab(), startDrill('weighted'))
  for (let i = 0; i < 3; i++) s = run(s, right(s), next)
  s = step(s, wrong(s))
  assert.equal(s.drill.feedback.correct, false)
  assert.deepEqual(s.streakEnded, { length: 3, isNewBest: true })
  assert.deepEqual([s.streak, s.bestStreak], [0, 3])
  s = step(s, next)
  assert.equal(s.streakEnded, null)
  for (let i = 0; i < 2; i++) s = run(s, right(s), next)
  s = step(s, wrong(s))
  assert.deepEqual(s.streakEnded, { length: 2, isNewBest: false })
  assert.equal(s.bestStreak, 3)
})

test('a Mistake with no Streak raises no signal', () => {
  let s = run(lab(), startDrill('weighted'))
  s = step(s, wrong(s))
  assert.equal(s.streakEnded, null)
})

test('next only after answering, and each Situation is answered once', () => {
  const s = run(lab(), startDrill('weighted'))
  assert.throws(() => step(s, next), /answer/)
  const answered = step(s, right(s))
  assert.throws(() => step(answered, right(s)), /answered/)
})

test('answers must be allowed in the Situation', () => {
  let s = run(lab(), startDrill('weighted'))
  while (s.drill.situation.allowed.includes('split')) s = run(s, right(s), next)
  assert.throws(() => step(s, answer('split')), /not allowed/)
})

test('switching modes keeps an unanswered Weighted Situation (no skipping)', () => {
  const s = run(lab(), startDrill('weighted'))
  const back = run(s, startDrill('mistakes'), startDrill('weighted'))
  assert.deepEqual(back.drill.situation, s.drill.situation)
})

test('Mistakes-drill and Play Decisions leave the Streak alone', () => {
  const history = pendingHistory({ 'H16-10': { total: 1, correct: 0, pending: 2 } })
  let s = run(lab(['10', '10', '6', '8'], { ...history, streak: 4 }), startDrill('mistakes'))
  assert.equal(s.drill.situation.cell, 'H16-10')
  s = step(s, wrong(s))
  assert.equal(s.streak, 4)
  assert.equal(s.streakEnded, null)
  s = run(s, deal, act('stand'))
  assert.equal(s.coachFlag.chosen, 'stand')
  assert.equal(s.streak, 4)
})

test('the Mistakes drill deals only Pending cells and empties once they are fixed', () => {
  const history = pendingHistory({
    'H16-10': { total: 1, correct: 0, pending: 2 },
    'S18-2': { total: 3, correct: 2, pending: 1 },
    'P9-7': { total: 4, correct: 3, pending: 0 },
  })
  let s = run(lab([], history), startDrill('mistakes'))
  let answers = 0
  while (!s.drill.empty) {
    assert.ok(['H16-10', 'S18-2'].includes(s.drill.situation.cell))
    s = run(s, right(s), next)
    answers++
  }
  assert.equal(answers, 3)
  assert.equal(s.drill.situation, null)
})

test('the Mistakes drill is empty without Pending cells', () => {
  const s = run(lab(), startDrill('mistakes'))
  assert.equal(s.drill.empty, true)
  assert.equal(s.drill.situation, null)
})

test('Reset stats empties the Mistakes drill', () => {
  const history = pendingHistory({ 'H16-10': { total: 1, correct: 0, pending: 2 } })
  const s = run(lab([], history), startDrill('mistakes'), resetStats)
  assert.equal(s.drill.empty, true)
})

test('recent Mistakes are capped at 50, newest first', () => {
  let s = run(lab(), startDrill('weighted'))
  let last
  for (let i = 0; i < 51; i++) {
    last = s.drill.situation.cell
    s = run(s, wrong(s), next)
  }
  assert.equal(s.stats.mistakes.length, 50)
  assert.equal(s.stats.mistakes[0].cell, last)
  assert.equal(s.stats.mistakes[0].source, 'weighted')
})

// Close call: Book code differs from a horizontal or vertical neighbour in the same table.
function closeCalls() {
  const set = new Set()
  EXPECTED_CHART.forEach(([row, ...codes], r) => {
    codes.forEach((code, col) => {
      const neighbours = [codes[col - 1], codes[col + 1]]
      for (const other of [EXPECTED_CHART[r - 1], EXPECTED_CHART[r + 1]]) {
        if (other && other[0][0] === row[0]) neighbours.push(other[col + 1])
      }
      if (neighbours.some((n) => n !== undefined && n !== code)) set.add(`${row}-${UPCARDS[col]}`)
    })
  })
  return set
}

test('the Weighted drill skips trivial rows, triples Close calls, and deals ~15% multi-card', () => {
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
    s = run(s, right(s), next)
  }
  const candidates = EXPECTED_CHART.filter(([row]) => !/^(H8|H17|S19|S20)$/.test(row))
    .flatMap(([row]) => UPCARDS.map((up) => `${row}-${up}`))
  const mean = (cells) => cells.reduce((n, cell) => n + (counts.get(cell) ?? 0), 0) / cells.length
  const ratio = mean(candidates.filter((c) => close.has(c))) / mean(candidates.filter((c) => !close.has(c)))
  assert.ok(ratio > 2.5 && ratio < 3.5, `close-call ratio ${ratio}`)
  const share = twoCard / nonPair
  assert.ok(share > 0.82 && share < 0.88, `two-card share ${share}`)
})

// ---------------------------------------------------------------- engine contract

test('step never mutates its input state', () => {
  const s = run(lab(['8', '9', '8', '10', '3', '2']), deal)
  const before = JSON.stringify({ ...s, rng: undefined })
  run(s, act('split'), act('double'), act('stand'))
  run(s, startDrill('weighted'))
  assert.equal(JSON.stringify({ ...s, rng: undefined }), before)
})

test('newLab needs an rng, and unknown drill modes throw', () => {
  assert.throws(() => newLab(null, {}), /rng/)
  assert.throws(() => step(lab(), startDrill('nope')), /drill/)
})

// ---------------------------------------------------------------- review round 2

test('an open Weighted-drill Situation is saved, so a reload cannot skip it', () => {
  const s = run(lab(), startDrill('weighted'))
  const snap = snapshot(s)
  assert.deepEqual(snap.openSituation, s.drill.situation)
  const back = step(newLab(snap, { rng: seeded(9) }), startDrill('weighted'))
  assert.deepEqual(back.drill.situation, s.drill.situation)
})

test('answered and Mistakes-drill Situations are not saved', () => {
  const s = run(lab(), startDrill('weighted'))
  assert.equal(snapshot(step(s, right(s))).openSituation, null)
  const history = pendingHistory({ 'H16-10': { total: 1, correct: 0, pending: 2 } })
  assert.equal(snapshot(run(lab([], history), startDrill('mistakes'))).openSituation, null)
})

test('a saved open Situation must really belong to its cell', () => {
  const snap = snapshot(run(lab(), startDrill('weighted')))
  const forged = { ...snap, openSituation: { ...snap.openSituation, cell: 'H8-2' } }
  assert.throws(() => newLab(forged, { rng: seeded() }), /situation/)
})

test('Settlement records the Bankroll before payouts, so the reveal can show it', () => {
  const doubled = run(lab(['6', '6', '5', '10', '9', '10']), deal, act('double'))
  assert.equal(doubled.round.bankrollBeforePayout, 980)
  assert.equal(doubled.bankroll, 1020)
  const blackjack = run(lab(['A', '6', 'K', '5']), deal)
  assert.equal(blackjack.round.bankrollBeforePayout, 990)
})

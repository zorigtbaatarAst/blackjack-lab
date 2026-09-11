// Blackjack Lab engine: every game rule, pure. No DOM, no Usion, no clock.
// Vocabulary: see CONTEXT.md. Rules: see .scratch/blackjack-lab/spec.md.

const DECKS = 6
const CUT_CARD = Math.floor(DECKS * 52 * 0.75) // reshuffle after the Round in which this many cards were dealt
export const START_BANKROLL = 1000
const MAX_HANDS = 4
export const MIN_BET = 10
export const MAX_BET = 500
export const CHIPS = [10, 25, 100, 500]

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const SUITS = ['s', 'h', 'd', 'c']
const PAYOUT = { blackjack: 2.5, win: 2, push: 1, lose: 0, bust: 0 } // returned per unit staked
const SNAPSHOT_VERSION = 1
const FIXES_TO_CLEAR = 2 // consecutive Book-matching Decisions that clear a Pending cell
const MISTAKES_KEPT = 50
export const DRILL_MODES = ['weighted', 'mistakes']
const ACTION_NAMES = ['hit', 'stand', 'double', 'split']
const SOURCES = ['play', ...DRILL_MODES]
const DRILL_EXCLUDED_ROWS = new Set(['H8', 'H17', 'S19', 'S20']) // trivial: never dealt by the Weighted drill
const CLOSE_CALL_WEIGHT = 3
const MULTI_CARD_SHARE = 0.15
const TEN_RANKS = ['10', 'J', 'Q', 'K']

// ------------------------------------------------------------------ cards

function value(rank) {
  if (rank === 'A') return 11
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10
  return Number(rank)
}

export function handTotal(cards) {
  let total = 0
  let aces = 0
  for (const card of cards) {
    total += value(card.rank)
    if (card.rank === 'A') aces++
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return { total, soft: aces > 0 }
}

function isPair(cards) {
  return cards.length === 2 && value(cards[0].rank) === value(cards[1].rank)
}

function isBlackjack(hand) {
  return !hand.fromSplit && hand.cards.length === 2 && handTotal(hand.cards).total === 21
}

// ------------------------------------------------------------------ shoe

function newShoe(rng, stacked = []) {
  const pool = []
  for (let d = 0; d < DECKS; d++) {
    for (const suit of SUITS) for (const rank of RANKS) pool.push({ rank, suit })
  }
  // Stacked ranks come off the top in order; they are taken out of the pool so the Shoe stays 312 cards.
  const top = stacked.map((rank) => {
    const i = pool.findIndex((card) => card.rank === rank)
    if (i < 0) throw new Error(`Stacked Shoe: no ${rank} left`)
    return pool.splice(i, 1)[0]
  })
  shuffle(pool, rng)
  return { cards: [...top, ...pool], next: 0 }
}

function shuffle(cards, rng) {
  // Fisher–Yates: unbiased, unlike sort(() => rng() - 0.5).
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
}

function draw(s) {
  return s.shoe.cards[s.shoe.next++]
}

// ------------------------------------------------------------------ lab

export function newLab(saved, { rng, cards = [] } = {}) {
  if (typeof rng !== 'function') throw new Error('newLab: rng function required')
  const progress = saved == null ? freshProgress() : restore(saved)
  // Same rule as Settlement: a Bankroll that can't cover the minimum is Refilled, never left stuck.
  if (progress.bankroll < MIN_BET) progress.bankroll = START_BANKROLL
  const s = {
    ...progress,
    rng,
    shoe: newShoe(rng, cards),
    pendingBet: 0,
    round: null,
    drill: null,
    coachFlag: null,
    refilled: false,
    streakEnded: null,
  }
  s.pendingBet = prefillBet(s)
  return derive(s)
}

function freshProgress() {
  return { bankroll: START_BANKROLL, lastBet: MIN_BET, hint: false, streak: 0, bestStreak: 0, stats: emptyStats() }
}

function emptyStats() {
  return { cells: {}, mistakes: [], play: { hands: 0, wins: 0, losses: 0, pushes: 0, net: 0 } }
}

// Rejects anything it can't trust: the shell must never build on (and then overwrite) bad progress.
function restore(saved) {
  const fail = (what) => {
    throw new Error(`Saved Lab rejected: ${what}`)
  }
  const isCount = (n) => Number.isInteger(n) && n >= 0
  if (saved?.v !== SNAPSHOT_VERSION) fail(`unknown version ${saved?.v}`)
  if (!Number.isFinite(saved.bankroll) || saved.bankroll < 0) fail(`bankroll ${saved.bankroll}`)
  if (!Number.isFinite(saved.lastBet) || saved.lastBet < MIN_BET || saved.lastBet > MAX_BET) fail(`lastBet ${saved.lastBet}`)
  if (typeof saved.hint !== 'boolean') fail(`hint ${saved.hint}`)
  if (!isCount(saved.streak) || !isCount(saved.bestStreak)) fail('streak')
  const { stats } = saved
  if (typeof stats !== 'object' || stats === null) fail('stats')
  if (typeof stats.cells !== 'object' || stats.cells === null) fail('stats.cells')
  for (const [id, cell] of Object.entries(stats.cells)) {
    const ok = CELL_IDS.has(id) && isCount(cell?.total) && isCount(cell.correct) && isCount(cell.pending)
    if (!ok) fail(`cell ${id}`)
  }
  if (!Array.isArray(stats.mistakes)) fail('stats.mistakes')
  for (const m of stats.mistakes) {
    const ok =
      CELL_IDS.has(m?.cell) &&
      Array.isArray(m.cards) &&
      m.cards.every((rank) => RANKS.includes(rank)) &&
      RANKS.includes(m.upcard) &&
      ACTION_NAMES.includes(m.chosen) &&
      ACTION_NAMES.includes(m.book) &&
      SOURCES.includes(m.source)
    if (!ok) fail(`mistake ${JSON.stringify(m)}`)
  }
  const play = stats.play
  if (!['hands', 'wins', 'losses', 'pushes'].every((k) => isCount(play?.[k])) || !Number.isFinite(play.net)) fail('stats.play')
  return {
    bankroll: saved.bankroll,
    lastBet: saved.lastBet,
    hint: saved.hint,
    streak: saved.streak,
    bestStreak: saved.bestStreak,
    stats: structuredClone(stats),
  }
}

export function step(state, event) {
  // Functions can't be cloned; the rng is shared, everything else is copied so the input is never mutated.
  const s = structuredClone({ ...state, rng: undefined })
  s.rng = state.rng
  s.coachFlag = null
  s.refilled = false
  s.streakEnded = null
  const handler = HANDLERS[event?.type]
  if (!handler) invalid(`unknown event ${JSON.stringify(event)}`)
  handler(s, event)
  return derive(s)
}

// Settled progress only. Bets still on the table count as refunded, so an interrupted Round is voided.
export function snapshot(state) {
  const inFlight = state.round?.phase === 'player' ? state.round.hands.reduce((sum, hand) => sum + hand.bet, 0) : 0
  return structuredClone({
    v: SNAPSHOT_VERSION,
    bankroll: state.bankroll + inFlight,
    lastBet: state.lastBet,
    hint: state.hint,
    streak: state.streak,
    bestStreak: state.bestStreak,
    stats: state.stats,
  })
}

function invalid(reason) {
  throw new Error(`Invalid event: ${reason}`)
}

const HANDLERS = {
  bet(s, { chip }) {
    requireBetting(s)
    if (!CHIPS.includes(chip)) invalid(`no ${chip} chip`)
    if (s.pendingBet + chip > betCap(s)) invalid('Bet above the table maximum or the Bankroll')
    s.pendingBet += chip
  },

  clearBet(s) {
    requireBetting(s)
    s.pendingBet = 0
  },

  rebet(s) {
    requireBetting(s)
    if (s.lastBet > s.bankroll) invalid('last Bet is not affordable')
    s.pendingBet = s.lastBet
  },

  deal(s) {
    requireBetting(s)
    const bet = s.pendingBet
    if (bet < MIN_BET || bet > s.bankroll) invalid(`cannot deal a Bet of ${bet}`)
    s.bankroll -= bet
    s.pendingBet = 0
    const first = draw(s)
    const upcard = draw(s)
    const second = draw(s)
    const hole = draw(s)
    s.round = {
      phase: 'player',
      dealer: [upcard, hole],
      hands: [{ cards: [first, second], bet, fromSplit: false, splitAces: false, done: false }],
      active: 0,
      bet,
      hinted: s.hint, // once the Hint has been shown, no Decision in this Round is the player's own
      net: 0,
      allowed: [],
    }
    const peeks = upcard.rank === 'A' || value(upcard.rank) === 10
    const dealerBlackjack = handTotal(s.round.dealer).total === 21
    if ((peeks && dealerBlackjack) || isBlackjack(s.round.hands[0])) settle(s)
  },

  act(s, { action }) {
    if (s.round?.phase !== 'player') invalid('act outside the player turn')
    if (!s.round.allowed.includes(action)) invalid(`${action} is not allowed now`)
    const hand = s.round.hands[s.round.active]
    if (!s.round.hinted) {
      const { correct, book } = recordDecision(s, activeSituation(s), action, 'play')
      if (!correct) s.coachFlag = { chosen: action, book: book.action, rule: book.rule, cell: book.cell }
    }
    ACTIONS[action](s, hand)
    advance(s)
  },

  toggleHint(s) {
    s.hint = !s.hint
    if (s.hint && s.round?.phase === 'player') s.round.hinted = true
  },

  resetStats(s) {
    s.stats = emptyStats()
    if (s.drill?.slots.mistakes) s.drill.slots.mistakes = dealSituation(s, 'mistakes')
  },

  startDrill(s, { mode }) {
    if (!DRILL_MODES.includes(mode)) invalid(`no ${mode} drill`)
    s.drill ??= { mode, slots: {} }
    s.drill.mode = mode
    // An unanswered Situation is kept, so switching modes can't skip it.
    if (!s.drill.slots[mode]?.situation) s.drill.slots[mode] = dealSituation(s, mode)
  },

  answer(s, { action }) {
    const slot = s.drill?.slots[s.drill.mode]
    if (!slot?.situation) invalid('no Situation to answer')
    if (slot.feedback) invalid('Situation already answered')
    if (!slot.situation.allowed.includes(action)) invalid(`${action} is not allowed in this Situation`)
    const { mode } = s.drill
    const { correct, book } = recordDecision(s, slot.situation, action, mode)
    slot.feedback = { correct, chosen: action, book: book.action, rule: book.rule }
    if (mode === 'weighted') updateStreak(s, correct)
  },

  next(s) {
    const slot = s.drill?.slots[s.drill.mode]
    if (!slot?.feedback) invalid('answer the Situation before next')
    s.drill.slots[s.drill.mode] = dealSituation(s, s.drill.mode)
  },
}

// bestStreak is the best *ended* Streak; the shell shows max(bestStreak, streak) while one is running.
function updateStreak(s, correct) {
  if (correct) {
    s.streak++
    return
  }
  if (s.streak > 0) {
    s.streakEnded = { length: s.streak, isNewBest: s.streak > s.bestStreak }
    s.bestStreak = Math.max(s.bestStreak, s.streak)
  }
  s.streak = 0
}

function activeSituation(s) {
  const { round } = s
  return { cards: round.hands[round.active].cards, upcard: round.dealer[0], allowed: round.allowed }
}

function recordDecision(s, situation, chosen, source) {
  const book = bookAction(situation)
  const correct = chosen === book.action
  const cell = (s.stats.cells[book.cell] ??= { total: 0, correct: 0, pending: 0 })
  cell.total++
  if (correct) {
    cell.correct++
    if (cell.pending > 0) cell.pending--
    return { correct, book }
  }
  cell.pending = FIXES_TO_CLEAR
  const { mistakes } = s.stats
  mistakes.unshift({
    cell: book.cell,
    cards: situation.cards.map((card) => card.rank),
    upcard: situation.upcard.rank,
    chosen,
    book: book.action,
    source,
  })
  if (mistakes.length > MISTAKES_KEPT) mistakes.pop()
  return { correct, book }
}

const ACTIONS = {
  hit(s, hand) {
    hand.cards.push(draw(s))
    if (handTotal(hand.cards).total >= 21) hand.done = true
  },
  stand(s, hand) {
    hand.done = true
  },
  double(s, hand) {
    s.bankroll -= hand.bet
    hand.bet *= 2
    hand.cards.push(draw(s))
    hand.done = true
  },
  split(s, hand) {
    const { round } = s
    s.bankroll -= hand.bet
    const aces = hand.cards[0].rank === 'A'
    const moved = hand.cards.pop()
    hand.cards.push(draw(s)) // the first Hand gets its second card first
    const sibling = { cards: [moved, draw(s)], bet: hand.bet, fromSplit: true, splitAces: aces, done: false }
    hand.fromSplit = true
    hand.splitAces = aces
    round.hands.splice(round.active + 1, 0, sibling)
    // Split aces get exactly one card; any Hand that reaches 21 stands.
    for (const h of [hand, sibling]) {
      if (h.splitAces || handTotal(h.cards).total === 21) h.done = true
    }
  },
}

function requireBetting(s) {
  if (!isBetting(s)) invalid('betting is closed during a Round')
}

function isBetting(s) {
  return s.round === null || s.round.phase === 'settled'
}

function betCap(s) {
  return Math.min(MAX_BET, s.bankroll)
}

function prefillBet(s) {
  return s.lastBet <= s.bankroll ? s.lastBet : MIN_BET
}

function advance(s) {
  const next = s.round.hands.findIndex((hand) => !hand.done)
  if (next >= 0) {
    s.round.active = next
    return
  }
  dealerTurn(s)
  settle(s)
}

function dealerTurn(s) {
  const { round } = s
  if (round.hands.every((hand) => handTotal(hand.cards).total > 21)) return
  // S17: draw below 17, stand on every 17 including soft 17.
  while (handTotal(round.dealer).total < 17) round.dealer.push(draw(s))
}

function settle(s) {
  const { round, stats } = s
  const dealer = handTotal(round.dealer).total
  const dealerBlackjack = round.dealer.length === 2 && dealer === 21
  let staked = 0
  let returned = 0
  for (const hand of round.hands) {
    hand.result = resultOf(hand, dealer, dealerBlackjack)
    hand.payout = hand.bet * PAYOUT[hand.result]
    staked += hand.bet
    returned += hand.payout
    stats.play.hands++
    if (hand.result === 'win' || hand.result === 'blackjack') stats.play.wins++
    else if (hand.result === 'push') stats.play.pushes++
    else stats.play.losses++
  }
  s.bankroll += returned
  s.lastBet = round.bet
  round.net = returned - staked
  stats.play.net += round.net
  round.phase = 'settled'
  if (s.bankroll < MIN_BET) {
    s.bankroll = START_BANKROLL
    s.refilled = true
  }
  if (s.shoe.next >= CUT_CARD) s.shoe = newShoe(s.rng)
  s.pendingBet = prefillBet(s)
}

function resultOf(hand, dealer, dealerBlackjack) {
  const { total } = handTotal(hand.cards)
  if (total > 21) return 'bust'
  const blackjack = isBlackjack(hand)
  if (blackjack && dealerBlackjack) return 'push'
  if (blackjack) return 'blackjack'
  if (dealerBlackjack) return 'lose'
  if (dealer > 21 || total > dealer) return 'win'
  if (total === dealer) return 'push'
  return 'lose'
}

function derive(s) {
  const betting = isBetting(s)
  s.cardsLeft = s.shoe.cards.length - s.shoe.next
  s.chipsEnabled = betting ? CHIPS.filter((chip) => s.pendingBet + chip <= betCap(s)) : []
  s.canDeal = betting && s.pendingBet >= MIN_BET && s.pendingBet <= s.bankroll
  s.canRebet = betting && s.lastBet <= s.bankroll
  if (s.round) s.round.allowed = s.round.phase === 'player' ? allowedActions(s) : []
  s.hintAction = null
  if (s.hint && s.round?.phase === 'player') {
    const { action, rule } = bookAction(activeSituation(s))
    s.hintAction = { action, rule }
  }
  s.accuracy = accuracyOf(s.stats.cells)
  if (s.drill) {
    const slot = s.drill.slots[s.drill.mode]
    s.drill.situation = slot?.situation ?? null
    s.drill.feedback = slot?.feedback ?? null
    s.drill.empty = s.drill.mode === 'mistakes' && s.drill.situation === null
  }
  return s
}

function accuracyOf(cells) {
  const tally = () => ({ correct: 0, total: 0 })
  const accuracy = { overall: tally(), hard: tally(), soft: tally(), pairs: tally() }
  for (const [id, cell] of Object.entries(cells)) {
    for (const group of [accuracy.overall, accuracy[GROUP_OF_CLASS[id[0]]]]) {
      group.correct += cell.correct
      group.total += cell.total
    }
  }
  return accuracy
}

function allowedActions(s) {
  const { round } = s
  const hand = round.hands[round.active]
  const allowed = ['hit', 'stand']
  const affordable = s.bankroll >= hand.bet
  if (hand.cards.length === 2 && affordable) allowed.push('double')
  if (isPair(hand.cards) && round.hands.length < MAX_HANDS && affordable) allowed.push('split')
  return allowed
}


// ------------------------------------------------------------------ the Book

export const UPCARDS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A']

// Basic strategy for 4-8 decks, dealer stands on soft 17, double after split, no surrender.
// H hit · S stand · D double (else hit) · Ds double (else stand) · P split. Last column: Rule of thumb.
// Rows: H8 = hard 8 or less, H17 = hard 17 or more, S13–S20 = soft totals, P2–PA = Pairs.
const BOOK = `
H8   H  H  H  H  H  H  H  H  H  H   hard-8
H9   H  D  D  D  D  H  H  H  H  H   hard-9
H10  D  D  D  D  D  D  D  D  H  H   hard-10
H11  D  D  D  D  D  D  D  D  D  H   hard-11
H12  H  H  S  S  S  H  H  H  H  H   hard-12
H13  S  S  S  S  S  H  H  H  H  H   stiff
H14  S  S  S  S  S  H  H  H  H  H   stiff
H15  S  S  S  S  S  H  H  H  H  H   stiff
H16  S  S  S  S  S  H  H  H  H  H   stiff
H17  S  S  S  S  S  S  S  S  S  S   hard-17
S13  H  H  H  D  D  H  H  H  H  H   soft-double
S14  H  H  H  D  D  H  H  H  H  H   soft-double
S15  H  H  D  D  D  H  H  H  H  H   soft-double
S16  H  H  D  D  D  H  H  H  H  H   soft-double
S17  H  D  D  D  D  H  H  H  H  H   soft-double
S18  S  Ds Ds Ds Ds S  S  H  H  H   soft-18
S19  S  S  S  S  S  S  S  S  S  S   soft-19
S20  S  S  S  S  S  S  S  S  S  S   soft-19
P2   P  P  P  P  P  P  H  H  H  H   small-pairs
P3   P  P  P  P  P  P  H  H  H  H   small-pairs
P4   H  H  H  P  P  H  H  H  H  H   fours
P5   D  D  D  D  D  D  D  D  H  H   never-fives
P6   P  P  P  P  P  H  H  H  H  H   sixes
P7   P  P  P  P  P  P  H  H  H  H   small-pairs
P8   P  P  P  P  P  P  P  P  P  P   aces-eights
P9   P  P  P  P  P  S  P  P  S  S   nines
P10  S  S  S  S  S  S  S  S  S  S   never-tens
PA   P  P  P  P  P  P  P  P  P  P   aces-eights
`

const GROUP_OF_CLASS = { H: 'hard', S: 'soft', P: 'pairs' }

export const CHART_ROWS = BOOK.trim()
  .split('\n')
  .map((line) => {
    const [id, ...rest] = line.trim().split(/\s+/)
    return {
      id,
      group: GROUP_OF_CLASS[id[0]],
      codes: rest.slice(0, UPCARDS.length),
      cells: UPCARDS.map((up) => `${id}-${up}`),
      rule: rest[UPCARDS.length],
    }
  })

const ROW = Object.fromEntries(CHART_ROWS.map((row) => [row.id, row]))
const CELL_IDS = new Set(CHART_ROWS.flatMap((row) => row.cells))
export const ACTION_OF_CODE = { H: 'hit', S: 'stand', D: 'double', Ds: 'double', P: 'split' }

function upcardColumn(rank) {
  return value(rank) === 10 ? '10' : rank
}

function totalRow({ total, soft }) {
  if (soft) return `S${Math.min(Math.max(total, 13), 20)}`
  return `H${Math.min(Math.max(total, 8), 17)}`
}

// A two-card Pair always lands in its Pair cell, even when it can't be split.
function rowOf(cards) {
  if (!isPair(cards)) return totalRow(handTotal(cards))
  const v = value(cards[0].rank)
  return v === 11 ? 'PA' : `P${v}`
}

export function bookAction({ cards, upcard, allowed }) {
  const row = rowOf(cards)
  const up = upcardColumn(upcard.rank)
  const column = UPCARDS.indexOf(up)
  let code = ROW[row].codes[column]
  let rule = ROW[row].rule
  if (code === 'P' && !allowed.includes('split')) {
    // Play the Pair as its total; unsplittable aces are soft 12, which hits.
    const hand = handTotal(cards)
    code = hand.soft && hand.total === 12 ? 'H' : ROW[totalRow(hand)].codes[column]
    rule = 'no-split'
  }
  if ((code === 'D' || code === 'Ds') && !allowed.includes('double')) {
    code = code === 'D' ? 'H' : 'S'
    if (rule !== 'no-split') rule = 'no-double'
  }
  return { action: ACTION_OF_CODE[code], rule, cell: `${row}-${up}` }
}

// ------------------------------------------------------------------ Drills

function isCloseCall(r, col) {
  const row = CHART_ROWS[r]
  const neighbours = [row.codes[col - 1], row.codes[col + 1]]
  for (const other of [CHART_ROWS[r - 1], CHART_ROWS[r + 1]]) {
    if (other && other.id[0] === row.id[0]) neighbours.push(other.codes[col])
  }
  return neighbours.some((code) => code !== undefined && code !== row.codes[col])
}

const WEIGHTED_CELLS = CHART_ROWS.flatMap((row, r) =>
  DRILL_EXCLUDED_ROWS.has(row.id)
    ? []
    : row.cells.map((cell, col) => ({ cell, weight: isCloseCall(r, col) ? CLOSE_CALL_WEIGHT : 1 })),
)
const WEIGHT_TOTAL = WEIGHTED_CELLS.reduce((sum, { weight }) => sum + weight, 0)

function dealSituation(s, mode) {
  const cell = mode === 'weighted' ? pickWeighted(s.rng) : pickPending(s)
  return { situation: cell ? realise(cell, s.rng) : null, feedback: null }
}

function pickWeighted(rng) {
  let x = rng() * WEIGHT_TOTAL
  for (const { cell, weight } of WEIGHTED_CELLS) {
    x -= weight
    if (x < 0) return cell
  }
  return WEIGHTED_CELLS.at(-1).cell // floating-point guard
}

function pickPending(s) {
  const pending = Object.keys(s.stats.cells).filter((id) => s.stats.cells[id].pending > 0)
  return pending.length > 0 ? pick(pending, s.rng) : null
}

// Concrete cards for a Chart cell: random suits, random ten-value ranks, never an accidental Pair.
function realise(cell, rng) {
  const [row, up] = cell.split('-')
  const upcard = cardOf(up === '10' ? pick(TEN_RANKS, rng) : up, rng)
  let ranks
  if (row[0] === 'P') {
    const v = row === 'PA' ? 11 : Number(row.slice(1))
    ranks = [rankFor(v, rng), rankFor(v, rng)]
  } else {
    const soft = row[0] === 'S'
    const total = totalFor(row, rng)
    const multi = rng() < MULTI_CARD_SHARE ? multiCardRanks(total, soft, rng) : null
    ranks = multi ?? twoCardRanks(total, soft, rng) ?? multiCardRanks(total, soft, rng)
  }
  if (!ranks) throw new Error(`cannot realise ${cell}`)
  const cards = ranks.map((rank) => cardOf(rank, rng))
  let allowed = ['hit', 'stand']
  if (cards.length === 2) allowed = row[0] === 'P' ? ['hit', 'stand', 'double', 'split'] : ['hit', 'stand', 'double']
  return { cards, upcard, allowed, cell }
}

function totalFor(row, rng) {
  if (row === 'H8') return 5 + Math.floor(rng() * 4) // 5–8
  if (row === 'H17') return 17 + Math.floor(rng() * 4) // 17–20
  return Number(row.slice(1))
}

function twoCardRanks(total, soft, rng) {
  if (soft) return shuffled(['A', String(total - 11)], rng)
  const options = []
  for (let a = 2; a <= 9; a++) {
    const b = total - a
    if (b > a && b <= 10) options.push([a, b])
  }
  if (options.length === 0) return null
  const [a, b] = pick(options, rng)
  return shuffled([rankFor(a, rng), rankFor(b, rng)], rng)
}

const SOFT_EXTRAS = ['A', '2', '3', '4', '5', '6', '7', '8', '9']

function multiCardRanks(total, soft, rng) {
  // ponytail: rejection sampling over 3-card hands; fine at drill speed, build constructively if it ever profiles.
  for (let attempt = 0; attempt < 5000; attempt++) {
    const ranks = soft
      ? ['A', pick(SOFT_EXTRAS, rng), pick(SOFT_EXTRAS, rng)]
      : [0, 0, 0].map(() => rankFor(2 + Math.floor(rng() * 9), rng))
    const hand = handTotal(ranks.map((rank) => ({ rank })))
    if (hand.total === total && hand.soft === soft) return shuffled(ranks, rng)
  }
  return null
}

function rankFor(points, rng) {
  if (points === 10) return pick(TEN_RANKS, rng)
  if (points === 11) return 'A'
  return String(points)
}

function cardOf(rank, rng) {
  return { rank, suit: pick(SUITS, rng) }
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)]
}

function shuffled(list, rng) {
  const copy = [...list]
  shuffle(copy, rng)
  return copy
}

// Blackjack Lab engine: every game rule, pure. No DOM, no Usion, no clock.
// Vocabulary: see CONTEXT.md. Rules: see .scratch/blackjack-lab/spec.md.

const DECKS = 6
const CUT_CARD = Math.floor(DECKS * 52 * 0.75) // reshuffle after the Round in which this many cards were dealt
export const START_BANKROLL = 1000 // the default starting chips, and what saves from before the choice use
export const STARTING_CHIPS = [500, 1000, 5000, 10000]
const MAX_HANDS = 4
const MIN_BET = 10
const MAX_BET = 500
export const CHIPS = [10, 25, 100, 500]

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const SUITS = ['s', 'h', 'd', 'c']
const PAYOUT = { blackjack: 2.5, win: 2, push: 1, lose: 0, bust: 0 } // returned per unit staked
const SNAPSHOT_VERSION = 1
const FIXES_TO_CLEAR = 2 // consecutive Book-matching Decisions that clear a Pending cell
const MISTAKES_KEPT = 50
export const DRILL_MODES = ['weighted', 'mistakes'] // the Drills that play Training hands
export const TRAIN_MODES = [...DRILL_MODES, 'values', 'count']
export const COUNT_SPEEDS = ['slow', 'normal', 'fast']
const COUNTING_TALLIES = ['values', 'runningCount', 'trueCount', 'bet']
export const MAX_BET_UNITS = 8 // the Bet ramp's top: 8 units of the table minimum
const CHECK_QUESTIONS = ['runningCount', 'trueCount', 'bet']
const MAX_CHECK_GAP = 4 // a Count check comes after 1–4 rounds, at random
const HALF_DECK = 26
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

// Hi-Lo: a low card leaving the Shoe helps the player (+1), a ten or an ace leaving it hurts (−1).
function countValue(rank) {
  const points = value(rank)
  if (points <= 6) return 1
  if (points <= 9) return 0
  return -1
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

function draw(table) {
  return table.shoe.cards[table.shoe.next++]
}

// ------------------------------------------------------------------ lab

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
    trainingCards, // stacks the first Shoe created in Train (tests); consumed by trainingShoe
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

function freshProgress() {
  return {
    bankroll: START_BANKROLL,
    startingChips: START_BANKROLL,
    lastBet: MIN_BET,
    hint: false,
    streak: 0,
    bestStreak: 0,
    sprintBest: 0,
    countSpeed: 'normal',
    stats: emptyStats(),
    openHand: null,
    openStart: null,
  }
}

function emptyStats() {
  return { cells: {}, mistakes: [], play: { hands: 0, wins: 0, losses: 0, pushes: 0, net: 0 }, counting: emptyCounting() }
}

function emptyCounting() {
  return Object.fromEntries(COUNTING_TALLIES.map((key) => [key, { correct: 0, total: 0 }]))
}

// Rejects anything it can't trust: the shell must never build on (and then overwrite) bad progress.
function restore(saved) {
  const fail = (what) => {
    throw new Error(`Saved Lab rejected: ${what}`)
  }
  const isCount = (n) => Number.isInteger(n) && n >= 0
  if (saved?.v !== SNAPSHOT_VERSION) fail(`unknown version ${saved?.v}`)
  if (!Number.isFinite(saved.bankroll) || saved.bankroll < 0) fail(`bankroll ${saved.bankroll}`)
  const startingChips = saved.startingChips ?? START_BANKROLL // saves from before the choice existed
  if (!STARTING_CHIPS.includes(startingChips)) fail(`startingChips ${saved.startingChips}`)
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
  const openHand = saved.openHand ?? null
  if (openHand !== null && !isResumableHand(openHand)) fail(`open hand ${JSON.stringify(openHand)}`)
  // The first deployed build saved an open Situation instead; it restarts as a hand from that Situation.
  const legacy = saved.openSituation ?? null
  if (legacy !== null && !isRealSituation(legacy)) fail(`open situation ${JSON.stringify(legacy)}`)
  return {
    bankroll: saved.bankroll,
    startingChips,
    lastBet: saved.lastBet,
    hint: saved.hint,
    streak: saved.streak,
    bestStreak: saved.bestStreak,
    sprintBest,
    countSpeed,
    stats: { ...structuredClone(stats), counting: structuredClone(counting) },
    openHand: structuredClone(openHand),
    openStart: legacy && { cards: structuredClone(legacy.cards), upcard: structuredClone(legacy.upcard) },
  }
}

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
  const { dealer, hands, active, hinted } = hand ?? {}
  return (
    (hinted === undefined || typeof hinted === 'boolean') &&
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

function resumedRound({ dealer, hands, active, hinted = false }) {
  return {
    phase: 'player',
    dealer,
    hands: hands.map((hand) => ({ ...hand, bet: 0 })),
    active,
    bet: 0,
    hinted, // a looked-up hand stays looked up across a reload
    net: 0,
    allowed: [],
  }
}

// Cards the drill could have dealt, and that land in the cell they claim.
function isRealSituation(situation) {
  const { cards, upcard, allowed, cell } = situation
  const wellFormed =
    Array.isArray(cards) &&
    cards.length >= 2 &&
    cards.length <= 3 &&
    cards.every(isCard) &&
    isCard(upcard) &&
    Array.isArray(allowed) &&
    allowed.every((action) => ACTION_NAMES.includes(action)) &&
    CELL_IDS.has(cell)
  return wellFormed && bookAction(situation).cell === cell
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
    startingChips: state.startingChips,
    lastBet: state.lastBet,
    hint: state.hint,
    streak: state.streak,
    bestStreak: state.bestStreak,
    sprintBest: state.sprintBest,
    countSpeed: state.countSpeed,
    stats: state.stats,
    openHand: openWeightedHand(state),
  })
}

// The Weighted hand still in play (a reload must not skip its Decision). The Training Shoe is not saved.
function openWeightedHand(state) {
  const round = state.drill?.slots.weighted?.round
  if (round?.phase !== 'player') return null
  const hands = round.hands.map(({ cards, fromSplit, splitAces, done }) => ({ cards, fromSplit, splitAces, done }))
  return { dealer: round.dealer, hands, active: round.active, hinted: round.hinted }
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
    if (endsAtDeal(s.round)) settle(s)
  },

  act(s, { action }) {
    if (s.round?.phase !== 'player') invalid('act outside the player turn')
    if (!s.round.allowed.includes(action)) invalid(`${action} is not allowed now`)
    const hand = s.round.hands[s.round.active]
    if (!s.round.hinted) {
      const { correct, book } = recordDecision(s, activeSituation(s), action, 'play')
      if (!correct) s.coachFlag = { chosen: action, book: book.action, rule: book.rule, cell: book.cell }
    }
    ACTIONS[action](s, s, hand)
    if (advance(s)) settle(s)
  },

  newBankroll(s, { chips }) {
    requireBetting(s)
    if (!STARTING_CHIPS.includes(chips)) invalid(`no ${chips} starting chips`)
    s.startingChips = chips
    s.bankroll = chips
    s.pendingBet = prefillBet(s)
  },

  toggleHint(s) {
    s.hint = !s.hint
    if (s.hint && s.round?.phase === 'player') s.round.hinted = true
  },

  // The Guide's strategy chapter shows Book actions: every Decision waiting now is Looked up, like a hinted one.
  lookUp(s) {
    const rounds = [s.round, ...Object.values(s.drill?.slots ?? {}).map((slot) => slot.round)]
    for (const round of rounds) {
      if (round?.phase === 'player') round.hinted = true
    }
  },

  resetStats(s) {
    s.stats = emptyStats()
    const mistakes = s.drill?.slots.mistakes
    if (mistakes) dealTrainingHand(s, mistakes, 'mistakes')
  },

  startDrill(s, { mode }) {
    if (!TRAIN_MODES.includes(mode)) invalid(`no ${mode} drill`)
    s.drill ??= { mode, slots: {} }
    s.drill.mode = mode
    if (mode === 'values') {
      s.drill.values ??= newValuesDrill(s)
      return
    }
    if (mode === 'count') {
      if (!s.drill.count) {
        s.drill.count = newCountDrill(s)
        dealCountRound(s, s.drill.count)
      }
      return
    }
    const slot = (s.drill.slots[mode] ??= newTrainingSlot(s))
    // An unfinished hand is kept, so switching modes can't skip a Decision; an empty slot deals.
    if (!slot.round) dealTrainingHand(s, slot, mode)
  },

  answer(s, { action }) {
    const slot = s.drill?.slots[s.drill.mode]
    const round = slot?.round
    if (slot?.feedback) invalid('Decision already answered') // checked first: the answer may have ended the hand
    if (round?.phase !== 'player') invalid('no Decision to answer')
    if (!round.allowed.includes(action)) invalid(`${action} is not allowed in this Situation`)
    const { mode } = s.drill
    const situation = activeSituation(slot)
    const counted = !round.hinted
    const { correct, book } = counted ? recordDecision(s, situation, action, mode) : grade(situation, action)
    slot.feedback = { correct, chosen: action, book: book.action, rule: book.rule, counted }
    if (counted && mode === 'weighted') updateStreak(s, correct)
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

function activeSituation(table) {
  const { round } = table
  return { cards: round.hands[round.active].cards, upcard: round.dealer[0], allowed: round.allowed }
}

function grade(situation, chosen) {
  const book = bookAction(situation)
  return { correct: chosen === book.action, book }
}

function recordDecision(s, situation, chosen, source) {
  const { correct, book } = grade(situation, chosen)
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

// Peek: an ace or ten-value Upcard with a dealer Blackjack ends the Round at once, and so does a player Blackjack.
function endsAtDeal(round) {
  const upcard = round.dealer[0]
  const peeks = upcard.rank === 'A' || value(upcard.rank) === 10
  return (peeks && handTotal(round.dealer).total === 21) || isBlackjack(round.hands[0])
}

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
  if (s.round) s.round.allowed = s.round.phase === 'player' ? allowedActions(s, s) : []
  s.hintAction = null
  if (s.hint && s.round?.phase === 'player') {
    const { action, rule } = bookAction(activeSituation(s))
    s.hintAction = { action, rule }
  }
  s.accuracy = accuracyOf(s.stats.cells)
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
  if (s.drill?.count) s.drill.count.halfDecksDealt = halfDecksDealt(s.drill.count)
  s.checkAccuracy = checkAccuracyOf(s.stats.counting)
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

function allowedActions(s, table) {
  const { round } = table
  const hand = round.hands[round.active]
  const allowed = ['hit', 'stand']
  const affordable = s.bankroll >= hand.bet // always true at a training table's Bet of 0
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
  return freeRound([upcard, hole], cards)
}

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

// Blackjack Lab shell: rendering, i18n, Usion SDK, storage, leaderboard, timers.
// Every game rule lives in engine.js; this file only turns state into pixels and taps into events.
import {
  newLab,
  step,
  snapshot,
  handTotal,
  ACTION_OF_CODE,
  CHART_ROWS,
  CHIPS,
  COUNT_SPEEDS,
  MAX_BET_UNITS,
  STARTING_CHIPS,
  TRAIN_MODES,
  UPCARDS,
} from './engine.js'
import { STRINGS } from './strings.js'
import { GUIDE } from './guide.js'

const STORAGE_KEY = 'lab'
const UI_KEY = 'ui'
const TABS = ['play', 'train', 'improve']
const ACTIONS = ['hit', 'stand', 'double', 'split']
const ACTION_KEYS = { hit: 'h', stand: 's', double: 'd', split: 'p' } // desktop shortcuts; Split is P, not S
const INIT_TIMEOUT_MS = 8000 // the SDK's own recommendation; timing out inside Usion means an unsaved session
const AUTO_ADVANCE_MS = 600
const HAND_RESULT_MS = 1200 // a finished training hand stays on screen this long before the next deals
const AUTO_DEAL_MS = 1500 // Auto bet: time to read the result before the next Round deals itself
const REVEAL_MS = 450
const TOAST_MS = 2600
const NEW_BEST_CARD_MIN = 5
const SPRINT_MS = 30000
const MISS_PAUSE_MS = 600 // a missed card shows its right value this long, and taps are ignored meanwhile
const VALUE_BUTTONS = [
  { value: -1, k: 'value-minus', key: '←' },
  { value: 0, k: 'value-zero', key: '↓' },
  { value: 1, k: 'value-plus', key: '→' },
]
const COUNT_CARD_MS = { slow: 1000, normal: 600, fast: 350 } // the Count drill's deal speed, per card
const ROUND_PAUSE_CARDS = 2 // after a round's last card, this many card intervals before the next step
const STEPPER_MAX_DIGITS = 3
const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' }

const app = document.getElementById('app')
const announcer = document.getElementById('announcer') // lives outside #app, so re-renders never recreate it
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

let usion = null // window.Usion once init fired; null outside the host
let canRank = false // logged-in Usion user; Guests never submit
let persist = false // stays false after a failed load, so real progress is never overwritten
let lang = 'en'
let profile = { name: null, avatar: null } // the player's Usion profile (name + avatar URL)
let numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
let state = null

const ui = {
  tab: 'play',
  overlay: null, // { type: 'reset' } | { type: 'newBest', length, rank, status, view, friends, top }
  notice: null, // 'preview' | 'loadFailed' | 'saveFailed'
  toast: null,
  board: null, // Improve leaderboard: { status, view, friends, top, me }
  dealerShown: Infinity, // dealer cards revealed so far in the Settlement animation
  bankrollShown: null, // the pre-Settlement Bankroll, shown until the reveal ends so it can't spoil the result
  refillPending: false, // the Refill toast waits for the reveal too
  roundSeen: new Set(), // card keys already on screen: only new cards animate in
  drillSeen: new Set(),
  situationSerial: 0,
  advanceToken: 0, // invalidates a pending auto-advance when anything else happens first
  autoBet: false, // re-deal the same Bet after every Round; session-only, never saved
  valuesSeen: new Set(),
  valuesSerial: 0,
  sprintEndsAt: null, // the sprint clock, while one is running
  missFlash: null, // { card, value }: the card just missed, shown with its right value
  countSeen: new Set(),
  countSerial: 0,
  countShown: Infinity, // reveal steps shown of the current Count round
  stepper: '0', // the Count-check answer as typed
  stepperTyped: false, // typing replaces the pre-filled value; after that it edits it
  lastRunningCount: 0, // the last Running count revealed: where the stepper starts
}
let revealTimer = null
let advanceTimer = null
let toastTimer = null
let autoDealTimer = null
let sprintTimer = null
let missTimer = null
let countTimer = null
let backKey = null
let lastSavedJson = null
let saving = false
let pendingSave = null

boot().catch((err) => {
  console.error('[lab] boot failed', err)
  app.textContent = t('bootFailed')
})

// ------------------------------------------------------------------ boot and platform

function pickLanguage(code) {
  return String(code ?? '').toLowerCase().startsWith('mn') ? 'mn' : 'en'
}

async function boot() {
  // Before init the host hasn't said which language; the browser's is the best guess for this one line.
  app.innerHTML = `<p class="boot">${STRINGS[pickLanguage(navigator.language)].loading}</p>`
  const config = await initUsion()
  if (config) usion = window.Usion
  // Outside Usion the spec says English, whatever the browser prefers.
  lang = usion ? pickLanguage(config.language ?? usion.getLanguage?.()) : 'en'
  numberFormat = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 })
  document.documentElement.lang = lang
  const theme = config?.theme ?? usion?.getTheme?.()
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
  const userId = String(config?.userId ?? usion?.user?.getId?.() ?? '')
  if (usion && userId === '') console.warn('[lab] Usion gave no user id; treating this visitor as a Guest')
  canRank = usion !== null && userId !== '' && !userId.startsWith('guest_')
  if (canRank) profile = await loadProfile(config)

  const loaded = await loadProgress()
  try {
    state = newLab(loaded.saved, { rng: Math.random })
  } catch (err) {
    console.error('[lab] saved progress rejected; this session will not save', err, loaded.saved)
    persist = false
    setNotice('loadFailed')
    state = newLab(null, { rng: Math.random })
  }
  lastSavedJson = JSON.stringify(snapshot(state))
  // The profile header is built once so the avatar image isn't recreated on every render; #view re-renders.
  app.innerHTML = `${profileHtml()}<div id="view"></div>`
  app.addEventListener('click', onClick)
  document.addEventListener('keydown', onKey)
  // First launch: the Tour, which ends in the Starting-chips picker.
  if (loaded.saved == null) ui.overlay = { type: 'tour', slide: 0, first: true }
  switchTab(TABS.includes(loaded.tab) ? loaded.tab : 'play', { remember: false })
}

async function loadProfile(config) {
  let name = config.userName ?? usion.user?.getName?.() ?? null
  let avatar = config.userAvatar ?? usion.user?.getAvatar?.() ?? null
  if (!name && typeof usion.user?.getProfile === 'function') {
    try {
      const fetched = await usion.user.getProfile()
      name = fetched?.name ?? null
      avatar = avatar ?? fetched?.avatar ?? null
    } catch (err) {
      console.warn('[lab] could not load the Usion profile; showing a generic one', err)
    }
  }
  // Only https images: anything else (or a failed load) falls back to the initial.
  return { name, avatar: typeof avatar === 'string' && avatar.startsWith('https://') ? avatar : null }
}

// Resolves with the host config, or null when the SDK is missing or init never fires (plain browser).
function initUsion() {
  return new Promise((resolve) => {
    if (typeof window.Usion?.init !== 'function') return resolve(null)
    const timer = setTimeout(() => {
      console.warn(`[lab] Usion.init did not fire within ${INIT_TIMEOUT_MS} ms; running in preview mode`)
      resolve(null)
    }, INIT_TIMEOUT_MS)
    window.Usion.init((config) => {
      clearTimeout(timer)
      resolve(config ?? {})
    })
  })
}

async function loadProgress() {
  if (!usion) {
    setNotice('preview')
    return { saved: null, tab: null }
  }
  try {
    const [saved, uiSaved] = await Promise.all([usion.storage.get(STORAGE_KEY), usion.storage.get(UI_KEY)])
    persist = true
    return { saved, tab: uiSaved?.tab }
  } catch (err) {
    console.error('[lab] could not load progress; this session will not save', err)
    setNotice('loadFailed')
    return { saved: null, tab: null }
  }
}

// Coalesced: at most one write in flight, and the newest snapshot replaces any queued one.
function save() {
  if (!persist) return
  const snap = snapshot(state)
  const json = JSON.stringify(snap)
  if (json === lastSavedJson) return
  lastSavedJson = json
  pendingSave = snap
  if (!saving) flushSaves()
}

async function flushSaves() {
  saving = true
  while (pendingSave) {
    const snap = pendingSave
    pendingSave = null
    try {
      await usion.storage.set(STORAGE_KEY, snap)
      if (ui.notice === 'saveFailed') {
        ui.notice = null
        render()
      }
    } catch (err) {
      console.error('[lab] save failed; retrying on the next change', err)
      lastSavedJson = null
      setNotice('saveFailed')
      render()
    }
  }
  saving = false
}

function setNotice(key) {
  if (ui.notice !== key) announce(t(key))
  ui.notice = key
}

function rememberTab() {
  if (!persist) return
  usion.storage.set(UI_KEY, { tab: ui.tab }).catch((err) => console.error('[lab] could not remember the tab', err))
}

// ------------------------------------------------------------------ events

function dispatch(event) {
  const prev = state
  try {
    state = step(state, event)
  } catch (err) {
    // A shell bug: the UI offered something the state doesn't allow. The state is unchanged.
    console.error('[lab] event rejected', event, err)
    return
  }
  react(prev, event)
  save()
  render()
}

function react(prev, event) {
  if (event.type === 'deal') {
    ui.roundSeen.clear()
    ui.dealerShown = Infinity
  }
  const settledNow = state.round?.phase === 'settled' && (event.type === 'deal' || prev.round?.phase === 'player')
  if (settledNow) {
    ui.bankrollShown = state.round.bankrollBeforePayout
    ui.refillPending = state.refilled
    startReveal()
  }
  const flag = state.coachFlag
  if (flag) announce(`${t('coachMistake', { action: actionName(flag.book) })}. ${t(`rule.${flag.rule}`)}`)
  const feedback = event.type === 'answer' ? state.drill.feedback : null
  if (feedback?.correct) announce(t('correct'))
  else if (feedback) announce(`${t('coachMistake', { action: actionName(feedback.book) })}. ${t(`rule.${feedback.rule}`)}`)
  if (state.streakEnded) onStreakEnded(state.streakEnded)
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
  // Also on startDrill: returning to a correctly answered Situation must still move on, or the drill is stuck.
  if ((event.type === 'answer' || event.type === 'startDrill') && state.drill?.feedback?.correct) scheduleAdvance()
  reactValues(event)
  reactCount(prev, event)
}

function startReveal() {
  clearTimeout(revealTimer)
  const total = state.round.dealer.length
  if (reducedMotion) {
    ui.dealerShown = total
    finishReveal()
    return
  }
  ui.dealerShown = 1
  const tick = () => {
    ui.dealerShown++
    if (ui.dealerShown < total) revealTimer = setTimeout(tick, REVEAL_MS)
    else finishReveal()
    render()
  }
  revealTimer = setTimeout(tick, REVEAL_MS)
}

function finishReveal() {
  ui.bankrollShown = null
  announce(t('roundNet', { n: signed(state.round.net) }))
  if (ui.refillPending) {
    ui.refillPending = false
    showToast(t('refilled', { n: fmt(state.startingChips) }))
  }
  if (!ui.autoBet) return
  // The engine pre-fills the last Bet, or the table minimum when that's no longer affordable. Auto bet
  // must never quietly keep playing a different Bet, so it stops instead.
  if (state.pendingBet !== state.lastBet) {
    ui.autoBet = false
    showToast(t('autoStopped'))
    return
  }
  scheduleAutoDeal()
}

function scheduleAutoDeal() {
  clearTimeout(autoDealTimer)
  autoDealTimer = setTimeout(() => {
    const idle = !state.round || state.round.phase === 'settled'
    if (!ui.autoBet || ui.tab !== 'play' || ui.overlay || !idle) return
    if (!state.canDeal) {
      ui.autoBet = false // never leave Auto on with nothing it can deal and the betting panel hidden
      showToast(t('autoStopped'))
      render()
      return
    }
    dispatch({ type: 'deal' })
  }, AUTO_DEAL_MS)
}

function scheduleAdvance() {
  clearTimeout(advanceTimer)
  const token = ++ui.advanceToken
  // Mid-hand the next Decision comes quickly; once the hand is over, leave time to read the result.
  const delay = state.drill.round?.phase === 'settled' ? HAND_RESULT_MS : AUTO_ADVANCE_MS
  advanceTimer = setTimeout(() => {
    if (ui.advanceToken === token && state.drill?.feedback?.correct) dispatch({ type: 'next' })
  }, delay)
}

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

// Screen readers only reliably announce changes to a live region that already exists.
function announce(text) {
  announcer.textContent = ''
  setTimeout(() => {
    announcer.textContent = text
  }, 50)
}

function showToast(text) {
  announce(text)
  ui.toast = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    ui.toast = null
    render()
  }, TOAST_MS)
}

function switchTab(tab, { remember = true } = {}) {
  if (tab !== 'train') {
    leaveValues()
    clearCountTimer() // leaving pauses the Count drill; coming back resumes it
  }
  ui.tab = tab
  if (remember) rememberTab()
  if (tab === 'train') {
    // Always re-enter the current drill: an empty Mistakes drill picks up cells missed in Play meanwhile,
    // while an unanswered Situation is kept (the engine never redeals one).
    dispatch({ type: 'startDrill', mode: state.drill?.mode ?? 'weighted' })
    return
  }
  if (tab === 'improve' && canRank && ui.board?.status !== 'ready' && ui.board?.status !== 'loading') loadBoard()
  if (tab === 'play' && ui.autoBet) scheduleAutoDeal()
  render()
}

const CLICKS = {
  tab: ({ tab }) => switchTab(tab),
  bet: ({ chip }) => dispatch({ type: 'bet', chip: Number(chip) }),
  clearBet: () => dispatch({ type: 'clearBet' }),
  rebet: () => dispatch({ type: 'rebet' }),
  deal: () => dispatch({ type: 'deal' }),
  act: ({ action }) => dispatch({ type: 'act', action }),
  hint: () => dispatch({ type: 'toggleHint' }),
  autoBet: () => {
    const idle = !state.round || state.round.phase === 'settled'
    // The betting panel is hidden while Auto runs, so it must start from a Bet that can actually be dealt.
    if (!ui.autoBet && idle && !state.canDeal) {
      showToast(t('autoNeedsBet'))
      render()
      return
    }
    ui.autoBet = !ui.autoBet
    clearTimeout(autoDealTimer)
    const revealing = state.round?.phase === 'settled' && ui.dealerShown < state.round.dealer.length
    // Turning it on at an idle table deals right away; mid-Round it takes over after this Round.
    if (ui.autoBet && idle && !revealing && state.canDeal) dispatch({ type: 'deal' })
    else render()
  },
  drillMode: ({ mode }) => {
    if (mode === state.drill?.mode) return
    leaveValues()
    clearCountTimer()
    dispatch({ type: 'startDrill', mode })
  },
  sprintStart: () => dispatch({ type: 'sprintStart' }),
  sprintAnswer: ({ value }) => dispatch({ type: 'sprintAnswer', countValue: Number(value) }),
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
  answer: ({ action }) => dispatch({ type: 'answer', action }),
  next: () => {
    clearTimeout(advanceTimer)
    dispatch({ type: 'next' })
  },
  boardView: ({ view }) => {
    ui.board.view = view
    render()
  },
  overlayView: ({ view }) => {
    ui.overlay.view = view
    render()
  },
  bankrollAsk: () => {
    ui.overlay = { type: 'bankroll', first: false, pick: null }
    render()
  },
  pickBankroll: ({ chips }) => {
    const card = ui.overlay
    // First launch: nothing to lose, so one tap starts. Later it replaces real chips, so confirm first.
    if (card.first) setBankroll(Number(chips))
    else {
      card.pick = Number(chips)
      render()
    }
  },
  bankrollYes: () => setBankroll(ui.overlay.pick),
  resetAsk: () => {
    ui.overlay = { type: 'reset' }
    render()
  },
  resetYes: () => {
    ui.overlay = null
    dispatch({ type: 'resetStats' })
  },
  closeOverlay: () => {
    const { type, first } = ui.overlay ?? {}
    // Skipping or finishing the first-launch Tour still leads to choosing Starting chips.
    ui.overlay = type === 'tour' && first ? { type: 'bankroll', first: true, pick: null } : null
    if (type === 'bankroll' && first) finishFirstLaunch() // closing the first picker keeps the default chips
    render()
  },
  tourStep: ({ by }) => tourStep(Number(by)),
}

function setBankroll(chips) {
  const first = ui.overlay?.first
  ui.overlay = null
  dispatch({ type: 'newBankroll', chips })
  if (first) finishFirstLaunch()
  announce(t('bankrollSet', { n: fmt(chips) }))
}

// The first launch ends once chips are chosen or the default kept. Save now, even when the state equals a fresh
// one (1,000 chips, nothing played), or the Tour and the picker would come back on the next launch.
function finishFirstLaunch() {
  lastSavedJson = null
  save()
}

function onClick(e) {
  const el = e.target.closest('[data-do]')
  if (!el || el.disabled) return
  CLICKS[el.dataset.do](el.dataset)
}

// ------------------------------------------------------------------ leaderboard

function fetchBoards() {
  return Promise.all([usion.leaderboard.friends(), usion.leaderboard.top({ limit: 10 })]).then(([friends, top]) => ({ friends, top }))
}

async function onStreakEnded({ length, isNewBest }) {
  if (!canRank) return
  // Submit the Best streak, not just this one: the board keeps each player's best, so re-sending it is
  // harmless and repairs a submit that failed earlier.
  const best = state.bestStreak
  let card = null
  if (isNewBest && length >= NEW_BEST_CARD_MIN) {
    card = { type: 'newBest', length, rank: null, status: 'loading', view: 'friends', friends: [], top: [] }
    ui.overlay = card
  }
  try {
    const result = await usion.leaderboard.submit(best)
    refreshBoard()
    if (!card) return
    Object.assign(card, { rank: result?.rank ?? null, ...(await fetchBoards()), status: 'ready' })
  } catch (err) {
    console.error('[lab] leaderboard submit failed', { best }, err)
    if (card) card.status = 'error'
  }
  if (card && ui.overlay === card) render()
}

// A board loaded before the submit landed is stale: drop it, and reload it now if it's on screen.
function refreshBoard() {
  ui.board = null
  if (ui.tab === 'improve') loadBoard()
}

async function loadBoard() {
  const board = { status: 'loading', view: 'friends', friends: [], top: [], me: null }
  ui.board = board
  render()
  try {
    const [boards, me] = await Promise.all([fetchBoards(), usion.leaderboard.me()])
    Object.assign(board, { status: 'ready', ...boards, me })
  } catch (err) {
    console.error('[lab] leaderboard load failed', err)
    board.status = 'error'
  }
  if (ui.board === board) render()
}

// ------------------------------------------------------------------ rendering

const warnedKeys = new Set()

function t(key, vars = {}) {
  const template = STRINGS[lang][key] ?? STRINGS.en[key]
  if (template === undefined) {
    if (!warnedKeys.has(key)) console.warn(`[lab] missing string ${key}`)
    warnedKeys.add(key)
    return key
  }
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

const fmt = (n) => numberFormat.format(n)

function signed(n) {
  if (n > 0) return `+${fmt(n)}`
  if (n < 0) return `−${fmt(-n)}`
  return fmt(0)
}
const pct = ({ correct, total }) => (total === 0 ? '—' : `${Math.round((correct / total) * 100)}%`)
const actionName = (action) => t(`action.${action}`)

function render() {
  if (!state) return
  const view = document.getElementById('view')
  const main = view.querySelector('main')
  const scroll = main?.dataset.tab === ui.tab ? main.scrollTop : 0
  const focused = document.activeElement?.dataset?.k
  const screen = { play: playScreen, train: trainScreen, improve: improveScreen }[ui.tab]
  const inert = ui.overlay ? ' inert' : '' // a modal dialog keeps Tab and screen readers inside it
  view.classList.toggle('show-keys', state.hint) // key hints are help: only when the player asked for help
  view.innerHTML = `
    ${noticeHtml()}
    <main class="screen screen-${ui.tab}" data-tab="${ui.tab}"${inert}>${screen()}</main>
    ${tabBarHtml(inert)}
    ${overlayHtml()}
    ${ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : ''}`
  view.querySelector('main').scrollTop = scroll
  if (focused) view.querySelector(`[data-k="${focused}"]`)?.focus()
  const modal = view.querySelector('.modal')
  if (modal && !modal.contains(document.activeElement)) (modal.querySelector('[data-autofocus]') ?? modal.querySelector('button'))?.focus()
  updateProfile()
  syncBackButton()
}

// ------------------------------------------------------------------ profile header

function profileHtml() {
  let name = t('previewName')
  if (usion) name = canRank ? (profile.name ?? t('player')) : t('guestName')
  const initial = esc([...name][0]?.toUpperCase() ?? '?')
  const photo = profile.avatar
    ? `<img src="${esc(profile.avatar)}" alt="" referrerpolicy="no-referrer" draggable="false" onerror="this.remove()">`
    : ''
  return `<header class="profile">
    <span class="avatar" aria-hidden="true">${initial}${photo}</span>
    <span class="who"><strong>${esc(name)}</strong><small id="profile-note"></small></span>
    <span class="purse"><span class="label">${t('chips')}</span><strong id="profile-chips"></strong></span>
  </header>`
}

function updateProfile() {
  const { round } = state
  const revealing = round?.phase === 'settled' && ui.dealerShown < round.dealer.length
  document.getElementById('profile-chips').textContent = fmt(revealing ? ui.bankrollShown : state.bankroll)
  let note = t('previewNote')
  if (usion) note = canRank ? t('bestShort', { n: Math.max(state.bestStreak, state.streak) }) : t('guestNote')
  document.getElementById('profile-note').textContent = note
}

// ------------------------------------------------------------------ keyboard (desktop)

// Keys press the same on-screen buttons a tap would, so keyboard and mouse can never disagree.
function keyTargets(key) {
  const action = ACTIONS.find((a) => ACTION_KEYS[a] === key)
  if (action) return [`act-${action}`, `answer-${action}`]
  if (key === 'enter' || key === ' ') return ['deal', 'next', 'back-to-drill', 'sprint-start', 'stepper-ok']
  if (key === 'arrowleft') return ['value-minus', 'stepper-minus']
  if (key === 'arrowdown') return ['value-zero']
  if (key === 'arrowright') return ['value-plus', 'stepper-plus']
  if (/^[1-9]$/.test(key)) return digitTargets(Number(key))
  if (key === 'a') return ['auto']
  if (key === 'c') return ['clear']
  if (key === 'r') return ['rebet']
  return []
}

// A digit presses whichever numbered button is on screen: a chip, a Count value, a speed or a Bet.
function digitTargets(n) {
  const targets = []
  if (n <= CHIPS.length) targets.push(`chip-${CHIPS[n - 1]}`)
  if (n <= VALUE_BUTTONS.length) targets.push(VALUE_BUTTONS[n - 1].k)
  if (n <= COUNT_SPEEDS.length) targets.push(`speed-${COUNT_SPEEDS[n - 1]}`)
  if (n <= MAX_BET_UNITS) targets.push(`bet-${n}`)
  return targets
}

function onKey(e) {
  if (!state || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  const key = e.key.toLowerCase()
  if (ui.overlay) {
    overlayKey(key)
    return
  }
  if (stepperActive() && stepperKey(key)) {
    e.preventDefault()
    render()
    return
  }
  // Enter/Space on a focused button already clicks it natively; don't click a second thing.
  if ((key === 'enter' || key === ' ') && e.target.closest?.('button')) return
  for (const k of keyTargets(key)) {
    const button = document.querySelector(`#view [data-k="${k}"]:not([disabled])`)
    if (button) {
      e.preventDefault()
      button.click()
      return
    }
  }
}

// In a dialog only Esc works (it closes; in the Tour it skips), plus ← and → to page through the Tour.
function overlayKey(key) {
  if (key === 'escape') CLICKS.closeOverlay()
  else if (ui.overlay.type === 'tour' && key === 'arrowright') tourStep(1)
  else if (ui.overlay.type === 'tour' && key === 'arrowleft') tourStep(-1)
}

// The host back claim is one-shot: claim again whenever the screen that needs it changes.
function syncBackButton() {
  if (typeof usion?.claimBackButton !== 'function') return
  const key = ui.overlay ? 'overlay' : ui.tab
  if (key === backKey) return
  backKey = key
  if (key === 'play') {
    usion.releaseBackButton?.()
    return
  }
  usion.claimBackButton(() => {
    backKey = null
    if (ui.overlay) CLICKS.closeOverlay()
    else switchTab('play')
  })
}

function noticeHtml() {
  return ui.notice ? `<div class="notice">${t(ui.notice)}</div>` : ''
}

function tabBarHtml(inert) {
  const tabs = TABS.map(
    (tab) =>
      `<button data-do="tab" data-tab="${tab}" data-k="tab-${tab}" aria-current="${ui.tab === tab ? 'page' : 'false'}">${t(`tab.${tab}`)}</button>`,
  )
  return `<nav class="tabs"${inert}>${tabs.join('')}</nav>`
}

function cardLabel(card) {
  // Only face cards and aces have names; number cards read as their number.
  const named = `rank.${card.rank}` in STRINGS.en
  const rank = named ? t(`rank.${card.rank}`) : card.rank
  return t('cardOf', { rank, suit: t(`suit.${card.suit}`) })
}

function cardFace(card, key, seen, entrance = 'enter') {
  const isNew = !seen.has(key)
  seen.add(key)
  const red = card.suit === 'h' || card.suit === 'd'
  return `<div class="card${red ? ' red' : ''}${isNew ? ` ${entrance}` : ''}" role="img" aria-label="${esc(cardLabel(card))}">
    <span class="rank">${esc(card.rank)}</span><span class="suit">${SUIT_GLYPH[card.suit] ?? ''}</span></div>`
}

function cardBack(key, seen) {
  const isNew = !seen.has(key)
  seen.add(key)
  return `<div class="card back${isNew ? ' enter' : ''}" role="img" aria-label="${t('faceDown')}"></div>`
}

function totalLabel(cards) {
  const { total, soft } = handTotal(cards)
  return soft ? t('softTotal', { n: total }) : String(total)
}

function actionButtons(doName, allowed, locked = false) {
  const buttons = ACTIONS.map((action) => {
    const enabled = allowed.includes(action) && !locked
    return `<button data-do="${doName}" data-action="${action}" data-k="${doName}-${action}" ${enabled ? '' : 'disabled'}>${actionName(action)}<kbd>${ACTION_KEYS[action].toUpperCase()}</kbd></button>`
  })
  return `<div class="actions">${buttons.join('')}</div>`
}

// ------------------------------------------------------------------ Play

// The layout never changes between turns (that made the screen jump): the bet line and chips always
// stay, only the bottom row swaps between Clear/Rebet/Deal and the Actions, and both are the same height.
// The betting panel and the action panel are stacked in one grid cell and only one is visible, so the
// area keeps the taller one's height: no chips during a Round, and still nothing moves between turns.
function playScreen() {
  const { round } = state
  const revealing = round?.phase === 'settled' && ui.dealerShown < round.dealer.length
  // With Auto on the table never drops back to betting between Rounds: the greyed Action row stays.
  const acting = round?.phase === 'player' || revealing || ui.autoBet
  return `
    <header class="bar">
      <div class="shoe"><i aria-hidden="true"></i>${t('cardsLeft', { n: state.cardsLeft })}</div>
      <div class="bar-actions">
        <button class="toggle" data-do="autoBet" data-k="auto" aria-pressed="${ui.autoBet}">${t('autoBet')}<kbd>A</kbd></button>
        <button class="toggle" data-do="hint" data-k="hint" aria-pressed="${state.hint}">${t('hint')}</button>
      </div>
    </header>
    <section class="table">
      ${dealerHtml(round)}
      ${playMessage(revealing)}
      <div class="hands${handsClass(round)}">${round ? round.hands.map((hand, i) => handHtml(hand, i, revealing)).join('') : ghostHand()}</div>
    </section>
    <footer class="controls">
      <div class="panel${acting ? ' off' : ''}">
        <div class="bet-line"><span class="label">${t('bet')}</span>${chipStack(state.pendingBet)}<strong>${fmt(state.pendingBet)}</strong></div>
        ${chipTray(!acting)}
        ${bettingRow()}
        <p class="keys muted small">${t('keysBet')}</p>
      </div>
      <div class="panel acting${acting ? '' : ' off'}">
        ${actionButtons('act', round?.phase === 'player' ? round.allowed : [])}
        <p class="keys muted small">${t('keysAct')}</p>
      </div>
    </footer>`
}

// One fixed-height slot on the felt: a mistake, the Hint, or the Round's result; otherwise the print.
function playMessage(revealing) {
  const { coachFlag: flag, hintAction: hint, round } = state
  const net = round?.phase === 'settled' && !revealing ? t('roundNet', { n: signed(round.net) }) : null
  if (flag) {
    const title = `✗ ${t('coachMistake', { action: actionName(flag.book) })}${net ? ` · ${net}` : ''}`
    return feltMessage('bad', title, t(`rule.${flag.rule}`))
  }
  if (hint) return feltMessage('hint', `💡 ${t('hintSays', { action: actionName(hint.action) })}`, t(`rule.${hint.rule}`))
  if (net) return feltMessage('net', net, t('feltPays'))
  return feltMessage('', t('feltPays'), t('feltRule'))
}

function dealerHtml(round) {
  if (!round) return `<div class="dealer"><div class="label">${t('dealer')}</div>${ghostCards()}</div>`
  const shown = round.phase === 'player' ? 1 : ui.dealerShown
  const cards = round.dealer.map((card, i) => {
    if (i < shown) return cardFace(card, `d${i}`, ui.roundSeen, i === 1 ? 'flip' : 'enter') // the hole card turns over
    return i === 1 ? cardBack('d1-back', ui.roundSeen) : ''
  })
  const complete = round.phase === 'settled' && shown >= round.dealer.length
  return `<div class="dealer">
    <div class="label">${t('dealer')}${complete ? ` · <strong>${totalLabel(round.dealer)}</strong>` : ''}</div>
    <div class="cards">${cards.join('')}</div>
  </div>`
}

// Smaller cards once a Split puts several Hands side by side, so they never wrap into a second row.
function handsClass(round) {
  const count = round?.hands.length ?? 1
  if (count > 2) return ' many'
  return count === 2 ? ' split' : ''
}

// Outlines where the cards will land, so an empty table still reads as a table.
function ghostCards() {
  return '<div class="cards" aria-hidden="true"><div class="card ghost"></div><div class="card ghost"></div></div>'
}

// The player's spot before the first Round: same box as a real Hand (cards + info line), so dealing doesn't jump.
function ghostHand() {
  return `<div class="hand">${ghostCards()}<div class="meta"></div></div>`
}

// Screen readers get these messages from the announcer, so the felt copy is hidden from them.
function feltMessage(kind, title, subtitle) {
  return `<div class="felt-print${kind ? ` ${kind}` : ''}" aria-hidden="true"><strong>${title}</strong><span>${subtitle}</span></div>`
}

// The Bet as real chips: greedy from the biggest denomination, capped so a big Bet stays a neat stack.
function chipStack(amount) {
  const discs = []
  let left = amount
  for (const chip of [...CHIPS].reverse()) {
    while (left >= chip && discs.length < 8) {
      discs.push(chip)
      left -= chip
    }
  }
  return `<span class="stack" aria-hidden="true">${discs.map((chip) => `<span class="disc chip-${chip}"></span>`).join('')}</span>`
}

function handHtml(hand, i, revealing) {
  const { round } = state
  const active = round.phase === 'player' && i === round.active
  const showResult = round.phase === 'settled' && !revealing
  const result = showResult ? `<span class="badge ${hand.result}">${t(`result.${hand.result}`)}</span>` : ''
  return `<div class="hand${active ? ' active' : ''}">
    <div class="cards">${hand.cards.map((card, j) => cardFace(card, `h${i}-${j}`, ui.roundSeen)).join('')}</div>
    <div class="meta"><strong>${totalLabel(hand.cards)}</strong> · ${t('bet')} ${fmt(hand.bet)} ${result}</div>
  </div>`
}

function chipTray(canBet) {
  const chips = CHIPS.map((chip) => {
    const enabled = canBet && state.chipsEnabled.includes(chip)
    return `<button class="chip chip-${chip}" data-do="bet" data-chip="${chip}" data-k="chip-${chip}" ${enabled ? '' : 'disabled'}>${chip}</button>`
  })
  return `<div class="chips">${chips.join('')}</div>`
}

function bettingRow() {
  const canRebet = state.canRebet && state.pendingBet !== state.lastBet
  return `<div class="row">
      <button data-do="clearBet" data-k="clear" ${state.pendingBet > 0 ? '' : 'disabled'}>${t('clear')}</button>
      <button data-do="rebet" data-k="rebet" ${canRebet ? '' : 'disabled'}>${t('rebet')}</button>
      <button class="primary" data-do="deal" data-k="deal" ${state.canDeal ? '' : 'disabled'}>${t('deal')}<kbd>↵</kbd></button>
    </div>`
}

// ------------------------------------------------------------------ Train

function trainScreen() {
  const { drill } = state
  if (!drill) return ''
  const tabs = TRAIN_MODES.map(
    (mode) =>
      `<button role="tab" aria-selected="${drill.mode === mode}" data-do="drillMode" data-mode="${mode}" data-k="mode-${mode}">${t(`drill.${mode}`)}</button>`,
  )
  const header = `<header class="bar train-bar"><div class="segmented" role="tablist">${tabs.join('')}</div><div class="stats">${trainStats(drill)}</div></header>`
  if (drill.mode === 'values') return header + valuesScreen(drill.values)
  if (drill.mode === 'count') return header + countScreen(drill.count)
  if (drill.empty) {
    return `${header}
      <section class="empty">
        <h2>${t('emptyTitle')}</h2>
        <p class="muted">${t('emptyBody')}</p>
        <button data-do="drillMode" data-mode="weighted" data-k="back-to-drill">${t('backToDrill')}</button>
      </section>`
  }
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
      <div class="hands${handsClass(round)}">${round.hands.map((hand, i) => trainHandHtml(round, hand, i)).join('')}</div>
    </section>
    <footer class="controls">${controls}<p class="keys muted small">${t('keysTrain')}</p></footer>`
}

// Each mode's two numbers, always in the same two slots, so the header never changes shape.
function trainStats(drill) {
  const stat = (label, value) => `<div class="stat"><span class="label">${label}</span><strong>${value}</strong></div>`
  if (drill.mode === 'values') return stat(t('time'), sprintClock(drill.values)) + stat(t('bestSprint'), fmt(state.sprintBest))
  if (drill.mode === 'count') {
    const { session } = drill.count
    return stat(t('checks'), `${fmt(session.correct)}/${fmt(session.total)}`) + stat(t('accuracy'), pct(state.checkAccuracy))
  }
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

// ------------------------------------------------------------------ Improve

function improveScreen() {
  const { accuracy, stats } = state
  return `
    <section class="block">
      <h2>${t('accuracy')}</h2>
      ${accuracy.overall.total === 0 ? `<p class="muted">${t('noStats')}</p>` : accuracyHtml(accuracy)}
    </section>
    <section class="block">${boardHtml()}</section>
    <section class="block">${chartHtml(stats.cells)}</section>
    <section class="block">${mistakesHtml(stats.mistakes)}</section>
    <section class="block">${playStatsHtml(stats.play)}</section>
    <section class="block">${countingHtml()}</section>
    <div class="reset-row">
      <button data-do="bankrollAsk" data-k="new-bankroll" ${state.round?.phase === 'player' ? `disabled title="${t('finishRoundFirst')}"` : ''}>${t('newBankroll')}</button>
      <button class="danger" data-do="resetAsk" data-k="reset">${t('resetStats')}</button>
    </div>`
}

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

function boardHtml() {
  const title = `<h2>${t('boardTitle')}</h2>`
  if (!usion) return `${title}<p class="muted">${t('boardPreview')}</p>`
  if (!canRank) return `${title}<p class="muted">${t('loginToRank')}</p>`
  const board = ui.board
  if (!board || board.status === 'loading') return `${title}<p class="muted">${t('boardLoading')}</p>`
  if (board.status === 'error') return `${title}<p class="muted">${t('boardError')}</p>`
  const me = board.me?.rank ? `<p class="small">${t('yourRank', { rank: esc(board.me.rank), total: esc(board.me.total ?? '?') })}</p>` : ''
  return `${title}${boardToggle('boardView', board.view)}${boardList(board.view === 'friends' ? board.friends : board.top)}${me}`
}

function boardToggle(doName, view) {
  const button = (v) =>
    `<button role="tab" aria-selected="${view === v}" data-do="${doName}" data-view="${v}" data-k="${doName}-${v}">${t(v === 'friends' ? 'friends' : 'global')}</button>`
  return `<div class="segmented small" role="tablist">${button('friends')}${button('global')}</div>`
}

function boardList(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return `<p class="muted">${t('boardEmpty')}</p>`
  const rows = entries.map(
    (e) =>
      `<li class="${e.is_me ? 'me' : ''}"><span class="pos">#${esc(e.rank ?? '')}</span><span class="name">${esc(e.name ?? '—')}</span><strong>${esc(e.score ?? '')}</strong></li>`,
  )
  return `<ol class="board">${rows.join('')}</ol>`
}

// Chart row ids (H8…H17, S13…S20, P2…PA) as a player reads them: ≤8, 17+, A,7, 8,8.
function rowLabel(id) {
  const n = id.slice(1)
  if (id === 'H8') return '≤8'
  if (id === 'H17') return '17+'
  if (id[0] === 'H') return n
  if (id[0] === 'S') return `A,${Number(n) - 11}`
  return n === 'A' ? 'A,A' : `${n},${n}`
}

function rowTitle(row) {
  return `${t(`group.${row.group}`)} ${rowLabel(row.id)}`
}

function heatLevel(mistakeRate) {
  if (mistakeRate === 0) return 0
  if (mistakeRate <= 0.25) return 1
  if (mistakeRate <= 0.5) return 2
  if (mistakeRate <= 0.75) return 3
  return 4
}

// Each cell wears its Book action's colour (the same as the buttons), so the chart reads as a real
// strategy chart from the first launch. Unplayed cells are faded; a white ring marks Mistakes, thicker = more often.
const CODE_CLASS = { H: 'hit', S: 'stand', D: 'double', Ds: 'double-stand', P: 'split' }

function chartHtml(cells) {
  const head = `<div class="hm-row hm-head"><span></span>${UPCARDS.map((up) => `<span>${up}</span>`).join('')}</div>`
  let group = null
  const rows = CHART_ROWS.map((row) => {
    const heading = row.group !== group ? `<div class="hm-group">${t(`group.${row.group}`)}</div>` : ''
    group = row.group
    const cellsHtml = row.codes.map((code, col) => {
      const up = UPCARDS[col]
      const cell = cells[row.cells[col]]
      const vars = { row: rowTitle(row), up, action: actionName(ACTION_OF_CODE[code]) }
      const state = cell ? `miss-${heatLevel(1 - cell.correct / cell.total)}` : 'unplayed'
      const label = cell ? t('chartCell', { ...vars, correct: cell.correct, total: cell.total }) : t('chartCellEmpty', vars)
      return `<span class="hm-cell act-${CODE_CLASS[code]} ${state}" title="${esc(label)}" aria-label="${esc(label)}">${code}</span>`
    })
    return `${heading}<div class="hm-row"><span class="hm-label">${rowLabel(row.id)}</span>${cellsHtml.join('')}</div>`
  })
  const swatch = (code, name) => `<span class="legend-item"><span class="hm-cell act-${CODE_CLASS[code]}">${code}</span> ${name}</span>`
  const actions = [
    swatch('H', actionName('hit')),
    swatch('S', actionName('stand')),
    swatch('D', actionName('double')),
    swatch('Ds', `${actionName('double')} / ${actionName('stand')}`),
    swatch('P', actionName('split')),
  ]
  return `<h2>${t('chartTitle')}</h2>
    <p class="muted small">${t('chartNote')}</p>
    <div class="heatmap">${head}${rows.join('')}</div>
    <div class="legend small">${actions.join('')}</div>
    <div class="legend small">
      <span class="legend-item"><span class="hm-cell act-hit unplayed"></span> ${t('chartNew')}</span>
      <span class="legend-item"><span class="hm-cell act-hit miss-1"></span><span class="hm-cell act-hit miss-4"></span> ${t('chartRing')}</span>
    </div>`
}

function miniCard(rank) {
  return `<span class="mini">${esc(rank)}</span>`
}

function mistakesHtml(mistakes) {
  const title = `<h2>${t('mistakesTitle')}</h2>`
  if (mistakes.length === 0) return `${title}<p class="muted">${t('noMistakes')}</p>`
  const items = mistakes.map(
    (m) => `<li>
      <span class="mini-cards">${m.cards.map(miniCard).join('')} <span class="muted">${t('versus')}</span> ${miniCard(m.upcard)}</span>
      <span>${esc(t('mistakeLine', { chosen: actionName(m.chosen), book: actionName(m.book) }))}</span>
      <span class="muted small">${esc(t(`source.${m.source}`))}</span>
    </li>`,
  )
  return `${title}<ol class="mistakes">${items.join('')}</ol>`
}

function playStatsHtml(play) {
  const tile = (key, value) => `<div class="tile"><span class="label">${t(key)}</span><strong>${value}</strong></div>`
  return `<h2>${t('tableTitle')}</h2>
    <div class="tiles">
      ${tile('hands', fmt(play.hands))}${tile('wins', fmt(play.wins))}${tile('losses', fmt(play.losses))}
      ${tile('pushes', fmt(play.pushes))}${tile('net', signed(play.net))}
    </div>`
}

// ------------------------------------------------------------------ overlays

function overlayHtml() {
  const overlay = ui.overlay
  if (!overlay) return ''
  if (overlay.type === 'tour') return tourHtml(overlay)
  if (overlay.type === 'bankroll') return bankrollHtml(overlay)
  if (overlay.type === 'reset') {
    return modal(`
      <p id="dialog-title">${t('resetConfirm')}</p>
      <div class="row">
        <button data-do="closeOverlay" data-k="cancel">${t('cancel')}</button>
        <button class="danger" data-do="resetYes" data-k="reset-yes">${t('reset')}</button>
      </div>`)
  }
  let board = `<p class="muted">${t('boardLoading')}</p>`
  if (overlay.status === 'error') board = `<p class="muted">${t('boardError')}</p>`
  if (overlay.status === 'ready') {
    board = boardToggle('overlayView', overlay.view) + boardList(overlay.view === 'friends' ? overlay.friends : overlay.top)
  }
  return modal(`
    <h2 id="dialog-title">${t('newBestTitle')}</h2>
    <p class="hero">${overlay.length}</p>
    <p>${t('newBestBody', { n: overlay.length })}${overlay.rank ? ` ${t('newBestRank', { rank: esc(overlay.rank) })}` : ''}</p>
    ${board}
    <button class="primary wide" data-do="closeOverlay" data-k="close">${t('close')}</button>`)
}

function tourStep(by) {
  const slide = ui.overlay.slide + by
  if (slide < 0 || slide >= GUIDE[lang].tour.length) return
  ui.overlay.slide = slide
  render()
}

// The welcome slides: on first launch (ending in the chip picker), or replayed from the Guide.
function tourHtml({ slide, first }) {
  const slides = GUIDE[lang].tour
  const { art, title, text } = slides[slide]
  const last = slide === slides.length - 1
  const dots = slides.map((_, i) => `<span class="${i === slide ? 'on' : ''}"></span>`).join('')
  const next = last
    ? `<button class="primary" data-do="closeOverlay" data-k="tour-end" data-autofocus>${t(first ? 'tourChips' : 'tourDone')}</button>`
    : `<button class="primary" data-do="tourStep" data-by="1" data-k="tour-next" data-autofocus>${t('next')} →</button>`
  const skip = last ? '' : `<button data-do="closeOverlay" data-k="tour-skip">${t('tourSkip')}</button>`
  return modal(`
    <div class="tour-art" aria-hidden="true">${tourArt(art)}</div>
    <h2 id="dialog-title">${esc(title)}</h2>
    <p class="tour-text">${esc(text)}</p>
    <div class="tour-dots" role="img" aria-label="${esc(t('tourStep', { n: slide + 1, total: slides.length }))}">${dots}</div>
    <div class="tour-row">
      ${skip}
      <button data-do="tourStep" data-by="-1" data-k="tour-back" ${slide === 0 ? 'disabled' : ''}>← ${t('tourBack')}</button>
      ${next}
    </div>`)
}

function tourArt(art) {
  const cards = (codes) => `<div class="cards">${codes.map(guideCard).join('')}</div>`
  if (art === 'blackjack') return cards(['As', 'Kh'])
  if (art === 'chips') return chipStack(635)
  if (art === 'check') return `${cards(['10s', '6h'])}<span class="tour-check">✓</span>`
  if (art === 'chart') return ['H', 'S', 'D', 'P'].map((code) => `<span class="hm-cell act-${CODE_CLASS[code]}">${code}</span>`).join('')
  return '<span class="tour-help">?</span>'
}

// A card from a content code like 'As' or '10h': the rank, then the suit letter. Drawn still: no deal animation.
function guideCard(code) {
  return cardFace({ rank: code.slice(0, -1), suit: code.slice(-1) }, '', new Set(), '')
}

function bankrollHtml({ first, pick }) {
  if (pick) {
    return modal(`
      <p id="dialog-title">${t('bankrollConfirm', { current: fmt(state.bankroll), n: fmt(pick) })}</p>
      <div class="row">
        <button data-do="closeOverlay" data-k="cancel">${t('cancel')}</button>
        <button class="primary" data-do="bankrollYes" data-k="bankroll-yes">${t('bankrollStart', { n: fmt(pick) })}</button>
      </div>`)
  }
  const options = STARTING_CHIPS.map((chips) => {
    const current = chips === state.startingChips
    return `<button class="bankroll-option${current ? ' current' : ''}" data-do="pickBankroll" data-chips="${chips}" data-k="bankroll-${chips}">${fmt(chips)}</button>`
  })
  return modal(`
    <h2 id="dialog-title">${t(first ? 'bankrollTitleFirst' : 'newBankroll')}</h2>
    <p class="muted">${t('bankrollBody')}</p>
    <div class="bankroll-options">${options.join('')}</div>
    ${first ? '' : `<button data-do="closeOverlay" data-k="cancel">${t('cancel')}</button>`}`)
}

function modal(content) {
  return `<div class="scrim"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${content}</div></div>`
}

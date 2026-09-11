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
  DRILL_MODES,
  STARTING_CHIPS,
  UPCARDS,
} from './engine.js'
import { STRINGS } from './strings.js'

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
}
let revealTimer = null
let advanceTimer = null
let toastTimer = null
let autoDealTimer = null
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
  if (loaded.saved == null) ui.overlay = { type: 'bankroll', first: true, pick: null }
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
  drillMode: ({ mode }) => dispatch({ type: 'startDrill', mode }),
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
    ui.overlay = null
    render()
  },
}

function setBankroll(chips) {
  ui.overlay = null
  dispatch({ type: 'newBankroll', chips })
  announce(t('bankrollSet', { n: fmt(chips) }))
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
  if (modal && !modal.contains(document.activeElement)) modal.querySelector('button')?.focus()
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
  if (key === 'enter' || key === ' ') return ['deal', 'next', 'back-to-drill']
  const chip = { 1: 10, 2: 25, 3: 100, 4: 500 }[key]
  if (chip) return [`chip-${chip}`]
  if (key === 'a') return ['auto']
  if (key === 'c') return ['clear']
  if (key === 'r') return ['rebet']
  return []
}

function onKey(e) {
  if (!state || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  const key = e.key.toLowerCase()
  if (ui.overlay) {
    if (key === 'escape') CLICKS.closeOverlay()
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
  const modes = DRILL_MODES.map(
    (mode) =>
      `<button role="tab" aria-selected="${drill.mode === mode}" data-do="drillMode" data-mode="${mode}" data-k="mode-${mode}">${t(`drill.${mode}`)}</button>`,
  )
  const streak = `<div class="stat"><span class="label">${t('streak')}</span><strong>${state.streak}</strong></div>
    <div class="stat"><span class="label">${t('best')}</span><strong>${Math.max(state.bestStreak, state.streak)}</strong></div>`
  const header = `<header class="bar"><div class="segmented" role="tablist">${modes.join('')}</div>${streak}</header>`
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
    <div class="reset-row">
      <button data-do="bankrollAsk" data-k="new-bankroll" ${state.round?.phase === 'player' ? `disabled title="${t('finishRoundFirst')}"` : ''}>${t('newBankroll')}</button>
      <button class="danger" data-do="resetAsk" data-k="reset">${t('resetStats')}</button>
    </div>`
}

function accuracyHtml(accuracy) {
  const tile = (key, tally) =>
    `<div class="tile"><span class="label">${t(key)}</span><strong>${pct(tally)}</strong><span class="muted small">${t('ofDecisions', tally)}</span></div>`
  return `<div class="hero">${pct(accuracy.overall)}<span class="muted small">${t('ofDecisions', accuracy.overall)}</span></div>
    <div class="tiles">${tile('group.hard', accuracy.hard)}${tile('group.soft', accuracy.soft)}${tile('group.pairs', accuracy.pairs)}</div>`
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

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
  START_BANKROLL,
  UPCARDS,
} from './engine.js'
import { STRINGS } from './strings.js'

const STORAGE_KEY = 'lab'
const UI_KEY = 'ui'
const TABS = ['play', 'train', 'improve']
const ACTIONS = ['hit', 'stand', 'double', 'split']
const INIT_TIMEOUT_MS = 3000
const AUTO_ADVANCE_MS = 600
const REVEAL_MS = 450
const TOAST_MS = 2600
const NEW_BEST_CARD_MIN = 5
const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' }

const app = document.getElementById('app')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

let usion = null // window.Usion once init fired; null outside the host
let canRank = false // logged-in Usion user; Guests never submit
let persist = false // stays false after a failed load, so real progress is never overwritten
let lang = 'en'
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
}
let revealTimer = null
let advanceTimer = null
let toastTimer = null
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

  const loaded = await loadProgress()
  try {
    state = newLab(loaded.saved, { rng: Math.random })
  } catch (err) {
    console.error('[lab] saved progress rejected; this session will not save', err, loaded.saved)
    persist = false
    ui.notice = 'loadFailed'
    state = newLab(null, { rng: Math.random })
  }
  lastSavedJson = JSON.stringify(snapshot(state))
  app.addEventListener('click', onClick)
  switchTab(TABS.includes(loaded.tab) ? loaded.tab : 'play', { remember: false })
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
    ui.notice = 'preview'
    return { saved: null, tab: null }
  }
  try {
    const [saved, uiSaved] = await Promise.all([usion.storage.get(STORAGE_KEY), usion.storage.get(UI_KEY)])
    persist = true
    return { saved, tab: uiSaved?.tab }
  } catch (err) {
    console.error('[lab] could not load progress; this session will not save', err)
    ui.notice = 'loadFailed'
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
      ui.notice = 'saveFailed'
      render()
    }
  }
  saving = false
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
    ui.bankrollShown = prev.bankroll
    ui.refillPending = state.refilled
    startReveal()
  }
  if (state.streakEnded) onStreakEnded(state.streakEnded)
  if (JSON.stringify(prev.drill?.situation) !== JSON.stringify(state.drill?.situation)) {
    ui.situationSerial++
    ui.drillSeen.clear()
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
  if (ui.refillPending) {
    ui.refillPending = false
    showToast(t('refilled', { n: fmt(START_BANKROLL) }))
  }
}

function scheduleAdvance() {
  clearTimeout(advanceTimer)
  const serial = ui.situationSerial
  advanceTimer = setTimeout(() => {
    if (ui.situationSerial === serial && state.drill?.feedback?.correct) dispatch({ type: 'next' })
  }, AUTO_ADVANCE_MS)
}

function showToast(text) {
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
  ui.board = null // stale after a submit; Improve reloads it
  let card = null
  if (isNewBest && length >= NEW_BEST_CARD_MIN) {
    card = { type: 'newBest', length, rank: null, status: 'loading', view: 'friends', friends: [], top: [] }
    ui.overlay = card
  }
  try {
    const result = await usion.leaderboard.submit(length)
    if (!card) return
    Object.assign(card, { rank: result?.rank ?? null, ...(await fetchBoards()), status: 'ready' })
  } catch (err) {
    console.error('[lab] leaderboard submit failed', { length }, err)
    if (card) card.status = 'error'
  }
  if (card && ui.overlay === card) render()
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
  const main = app.querySelector('main')
  const scroll = main?.dataset.tab === ui.tab ? main.scrollTop : 0
  const focused = document.activeElement?.dataset?.k
  const screen = { play: playScreen, train: trainScreen, improve: improveScreen }[ui.tab]
  app.innerHTML = `
    ${noticeHtml()}
    <main class="screen screen-${ui.tab}" data-tab="${ui.tab}">${screen()}</main>
    ${tabBarHtml()}
    ${overlayHtml()}
    ${ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ''}`
  app.querySelector('main').scrollTop = scroll
  if (focused) app.querySelector(`[data-k="${focused}"]`)?.focus()
  syncBackButton()
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
  return ui.notice ? `<div class="notice" role="status">${t(ui.notice)}</div>` : ''
}

function tabBarHtml() {
  const tabs = TABS.map(
    (tab) =>
      `<button data-do="tab" data-tab="${tab}" data-k="tab-${tab}" aria-current="${ui.tab === tab ? 'page' : 'false'}">${t(`tab.${tab}`)}</button>`,
  )
  return `<nav class="tabs">${tabs.join('')}</nav>`
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
    return `<button data-do="${doName}" data-action="${action}" data-k="${doName}-${action}" ${enabled ? '' : 'disabled'}>${actionName(action)}</button>`
  })
  return `<div class="actions">${buttons.join('')}</div>`
}

const FLAG_ICON = { good: '✓', bad: '✗', hint: '💡' }

function flagHtml(kind, title, rule) {
  const icon = FLAG_ICON[kind]
  return `<div class="flag ${kind}"><strong>${icon} ${title}</strong>${rule ? `<small>${t(`rule.${rule}`)}</small>` : ''}</div>`
}

// ------------------------------------------------------------------ Play

function playScreen() {
  const { round } = state
  const revealing = round?.phase === 'settled' && ui.dealerShown < round.dealer.length
  let controls = bettingHtml()
  if (round?.phase === 'player') controls = actionButtons('act', round.allowed)
  else if (revealing) controls = ''
  return `
    <header class="bar">
      <div class="stat"><span class="label">${t('chips')}</span><strong>${fmt(revealing ? ui.bankrollShown : state.bankroll)}</strong></div>
      <div class="stat muted">${t('cardsLeft', { n: state.cardsLeft })}</div>
      <button class="toggle" data-do="hint" data-k="hint" aria-pressed="${state.hint}">${t('hint')}</button>
    </header>
    <section class="table">
      ${dealerHtml(round)}
      <div class="hands${round?.hands.length > 2 ? ' many' : ''}">${round ? round.hands.map((hand, i) => handHtml(hand, i, revealing)).join('') : ''}</div>
    </section>
    <div class="coach" aria-live="polite">${coachHtml(revealing)}</div>
    <footer class="controls">${controls}</footer>`
}

function dealerHtml(round) {
  if (!round) return `<div class="dealer"><div class="label">${t('dealer')}</div><div class="cards empty-row"></div></div>`
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

function coachHtml(revealing) {
  const parts = []
  const flag = state.coachFlag
  if (flag) parts.push(flagHtml('bad', t('coachMistake', { action: actionName(flag.book) }), flag.rule))
  const hint = state.hintAction
  if (hint) parts.push(flagHtml('hint', t('hintSays', { action: actionName(hint.action) }), hint.rule))
  if (state.round?.phase === 'settled' && !revealing) {
    parts.push(`<div class="round-net">${t('roundNet', { n: signed(state.round.net) })}</div>`)
  }
  return parts.join('')
}

function bettingHtml() {
  const chips = CHIPS.map(
    (chip) =>
      `<button class="chip chip-${chip}" data-do="bet" data-chip="${chip}" data-k="chip-${chip}" ${state.chipsEnabled.includes(chip) ? '' : 'disabled'}>${chip}</button>`,
  )
  const canRebet = state.canRebet && state.pendingBet !== state.lastBet
  return `
    <div class="bet-line"><span class="label">${t('bet')}</span><strong>${fmt(state.pendingBet)}</strong></div>
    <div class="chips">${chips.join('')}</div>
    <div class="row">
      <button data-do="clearBet" data-k="clear" ${state.pendingBet > 0 ? '' : 'disabled'}>${t('clear')}</button>
      <button data-do="rebet" data-k="rebet" ${canRebet ? '' : 'disabled'}>${t('rebet')}</button>
      <button class="primary" data-do="deal" data-k="deal" ${state.canDeal ? '' : 'disabled'}>${t('deal')}</button>
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
  const { situation, feedback } = drill
  const up = cardFace(situation.upcard, `up-${ui.situationSerial}`, ui.drillSeen)
  const cards = situation.cards.map((card, i) => cardFace(card, `p${i}-${ui.situationSerial}`, ui.drillSeen))
  let result = ''
  if (feedback?.correct) result = flagHtml('good', t('correct'))
  else if (feedback) result = flagHtml('bad', t('coachMistake', { action: actionName(feedback.book) }), feedback.rule)
  const controls =
    feedback && !feedback.correct
      ? `<button class="primary wide" data-do="next" data-k="next">${t('next')}</button>`
      : actionButtons('answer', situation.allowed, Boolean(feedback))
  return `${header}
    <section class="table">
      <div class="dealer"><div class="label">${t('dealer')}</div><div class="cards">${up}</div></div>
      <div class="hands"><div class="hand">
        <div class="cards">${cards.join('')}</div>
        <div class="meta">${t('yourHand')} · <strong>${totalLabel(situation.cards)}</strong></div>
      </div></div>
    </section>
    <div class="coach" aria-live="polite">${result}</div>
    <footer class="controls">${controls}</footer>`
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
    <div class="reset-row"><button class="danger" data-do="resetAsk" data-k="reset">${t('resetStats')}</button></div>`
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
      const level = cell ? heatLevel(1 - cell.correct / cell.total) : 'none'
      const label = cell ? t('chartCell', { ...vars, correct: cell.correct, total: cell.total }) : t('chartCellEmpty', vars)
      return `<span class="hm-cell hm-${level}" title="${esc(label)}" aria-label="${esc(label)}">${code}</span>`
    })
    return `${heading}<div class="hm-row"><span class="hm-label">${rowLabel(row.id)}</span>${cellsHtml.join('')}</div>`
  })
  const legendSteps = [0, 1, 2, 3, 4].map((level) => `<span class="hm-cell hm-${level}"></span>`).join('')
  const codes = ['H', 'S', 'D', 'P'].map((code) => `<b>${code}</b> ${actionName(ACTION_OF_CODE[code])}`).join(' · ')
  return `<h2>${t('chartTitle')}</h2>
    <p class="muted small">${t('chartNote')}</p>
    <div class="heatmap">${head}${rows.join('')}</div>
    <div class="legend small">
      <span class="legend-item"><span class="hm-cell hm-none"></span> ${t('chartNoData')}</span>
      <span class="legend-item">${t('chartScale')} 0% ${legendSteps} 100%</span>
    </div>
    <p class="muted small">${codes} · <b>Ds</b> ${actionName('double')} / ${actionName('stand')}</p>`
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
  if (overlay.type === 'reset') {
    return modal(`
      <p>${t('resetConfirm')}</p>
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
    <h2>${t('newBestTitle')}</h2>
    <p class="hero">${overlay.length}</p>
    <p>${t('newBestBody', { n: overlay.length })}${overlay.rank ? ` ${t('newBestRank', { rank: esc(overlay.rank) })}` : ''}</p>
    ${board}
    <button class="primary wide" data-do="closeOverlay" data-k="close">${t('close')}</button>`)
}

function modal(content) {
  return `<div class="scrim"><div class="modal" role="dialog" aria-modal="true">${content}</div></div>`
}

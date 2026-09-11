// Local stand-in for https://usions.com/usion-sdk.js, served only by `npm run dev`.
// It implements just the SDK calls app.js makes. Tune it with query params:
//   ?name=Bat  ?user=guest_1 (play as a Guest)  ?lang=mn  ?theme=dark
//   ?avatar=https://…  ?failGet=1 / ?failSet=1 (exercise the error paths)
;(function () {
  const params = new URLSearchParams(location.search)
  const userId = params.get('user') ?? 'dev_user'
  const guest = userId.startsWith('guest_')
  const name = guest ? 'Guest' : (params.get('name') ?? 'Dev Player')
  const avatar = params.get('avatar')
  const language = params.get('lang') ?? 'en'
  const theme = params.get('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const key = (k) => `fake-usion:${userId}:${k}` // per user, like the real per-user storage

  const bestKey = key('leaderboard-best')
  const best = () => Number(localStorage.getItem(bestKey) ?? 0)
  const entry = (rank, name, score, isMe = false) => ({ user_id: isMe ? userId : `bot_${rank}`, name, score, rank, is_me: isMe })
  const board = () =>
    [entry(0, 'Bat', 25), entry(0, 'Saraa', 14), entry(0, name, best(), true)]
      .sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, rank: i + 1 }))

  window.Usion = {
    version: 'dev-fake',
    init(callback) {
      const config = { userId, userName: name, userAvatar: avatar, language, theme, serviceId: 'dev' }
      setTimeout(() => callback(config), 50)
    },
    getLanguage: () => language,
    getTheme: () => theme,
    user: {
      getId: () => userId,
      getName: () => name,
      getAvatar: () => avatar,
      getProfile: async () => ({ id: userId, name, avatar, isAdult: null }),
    },
    storage: {
      async get(k) {
        if (params.get('failGet')) throw new Error('fake storage.get failure (?failGet=1)')
        const raw = localStorage.getItem(key(k))
        return raw === null ? null : JSON.parse(raw)
      },
      async set(k, value) {
        if (params.get('failSet')) throw new Error('fake storage.set failure (?failSet=1)')
        localStorage.setItem(key(k), JSON.stringify(value))
      },
    },
    leaderboard: {
      async submit(score) {
        if (guest) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' })
        const previous = best()
        localStorage.setItem(bestKey, String(Math.max(previous, score)))
        console.info('[fake usion] leaderboard.submit', score)
        return { success: true, score, best: best(), previous, rank: board().find((e) => e.is_me).rank, updated: score > previous }
      },
      friends: async () => board(),
      top: async ({ limit = 20 } = {}) => board().slice(0, limit),
      me: async () => ({ score: best(), rank: board().find((e) => e.is_me).rank, total: 3 }),
    },
    // The real host shows a back button; here, call window.usionBack() in the console to press it.
    claimBackButton(callback) {
      window.usionBack = callback
    },
    releaseBackButton() {
      window.usionBack = null
    },
  }
})()

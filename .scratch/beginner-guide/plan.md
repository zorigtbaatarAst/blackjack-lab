# Beginner Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beginners get a welcome Tour, a five-chapter Guide behind a **?** on every screen, and help buttons in Train (Rules, Chart, Why & how). Peeking at the strategy chapter marks waiting Decisions as Looked up, so the Streak stays fair.

**Architecture:**
- **Content:** all long-form text lives in a new content module, `app/guide.js`, with English and Mongolian as structured plain-text blocks. The shell renders it.
- **Shell:** the Tour and the Guide are two new overlay types in `app/app.js`, alongside the existing chip picker and dialogs.
- **Engine:** the only engine change is a `lookUp` event. It sets the existing `hinted` flag on every Round with a Decision waiting. `answer` grades a hinted hand without recording it, and the open Weighted hand's save keeps the flag.

**Tech Stack:** Vanilla ES modules, no build and no dependencies. `node --test`. Browser QA uses the headless-Chromium CDP harness in the session scratchpad (`/tmp/claude-1000/-opt-projects-blackjack/3679f096-99b4-4e78-8a8f-4f20d3575227/scratchpad/qa/`) against `npm run dev` on port 8765.

**Spec:** `.scratch/beginner-guide/spec.md`. Glossary: `CONTEXT.md` (Guide, Tour, Looked up).

## Global Constraints

- The engine stays pure and is the only unit-test seam: every rule is tested through `step()`, `newLab()` and `snapshot()`. The shell is verified in the browser.
- Only the Guide's `strategy` chapter looks anything up. Showing it (from Chart, or its chip) dispatches `lookUp`. The other chapters look nothing up.
- A looked-up hand is still graded on screen, but records no Chart-cell stats, Pending changes or Mistakes, and never changes the Streak.
- The Tour appears exactly when the first-launch chip picker would (`loaded.saved == null`), and ending or skipping it opens that picker. Replaying it from the Guide just closes it at the end.
- The "counting explained" flag lives in the shell's UI store (`{ tab, countingIntro }` under the `ui` key), never in the game save.
- Every new UI string exists in `en` and `mn` with the same `{placeholders}`. The Guide content has the same shape in both languages. Both rules are enforced by `test/strings.test.js`.
- Guide content is plain text; the shell escapes everything. Card codes are rank + suit letter (`s h d c`), e.g. `As`, `10h`.
- The Train header takes two rows below a 900px window and one row at 900px and up. Within a Train mode, `.table`, `.felt-print` and `.controls` never move between phases at 390×844, 768×1024 or 1920×1080.
- Key hints stay under the existing rule (Hint on, and a keyboard/mouse device). `?` opens the Guide, Esc closes any dialog, and in the Tour ← and → page through the slides.
- `scripts/deploy-pages.sh` ships `guide.js` too.
- All work happens on branch `beginner-guide`, and commits end with the session's attribution lines.

## File Structure

| File | Change |
|---|---|
| `app/engine.js` | `lookUp` event; `answer` grades looked-up hands without recording them; `hinted` kept in the saved open hand |
| `test/engine.test.js` | A "Looking up" section; one existing feedback assertion gains `counted: true` |
| `app/guide.js` | **New.** `GUIDE = { en, mn }`, each with `tour` (5 slides) and `chapters` (`play`, `table`, `strategy`, `counting`, `app`) |
| `test/strings.test.js` | Guide shape and completeness tests |
| `app/app.js` | Tour overlay, Guide overlay, header **?**, Train help buttons, looked-up felt note, counting auto-open, chart split into `chartGrid` / `chartHtml` |
| `app/strings.js` | New UI labels in `en` and `mn` |
| `app/style.css` | Tour card, Guide sheet, **?** button, help chips, Train header breakpoint 600 → 899px |
| `scripts/deploy-pages.sh`, `README.md`, `.scratch/*/spec.md` | Ship `guide.js`; docs |

## Task 0: Branch

- [ ] **Step 1:** create the branch from `master`.

```bash
cd /opt/projects/blackjack && git checkout -b beginner-guide && git status --short
```

Expected: `Switched to a new branch 'beginner-guide'` and a clean tree.

---

### Task 1: Engine — Looking up

**Files:**
- Modify: `app/engine.js`
- Modify: `test/engine.test.js`

**Interfaces:**
- Produces:
  - Event `{ type: 'lookUp' }`. It sets `round.hinted = true` on Play's Round and on every drill slot's Round, wherever `phase === 'player'`. Otherwise it's a no-op.
  - Training feedback gains `counted: boolean`: `false` on a looked-up hand.
  - The saved `openHand` gains `hinted: boolean`. It's optional on load and defaults to `false`.

- [ ] **Step 1: Update the one existing assertion that pins the feedback shape**

In `test/engine.test.js`, test `'a Book-matching answer extends the Streak and shows feedback'`, replace:

```js
  assert.deepEqual(s.drill.feedback, { correct: true, chosen: book.action, book: book.action, rule: book.rule })
```

with:

```js
  assert.deepEqual(s.drill.feedback, { correct: true, chosen: book.action, book: book.action, rule: book.rule, counted: true })
```

- [ ] **Step 2: Write the failing tests**

In `test/engine.test.js`, add after the test `'a malformed open hand or a forged legacy Situation is rejected'`:

```js
// ---------------------------------------------------------------- Looking up

const lookUp = { type: 'lookUp' }

test('a looked-up training hand is graded but not recorded, and the Streak waits', () => {
  // Hard 12 vs 2: the Book hits; the 3 makes 15 vs 2, where it stands. Hitting again busts on the 10.
  let s = run(trainLab(['2', '9'], ['10', '2'], ['3', '10'], { streak: 5 }), startDrill('weighted'), lookUp, answer('hit'))
  assert.deepEqual(s.drill.feedback, { correct: true, chosen: 'hit', book: 'hit', rule: 'hard-12', counted: false })
  s = run(s, next, answer('hit')) // a Mistake, but not a recorded one
  assert.deepEqual([s.drill.feedback.correct, s.drill.feedback.counted], [false, false])
  assert.equal(s.streak, 5)
  assert.equal(s.streakEnded, null)
  assert.deepEqual(s.stats.cells, {})
  assert.deepEqual(s.stats.mistakes, [])
})

test('after a looked-up hand, the next hand counts again', () => {
  // Hard 16 vs 10: standing is a Mistake, but this hand was looked up. The next hand is recorded as usual.
  let s = run(trainLab(['10', '8'], ['10', '6'], [], { streak: 2 }), startDrill('weighted'), lookUp, answer('stand'))
  assert.equal(s.drill.round.phase, 'settled')
  assert.equal(s.streak, 2)
  s = step(s, next)
  s = step(s, right(s))
  assert.equal(s.drill.feedback.counted, true)
  assert.equal(s.streak, 3)
  assert.equal(Object.values(s.stats.cells).reduce((n, cell) => n + cell.total, 0), 1)
})

test('looking up during a Play Round keeps its Decisions off the record', () => {
  // Hard 16 vs 10: standing is a Mistake, but the Round was looked up, so the Coach stays quiet.
  const s = run(lab(['10', '10', '6', '7']), deal, lookUp, act('stand'))
  assert.equal(s.coachFlag, null)
  assert.deepEqual(s.stats.cells, {})
  assert.equal(s.round.phase, 'settled')
})

test('looking up with no Decision waiting changes nothing', () => {
  const fresh = lab()
  assert.deepEqual(step(fresh, lookUp).round, fresh.round)
  const over = run(trainLab(['10', '8'], ['10', '6']), startDrill('weighted'), answer('stand'))
  assert.deepEqual(step(over, lookUp).drill, over.drill)
})

test('a looked-up open hand stays looked up across a reload', () => {
  const s = run(trainLab(['2', '9'], ['10', '2'], ['3']), startDrill('weighted'), lookUp)
  const snap = snapshot(s)
  assert.equal(snap.openHand.hinted, true)
  const back = run(newLab(snap, { rng: seeded(9) }), startDrill('weighted'), answer('hit'))
  assert.equal(back.drill.feedback.counted, false)
  assert.deepEqual(back.stats.cells, {})
})

test('an open hand saved before looking up existed counts, and a malformed flag is rejected', () => {
  const s = run(trainLab(['2', '9'], ['10', '2'], ['3']), startDrill('weighted'), answer('hit')) // handSave has no flag
  assert.equal(s.drill.feedback.counted, true)
  const bad = handSave(['2', '9'], ['10', '2'])
  bad.openHand.hinted = 'yes'
  assert.throws(() => newLab(bad, { rng: seeded() }), /open hand/)
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/engine.test.js 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ fail 7`. The six new tests fail with `Invalid event: unknown event {"type":"lookUp"}`, or on the missing `counted`/`hinted`. The updated feedback assertion fails on the missing `counted: true`.

- [ ] **Step 4: Implement**

In `app/engine.js`:

(a) In `isResumableHand`, replace the line `const { dealer, hands, active } = hand ?? {}` with the following, and add `(hinted === undefined || typeof hinted === 'boolean') &&` as the first condition of the `return (…)`:

```js
  const { dealer, hands, active, hinted } = hand ?? {}
```

(b) Replace `resumedRound`'s signature and its `hinted: false,` line:

```js
function resumedRound({ dealer, hands, active, hinted = false }) {
```

```js
    hinted, // a looked-up hand stays looked up across a reload
```

(c) In `openWeightedHand`, replace the `return` line with:

```js
  return { dealer: round.dealer, hands, active: round.active, hinted: round.hinted }
```

(d) In `HANDLERS`, after `toggleHint`, add:

```js
  // The Guide's strategy chapter shows Book actions: every Decision waiting now is Looked up, like a hinted one.
  lookUp(s) {
    const rounds = [s.round, ...Object.values(s.drill?.slots ?? {}).map((slot) => slot.round)]
    for (const round of rounds) {
      if (round?.phase === 'player') round.hinted = true
    }
  },
```

(e) In the `answer` handler, replace the three lines from `const { correct, book } = recordDecision(…)` to `if (mode === 'weighted') updateStreak(s, correct)` with:

```js
    const situation = activeSituation(slot)
    const counted = !round.hinted
    const { correct, book } = counted ? recordDecision(s, situation, action, mode) : grade(situation, action)
    slot.feedback = { correct, chosen: action, book: book.action, rule: book.rule, counted }
    if (counted && mode === 'weighted') updateStreak(s, correct)
```

(f) Replace the first two lines of `recordDecision`'s body (`const book = bookAction(situation)` and `const correct = chosen === book.action`) with `const { correct, book } = grade(situation, chosen)`, and add above `recordDecision`:

```js
function grade(situation, chosen) {
  const book = bookAction(situation)
  return { correct: chosen === book.action, book }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 121`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add app/engine.js test/engine.test.js
git commit -m "Engine: Looking up — a peeked hand is graded but not recorded"
```

---

### Task 2: The Guide's content

**Files:**
- Create: `app/guide.js`
- Modify: `test/strings.test.js`, `scripts/deploy-pages.sh`, `README.md` (the deploy note)

**Interfaces:**
- Produces: `export const GUIDE = { en, mn }`. Each language has:
  - `tour`: `[{ art, title, text }]` × 5. `art` is one of `'blackjack' | 'chips' | 'check' | 'chart' | 'help'`.
  - `chapters`: `[{ id, title, blocks }]`, with ids in the order `play`, `table`, `strategy`, `counting`, `app`.
  - A block has exactly one kind:
    - `{ h }`, `{ p }` or `{ list: [...] }`;
    - `{ cards: ['As', ...], caption }`;
    - `{ chart: true }`, `{ rules: true }` or `{ tourButton: true }`.

- [ ] **Step 1: Write the failing tests**

In `test/strings.test.js`, add `import { GUIDE } from '../app/guide.js'` below the other imports, and append:

```js
// ---------------------------------------------------------------- the Guide

const BLOCK_KINDS = ['h', 'p', 'list', 'cards', 'chart', 'rules', 'tourButton']

function kindOf(block) {
  const kinds = Object.keys(block).filter((key) => BLOCK_KINDS.includes(key))
  assert.equal(kinds.length, 1, `exactly one kind per block: ${JSON.stringify(block)}`)
  return kinds[0]
}

// Everything that must match across languages: the slides' pictures, the chapters, and each block's kind.
// Card codes and list lengths are part of the shape; the words are not.
function shapeOf(guide) {
  const blockShape = (block) => {
    const kind = kindOf(block)
    if (kind === 'cards') return `cards:${block.cards.join(',')}`
    if (kind === 'list') return `list:${block.list.length}`
    return kind
  }
  return {
    tour: guide.tour.map((slide) => slide.art),
    chapters: guide.chapters.map((chapter) => ({ id: chapter.id, blocks: chapter.blocks.map(blockShape) })),
  }
}

test('the Guide has the same shape in English and Mongolian', () => {
  assert.deepEqual(shapeOf(GUIDE.mn), shapeOf(GUIDE.en))
})

test('the Guide has five slides and its five chapters in order', () => {
  assert.equal(GUIDE.en.tour.length, 5)
  assert.deepEqual(GUIDE.en.chapters.map((chapter) => chapter.id), ['play', 'table', 'strategy', 'counting', 'app'])
})

test('no Guide text is empty, and every card code is a real card', () => {
  const CARD = /^(10|[2-9JQKA])[shdc]$/
  for (const lang of ['en', 'mn']) {
    const { tour, chapters } = GUIDE[lang]
    for (const slide of tour) {
      for (const text of [slide.title, slide.text]) assert.ok(typeof text === 'string' && text.trim(), `${lang}: empty tour text`)
    }
    for (const chapter of chapters) {
      assert.ok(chapter.title.trim(), `${lang} ${chapter.id}: empty title`)
      for (const block of chapter.blocks) {
        const texts = [block.h, block.p, block.caption, ...(block.list ?? [])].filter((text) => text !== undefined)
        for (const text of texts) assert.ok(typeof text === 'string' && text.trim(), `${lang} ${chapter.id}: empty text`)
        for (const code of block.cards ?? []) assert.match(code, CARD)
      }
    }
  }
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/strings.test.js 2>&1 | grep -E 'ℹ (tests|fail)|Cannot find module'`
Expected: the file fails to load with `Cannot find module …/app/guide.js`.

- [ ] **Step 3: Write the content**

Create `app/guide.js`:

```js
// The Tour and the Guide: all long-form help, English and Mongolian side by side.
// Plain text in structured blocks; the shell renders and escapes it. Card codes are rank + suit (s h d c), e.g. 'As', '10h'.
// Mongolian copy needs a native speaker's review before publishing (see the spec's Out of Scope).

export const GUIDE = {
  en: {
    tour: [
      { art: 'blackjack', title: 'Welcome to Blackjack Lab', text: 'Beat the dealer: finish closer to 21 than the dealer without going over.' },
      { art: 'chips', title: 'Play', text: 'Tap chips to bet and press Deal. Then Hit, Stand, Double or Split. Turn on Hint to see the best move.' },
      { art: 'check', title: 'Train', text: 'Drills deal real hands and grade every Decision against basic strategy. Values and Count teach card counting.' },
      { art: 'chart', title: 'Improve', text: 'See your accuracy, your strategy chart and your mistakes. Your best Drill streak goes on the leaderboard.' },
      { art: 'help', title: 'Help is always here', text: 'Tap ? any time for the rules, the strategy chart and card counting.' },
    ],
    chapters: [
      {
        id: 'play',
        title: 'How to play',
        blocks: [
          { h: 'The goal' },
          { p: "You play against the dealer, not against other players. Finish with a total closer to 21 than the dealer's, without going over 21." },
          { h: 'Card values' },
          { list: ['2 to 10 count as their number.', 'Jack, Queen and King count 10.', 'An ace counts 11, or 1 if 11 would take you over 21.'] },
          { cards: ['As', '6h'], caption: "Soft 17: the ace can still count 1, so one more card can't bust you." },
          { cards: ['10c', '7d'], caption: 'Hard 17: no ace counting 11, so a big card busts it.' },
          { h: 'Blackjack' },
          { cards: ['As', 'Kh'], caption: 'An ace and a ten-value card as your first two cards: Blackjack, paid 3 to 2.' },
          { h: 'The deal' },
          { p: 'You get two cards face up. The dealer gets two: one face up, the Upcard, and one face down, the hole card. Your moves depend on the Upcard.' },
          { h: 'Your moves' },
          {
            list: [
              'Hit: take another card, as many times as you like.',
              'Stand: keep your total and end your turn.',
              'Double: double your Bet, take exactly one more card, and stop.',
              'Split: two cards of the same rank become two Hands, each with its own Bet.',
            ],
          },
          { h: "The dealer's turn" },
          { p: 'When you are done, the dealer turns over the hole card and must draw until reaching 17 or more. The dealer makes no choices.' },
          { h: 'Results' },
          {
            list: [
              "Win: your total beats the dealer's, or the dealer busts. Paid 1 to 1.",
              'Blackjack: paid 3 to 2, unless the dealer has one too, which is a Push.',
              'Push: a tie. Your Bet comes back.',
              'Bust: over 21. You lose at once, even if the dealer busts later.',
            ],
          },
        ],
      },
      {
        id: 'table',
        title: "This table's rules",
        blocks: [
          { p: "Rules change the best strategy, so here are this table's exactly. The Book and every drill assume them." },
          {
            list: [
              'Six decks, reshuffled once three quarters of the Shoe has been dealt.',
              'The dealer stands on all 17s, soft 17 included.',
              'Blackjack pays 3 to 2.',
              'With an ace or a ten-value Upcard, the dealer first checks for Blackjack. If it is there, the Round ends at once and you lose only your first Bet.',
              'You may double on any first two cards, and after a split.',
              'You may split up to four Hands. Split aces get one card each.',
              'A Hand that reaches 21 stands by itself.',
              'No surrender and no insurance.',
              'Bets run from 10 to 500 chips. Chips are free and have no real value.',
            ],
          },
        ],
      },
      {
        id: 'strategy',
        title: 'Basic strategy',
        blocks: [
          { p: 'For every Hand you can hold against every dealer Upcard, one move loses the least over time. That move is the Book. Playing the Book cuts the house edge at this table to about half a percent.' },
          { h: 'How to read the chart' },
          {
            list: [
              'Find your Hand in the rows: hard totals, soft totals (with an ace counting 11), or pairs.',
              "Find the dealer's Upcard in the columns.",
              "The cell's colour and letter give the move: H hit, S stand, D double (or hit if you can't), Ds double (or stand if you can't), P split.",
            ],
          },
          { chart: true },
          { h: 'Rules of thumb' },
          { p: 'The chart is easier to remember as a few rules:' },
          { rules: true },
        ],
      },
      {
        id: 'counting',
        title: 'Card counting',
        blocks: [
          { h: 'Why counting works' },
          { p: "Cards that leave the Shoe don't come back until the shuffle, so the cards still to come keep changing. When many low cards have gone, what is left is rich in tens and aces, and that helps you:" },
          {
            list: [
              'More Blackjacks, which pay you 3 to 2. The dealer gets them too, but only wins 1 to 1.',
              'The dealer busts more: with 12 to 16 the dealer must draw, and a ten busts it.',
              'Your doubles on 10 and 11 end on strong totals more often.',
            ],
          },
          { p: "When the cards left are rich in low cards, the opposite happens and the house edge grows. Counting tells you which kind of Shoe you're in, so you bet more only when it favours you." },
          { h: 'How: the Hi-Lo count' },
          { cards: ['2h', '3s', '4d', '5c', '6h'], caption: '+1 each: low cards leaving helps you.' },
          { cards: ['7s', '8d', '9c'], caption: '0: neutral.' },
          { cards: ['10h', 'Js', 'Qd', 'Kc', 'Ah'], caption: '−1 each: tens and aces leaving hurts you.' },
          {
            list: [
              'Running count: start at 0 after the shuffle and add the value of every card you see. A full deck adds up to 0.',
              'True count: divide the Running count by the decks left, which you read from the Discard tray, and drop the fraction. +6 with 3 decks left is +2.',
              'Bet: the True count minus 1, in units of the table minimum, from 1 to 8. At +1 or lower, bet the minimum.',
            ],
          },
          { h: 'Practise' },
          { p: 'Values builds speed: give each card its value in a 30-second sprint. Count is the real skill: keep the count through dealt rounds and answer the checks.' },
          { p: 'Chips here have no value, so this is practice. In a real casino, counting in your head is legal, but the casino can ask you to stop playing.' },
        ],
      },
      {
        id: 'app',
        title: 'Using the app',
        blocks: [
          { h: 'Play' },
          { p: 'Tap chips to set your Bet, then Deal. Hint shows the Book move before you act, and Auto re-deals the same Bet after every Round. If you run out, your chips are refilled to your Starting chips.' },
          { h: 'Train' },
          {
            list: [
              'Drill: hands start from the situations players get wrong most. Every Decision is graded, and right answers build your Streak.',
              "My mistakes: hands start from the cells you've missed, until you get each one right twice in a row.",
              'Values and Count: card counting practice.',
              "Looking at the strategy chart while a Decision is waiting means that hand isn't counted. Your Streak waits for the next one.",
            ],
          },
          { h: 'Improve' },
          { p: 'Your accuracy, your own strategy chart with your mistakes marked, recent mistakes, table results, counting progress, and the leaderboard, which ranks your best Drill streak.' },
          { h: 'Keys on a computer' },
          {
            list: [
              'Play: 1–4 chips, Enter deal, H S D P to Hit, Stand, Double or Split, A auto bet.',
              'Train: H S D P answer, Enter next. Values: ← ↓ →. Count: type the number with digits and −, Enter answers.',
              '? opens this Guide, Esc closes it.',
            ],
          },
          { tourButton: true },
        ],
      },
    ],
  },

  mn: {
    tour: [
      { art: 'blackjack', title: 'Blackjack Lab-д тавтай морил', text: 'Дилерийг ял: 21-ээс хэтрэлгүйгээр дилерээс илүү 21-д ойр оноо цуглуул.' },
      { art: 'chips', title: 'Тоглох', text: 'Жетон дарж бооцоо тавиад Тараах-ыг дар. Дараа нь Авах, Зогсох, Давхарлах эсвэл Хуваах-ыг сонго. Зөвлөгөөг асаавал хамгийн зөв нүүдэл харагдана.' },
      { art: 'check', title: 'Дасгал', text: 'Дасгал бодит гар тарааж, шийдвэр бүрийг үндсэн стратегитай харьцуулж дүгнэнэ. Утга, Тоолох хэсэг карт тоолохыг заана.' },
      { art: 'chart', title: 'Ахиц', text: 'Нарийвчлал, стратегийн хүснэгт, алдаагаа хар. Дасгалын шилдэг цуврал тань тэргүүлэгчдийн жагсаалтад орно.' },
      { art: 'help', title: 'Тусламж үргэлж энд', text: 'Дүрэм, стратегийн хүснэгт, карт тоолох заавар хэрэгтэй бол хүссэн үедээ ?-г дар.' },
    ],
    chapters: [
      {
        id: 'play',
        title: 'Хэрхэн тоглох',
        blocks: [
          { h: 'Зорилго' },
          { p: 'Та бусад тоглогчтой биш, дилертэй тоглоно. 21-ээс хэтрэлгүйгээр дилерээс илүү 21-д ойр нийлбэр цуглуулах нь зорилго.' },
          { h: 'Картын оноо' },
          { list: ['2-оос 10 хүртэлх карт өөрийн тоогоор тоологдоно.', 'Боол, Хатан, Хаан 10 оноотой.', 'Тамга 11 оноотой, харин 11 гэж тооцвол 21-ээс хэтрэх бол 1 оноотой.'] },
          { cards: ['As', '6h'], caption: 'Зөөлөн 17: тамга 1 болж чадах тул дахиад нэг карт авахад хэтрэхгүй.' },
          { cards: ['10c', '7d'], caption: 'Хатуу 17: 11 гэж тоологдох тамга байхгүй тул том карт ирвэл хэтэрнэ.' },
          { h: 'Блэкжек' },
          { cards: ['As', 'Kh'], caption: 'Эхний хоёр карт тань тамга ба 10 оноотой карт бол Блэкжек: 3:2 төлнө.' },
          { h: 'Тараалт' },
          { p: 'Танд хоёр карт ил тараана. Дилер хоёр карт авна: нэг нь ил карт, нөгөө нь далд карт. Таны нүүдэл дилерийн ил картаас хамаарна.' },
          { h: 'Таны нүүдэл' },
          {
            list: [
              'Авах: дахиад карт авна, хэдэн ч удаа болно.',
              'Зогсох: нийлбэрээ хадгалж ээлжээ дуусгана.',
              'Давхарлах: бооцоогоо хоёр дахин нэмээд яг нэг карт аваад зогсоно.',
              'Хуваах: ижил хоёр карт хоёр тусдаа гар болж, тус бүр өөрийн бооцоотой.',
            ],
          },
          { h: 'Дилерийн ээлж' },
          { p: 'Таныг дуусмагц дилер далд картаа эргүүлж, 17 ба түүнээс дээш болтол заавал карт авна. Дилер сонголт хийдэггүй.' },
          { h: 'Үр дүн' },
          {
            list: [
              'Хожил: таны нийлбэр дилерийнхээс их, эсвэл дилер хэтэрвэл. 1:1 төлнө.',
              'Блэкжек: 3:2 төлнө, харин дилер бас блэкжектэй бол тэнцээ.',
              'Тэнцээ: оноо тэнцвэл бооцоо тань буцна.',
              'Хэтрэлт: 21-ээс давбал шууд хожигдоно, дилер дараа нь хэтэрсэн ч гэсэн.',
            ],
          },
        ],
      },
      {
        id: 'table',
        title: 'Энэ ширээний дүрэм',
        blocks: [
          { p: 'Дүрэм өөрчлөгдвөл хамгийн зөв стратеги ч өөрчлөгдөнө. Энэ ширээний яг дүрмийг доор жагсаав. Стратеги болон бүх дасгал эдгээрт үндэслэнэ.' },
          {
            list: [
              'Зургаан багц карт; хайрцгийн дөрөвний гурав тараагдмагц дахин холино.',
              'Дилер бүх 17 дээр зогсоно, зөөлөн 17 ч мөн адил.',
              'Блэкжек 3:2 төлнө.',
              'Дилерийн ил карт тамга эсвэл 10 оноотой бол дилер эхлээд блэкжек эсэхээ шалгана. Блэкжек байвал тойрог шууд дуусч, та зөвхөн анхны бооцоогоо алдана.',
              'Эхний хоёр карт дээр давхарлаж болно, хуваасны дараа ч болно.',
              'Дөрвөн гар хүртэл хувааж болно. Хуваасан тамга тус бүр нэг л карт авна.',
              '21 болсон гар өөрөө зогсоно.',
              'Бууж өгөх, даатгал байхгүй.',
              'Бооцоо 10-аас 500 жетон. Жетон үнэгүй бөгөөд бодит үнэ цэнэгүй.',
            ],
          },
        ],
      },
      {
        id: 'strategy',
        title: 'Үндсэн стратеги',
        blocks: [
          { p: 'Дилерийн ил карт бүрийн эсрэг таны гар бүрт урт хугацаанд хамгийн бага алддаг нэг нүүдэл бий. Тэр нүүдлийг Стратеги гэнэ. Стратегийн дагуу тоглоход энэ ширээн дээрх казиногийн давуу тал хагас хувь орчим болж буурна.' },
          { h: 'Хүснэгтийг хэрхэн унших вэ' },
          {
            list: [
              'Мөрүүдээс гараа ол: хатуу нийлбэр, зөөлөн нийлбэр (11 гэж тоологдох тамгатай) эсвэл хос.',
              'Баганаас дилерийн ил картыг ол.',
              'Нүдний өнгө, үсэг нүүдлийг заана: H авах, S зогсох, D давхарлах (боломжгүй бол авах), Ds давхарлах (боломжгүй бол зогсох), P хуваах.',
            ],
          },
          { chart: true },
          { h: 'Санах дүрмүүд' },
          { p: 'Хүснэгтийг цөөн дүрмээр санахад амар:' },
          { rules: true },
        ],
      },
      {
        id: 'counting',
        title: 'Карт тоолох',
        blocks: [
          { h: 'Тоолох яагаад ажилладаг вэ' },
          { p: 'Тараагдсан карт холих хүртэл буцаж ирэхгүй тул үлдсэн картын бүрэлдэхүүн байнга өөрчлөгдөнө. Бага картууд олноор гарсан үед үлдсэн хэсэгт 10 оноотой карт, тамга их байх бөгөөд энэ нь танд ашигтай:' },
          {
            list: [
              'Блэкжек олон бууна, танд 3:2 төлнө. Дилерт ч бас бууна, гэхдээ дилер ердөө 1:1 хожино.',
              'Дилер ойр ойрхон хэтэрнэ: 12–16 дээр дилер заавал карт авах бөгөөд 10 ирвэл хэтэрнэ.',
              '10 ба 11 дээр давхарлахад хүчтэй нийлбэр илүү олон гарна.',
            ],
          },
          { p: 'Үлдсэн хэсэгт бага карт их байвал эсрэгээрээ болж казиногийн давуу тал өснө. Тоолох нь ямар хайрцагтай байгааг хэлж өгөх тул зөвхөн танд ашигтай үед илүү бооцоо тавина.' },
          { h: 'Яаж: Hi-Lo тоолол' },
          { cards: ['2h', '3s', '4d', '5c', '6h'], caption: '+1 тус бүр: бага карт гарах нь танд ашигтай.' },
          { cards: ['7s', '8d', '9c'], caption: '0: саармаг.' },
          { cards: ['10h', 'Js', 'Qd', 'Kc', 'Ah'], caption: '−1 тус бүр: 10 оноотой карт, тамга гарах нь танд хохиролтой.' },
          {
            list: [
              'Явцын тоо: холисны дараа 0-ээс эхэлж, харсан карт бүрийн утгыг нэм. Бүтэн багцын нийлбэр 0.',
              'Жинхэнэ тоо: явцын тоог үлдсэн багцын тоонд хуваа (хаягдлын тавиураас уншина), бутархайг хая. 3 багц үлдсэн үед +6 бол +2.',
              'Бооцоо: жинхэнэ тоо хасах 1, ширээний доод бооцооны нэгжээр, 1-ээс 8. +1 ба түүнээс доош бол доод бооцоо тавь.',
            ],
          },
          { h: 'Дадлага' },
          { p: 'Утга хурд суулгана: 30 секундын спринтэд карт бүрийн утгыг хэл. Тоолох бол жинхэнэ ур чадвар: тараагдаж буй тойргуудын явцад тоогоо барьж, шалгалтад хариул.' },
          { p: 'Энд жетон үнэ цэнэгүй тул энэ бол дадлага. Жинхэнэ казинод толгойдоо тоолох нь хууль зөрчихгүй ч казино таныг тоглохоо болихыг хүсэж болно.' },
        ],
      },
      {
        id: 'app',
        title: 'Апп ашиглах',
        blocks: [
          { h: 'Тоглох' },
          { p: 'Жетон дарж бооцоогоо тогтоогоод Тараах-ыг дар. Зөвлөгөө нь нүүдэл хийхээс өмнө стратегийн нүүдлийг харуулна, Авто нь тойрог бүрийн дараа ижил бооцоогоор дахин тараана. Жетон дуусвал эхний жетоны хэмжээнд хүртэл нөхөгдөнө.' },
          { h: 'Дасгал' },
          {
            list: [
              'Дасгал: хамгийн их алддаг нөхцөлөөс гар эхэлнэ. Шийдвэр бүрийг дүгнэх ба зөв хариулт цувралыг тань өсгөнө.',
              'Миний алдаа: алдсан нүднүүдээс чинь гар эхэлнэ, нүд бүрийг хоёр удаа дараалан зөв хариултал.',
              'Утга ба Тоолох: карт тоолох дадлага.',
              'Шийдвэр хүлээгдэж байхад стратегийн хүснэгт харвал тэр гар тоологдохгүй. Цуврал тань дараагийн гарыг хүлээнэ.',
            ],
          },
          { h: 'Ахиц' },
          { p: 'Нарийвчлал, алдаа тэмдэглэгдсэн өөрийн стратегийн хүснэгт, сүүлийн алдаанууд, ширээний үр дүн, тоолох ахиц, мөн дасгалын шилдэг цувралаар эрэмбэлдэг тэргүүлэгчдийн жагсаалт.' },
          { h: 'Компьютерын товчлуур' },
          {
            list: [
              'Тоглох: 1–4 жетон, Enter тараах, H S D P авах, зогсох, давхарлах, хуваах, A авто бооцоо.',
              'Дасгал: H S D P хариулах, Enter дараах. Утга: ← ↓ →. Тоолох: тоо ба − бичээд Enter-ээр хариулна.',
              '? энэ гарын авлагыг нээнэ, Esc хаана.',
            ],
          },
          { tourButton: true },
        ],
      },
    ],
  },
}
```

- [ ] **Step 4: Ship it**

In `scripts/deploy-pages.sh`:
- Change the first comment line's "the five public app files" to "the public app files".
- Change the `FILES` line to:

```bash
FILES=(index.html app.js engine.js strings.js style.css guide.js)
```

In `README.md`, in the Deploy section:
- Change "It copies only the five public app files" to "It copies only the six public app files".
- Add `| \`app/guide.js\` | The Tour and the Guide's text, English and Mongolian. |` to the Layout table, after the `app/strings.js` row.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 124`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add app/guide.js test/strings.test.js scripts/deploy-pages.sh README.md
git commit -m "Guide content: the Tour and five chapters, English and Mongolian"
```

---

### Task 3: Shell — the Tour

**Files:**
- Modify: `app/app.js`, `app/strings.js`, `app/style.css`
- QA (scratchpad): update every `qa-*.mjs` for the Tour; new `qa/qa-tour.mjs`

**Interfaces:**
- Consumes: `GUIDE[lang].tour` (Task 2).
- Produces:
  - Overlay `{ type: 'tour', slide, first }`. `first` means it's the first launch, so the end leads to the chip picker.
  - `CLICKS.closeOverlay` routes a first-launch Tour to the chip picker.
  - `tourStep(by)` and `guideCard(code)` (Task 4 reuses `guideCard`).
  - `overlayKey(key)`, and `render()` focusing `[data-autofocus]` inside a dialog.
  - The strings `tourSkip`, `tourBack`, `tourChips`, `tourDone`, `tourReplay` and `tourStep`.

- [ ] **Step 1: Strings**

In `app/strings.js`, add to `en` after `close: 'Close',`:

```js
    tourSkip: 'Skip',
    tourBack: 'Back',
    tourChips: 'Choose your chips',
    tourDone: 'Done',
    tourReplay: 'Replay the tour',
    tourStep: 'Slide {n} of {total}',
```

and to `mn` after `close: 'Хаах',`:

```js
    tourSkip: 'Алгасах',
    tourBack: 'Буцах',
    tourChips: 'Жетоноо сонгох',
    tourDone: 'Болсон',
    tourReplay: 'Танилцуулгыг дахин үзэх',
    tourStep: '{total}-с {n}-р хуудас',
```

- [ ] **Step 2: The Tour in the shell**

In `app/app.js`:

(a) Below `import { STRINGS } from './strings.js'`, add `import { GUIDE } from './guide.js'`.

(b) In `boot()`, replace `if (loaded.saved == null) ui.overlay = { type: 'bankroll', first: true, pick: null }` with:

```js
  // First launch: the Tour, which ends in the Starting-chips picker.
  if (loaded.saved == null) ui.overlay = { type: 'tour', slide: 0, first: true }
```

(c) In `render()`, replace the line `if (modal && !modal.contains(document.activeElement)) modal.querySelector('button')?.focus()` with:

```js
  if (modal && !modal.contains(document.activeElement)) (modal.querySelector('[data-autofocus]') ?? modal.querySelector('button'))?.focus()
```

(d) In `onKey`, replace:

```js
  if (ui.overlay) {
    if (key === 'escape') CLICKS.closeOverlay()
    return
  }
```

with:

```js
  if (ui.overlay) {
    overlayKey(key)
    return
  }
```

and add after `onKey`:

```js
// In a dialog only Esc works (it closes; in the Tour it skips), plus ← and → to page through the Tour.
function overlayKey(key) {
  if (key === 'escape') CLICKS.closeOverlay()
  else if (ui.overlay.type === 'tour' && key === 'arrowright') tourStep(1)
  else if (ui.overlay.type === 'tour' && key === 'arrowleft') tourStep(-1)
}
```

(e) In `CLICKS`, replace `closeOverlay` with the version below, and add `tourStep`:

```js
  closeOverlay: () => {
    const { type, first } = ui.overlay ?? {}
    // Skipping or finishing the first-launch Tour still leads to choosing Starting chips.
    ui.overlay = type === 'tour' && first ? { type: 'bankroll', first: true, pick: null } : null
    render()
  },
  tourStep: ({ by }) => tourStep(Number(by)),
```

(f) In `overlayHtml()`, directly after `if (!overlay) return ''`, add `if (overlay.type === 'tour') return tourHtml(overlay)`. After `overlayHtml`, add:

```js
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
```

- [ ] **Step 3: Styles**

In `app/style.css`, directly after the `.modal { … }` rule, add:

```css
/* The Tour: a card with a small felt picture, dots, and Skip / Back / Next. */
.tour-art {
  --card-w: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 124px;
  border-radius: 14px;
  background: radial-gradient(120% 85% at 50% 30%, var(--felt) 0%, var(--felt-deep) 78%);
}
.tour-art .cards {
  min-height: 0;
}
.tour-art .stack {
  transform: scale(1.8);
}
.tour-art .hm-cell {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  font-weight: 800;
}
.tour-check {
  color: #7dffa9;
  font-size: 44px;
  font-weight: 800;
}
.tour-help {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border: 3px solid var(--gold);
  border-radius: 50%;
  color: var(--gold);
  font-size: 34px;
  font-weight: 800;
}
.tour-text {
  margin: 0;
}
.tour-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
}
.tour-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--line);
}
.tour-dots .on {
  background: var(--gold);
}
.tour-row {
  display: flex;
  gap: 8px;
}
.tour-row .primary {
  margin-left: auto;
}
```

- [ ] **Step 4: Unit tests still pass**

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 124`, `ℹ fail 0`.

- [ ] **Step 5: QA — teach the existing scripts about the Tour**

Every QA script that starts from a fresh first launch now meets the Tour before the chip picker. Insert one Esc (which skips the Tour) after each fresh load. Every script then behaves exactly as before:

```bash
cd /tmp/claude-1000/-opt-projects-blackjack/3679f096-99b4-4e78-8a8f-4f20d3575227/scratchpad/qa && python3 - <<'EOF'
import pathlib, re
pattern = re.compile(r"(\n([ \t]*)await b\.eval\('localStorage\.clear\(\)'\)\n[ \t]*await b\.goto\([^\n]*\)\n)")
for path in sorted(pathlib.Path('.').glob('qa-*.mjs')):
    s = path.read_text()
    new = pattern.sub(lambda m: m.group(1) + f"{m.group(2)}await b.key('Escape', 250) // skip the first-launch Tour\n", s)
    if new != s:
        path.write_text(new)
        print('updated', path.name)
EOF
```

Expected: the list includes `qa-values.mjs`, `qa-count.mjs`, `qa-stable.mjs`, `qa-train-stable.mjs`, `qa-auto2.mjs`, `qa-bankroll.mjs`, `qa-improve-counting.mjs` and `qa-improve-scroll.mjs`.

- [ ] **Step 6: QA — the Tour**

Create `qa/qa-tour.mjs`:

```js
import { launch } from './cdp.mjs'
const URL = 'http://localhost:8765/?name=Z'
const dialog = (b) => b.eval(`!!document.querySelector('.modal')`)
async function run(width, height, desktop, port) {
  const b = await launch({ port, realSdk: true })
  try {
    await b.viewport(width, height, true, desktop)
    await b.goto(URL, 300)
    await b.eval('localStorage.clear()')
    await b.goto(URL, 800)
    const titles = [await b.text('.modal h2')]
    if (!desktop) await b.shot('tour-phone')
    for (let i = 0; i < 4; i++) {
      await b.key('ArrowRight', 150)
      titles.push(await b.text('.modal h2'))
    }
    const lastButton = await b.text('[data-k=tour-end]')
    await b.key('ArrowRight', 150) // past the end: stays put
    const stillLast = await b.text('.modal h2')
    await b.key('Enter', 300) // the focused button on the last slide
    const picker = await b.text('.modal h2')
    await b.click('[data-k=bankroll-1000]', 300)
    console.log({ titles, lastButton, stillLast, picker, closed: !(await dialog(b)) })
    await b.eval('localStorage.clear()')
    await b.goto(URL, 800)
    await b.click('[data-k=tour-skip]', 300)
    console.log('Skip → picker:', await b.text('.modal h2'))
    await b.click('[data-k=bankroll-1000]', 300)
    await b.goto(URL, 800)
    console.log('returning player → dialog?', await dialog(b))
    console.log('errors:', b.errors)
  } finally {
    b.close()
  }
}
await run(1920, 1080, true, 9392)
await run(390, 844, false, 9393)
```

Run: `cd /tmp/claude-1000/-opt-projects-blackjack/3679f096-99b4-4e78-8a8f-4f20d3575227/scratchpad/qa && node qa-tour.mjs`
Expected, for each viewport:
- `titles` are the five English slide titles, in order;
- `lastButton: 'Choose your chips'`;
- `stillLast: 'Help is always here'`;
- `picker: 'How many chips do you want to start with?'`;
- `closed: true`;
- `Skip → picker: How many chips do you want to start with?`;
- `returning player → dialog? false`;
- `errors: []`.

Look at `qa/tour-phone.png`: the felt picture with A♠ K♥, the title, the dots, and Skip / Back / Next.

Run: `node qa-bankroll.mjs && node qa-auto2.mjs && node qa-stable.mjs 2>&1 | grep -E 'distinct|errors'`
Expected: the same lines as before this branch, and `errors: []`.

- [ ] **Step 7: Commit**

```bash
git add app/app.js app/strings.js app/style.css
git commit -m "Tour: welcome slides on first launch, leading to the chip picker"
```

---

### Task 4: Shell — the Guide sheet

**Files:**
- Modify: `app/app.js`, `app/strings.js`, `app/style.css`
- QA (scratchpad): new `qa/qa-guide.mjs`

**Interfaces:**
- Consumes:
  - `GUIDE[lang].chapters` (Task 2);
  - the `lookUp` event (Task 1);
  - `guideCard`, `overlayKey` and the Tour overlay (Task 3);
  - `leaveValues`, `clearCountTimer`, `resumeCount`, `scheduleAutoDeal` and `countActive` (existing).
- Produces:
  - Overlay `{ type: 'guide', chapter, sawChart }`.
  - `openGuide(chapter)`. Task 5's help buttons and the counting auto-open use it.
  - `CLICKS.guideOpen({ chapter })`, `CLICKS.guideChapter({ chapter })` and `CLICKS.tourReplay()`.
  - `chartGrid(cells | null)`, where `null` gives the plain Book chart.
  - `modal(content, variant)`.

- [ ] **Step 1: Strings**

In `app/strings.js`:
- Add to `en` after `tourStep: …,`: `guide: 'Guide',` and `guideOpen: 'Open the Guide',`.
- Add to `en` after `chartCellEmpty: …,`: `chartCellPlain: '{row} vs {up}: {action}.',`.
- Add to `mn` after `tourStep: …,`: `guide: 'Гарын авлага',` and `guideOpen: 'Гарын авлага нээх',`.
- Add to `mn` after `chartCellEmpty: …,`: `chartCellPlain: '{row} ба {up}: {action}.',`.

- [ ] **Step 2: The ? button, opening and closing**

In `app/app.js`:

(a) In `profileHtml()`, insert between the `<span class="who">…</span>` line and the `<span class="purse">` line:

```js
    <button class="help-button" data-do="guideOpen" data-chapter="play" data-k="guide" aria-label="${t('guideOpen')}">?</button>
```

(b) In `onKey`, directly after the `if (ui.overlay) { … }` block, add:

```js
  if (key === '?') {
    e.preventDefault()
    openGuide('play')
    return
  }
```

(c) Replace `countActive()` so the Count drill waits behind any dialog:

```js
function countActive() {
  return ui.tab === 'train' && state.drill?.mode === 'count' && !ui.overlay
}
```

(d) In `CLICKS`:
- Replace `closeOverlay` with the version below.
- Add the three new clicks.
- After `CLICKS`, add `openGuide`, `showChapter` and `afterGuide`.

```js
  closeOverlay: () => {
    const { type, first, sawChart } = ui.overlay ?? {}
    // Skipping or finishing the first-launch Tour still leads to choosing Starting chips.
    ui.overlay = type === 'tour' && first ? { type: 'bankroll', first: true, pick: null } : null
    if (type === 'guide') afterGuide(sawChart)
    render()
  },
  guideOpen: ({ chapter }) => openGuide(chapter),
  guideChapter: ({ chapter }) => showChapter(chapter),
  tourReplay: () => {
    ui.overlay = { type: 'tour', slide: 0, first: false }
    render()
  },
```

```js
// The Guide covers the table: a sprint can't run behind it, and the Count drill waits for it to close.
function openGuide(chapter) {
  if (ui.overlay) return // never on top of another dialog
  leaveValues()
  clearCountTimer()
  ui.overlay = { type: 'guide', chapter, sawChart: false }
  showChapter(chapter)
}

// Only the strategy chapter shows Book actions, so only it marks waiting Decisions as Looked up.
function showChapter(chapter) {
  ui.overlay.chapter = chapter
  if (chapter !== 'strategy') {
    render()
    return
  }
  ui.overlay.sawChart = true
  dispatch({ type: 'lookUp' }) // dispatch renders
}

// Back from the Guide: a hand dealt behind an open chart is looked up too, and paused drills carry on.
function afterGuide(sawChart) {
  if (sawChart) dispatch({ type: 'lookUp' })
  if (countActive()) resumeCount(state.drill.count)
  if (ui.tab === 'play' && ui.autoBet) scheduleAutoDeal()
}
```

(e) In `render()`:
- Directly after the line `const scroll = main?.dataset.tab === ui.tab ? main.scrollTop : 0`, add the first two lines below.
- Directly after `view.querySelector('main').scrollTop = scroll`, add the last two:

```js
  const guide = view.querySelector('.guide-body')
  const guideScroll = guide?.dataset.chapter === ui.overlay?.chapter ? guide.scrollTop : 0
```

```js
  const guideBody = view.querySelector('.guide-body')
  if (guideBody) guideBody.scrollTop = guideScroll
```

- [ ] **Step 3: The sheet, its chapters and the plain chart**

In `app/app.js`:

(a) Replace `modal(content)` with:

```js
function modal(content, variant = '') {
  return `<div class="scrim"><div class="modal${variant}" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${content}</div></div>`
}
```

(b) In `overlayHtml()`, after the `tour` line from Task 3, add `if (overlay.type === 'guide') return guideHtml(overlay)`. After `guideCard`, add:

```js
// The Guide: chapter chips across the top, the chapter below; only the body scrolls.
function guideHtml({ chapter }) {
  const { chapters } = GUIDE[lang]
  const current = chapters.find((c) => c.id === chapter)
  const chips = chapters.map(
    (c) =>
      `<button role="tab" aria-selected="${c.id === chapter}" data-do="guideChapter" data-chapter="${c.id}" data-k="chapter-${c.id}">${esc(c.title)}</button>`,
  )
  return modal(
    `<header class="guide-top">
      <h2 id="dialog-title">${t('guide')}</h2>
      <button class="guide-close" data-do="closeOverlay" data-k="guide-close" aria-label="${t('close')}">✕</button>
    </header>
    <nav class="guide-chapters" role="tablist">${chips.join('')}</nav>
    <article class="guide-body" data-chapter="${chapter}">
      <h3 class="guide-title">${esc(current.title)}</h3>
      ${current.blocks.map(guideBlock).join('')}
    </article>`,
    ' guide',
  )
}

const RULE_IDS = [...new Set(CHART_ROWS.map((row) => row.rule)), 'no-double', 'no-split']

// Guide content is plain text in structured blocks; everything is escaped here.
function guideBlock(block) {
  if (block.h) return `<h4>${esc(block.h)}</h4>`
  if (block.p) return `<p>${esc(block.p)}</p>`
  if (block.list) return `<ul>${block.list.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
  if (block.cards) {
    return `<figure class="guide-cards"><div class="cards">${block.cards.map(guideCard).join('')}</div><figcaption>${esc(block.caption)}</figcaption></figure>`
  }
  if (block.chart) return chartGrid(null)
  if (block.rules) return `<ul class="guide-rules">${RULE_IDS.map((rule) => `<li>${esc(t(`rule.${rule}`))}</li>`).join('')}</ul>`
  if (block.tourButton) return `<button class="primary" data-do="tourReplay" data-k="tour-replay">${t('tourReplay')}</button>`
  throw new Error(`unknown Guide block ${JSON.stringify(block)}`)
}
```

(c) Replace `chartHtml(cells)` with `chartGrid` and a slimmer `chartHtml`:

```js
// The chart's grid and action legend. With the player's cells it is their chart (unplayed cells faded, Mistakes
// ringed); with null it is the plain Book, as the Guide shows it.
function chartGrid(cells) {
  const head = `<div class="hm-row hm-head"><span></span>${UPCARDS.map((up) => `<span>${up}</span>`).join('')}</div>`
  let group = null
  const rows = CHART_ROWS.map((row) => {
    const heading = row.group !== group ? `<div class="hm-group">${t(`group.${row.group}`)}</div>` : ''
    group = row.group
    const cellsHtml = row.codes.map((code, col) => {
      const up = UPCARDS[col]
      const vars = { row: rowTitle(row), up, action: actionName(ACTION_OF_CODE[code]) }
      const cell = cells?.[row.cells[col]]
      let state = ''
      let label = t('chartCellPlain', vars)
      if (cells) {
        state = cell ? ` miss-${heatLevel(1 - cell.correct / cell.total)}` : ' unplayed'
        label = cell ? t('chartCell', { ...vars, correct: cell.correct, total: cell.total }) : t('chartCellEmpty', vars)
      }
      return `<span class="hm-cell act-${CODE_CLASS[code]}${state}" title="${esc(label)}" aria-label="${esc(label)}">${code}</span>`
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
  return `<div class="heatmap">${head}${rows.join('')}</div>
    <div class="legend small">${actions.join('')}</div>`
}

function chartHtml(cells) {
  return `<h2>${t('chartTitle')}</h2>
    <p class="muted small">${t('chartNote')}</p>
    ${chartGrid(cells)}
    <div class="legend small">
      <span class="legend-item"><span class="hm-cell act-hit unplayed"></span> ${t('chartNew')}</span>
      <span class="legend-item"><span class="hm-cell act-hit miss-1"></span><span class="hm-cell act-hit miss-4"></span> ${t('chartRing')}</span>
    </div>`
}
```

- [ ] **Step 4: Styles**

In `app/style.css`, after the `.purse strong { … }` rule, add:

```css
.help-button {
  flex: none;
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border-color: var(--gold-deep);
  border-radius: 50%;
  color: var(--accent);
  font-size: 18px;
  font-weight: 800;
}
```

After the Task 3 Tour rules, add:

```css
/* The Guide: a full-height sheet over the app; only its body scrolls. */
.modal.guide {
  height: 100dvh;
  max-height: none;
  max-width: 760px;
  overflow: hidden;
  gap: 0;
  padding: 0;
  border-radius: 0;
}
.guide-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
}
.guide-top h2 {
  margin: 0;
}
.guide-close {
  width: 40px;
  min-height: 40px;
  padding: 0;
  border-radius: 50%;
  font-size: 18px;
}
.guide-chapters {
  display: flex;
  gap: 6px;
  padding: 0 16px 10px;
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
}
.guide-chapters button {
  flex: none;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 13px;
  white-space: nowrap;
}
.guide-chapters [aria-selected='true'] {
  background: var(--gold);
  border-color: var(--gold-deep);
  color: var(--gold-ink);
}
.guide-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px calc(24px + env(safe-area-inset-bottom));
  line-height: 1.5;
}
.guide-body h3 {
  margin: 4px 0 8px;
  font-size: 20px;
}
.guide-body h4 {
  margin: 18px 0 6px;
  font-size: 15px;
}
.guide-body p,
.guide-body ul {
  margin: 0 0 10px;
}
.guide-body ul {
  padding-left: 20px;
}
.guide-body li {
  margin-bottom: 4px;
}
.guide-cards {
  --card-w: 44px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 0 14px;
}
.guide-cards .cards {
  flex: none;
  min-height: 0;
}
.guide-cards figcaption {
  color: var(--muted);
  font-size: 13px;
}
.guide-body .heatmap {
  margin-top: 8px;
}
```

- [ ] **Step 5: Unit tests still pass**

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 124`, `ℹ fail 0`.

- [ ] **Step 6: Browser QA — the Guide**

Create `qa/qa-guide.mjs`:

```js
import { launch, sleep } from './cdp.mjs'
const URL = 'http://localhost:8765/?name=Z'
const chapterTitle = (b) => b.text('.guide-title')
const countCards = `[...document.querySelectorAll('.table.count .card:not(.back) .rank')].map((el) => el.textContent).join(',')`
async function run(width, height, desktop, port) {
  const b = await launch({ port, realSdk: true })
  try {
    await b.viewport(width, height, true, desktop)
    await b.goto(URL, 300)
    await b.eval('localStorage.clear()')
    await b.goto(URL, 800)
    await b.key('Escape', 250) // skip the Tour
    await b.key('Escape', 250) // close the chip picker
    const fromTabs = []
    for (const tab of ['play', 'train', 'improve']) {
      await b.click(`[data-k=tab-${tab}]`, 300)
      await b.click('[data-k=guide]', 300)
      fromTabs.push(`${tab}: ${await chapterTitle(b)}`)
      await b.key('Escape', 200)
    }
    await b.key('?', 300)
    const chapters = []
    for (const id of ['play', 'table', 'strategy', 'counting', 'app']) {
      await b.click(`[data-k=chapter-${id}]`, 200)
      chapters.push(await chapterTitle(b))
      if (id === 'strategy') {
        const chart = await b.eval(`({
          cells: document.querySelectorAll('.guide-body .heatmap .hm-cell').length,
          faded: document.querySelectorAll('.guide-body .unplayed').length,
          rules: document.querySelectorAll('.guide-rules li').length,
        })`)
        console.log('strategy chapter:', chart)
        if (!desktop) await b.shot('guide-strategy-phone')
      }
    }
    await b.click('[data-k=tour-replay]', 300)
    const replay = await b.text('.modal h2')
    await b.key('Escape', 250)
    const afterReplay = await b.eval(`!!document.querySelector('.modal')`)
    console.log({ fromTabs, chapters, replay, afterReplay })

    // A Drill answer after the strategy chapter records nothing.
    await b.click('[data-k=tab-train]', 300)
    await b.key('?', 300)
    await b.click('[data-k=chapter-strategy]', 200)
    await b.key('Escape', 200)
    await b.click('[data-k=answer-stand]', 300)
    await b.click('[data-k=tab-improve]', 300)
    console.log('Improve after a looked-up answer:', await b.text('.block p.muted'))

    // The Count drill waits behind the Guide and carries on after it.
    await b.click('[data-k=tab-train]', 300)
    await b.click('[data-k=mode-count]', 1500)
    await b.key('?', 300)
    const behind = await b.eval(countCards)
    await sleep(2500)
    const stillBehind = await b.eval(countCards)
    await b.key('Escape', 200)
    await sleep(3000)
    console.log('Count behind the Guide:', { paused: behind === stillBehind, resumed: (await b.eval(countCards)) !== stillBehind })

    // Opening the Guide ends a running sprint.
    await b.click('[data-k=mode-values]', 300)
    await b.key('Enter', 200)
    await b.key('?', 300)
    await b.key('Escape', 200)
    console.log('sprint after the Guide:', await b.text('.felt-print strong'))
    console.log('errors:', b.errors)
  } finally {
    b.close()
  }
}
await run(1920, 1080, true, 9398)
await run(390, 844, false, 9399)
```

Run: `cd /tmp/claude-1000/-opt-projects-blackjack/3679f096-99b4-4e78-8a8f-4f20d3575227/scratchpad/qa && node qa-guide.mjs`
Expected, for each viewport:
- `strategy chapter: { cells: 280, faded: 0, rules: 19 }`;
- `fromTabs` all end in `How to play`;
- `chapters` are the five English titles, in order;
- `replay: 'Welcome to Blackjack Lab'`;
- `afterReplay: false`;
- `Improve after a looked-up answer: Play or train to see your stats.`;
- `Count behind the Guide: { paused: true, resumed: true }`;
- `sprint after the Guide:` shows the sprint result (`0 right · 0 missed`);
- `errors: []`.

Look at `qa/guide-strategy-phone.png`: the chapter chips, the plain full-colour chart, and the legend.

- [ ] **Step 7: Commit**

```bash
git add app/app.js app/strings.js app/style.css
git commit -m "Guide: the ? sheet with five chapters; the strategy chapter looks hands up"
```

---

### Task 5: Shell — help in Train, the counting intro, docs, verification

**Files:**
- Modify: `app/app.js`, `app/strings.js`, `app/style.css`, `README.md`, `.scratch/beginner-guide/spec.md`, `.scratch/blackjack-lab/spec.md`
- QA (scratchpad): new `qa/qa-train-help.mjs`, `qa/qa-train-layout.mjs`

**Interfaces:**
- Consumes: `openGuide(chapter)` (Task 4); `feedback.counted` and `round.hinted` (Task 1).
- Produces: the finished feature.

- [ ] **Step 1: Strings**

In `app/strings.js`, add to `en` after `keysCount: …,`:

```js
    rulesButton: 'Rules',
    chartButton: 'Chart',
    whyHow: 'Why & how',
    lookedUp: "Looked up: this hand isn't counted",
    notCounted: 'not counted',
```

and to `mn` after `keysCount: …,`:

```js
    rulesButton: 'Дүрэм',
    chartButton: 'Хүснэгт',
    whyHow: 'Яагаад, яаж',
    lookedUp: 'Хүснэгт харсан: энэ гар тоологдохгүй',
    notCounted: 'тоологдохгүй',
```

- [ ] **Step 2: Help buttons and the looked-up note**

In `app/app.js`:

(a) In `trainScreen()`, replace the `const header = …` line with the version below, and add `trainHelp` after `trainStats`:

```js
  const header = `<header class="bar train-bar"><div class="segmented" role="tablist">${tabs.join('')}</div><div class="train-help">${trainHelp(drill.mode)}</div><div class="stats">${trainStats(drill)}</div></header>`
```

```js
// Help one tap away: Rules and Chart in the strategy drills, Why & how in the counting ones.
function trainHelp(mode) {
  const button = (chapter, label) =>
    `<button class="help-chip" data-do="guideOpen" data-chapter="${chapter}" data-k="help-${chapter}">${t(label)}</button>`
  if (mode === 'values' || mode === 'count') return button('counting', 'whyHow')
  return button('play', 'rulesButton') + button('strategy', 'chartButton')
}
```

(b) Replace `trainMessage` with:

```js
// The fixed felt slot: the last Decision's feedback (plus the result once the hand is over), else the prompt.
// A looked-up hand says so, in the prompt and in every verdict.
function trainMessage(round, feedback) {
  const result = round.phase === 'settled' ? ` · ${round.hands.map((hand) => t(`result.${hand.result}`)).join(' · ')}` : ''
  const uncounted = feedback?.counted === false ? ` · ${t('notCounted')}` : ''
  if (feedback?.correct) return feltMessage('good', `✓ ${t('correct')}${result}${uncounted}`, t(`rule.${feedback.rule}`))
  if (feedback) {
    return feltMessage('bad', `✗ ${t('coachMistake', { action: actionName(feedback.book) })}${result}${uncounted}`, t(`rule.${feedback.rule}`))
  }
  return feltMessage('', t('feltTrain'), round.hinted ? t('lookedUp') : t('feltTrainSub'))
}
```

- [ ] **Step 3: The counting chapter opens by itself, once**

In `app/app.js`:

(a) In `ui`, after `lastRunningCount: 0, …`, add:

```js
  countingIntro: false, // the counting chapter has opened by itself once; kept in the UI store
```

(b) In `loadProgress()`:
- The successful `return` becomes `return { saved, tab: uiSaved?.tab, countingIntro: uiSaved?.countingIntro === true }`.
- Both `return { saved: null, tab: null }` lines become `return { saved: null, tab: null, countingIntro: false }`.

In `boot()`, directly after `const loaded = await loadProgress()`, add `ui.countingIntro = loaded.countingIntro`.

(c) Rename `rememberTab` to `rememberUi`, both the definition and the call in `switchTab`, and make it keep both UI facts:

```js
function rememberUi() {
  if (!persist) return
  usion.storage.set(UI_KEY, { tab: ui.tab, countingIntro: ui.countingIntro }).catch((err) => console.error('[lab] could not remember the UI', err))
}
```

(d) At the end of `react()`, after `reactCount(prev, event)`, add:

```js
  const counting = event.type === 'startDrill' && (event.mode === 'values' || event.mode === 'count')
  if (counting && !ui.countingIntro) showCountingIntro()
```

and after `afterGuide`, add:

```js
// The first visit to a counting drill opens the Guide's counting chapter by itself, once per player.
function showCountingIntro() {
  if (ui.overlay) return
  ui.countingIntro = true
  rememberUi()
  openGuide('counting')
}
```

- [ ] **Step 4: Styles — the Train header with help**

In `app/style.css`, replace the whole Train-header block, from the comment `/* Train: the tabs and the mode's two numbers. …` through the end of its `@media (max-width: 600px) { … }`, with:

```css
/* Train: the tabs, the help buttons and the mode's two numbers. Below 900px (a phone, or the 560px-wide app on
   a tablet) the tabs take one row and help + numbers the next, in every mode, so switching tabs never moves
   the table. */
.train-bar .stats {
  display: flex;
  gap: 16px;
  margin-left: auto;
}
.train-help {
  display: flex;
  gap: 6px;
}
.help-chip {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 13px;
}
@media (max-width: 899px) {
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
}
```

- [ ] **Step 5: Unit tests still pass**

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 124`, `ℹ fail 0`.

- [ ] **Step 6: QA — teach the older counting scripts about the intro**

The first visit to Values or Count now opens the Guide, which would swallow those scripts' key presses. Insert one Esc after every counting-tab click. Where the chapter doesn't open, Esc does nothing:

```bash
cd /tmp/claude-1000/-opt-projects-blackjack/3679f096-99b4-4e78-8a8f-4f20d3575227/scratchpad/qa && python3 - <<'EOF'
import pathlib, re
pattern = re.compile(r"(\n([ \t]*)await b\.click\('\[data-k=mode-(?:values|count)\]'[^\n]*\)\n)")
for name in ['qa-values.mjs', 'qa-count.mjs', 'qa-improve-counting.mjs', 'qa-improve-scroll.mjs']:
    path = pathlib.Path(name)
    s = path.read_text()
    new = pattern.sub(lambda m: m.group(1) + f"{m.group(2)}await b.key('Escape', 250) // the counting chapter opens by itself on the first visit\n", s)
    if new != s:
        path.write_text(new)
        print('updated', name)
EOF
```

Expected: all four files are listed.

- [ ] **Step 7: Browser QA — help in Train and the counting intro**

Create `qa/qa-train-help.mjs`:

```js
import { launch } from './cdp.mjs'
const URL = 'http://localhost:8765/?name=Z'
const chapterTitle = (b) => b.text('.guide-title')
const guideOpen = (b) => b.eval(`!!document.querySelector('.modal.guide')`)
const b = await launch({ port: 9400, realSdk: true })
try {
  await b.viewport(390, 844, false, false)
  await b.goto(URL, 300)
  await b.eval('localStorage.clear()')
  await b.goto(URL, 800)
  await b.key('Escape', 250) // skip the Tour
  await b.key('Escape', 250) // close the chip picker
  await b.click('[data-k=tab-train]', 300)
  await b.click('[data-k=help-play]', 300)
  const rules = await chapterTitle(b)
  await b.key('Escape', 200)
  await b.click('[data-k=help-strategy]', 300)
  const chart = await chapterTitle(b)
  await b.key('Escape', 200)
  const note = await b.text('.felt-print span')
  await b.click('[data-k=answer-stand]', 300)
  const verdict = await b.text('.felt-print strong')
  const streak = await b.eval(`document.querySelector('.train-bar .stat strong').textContent`)
  await b.shot('train-help-phone')
  await b.click('[data-k=mode-values]', 400)
  const autoOpened = (await guideOpen(b)) ? await chapterTitle(b) : null
  await b.key('Escape', 200)
  await b.click('[data-k=mode-count]', 400)
  const autoAgain = await guideOpen(b)
  await b.click('[data-k=help-counting]', 300)
  const whyHow = await chapterTitle(b)
  await b.key('Escape', 200)
  await b.goto(URL, 900)
  await b.click('[data-k=tab-train]', 300)
  await b.click('[data-k=mode-values]', 400)
  const afterReload = await guideOpen(b)
  console.log({ rules, chart, note, verdict, streak, autoOpened, autoAgain, whyHow, afterReload })
  console.log('errors:', b.errors)
} finally {
  b.close()
}
```

Run: `cd /tmp/claude-1000/-opt-projects-blackjack/3679f096-99b4-4e78-8a8f-4f20d3575227/scratchpad/qa && node qa-train-help.mjs`
Expected:
- `rules: 'How to play'`;
- `chart: 'Basic strategy'`;
- `note: "LOOKED UP: THIS HAND ISN'T COUNTED"`, uppercased by the felt print's style;
- `verdict` ending in `not counted`;
- `streak: '0'`;
- `autoOpened: 'Card counting'`;
- `autoAgain: false`;
- `whyHow: 'Card counting'`;
- `afterReload: false`;
- `errors: []`.

Look at `qa/train-help-phone.png`: the tabs on row 1; Rules · Chart on the left of row 2 with Streak and Best on the right; the verdict on the felt.

- [ ] **Step 8: Browser QA — one layout per Train mode, three screen sizes**

Create `qa/qa-train-layout.mjs`:

```js
import { launch, sleep } from './cdp.mjs'
const URL = 'http://localhost:8765/?name=Z'
const rects = `(() => {
  const r = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b ? [Math.round(b.top), Math.round(b.height)] : null }
  return JSON.stringify({ table: r('.table'), felt: r('.felt-print'), controls: r('.controls') })
})()`
const enabled = (b, k) => b.eval(`!!document.querySelector('[data-k=${k}]:not([disabled])')`)
async function run(width, height, desktop, port) {
  const b = await launch({ port, realSdk: true })
  const layouts = { weighted: new Set(), mistakes: new Set(), values: new Set(), count: new Set() }
  const measure = async (mode) => layouts[mode].add(await b.eval(rects))
  try {
    await b.viewport(width, height, true, desktop)
    await b.goto(URL, 300)
    await b.eval('localStorage.clear()')
    await b.goto(URL, 800)
    await b.key('Escape', 250) // skip the Tour
    await b.key('Escape', 250) // close the chip picker
    await b.click('[data-k=tab-train]', 300)
    for (const mode of ['weighted', 'mistakes']) {
      await b.click(`[data-k=mode-${mode}]`, 300)
      for (let i = 0; i < 6; i++) {
        await measure(mode)
        if (await enabled(b, 'answer-stand')) await b.click('[data-k=answer-stand]', 150) // right and wrong mixed
        await measure(mode)
        if (await enabled(b, 'next')) await b.click('[data-k=next]', 150)
        else await sleep(1400)
      }
    }
    await b.click('[data-k=mode-values]', 300)
    await b.key('Escape', 250) // the counting chapter opened by itself
    await measure('values')
    await b.key('Enter', 200)
    for (let i = 0; i < 4; i++) {
      await b.key('ArrowDown', 700)
      await measure('values')
    }
    await b.click('[data-k=mode-weighted]', 300) // leaving ends the sprint
    await b.click('[data-k=mode-values]', 300)
    await measure('values')
    await b.click('[data-k=mode-count]', 300)
    await b.key('3', 100) // Fast
    for (let tick = 0; tick < 150; tick++) {
      await measure('count')
      if (await enabled(b, 'stepper-ok')) await b.key('Enter', 200)
      else if (await enabled(b, 'bet-1')) await b.key('1', 200)
      else if (await enabled(b, 'next')) await b.key('Enter', 200)
      else await sleep(100)
    }
    for (const [mode, seen] of Object.entries(layouts)) console.log(`${width}x${height} ${mode}: ${seen.size} layout(s)`, [...seen][0])
    console.log('errors:', b.errors)
  } finally {
    b.close()
  }
}
await run(1920, 1080, true, 9401)
await run(768, 1024, false, 9402)
await run(390, 844, false, 9403)
```

Run: `node qa-train-layout.mjs`
Expected: every line reads `1 layout(s)`, and every run prints `errors: []`.

- [ ] **Step 9: Docs**

- `.scratch/beginner-guide/spec.md`: change `Status: ready-for-agent` to `Status: done`.
- `.scratch/blackjack-lab/spec.md`: under the `- **Train:** …` summary bullet (line 16), after the card-counting pointer, add:

```markdown
  - Since the beginner guide, Train has Rules, Chart and Why & how buttons into the Guide, and seeing the strategy chapter mid-hand marks the hand Looked up: see `.scratch/beginner-guide/spec.md`.
```

- `README.md`: at the end of the "On desktop: …" sentence, add ` ? opens the Guide (rules, the strategy chart, card counting).`

- [ ] **Step 10: Full verification**

Run: `npm test 2>&1 | grep -E 'ℹ (tests|pass|fail)'`
Expected: `ℹ tests 124`, `ℹ pass 124`, `ℹ fail 0`.

Run, in the scratchpad `qa/` folder:

```bash
for s in qa-tour qa-guide qa-train-help qa-train-layout qa-values qa-count qa-train-stable qa-stable qa-auto2 qa-bankroll; do echo "== $s"; node $s.mjs 2>&1 | grep -vE '^[│┌├└]'; done
```

Expected: every script prints what its own step promised, every layout line reads `1 layout(s)` / `1 distinct layout(s)`, and every run prints `errors: []`.

- [ ] **Step 11: Commit**

```bash
git add app/app.js app/strings.js app/style.css README.md .scratch/beginner-guide/spec.md .scratch/blackjack-lab/spec.md
git commit -m "Train: Rules, Chart and Why & how open the Guide; counting explained on the first visit"
```

---

## Finish

Use superpowers:finishing-a-development-branch for `beginner-guide` → `master`.
- Never pull from or push to `origin`: it is the deploy-only Pages repo.
- Deploying (`scripts/deploy-pages.sh`, which now ships `guide.js`) happens only when the user asks.

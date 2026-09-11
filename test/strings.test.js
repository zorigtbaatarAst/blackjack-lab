import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STRINGS } from '../app/strings.js'
import { CHART_ROWS } from '../app/engine.js'
import { GUIDE } from '../app/guide.js'

test('English and Mongolian have exactly the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS.mn).sort(), Object.keys(STRINGS.en).sort())
})

test('every Rule of thumb the Book can return has text in both languages', () => {
  const rules = new Set([...CHART_ROWS.map((row) => row.rule), 'no-double', 'no-split'])
  for (const lang of ['en', 'mn']) {
    for (const rule of rules) assert.ok(STRINGS[lang][`rule.${rule}`], `${lang}: rule.${rule}`)
  }
})

test('placeholders match between languages', () => {
  const vars = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join()
  for (const key of Object.keys(STRINGS.en)) {
    assert.equal(vars(STRINGS.mn[key]), vars(STRINGS.en[key]), key)
  }
})

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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STRINGS } from '../app/strings.js'
import { CHART_ROWS } from '../app/engine.js'

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

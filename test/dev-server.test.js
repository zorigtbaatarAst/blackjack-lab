import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveFile } from '../dev/server.js'

const APP = fileURLToPath(new URL('../app', import.meta.url))
const insideApp = (file) => file === null || file.startsWith(APP + sep)

test('the dev server maps URLs to files in app/', () => {
  assert.equal(resolveFile('/'), join(APP, 'index.html'))
  assert.equal(resolveFile('/engine.js?v=1'), join(APP, 'engine.js'))
})

test('the dev server never resolves a file outside app/ (the token lives one level up)', () => {
  for (const attack of ['/../token.txt', '/%2e%2e/token.txt', '/a/../../token.txt', '/..%2f..%2ftoken.txt', '/..%5ctoken.txt']) {
    assert.ok(insideApp(resolveFile(attack)), attack)
  }
  assert.equal(resolveFile('/%E0%A4%A'), null) // malformed escape
})

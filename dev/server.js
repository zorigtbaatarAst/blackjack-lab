// `npm run dev`: serve app/ on http://localhost:8765 with a fake Usion SDK, so the game runs with a
// profile, saving and a leaderboard without deploying. Edit files in app/ and refresh. Zero dependencies.
// Add ?real=1 to load the real SDK instead (you'll get preview mode, as on any page outside Usion).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP = join(ROOT, 'app')
const FAKE_SDK = join(ROOT, 'dev', 'fake-usion-sdk.js')
const REAL_SDK_TAG = '<script src="https://usions.com/usion-sdk.js"></script>'
const PORT = Number(process.env.PORT ?? 8765)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }

// Map a URL path to a file inside app/, or null. Refuses anything that escapes app/ (e.g. /../token.txt).
export function resolveFile(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0])
  } catch {
    return null
  }
  const relative = normalize(decoded === '/' ? '/index.html' : decoded).replace(/^[/\\]+/, '')
  const file = join(APP, relative)
  return file.startsWith(APP + sep) ? file : null
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/__dev/fake-usion-sdk.js') return send(res, 200, FAKE_SDK)
  const file = resolveFile(url.pathname)
  if (!file) return send(res, 403, null, 'Forbidden')
  try {
    let body = await readFile(file)
    if (file.endsWith('index.html') && !url.searchParams.has('real')) {
      const html = body.toString()
      if (!html.includes(REAL_SDK_TAG)) throw new Error('index.html no longer loads the Usion SDK the way dev/server.js expects')
      body = html.replace(REAL_SDK_TAG, '<script src="/__dev/fake-usion-sdk.js"></script>')
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(body)
  } catch (err) {
    if (err.code === 'ENOENT') return send(res, 404, null, 'Not found')
    console.error('[dev] failed to serve', req.url, err)
    send(res, 500, null, 'Server error')
  }
}

async function send(res, status, file, text) {
  const body = file ? await readFile(file) : text
  res.writeHead(status, { 'Content-Type': file ? 'text/javascript' : 'text/plain', 'Cache-Control': 'no-store' })
  res.end(body)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer(handle).listen(PORT, '127.0.0.1', () => {
    console.log(`Blackjack Lab dev server: http://localhost:${PORT}`)
    console.log('  fake Usion SDK: add ?name=Bat ?user=guest_1 ?lang=mn ?theme=dark ?failSet=1 · real SDK: ?real=1')
  })
}

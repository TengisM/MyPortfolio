import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { type BoardView, boardLines, postTime, resetsIn } from './race-board.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  mock.timers.reset()
})

const board = (over: Partial<BoardView> = {}): BoardView => ({
  track: 'coaster',
  resets_at: '2026-10-26T00:00:00Z',
  top: [],
  you: null,
  new_best: false,
  ...over,
})

const entry = (place: number, name: string, total: number) => ({
  place,
  name,
  ship: 'vega' as const,
  total_ms: total,
  lap_ms: [total / 3, total / 3, total / 3],
})

function answer(status: number, body: string) {
  const calls: { url: string; init?: RequestInit }[] = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(body, { status, headers: { 'content-type': 'application/json' } })
  }
  return calls
}

const post = () => postTime({ track: 'coaster', name: 'Bat', ship: 'vega', lapMs: [1, 2, 3] })

test('postTime sends the run with lap_ms', async () => {
  const calls = answer(200, JSON.stringify(board({ new_best: true })))
  const view = await postTime({
    track: 'tidal',
    name: 'Bat',
    ship: 'wisp',
    lapMs: [61000, 60500, 60010],
  })
  assert.equal(view.new_best, true)
  assert.equal(calls[0]?.url, '/api/race/times')
  assert.equal(calls[0]?.init?.method, 'POST')
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    track: 'tidal',
    name: 'Bat',
    ship: 'wisp',
    lap_ms: [61000, 60500, 60010],
  })
})

test('an API error rejects with its message, lowercased and without the last period', async () => {
  answer(
    429,
    JSON.stringify({ error: 'rate limited', message: 'Too many requests. Try again in a minute.' }),
  )
  await assert.rejects(post(), {
    message: 'too many requests. try again in a minute',
  })
})

test('an error without a message, a body that is not JSON, or no network is offline', async () => {
  answer(500, '{}')
  await assert.rejects(post(), { message: 'scoreboard offline' })
  answer(502, '<html>bad gateway</html>')
  await assert.rejects(post(), { message: 'scoreboard offline' })
  answer(200, 'not json')
  await assert.rejects(post(), { message: 'scoreboard offline' })
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed')
  }
  await assert.rejects(post(), { message: 'scoreboard offline' })
})

test('no answer within 90 s is offline', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      )
    })
  const pending = postTime({ track: 'coaster', name: 'Bat', ship: 'vega', lapMs: [1, 2, 3] })
  mock.timers.tick(89_999)
  let settled = false
  pending.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  await Promise.resolve()
  assert.equal(settled, false)
  mock.timers.tick(1)
  await assert.rejects(pending, { message: 'scoreboard offline' })
})

test('resetsIn shows days and hours, then hours and minutes', () => {
  const at = Date.parse('2026-10-26T00:00:00Z')
  const h = 3600_000
  assert.equal(resetsIn('2026-10-26T00:00:00Z', at - (3 * 24 + 4) * h - 1), 'resets in 3d 4h')
  assert.equal(resetsIn('2026-10-26T00:00:00Z', at - 5 * h - 12 * 60_000), 'resets in 5h 12m')
  assert.equal(resetsIn('2026-10-26T00:00:00Z', at - 30_000), 'resets in 0h 0m')
  assert.equal(resetsIn('2026-10-26T00:00:00Z', at + h), 'resets in 0h 0m')
})

test('boardLines lists the top 10 and marks the player', () => {
  const top = Array.from({ length: 10 }, (_, i) =>
    entry(i + 1, i === 2 ? 'bat' : `p${i + 1}`, 200_000 + i * 1000),
  )
  const lines = boardLines(
    board({ top, you: { place: 3, total_ms: 202_000 } }),
    'Bat',
    Date.parse('2026-10-22T20:00:00Z'),
  )
  const texts = lines.map((l) => (typeof l === 'string' ? l : l.text))
  assert.equal(texts.length, 11)
  assert.match(texts[0] ?? '', /^ 1 p1\s+vega\s+3:20\.00$/)
  assert.deepEqual(lines[2], { text: texts[2], tone: 'primary' })
  assert.equal(texts[10], 'resets in 3d 4h')
})

test('boardLines adds the place under the top 10 only when the run is outside it', () => {
  const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, `p${i + 1}`, 200_000 + i * 1000))
  const now = Date.parse('2026-10-22T20:00:00Z')
  const lines = boardLines(board({ top, you: { place: 23, total_ms: 231_020 } }), 'Bat', now)
  const texts = lines.map((l) => (typeof l === 'string' ? l : l.text))
  assert.equal(texts.length, 12)
  assert.match(texts[10] ?? '', /^23 you\s+3:51\.02$/)
})

test('an empty board says so', () => {
  const texts = boardLines(board(), 'Bat', Date.parse('2026-10-22T20:00:00Z')).map((l) =>
    typeof l === 'string' ? l : l.text,
  )
  assert.deepEqual(texts, ['no times this week', 'resets in 3d 4h'])
})

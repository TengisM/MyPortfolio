import assert from 'node:assert/strict'
import { test } from 'node:test'
import cases from './race-names.cases.json' with { type: 'json' }
import {
  cleanName,
  createShuffle,
  formatDelta,
  formatTime,
  SHIP_ORDER,
  SHIPS,
  TRACK_ORDER,
} from './race-rules.ts'

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

test('cleanName matches every shared case', () => {
  for (const c of cases) assert.equal(cleanName(c.in), c.out, JSON.stringify(c.in))
})

test("every ship's stats add up to 12", () => {
  for (const id of SHIP_ORDER) {
    const s = SHIPS[id].stats
    assert.equal(s.accel + s.top + s.handling + s.boost, 12, id)
  }
})

test('no ship has the best value in every stat', () => {
  const keys = ['accel', 'top', 'handling', 'boost'] as const
  const best = keys.map((k) => Math.max(...SHIP_ORDER.map((id) => SHIPS[id].stats[k])))
  for (const id of SHIP_ORDER) {
    const all = keys.every((k, i) => SHIPS[id].stats[k] === best[i])
    assert.equal(all, false, id)
  }
})

test('shuffle never repeats back to back and covers all three in each run of three', () => {
  const sh = createShuffle(seeded(7))
  const a = Array.from({ length: 3000 }, () => sh.next())
  for (let i = 1; i < a.length; i++) assert.notEqual(a[i], a[i - 1], `repeat at ${i}`)
  for (let i = 0; i < a.length; i += 3) {
    assert.deepEqual([...a.slice(i, i + 3)].sort(), [...TRACK_ORDER].sort(), `window ${i}`)
  }
})

test('formatTime', () => {
  assert.equal(formatTime(58410), '0:58.41')
  assert.equal(formatTime(65200), '1:05.20')
  assert.equal(formatTime(200000), '3:20.00')
})

test('formatDelta', () => {
  assert.equal(formatDelta(-1200), '-1.20')
  assert.equal(formatDelta(350), '+0.35')
  assert.equal(formatDelta(0), '+0.00')
})

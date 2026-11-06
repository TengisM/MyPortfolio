import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  boostLine,
  controlInput,
  createMenu,
  createPicker,
  lapBanner,
  lapLine,
  norm,
} from './race-menus.ts'
import { createShip } from './race-physics.ts'
import type { ShipId } from './race-rules.ts'
import { TRACKS } from './race-track-defs.ts'

function picker() {
  const shown: ShipId[] = []
  const done: [ShipId, string][] = []
  const p = createPicker(
    { showcase: (ship) => shown.push(ship), done: (ship, name) => done.push([ship, name]) },
    'enter to race',
  )
  return { p, shown, done }
}

const type = (p: ReturnType<typeof picker>['p'], text: string) => {
  for (const ch of text) p.key(ch)
}

test('the ship menu steps through the ships both ways and wraps', () => {
  const { p, shown } = picker()
  assert.equal(p.step, 'ship')
  assert.equal(p.ship(), 'vega')
  assert.equal(p.key('ArrowRight'), true)
  assert.equal(p.ship(), 'kestrel')
  p.key('a')
  p.key('ArrowLeft')
  assert.equal(p.ship(), 'torch')
  // Shift+D comes in as 'D' and still steps.
  p.key(norm('D'))
  assert.equal(p.ship(), 'vega')
  assert.deepEqual(shown, ['kestrel', 'vega', 'torch', 'vega'])
  assert.equal(p.key('x'), false)
})

test('enter moves to the name, but not on auto-repeat', () => {
  const { p } = picker()
  assert.equal(p.key('Enter', true), true)
  assert.equal(p.step, 'ship')
  p.key('Enter')
  assert.equal(p.step, 'name')
  assert.match(String(p.hud().lines[0]), /^name: .*_$/)
})

test('the name takes letters in any script, caps at 16 and backspaces one code point', () => {
  const { p } = picker()
  p.key('Enter')
  while (p.name) p.key('Backspace')
  type(p, 'Бат 🚀')
  assert.equal(p.name, 'Бат 🚀')
  p.key('Backspace')
  assert.equal(p.name, 'Бат ')
  type(p, 'abcdefghijklmnopqrstuvwxyz')
  assert.equal([...p.name].length, 16)
  assert.equal(p.key('Shift'), false)
})

test('enter refuses a bad name and hands over a clean one', () => {
  const { p, done } = picker()
  p.key('ArrowRight')
  p.key('Enter')
  while (p.name) p.key('Backspace')
  type(p, 'a!')
  p.key('Enter')
  assert.deepEqual(done, [])
  assert.ok(p.hud().lines.some((l) => typeof l === 'object' && l.tone === 'pink'))
  p.key('Backspace')
  type(p, '  b  ')
  p.key('Enter', true)
  assert.deepEqual(done, [])
  p.key('Enter')
  assert.deepEqual(done, [['kestrel', 'a b']])
  assert.equal(p.name, 'a b')
  assert.equal(p.hud().lines.at(-1), 'enter to race')
})

test('open goes back to the ship menu, at a given ship, keeping the name', () => {
  const { p, shown } = picker()
  p.key('Enter')
  type(p, 'Bat')
  const name = p.name
  p.open('lancer')
  assert.equal(p.step, 'ship')
  assert.equal(p.ship(), 'lancer')
  assert.equal(p.name, name)
  assert.equal(shown.at(-1), 'lancer')
})

test('the result menu wraps, ignores auto-repeat and chooses on enter', () => {
  const m = createMenu()
  assert.equal(m.item(), 'play again')
  assert.equal(m.key('ArrowUp'), true)
  assert.equal(m.item(), 'exit')
  m.key('s')
  assert.equal(m.item(), 'play again')
  // The arrow still held from the last lap repeats: swallowed, but the menu stays.
  assert.equal(m.key('ArrowDown', true), true)
  assert.equal(m.item(), 'play again')
  assert.equal(m.key('Enter', true), true)
  m.key('ArrowDown')
  assert.equal(m.key('Enter'), 'choose')
  assert.equal(m.item(), 'choose ship')
  assert.equal(m.key('q'), false)
  assert.deepEqual(m.lines(), [
    '  play again',
    { text: '> choose ship', tone: 'primary' },
    '  exit',
  ])
  m.reset()
  assert.equal(m.item(), 'play again')
})

test('held keys drive the input', () => {
  assert.deepEqual(controlInput(new Set(['ArrowLeft', 'w', 'Shift'])), {
    steer: -1,
    throttle: true,
    brake: false,
    boost: true,
  })
  assert.deepEqual(controlInput(new Set(['d', 'a', 's'])), {
    steer: 0,
    throttle: false,
    brake: true,
    boost: false,
  })
  // Space brakes, as in most racing games, even with the throttle held. Only Shift boosts.
  assert.deepEqual(controlInput(new Set(['w', ' '])), {
    steer: 0,
    throttle: true,
    brake: true,
    boost: false,
  })
})

test('the lap banner shows the split in green when faster, pink when slower', () => {
  assert.deepEqual(lapBanner({ n: 1, ms: 61_230, delta: null }), {
    text: 'lap 1 · 1:01.23',
    tone: undefined,
  })
  assert.deepEqual(lapBanner({ n: 2, ms: 58_410, delta: -1200 }), {
    text: 'lap 2 · 0:58.41 · -1.20',
    tone: 'green',
  })
  assert.equal(lapBanner({ n: 3, ms: 59_000, delta: 590 }).tone, 'pink')
})

test('lap and boost lines', () => {
  const st = createShip(TRACKS.coaster, 0)
  assert.equal(lapLine(st), 'lap 1/3')
  st.lap = 3
  assert.equal(lapLine(st), 'lap 3/3')
  st.meter = 0.5
  st.boosting = true
  assert.deepEqual(boostLine(st), { text: 'boost █████░░░░░', tone: 'primary' })
  assert.deepEqual(boostLine(null), { text: 'boost ██████████', tone: 'muted' })
})

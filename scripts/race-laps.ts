import { checkShips, checkTargets, type LapRow } from '../src/components/games/race-autopilot.ts'
import {
  formatTime,
  TRACK_NAMES,
  TRACK_ORDER,
  type TrackId,
} from '../src/components/games/race-rules.ts'

// Drives every ship round every track with the autopilot, once on throttle alone and once
// driving well, and prints the laps, how close each ship comes to the fastest, and the minimum
// lap per track for the server. Exits 1 when a track misses a target.
// Run with `npm run race:laps`.

const failures: string[] = []
const pad = (s: string, n: number) => s.padEnd(n)
const rows = {} as Record<TrackId, LapRow[]>
const minLaps: string[] = []

for (const id of TRACK_ORDER) {
  const result = checkTargets(id)
  rows[id] = result.rows
  console.log(`\n${TRACK_NAMES[id]}`)
  console.log(`${pad('ship', 9)}${pad('driving', 9)}${pad('lap 1', 9)}${pad('lap 2', 9)}lap 3`)
  for (const { ship, driving, laps } of result.rows) {
    const row = laps ? laps.map((ms) => pad(formatTime(ms), 9)).join('') : 'did not finish'
    console.log(`${pad(ship, 9)}${pad(driving, 9)}${row}`.trimEnd())
  }
  const { spread } = result
  const note = spread > 5000 ? 'over 5 s' : spread > 4000 ? 'over 4 s, allowed up to 5 s' : 'ok'
  console.log(`smart lap 2 spread ${(spread / 1000).toFixed(2)} s (${note})`)
  for (const w of result.warnings) console.log(`warning: ${w}`)
  failures.push(...result.errors.map((e) => `${id}: ${e}`))
  minLaps.push(`MinLapMs ${id} ${result.minLap}`)
}

const ships = checkShips(rows)
console.log('\nclosest to the fastest smart lap 2')
for (const { ship, track, behind } of ships.best) {
  const at = behind === 0 ? 'fastest' : `${(behind / 1000).toFixed(2)} s off`
  console.log(`${pad(ship, 9)}${pad(track, 9)}${at}`)
}
failures.push(...ships.errors)

console.log(`\n${minLaps.join('\n')}`)

if (failures.length > 0) {
  console.log(`\n${failures.join('\n')}`)
  process.exit(1)
}

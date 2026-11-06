# Race: an anti-gravity racer in the terminal

Date: 2026-10-21. Branch: `new-portfolia`.

## What it is

A fourth game in the site's terminal, next to Tetris and Tron. It's an anti-gravity racer in the
style of Wipeout and Redout. The camera sits behind a hovering ship on a track raised on pillars
over a landscape in daylight. You race alone against the clock, or online against up to 3 friends.

Every ship has a boost meter and nothing else: no weapons, no pickups, no abilities. Racing well
means picking good lines, taking shortcuts and spending boost at the right moments.

## Goals

- Three tracks that each feel like a different place, with one lap taking about 1:30 with no boost
  and 1:05 to 1:10 driven well.
- Five ships with different handling that a player can feel within one lap.
- A solo time trial with a weekly scoreboard per track, so there's a reason to come back.
- Online races for 2 to 4 players, reusing the room flow of Tetris and Tron online.

## Non-goals

- Phones and touch screens. On a device with no keyboard, the shell refuses with one line (below).
- Weapons, pickups, abilities, damage or ship destruction.
- Bots. Solo is a time trial with nobody else on the track.
- A cheat-proof scoreboard. The server rejects impossible times, but someone patient with the
  browser console can still post a fake one. That's acceptable for a portfolio game.
- Loaded 3D models, textures or audio files. Everything is built in code: three.js shapes for the
  picture, the Web Audio API for the sound.

## Anti-goals

These would make it a failure even if it technically works.

- Boost that barely matters. Boost takes a good lap from 1:30 down to about 1:05, so when and
  where to spend it is the main decision you make each lap.
- Pads so close together that the meter never runs low. Pads are spread out, and your own meter
  does most of the work.
- Ships that feel the same, or one ship that's best at everything.
- Loops and corkscrews that throw the camera around so badly you can't see the road.
- Making Tetris or Tron players download the racer. It loads on its own like the other games.

## How it's launched

Commands in the shell, matching Tetris and Tron:

| Command | What it does |
|---|---|
| `race` | Solo time trial |
| `race online` | Opens a room for up to 4 |
| `race join ABCD` | Joins a friend's room |

`race` joins `GameId` in `src/components/terminal/shell.ts` and gets entries in the help list and
the `ls` program listing next to the others. If the device has no fine pointer and no keyboard
(`matchMedia('(pointer: coarse)')` with no `(any-pointer: fine)`), the shell prints
`race: needs a keyboard. try it on a computer` and doesn't launch. No on-screen pad for this game.

## Controls

| Key | Action |
|---|---|
| ← → or A D | Steer |
| ↑ or W | Throttle |
| ↓, S or Space | Brake. Braking beats the throttle when both are held |
| Shift | Boost while held. Releasing the key stops it at once |
| R | Restart the run (solo only) |
| P | Pause (solo only) |
| Esc | Close the game (online, that leaves the room) |
| Enter | Confirm in menus; host starts the race online |
| Backspace | Deletes a letter while typing the name |
| C | Copy the invite link (online) |
| M | Sound off and on, remembered for next time (not while typing a name) |
| N | Music off and on, remembered for next time (not while typing a name) |

Menus (ship, name) are keyboard-driven inside the game window: arrows to move, Enter to pick.
Esc always closes the whole game, as `game-window.tsx` already does for Tetris and Tron, so nothing
changes there.

## Flow

### Track shuffle

Players never pick a track. Each race gets the next track from a shuffled order of the three, so
you never get the same track twice in a row and you see all three before any repeats. Solo keeps
its shuffle in memory for the session. Online, the server keeps one per room and announces the
track when the countdown starts. Before that, the lobby says `track: shuffled`.

### Solo

1. **Ship.** Pick one of the five, with stat bars for the four stats.
2. **Name.** Type a name. 1 to 16 characters (counted as code points), any Unicode letter or digit
   (Cyrillic included, since many players will type Mongolian names), spaces, `-` and `_`, trimmed,
   inner runs of spaces collapsed to one. Go and TypeScript use the same rule:
   `^[\p{L}\p{N}_ -]{1,16}$` after trimming. The last name used is kept in `localStorage` and
   pre-filled, so a returning player just presses Enter (wrapped in try/catch, the game works
   without it).
3. **Race starts.** The track for this race is shown with a 3, 2, 1 countdown.
4. **Race.** 3 laps. R restarts the same track from the countdown.
5. **Result.** Total time, the three lap times, then that track's scoreboard with your run in it.
   Under it, a menu picked with the arrows and Enter:
   - **Play again.** Same ship and name, next track in the shuffle.
   - **Choose ship.** Back to the ship menu. The name stays pre-filled.
   - **Exit.** Closes the game, same as Esc.

### Online

1. **Ship**, then **name**, as above, done in the lobby. Each seat shows its player's ship and
   name as they pick.
2. **Lobby.** The room code and invite link, the seats, and `track: shuffled`. The host presses
   Enter to start once at least 2 players have a ship and a name (same rule and error text style as
   Tetris online). Players keep their ship and name between races and can change their ship in the
   lobby with the arrows.
3. **Countdown** from the server, which names the track, then 3 laps.
4. **Finish.** When the first player finishes, everyone else gets 30 seconds to finish. Anyone not
   done by then is marked DNF.
5. **Results.** Finish order with total times. The room keeps a win count per seat like Tetris does.
   Under the results, the same menu as solo, with online meanings:
   - **Play again.** Back to the lobby, keeping your ship. The host starts the next race from there.
   - **Choose ship.** Back to the lobby with the ship picker open.
   - **Exit.** Leaves the room and closes the game.

Someone who joins mid-race watches from behind the race leader until the next race. A player who
presses Esc mid-race leaves the room, and the others see them as DNF. Online times never go on
the scoreboard, since bumping changes them.

## Race rules

- **Laps.** 3 per race. Each track has ordered checkpoints, and a lap counts only when you cross
  the start line having passed them all in order. Shortcuts must not skip a checkpoint.
- **Lap split.** Each time you cross the line, a banner shows that lap's time and the difference
  from your previous lap for about 2 seconds: `lap 2 · 0:58.41 · -1.20`. Faster is shown as
  negative in green, slower as positive in pink. Lap 1 shows just the time.
- **Walls.** Both edges of the track have walls. Touching one scrapes off speed in proportion to
  the angle you hit it at. A glancing touch costs a little, a head-on hit costs most of your speed.
  You never fall off, except at the jumps on track 2.
- **Bumping.** Online, ships push each other apart when they touch. The ship hit from behind gains
  a little speed and the one behind loses a little.
- **Position.** Online, the HUD shows your place (1st to 4th), worked out from lap, checkpoint and
  distance along the track.

## Boost

One meter per ship, 0 to 100%. A race starts with it full.

- Holding boost drains the meter and raises your speed above the ship's top speed.
- The meter refills slowly on its own.
- Driving over a boost pad does two things: a short speed kick, and +20% on the meter. The pad
  refill is the faster way to charge.
- Boost is held, so you turn it on and off whenever you like. Spending it is your decision.
- Pads are spread out: about 6 to 8 per lap, never closer than about 8 seconds of driving apart.
  Some sit on the line a good driver wants anyway, some off it so you have to choose. The ramp pads
  on Skyway count toward this.

The numbers are the builder's to tune against the lap time targets below. As a starting point: a
full meter lasts about 5 seconds of boost, passive refill takes about 20 seconds from empty to
full, and boost raises speed to about 1.5 times top speed. Over a good lap you'd boost for roughly a
third to half of the time.

## Lap time targets

These are what the tuning has to hit, with the balanced ship (Vega):

| Driving | One lap |
|---|---|
| Throttle held, no boost, no pads, sensible line | about 1:30 (85 to 95 s) |
| Good line, all useful pads, boost used well, shortcuts taken | 1:05 to 1:10 (65 to 70 s) |

A full 3-lap race is then about 3:20 to 3:30 driven well. Every track hits these targets, so track
length differs with how twisty it is.

## Ships

Five ships, each with four stats rated 1 to 5. Every ship's ratings add up to 12, so none is best at
everything. The names and exact spread are my call:

| Ship | Acceleration | Top speed | Handling | Boost power | Character |
|---|---|---|---|---|---|
| Vega | 3 | 3 | 3 | 3 | Balanced. The reference for lap time targets |
| Kestrel | 5 | 2 | 4 | 1 | Quick off the line and through turns, slow on straights |
| Lancer | 2 | 5 | 1 | 4 | Fastest on straights, hard to turn |
| Wisp | 3 | 2 | 5 | 2 | Turns on the spot, best on the coaster |
| Torch | 2 | 3 | 2 | 5 | Weak without boost, huge with it |

What each stat changes:

- **Acceleration.** How fast you reach top speed, and how fast you recover after a wall or a brake.
- **Top speed.** The speed you settle at with throttle held and no boost.
- **Handling.** How fast you can turn, and how much speed you keep in a tight turn.
- **Boost power.** How far above top speed boost takes you. It also sets how hard a pad kicks.

Driven well, the best and worst ship on a given track should be within about 4 seconds per lap,
and each ship except Vega should be the fastest or close to it on at least one track. Ships
feeling different matters more than a tight spread; if the two conflict, keep the feel and let the
spread grow to about 5 seconds. Ships look like Wipeout craft or Star Wars pods: a hovering body with fins or
pods in painted metal, an engine glow at the back, a faint trail, and a soft shadow on the road
underneath. Each ship has its own shape and colour so you can tell them apart from behind. Built
from three.js shapes in code.

## Tracks

All three are closed circuits on pillars, each raised over its own landscape in daylight: sky and
sun, haze, and land that climbs into ridges away from the road, all made in code from noise. The
road is asphalt on a concrete slab with solid barriers carrying a band of the track's colour, white
lane lines, and kerbs on tight corners. Barriers come in 6 m panels, light posts stand on them
every 32 m, and gates span the road every few hundred metres where nothing passes overhead: things
close to the eye that stream past at speed. Only the boost pads, engines and lamps glow. The ship
sticks to the road surface everywhere, including upside down, so the camera's "up" follows the
road.

### 1. Coaster

The Hot Wheels track. Loops, corkscrews, steep banked turns and drops, like a roller coaster.
Setting: a desert canyon in late-afternoon sun, with mesas and sandstone towers. Colours: red
barriers and kerbs, blue pads. Shortcuts: at least two, for example a narrow inside line through a
banked turn and a split where the inner path is shorter but tighter.

### 2. Skyway

Jumps. The track has 3 or 4 gaps. Before each gap, a boost pad sits on the ramp.

- Hit the ramp pad and you fly the gap and land on the main road.
- Miss the pad and you can't clear the gap. You drop to a lower road that takes longer and climbs
  back up to join the main road after the gap.

The lower road is the penalty for missing, not a shortcut. Clearing a gap depends only on touching
the ramp pad, not on your ship's speed, so every ship can make every jump. Skyway also has at least
two real shortcuts elsewhere on the lap. Setting: high above a sea of cloud at midday, with snow
peaks standing out of it. Colours: amber barriers and kerbs, blue pads.

### 3. Tidal

Water. Parts of the track run through shallow water, and skimming over it slows you a bit (a lower
top speed, about 15% less, while you're on it) and throws up spray. The water sits on the tempting
racing line, and a dry route around it is a little longer, so you choose. Water only lies on flat
road 10 m above the sea.

The lap is a figure of eight that crosses itself once, on a bridge, with two hairpins, a chicane
and tight esses to brake for between the fast stretches. From the line it runs under the bridge and
through the first shallows, over a hump that kinks right and hides a left that tightens, and into
the chicane. A climbing left and a ramp lift it onto a viaduct about 45 m up, with a tight S over
the crest. A banked left turns it onto the bridge, back over the start road, and it drops to the
water through the esses. Then the second shallows, a banked hairpin, a tight hairpin the other way,
and a wide sweeper back to the line. The road stays between 10 and 46 m above the sea. It has no
loops, corkscrews or jumps, which belong to Coaster and Skyway.

Shortcuts: at least two, for example a road that turns back early across the banked hairpin's
inside, through water, and a tighter inner split through the last sweeper. Setting: a coast in the
morning, with open sea, sea stacks and green headlands. Colours: orange barriers and kerbs, teal
pads.

### Shortcuts on every track

A shortcut is a narrower side path that leaves the main road and rejoins it. Taken cleanly, it
saves 1 to 3 seconds. Clip its walls and you lose that. A shortcut never skips a checkpoint.

Where a shortcut shares main's asphalt it lies flush with main: same height and, while main's bank
stays within 15° of the junction's, the same bank, easing back to its own road over 40 m. Ships
only cross between the two where their edges meet within 0.3 m. A level shortcut beside a hairpin
that banks steeply can't follow it, so there the crossing stretch is shorter, and the view eases
the hull across what step remains.

Many shortcuts start on main's own outer lanes and peel away, like a motorway exit. A dashed line
marks the shortcut's edge across main's road. A ship on main that is past that line when the
opening ends goes onto the shortcut; one still in main's lanes stays on main. Main's wall on that
side stays open for `SPLIT` (6 m) past the opening so the two never disagree. `buildTrack` stores
that point on each branch as `fork`, and physics, the drawn walls and the autopilot all read it.

## Scoreboard

One board per track, ranked by full 3-lap time. Only solo runs go on it.

- **What it shows.** The top 10, each with name, ship and total time. If your run isn't in the top
  10, your place shows under it. A line says when the board resets: `resets in 3d 4h`.
- **One entry per name.** The board keeps each name's best time per track this week, so one player
  can't fill the top 10. Names match after Unicode lower-casing in Go (`strings.ToLower`), stored in
  a `name_key` column, so the database's collation doesn't matter. Lookalike letters across scripts
  (Cyrillic а and Latin a) can still make a second entry. That's accepted. A slower run under the same name doesn't replace a faster one.
- **Weekly reset.** The week starts Monday 00:00 UTC. The board only shows times from the current
  week. Older rows are deleted when the next time is posted, so there's no cron job.
- **Posting.** The client posts the run when it finishes: track, name, ship, the three lap times in
  milliseconds. The server checks the name rules, that the track and ship exist, and that every lap
  is at least that track's minimum lap time. It refuses anything faster. The minimum is a fixed
  number per track, set a few seconds under the best lap the builder can drive with perfect boost.
  It replies with the board and the run's place.
- **Rate limit.** Like the other public routes: about 10 posts per minute per client.

## Server

### Rooms: `api/internal/service/race`

Like the Tetris room, each ship runs in its own browser and the server keeps the room: seats,
host, names, ships, the chosen track, the countdown, finish order, the 30-second cut-off after the
winner, and the win count. It relays each player's ship state to the others. Up to 4 seats, room
codes and the room limit work like Tetris.

- Each client sends its ship state about 20 times a second: position along the track, sideways
  offset, height (for jumps), heading, speed, boosting or not, lap and checkpoint.
- The server relays states to the other seats. It doesn't simulate physics.
- A client sends `finish` with its total time when it crosses the line on lap 3. The server orders
  finishers by when it receives `finish`, which is fair enough at this scale.
- Bumping happens on each client: your browser pushes your own ship away from where it sees the
  others. Each player resolves their own side, so both ships react.

### Handler and routes

- `GET /api/race/ws` through `gamesocket`, with `gameLimiter`, like Tetris and Tron. The socket
  config's limits fit 20 states a second from each of 4 players.
- `GET /api/race/board?track=coaster` returns this week's board.
- `POST /api/race/times` posts a solo run.
- `game-socket.ts` learns `'race'` the same way it knows `'tetris'`.

### Database

One migration and sqlc queries in `api/internal/db/queries/race.sql`.

```sql
CREATE TABLE race_times (
    id         uuid        PRIMARY KEY,
    track      text        NOT NULL CHECK (track IN ('coaster', 'skyway', 'tidal')),
    name       text        NOT NULL,
    -- strings.ToLower(name), set by the API. The board groups by it.
    name_key   text        NOT NULL,
    ship       text        NOT NULL CHECK (ship IN ('vega', 'kestrel', 'lancer', 'wisp', 'torch')),
    lap_ms     integer[]   NOT NULL CHECK (cardinality(lap_ms) = 3),
    total_ms   integer     NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX race_times_board_idx ON race_times (track, created_at, total_ms);
```

The board query picks each `name_key`'s best run per track since the start of the week, showing the
name as typed on that run.

## Client

New files in `src/components/games/`, loaded on their own like the others:

| File | Holds |
|---|---|
| `race-tracks.ts` | The three track definitions and the code that turns them into geometry data |
| `race-physics.ts` | Ship movement, boost, walls, pads, water, jumps, laps and checkpoints |
| `race-ships.ts` | Ship stats and the code that builds each ship's mesh |
| `race-scenery.ts` | Each track's setting: sky, sun, land, sea or cloud, towers, pillars |
| `race-view.ts` | The three.js scene, camera, motion blur and effects |
| `race.ts` | Solo: menus, the run, the result and scoreboard |
| `race-online.ts` | Online: the lobby, the race, relayed ships |

`race-physics.ts` and the track data must not import three.js or `@/` paths. That keeps them
runnable under plain Node 24, so a script can drive a lap with no browser (see Verification).

The HUD goes through the existing `GameHud`: lap `2/3`, the race clock, the boost meter as a text
bar, place online, and the lap split banner. Speed shows in km/h at the bottom centre of the race
itself, on a game scale of 5.7 km/h per m/s (`KMH_PER_MS`), so a ship reads about 400 at top speed
and 600 to 650 boosting. `GameHud`, `HudLine` and `game-window.tsx` may grow
what the racer needs (a stat bar line, a text input line for the name), as long as Tetris and Tron
keep working unchanged. `game-window.tsx` gets the `race` and `race-online` loaders and key help,
and no `PADS` entry.

The site's dark theme and seat colours from `tron-view.ts` carry over: seat colours for online
ships' trails and names.

### Sound

`race-audio.ts` synthesises everything with the Web Audio API; the view feeds it each frame.

- The followed ship: a deep thruster. Two low saws a hair apart, filtered dark, growl at 40 to
  about 110 Hz; a flutter on the growl and a dark noise rumble quickens with the revs; a throaty
  band of noise swells on the throttle; a sub tone and a quiet whine on the growl's sixth harmonic
  sit under and over it. Almost all of it is between 80 and 500 Hz, so it's never shrill and still
  plays on laptop speakers. Pitch follows revs that run ahead of the speed when accelerating and
  fall back slowly when the throttle is let go, so a throttle spools up audibly.
- Boost: a low roar of band-passed noise while held, and a whoosh with a low kick when it starts.
- Air: band-passed noise, kept below about 1.2 kHz, that's barely there at cruising pace and
  rushes near the top, plus a faint hiss at very high speed. Spray hisses on water.
- Cues: a rising charge on a pad, a scrape or a thud on a wall by how hard the hit was, a thud on
  landing, beeps for 3, 2, 1 and go, a chime per lap and a brighter one for a faster lap, an
  arpeggio at the finish, ticks in the menus. Cues go through a short generated reverb.
- Online, other ships are heard where they are, as a smaller growl with its whine, with their
  pitch shifted as they close in or pull away.

Music is composed in `race-music.ts` and played by a small sequencer on the audio clock: driving
electronic at 132 bpm in A minor, a 16-bar chord loop, and a 32-bar arrangement (intro, drive,
breakdown, build with a riser). Menus get only the pad and arpeggio; racing brings in kick, clap,
hats and a side-chained bass, and a filter over the music opens with speed and closes while
paused. Cruising, the engine and the music are about equally loud; boosting, the engine is on top.

Browsers allow sound only after a key is pressed, so the first key starts it. A frame the game
doesn't draw (paused, menus) is silent, and a hidden tab suspends sound.

### Camera

Behind and a little above the ship, looking ahead along the road. Its "up" follows the road's
surface so loops and corkscrews look right, smoothed so it never snaps. The field of view widens
with speed, from 68° to 92°, and 12° more while boosting. The camera drops back a little as speed
builds and buzzes faintly near the top. Motion blur toward the middle of the screen starts at about
30 m/s and is strongest boosting, and specks of dust in the air stream past.

### Performance

60 fps on a mid-range laptop. Glow via three's bloom post-processing is fine if it holds that.

## Verification

- `npm run verify` passes: lint, typecheck, conventions, build, Go build, lint and tests.
- Go tests for the race room (seating, host, start rule, countdown, finish order, 30-second
  cut-off, DNF, leaving mid-race) like `tetris/room_test.go`, and for the time posting checks and
  the weekly board query.
- A Node script, `scripts/race-laps.ts`, drives an autopilot round each track with each ship: once
  with throttle only and no boost, once with good boost use. It prints lap times so tuning can be
  checked against the targets. Each track must land in the target ranges with Vega, and the ship
  spread must stay within about 4 seconds (5 at most).
- Playing it in the browser: a solo run on each track, posting a time and seeing it on the board,
  and an online race with two browser windows, checking bumping, finish order and results.

## Left to the builder

- Physics numbers, speeds, track lengths, and boost and refill rates, tuned to the targets.
- How track geometry is represented (spline with roll, segment graph, or something else), as long
  as loops, corkscrews, branches, gaps and water all work.
- The exact layout of each track within the rules above.
- Visual detail: glow strength, trails, spray, ship shapes.
- Message formats on the socket, following the Tetris style (`{"t": "..."}`).

## Calls I made that you should check

- Ship names (Vega, Kestrel, Lancer, Wisp, Torch) and their stat spread.
- Track names (Coaster, Skyway, Tidal), settings and colours.
- Command name `race`.
- Week resets Monday 00:00 UTC (08:00 in Ulaanbaatar).
- Board shows top 10, one entry per name.
- Only solo times go on the board.
- Online: 30 seconds for everyone else after the winner finishes, then DNF.
- Walls slow you, and you never fall off except at Skyway's gaps.
- Clearing a Skyway gap depends only on hitting the ramp pad.
- The shuffle never repeats a track back to back. R in solo restarts the same track.
- Water cuts top speed by about 15%.
- Esc always closes the game.
- Online, "play again" just returns you to the lobby. The host still starts each race.

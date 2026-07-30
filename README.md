# Galaxy Runner — 2D Space Shooter

Single-player 2D space shooter: dodge asteroids and aliens, collect coins,
follow the path shown at the top of the screen from **START** to **GOAL**.
Crash = lose a heart (3 hearts total); run out of hearts = game over.
Reach the goal = win the level, earn coins, unlock the next level (and
sometimes a new ship). Spend coins in the Shipyard to buy/equip better ships.

## Structure
```
space-shooter/
├── frontend/         # HTML5 canvas game (pure JS, no build step)
│   ├── index.html
│   ├── style.css
│   └── game.js
├── backend/           # Express REST API
│   ├── server.js
│   ├── db.js
│   └── package.json
└── database/
    └── schema.sql     # SQLite schema + seed data (ships & levels)
```

## Controls
- **◀ / ▶ / ▲ / ▼** on-screen buttons (or arrow keys) — move the ship
  in all 4 directions.
- **⚡ POWER** button (or Space bar) — activates a temporary shield /
  screen-clear burst once the power meter (top-right bar) is full.
  The meter fills from time, or instantly from purple ⚡ orbs.

## Running it

### 1. Backend + database
The database is plain SQLite; it's created automatically the first time
the server starts (schema + seed ships/levels come from `database/schema.sql`).

```bash
cd backend
npm install
npm start
# API now running on http://localhost:4000
```

### 2. Frontend
The frontend is static — just serve the `frontend/` folder. Easiest option:

```bash
cd frontend
npx serve .
# or: python3 -m http.server 8080
```

Then open the printed URL in your browser (or on your phone, if serving
on your local network).

> If the backend isn't running, the game still works — it automatically
> falls back to `localStorage` for saving coins/ships/progress, so you can
> try the whole game with just the `frontend/` folder open directly in a
> browser.

## API endpoints (backend/server.js)
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/player/:username` | Get (or auto-create) a player profile |
| GET | `/api/spaceships` | List all ships in the shop |
| GET | `/api/levels` | List all levels |
| POST | `/api/player/:username/buy-ship` | Buy a ship with coins `{shipId}` |
| POST | `/api/player/:username/select-ship` | Equip an owned ship `{shipId}` |
| POST | `/api/player/:username/level-result` | Report win/crash `{levelId, won, coinsCollected}` |
| POST | `/api/player/:username/hearts` | Manually set current hearts `{hearts}` |

## Database (database/schema.sql)
- `players` — coins, hearts, current ship/level
- `spaceships` — shop catalogue (cost, speed, power, fire rate, unlock level)
- `player_spaceships` — which ships each player owns
- `levels` — distance to goal, alien count, obstacle density, coin reward
- `player_progress` — per-level completion/best score/attempts

## Extending it
- Add more rows to `spaceships` / `levels` in `schema.sql` to add content —
  the frontend reads both lists dynamically, no code changes needed.
- Swap the emoji sprites in `game.js` (`draw()` function) for real image
  assets by drawing `ctx.drawImage(...)` instead of `ctx.fillText(...)`.
- Add sound effects, a pause button, or a leaderboard endpoint the same
  way the existing endpoints are structured.

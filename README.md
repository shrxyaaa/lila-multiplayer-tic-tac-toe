# Multiplayer Tic-Tac-Toe with Nakama

Production-oriented multiplayer Tic-Tac-Toe built for the LILA backend assignment. The app uses a React frontend and a Nakama backend with server-authoritative match logic, automatic matchmaking, public and private rooms, timed mode, persistent leaderboard stats, and account-based authentication.

## Assignment Coverage

### Core requirements

- Server-authoritative game logic in Nakama Lua runtime
- Server-side move validation and cheating prevention
- Realtime state broadcasting to both clients
- Automatic matchmaking
- Public room creation, discovery, and joining
- Graceful disconnect handling
- Responsive mobile-friendly frontend
- Realtime match state, player info, and match status in the UI

### Optional features implemented

- Concurrent game support through isolated Nakama match instances
- Global leaderboard with wins, losses, and streak tracking
- Timed mode with 30-second turns and automatic timeout forfeits
- Mode-aware matchmaking for classic vs timed games
- Persistent player stats in Nakama storage

## Tech Stack

### Frontend

- React
- React Router
- Nakama JavaScript client
- Custom CSS

### Backend

- Nakama 3.x
- Lua runtime modules
- CockroachDB
- Docker Compose for local orchestration

## Architecture

| Layer | Responsibility |
| --- | --- |
| `src/pages/*` | Screens for auth, lobby, game, and leaderboard |
| `src/nakama.js` | Session management, auth helpers, RPC calls, websocket lifecycle |
| `server/modules/tictactoe.lua` | Authoritative match state, move validation, timed turns, disconnect handling, leaderboard updates |
| `server/modules/backend.lua` | RPC endpoints for room creation, room discovery, signup/login lookup, and quick match creation |
| CockroachDB | Nakama user/account data and persistent game stats |

### High-level flow

1. User signs up or signs in with email/password, then may sign in later using either email or username.
2. Lobby allows:
   - Quick Match
   - Public Room creation/discovery
   - Private Room creation/join by room ID
3. Client sends only move intents to the server.
4. Nakama validates the move, updates authoritative board state, and broadcasts the result.
5. Finished matches update persistent stats and leaderboard records.

## Features

### Authentication

- Sign up with unique email and unique username
- Sign in using email or username
- Route protection for `/`, `/lobby`, `/game`, and `/leaderboard`
- Session restore on reload using stored Nakama tokens

### Matchmaking and rooms

- Quick Match for classic mode
- Quick Match for timed mode
- Public room creation and room discovery
- Private room creation with shareable room ID
- Join room directly by room ID
- Waiting-room flow before game starts

### Gameplay

- Server-authoritative Tic-Tac-Toe
- Turn validation
- Occupied-cell validation
- Win and draw detection
- Opponent disconnect detection with win award
- Result popup with win/lose/draw state

### Leaderboard and stats

- Wins tracked as leaderboard score
- Win streak tracked as leaderboard subscore
- Loss count stored in leaderboard metadata
- Persistent per-player stats in Nakama storage

### Timed mode

- 30-second turn timer
- Countdown shown in UI
- Automatic forfeit when a player times out

## Project Structure

```text
.
├── docker-compose.yml
├── server/
│   └── modules/
│       ├── backend.lua
│       └── tictactoe.lua
├── src/
│   ├── nakama.js
│   └── pages/
│       ├── Auth.js
│       ├── Game.js
│       ├── Leaderboard.js
│       ├── Lobby.js
│       └── pages.css
└── README.md
```

## Local Setup

### Prerequisites

- Node.js 18+
- npm
- Docker
- Docker Compose

### 1. Start Nakama and CockroachDB

```bash
docker compose up -d
```

Local endpoints:

- Nakama API/WebSocket: `http://127.0.0.1:7350`
- Nakama Console: `http://127.0.0.1:7351`
- CockroachDB SQL: `127.0.0.1:26257`
- CockroachDB Admin UI: `http://127.0.0.1:8080`

### 2. Configure environment variables

Create a `.env` file in the project root if you want to override defaults:

```env
REACT_APP_NAKAMA_HOST=127.0.0.1
REACT_APP_NAKAMA_PORT=7350
REACT_APP_NAKAMA_KEY=defaultkey
REACT_APP_NAKAMA_HTTP_KEY=defaultkey
REACT_APP_NAKAMA_USE_SSL=false
```

### 3. Install frontend dependencies

```bash
npm install
```

### 4. Start the frontend

```bash
npm start
```

Frontend runs at:

- `http://localhost:3000`

## How to Test Multiplayer

### Auth

1. Open the app in two browsers or two separate profiles.
2. Create two different accounts.
3. Confirm sign-in works with:
   - email + password
   - username + password

### Quick Match

1. In both clients, choose `Quick Match`.
2. Select the same mode on both sides:
   - `Classic`
   - or `Timed`
3. Click `Find Match`.
4. Confirm both players land in the same match and see synchronized state.

### Public Rooms

1. Client A opens `Public Room`.
2. Client A creates a room.
3. Client B opens `Public Room`.
4. Confirm the room appears in the list.
5. Client B joins and the game starts once both players are present.

### Private Rooms

1. Client A opens `Private Room`.
2. Client A creates a room.
3. Copy the room ID.
4. Client B opens `Private Room` and joins using the room ID.

### Server-authoritative validation

1. Join a live game with two players.
2. Try to click:
   - out of turn
   - an already occupied cell
3. Confirm the board does not accept the invalid move.

### Disconnect handling

1. Start a game with two players.
2. Close one player tab or navigate away.
3. Confirm the remaining player sees the opponent-left result and is awarded the win.

### Timed mode

1. Start a timed match.
2. Let one player sit idle on their turn for 30 seconds.
3. Confirm timeout triggers a forfeit and the other player wins.

### Leaderboard

1. Finish one or more decisive matches.
2. Open `/leaderboard`.
3. Confirm wins, streak, and losses appear correctly.

## Server/API Details

### Nakama match op codes

- `1`: move intent from client to server
- `2`: authoritative game-state broadcast from server to clients

### RPC endpoints

Defined in `server/modules/backend.lua`:

- `create_room`
- `create_private_match`
- `list_open_matches`
- `resolve_login_identifier`
- `check_signup_availability`

### Match data handled by the server

- board cells
- player marks
- current turn
- winner
- finish reason
- player count
- usernames
- timed-mode remaining seconds
- room type and mode

## Design Decisions

### Why server-authoritative

All game state lives on the Nakama server. The client never decides whether a move is valid; it only sends a move request. This prevents tampering and keeps both clients synchronized from a single source of truth.

### Why separate backend RPCs

Room creation, public-room discovery, and username lookup are handled through explicit RPCs so the frontend stays simple and the room lifecycle remains controlled on the backend.

### Why persistent stats in storage plus leaderboard records

Leaderboard records are great for ranking, while storage objects make it easy to persist extra stats cleanly. This project uses both:

- storage for wins/losses/streak history
- leaderboard for ranking and display

### Why separate room types

The backend distinguishes:

- `public`
- `private`
- `matchmaking`

This keeps public discovery clean while allowing private joins and quick-match-created games to stay isolated.

## Deployment Documentation

### Current repo state

This repository includes a complete local deployment using Docker Compose. It does not yet include a live cloud deployment URL or a public Nakama endpoint.

### Recommended cloud deployment process

#### Nakama

1. Provision a database supported by Nakama, such as CockroachDB or PostgreSQL.
2. Deploy Nakama 3.x with:
   - the same Lua modules from `server/modules`
   - a secure `server_key`
   - a secure `runtime.http_key`
   - TLS enabled
3. Expose only the required ports publicly.
4. Keep the Nakama Console private.

#### Frontend

1. Run:

```bash
npm run build
```

2. Deploy the generated frontend to a static host such as:
   - Vercel
   - Netlify
   - S3 + CloudFront
3. Set the frontend `REACT_APP_*` values to your public Nakama host.

## Known Status Against Assignment Deliverables

- Source code repository: available locally in this repo
- Deployed frontend URL: not yet done
- Deployed Nakama endpoint: not yet done
- README with setup, architecture, deployment, server config, and multiplayer test instructions: included here

## Troubleshooting

- If Safari or macOS has trouble connecting to Nakama on `localhost`, the app defaults to `127.0.0.1` for Nakama to avoid IPv6 localhost websocket issues.
- If quick match waits for a long time, make sure both players selected the same mode.
- If public rooms do not appear, make sure the creating player has already entered the waiting room.
- If the leaderboard is empty, finish at least one non-draw match.
- If auth fails after idle time, sign in again to refresh the Nakama session.

## Files of Interest

- `server/modules/tictactoe.lua`
- `server/modules/backend.lua`
- `src/nakama.js`
- `src/pages/Lobby.js`
- `src/pages/Game.js`
- `src/pages/Leaderboard.js`
- `docker-compose.yml`

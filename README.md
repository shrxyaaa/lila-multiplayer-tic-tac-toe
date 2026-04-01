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
├── docker-compose.gcp.yml
├── deploy/
│   └── gcp/
│       ├── Caddyfile
│       └── README.md
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

Copy `.env.example` to `.env` if you want to override defaults:

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

This repository includes:

- a complete local Docker Compose stack
- a GCP-oriented production Docker Compose stack in [`docker-compose.gcp.yml`](./docker-compose.gcp.yml)
- a Caddy HTTPS reverse-proxy config for a public Nakama hostname in [`deploy/gcp/Caddyfile`](./deploy/gcp/Caddyfile)
- frontend env examples for Vercel in [`.env.example`](./.env.example)
- backend env examples for GCP in [`.env.gcp.example`](./.env.gcp.example)

Live deployment for this submission:

- Frontend: `https://lila-multiplayer-tic-tac-toe-six.vercel.app/auth`
- Nakama endpoint: `https://nakama-136-115-5-124.nip.io`

### Provider choice for this project

- Frontend: Vercel
- Backend: GCP Compute Engine VM running Docker Compose
- HTTPS/TLS for Nakama: Caddy on the VM

### Why a public hostname is required

Because the frontend is served over `https://` on Vercel, the browser should talk to Nakama over `https://` / `wss://` as well. That means the Nakama VM needs a real public hostname such as:

- `nakama.your-domain.com`
- or a free DNS hostname you control

For this submission, the deployment uses:

- `nakama-136-115-5-124.nip.io`

The provided GCP stack uses Caddy so the public Nakama hostname can terminate TLS automatically.

### Vercel frontend deployment

1. Push the repo to GitHub.
2. In Vercel, import the GitHub repository.
3. Let Vercel build the project as a React app.
4. Set these environment variables in the Vercel project:

```env
REACT_APP_NAKAMA_HOST=nakama-136-115-5-124.nip.io
REACT_APP_NAKAMA_PORT=443
REACT_APP_NAKAMA_KEY=your-server-key
REACT_APP_NAKAMA_HTTP_KEY=your-http-key
REACT_APP_NAKAMA_USE_SSL=true
```

5. Deploy.

Build settings:

- Build command: `npm run build`
- Output directory: `build`

### GCP Nakama deployment

#### 1. Create the VM

Use a Compute Engine VM with a small always-on machine type suitable for a demo or assignment, for example `e2-small` or better.

Suggested OS:

- Ubuntu LTS

#### 2. Reserve a static external IP

Reserve one static external IP and attach it to the VM so your backend hostname does not change after restarts.

#### 3. Point DNS to the VM

Create an `A` record for a hostname such as:

- `nakama.your-domain.com`

Point it to the VM static IP.

For this submission, a `nip.io` hostname was used instead of a custom domain:

- `nakama-136-115-5-124.nip.io`

#### 4. Open firewall rules

Allow inbound traffic to:

- `80`
- `443`

Do not expose these publicly:

- `7351` Nakama Console
- `7349` gRPC admin port
- `26257` Cockroach SQL
- `8080` Cockroach admin UI

#### 5. Install Docker and Docker Compose on the VM

Install Docker Engine and Docker Compose on the Compute Engine VM.

#### 6. Upload or clone the repository onto the VM

Place the full project on the VM so the compose file can mount:

- `./server/modules`
- `./deploy/gcp/Caddyfile`

#### 7. Create the backend env file

From the repo root:

```bash
cp .env.gcp.example .env.gcp
```

Update:

- `NAKAMA_DOMAIN`
- `NAKAMA_SERVER_KEY`
- `NAKAMA_HTTP_KEY`
- `NAKAMA_CONSOLE_USERNAME`
- `NAKAMA_CONSOLE_PASSWORD`

#### 8. Start the production backend stack

From the repo root:

```bash
docker compose --env-file .env.gcp -f docker-compose.gcp.yml up -d
```

This stack will:

- start CockroachDB
- run Nakama migrations
- start Nakama with your Lua modules
- expose Nakama publicly through Caddy at `https://NAKAMA_DOMAIN`

#### 9. Verify the backend endpoint

After DNS has propagated and Caddy has issued TLS certificates, your public Nakama endpoint should be:

- `https://nakama.your-domain.com`

That same hostname should be used by the Vercel frontend.

For this deployed submission, the live endpoint is:

- `https://nakama-136-115-5-124.nip.io`

#### 10. Access the Nakama Console privately

Use SSH tunneling instead of public exposure:

```bash
gcloud compute ssh YOUR_INSTANCE_NAME --zone YOUR_ZONE -- -L 7351:localhost:7351
```

Then open:

- `http://localhost:7351`

Additional GCP notes are in [`deploy/gcp/README.md`](./deploy/gcp/README.md).

### API/server configuration details for deployment

- Frontend should use:
  - `REACT_APP_NAKAMA_HOST=nakama-136-115-5-124.nip.io`
  - `REACT_APP_NAKAMA_PORT=443`
  - `REACT_APP_NAKAMA_USE_SSL=true`
- Backend should use strong values for:
  - `NAKAMA_SERVER_KEY`
  - `NAKAMA_HTTP_KEY`
- GCP compose keeps the database, console, and admin interfaces bound to loopback only.

## Known Status Against Assignment Deliverables

- Source code repository: [https://github.com/shrxyaaa/lila-multiplayer-tic-tac-toe](https://github.com/shrxyaaa/lila-multiplayer-tic-tac-toe)
- Deployed frontend URL: [https://lila-multiplayer-tic-tac-toe-six.vercel.app/auth](https://lila-multiplayer-tic-tac-toe-six.vercel.app/auth)
- Deployed Nakama endpoint: [https://nakama-136-115-5-124.nip.io](https://nakama-136-115-5-124.nip.io)
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
- `docker-compose.gcp.yml`
- `deploy/gcp/Caddyfile`

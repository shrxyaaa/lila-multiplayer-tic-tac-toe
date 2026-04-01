import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getSession,
  hasDisconnectedSocket,
  initNakama,
  logout,
  rpc,
} from "../nakama";
import MiniBoardLogo from "./MiniBoardLogo";
import "./pages.css";

function LightningIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2L5 13h6l-1 9 9-12h-6l0-8z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h12" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 19a4 4 0 0 0-8 0" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 17a3.5 3.5 0 0 0-3.5 3" />
      <path d="M17.5 17a3.5 3.5 0 0 1 3.5 3" />
      <path d="M6 8.8a2.5 2.5 0 1 1 1-4.8" />
      <path d="M18 8.8a2.5 2.5 0 1 0-1-4.8" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

function DecorativeX({ size = 52 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <line x1="7" y1="7" x2="33" y2="33" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="33" y1="7" x2="7" y2="33" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  );
}

function DecorativeO({ size = 52 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="13" stroke="currentColor" strokeWidth="5.5" />
    </svg>
  );
}

function Lobby() {
  const navigate = useNavigate();
  const activeTicketRef = useRef("");
  const matchedTicketRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roomsError, setRoomsError] = useState("");
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [rooms, setRooms] = useState([]);
  const [matchmaking, setMatchmaking] = useState(false);
  const [matchmakingMode, setMatchmakingMode] = useState("");
  const [matchmakerTicket, setMatchmakerTicket] = useState("");
  const [creatingRoomMode, setCreatingRoomMode] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joiningById, setJoiningById] = useState(false);
  const [screen, setScreen] = useState("home");
  const [quickMode, setQuickMode] = useState("classic");
  const [publicCreateMode, setPublicCreateMode] = useState("classic");
  const [privateMode, setPrivateMode] = useState("classic");
  const [privateTab, setPrivateTab] = useState("join");
  const [connectionNotice, setConnectionNotice] = useState("");

  const connectionNoticeTimerRef = useRef(0);

  const clearConnectionNotice = useCallback(() => {
    if (connectionNoticeTimerRef.current) {
      window.clearTimeout(connectionNoticeTimerRef.current);
      connectionNoticeTimerRef.current = 0;
    }
    setConnectionNotice("");
  }, []);

  const showConnectionNotice = useCallback((message, durationMs = 0) => {
    if (connectionNoticeTimerRef.current) {
      window.clearTimeout(connectionNoticeTimerRef.current);
      connectionNoticeTimerRef.current = 0;
    }
    setConnectionNotice(message);
    if (durationMs > 0) {
      connectionNoticeTimerRef.current = window.setTimeout(() => {
        setConnectionNotice("");
        connectionNoticeTimerRef.current = 0;
      }, durationMs);
    }
  }, []);

  const loadRooms = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setRoomsLoading(true);
    }

    try {
      const res = await rpc("list_open_matches", {});
      const matches = Array.isArray(res.matches) ? res.matches : [];
      setRooms(matches);
      setRoomsError("");
    } catch (e) {
      if ((e?.message || "").toLowerCase().includes("not authenticated")) {
        logout();
        navigate("/auth", { replace: true });
        return;
      }
      setRoomsError(e.message || "Could not load open rooms");
    } finally {
      setRoomsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await initNakama();
        if (cancelled) return;
        setLoading(false);
        loadRooms();
      } catch (e) {
        if (!cancelled) {
          if ((e?.message || "").toLowerCase().includes("not authenticated")) {
            logout();
            navigate("/auth", { replace: true });
            return;
          }
          setError(e.message || "Could not reach Nakama");
          setLoading(false);
          setRoomsLoading(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [loadRooms, navigate]);

  useEffect(() => {
    if (loading || screen !== "publicroom") return undefined;

    const timer = window.setInterval(() => {
      loadRooms(false);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [loading, loadRooms, screen]);

  useEffect(() => {
    if (loading || screen !== "publicroom") return;
    loadRooms();
  }, [loading, screen, loadRooms]);

  useEffect(() => {
    return () => {
      const ticket = activeTicketRef.current;
      if (!ticket || matchedTicketRef.current) return;

      initNakama()
        .then((socket) => {
          socket.onmatchmakermatched = () => {};
          return socket.removeMatchmaker(ticket);
        })
        .catch(() => {
          /* Ignore cleanup failures during navigation/unmount. */
        });
    };
  }, []);

  useEffect(() => {
    return () => {
      if (connectionNoticeTimerRef.current) {
        window.clearTimeout(connectionNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const user = getSession()?.username || getSession()?.user_id;
    document.title = user ? `Lobby - ${user}` : "Lobby";
  }, [loading]);

  async function handleCreateRoom(mode, visibility = "public") {
    const createKey = `${visibility}-${mode}`;
    setError("");
    setCreatingRoomMode(createKey);

    try {
      const rpcName = visibility === "private" ? "create_private_match" : "create_room";
      const payload =
        visibility === "private"
          ? { game_mode: mode }
          : { game_mode: mode, visibility: "public" };
      const res = await rpc(rpcName, payload);

      if (res.error) {
        setError(res.error);
        return;
      }

      if (res.match_id) {
        navigate(
          `/game?matchId=${encodeURIComponent(
            res.match_id
          )}&mode=${mode}&visibility=${visibility}`
        );
      }
    } catch (e) {
      if ((e?.message || "").toLowerCase().includes("not authenticated")) {
        logout();
        navigate("/auth", { replace: true });
        return;
      }
      setError(e.message || "Create room failed");
    } finally {
      setCreatingRoomMode("");
    }
  }

  async function handleQuickPlay(mode) {
    if (matchmaking) return;

    matchedTicketRef.current = false;
    activeTicketRef.current = "";
    setError("");
    setMatchmaking(true);
    setMatchmakingMode(mode);
    setMatchmakerTicket("");

    let socket;
    const shouldReconnect = hasDisconnectedSocket();
    if (shouldReconnect) {
      showConnectionNotice("Reconnecting to game server...");
    } else {
      clearConnectionNotice();
    }
    try {
      const result = await initNakama({
        forceReconnect: shouldReconnect,
        returnMeta: true,
      });
      socket = result.socket;
      if (result.reconnected) {
        showConnectionNotice("Reconnected to game server.", 1800);
      } else {
        clearConnectionNotice();
      }
    } catch (e) {
      if ((e?.message || "").toLowerCase().includes("not authenticated")) {
        logout();
        navigate("/auth", { replace: true });
        return;
      }
      clearConnectionNotice();
      setMatchmaking(false);
      setMatchmakingMode("");
      setError(
        e?.message ||
          "Could not open a realtime connection. Is Nakama running on port 7350?"
      );
      return;
    }

    if (!socket) {
      setMatchmaking(false);
      setMatchmakingMode("");
      setError("Realtime socket not available. Try refreshing the page.");
      return;
    }

    const query =
      mode === "timed"
        ? "+properties.game_mode:timed"
        : "+properties.game_mode:classic";

    socket.onmatchmakermatched = (match) => {
      matchedTicketRef.current = true;
      activeTicketRef.current = "";
      setMatchmakerTicket("");
      setMatchmaking(false);
      setMatchmakingMode("");
      socket.onmatchmakermatched = () => {};

      const token = match.token
        ? `&matchToken=${encodeURIComponent(match.token)}`
        : "";

      navigate(
        `/game?matchId=${encodeURIComponent(
          match.match_id
        )}&mode=${mode}&queued=1${token}`
      );
    };

    try {
      const ticket = await socket.addMatchmaker(query, 2, 2, {
        game_mode: mode,
      });
      activeTicketRef.current = ticket.ticket;
      setMatchmakerTicket(ticket.ticket);
    } catch (e) {
      socket.onmatchmakermatched = () => {};
      setMatchmaking(false);
      setMatchmakingMode("");
      if ((e?.message || "").toLowerCase().includes("not authenticated")) {
        logout();
        navigate("/auth", { replace: true });
        return;
      }
      setError(e?.message || String(e) || "Matchmaking failed");
    }
  }

  async function handleCancelMatchmaking() {
    const ticket = activeTicketRef.current;

    activeTicketRef.current = "";
    matchedTicketRef.current = false;
    setMatchmaking(false);
    setMatchmakingMode("");
    setMatchmakerTicket("");

    try {
      const shouldReconnect = hasDisconnectedSocket();
      if (shouldReconnect) {
        showConnectionNotice("Reconnecting to game server...");
      }
      const result = await initNakama({
        forceReconnect: shouldReconnect,
        returnMeta: true,
      });
      const socket = result.socket;
      socket.onmatchmakermatched = () => {};
      if (ticket) {
        await socket.removeMatchmaker(ticket);
      }
      if (result.reconnected) {
        showConnectionNotice("Reconnected to game server.", 1500);
      } else {
        clearConnectionNotice();
      }
    } catch {
      clearConnectionNotice();
      /* Best effort. If the ticket already matched or expired, the UI should still recover. */
    }
  }

  function handleSignOut() {
    logout();
    navigate("/auth", { replace: true });
  }

  function handleJoinRoom(room) {
    navigate(
      `/game?matchId=${encodeURIComponent(room.match_id)}&mode=${room.game_mode}`
    );
  }

  function handleJoinByRoomId(e) {
    e.preventDefault();
    if (joiningById) return;
    const roomId = joinRoomId.trim();
    if (!roomId) {
      setRoomsError("Enter a room ID to join.");
      return;
    }
    setRoomsError("");
    setJoiningById(true);
    navigate(`/game?matchId=${encodeURIComponent(roomId)}`);
  }

  async function handleBackToHome() {
    if (matchmaking) {
      await handleCancelMatchmaking();
    }
    setScreen("home");
    setRoomsError("");
    setError("");
  }

  if (loading) {
    return (
      <div className="page page-shell">
        <div className="card hero-card">
          <p className="muted">Connecting to game server...</p>
        </div>
      </div>
    );
  }

  const roomList = Array.isArray(rooms) ? rooms : [];

  return (
    <div className="page page-shell lobby-page">
      <div className="lobby-decor" aria-hidden="true">
        <div className="floating-symbol floating-x floating-a">
          <DecorativeX size={56} />
        </div>
        <div className="floating-symbol floating-o floating-b">
          <DecorativeO size={68} />
        </div>
        <div className="floating-symbol floating-o floating-c">
          <DecorativeO size={48} />
        </div>
        <div className="floating-symbol floating-x floating-d">
          <DecorativeX size={50} />
        </div>
        <div className="floating-symbol floating-x floating-e">
          <DecorativeX size={32} />
        </div>
        <div className="floating-symbol floating-o floating-f">
          <DecorativeO size={36} />
        </div>
        <div className="ambient-glow ambient-glow-a" />
        <div className="ambient-glow ambient-glow-b" />
        <div className="ambient-glow ambient-glow-c" />
      </div>

      <div className="lobby-stage">
        <div className="lobby-top-actions">
          <span className="chip soft">
            Player: {getSession()?.username || getSession()?.user_id?.slice(0, 8)}
          </span>
          <button type="button" className="btn secondary chip-btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        {connectionNotice ? <div className="banner info">{connectionNotice}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}
        {roomsError ? <div className="banner error">{roomsError}</div> : null}

        {screen === "home" ? (
          <section className="menu-home">
            <MiniBoardLogo className="menu-logo-board" />
            <h1 className="menu-title">TIC TAC TOE</h1>
            <p className="menu-subtitle">CHOOSE YOUR GAME MODE</p>

            <div className="menu-card-list">
              <button type="button" className="menu-card menu-card-quick" onClick={() => setScreen("quickmatch")}>
                <div className="menu-card-icon">
                  <LightningIcon />
                </div>
                <div className="menu-card-content">
                  <div className="menu-card-title-row">
                    <strong>Quick Match</strong>
                    <span className="menu-badge">FAST</span>
                  </div>
                  <p>Instantly matched with a random opponent</p>
                </div>
                <span className="menu-card-arrow">
                  <ArrowRightIcon />
                </span>
              </button>

              <button type="button" className="menu-card menu-card-public" onClick={() => setScreen("publicroom")}>
                <div className="menu-card-icon">
                  <GlobeIcon />
                </div>
                <div className="menu-card-content">
                  <div className="menu-card-title-row">
                    <strong>Public Room</strong>
                  </div>
                  <p>Browse open rooms and join the fun</p>
                </div>
                <span className="menu-card-arrow">
                  <ArrowRightIcon />
                </span>
              </button>

              <button type="button" className="menu-card menu-card-private" onClick={() => setScreen("privateroom")}>
                <div className="menu-card-icon">
                  <LockIcon />
                </div>
                <div className="menu-card-content">
                  <div className="menu-card-title-row">
                    <strong>Private Room</strong>
                    <span className="menu-badge">INVITE</span>
                  </div>
                  <p>Create or join a room with a secret code</p>
                </div>
                <span className="menu-card-arrow">
                  <ArrowRightIcon />
                </span>
              </button>
            </div>

            <p className="menu-version">v1.0 · Classic Edition</p>
            <nav className="footer-nav menu-footer-nav">
              <Link to="/leaderboard">Leaderboard</Link>
            </nav>
          </section>
        ) : null}

        {screen === "quickmatch" ? (
          <section className="mode-screen mode-screen-quick">
            <div className="mode-icon-box mode-icon-quick">
              <LightningIcon />
            </div>
            <h2>Quick Match</h2>
            <p className="muted">Get matched with a random opponent instantly</p>

            <div className="mode-tabs">
              <button
                type="button"
                className={`mode-tab ${quickMode === "classic" ? "active" : ""}`}
                onClick={() => setQuickMode("classic")}
                disabled={matchmaking}
              >
                Classic
              </button>
              <button
                type="button"
                className={`mode-tab ${quickMode === "timed" ? "active" : ""}`}
                onClick={() => setQuickMode("timed")}
                disabled={matchmaking}
              >
                Timed
              </button>
            </div>

            {matchmakerTicket ? (
              <p className="muted small mono">Ticket: {matchmakerTicket.slice(0, 10)}...</p>
            ) : null}

            {matchmaking ? (
              <div className="mode-action-block matchmaking-block">
                <div className="matchmaking-spinner" aria-hidden="true">
                  <span className="matchmaking-ring" />
                  <span className="matchmaking-ring matchmaking-ring-inner" />
                  <span className="matchmaking-center-icon">
                    <LightningIcon />
                  </span>
                </div>
                <p className="matchmaking-title">Waiting...</p>
                <p className="muted">
                  Queueing in {matchmakingMode} mode.
                </p>
                <button type="button" className="btn secondary" onClick={handleCancelMatchmaking}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn primary quick-match-main-btn"
                onClick={() => handleQuickPlay(quickMode)}
              >
                Find Match
              </button>
            )}

            <button type="button" className="menu-back-btn" onClick={handleBackToHome}>
              ← Back to menu
            </button>
          </section>
        ) : null}

        {screen === "publicroom" ? (
          <section className="mode-screen mode-screen-public">
            <div className="mode-icon-box mode-icon-public">
              <GlobeIcon />
            </div>
            <h2>Public Rooms</h2>
            <p className="muted">Browse open rooms and join the fun</p>

            <div className="mode-tabs">
              <button
                type="button"
                className={`mode-tab ${publicCreateMode === "classic" ? "active" : ""}`}
                onClick={() => setPublicCreateMode("classic")}
                disabled={creatingRoomMode !== ""}
              >
                Classic
              </button>
              <button
                type="button"
                className={`mode-tab ${publicCreateMode === "timed" ? "active" : ""}`}
                onClick={() => setPublicCreateMode("timed")}
                disabled={creatingRoomMode !== ""}
              >
                Timed
              </button>
            </div>

            {roomsLoading ? (
              <div className="empty-state">
                <p className="muted">Loading open rooms...</p>
              </div>
            ) : roomList.length === 0 ? (
              <div className="empty-state">
                <p className="muted">No public rooms available right now.</p>
              </div>
            ) : (
              <div className="room-list">
                {roomList.map((room, index) => (
                  <article
                    key={room.match_id}
                    className="room-row"
                    style={{ animationDelay: `${index * 0.08}s` }}
                  >
                    <div>
                      <p className="room-code">
                        {room.match_id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="muted small">
                        {room.game_mode === "timed" ? "Timed room" : "Classic room"}
                      </p>
                    </div>
                    <div className="room-row-actions">
                      <span className="room-player-badge">
                        <UsersIcon />
                        {room.player_count}/{room.required_player_count}
                      </span>
                      <button
                        type="button"
                        className="btn public-btn room-join-btn"
                        onClick={() => handleJoinRoom(room)}
                      >
                        Join
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="row mode-footer-row">
              <button
                type="button"
                className="btn secondary mode-refresh"
                onClick={() => loadRooms()}
                disabled={roomsLoading}
              >
                <span className="btn-inline-icon">
                  <RefreshIcon />
                </span>
                Refresh
              </button>
              <button
                type="button"
                className="btn public-btn"
                disabled={creatingRoomMode !== ""}
                onClick={() => handleCreateRoom(publicCreateMode, "public")}
              >
                {creatingRoomMode === `public-${publicCreateMode}`
                  ? "Creating..."
                  : "Create Room"}
              </button>
            </div>

            <button type="button" className="menu-back-btn" onClick={handleBackToHome}>
              ← Back to menu
            </button>
          </section>
        ) : null}

        {screen === "privateroom" ? (
          <section className="mode-screen mode-screen-private">
            <div className="mode-icon-box mode-icon-private">
              <LockIcon />
            </div>
            <h2>Private Room</h2>
            <p className="muted">Play with a friend using a secret room code</p>

            <div className="mode-tabs">
              <button
                type="button"
                className={`mode-tab ${privateTab === "join" ? "active" : ""}`}
                onClick={() => setPrivateTab("join")}
              >
                Join Room
              </button>
              <button
                type="button"
                className={`mode-tab ${privateTab === "create" ? "active" : ""}`}
                onClick={() => setPrivateTab("create")}
              >
                Create Room
              </button>
            </div>

            {privateTab === "join" ? (
              <form className="join-form private-join-form" onSubmit={handleJoinByRoomId}>
                <label className="auth-label" htmlFor="join-room-id">
                  Enter Room Code
                </label>
                <input
                  id="join-room-id"
                  className="input mono"
                  type="text"
                  value={joinRoomId}
                  onChange={(e) => {
                    setJoinRoomId(e.target.value);
                    if (roomsError) setRoomsError("");
                  }}
                  placeholder="e.g. XO-A3F2"
                  autoComplete="off"
                />
                <button type="submit" className="btn private-btn" disabled={joiningById}>
                  {joiningById ? "Joining..." : "Join Room"}
                </button>
              </form>
            ) : (
              <div className="private-create-wrap">
                <div className="mode-tabs mode-tabs-small">
                  <button
                    type="button"
                    className={`mode-tab ${privateMode === "classic" ? "active" : ""}`}
                    onClick={() => setPrivateMode("classic")}
                    disabled={creatingRoomMode !== ""}
                  >
                    Classic
                  </button>
                  <button
                    type="button"
                    className={`mode-tab ${privateMode === "timed" ? "active" : ""}`}
                    onClick={() => setPrivateMode("timed")}
                    disabled={creatingRoomMode !== ""}
                  >
                    Timed
                  </button>
                </div>
                <button
                  type="button"
                  className="btn private-btn"
                  disabled={creatingRoomMode !== ""}
                  onClick={() => handleCreateRoom(privateMode, "private")}
                >
                  {creatingRoomMode === `private-${privateMode}`
                    ? "Creating..."
                    : "Create & Wait"}
                </button>
              </div>
            )}

            <button type="button" className="menu-back-btn" onClick={handleBackToHome}>
              ← Back to menu
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}

export default Lobby;

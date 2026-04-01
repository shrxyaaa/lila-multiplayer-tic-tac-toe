import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getSession,
  hasDisconnectedSocket,
  initNakama,
  logout,
} from "../nakama";
import MiniBoardLogo from "./MiniBoardLogo";
import "./pages.css";

const OP_MOVE = 1;
const OP_STATE = 2;
// Match reservations on the Nakama server expire after ~5 seconds
// (JOIN_RESERVE_TICKS 25 at tick rate 5). Keep the client retry just above
// that so stalled reserved matches are abandoned quickly without cutting off
// a normal second-player join.
const QUEUED_MATCH_RETRY_MS = 5500;
const MAX_QUEUED_MATCH_RETRIES = 2;
const DEFERRED_LEAVE_MS = 350;

const pendingMatchLeaves = new Map();

function matchLeaveKey(matchId, userId) {
  return `${matchId || ""}:${userId || "anonymous"}`;
}

function cancelScheduledLeave(matchId, userId) {
  const key = matchLeaveKey(matchId, userId);
  const timer = pendingMatchLeaves.get(key);
  if (timer) {
    window.clearTimeout(timer);
    pendingMatchLeaves.delete(key);
  }
}

function scheduleDeferredLeave(socket, matchId, userId) {
  if (!socket || !matchId) return;
  const key = matchLeaveKey(matchId, userId);
  cancelScheduledLeave(matchId, userId);
  const timer = window.setTimeout(() => {
    pendingMatchLeaves.delete(key);
    try {
      Promise.resolve(socket.leaveMatch(matchId)).catch(() => {
        /* ignore stale-socket leave failures during cleanup */
      });
    } catch {
      /* ignore */
    }
  }, DEFERRED_LEAVE_MS);
  pendingMatchLeaves.set(key, timer);
}

function isRecoverableSocketError(message) {
  return /socket connection has not been established|timed out while waiting|timed out when trying to connect|connection.*closed|socket.*closed|websocket/i.test(
    String(message || "")
  );
}

function WaitingRoomIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        d="M4.5 17H4a1 1 0 0 1-1-1 3 3 0 0 1 3-3h1m0-3.05A2.5 2.5 0 1 1 9 5.5M19.5 17h.5a1 1 0 0 0 1-1 3 3 0 0 0-3-3h-1m0-3.05a2.5 2.5 0 1 0-2-4.45m.5 13.5h-7a1 1 0 0 1-1-1 3 3 0 0 1 3-3h3a3 3 0 0 1 3 3 1 1 0 0 1-1 1Zm-1-9.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2M8 8H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2M8 8h8a2 2 0 0 1 2 2v8"
      />
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d="M13 2 5 13h6l-1 9 9-12h-6l0-8Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M12 7.8v4.6l3 1.8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatElapsed(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function Game() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get("matchId");
  const fromQueue = searchParams.get("queued") === "1";
  const matchToken = searchParams.get("matchToken");
  const queueRetryCount = Number(searchParams.get("queueRetry") || "0");

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("connecting");

  const [cells, setCells] = useState(Array(9).fill(""));
  const [currentMark, setCurrentMark] = useState("X");
  const [myMark, setMyMark] = useState(null);
  const [status, setStatus] = useState("waiting");
  const [winner, setWinner] = useState(null);
  const [finishReason, setFinishReason] = useState(null);
  const [gameMode, setGameMode] = useState(
    () => searchParams.get("mode") || "classic"
  );
  const [usernames, setUsernames] = useState({});
  const [turnSeconds, setTurnSeconds] = useState(0);
  const [playerCount, setPlayerCount] = useState(0);
  const [copyHint, setCopyHint] = useState("");
  const [connectionNotice, setConnectionNotice] = useState("");
  const [queueElapsedSeconds, setQueueElapsedSeconds] = useState(0);

  const socketRef = useRef(null);
  const moveInFlightRef = useRef(false);
  const copyHintTimerRef = useRef(0);
  const connectionNoticeTimerRef = useRef(0);
  const queueRetryTimerRef = useRef(0);
  const queueRetryPendingRef = useRef(false);

  const applyServerState = useCallback((msg) => {
    if (msg.cells) setCells(msg.cells);
    if (msg.current_mark) setCurrentMark(msg.current_mark);
    if (msg.status) setStatus(msg.status);
    if (msg.winner !== undefined) setWinner(msg.winner);
    if (msg.finish_reason !== undefined) setFinishReason(msg.finish_reason);
    if (msg.game_mode) setGameMode(msg.game_mode);
    if (msg.usernames) setUsernames(msg.usernames);
    if (msg.turn_seconds_remaining !== undefined) {
      setTurnSeconds(msg.turn_seconds_remaining);
    }
    if (msg.player_count !== undefined) {
      setPlayerCount(msg.player_count);
    }
    const uid = getSession()?.user_id;
    if (uid && msg.marks && msg.marks[uid]) {
      setMyMark(msg.marks[uid]);
    }
  }, []);

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

  const clearQueueRetryTimer = useCallback(() => {
    if (queueRetryTimerRef.current) {
      window.clearTimeout(queueRetryTimerRef.current);
      queueRetryTimerRef.current = 0;
    }
  }, []);

  const attachSocketHandlers = useCallback(
    (socket) => {
      socket.onmatchdata = (data) => {
        if (data.op_code !== OP_STATE) return;
        try {
          const raw = new TextDecoder().decode(data.data);
          const msg = JSON.parse(raw);
          applyServerState(msg);
        } catch {
          /* ignore */
        }
      };

      socket.onmatchpresence = () => {
        /* Presence updates are reflected through server state broadcasts. */
      };
    },
    [applyServerState]
  );

  const connectToMatch = useCallback(
    async ({ forceReconnect = false, join = false } = {}) => {
      const result = await initNakama({ forceReconnect, returnMeta: true });
      const socket = result.socket;
      socketRef.current = socket;
      attachSocketHandlers(socket);

      if (join) {
        await socket.joinMatch(matchId, matchToken || undefined);
      }

      return result;
    },
    [attachSocketHandlers, matchId, matchToken]
  );

  const requeueQueuedMatch = useCallback(
    async (notice = "Still searching. Rejoining the queue...") => {
      if (!fromQueue || !matchId || queueRetryPendingRef.current) {
        return false;
      }

      if (queueRetryCount >= MAX_QUEUED_MATCH_RETRIES) {
        clearConnectionNotice();
        setError(
          "Matchmaking kept reserving incomplete matches. Please try again from the lobby."
        );
        setPhase("error");
        return false;
      }

      queueRetryPendingRef.current = true;
      clearQueueRetryTimer();
      showConnectionNotice(notice);

      const mode = gameMode === "timed" ? "timed" : "classic";
      const query =
        mode === "timed"
          ? "+properties.game_mode:timed"
          : "+properties.game_mode:classic";

      try {
        const result = await initNakama({
          forceReconnect: hasDisconnectedSocket(),
          returnMeta: true,
        });
        const socket = result.socket;
        socketRef.current = socket;
        attachSocketHandlers(socket);

        try {
          await socket.leaveMatch(matchId);
        } catch {
          /* Best effort: the old reserved match may already be gone. */
        }

        socket.onmatchmakermatched = (match) => {
          const token = match.token
            ? `&matchToken=${encodeURIComponent(match.token)}`
            : "";
          const nextRetryCount = queueRetryCount + 1;
          const retryParam =
            nextRetryCount > 0 ? `&queueRetry=${nextRetryCount}` : "";
          navigate(
            `/game?matchId=${encodeURIComponent(
              match.match_id
            )}&mode=${mode}&queued=1${retryParam}${token}`,
            { replace: true }
          );
        };

        await socket.addMatchmaker(query, 2, 2, {
          game_mode: mode,
        });

        setReady(true);
        setError("");
        setPhase("connected");
        setStatus("waiting");
        setPlayerCount(0);
        setWinner(null);
        setFinishReason(null);
        setMyMark(null);
        setUsernames({});
        showConnectionNotice("Still searching. Rejoined the queue.");
        return true;
      } catch (e) {
        queueRetryPendingRef.current = false;
        clearConnectionNotice();
        const msg =
          e?.message ||
          e?.data?.message ||
          (typeof e === "string" ? e : null) ||
          "Failed to rejoin the queue";
        if (String(msg).toLowerCase().includes("not authenticated")) {
          logout();
          navigate("/auth", { replace: true });
          return false;
        }
        setError(String(msg || "Failed to rejoin the queue"));
        setPhase("error");
        return false;
      }
    },
    [
      attachSocketHandlers,
      clearConnectionNotice,
      clearQueueRetryTimer,
      fromQueue,
      gameMode,
      matchId,
      navigate,
      queueRetryCount,
      showConnectionNotice,
    ]
  );

  useEffect(() => {
    if (!matchId) return;

    let cancelled = false;
    const myUserId = getSession()?.user_id;
    cancelScheduledLeave(matchId, myUserId);

    async function setup() {
      try {
        const shouldReconnect = hasDisconnectedSocket();
        if (shouldReconnect) {
          showConnectionNotice("Reconnecting to game server...");
        }
        const result = await connectToMatch({
          forceReconnect: shouldReconnect,
          join: true,
        });
        if (cancelled) return;

        setReady(true);
        setError("");
        setPhase("connected");
        queueRetryPendingRef.current = false;
        if (result.reconnected) {
          showConnectionNotice("Reconnected to game server.", 1800);
        } else {
          clearConnectionNotice();
        }
      } catch (e) {
        if (!cancelled) {
          clearConnectionNotice();
          if ((e?.message || "").toLowerCase().includes("not authenticated")) {
            logout();
            navigate("/auth", { replace: true });
            return;
          }
          let msg =
            e?.message ||
            e?.data?.message ||
            (typeof e === "string" ? e : null) ||
            "Failed to join match";
          if (typeof msg !== "string") {
            try {
              msg = JSON.stringify(msg);
            } catch {
              msg = "Failed to join match";
            }
          }
          if (
            fromQueue &&
            /full|reject|denied|not found|invalid/i.test(msg)
          ) {
            const retried = await requeueQueuedMatch(
              "Reserved match closed before both players joined. Rejoining queue..."
            );
            if (retried) {
              return;
            }
          }
          if (/full|reject|denied|not found|invalid/i.test(msg)) {
            msg +=
              " (This match may be full or closed - create a new room from the lobby.)";
          }
          setError(msg);
          setPhase("error");
        }
      }
    }

    setup();
    return () => {
      cancelled = true;
      const socket = socketRef.current;
      if (socket && matchId) {
        scheduleDeferredLeave(socket, matchId, myUserId);
      }
    };
  }, [
    clearConnectionNotice,
    connectToMatch,
    fromQueue,
    matchId,
    navigate,
    requeueQueuedMatch,
    showConnectionNotice,
  ]);

  useEffect(() => {
    queueRetryPendingRef.current = false;
    clearQueueRetryTimer();

    return () => {
      clearQueueRetryTimer();
    };
  }, [clearQueueRetryTimer, matchId]);

  useEffect(() => {
    clearQueueRetryTimer();

    if (
      !fromQueue ||
      !ready ||
      phase !== "connected" ||
      status !== "waiting" ||
      playerCount >= 2 ||
      queueRetryPendingRef.current
    ) {
      return undefined;
    }

    queueRetryTimerRef.current = window.setTimeout(() => {
      requeueQueuedMatch(
        "Opponent took too long to finish joining. Rejoining queue..."
      );
    }, QUEUED_MATCH_RETRY_MS);

    return () => {
      clearQueueRetryTimer();
    };
  }, [
    clearQueueRetryTimer,
    fromQueue,
    phase,
    playerCount,
    ready,
    requeueQueuedMatch,
    status,
  ]);

  useEffect(() => {
    return () => {
      if (copyHintTimerRef.current) {
        window.clearTimeout(copyHintTimerRef.current);
      }
      if (connectionNoticeTimerRef.current) {
        window.clearTimeout(connectionNoticeTimerRef.current);
      }
      if (queueRetryTimerRef.current) {
        window.clearTimeout(queueRetryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!(fromQueue && status === "waiting" && playerCount < 2)) {
      setQueueElapsedSeconds(0);
      return undefined;
    }

    setQueueElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setQueueElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [fromQueue, playerCount, status, matchId]);

  async function handleCopyRoomId() {
    if (!matchId) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(matchId);
      } else {
        throw new Error("clipboard_unavailable");
      }
      setCopyHint("Copied");
    } catch {
      setCopyHint("Copy failed");
    }
    if (copyHintTimerRef.current) {
      window.clearTimeout(copyHintTimerRef.current);
    }
    copyHintTimerRef.current = window.setTimeout(() => {
      setCopyHint("");
      copyHintTimerRef.current = 0;
    }, 1800);
  }

  async function handleClick(index) {
    if (moveInFlightRef.current) return;

    const socket = socketRef.current;
    if (!ready || !socket || !matchId) return;
    if (status !== "playing" || winner) return;
    if (cells[index]) return;

    const myself = getSession()?.user_id;
    if (!myself || !myMark || myMark !== currentMark) return;

    moveInFlightRef.current = true;
    try {
      const payload = { cell: index };
      await socket.sendMatchState(matchId, OP_MOVE, JSON.stringify(payload));
      setCells((prev) => {
        if (prev[index]) return prev;
        const next = [...prev];
        next[index] = myMark;
        return next;
      });
    } catch (e) {
      const msg = typeof e === "string" ? e : e?.message || String(e);
      if (isRecoverableSocketError(msg)) {
        try {
          showConnectionNotice("Reconnecting to game server...");
          const recovered = await connectToMatch({
            forceReconnect: true,
            join: true,
          });
          const recoveredSocket = recovered.socket;
          const payload = { cell: index };
          await recoveredSocket.sendMatchState(
            matchId,
            OP_MOVE,
            JSON.stringify(payload)
          );
          setCells((prev) => {
            if (prev[index]) return prev;
            const next = [...prev];
            next[index] = myMark;
            return next;
          });
          setReady(true);
          setError("");
          setPhase("connected");
          showConnectionNotice("Reconnected. Resuming match...", 1800);
          return;
        } catch (retryError) {
          clearConnectionNotice();
          const retryMsg =
            typeof retryError === "string"
              ? retryError
              : retryError?.message || String(retryError);
          if (retryMsg.toLowerCase().includes("not authenticated")) {
            logout();
            navigate("/auth", { replace: true });
            return;
          }
          setError(retryMsg || "Connection lost. Please rejoin the match.");
          setPhase("error");
          return;
        }
      }

      if (!msg.includes("timed out while waiting")) {
        console.warn("sendMatchState failed:", e);
      }
    } finally {
      moveInFlightRef.current = false;
    }
  }

  const waitingHeadline =
    fromQueue && playerCount < 2
      ? "Waiting..."
      : playerCount >= 2
      ? "Starting game..."
      : "Waiting room";
  const displayRoomId =
    matchId && matchId.length > 28
      ? `${matchId.slice(0, 12)}...${matchId.slice(-6)}`
      : matchId;
  const headline =
    status === "waiting"
      ? waitingHeadline
      : winner === "draw"
      ? "It's a draw"
      : winner
      ? `Winner: ${winner}`
      : `Turn: ${currentMark}`;

  const myId = getSession()?.user_id;
  const opponentId =
    myId && usernames ? Object.keys(usernames).find((id) => id !== myId) : null;
  const opponentMark = myMark === "X" ? "O" : myMark === "O" ? "X" : null;
  const subtitle =
    status === "waiting"
      ? null
      : myMark && opponentMark
      ? `You are ${myMark} · ${usernames[myId] || "You"} vs ${
          (opponentId && usernames[opponentId]) || "Opponent"
        }`
      : myMark
      ? `You are ${myMark}`
      : null;

  if (!matchId) {
    return (
      <div className="page page-shell">
        <div className="card hero-card">
          <h1>No match id</h1>
          <Link to="/" className="menu-back-btn">
            ← Back to lobby
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="page page-shell">
        <div className="card hero-card">
          <div className="banner error">{error}</div>
          <Link to="/" className="menu-back-btn">
            ← Back to lobby
          </Link>
        </div>
      </div>
    );
  }

  const boardLocked =
    status !== "playing" ||
    Boolean(winner) ||
    (myMark && myMark !== currentMark);
  const isWaitingScreen = status === "waiting";
  const showFriendWaitingScreen = status === "waiting" && !fromQueue;
  const showSearchState = fromQueue && status === "waiting" && playerCount < 2;
  const showWaitingRoomState = ready && status === "waiting" && !showSearchState;
  const showResultModal = ready && status === "finished" && winner !== null;
  const didWin =
    winner &&
    winner !== "draw" &&
    myMark &&
    winner === myMark;
  const didLose =
    winner &&
    winner !== "draw" &&
    myMark &&
    winner !== myMark;

  let resultTitle = "Match Finished";
  let resultMessage = "The game has ended.";
  if (winner === "draw") {
    resultTitle = "Its a Draw";
    resultMessage = "No winner this round. Great game!";
  } else if (didWin) {
    resultTitle = "You Win";
    resultMessage =
      finishReason === "opponent_left"
        ? "Opponent left the game. Win awarded to you."
        : "Great job! You took this match.";
  } else if (didLose) {
    resultTitle = "You Lose";
    resultMessage = "Better luck next time.";
  } else if (winner) {
    resultTitle = `Winner: ${winner}`;
    resultMessage = "Match completed.";
  }

  if (showFriendWaitingScreen) {
    return (
      <div className="page page-shell game waiting-room-page">
        <div className="waiting-top-spacer" aria-hidden="true" />
        <section className="mode-screen">
          <div className="mode-icon-box waiting-symbol">
            <WaitingRoomIcon />
          </div>
          <h2>Waiting Room</h2>
          <p className="muted">Room ID</p>

          <div className="room-list waiting-room-list">
            <article className="room-row waiting-room-row">
              <p className="room-code mono waiting-room-code">{matchId}</p>
              <button
                type="button"
                className="waiting-copy-btn"
                onClick={handleCopyRoomId}
                aria-label="Copy room id"
                title="Copy room id"
              >
                <CopyIcon />
              </button>
            </article>
          </div>

          {copyHint ? <p className="muted small waiting-copy-hint">{copyHint}</p> : null}
          {connectionNotice ? <div className="banner info">{connectionNotice}</div> : null}

          <div className="empty-state waiting-empty">
            <p className="muted">
              {ready
                ? "Waiting for your friend to join this room. Share the room ID above."
                : "Joining match..."}
            </p>
          </div>

          <button type="button" className="menu-back-btn" onClick={() => navigate("/")}>
            ← Back to menu
          </button>
        </section>
      </div>
    );
  }

  if (showSearchState) {
    const modeBadge = gameMode === "timed" ? "Timed Match" : "Quick Match";
    const myQueuedMark = myMark || "X";
    const opponentQueuedMark =
      myQueuedMark === "O" ? "X" : "O";
    const searchStatusText = connectionNotice || "Searching...";

    return (
      <div className="page page-shell game queued-search-page">
        <section className="queued-search-screen">
          <div className="queued-search-badge">
            <LightningIcon />
            <span>{modeBadge}</span>
          </div>

          <h1 className="queued-search-title">Waiting...</h1>
          <p className="queued-search-subtitle">Waiting for an opponent to join</p>

          <div className="card queued-matchup-card">
            <div className="queued-player-slot">
              <div className="queued-player-mark queued-player-mark-self">{myQueuedMark}</div>
              <p className="queued-player-name">{usernames[myId] || "You"}</p>
              <span className="queued-player-tag">Host</span>
            </div>

            <div className="queued-vs-chip">VS</div>

            <div className="queued-player-slot queued-player-slot-opponent">
              <div className="queued-player-mark queued-player-mark-opponent">
                <span>{opponentQueuedMark}</span>
              </div>
              <p className="queued-player-name">???</p>
              <div className="queued-typing-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>

          <div className="card queued-status-card">
            <div className="queued-status-main">
              <div className="queued-status-copy">
                <span className="queued-status-icon">
                  <ClockIcon />
                </span>
                <div>
                  <p className="queued-status-title">{searchStatusText}</p>
                  <p className="queued-status-subtitle">Reserved match is waiting for player two</p>
                </div>
              </div>

              <div className="queued-status-time">
                <ClockIcon />
                <span>{formatElapsed(queueElapsedSeconds)}</span>
              </div>
            </div>

            <div className="queued-status-bar" aria-hidden="true">
              <span className="queued-status-progress" />
            </div>
            <p className="queued-progress-label">1 / 2 players joined</p>
          </div>

          <button
            type="button"
            className="btn secondary queued-cancel-btn"
            onClick={() => navigate("/")}
          >
            Cancel &amp; Go Back
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="page page-shell game">
      <header className="page-header card hero-card">
        {isWaitingScreen ? (
          <div className="header-symbol waiting-symbol">
            <WaitingRoomIcon />
          </div>
        ) : (
          <MiniBoardLogo />
        )}
        {!isWaitingScreen ? (
          <div className="chip-row centered">
            <span className="chip soft">
              {gameMode === "timed" ? "Timed mode" : "Classic mode"}
            </span>
            <span className="chip soft">{playerCount}/2 players</span>
          </div>
        ) : null}
        <h1>{headline}</h1>
        {!fromQueue && isWaitingScreen ? (
          <div className="room-id-banner">
            <span className="muted small mono">Room ID: {displayRoomId}</span>
            <button type="button" className="btn secondary room-id-copy" onClick={handleCopyRoomId}>
              Copy room id
            </button>
            {copyHint ? <span className="chip subtle">{copyHint}</span> : null}
          </div>
        ) : null}
        {!isWaitingScreen && !fromQueue ? (
          <div className="room-id-banner">
            <span className="muted small mono">Room ID: {displayRoomId}</span>
            <button type="button" className="btn secondary room-id-copy" onClick={handleCopyRoomId}>
              Copy room id
            </button>
            {copyHint ? <span className="chip subtle">{copyHint}</span> : null}
          </div>
        ) : null}
        {subtitle ? <p className="muted small">{subtitle}</p> : null}
        {ready && showSearchState ? (
          <div className="card search-state">
            <p className="muted">
              You're in the queue and your match has been reserved. The board
              will appear as soon as the second player finishes joining.
            </p>
          </div>
        ) : null}
        {gameMode === "timed" && status === "playing" && !winner ? (
          <p className={`timer ${turnSeconds <= 5 ? "timer-urgent" : ""}`}>
            {turnSeconds}s left this turn
          </p>
        ) : null}
      </header>

      {connectionNotice ? <div className="banner info">{connectionNotice}</div> : null}

      {!ready ? (
        <div className="card search-state">
          <p className="muted">Joining match...</p>
        </div>
      ) : showSearchState ? (
        <div className="card search-state">
          <p className="muted">Waiting for the other player to finish joining...</p>
        </div>
      ) : showWaitingRoomState ? (
        <div className="card search-state">
          {playerCount < 2 ? (
            <p className="muted">
              Waiting for your friend to join this room. Share the room ID above.
            </p>
          ) : (
            <p className="muted">Opponent joined. Starting the game automatically...</p>
          )}
        </div>
      ) : (
        <div className="board-card card">
          <div className="board" role="grid" aria-label="Tic-tac-toe board">
            {cells.map((cell, index) => (
              <button
                type="button"
                key={index}
                className={`cell ${cell ? "filled" : ""} ${
                  cell === "X" ? "mark-x" : cell === "O" ? "mark-o" : ""
                }`}
                onClick={() => handleClick(index)}
                disabled={boardLocked || Boolean(cell)}
                aria-label={`Cell ${index + 1}, ${cell || "empty"}`}
              >
                {cell}
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="footer-nav">
        <Link to="/">Lobby</Link>
        <Link to="/leaderboard">Leaderboard</Link>
      </footer>

      {showResultModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>{resultTitle}</h2>
            <p className="muted">{resultMessage}</p>
            <div className="row result-actions">
              <Link className="btn primary modal-link-btn" to="/leaderboard">
                Leaderboard
              </Link>
              <Link className="btn secondary modal-link-btn" to="/">
                Lobby
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Game;

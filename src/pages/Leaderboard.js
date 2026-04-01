import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ensureAuthenticatedSession,
  getClient,
  logout,
} from "../nakama";
import "./pages.css";

const BOARD_ID = "tictactoe_wins";

function LeaderboardIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M11 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" />
      <path
        fillRule="evenodd"
        d="M9.896 3.051a2.681 2.681 0 0 1 4.208 0c.147.186.38.282.615.255a2.681 2.681 0 0 1 2.976 2.975.681.681 0 0 0 .254.615 2.681 2.681 0 0 1 0 4.208.682.682 0 0 0-.254.615 2.681 2.681 0 0 1-2.976 2.976.681.681 0 0 0-.615.254 2.682 2.682 0 0 1-4.208 0 .681.681 0 0 0-.614-.255 2.681 2.681 0 0 1-2.976-2.975.681.681 0 0 0-.255-.615 2.681 2.681 0 0 1 0-4.208.681.681 0 0 0 .255-.615 2.681 2.681 0 0 1 2.976-2.975.681.681 0 0 0 .614-.255ZM12 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
        clipRule="evenodd"
      />
      <path d="M5.395 15.055 4.07 19a1 1 0 0 0 1.264 1.267l1.95-.65 1.144 1.707A1 1 0 0 0 10.2 21.1l1.12-3.18a4.641 4.641 0 0 1-2.515-1.208 4.667 4.667 0 0 1-3.411-1.656Zm7.269 2.867 1.12 3.177a1 1 0 0 0 1.773.224l1.144-1.707 1.95.65A1 1 0 0 0 19.915 19l-1.32-3.93a4.667 4.667 0 0 1-3.4 1.642 4.643 4.643 0 0 1-2.53 1.21Z" />
    </svg>
  );
}

function Leaderboard() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const client = getClient();
        const session = await ensureAuthenticatedSession();
        const list = await client.listLeaderboardRecords(
          session,
          BOARD_ID,
          undefined,
          20
        );
        if (!cancelled) {
          setRecords(list.records || []);
        }
      } catch (e) {
        if (!cancelled) {
          if ((e?.message || "").toLowerCase().includes("not authenticated")) {
            logout();
            navigate("/auth", { replace: true });
            return;
          }
          setError(e.message || "Could not load leaderboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="page page-shell leaderboard-page">
      <header className="page-header card hero-card">
        <div className="header-symbol leaderboard-symbol">
          <LeaderboardIcon />
        </div>
        <h1>Leaderboard</h1>
      </header>

      {error ? <div className="banner error">{error}</div> : null}

      {loading ? (
        <div className="card">
          <p className="muted">Loading...</p>
        </div>
      ) : (
        <div className="table-wrap card">
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Wins</th>
                <th>Streak</th>
                <th>Losses (meta)</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No games finished yet. Play a match to appear here.
                  </td>
                </tr>
              ) : (
                records.map((r, i) => {
                  let meta = {};
                  if (r.metadata) {
                    try {
                      meta =
                        typeof r.metadata === "string"
                          ? JSON.parse(r.metadata)
                          : r.metadata;
                    } catch {
                      meta = {};
                    }
                  }
                  return (
                    <tr key={r.owner_id || i}>
                      <td>{r.rank ?? i + 1}</td>
                      <td className="mono">{r.username || r.owner_id?.slice(0, 8)}</td>
                      <td>{r.score}</td>
                      <td>{r.subscore}</td>
                      <td>{meta.losses ?? "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <nav className="footer-nav">
        <Link to="/">Lobby</Link>
      </nav>
    </div>
  );
}

export default Leaderboard;

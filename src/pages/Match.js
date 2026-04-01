import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./pages.css";

/**
 * Legacy route: matchmaking now runs from the lobby.
 */
function Match() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  return (
    <div className="page">
      <p className="muted">Redirecting to lobby…</p>
    </div>
  );
}

export default Match;

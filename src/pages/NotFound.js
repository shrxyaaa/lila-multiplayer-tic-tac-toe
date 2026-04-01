import { Link } from "react-router-dom";
import MiniBoardLogo from "./MiniBoardLogo";
import "./pages.css";

function NotFound() {
  return (
    <div className="page page-shell">
      <div className="card hero-card">
        <MiniBoardLogo />
        <div className="eyebrow">Page not found</div>
        <h1>That route does not exist.</h1>
        <p className="muted">Head back to the lobby to start or join a match.</p>
        <nav className="footer-nav">
          <Link to="/">Lobby</Link>
        </nav>
      </div>
    </div>
  );
}

export default NotFound;

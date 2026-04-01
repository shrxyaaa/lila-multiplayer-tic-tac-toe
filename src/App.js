import './App.css';
import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Lobby from './pages/Lobby';
import Match from './pages/Match';
import Game from './pages/Game';
import Leaderboard from './pages/Leaderboard';
import NotFound from './pages/NotFound';
import Auth from './pages/Auth';
import { bootstrapSession, getSession } from './nakama';

function ProtectedRoute({ children }) {
  if (!getSession()) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}

function PublicOnlyRoute({ children }) {
  if (getSession()) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function App() {
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      try {
        await bootstrapSession();
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    hydrateSession();
    return () => {
      cancelled = true;
    };
  }, []);

  if (booting) {
    return (
      <div className="page page-shell">
        <div className="card hero-card">
          <p className="muted">Restoring session...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/auth"
          element={
            <PublicOnlyRoute>
              <Auth />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Lobby />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lobby"
          element={
            <ProtectedRoute>
              <Lobby />
            </ProtectedRoute>
          }
        />
        <Route
          path="/match"
          element={
            <ProtectedRoute>
              <Match />
            </ProtectedRoute>
          }
        />
        <Route
          path="/game"
          element={
            <ProtectedRoute>
              <Game />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <Leaderboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;

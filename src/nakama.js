import { Client, Session } from "@heroiclabs/nakama-js";

const TOKEN_KEY = "tictactoe_auth_token";
const REFRESH_TOKEN_KEY = "tictactoe_auth_refresh_token";

function defaultNakamaHost() {
  if (typeof window === "undefined") return "127.0.0.1";
  const h = window.location.hostname;
  /* Safari/macOS often resolve "localhost" to ::1 (IPv6). Docker/Nakama on :7350 is
     usually only reachable on IPv4 127.0.0.1, so WS/REST to localhost:7350 fails in Safari. */
  if (h === "localhost" || h === "127.0.0.1") return "127.0.0.1";
  return h;
}

const host = process.env.REACT_APP_NAKAMA_HOST || defaultNakamaHost();
const port = process.env.REACT_APP_NAKAMA_PORT || "7350";
const serverKey = process.env.REACT_APP_NAKAMA_KEY || "defaultkey";
const httpKey = process.env.REACT_APP_NAKAMA_HTTP_KEY || "defaulthttpkey";
const useSSL = process.env.REACT_APP_NAKAMA_USE_SSL === "true";

const client = new Client(serverKey, host, port, useSSL);

let socket = null;
let session = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function socketReadyStateLabel(state) {
  switch (state) {
    case 0:
      return "connecting";
    case 1:
      return "open";
    case 2:
      return "closing";
    case 3:
      return "closed";
    default:
      return "unknown";
  }
}

export function getClient() {
  return client;
}

export function getSession() {
  return session;
}

export function getSocket() {
  return socket;
}

/** Nakama-js throws raw `fetch` Response on non-2xx; browsers show it as [object Response]. */
async function describeFetchError(e) {
  if (typeof Response !== "undefined" && e instanceof Response) {
    let body = "";
    try {
      body = (await e.clone().text()).trim();
    } catch {
      /* ignore */
    }
    const snippet = body.length > 400 ? `${body.slice(0, 400)}...` : body;
    return `HTTP ${e.status} ${e.statusText}${snippet ? ` — ${snippet}` : ""}`;
  }
  if (typeof Event !== "undefined" && e instanceof Event) {
    const target = e.target || e.currentTarget;
    const readyState = socketReadyStateLabel(target?.readyState);
    const code =
      typeof e.code === "number"
        ? e.code
        : typeof target?.code === "number"
        ? target.code
        : null;
    const reason =
      typeof e.reason === "string" && e.reason
        ? e.reason
        : typeof target?.reason === "string" && target.reason
        ? target.reason
        : "";
    return `WebSocket ${e.type || "event"} (state: ${readyState}${
      code !== null ? `, code: ${code}` : ""
    }${reason ? `, reason: ${reason}` : ""})`;
  }
  if (e != null && typeof e === "object" && "message" in e) {
    return String(e.message);
  }
  return String(e);
}

function parseRpcPayload(payload) {
  if (payload == null) return {};
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  if (typeof payload === "object") return payload;
  return {};
}

function authError(message, code, extras = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extras);
  return error;
}

function nakamaHttpKeys() {
  const keys = [];
  const primaryHttp = String(httpKey || "").trim();
  if (primaryHttp) keys.push(primaryHttp);
  const primary = String(serverKey || "").trim();
  if (primary) keys.push(primary);
  if (!keys.includes("defaultkey")) keys.push("defaultkey");
  if (!keys.includes("defaulthttpkey")) keys.push("defaulthttpkey");
  return keys;
}

function httpBaseUrl() {
  return `${useSSL ? "https" : "http"}://${host}:${port}`;
}

async function rpcHttpKeyWithFallback(id, payload) {
  let lastError = null;
  const body =
    payload === undefined ? undefined : JSON.stringify(JSON.stringify(payload));
  for (const key of nakamaHttpKeys()) {
    try {
      const response = await fetch(
        `${httpBaseUrl()}/v2/rpc/${encodeURIComponent(
          id
        )}?http_key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body,
        }
      );
      if (!response.ok) {
        throw response;
      }
      const data = await response.json();
      return {
        id,
        payload: data?.payload ? JSON.parse(data.payload) : undefined,
      };
    } catch (e) {
      lastError = e;
      const reason = await describeFetchError(e);
      const lowered = reason.toLowerCase();
      const keyInvalid =
        lowered.includes("http key invalid") ||
        lowered.includes("unauthorized") ||
        lowered.includes("401");
      if (!keyInvalid) throw e;
    }
  }
  throw lastError || new Error("RPC authentication failed");
}

async function checkSignupAvailability(email, username) {
  let response;
  try {
    response = await rpcHttpKeyWithFallback("check_signup_availability", {
      email,
      username,
    });
  } catch (e) {
    const reason = await describeFetchError(e);
    throw new Error(`Sign up failed: could not verify account availability (${reason})`);
  }

  const payload = parseRpcPayload(response?.payload);
  if (!payload || payload.error) {
    throw new Error("Sign up failed: invalid signup availability response.");
  }

  return {
    emailExists: Boolean(payload.email_exists),
    usernameExists: Boolean(payload.username_exists),
  };
}

function saveSessionToStorage(s) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, s.token);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, s.refresh_token);
  } catch {
    /* ignore storage failures */
  }
}

function clearSessionFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    /* ignore storage failures */
  }
}

function disconnectSocket() {
  if (!socket) return;
  try {
    socket.disconnect(false);
  } catch {
    /* ignore */
  }
  socket = null;
}

function getSessionCheckTime(skewMs = 30_000) {
  return Math.floor((Date.now() + skewMs) / 1000);
}

async function refreshSessionIfNeeded(currentSession) {
  if (!currentSession) return null;

  const now = getSessionCheckTime();
  if (!currentSession.isexpired(now)) {
    return currentSession;
  }

  if (
    !currentSession.refresh_token ||
    currentSession.isrefreshexpired(now)
  ) {
    disconnectSocket();
    session = null;
    clearSessionFromStorage();
    throw new Error("Not authenticated. Please sign in.");
  }

  try {
    await client.sessionRefresh(currentSession);
    saveSessionToStorage(currentSession);
    return currentSession;
  } catch (e) {
    disconnectSocket();
    session = null;
    clearSessionFromStorage();
    const reason = await describeFetchError(e);
    throw new Error(`Session refresh failed: ${reason}`);
  }
}

async function restoreSessionFromStorage() {
  if (session) return session;
  if (typeof window === "undefined") return null;

  let token = "";
  let refreshToken = "";
  try {
    token = window.localStorage.getItem(TOKEN_KEY) || "";
    refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY) || "";
  } catch {
    return null;
  }

  if (!token || !refreshToken) return null;

  try {
    const restored = Session.restore(token, refreshToken);
    const now = Math.floor(Date.now() / 1000);

    if (restored.isexpired(now)) {
      if (!restored.refresh_token || restored.isrefreshexpired(now)) {
        clearSessionFromStorage();
        return null;
      }
      await client.sessionRefresh(restored);
    }

    session = restored;
    saveSessionToStorage(restored);
    return restored;
  } catch {
    clearSessionFromStorage();
    return null;
  }
}

async function ensureSession() {
  if (session) {
    return refreshSessionIfNeeded(session);
  }
  const restored = await restoreSessionFromStorage();
  if (restored) {
    return refreshSessionIfNeeded(restored);
  }
  throw new Error("Not authenticated. Please sign in.");
}

export async function ensureAuthenticatedSession() {
  return ensureSession();
}

export async function bootstrapSession() {
  await restoreSessionFromStorage();
  return session;
}

export async function signUpWithEmail(email, password, username) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedUsername = String(username || "").trim();

  if (!normalizedEmail || !password || !normalizedUsername) {
    throw new Error("Email, username, and password are required.");
  }

  const availability = await checkSignupAvailability(
    normalizedEmail,
    normalizedUsername
  );

  if (availability.emailExists) {
    throw authError(
      "An account with this email already exists. Please sign in.",
      "email_exists",
      { identifier: normalizedEmail }
    );
  }

  if (availability.usernameExists) {
    throw authError(
      "That username is already taken. Please choose another.",
      "username_exists",
      { identifier: normalizedUsername }
    );
  }

  try {
    const s = await client.authenticateEmail(
      normalizedEmail,
      password,
      true,
      normalizedUsername
    );
    session = s;
    saveSessionToStorage(s);
    disconnectSocket();
    return s;
  } catch (e) {
    const reason = await describeFetchError(e);
    const lowered = reason.toLowerCase();
    if (
      lowered.includes("username") &&
      (lowered.includes("already") || lowered.includes("exists") || lowered.includes("in use"))
    ) {
      throw authError("That username is already taken. Please choose another.", "username_exists");
    }
    if (
      lowered.includes("email") &&
      (lowered.includes("already") || lowered.includes("exists") || lowered.includes("in use"))
    ) {
      throw authError(
        "An account with this email already exists. Please sign in.",
        "email_exists",
        { identifier: normalizedEmail }
      );
    }
    throw new Error(`Sign up failed: ${reason}`);
  }
}

async function resolveIdentifierToEmail(identifier) {
  const normalized = String(identifier || "").trim().toLowerCase();
  if (!normalized) {
    throw new Error("Email or username is required.");
  }

  if (normalized.includes("@")) {
    return normalized;
  }

  let response;
  try {
    response = await rpcHttpKeyWithFallback("resolve_login_identifier", {
      identifier: normalized,
    });
  } catch (e) {
    const reason = await describeFetchError(e);
    const lowered = reason.toLowerCase();
    if (
      lowered.includes("http key invalid") ||
      lowered.includes("unauthorized") ||
      lowered.includes("401")
    ) {
      throw new Error(
        "Username sign in is unavailable due to server key mismatch. Please sign in with email for now."
      );
    }
    throw new Error(`Could not resolve username: ${reason}`);
  }
  const payload = parseRpcPayload(response?.payload);
  if (!payload || payload.error || !payload.email) {
    throw new Error("No account found for that username.");
  }
  return String(payload.email).trim().toLowerCase();
}

export async function signInWithIdentifier(identifier, password) {
  if (!password) {
    throw new Error("Password is required.");
  }

  try {
    const loginEmail = await resolveIdentifierToEmail(identifier);
    const s = await client.authenticateEmail(loginEmail, password, false);
    session = s;
    saveSessionToStorage(s);
    disconnectSocket();
    return s;
  } catch (e) {
    const reason = await describeFetchError(e);
    const lowered = reason.toLowerCase();
    if (
      lowered.includes("account_not_found") ||
      lowered.includes("not found") ||
      lowered.includes("no account found")
    ) {
      throw new Error("No account found for that email/username.");
    }
    if (
      lowered.includes("invalid") ||
      lowered.includes("password") ||
      lowered.includes("credentials")
    ) {
      throw new Error("Invalid credentials. Please check username/email and password.");
    }
    throw new Error(`Sign in failed: ${reason}`);
  }
}

export function logout() {
  disconnectSocket();
  session = null;
  clearSessionFromStorage();
}

export function disconnectRealtimeSocket() {
  disconnectSocket();
}

function isSocketOpen(candidate) {
  return Boolean(candidate?.adapter?.isOpen?.());
}

export function hasDisconnectedSocket() {
  return Boolean(socket) && !isSocketOpen(socket);
}

function isRetryableSocketFailure(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("websocket error") ||
    message.includes("websocket close") ||
    message.includes("connection refused") ||
    message.includes("failed to connect") ||
    message.includes("fetch failed") ||
    message.includes("networkerror") ||
    message.includes("closed") ||
    message.includes("timed out")
  );
}

async function connectSocket(candidate) {
  try {
    await candidate.connect(session, true);
    return candidate;
  } catch (e) {
    const reason = await describeFetchError(e);
    throw new Error(
      `Nakama WebSocket failed: ${reason}. Server at ${host}:${port}.`
    );
  }
}

export async function initNakama(options = {}) {
  const { forceReconnect = false, returnMeta = false } = options;

  await ensureSession();

  if (socket && !forceReconnect && isSocketOpen(socket)) {
    const result = { socket, reconnected: false, created: false };
    return returnMeta ? result : socket;
  }

  const hadExistingSocket = Boolean(socket);
  if (socket) {
    try {
      socket.disconnect(false);
    } catch {
      /* ignore */
    }
    socket = null;
  }

  const maxAttempts = forceReconnect ? 2 : 2;
  let connectedSocket = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const nextSocket = client.createSocket(useSSL);
    socket = nextSocket;

    try {
      await connectSocket(nextSocket);
      connectedSocket = nextSocket;
      break;
    } catch (e) {
      lastError = e;
      if (socket === nextSocket) {
        socket = null;
      }
      try {
        nextSocket.disconnect(false);
      } catch {
        /* ignore */
      }
      if (attempt >= maxAttempts || !isRetryableSocketFailure(e)) {
        throw e;
      }
      await delay(600);
    }
  }

  if (!connectedSocket) {
    throw lastError || new Error("Could not connect to Nakama WebSocket.");
  }

  const result = {
    socket: connectedSocket,
    reconnected: hadExistingSocket,
    created: !hadExistingSocket,
  };
  return returnMeta ? result : connectedSocket;
}

export async function rpc(id, payload = {}) {
  try {
    await ensureSession();
    const res = await client.rpc(session, id, payload);
    return res.payload !== undefined ? res.payload : {};
  } catch (e) {
    const reason = await describeFetchError(e);
    throw new Error(`Nakama RPC ${id} failed: ${reason}`);
  }
}

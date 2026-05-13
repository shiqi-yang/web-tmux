const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const { requireAuth, upgradeAuth, signToken } = require('./auth');
const { loadUsers, createUser, deleteUser, verifyPassword, initAdminIfNeeded } = require('./users');
const { listSessions, createSession, renameSession, killSession, attachPty, resizePty, onSessionChange } = require('./ptyManager');

const app = express();
app.use(express.json());

const SESSION_NAME_RE = /^[a-zA-Z0-9_.-]{1,40}$/;
function validSessionName(name) { return typeof name === 'string' && SESSION_NAME_RE.test(name); }
function validDimension(v) { return Number.isInteger(v) && v >= 1 && v <= 9999; }

// --- Static files (production) ---
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
}

// --- Auth ---
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const ok = await verifyPassword(username, password);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
  res.json({ token: signToken(username) });
});

// --- Sessions ---
app.get('/api/sessions', requireAuth, (req, res) => {
  res.json({ sessions: listSessions() });
});

app.post('/api/sessions', requireAuth, (req, res) => {
  const { name } = req.body || {};
  if (!validSessionName(name)) return res.status(400).json({ error: 'invalid session name (1-40 chars, a-z A-Z 0-9 _ . -)' });
  try {
    createSession(name);
    res.status(201).json({ name });
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});

app.patch('/api/sessions/:name', requireAuth, (req, res) => {
  const oldName = req.params.name;
  const { name: newName } = req.body || {};
  if (!validSessionName(oldName) || !validSessionName(newName)) {
    return res.status(400).json({ error: 'invalid session name' });
  }
  try {
    renameSession(oldName, newName);
    res.json({ name: newName });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.delete('/api/sessions/:name', requireAuth, (req, res) => {
  try {
    killSession(req.params.name);
    res.status(204).end();
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// --- Users ---
app.get('/api/users', requireAuth, (req, res) => {
  const users = loadUsers().map(({ username, createdAt }) => ({ username, createdAt }));
  res.json({ users });
});

app.post('/api/users', requireAuth, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    await createUser(username, password);
    res.status(201).json({ username });
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});

app.delete('/api/users/:username', requireAuth, (req, res) => {
  if (req.params.username === req.user.username) {
    return res.status(403).json({ error: 'Cannot delete yourself' });
  }
  try {
    deleteUser(req.params.username);
    res.status(204).end();
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// --- HTTP + WS server ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// Ping all clients every 30s; terminate if no pong received since last ping
const PING_INTERVAL = 30_000;
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL);

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => {
    const user = upgradeAuth(req);
    if (!user) {
      ws.close(4001, 'Unauthorized');
      return;
    }
    wss.emit('connection', ws, req, user);
  });
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let currentPty = null;
  let currentSession = null;

  // Push current session list immediately
  const sendSessions = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'sessions', list: listSessions() }));
    }
  };
  sendSessions();
  const removeCb = onSessionChange(sendSessions);

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      currentPty?.write(data.toString());
      return;
    }

    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'attach') {
      if (!validSessionName(msg.sessionName)) return;
      // Detach previous pty if any
      if (currentPty) { try { currentPty.kill(); } catch {} }

      currentSession = msg.sessionName;
      const attachedSession = msg.sessionName;
      currentPty = attachPty(
        msg.sessionName,
        chunk => {
          if (ws.readyState === WebSocket.OPEN) ws.send(Buffer.from(chunk), { binary: true });
        },
        () => {
          if (currentSession !== attachedSession) return;
          currentPty = null;
          currentSession = null;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'detached' }));
          }
        },
        msg.cols,
        msg.rows
      );

      if (!currentPty) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
        return;
      }
      ws.send(JSON.stringify({ type: 'attached', sessionName: msg.sessionName }));
    }

    if (msg.type === 'resize' && currentPty && currentSession) {
      const cols = Math.trunc(Number(msg.cols));
      const rows = Math.trunc(Number(msg.rows));
      if (validDimension(cols) && validDimension(rows)) {
        resizePty(currentPty, currentSession, cols, rows);
      }
    }
  });

  ws.on('close', () => {
    removeCb();
    if (currentPty) { try { currentPty.kill(); } catch {} }
  });
});

const PORT = process.env.PORT || 3000;
initAdminIfNeeded().then(() => {
  server.listen(PORT, '127.0.0.1', () => console.log(`Server running on 127.0.0.1:${PORT}`));
});

const pty = require('node-pty');
const { execSync, exec } = require('child_process');

// sessionName -> Set<pty instance>
const sessionPtys = new Map();

// Callbacks registered by the WS layer to broadcast session list updates
const onChangeCallbacks = new Set();

function onSessionChange(cb) {
  onChangeCallbacks.add(cb);
  return () => onChangeCallbacks.delete(cb);
}

function broadcastChange() {
  onChangeCallbacks.forEach(cb => cb());
}

function listSessions() {
  try {
    const out = execSync('tmux list-sessions -F "#{session_name}\t#{session_windows}\t#{session_created_string}"', {
      encoding: 'utf8',
    }).trim();
    if (!out) return [];
    return out.split('\n').map(line => {
      const [name, windows, created] = line.split('\t');
      return { name, windows: Number(windows), created };
    });
  } catch {
    return [];
  }
}

function hasSession(name) {
  try {
    execSync(`tmux has-session -t ${JSON.stringify(name)}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function createSession(name) {
  if (hasSession(name)) throw new Error('Session already exists');
  execSync(`tmux new-session -d -s ${JSON.stringify(name)}`);
  broadcastChange();
}

function killSession(name) {
  if (!hasSession(name)) throw new Error('Session not found');
  const ptys = sessionPtys.get(name);
  if (ptys) {
    ptys.forEach(p => { try { p.kill(); } catch {} });
    sessionPtys.delete(name);
  }
  execSync(`tmux kill-session -t ${JSON.stringify(name)}`);
  broadcastChange();
}

function attachPty(sessionName, onData, onExit, cols = 220, rows = 50) {
  if (!hasSession(sessionName)) return null;

  const p = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
    name: 'xterm-256color',
    cols,
    rows,
    env: process.env,
  });

  if (!sessionPtys.has(sessionName)) sessionPtys.set(sessionName, new Set());
  sessionPtys.get(sessionName).add(p);

  p.onData(onData);
  p.onExit(() => {
    sessionPtys.get(sessionName)?.delete(p);
    broadcastChange();
    onExit();
  });

  return p;
}

function resizePty(p, sessionName, cols, rows) {
  try { p.resize(cols, rows); } catch {}
  exec(`tmux resize-window -t ${JSON.stringify(sessionName)} -x ${cols} -y ${rows}`);
}

module.exports = { listSessions, createSession, killSession, attachPty, resizePty, onSessionChange };

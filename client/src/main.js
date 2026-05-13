import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const token = localStorage.getItem('token');
if (!token) location.href = '/login.html';

// --- Terminal setup ---
const term = new Terminal({ cursorBlink: true, theme: { background: '#0f172a' } });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();

new ResizeObserver(() => { fitAddon.fit(); sendResize(); }).observe(document.getElementById('terminal-wrap'));

// --- Mobile: virtual keyboard via xterm's internal textarea ---
document.getElementById('terminal').addEventListener('touchend', () => {
  term.textarea?.focus();
}, { passive: true });

// --- Mobile: sidebar drawer toggle ---
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('open'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('open'); }
document.getElementById('menu-btn').addEventListener('click', openSidebar);
overlay.addEventListener('click', closeSidebar);

// --- State ---
let ws = null;
let currentSession = null;
let reconnectDelay = 1000;

// --- WebSocket ---
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    reconnectDelay = 1000;
    // Re-attach to last session after reconnect
    if (currentSession) {
      ws.send(JSON.stringify({ type: 'attach', sessionName: currentSession }));
    }
  };

  ws.onmessage = ({ data }) => {
    if (data instanceof ArrayBuffer) {
      term.write(new Uint8Array(data));
      return;
    }
    const msg = JSON.parse(data);
    if (msg.type === 'sessions') renderSessions(msg.list);
    if (msg.type === 'attached') {
      currentSession = msg.sessionName;
      document.getElementById('session-label').textContent = msg.sessionName;
      document.getElementById('send-btn').disabled = false;
      sendResize();
    }
    if (msg.type === 'error') term.writeln(`\r\n\x1b[31mError: ${msg.message}\x1b[0m`);
  };

  ws.onclose = () => {
    term.writeln(`\r\n\x1b[33m[disconnected, retrying in ${reconnectDelay / 1000}s…]\x1b[0m`);
    setTimeout(connectWS, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  };
}

connectWS();

// --- Terminal input ---
term.onData(data => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(new TextEncoder().encode(data));
  }
});

function sendResize() {
  if (ws?.readyState === WebSocket.OPEN && currentSession) {
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  }
}

term.onResize(() => sendResize());

// --- Session list ---
function renderSessions(list) {
  const container = document.getElementById('session-list');
  container.innerHTML = '';
  list.forEach(({ name }) => {
    const item = document.createElement('div');
    item.className = 'session-item' + (name === currentSession ? ' active' : '');

    const nameEl = document.createElement('span');
    nameEl.className = 'session-name';
    nameEl.textContent = name;
    nameEl.title = name;

    const killBtn = document.createElement('span');
    killBtn.className = 'session-kill';
    killBtn.textContent = '✕';
    killBtn.title = '关闭 session';
    killBtn.addEventListener('click', async e => {
      e.stopPropagation();
      await apiDel(`/api/sessions/${encodeURIComponent(name)}`);
    });

    item.appendChild(nameEl);
    item.appendChild(killBtn);
    item.addEventListener('click', () => attach(name));
    container.appendChild(item);
  });
}

function attach(name) {
  if (ws?.readyState === WebSocket.OPEN) {
    term.clear();
    ws.send(JSON.stringify({ type: 'attach', sessionName: name, cols: term.cols, rows: term.rows }));
    closeSidebar();
  }
}

// --- Create session ---
document.getElementById('create-btn').addEventListener('click', createSession);
document.getElementById('new-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') createSession();
});

async function createSession() {
  const input = document.getElementById('new-name');
  const name = input.value.trim();
  if (!name) return;
  const res = await apiPost('/api/sessions', { name });
  if (res.ok) {
    input.value = '';
    attach(name);
  }
}

// --- Input bar ---
const cmdInput = document.getElementById('cmd-input');
const sendBtn = document.getElementById('send-btn');
const appendEnter = document.getElementById('append-enter');

function sendCommand() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !currentSession) return;
  const text = cmdInput.value;
  if (!text && !appendEnter.checked) return;
  const payload = appendEnter.checked ? text + '\r' : text;
  ws.send(new TextEncoder().encode(payload));
  cmdInput.value = '';
  cmdInput.focus();
}

sendBtn.addEventListener('click', sendCommand);
cmdInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); sendCommand(); }
});

// --- Logout ---
document.getElementById('logout').addEventListener('click', () => {
  localStorage.removeItem('token');
  location.href = '/login.html';
});

// --- API helpers ---
async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { localStorage.removeItem('token'); location.href = '/login.html'; }
  return res;
}

async function apiDel(url) {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) { localStorage.removeItem('token'); location.href = '/login.html'; }
  return res;
}

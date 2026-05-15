import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const token = localStorage.getItem('token');
if (!token) location.href = '/login.html';

// --- Font size ---
const FONT_MIN = 8, FONT_MAX = 32, FONT_DEFAULT = 14;
function loadFontSize() {
  const v = parseInt(localStorage.getItem('fontSize'), 10);
  return (v >= FONT_MIN && v <= FONT_MAX) ? v : FONT_DEFAULT;
}

// --- Terminal setup ---
const term = new Terminal({ cursorBlink: true, fontSize: loadFontSize(), theme: { background: '#0f172a' } });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();

new ResizeObserver(() => { fitAddon.fit(); sendResize(); }).observe(document.getElementById('terminal-wrap'));

// Declared early so focusInput() can reference it before the toggle block below
let passthroughEnabled = localStorage.getItem('passthrough') !== '0';

function focusInput() {
  if (passthroughEnabled) { term.focus(); } else { document.getElementById('cmd-input').focus(); }
}

// Default focus on load
focusInput();

// Clicking outside input/key bar returns focus to input
document.addEventListener('click', e => {
  if (!e.target.closest('#input-bar, #key-bar, #sidebar, .modal-overlay')) focusInput();
});

// --- Mobile: virtual keyboard via xterm's internal textarea ---
document.getElementById('terminal').addEventListener('touchend', () => {
  term.textarea?.focus();
}, { passive: true });

// --- Desktop: sidebar collapse toggle ---
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
function applySidebarCollapsed(collapsed) {
  document.getElementById('sidebar').classList.toggle('collapsed', collapsed);
  sidebarToggleBtn.textContent = collapsed ? '›' : '‹';
}
applySidebarCollapsed(localStorage.getItem('sidebarCollapsed') === '1');
sidebarToggleBtn.addEventListener('click', () => {
  const next = !document.getElementById('sidebar').classList.contains('collapsed');
  localStorage.setItem('sidebarCollapsed', next ? '1' : '0');
  applySidebarCollapsed(next);
  fitAddon.fit();
  sendResize();
});

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
let pendingAttach = null;

// --- Passthrough toggle ---
const passthroughBtn = document.getElementById('passthrough-btn');
function updateInputBar() {
  document.getElementById('input-bar').style.display = passthroughEnabled ? 'none' : '';
  if (!passthroughEnabled) {
    document.getElementById('send-btn').disabled = !currentSession;
  }
  focusInput();
}

function applyPassthrough(enabled) {
  passthroughEnabled = enabled;
  localStorage.setItem('passthrough', enabled ? '1' : '0');
  passthroughBtn.classList.toggle('active', enabled);
  passthroughBtn.title = enabled ? '键盘透传：开（点击关闭）' : '键盘透传：关（点击开启）';
  updateInputBar();
}
applyPassthrough(passthroughEnabled);
passthroughBtn.addEventListener('click', () => applyPassthrough(!passthroughEnabled));

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
    if (msg.type === 'sessions') {
      renderSessions(msg.list);
      if (!currentSession && !pendingAttach && msg.list.length > 0) {
        const def = getDefaultSession();
        const target = (def && msg.list.find(s => s.name === def))
          ? def
          : msg.list[0].name;
        pendingAttach = target;
        attach(target);
      }
    }
    if (msg.type === 'attached') {
      pendingAttach = null;
      currentSession = msg.sessionName;
      document.getElementById('session-label').textContent = msg.sessionName;
      updateInputBar();
      sendResize();
    }
    if (msg.type === 'detached') {
      currentSession = null;
      pendingAttach = null;
      document.getElementById('session-label').textContent = '未连接';
      updateInputBar();
    }
    if (msg.type === 'error') {
      pendingAttach = null;
      term.writeln(`\r\n\x1b[31mError: ${msg.message}\x1b[0m`);
    }
  };

  ws.onclose = (event) => {
    if (event.code === 4001) {
      localStorage.removeItem('token');
      location.href = '/login.html';
      return;
    }
    term.writeln(`\r\n\x1b[33m[disconnected, retrying in ${reconnectDelay / 1000}s…]\x1b[0m`);
    setTimeout(connectWS, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  };
}

connectWS();

// --- Terminal input ---
term.onData(data => {
  if (passthroughEnabled && ws?.readyState === WebSocket.OPEN) {
    ws.send(new TextEncoder().encode(data));
  }
});

function sendResize() {
  if (ws?.readyState === WebSocket.OPEN && currentSession) {
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  }
}

term.onResize(() => sendResize());

// --- Default session ---
function getDefaultSession() { return localStorage.getItem('defaultSession'); }
function setDefaultSession(name) { localStorage.setItem('defaultSession', name); }
function clearDefaultSession() { localStorage.removeItem('defaultSession'); }

// --- Session list ---
function renderSessions(list) {
  const container = document.getElementById('session-list');
  const defaultSession = getDefaultSession();
  container.innerHTML = '';
  list.forEach(({ name }) => {
    const item = document.createElement('div');
    item.className = 'session-item' + (name === currentSession ? ' active' : '');

    const nameEl = document.createElement('span');
    nameEl.className = 'session-name';
    nameEl.textContent = name;
    nameEl.title = name;

    const pinBtn = document.createElement('span');
    const isPinned = name === defaultSession;
    pinBtn.className = 'session-pin' + (isPinned ? ' pinned' : '');
    pinBtn.textContent = '★';
    pinBtn.title = isPinned ? '取消默认' : '设为默认';
    pinBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (isPinned) { clearDefaultSession(); } else { setDefaultSession(name); }
      renderSessions(list);
    });

    const renameBtn = document.createElement('span');
    renameBtn.className = 'session-rename';
    renameBtn.textContent = '✎';
    renameBtn.title = '重命名';
    renameBtn.addEventListener('click', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.className = 'session-rename-input';
      input.value = name;
      input.maxLength = 40;
      input.autocomplete = 'off';
      input.addEventListener('click', e => e.stopPropagation());
      nameEl.replaceWith(input);
      input.focus();
      input.select();

      let saved = false;
      async function save() {
        if (saved) return;
        saved = true;
        const newName = input.value.trim();
        if (!newName || newName === name) { input.replaceWith(nameEl); return; }
        const res = await apiPatch(`/api/sessions/${encodeURIComponent(name)}`, { name: newName });
        if (!res.ok) { input.replaceWith(nameEl); return; }
        if (currentSession === name) {
          currentSession = newName;
          document.getElementById('session-label').textContent = newName;
        }
        if (getDefaultSession() === name) setDefaultSession(newName);
      }
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { saved = true; input.replaceWith(nameEl); }
      });
      input.addEventListener('blur', save);
    });

    const killBtn = document.createElement('span');
    killBtn.className = 'session-kill';
    killBtn.textContent = '✕';
    killBtn.title = '关闭 session';
    killBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (name === getDefaultSession()) clearDefaultSession();
      await apiDel(`/api/sessions/${encodeURIComponent(name)}`);
    });

    item.appendChild(pinBtn);
    item.appendChild(nameEl);
    item.appendChild(renameBtn);
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

// --- Custom shortcuts ---
function loadShortcuts() {
  try { return JSON.parse(localStorage.getItem('customShortcuts') || '[]'); } catch { return []; }
}
function saveShortcuts(list) { localStorage.setItem('customShortcuts', JSON.stringify(list)); }

function renderCustomShortcuts() {
  document.querySelectorAll('#key-bar .custom-btn').forEach(el => el.remove());
  const addBtn = document.getElementById('add-shortcut-btn');
  const shortcuts = loadShortcuts();
  shortcuts.forEach((sc, idx) => {
    const btn = document.createElement('button');
    btn.className = 'custom-btn';
    btn.textContent = sc.label;
    btn.title = sc.cmd + (sc.enter ? ' ↵' : '');

    let pressTimer = null;
    btn.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(() => {
        btn.classList.add('deleting');
        pressTimer = null;
      }, 600);
    });
    btn.addEventListener('pointerup', () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
        // Short tap: send command
        if (ws?.readyState === WebSocket.OPEN && currentSession) {
          const payload = sc.enter ? sc.cmd + '\r' : sc.cmd;
          ws.send(new TextEncoder().encode(payload));
        }
      } else if (btn.classList.contains('deleting')) {
        // Long press released: delete
        const list = loadShortcuts();
        list.splice(idx, 1);
        saveShortcuts(list);
        renderCustomShortcuts();
      }
    });
    btn.addEventListener('pointerleave', () => {
      if (pressTimer !== null) { clearTimeout(pressTimer); pressTimer = null; }
      btn.classList.remove('deleting');
    });

    addBtn.before(btn);
  });
}

// --- Key bar wrap toggle ---
const keyBar = document.getElementById('key-bar');
function applyWrap(multiline) {
  keyBar.classList.toggle('multiline', multiline);
  document.getElementById('wrap-toggle-btn').textContent = multiline ? '—' : '≡';
}
applyWrap(localStorage.getItem('keyBarWrap') === '1');
document.getElementById('wrap-toggle-btn').addEventListener('click', () => {
  const next = !keyBar.classList.contains('multiline');
  localStorage.setItem('keyBarWrap', next ? '1' : '0');
  applyWrap(next);
});

// Modal logic
const modal = document.getElementById('shortcut-modal');
document.getElementById('add-shortcut-btn').addEventListener('click', () => {
  document.getElementById('sc-label').value = '';
  document.getElementById('sc-cmd').value = '';
  document.getElementById('sc-enter').checked = true;
  modal.classList.remove('hidden');
  document.getElementById('sc-label').focus();
});
document.getElementById('sc-cancel').addEventListener('click', () => modal.classList.add('hidden'));
document.getElementById('sc-save').addEventListener('click', () => {
  const label = document.getElementById('sc-label').value.trim();
  const cmd = document.getElementById('sc-cmd').value;
  if (!label || !cmd) return;
  const list = loadShortcuts();
  list.push({ label, cmd, enter: document.getElementById('sc-enter').checked });
  saveShortcuts(list);
  renderCustomShortcuts();
  modal.classList.add('hidden');
});
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

renderCustomShortcuts();

// --- Mobile key bar ---
const escMap = { '\\x1b': '\x1b', '\\x02': '\x02', '\\x03': '\x03', '\\x04': '\x04', '\\x1a': '\x1a',
  '\\x0c': '\x0c', '\\x01': '\x01', '\\x05': '\x05', '\\x15': '\x15',
  '\\x1b[A': '\x1b[A', '\\x1b[B': '\x1b[B', '\\x1b[C': '\x1b[C', '\\x1b[D': '\x1b[D',
  '\\x1b[5~': '\x1b[5~', '\\x1b[6~': '\x1b[6~',
  '\\t': '\t' };

document.getElementById('key-bar').addEventListener('click', e => {
  const btn = e.target.closest('button[data-seq]');
  if (!btn || !ws || ws.readyState !== WebSocket.OPEN || !currentSession) return;
  const seq = escMap[btn.dataset.seq] ?? btn.dataset.seq;
  ws.send(new TextEncoder().encode(seq));
});

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

function keyToSequence(e) {
  // Ctrl+letter → control characters (Ctrl+C = \x03, Ctrl+D = \x04, etc.)
  if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
    const code = e.key.toLowerCase().charCodeAt(0) - 96;
    if (code >= 1 && code <= 26) return String.fromCharCode(code);
  }
  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    switch (e.key) {
      case 'ArrowUp':    return '\x1b[A';
      case 'ArrowDown':  return '\x1b[B';
      case 'ArrowRight': return '\x1b[C';
      case 'ArrowLeft':  return '\x1b[D';
      case 'Home':       return '\x1b[H';
      case 'End':        return '\x1b[F';
      case 'PageUp':     return '\x1b[5~';
      case 'PageDown':   return '\x1b[6~';
      case 'Delete':     return '\x1b[3~';
      case 'Tab':        return '\t';
      case 'Escape':     return '\x1b';
    }
  }
  return null;
}

sendBtn.addEventListener('click', sendCommand);
cmdInput.addEventListener('keydown', e => {
  if (e.isComposing) return;
  if (e.key === 'Enter') { e.preventDefault(); sendCommand(); return; }

  if (e.key === 'Backspace' && cmdInput.value === '') {
    e.preventDefault();
    if (ws?.readyState === WebSocket.OPEN && currentSession) {
      ws.send(new TextEncoder().encode('\x7f'));
    }
    return;
  }

  // Left/right only go to terminal when input is empty; otherwise move cursor in input
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && cmdInput.value !== '') return;

  const seq = keyToSequence(e);
  if (seq !== null && passthroughEnabled) {
    e.preventDefault();
    if (ws?.readyState === WebSocket.OPEN && currentSession) {
      ws.send(new TextEncoder().encode(seq));
    }
  }
});

// --- Font size controls ---
function applyFontSize(size) {
  term.options.fontSize = size;
  localStorage.setItem('fontSize', size);
  document.getElementById('font-size-label').textContent = size;
  fitAddon.fit();
  sendResize();
}

applyFontSize(loadFontSize());

document.getElementById('font-dec').addEventListener('click', () => {
  applyFontSize(Math.max(FONT_MIN, term.options.fontSize - 1));
});
document.getElementById('font-inc').addEventListener('click', () => {
  applyFontSize(Math.min(FONT_MAX, term.options.fontSize + 1));
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

async function apiPatch(url, body) {
  const res = await fetch(url, {
    method: 'PATCH',
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

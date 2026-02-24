const sendBtn         = document.getElementById('sendBtn');
const clearBtn        = document.getElementById('clearBtn');
const newChatBtn      = document.getElementById('newChatBtn');
const userInput       = document.getElementById('userInput');
const chatBox         = document.getElementById('chatBox');
const statusDot       = document.getElementById('statusDot');
const statusText      = document.getElementById('statusText');
const sessionList     = document.getElementById('sessionList');
const deleteModal     = document.getElementById('deleteModal');
const modalCancel     = document.getElementById('modalCancel');
const modalConfirm    = document.getElementById('modalConfirm');
const hamburgerBtn    = document.getElementById('hamburgerBtn');
const backBtn         = document.getElementById('backBtn');
const sidebar         = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');

// ── Mobile sidebar helpers ────────────────────────────────────────────────────
function isMobile() { return window.innerWidth <= 640; }
function openSidebar()  { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show'); }

function updateMobileNav() {
  if (!isMobile()) return;
  if (activeSessionId || chatBox.children.length > 0) {
    backBtn.classList.add('show');
    hamburgerBtn.classList.add('hidden');
  } else {
    backBtn.classList.remove('show');
    hamburgerBtn.classList.remove('hidden');
  }
}

hamburgerBtn.addEventListener('click', openSidebar);
sidebarBackdrop.addEventListener('click', closeSidebar);
backBtn.addEventListener('click', openSidebar);
window.addEventListener('resize', updateMobileNav);

// ── Custom confirm modal ──────────────────────────────────────────────────────
function showDeleteModal() {
  return new Promise((resolve) => {
    deleteModal.classList.add('show');
    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel  = () => { cleanup(); resolve(false); };
    const onOverlay = (e) => { if (e.target === deleteModal) { cleanup(); resolve(false); } };
    function cleanup() {
      deleteModal.classList.remove('show');
      modalConfirm.removeEventListener('click', onConfirm);
      modalCancel.removeEventListener('click', onCancel);
      deleteModal.removeEventListener('click', onOverlay);
    }
    modalConfirm.addEventListener('click', onConfirm);
    modalCancel.addEventListener('click', onCancel);
    deleteModal.addEventListener('click', onOverlay);
  });
}

// ── Status ────────────────────────────────────────────────────────────────────
function setStatus(online = true) {
  if (online) {
    statusDot.classList.replace('offline', 'online');
    statusText.innerText = 'Connected';
  } else {
    statusDot.classList.replace('online', 'offline');
    statusText.innerText = 'Disconnected';
  }
}
setStatus(true);

// ── LocalStorage session management ──────────────────────────────────────────
let activeSessionId = null;
let currentHistory  = [];   // [{role, content}] sent to server

function getSessions() {
  return JSON.parse(localStorage.getItem('sessions') || '[]');
}
function saveSession(sid, title, messages) {
  const sessions = getSessions().filter(s => s.id !== sid);
  sessions.unshift({ id: sid, title, created_at: new Date().toISOString(), messages });
  localStorage.setItem('sessions', JSON.stringify(sessions));
}
function deleteSessionLS(sid) {
  const sessions = getSessions().filter(s => s.id !== sid);
  localStorage.setItem('sessions', JSON.stringify(sessions));
}
function genId() { return Math.random().toString(36).slice(2, 10); }

// ── Message helpers ───────────────────────────────────────────────────────────
function appendMessage(kind, text = '') {
  const d = document.createElement('div');
  d.className = `msg ${kind}`;
  const contentSpan = document.createElement('span');
  contentSpan.className = 'msg-content';
  contentSpan.innerText = text;
  const meta = document.createElement('span');
  meta.className = 'meta';
  const t = new Date();
  meta.innerText = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
  d.appendChild(contentSpan);
  d.appendChild(meta);
  chatBox.appendChild(d);
  chatBox.scrollTop = chatBox.scrollHeight;
  return contentSpan;
}

function showTyping() {
  const t = document.createElement('div');
  t.className = 'typing'; t.id = '__typing';
  t.innerHTML = '<span class="dotx"></span><span class="dotx"></span><span class="dotx"></span>';
  chatBox.appendChild(t);
  chatBox.scrollTop = chatBox.scrollHeight;
  return t;
}

// ── Session sidebar ───────────────────────────────────────────────────────────
function loadSessionList() {
  const sessions = getSessions();
  sessionList.innerHTML = '';
  sessions.forEach(s => {
    const el = document.createElement('div');
    el.className = 'session-item' + (s.id === activeSessionId ? ' active' : '');

    const date = new Date(s.created_at);
    const dateStr = isNaN(date) ? '' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

    const info = document.createElement('div');
    info.className = 'session-info';
    info.innerHTML = `<span>${s.title || 'Untitled'}</span><span class="session-date">${dateStr}</span>`;
    info.addEventListener('click', () => openSession(s.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'session-del';
    delBtn.title = 'Delete';
    delBtn.innerText = '×';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await showDeleteModal();
      if (!confirmed) return;
      deleteSessionLS(s.id);
      if (activeSessionId === s.id) {
        activeSessionId = null;
        currentHistory = [];
        chatBox.innerHTML = '';
        updateMobileNav();
      }
      loadSessionList();
    });

    el.appendChild(info);
    el.appendChild(delBtn);
    sessionList.appendChild(el);
  });
}

function openSession(sid) {
  const sessions = getSessions();
  const s = sessions.find(x => x.id === sid);
  if (!s) return;
  activeSessionId = sid;
  currentHistory = s.messages.slice(); // restore history
  chatBox.innerHTML = '';
  s.messages.forEach(m => appendMessage(m.role === 'user' ? 'user' : 'bot', m.content));
  if (isMobile()) closeSidebar();
  updateMobileNav();
  loadSessionList();
}

// ── Send message ──────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // Start new session if none
  if (!activeSessionId) {
    activeSessionId = genId();
    currentHistory = [];
  }

  appendMessage('user', text);
  userInput.value = '';
  userInput.focus();
  sendBtn.disabled = true;

  const typingEl = showTyping();

  try {
    const res = await fetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, history: currentHistory })
    });

    const json = await res.json();
    typingEl.remove();

    const reply = json?.response ?? 'No response';
    appendMessage('bot', reply);

    // Update history
    currentHistory.push({ role: 'user', content: text });
    currentHistory.push({ role: 'assistant', content: reply });

    // Save to localStorage
    const title = currentHistory[0].content.slice(0, 40);
    saveSession(activeSessionId, title, currentHistory);
    updateMobileNav();
    loadSessionList();

  } catch (err) {
    typingEl.remove();
    appendMessage('bot', 'Network / Server error');
    setStatus(false);
    console.error(err);
  }

  sendBtn.disabled = false;
}

// ── New chat ──────────────────────────────────────────────────────────────────
function startNewChat() {
  activeSessionId = null;
  currentHistory = [];
  chatBox.innerHTML = '';
  if (isMobile()) closeSidebar();
  updateMobileNav();
  userInput.focus();
  loadSessionList();
}

// ── Clear ─────────────────────────────────────────────────────────────────────
function clearChat() {
  activeSessionId = null;
  currentHistory = [];
  chatBox.innerHTML = '';
  updateMobileNav();
  userInput.focus();
  loadSessionList();
}

// ── Events ────────────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);
newChatBtn.addEventListener('click', startNewChat);
clearBtn.addEventListener('click', clearChat);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// Load sessions on startup
loadSessionList();

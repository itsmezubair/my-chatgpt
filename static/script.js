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

function openSidebar() {
  sidebar.classList.add('open');
  sidebarBackdrop.classList.add('show');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarBackdrop.classList.remove('show');
}

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
backBtn.addEventListener('click', () => {
  openSidebar();
});

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

let activeSessionId = null;

// ── Status ───────────────────────────────────────────────────────────────────
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
  t.className = 'typing';
  t.id = '__typing';
  t.innerHTML = '<span class="dotx"></span><span class="dotx"></span><span class="dotx"></span>';
  chatBox.appendChild(t);
  chatBox.scrollTop = chatBox.scrollHeight;
  return t;
}

// ── Session sidebar ───────────────────────────────────────────────────────────
async function loadSessionList() {
  const res = await fetch('/sessions');
  const sessions = await res.json();
  sessionList.innerHTML = '';
  sessions.forEach(s => {
    const el = document.createElement('div');
    el.className = 'session-item' + (s.id === activeSessionId ? ' active' : '');
    el.dataset.id = s.id;

    const date = new Date(s.created_at);
    const dateStr = isNaN(date) ? '' : date.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });

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
      await fetch(`/session/${s.id}`, { method: 'DELETE' });
      if (activeSessionId === s.id) {
        activeSessionId = null;
        chatBox.innerHTML = '';
      }
      loadSessionList();
    });

    el.appendChild(info);
    el.appendChild(delBtn);
    sessionList.appendChild(el);
  });
}

async function openSession(sid) {
  const res = await fetch(`/session/${sid}`);
  const data = await res.json();
  activeSessionId = sid;
  chatBox.innerHTML = '';

  data.messages.forEach(m => {
    appendMessage(m.role === 'user' ? 'user' : 'bot', m.content);
  });

  if (isMobile()) closeSidebar();
  updateMobileNav();
  loadSessionList();
}

// ── Send message ──────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  appendMessage('user', text);
  userInput.value = '';
  userInput.focus();
  sendBtn.disabled = true;

  const typingEl = showTyping();

  try {
    const res = await fetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text })
    });

    typingEl.remove();
    const botContent = appendMessage('bot', '');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = JSON.parse(line.slice(6));
        if (json.chunk) {
          botContent.innerText += json.chunk;
          chatBox.scrollTop = chatBox.scrollHeight;
        }
        if (json.done) {
          activeSessionId = json.session_id;
          updateMobileNav();
          loadSessionList();
        }
      }
    }

  } catch (err) {
    typingEl.remove();
    appendMessage('bot', 'Network / Server error');
    setStatus(false);
    console.error(err);
  }

  sendBtn.disabled = false;
}

// ── New chat ──────────────────────────────────────────────────────────────────
async function startNewChat() {
  await fetch('/new', { method: 'POST' });
  activeSessionId = null;
  chatBox.innerHTML = '';
  if (isMobile()) closeSidebar();
  updateMobileNav();
  userInput.focus();
  loadSessionList();
}

// ── Clear (new chat alias) ────────────────────────────────────────────────────
async function clearChat() {
  await fetch('/clear', { method: 'POST' });
  activeSessionId = null;
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

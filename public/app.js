'use strict';

marked.setOptions({ breaks: true, gfm: true });

// ── State ──────────────────────────────────────────────────────
const APP = {
  messages:  [],
  streaming: false,
  abort:     null,
  model:     '',
  file:      null,
  calcData:  null,
};

// ── DOM ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const EL = {
  sidebar:        $('sidebar'),
  overlay:        $('overlay'),
  menuBtn:        $('menuBtn'),
  sidebarToggle:  $('sidebarToggle'),
  sidebarClose:   $('sidebarClose'),
  modelSelect:    $('modelSelect'),
  refreshModels:  $('refreshModels'),
  refreshIcon:    $('refreshIcon'),
  statusDot:      $('statusDot'),
  statusText:     $('statusText'),
  newChatBtn:     $('newChatBtn'),
  historyList:    $('historyList'),
  exportPdf:      $('exportPdf'),
  exportExcel:    $('exportExcel'),
  clientName:     $('clientNameInput'),
  clearBtn:       $('clearBtn'),
  deadlineTicker: $('deadlineTicker'),
  chatWin:        $('chatWin'),
  welcome:        $('welcome'),
  ollamaNotice:   $('ollamaNotice'),
  msgs:           $('msgs'),
  inputBox:       $('inputBox'),
  sendBtn:        $('sendBtn'),
  stopBtn:        $('stopBtn'),
  fileInput:      $('fileInput'),
  fileStrip:      $('fileStrip'),
  fileChipName:   $('fileChipName'),
  fileRemove:     $('fileRemove'),
  uploadOverlay:  $('uploadOverlay'),
  toast:          $('toast'),
  calcBtn:        $('calcBtn'),
  calcModal:      $('calcModal'),
  calcModalClose: $('calcModalClose'),
  calcIncome:     $('calcIncome'),
  calcRegime:     $('calcRegime'),
  calcDeductions: $('calcDeductions'),
  deductionGroup: $('deductionGroup'),
  calcSubmit:     $('calcSubmit'),
  calcResult:     $('calcResult'),
  calcRows:       $('calcRows'),
  calcSendChat:   $('calcSendChat'),
  apiSetupBanner: $('apiSetupBanner'),
};

// ── Boot ──────────────────────────────────────────────────────
(async () => {
  renderDeadlines();
  renderHistory();
  bindEvents();
  EL.exportPdf.disabled   = true;
  EL.exportExcel.disabled = true;
  await checkHealth();
  await loadModels();
  
  // Hide splash screen
  const splash = document.getElementById('splashScreen');
  if (splash) {
    const status = document.getElementById('splashStatus');
    if (status) status.textContent = 'System Ready.';
    setTimeout(() => {
      splash.classList.add('gone');
      setTimeout(() => splash.remove(), 500);
    }, 400);
  }
  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed:', err));
  }
})();

// ══════════════════════════════════════════════════════════════
// HEALTH & MODELS
// ══════════════════════════════════════════════════════════════
async function checkHealth() {
  setStatus('checking');
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(12000) });
    const d = await r.json();
    if (d.status === 'ok') {
      let provLabel = d.provider === 'openrouter' ? 'OpenRouter Cloud ⚡' : 'Ollama Local 🤖';
      setStatus('online', provLabel);
      if (EL.ollamaNotice) EL.ollamaNotice.style.display = 'none';
      if (EL.apiSetupBanner) EL.apiSetupBanner.style.display = 'none';
      return true;
    }
    const msg = d.message || 'No AI engine available';
    setStatus('offline');
    if (EL.ollamaNotice) EL.ollamaNotice.style.display = '';
    if (EL.apiSetupBanner) {
      const errEl = EL.apiSetupBanner.querySelector('.em');
      if (errEl) errEl.textContent = msg;
      EL.apiSetupBanner.style.display = '';
    }
    return false;
  } catch {
    setStatus('offline');
    if (EL.ollamaNotice) EL.ollamaNotice.style.display = '';
    return false;
  }
}

function setStatus(state, label) {
  const dot = EL.statusDot;
  const txt = EL.statusText;
  dot.className = 'dot';
  if (state === 'online')   { dot.classList.add('on');   txt.textContent = label || 'Online'; }
  if (state === 'offline')  { dot.classList.add('off');  txt.textContent = label || 'Offline'; }
  if (state === 'checking') { dot.classList.add('wait'); txt.textContent = 'Checking…'; }
}

async function loadModels() {
  EL.modelSelect.innerHTML = '<option value="">Loading…</option>';
  try {
    const r    = await fetch('/api/models', { signal: AbortSignal.timeout(10000) });
    const data = await r.json();

    if (data.error || !data.models?.length) {
      EL.modelSelect.innerHTML = '<option value="">No LLM available</option>';
      if (EL.apiSetupBanner) {
        const errEl = EL.apiSetupBanner.querySelector('.setup-err');
        if (errEl) errEl.textContent = data.error || 'No AI model found';
        EL.apiSetupBanner.style.display = '';
      }
      const toastMsg = data.keyInvalid
        ? '❌ API key is invalid — enter a new key below'
        : '⚠️ No AI model found. See setup banner below.';
      showToast(toastMsg, 8000);
      setStatus('offline');
      return;
    }

    if (EL.apiSetupBanner) EL.apiSetupBanner.style.display = 'none';

    EL.modelSelect.innerHTML = data.models.map(m =>
      `<option value="${m.name}">${m.label || m.name}</option>`
    ).join('');

    const pick = data.preferred || data.models[0].name;
    EL.modelSelect.value = pick;
    APP.model = pick;
    const provLabel = data.hasOpenRouter ? 'OpenRouter Cloud ⚡' : 'Ollama Local 🤖';
    setStatus('online', provLabel);
    if (EL.ollamaNotice) EL.ollamaNotice.style.display = 'none';
    showToast(`✅ Ready! Using ${data.models[0].label || pick}`, 3500);

  } catch (e) {
    EL.modelSelect.innerHTML = '<option value="">Server error</option>';
    setStatus('offline');
    showToast('❌ Cannot reach server — is it running?', 5000);
  }
}

// ══════════════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════════════
function bindEvents() {
  EL.sendBtn.addEventListener('click', send);
  EL.inputBox.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!EL.sendBtn.disabled) send(); }
  });
  EL.inputBox.addEventListener('input', () => {
    grow();
    EL.sendBtn.disabled = (EL.inputBox.value.trim() === '' && !APP.file) || APP.streaming;
  });

  EL.modelSelect.addEventListener('change', () => { APP.model = EL.modelSelect.value; });

  EL.refreshModels.addEventListener('click', async () => {
    EL.refreshIcon.style.transition = 'transform .7s ease';
    EL.refreshIcon.style.transform  = 'rotate(360deg)';
    await checkHealth();
    await loadModels();
    setTimeout(() => { EL.refreshIcon.style.transform = ''; EL.refreshIcon.style.transition = ''; }, 750);
  });

  EL.stopBtn.addEventListener('click', () => { if (APP.abort) APP.abort.abort(); });
  EL.clearBtn.addEventListener('click', clearChat);
  EL.newChatBtn.addEventListener('click', newChat);
  EL.fileInput.addEventListener('change', uploadFile);
  EL.fileRemove.addEventListener('click', clearFile);
  EL.exportPdf.addEventListener('click',   () => exportReport('pdf'));
  EL.exportExcel.addEventListener('click', () => exportReport('excel'));

  document.querySelectorAll('.chip, .chip-h, .feat-btn[data-q]').forEach(c => {
    c.addEventListener('click', () => {
      EL.inputBox.value = c.dataset.q || '';
      grow();
      EL.sendBtn.disabled = false;
      EL.inputBox.focus();
      if (c.classList.contains('chip') || c.classList.contains('feat-btn')) closeSidebar();
    });
  });

  const featFileAudit = document.getElementById('featFileAudit');
  if (featFileAudit) {
    featFileAudit.addEventListener('click', () => {
      EL.fileInput.click(); // opens file dialog
    });
  }

  const featExport = document.getElementById('featExport');
  if (featExport) {
    featExport.addEventListener('click', () => {
      if (!APP.messages.length) {
        showToast('⚠️ Start a chat first to export a report', 3000);
      } else {
        exportReport('pdf');
      }
    });
  }

  if (EL.sidebarToggle) EL.sidebarToggle.addEventListener('click', () => EL.sidebar.classList.toggle('collapsed'));
  if (EL.menuBtn)       EL.menuBtn.addEventListener('click', openSidebar);
  if (EL.sidebarClose)  EL.sidebarClose.addEventListener('click', closeSidebar);
  if (EL.overlay)       EL.overlay.addEventListener('click', closeSidebar);

  // Financial Toolkit Calculator
  EL.calcBtn.addEventListener('click', () => { EL.calcModal.style.display = 'flex'; EL.calcIncome?.focus(); });
  EL.calcModalClose.addEventListener('click', () => { EL.calcModal.style.display = 'none'; });
  EL.calcModal.addEventListener('click', e => { if (e.target === EL.calcModal) EL.calcModal.style.display = 'none'; });
  EL.calcRegime.addEventListener('change', () => {
    EL.deductionGroup.style.display = EL.calcRegime.value === 'old' ? '' : 'none';
  });
  
  // Tab Switching
  document.querySelectorAll('.c-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.c-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.c-pane').forEach(c => c.style.display = 'none');
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).style.display = 'block';
      $('calcResult').style.display = 'none';
      APP.calcData = null;
    });
  });

  EL.calcSubmit.addEventListener('click', runCalculator);
  EL.calcSendChat.addEventListener('click', sendCalcToChat);

  // API Key save button
  const saveKeyBtn = $('saveApiKey');
  if (saveKeyBtn) {
    saveKeyBtn.addEventListener('click', async () => {
      const key = ($('apiKeyInput')?.value || '').trim();
      if (!key) { showToast('⚠️ Please enter your OpenRouter API key', 3000); return; }
      if (!key.startsWith('sk-or-')) { showToast('⚠️ OpenRouter keys must start with sk-or-', 4000); return; }
      saveKeyBtn.disabled = true;
      saveKeyBtn.textContent = 'Saving…';
      try {
        const r = await fetch('/api/save-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
        const d = await r.json();
        if (r.ok && d.ok) {
          showToast('✅ API key saved! Reconnecting…', 2000);
          setTimeout(async () => {
            await checkHealth();
            await loadModels();
          }, 2000);
        } else {
          showToast('❌ ' + (d.error || 'Could not save key'), 4000);
        }
      } catch { showToast('❌ Server error — is it running?', 3000); }
      finally { saveKeyBtn.disabled = false; saveKeyBtn.textContent = 'Save Key'; }
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); EL.inputBox.focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); newChat(); }
    if (e.key === 'Escape') { EL.calcModal.style.display = 'none'; closeSidebar(); }
  });

  checkMobile();
  window.addEventListener('resize', checkMobile);
}

function checkMobile() {
  const mob = window.innerWidth <= 800;
  if (EL.menuBtn)      EL.menuBtn.style.display      = mob ? 'flex' : 'none';
  if (EL.sidebarClose) EL.sidebarClose.style.display = mob ? 'flex' : 'none';
}
function openSidebar() {
  EL.sidebar.classList.remove('collapsed');
  EL.overlay.classList.add('show');
}
function closeSidebar() {
  if (window.innerWidth <= 800) {
    EL.sidebar.classList.remove('open');
    EL.overlay.classList.remove('show');
  }
}
function grow() {
  EL.inputBox.style.height = 'auto';
  EL.inputBox.style.height = Math.min(EL.inputBox.scrollHeight, 150) + 'px';
}

// ══════════════════════════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════════════════════════
async function uploadFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  EL.fileInput.value = '';
  EL.uploadOverlay.style.display = 'flex';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res  = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok || data.error) { showToast('❌ ' + (data.error || 'Upload failed'), 5000); return; }
    APP.file = { name: data.filename, text: data.extractedText, type: data.type };
    EL.fileChipName.textContent = data.filename;
    EL.fileStrip.style.display  = '';
    if (!EL.inputBox.value.trim()) {
      const lowerName = data.filename.toLowerCase();
      if (lowerName.includes('bank') || lowerName.includes('statement') || lowerName.includes('account')) {
        EL.inputBox.value = `Please perform a Forensic CA Audit on this Bank Statement. Categorize income/expenses, find cash flow leaks, identify unrecorded liabilities, and flag suspicious transactions.`;
      } else {
        const label = data.type === 'pdf' ? 'PDF document' : data.type === 'excel' ? 'Excel/CSV file' : data.type === 'docx' ? 'Word document' : 'file';
        EL.inputBox.value = `Please analyze this ${label} as a CA and give a complete audit report with tax issues, compliance gaps, and recommendations.`;
      }
      grow();
    }
    EL.sendBtn.disabled = false;
    const extra = data.pages ? ` · ${data.pages} pages` : data.sheets ? ` · ${data.sheets.join(', ')}` : '';
    showToast(`📁 Loaded: ${data.filename}${extra}${data.truncated ? ' [truncated]' : ''}`, 4000);
  } catch (err) {
    showToast('❌ Upload error: ' + err.message, 5000);
  } finally {
    EL.uploadOverlay.style.display = 'none';
  }
}

function clearFile() {
  APP.file = null;
  EL.fileStrip.style.display = 'none';
  EL.sendBtn.disabled = EL.inputBox.value.trim() === '' || APP.streaming;
}

// ══════════════════════════════════════════════════════════════
// SEND → STREAM
// ══════════════════════════════════════════════════════════════
async function send() {
  const typed = EL.inputBox.value.trim();
  if ((!typed && !APP.file) || APP.streaming) return;

  const model = EL.modelSelect.value || APP.model;
  if (!model) { showToast('⚠️ No model selected. Check API key setup.', 4000); return; }

  let context = '';
  if (APP.file) {
    context = `\n\n---\n📎 **File: ${APP.file.name}** (${APP.file.type.toUpperCase()})\n---\n${APP.file.text}`;
    clearFile();
  }

  const fullContent = typed + context;
  if (!fullContent.trim()) return;

  if (!APP.messages.length) EL.welcome.style.display = 'none';

  APP.messages.push({ role: 'user', content: fullContent, ts: now() });
  addBubble('user', typed || '📁 Analyzing uploaded file…');

  EL.inputBox.value        = '';
  EL.inputBox.style.height = 'auto';
  EL.sendBtn.disabled      = true;

  APP.streaming = true;
  APP.abort     = new AbortController();
  EL.stopBtn.style.display  = 'flex';
  EL.exportPdf.disabled     = false;
  EL.exportExcel.disabled   = false;

  const typing  = addTyping();
  let text      = '';
  let bubble    = null;
  let cursor    = null;
  let typingOn  = true;

  try {
    const crmContext = {
      name: document.getElementById('crmName')?.value?.trim() || '',
      id: document.getElementById('crmId')?.value?.trim() || '',
      entity: document.getElementById('crmEntity')?.value || ''
    };

    const res = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  APP.abort.signal,
      body: JSON.stringify({ 
        model, 
        messages: APP.messages.map(m => ({ role: m.role, content: m.content })),
        crm: crmContext
      }),
    });

    if (!res.ok) {
      let errTxt = `Server error ${res.status}`;
      try { const d = await res.json(); errTxt = d.error || errTxt; } catch {}
      typing.remove(); typingOn = false;
      addBubble('ai', `⚠️ ${errTxt}`, true);
      showToast('❌ ' + errTxt, 6000);
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   lineBuf = '';

    const ensureBubble = () => {
      if (bubble) return;
      if (typingOn) { typing.remove(); typingOn = false; }
      const wrap = addBubble('ai', '');
      bubble = wrap.querySelector('.ai-md');
      cursor = document.createElement('span');
      cursor.className = 'scursor';
      bubble.appendChild(cursor);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuf += decoder.decode(value, { stream: true });
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop();
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        try {
          const j = JSON.parse(line.slice(5).trim());
          if (j.error) {
            ensureBubble();
            if (cursor) cursor.remove();
            bubble.innerHTML = `<p style="color:var(--red2);font-weight:600">⚠️ ${escHTML(j.error)}</p>`;
            showToast('❌ ' + j.error, 7000);
            return;
          }
          if (j.token) { text += j.token; ensureBubble(); renderMD(bubble, text, cursor); }
          if (j.done && cursor) { cursor.remove(); cursor = null; }
        } catch {}
      }
    }

    if (cursor) cursor.remove();
    if (typingOn) { typing.remove(); typingOn = false; }
    if (bubble && text) renderMD(bubble, text, null);

    if (text) {
      APP.messages.push({ role: 'assistant', content: text, ts: now() });
      saveHistory(typed || 'File analysis');
    } else if (!bubble) {
      addBubble('ai', '⚠️ No response received. The model may be loading. Please try again.', true);
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      if (cursor) cursor.remove();
      if (bubble && text) {
        renderMD(bubble, text + '\n\n_[Stopped by user]_', null);
        APP.messages.push({ role: 'assistant', content: text, ts: now() });
      }
    } else {
      if (typingOn) { typing.remove(); typingOn = false; }
      addBubble('ai', `⚠️ **Connection error:** ${err.message}\n\nMake sure the server is running.`, true);
      showToast('❌ Connection error!', 5000);
    }
  } finally {
    APP.streaming            = false;
    APP.abort                = null;
    EL.stopBtn.style.display = 'none';
    EL.sendBtn.disabled      = EL.inputBox.value.trim() === '' && !APP.file;
  }
}

// ══════════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════════
function escHTML(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMD(el, text, cursor) {
  el.innerHTML = DOMPurify.sanitize(marked.parse(text || ''), {
    ALLOWED_TAGS: ['p','br','strong','em','b','i','u','s','del','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','hr','pre','code','table','thead','tbody','tr','th','td','span','div','a'],
    ALLOWED_ATTR: ['href','target','rel','class','style'],
  });
  if (cursor) el.appendChild(cursor);
  EL.chatWin.scrollTop = EL.chatWin.scrollHeight;
}

function addBubble(role, text, isErr = false) {
  const isUser = role === 'user';
  const wrap   = document.createElement('div');
  wrap.className = `msg ${isUser ? 'user' : 'ai'}`;

  const av = document.createElement('div');
  av.className = `av ${isUser ? 'usr' : 'ai'}`;
  av.textContent = isUser ? '👤' : 'CA';

  const body = document.createElement('div');
  body.className = 'msg-body';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span class="msg-name">${isUser ? 'You' : 'CABot (FCA)'}</span><span class="msg-time">${now()}</span>`;

  const bub = document.createElement('div');
  bub.className = `bubble${isErr ? ' err' : ''}`;

  if (isUser) {
    bub.textContent = text;
  } else {
    const md = document.createElement('div');
    md.className = 'ai-md';
    if (text) renderMD(md, text, null);
    bub.appendChild(md);
  }

  const acts = document.createElement('div');
  acts.className = 'msg-acts';
  if (!isUser) {
    acts.appendChild(mkBtn('📋 Copy', () => {
      const mdEl = bub.querySelector('.ai-md');
      navigator.clipboard.writeText(mdEl ? mdEl.innerText : text)
        .then(() => showToast('✅ Copied!', 2000)).catch(() => showToast('❌ Failed', 2000));
    }));
    acts.appendChild(mkBtn('💬 Follow-up', () => {
      const snippet = (bub.querySelector('.ai-md')?.innerText || text).slice(0, 100);
      EL.inputBox.value = `Regarding "${snippet.trim()}…" — can you elaborate?`;
      grow(); EL.sendBtn.disabled = false; EL.inputBox.focus();
    }));
  }

  body.append(meta, bub, acts);
  wrap.append(av, body);
  EL.msgs.appendChild(wrap);
  EL.chatWin.scrollTop = EL.chatWin.scrollHeight;
  return wrap;
}

function mkBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'act-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg ai';
  wrap.innerHTML = `
    <div class="av ai">CA</div>
    <div class="msg-body">
      <div class="msg-meta"><span class="msg-name">CABot (FCA)</span><span class="msg-time">${now()}</span></div>
      <div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>
    </div>`;
  EL.msgs.appendChild(wrap);
  EL.chatWin.scrollTop = EL.chatWin.scrollHeight;
  return wrap;
}

// ══════════════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════════════
async function exportReport(type) {
  if (!APP.messages.length) { showToast('⚠️ No messages to export', 3000); return; }
  const btn  = type === 'pdf' ? EL.exportPdf : EL.exportExcel;
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Wait…';
  try {
    const res = await fetch(type === 'pdf' ? '/api/export/pdf' : '/api/export/excel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: APP.messages, clientName: EL.clientName.value.trim(), title: 'CABot CA Report' }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); showToast('❌ ' + (d.error || res.status), 4000); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `CABot_Report_${Date.now()}.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast(`✅ ${type.toUpperCase()} downloaded!`, 3000);
  } catch (err) { showToast('❌ ' + err.message, 4000); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
}

// ══════════════════════════════════════════════════════════════
// CHAT CONTROLS
// ══════════════════════════════════════════════════════════════
function newChat() {
  if (APP.streaming && APP.abort) APP.abort.abort();
  APP.messages = [];
  EL.msgs.innerHTML = '';
  EL.welcome.style.display = '';
  EL.inputBox.value = '';
  EL.inputBox.style.height = 'auto';
  EL.sendBtn.disabled = true;
  EL.exportPdf.disabled = true;
  EL.exportExcel.disabled = true;
  clearFile(); closeSidebar();
}

function clearChat() {
  if (!APP.messages.length) { showToast('ℹ️ Already empty', 2000); return; }
  if (!confirm('Clear this consultation?')) return;
  newChat(); showToast('🗑️ Chat cleared', 2000);
}

// ══════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════
let _tt;
function showToast(msg, dur = 3000) {
  EL.toast.textContent = msg;
  EL.toast.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(() => EL.toast.classList.remove('show'), dur);
}

// ══════════════════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════════════════
const HKEY = 'cabot_v40_hist';

function saveHistory(preview) {
  const list = getHistory();
  const p    = preview.length > 55 ? preview.slice(0, 55) + '…' : preview;
  list.unshift({ id: Date.now(), preview: p, messages: APP.messages.slice() });
  localStorage.setItem(HKEY, JSON.stringify(list.slice(0, 30)));
  renderHistory();
}
function getHistory() { try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch { return []; } }
function renderHistory() {
  const list = getHistory();
  if (!list.length) { EL.historyList.innerHTML = '<p class="empty-note">No consultations yet</p>'; return; }
  EL.historyList.innerHTML = list.slice(0, 10).map(s =>
    `<button class="hist-item" data-id="${s.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      ${escHTML(s.preview)}
    </button>`
  ).join('');
  EL.historyList.querySelectorAll('.hist-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = getHistory().find(s => s.id === +btn.dataset.id);
      if (!item) return;
      if (APP.streaming && APP.abort) APP.abort.abort();
      APP.messages = item.messages.slice();
      EL.msgs.innerHTML = '';
      EL.welcome.style.display = 'none';
      EL.exportPdf.disabled    = false;
      EL.exportExcel.disabled  = false;
      APP.messages.forEach(m => addBubble(m.role === 'user' ? 'user' : 'ai', m.content));
      closeSidebar();
      EL.chatWin.scrollTop = EL.chatWin.scrollHeight;
    });
  });
}

// ══════════════════════════════════════════════════════════════
// DEADLINE TICKER
// ══════════════════════════════════════════════════════════════
function renderDeadlines() {
  const today = new Date(); today.setHours(0,0,0,0);
  const dl = [
    { name: 'Advance Tax 15%',    date: new Date('2025-06-15') },
    { name: 'ITR Filing (Indiv)', date: new Date('2025-07-31') },
    { name: 'Advance Tax 45%',    date: new Date('2025-09-15') },
    { name: 'Tax Audit Report',   date: new Date('2025-09-30') },
    { name: 'Advance Tax 75%',    date: new Date('2025-12-15') },
    { name: 'Belated/Revised ITR',date: new Date('2025-12-31') },
    { name: 'GSTR-1 Monthly',     date: (() => { const d=new Date(); d.setDate(11); if(d<today){d.setMonth(d.getMonth()+1);d.setDate(11);} return d; })() },
    { name: 'GSTR-3B Monthly',    date: (() => { const d=new Date(); d.setDate(20); if(d<today){d.setMonth(d.getMonth()+1);d.setDate(20);} return d; })() },
  ];
  const upcoming = dl.map(d => ({ ...d, diff: Math.round((d.date - today)/(86400000)) }))
    .filter(d => d.diff >= 0).sort((a,b) => a.diff - b.diff).slice(0, 5);
  if (!upcoming.length) { EL.deadlineTicker.innerHTML = '<p class="empty-note">✓ All deadlines current</p>'; return; }
  EL.deadlineTicker.innerHTML = `
    <div class="ticker-label">⏰ Upcoming Deadlines</div>
    ${upcoming.map(d => {
      const cls = d.diff <= 14 ? 'days-urgent' : d.diff <= 45 ? 'days-soon' : 'days-ok';
      const lbl = d.diff === 0 ? 'TODAY!' : d.diff + 'd';
      return `<div class="ticker-item"><span class="ticker-name">${d.name}</span><span class="ticker-days ${cls}">${lbl}</span></div>`;
    }).join('')}`;
}

// ══════════════════════════════════════════════════════════════
// TAX CALCULATOR
// ══════════════════════════════════════════════════════════════
function calcSlab(income, slabs) {
  let tax = 0, prev = 0;
  for (const [lim, rate] of slabs) {
    if (income <= prev) break;
    tax += (Math.min(income, lim) - prev) * rate;
    prev = lim;
    if (lim === Infinity) break;
  }
  return tax;
}

function runCalculator() {
  const activeTab = document.querySelector('.calc-tab.active').dataset.target;
  let rows = [];
  const fmt = v => v < 0 ? '-₹'+Math.abs(v).toLocaleString('en-IN',{maximumFractionDigits:0}) : '₹'+v.toLocaleString('en-IN',{maximumFractionDigits:0});

  if (activeTab === 'tab-incometax') {
    const income = parseFloat($('calcIncome').value) || 0;
    const regime = $('calcRegime').value;
    const deds   = parseFloat($('calcDeductions').value) || 0;
    if (income <= 0) { showToast('⚠️ Enter your annual income', 2500); return; }

    let tax = 0, taxableIncome = income;
    rows.push({ label: 'Gross Annual Income', val: income });

    if (regime === 'new') {
      const std = 75000;
      taxableIncome = Math.max(0, income - std);
      rows.push({ label: 'Standard Deduction', val: -std });
      rows.push({ label: 'Taxable Income', val: taxableIncome, bold: true });
      tax = calcSlab(taxableIncome, [[300000,0],[700000,.05],[1000000,.10],[1200000,.15],[1500000,.20],[Infinity,.30]]);
      if (taxableIncome <= 700000) {
        rows.push({ label: 'Tax on Slabs', val: tax });
        rows.push({ label: 'Rebate u/s 87A', val: -tax, hi: true });
        tax = 0;
      } else { rows.push({ label: 'Tax on Slabs', val: tax }); }
    } else {
      taxableIncome = Math.max(0, income - 50000 - deds);
      rows.push({ label: 'Standard Deduction', val: -50000 });
      if (deds > 0) rows.push({ label: 'Deductions 80C/80D etc.', val: -deds });
      rows.push({ label: 'Taxable Income', val: taxableIncome, bold: true });
      tax = calcSlab(taxableIncome, [[250000,0],[500000,.05],[1000000,.20],[Infinity,.30]]);
      if (taxableIncome <= 500000) {
        rows.push({ label: 'Tax on Slabs', val: tax });
        rows.push({ label: 'Rebate u/s 87A', val: -tax, hi: true });
        tax = 0;
      } else { rows.push({ label: 'Tax on Slabs', val: tax }); }
    }

    let sur = 0;
    if      (income > 50000000)  { sur = tax * (regime==='new'?.25:.37); rows.push({ label: `Surcharge`, val: sur }); }
    else if (income > 20000000)  { sur = tax * .25; rows.push({ label: 'Surcharge 25%', val: sur }); }
    else if (income > 10000000)  { sur = tax * .15; rows.push({ label: 'Surcharge 15%', val: sur }); }
    else if (income > 5000000)   { sur = tax * .10; rows.push({ label: 'Surcharge 10%', val: sur }); }

    const cess = (tax + sur) * 0.04;
    const total = tax + sur + cess;
    if (cess > 0) rows.push({ label: '4% Health & Education Cess', val: cess });
    rows.push({ label: '💰 TOTAL TAX PAYABLE', val: total, bold: true, total: true });
    rows.push({ label: '📊 Effective Tax Rate', val: income > 0 ? (total/income*100).toFixed(2)+'%' : '0%', str: true, hi: true });
    
    APP.calcData = { type: 'tax', income, regime, deds, total };

  } else if (activeTab === 'tab-gst') {
    const amt = parseFloat($('calcGstAmount').value) || 0;
    const rate = parseFloat($('calcGstRate').value) || 0;
    const type = $('calcGstType').value;
    if (amt <= 0) { showToast('⚠️ Enter a valid amount', 2500); return; }

    let gst = 0, final = 0, base = amt;
    if (type === 'exclusive') {
      gst = amt * (rate / 100);
      final = amt + gst;
      rows.push({ label: 'Base Amount', val: amt });
      rows.push({ label: `GST (${rate}%)`, val: gst, hi: true });
      rows.push({ label: 'Total Inclusive Amount', val: final, bold: true, total: true });
    } else {
      base = amt / (1 + (rate / 100));
      gst = amt - base;
      final = amt;
      rows.push({ label: 'Total Inclusive Amount', val: amt });
      rows.push({ label: `Less: GST (${rate}%)`, val: -gst, hi: true });
      rows.push({ label: 'Taxable Base Amount', val: base, bold: true, total: true });
    }
    rows.push({ label: `CGST (${rate/2}%)`, val: gst/2 });
    rows.push({ label: `SGST (${rate/2}%)`, val: gst/2 });

    APP.calcData = { type: 'gst', amt, rate, calcType: type, gst, final, base };

  } else if (activeTab === 'tab-emi') {
    const p = parseFloat($('calcEmiAmount').value) || 0;
    const r = parseFloat($('calcEmiRate').value) || 0;
    const nYears = parseFloat($('calcEmiYears').value) || 0;
    if (p <= 0 || r <= 0 || nYears <= 0) { showToast('⚠️ Enter valid loan details', 2500); return; }

    const rMon = (r / 12) / 100;
    const nMon = nYears * 12;
    const emi = p * rMon * Math.pow(1 + rMon, nMon) / (Math.pow(1 + rMon, nMon) - 1);
    const totalPay = emi * nMon;
    const totalInt = totalPay - p;

    rows.push({ label: 'Loan Principal Amount', val: p });
    rows.push({ label: `Interest Rate`, val: r + '% p.a.', str: true });
    rows.push({ label: `Tenure`, val: nYears + ' Years', str: true });
    rows.push({ label: 'Monthly EMI', val: emi, bold: true, hi: true });
    rows.push({ label: 'Total Interest Payable', val: totalInt });
    rows.push({ label: 'Total Payment (Prin + Int)', val: totalPay, bold: true, total: true });

    APP.calcData = { type: 'emi', p, r, nYears, emi, totalInt, totalPay };
  }

  $('calcRows').innerHTML = rows.map(r =>
    `<div class="calc-row ${r.total?'total':''} ${r.hi?'highlight':''}">
      <span>${r.bold?`<strong>${r.label}</strong>`:r.label}</span>
      <span>${r.str ? r.val : fmt(r.val)}</span>
    </div>`).join('');
  $('calcResult').style.display = '';
}

function sendCalcToChat() {
  if (!APP.calcData) return;
  const d = APP.calcData;
  let msg = '';

  if (d.type === 'tax') {
    msg = `Please analyze my income tax calculation:\n- Annual Income: ₹${d.income.toLocaleString('en-IN')}\n- Regime: ${d.regime === 'new' ? 'New Tax Regime' : 'Old Tax Regime'}`;
    if (d.regime === 'old' && d.deds > 0) msg += `\n- Deductions: ₹${d.deds.toLocaleString('en-IN')}`;
    msg += `\n- Computed Tax: ₹${d.total.toLocaleString('en-IN')}\n\nPlease verify and suggest tax-saving strategies.`;
  } else if (d.type === 'gst') {
    msg = `I have a GST query regarding an amount of ₹${d.amt.toLocaleString('en-IN')} (${d.calcType}).\nThe applicable GST rate is ${d.rate}%. Computed GST is ₹${d.gst.toLocaleString('en-IN')}.\n\nPlease advise if there are any specific ITC conditions or RCM applicability for this transaction.`;
  } else if (d.type === 'emi') {
    msg = `I am planning a loan of ₹${d.p.toLocaleString('en-IN')} at ${d.r}% interest for ${d.nYears} years.\nMy computed EMI is ₹${d.emi.toLocaleString('en-IN')} and total interest is ₹${d.totalInt.toLocaleString('en-IN')}.\n\nPlease advise on the tax benefits of this loan (e.g., Section 24b, 80EEA for Home Loan, or Section 80E for Education).`;
  }

  $('calcModal').style.display = 'none';
  EL.inputBox.value = msg;
  grow(); EL.sendBtn.disabled = false; EL.inputBox.focus();
  showToast('📤 Press Enter to send', 3000);
}

function now() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

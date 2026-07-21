/* Kormoan Intelligence Widget — Ask Kora popup */
(function () {
  'use strict';

  var cfg      = window.KormoanAgentConfig || {};
  var API_URL  = (cfg.apiUrl || 'https://your-agent-domain.com').replace(/\/$/, '');
  var WELCOME  = cfg.welcomeMessage || 'How can I help you today?';
  var CHIPS    = cfg.chips || [
    'What does Kormoan do?',
    'Show me case studies',
    'Design for AI',
    'Book a discovery call',
  ];

  /* ── Session ─────────────────────────────────────────────────────────── */
  function getSessionId() {
    var k = 'ki_session';
    var s = sessionStorage.getItem(k);
    if (!s) { s = 'ki-' + Math.random().toString(36).slice(2) + Date.now(); sessionStorage.setItem(k, s); }
    return s;
  }

  /* ── CSS ─────────────────────────────────────────────────────────────── */
  function loadCSS() {
    if (document.getElementById('ki-style')) return;
    var base = API_URL;
    var scripts = document.querySelectorAll('script[src*="chat.js"]');
    if (scripts.length) base = scripts[scripts.length - 1].src.replace(/chat\.js.*$/, '').replace(/\/$/, '');
    var lnk = document.createElement('link');
    lnk.id = 'ki-style'; lnk.rel = 'stylesheet'; lnk.href = base + '/chat.css';
    document.head.appendChild(lnk);

    if (!document.getElementById('ki-font')) {
      var f = document.createElement('link');
      f.id = 'ki-font'; f.rel = 'stylesheet';
      f.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(f);
    }
  }

  /* ── Build DOM ───────────────────────────────────────────────────────── */
  function buildWidget() {
    var root = document.createElement('div');
    root.id = 'ki-widget';
    root.innerHTML =
      '<button id="ki-trigger" aria-label="Ask Kora">' +
        '<span class="ki-trigger-icon">' +
          '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>' +
          '</svg>' +
        '</span>' +
        'Ask Kora' +
      '</button>' +

      '<div id="ki-overlay" role="dialog" aria-modal="true" aria-label="Kormoan Intelligence">' +
        '<div id="ki-modal">' +

          '<div id="ki-header">' +
            '<div class="ki-logo">' +
              '<div class="ki-logo-mark">K</div>' +
              '<div>' +
                '<div class="ki-logo-name">Kormoan Intelligence</div>' +
                '<div class="ki-logo-tag">Digital Product Advisor</div>' +
              '</div>' +
            '</div>' +
            '<div class="ki-header-right">' +
              '<div class="ki-status">' +
                '<div class="ki-status-dot" id="ki-dot"></div>' +
                '<span id="ki-status-txt">Online</span>' +
              '</div>' +
              '<button id="ki-close" aria-label="Close">' +
                '<svg width="10" height="10" viewBox="0 0 10 10" fill="none">' +
                  '<path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
                '</svg>' +
              '</button>' +
            '</div>' +
          '</div>' +

          '<div id="ki-messages">' +
            '<div id="ki-welcome">' +
              '<div class="ki-eyebrow">Kormoan Intelligence</div>' +
              '<h2>Hello. <em>How can we</em><br>help you today?</h2>' +
              '<p>' + WELCOME + '</p>' +
            '</div>' +
          '</div>' +

          '<div id="ki-bottom">' +
            '<div id="ki-chips">' +
              CHIPS.map(function (c) { return '<button class="ki-chip">' + esc(c) + '</button>'; }).join('') +
            '</div>' +
            '<div id="ki-input-area">' +
              '<div class="ki-input-wrap">' +
                '<textarea id="ki-input" rows="1" placeholder="Ask anything about Kormoan…" maxlength="1000"></textarea>' +
                '<button id="ki-send" aria-label="Send">' + SEND_SVG + '</button>' +
              '</div>' +
              '<div class="ki-hint">Kormoan Intelligence · Powered by AI</div>' +
            '</div>' +
          '</div>' +

        '</div>' +
      '</div>';

    document.body.appendChild(root);
  }

  var SEND_SVG =
    '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M2 8h12M9 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  /* ── Wire up ─────────────────────────────────────────────────────────── */
  function init() {
    loadCSS();
    buildWidget();

    var trigger   = document.getElementById('ki-trigger');
    var overlay   = document.getElementById('ki-overlay');
    var closeBtn  = document.getElementById('ki-close');
    var messages  = document.getElementById('ki-messages');
    var welcome   = document.getElementById('ki-welcome');
    var chips     = document.getElementById('ki-chips');
    var input     = document.getElementById('ki-input');
    var send      = document.getElementById('ki-send');
    var dot       = document.getElementById('ki-dot');
    var statusTxt = document.getElementById('ki-status-txt');

    var busy         = false;
    var typingRow    = null;
    var welcomeGone  = false;

    /* Open / close */
    function open() {
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      setTimeout(function () { input.focus(); }, 300);
    }
    function close() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    trigger.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    /* Auto-grow textarea */
    input.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    send.addEventListener('click', handleSend);

    /* Chips */
    chips.querySelectorAll('.ki-chip').forEach(function (chip) {
      chip.addEventListener('click', function () { sendMessage(chip.textContent.trim()); });
    });

    /* Scroll */
    function scrollBottom() { messages.scrollTop = messages.scrollHeight; }

    /* Append */
    function appendMessage(role, html) {
      var row    = document.createElement('div');
      row.className = 'ki-row ' + (role === 'user' ? 'user' : role === 'error' ? 'error bot' : 'bot');

      var av     = document.createElement('div');
      av.className = 'ki-av';
      av.textContent = role === 'user' ? 'Y' : 'K';

      var bubble = document.createElement('div');
      bubble.className = 'ki-bubble';
      bubble.innerHTML = html;
      bubble.querySelectorAll('a').forEach(function (a) { a.target = '_blank'; a.rel = 'noopener noreferrer'; });

      if (role === 'user') { row.appendChild(bubble); row.appendChild(av); }
      else                 { row.appendChild(av); row.appendChild(bubble); }

      messages.appendChild(row);
      scrollBottom();
    }

    /* Typing */
    function showTyping() {
      typingRow = document.createElement('div');
      typingRow.className = 'ki-typing-row';
      typingRow.innerHTML =
        '<div class="ki-av" style="background:#1c1c1c;color:#f0f0f0">K</div>' +
        '<div class="ki-typing-bubble">' +
          '<div class="ki-dot"></div><div class="ki-dot"></div><div class="ki-dot"></div>' +
        '</div>';
      messages.appendChild(typingRow);
      scrollBottom();
    }
    function hideTyping() { if (typingRow) { typingRow.remove(); typingRow = null; } }

    /* Busy state */
    function setBusy(b) {
      busy = b;
      send.disabled = b;
      input.disabled = b;
      dot.classList.toggle('busy', b);
      statusTxt.textContent = b ? 'Thinking…' : 'Online';
      send.innerHTML = b
        ? '<div class="ki-spinner"></div>'
        : SEND_SVG;
    }

    /* Send */
    function handleSend() {
      var text = input.value.trim();
      if (!text || busy) return;
      input.value = '';
      input.style.height = 'auto';
      sendMessage(text);
    }

    function sendMessage(text) {
      if (busy) return;

      /* Hide welcome + chips on first send */
      if (!welcomeGone) {
        welcomeGone = true;
        welcome.style.display = 'none';
        chips.classList.add('hidden');
      }

      appendMessage('user', esc(text));
      setBusy(true);
      showTyping();

      fetch(API_URL + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: getSessionId(),
          message: text,
          pageUrl: window.location.href,
        }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          hideTyping();
          if (data.response) {
            appendMessage('bot', renderMd(data.response));
          } else {
            appendMessage('error', esc(data.error || 'Something went wrong. Please try again.'));
          }
        })
        .catch(function () {
          hideTyping();
          appendMessage('error', 'Connection error. Please check your network and try again.');
        })
        .finally(function () {
          setBusy(false);
          input.focus();
        });
    }
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function esc(t) {
    return (t + '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                   .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function inline(t) {
    var escaped = esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Auto-link raw URLs that aren't already wrapped inside href="..."
    return escaped.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, function(match, prefix, url) {
      return prefix + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
  }

  function renderMd(text) {
    var lines = text.split('\n');
    var out = [];
    var ulBuf = [];

    function flushList() {
      if (!ulBuf.length) return;
      out.push('<ul>' + ulBuf.map(function (l) { return '<li>' + inline(l) + '</li>'; }).join('') + '</ul>');
      ulBuf = [];
    }

    lines.forEach(function (line) {
      if (/^[-*] /.test(line)) {
        ulBuf.push(line.replace(/^[-*] /, ''));
      } else {
        flushList();
        if      (/^### /.test(line)) out.push('<h3>' + inline(line.slice(4)) + '</h3>');
        else if (/^## /.test(line))  out.push('<h2>' + inline(line.slice(3)) + '</h2>');
        else if (/^---$/.test(line)) out.push('<hr/>');
        else if (line.trim())        out.push('<p>' + inline(line) + '</p>');
      }
    });
    flushList();
    return out.join('');
  }

  /* ── Boot ────────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

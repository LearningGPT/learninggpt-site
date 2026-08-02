var LGPT_IOS = /LearningGPTiOS/i.test((navigator && navigator.userAgent) || '');
document.addEventListener('DOMContentLoaded', function() {
  // ── Retire old waitlist links: send them to /pricing instead. ──
  document.querySelectorAll('a[href="/#waitlist"], a[href="https://learninggpt.ai/#waitlist"]').forEach(function(a){
    a.setAttribute('href', '/pricing');
  });
  // ── Unified top nav: load the shared site-wide nav (one source of truth). ──
  if (!document.getElementById('lgpt-topnav') && !document.getElementById('lgpt-sitenav-loader')) {
    var sn = document.createElement('script');
    sn.id = 'lgpt-sitenav-loader';
    sn.src = '/site-nav.js';
    sn.defer = true;
    document.head.appendChild(sn);
  }
  // Lesson-specific: keep long lesson H1s from breaking awkwardly.
  var s = document.createElement('style');
  s.textContent =
    '.lesson h1 { overflow-wrap: break-word; word-break: break-word; } .lesson h1 .serif, .lesson h1 .grad { padding-right: 0.4em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }';
  document.head.appendChild(s);

  // ── Auto next/prev lesson navigation ──
  // Add a track here and every lesson in it gets prev/next buttons automatically.
  (function injectLessonNav() {
    var TRACKS = {
      foundations: {
        index: '/lessons/foundations/',
        label: 'All Foundations lessons',
        lessons: [
          { url: '/lessons/sales-follow-up-emails',              title: 'Specific friction & the constraint stack' },
          { url: '/lessons/foundations/spotting-hallucinations', title: 'Spotting hallucinations before they cost you' },
          { url: '/lessons/foundations/which-ai-for-which-job',  title: 'Which AI for which job' },
          { url: '/lessons/foundations/when-not-to-use-ai',      title: 'When NOT to use AI' },
          { url: '/lessons/foundations/privacy-and-data',        title: 'Privacy, data & what not to paste' },
          { url: '/lessons/foundations/staying-safe-with-ai',    title: 'Staying safe with AI' }
        ]
      }
      // To add a track later, copy the block above, e.g.:
      // , chatgpt: { index: '/lessons/chatgpt/', label: 'All ChatGPT lessons', lessons: [ { url: '...', title: '...' }, ... ] }
    };

    var path = window.location.pathname.replace(/\.html$/, '').replace(/\/+$/, '');
    var track = null, idx = -1;
    for (var key in TRACKS) {
      var L = TRACKS[key].lessons;
      for (var i = 0; i < L.length; i++) {
        if (L[i].url.replace(/\/+$/, '') === path) { track = TRACKS[key]; idx = i; break; }
      }
      if (track) break;
    }
    if (!track) return; // not a mapped lesson — do nothing

    var prev = idx > 0 ? track.lessons[idx - 1] : null;
    var next = idx < track.lessons.length - 1 ? track.lessons[idx + 1] : null;

    if (!document.getElementById('lgpt-lnav-style')) {
      var st = document.createElement('style');
      st.id = 'lgpt-lnav-style';
      st.textContent =
        '.lgpt-lnav-wrap{max-width:820px;margin:0 auto;padding:0 24px;}' +
        '.lgpt-lnav{display:flex;gap:12px;align-items:stretch;margin:64px 0 20px;flex-wrap:wrap;}' +
        '.lgpt-lnav a{text-decoration:none;}' +
        '.lgpt-lnav-btn{flex:1;min-width:210px;display:flex;flex-direction:column;gap:4px;padding:16px 20px;border:1px solid rgba(255,255,255,0.12);border-radius:14px;background:rgba(255,255,255,0.03);color:#f5f5fa;transition:border-color .15s,transform .15s,background .15s;}' +
        '.lgpt-lnav-btn:hover{border-color:rgba(124,92,255,0.45);background:rgba(124,92,255,0.07);transform:translateY(-2px);}' +
        '.lgpt-lnav-next{text-align:right;align-items:flex-end;}' +
        '.lgpt-lnav-dir{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#7c5cff;}' +
        '.lgpt-lnav-title{font-size:14.5px;font-weight:600;line-height:1.35;color:#f5f5fa;}' +
        '.lgpt-lnav-all{display:flex;align-items:center;justify-content:center;padding:16px 18px;border:1px solid rgba(255,255,255,0.12);border-radius:14px;background:rgba(255,255,255,0.03);color:#a8a8c0;font-size:13px;font-weight:600;white-space:nowrap;transition:color .15s,border-color .15s;}' +
        '.lgpt-lnav-all:hover{color:#f5f5fa;border-color:rgba(255,255,255,0.2);}' +
        '.lgpt-lnav-spacer{flex:1;min-width:210px;}' +
        '@media(max-width:600px){.lgpt-lnav-btn,.lgpt-lnav-spacer{min-width:100%;}.lgpt-lnav-next{text-align:left;align-items:flex-start;}}';
      document.head.appendChild(st);
    }

    function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    var html = '<div class="lgpt-lnav">';
    if (prev) html += '<a class="lgpt-lnav-btn lgpt-lnav-prev" href="' + prev.url + '"><span class="lgpt-lnav-dir">← Previous</span><span class="lgpt-lnav-title">' + esc(prev.title) + '</span></a>';
    else html += '<span class="lgpt-lnav-spacer"></span>';
    html += '<a class="lgpt-lnav-all" href="' + track.index + '">' + esc(track.label) + '</a>';
    if (next) html += '<a class="lgpt-lnav-btn lgpt-lnav-next" href="' + next.url + '"><span class="lgpt-lnav-dir">Next →</span><span class="lgpt-lnav-title">' + esc(next.title) + '</span></a>';
    else html += '<span class="lgpt-lnav-spacer"></span>';
    html += '</div>';

    var wrap = document.createElement('div');
    wrap.className = 'lgpt-lnav-wrap';
    wrap.innerHTML = html;

    var footer = document.querySelector('footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(wrap, footer);
    else document.body.appendChild(wrap);
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // ACCESS CONTROL
  // Free lessons  → open to everyone, no sign-in required.
  // Pro / Pro+    → gated; require a verified account on the right plan.
  // Lesson tier is read from the meta chips on the page:
  //   .chip-pro-plus → Pro+, .chip-pro → Pro, otherwise → Free.
  // ─────────────────────────────────────────────────────────────────────────
  const token = localStorage.getItem('lgpt_token');

  const proPlusChips = document.querySelectorAll('.chip-pro-plus');
  const proChips = document.querySelectorAll('.chip-pro');

  let required = 'free';
  if (proPlusChips.length > 0) required = 'pro_plus';
  else if (proChips.length > 0) required = 'pro';

  // Free lessons: render fully, never wall. (Sign-in button stays in the nav,
  // signup still works, and progress is tracked in localStorage regardless —
  // so people can still make a free account to track progress, just aren't
  // forced to before reading.) Logged-out readers get a soft, dismissible
  // signup nudge that hides no content.
  if (required === 'free') {
    if (!token) { showFreeSignupNudge(); showPromptPromo(); }
    return;
  }

  // Paid lessons (Pro / Pro+) stay gated.
  if (token) {
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', token: token })
    })
    .then(r => r.json())
    .then(data => {
      if (data.authenticated) {
        localStorage.setItem('lgpt_plan', data.plan);
        const ok =
          (required === 'pro' && (data.plan === 'pro' || data.plan === 'pro_plus')) ||
          (required === 'pro_plus' && data.plan === 'pro_plus');
        if (!ok) showPaywall(required);
      } else {
        localStorage.removeItem('lgpt_token');
        localStorage.removeItem('lgpt_plan');
        showPaywall(required);
      }
    })
    .catch(() => { showPaywall(required); });
  } else {
    // Logged-out visitor on a paid lesson → show the upgrade paywall.
    showPaywall(required);
  }

  function hideContent(isPreview) {
    const container = document.querySelector('article.lesson .container');
    if (!container) return null;
    if (isPreview) {
      let pastFirstH2 = false;
      Array.from(container.children).forEach(el => {
        if (!pastFirstH2 && el.tagName === 'H2') pastFirstH2 = true;
        if (pastFirstH2) el.style.display = 'none';
      });
    } else {
      let pastDeck = false;
      Array.from(container.children).forEach(el => {
        if (el.classList.contains('deck')) { pastDeck = true; return; }
        if (pastDeck) el.style.display = 'none';
      });
    }
    return container;
  }

  function insertWall(container, isPreview, wallHTML) {
    const wall = document.createElement('div');
    wall.innerHTML = wallHTML;
    if (isPreview) {
      const firstHidden = Array.from(container.children).find(el => el.style.display === 'none');
      if (firstHidden) firstHidden.insertAdjacentElement('beforebegin', wall);
      else container.appendChild(wall);
    } else {
      const deck = container.querySelector('.deck');
      if (deck) deck.insertAdjacentElement('afterend', wall);
      else container.appendChild(wall);
    }
  }

  function showPaywall(required) {
    const container = hideContent(false);
    if (!container) return;
    const planLabel = required === 'pro_plus' ? 'Pro+' : 'Pro';
    if (LGPT_IOS) {
      insertWall(container, false, `
      <div style="margin:48px 0;padding:48px 40px;background:linear-gradient(135deg,rgba(124,92,255,0.12),rgba(91,141,239,0.08));border:1px solid rgba(124,92,255,0.3);border-radius:20px;text-align:center;">
        <div style="font-size:40px;margin-bottom:16px;">🔒</div>
        <div style="display:inline-block;background:linear-gradient(135deg,#7c5cff,#5b8def);color:white;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 14px;border-radius:100px;margin-bottom:20px;">${planLabel} lesson</div>
        <h2 style="font-size:26px;font-weight:800;margin:0 0 12px;color:#f5f5fa;">This lesson is part of ${planLabel}</h2>
        <p style="font-size:16px;color:#a8a8c0;margin:0 0 32px;max-width:420px;margin-left:auto;margin-right:auto;line-height:1.6;">Sign in with your LearningGPT account to access it.</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <a href="/auth/login?redirect=${encodeURIComponent(window.location.pathname)}" style="display:inline-flex;align-items:center;background:linear-gradient(135deg,#7c5cff,#5b8def);color:white;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;">Sign in</a>
        </div>
      </div>`);
      return;
    }
    const planPrice = required === 'pro_plus' ? '$19/mo' : '$9/mo';
    insertWall(container, false, `
      <div style="margin:48px 0;padding:48px 40px;background:linear-gradient(135deg,rgba(124,92,255,0.12),rgba(91,141,239,0.08));border:1px solid rgba(124,92,255,0.3);border-radius:20px;text-align:center;">
        <div style="font-size:40px;margin-bottom:16px;">🔒</div>
        <div style="display:inline-block;background:linear-gradient(135deg,#7c5cff,#5b8def);color:white;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 14px;border-radius:100px;margin-bottom:20px;">${planLabel} lesson</div>
        <h2 style="font-size:26px;font-weight:800;margin:0 0 12px;color:#f5f5fa;">This lesson is part of ${planLabel}</h2>
        <p style="font-size:16px;color:#a8a8c0;margin:0 0 32px;max-width:420px;margin-left:auto;margin-right:auto;line-height:1.6;">
          Get full access to every lesson, all tool tracks, and unlimited playground for just <strong style="color:#f5f5fa;">${planPrice}</strong> — founding member pricing, locked in forever.
        </p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <a href="/pricing" style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#7c5cff,#5b8def);color:white;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;box-shadow:0 6px 24px rgba(124,92,255,0.3);">Unlock ${planLabel} — ${planPrice} →</a>
          <a href="/auth/login?redirect=${encodeURIComponent(window.location.pathname)}" style="display:inline-flex;align-items:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:#a8a8c0;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;">Sign in</a>
        </div>
        <p style="font-size:13px;color:#6b6b85;margin:20px 0 0;">Already a member? <a href="/auth/login" style="color:#7c5cff;">Sign in →</a></p>
      </div>`);
  }

  // ── Soft signup nudge for free lessons (non-blocking) ──
  // Inline card after the deck. Hides no content; dismissible and remembered.
  function showFreeSignupNudge() {
    try { if (localStorage.getItem('lgpt_nudge_dismissed') === '1') return; } catch (e) {}
    const container = document.querySelector('article.lesson .container');
    if (!container || document.getElementById('lgpt-free-nudge')) return;
    const deck = container.querySelector('.deck');
    const bar = document.createElement('div');
    bar.id = 'lgpt-free-nudge';
    bar.style.cssText = 'position:relative;margin:0 0 36px;padding:16px 44px 16px 20px;background:linear-gradient(135deg,rgba(68,224,164,0.10),rgba(124,92,255,0.08));border:1px solid rgba(68,224,164,0.28);border-radius:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;';
    bar.innerHTML = `
      <span style="font-size:22px;line-height:1;">🎓</span>
      <span style="flex:1;min-width:200px;font-size:14.5px;color:#f5f5fa;line-height:1.5;">
        <strong style="font-weight:700;">Free to read — no account needed.</strong>
        <span style="color:#a8a8c0;"> Create a free account to track your progress and collect a sticker for every lesson you finish.</span>
      </span>
      <a href="/auth/signup?redirect=${encodeURIComponent(window.location.pathname)}" style="flex-shrink:0;display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#44e0a4,#7c5cff);color:white;padding:9px 18px;border-radius:9px;font-size:13.5px;font-weight:600;text-decoration:none;white-space:nowrap;">Create free account →</a>
      <button id="lgpt-nudge-x" aria-label="Dismiss" style="position:absolute;top:10px;right:12px;background:none;border:none;color:#6b6b85;font-size:18px;line-height:1;cursor:pointer;padding:2px;">✕</button>`;
    if (deck && deck.parentNode) deck.insertAdjacentElement('afterend', bar);
    else container.insertBefore(bar, container.firstChild);
    const x = bar.querySelector('#lgpt-nudge-x');
    if (x) x.addEventListener('click', function () {
      bar.remove();
      try { localStorage.setItem('lgpt_nudge_dismissed', '1'); } catch (e) {}
    });
  }

  function showPromptPromo() {
    try {
      var container = document.querySelector('article.lesson .container');
      if (!container || document.getElementById('lgpt-prompt-promo')) return;
      var bar = document.createElement('div');
      bar.id = 'lgpt-prompt-promo';
      bar.style.cssText = 'margin:44px 0 8px;padding:26px 28px;background:linear-gradient(135deg,rgba(124,92,255,0.12),rgba(68,224,164,0.06));border:1px solid rgba(124,92,255,0.3);border-radius:16px;text-align:center;';
      bar.innerHTML = '<div style="font-size:19px;font-weight:800;color:#f5f5fa;margin:0 0 6px;">Get 25 free Copilot prompts</div>'
        + '<div style="font-size:14.5px;color:#a8a8c0;margin:0 0 16px;line-height:1.55;">Copy-paste prompts that save an hour a day \u2014 free, no account needed.</div>'
        + '<a href="/free/copilot-prompts?utm_source=lesson&utm_medium=promo" style="display:inline-block;background:linear-gradient(135deg,#7c5cff,#5b8def);color:#fff;text-decoration:none;font-size:14.5px;font-weight:600;padding:11px 26px;border-radius:10px;">Grab the prompts \u2192</a>';
      container.appendChild(bar);
    } catch (e) {}
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// "Get your sticker" button — added to every lesson's Final-challenge row.
// Track comes from the URL (/lessons/<track>/...); lesson title from og:title.
// Lives in the .challenge .btn-row, which the paywall above only reveals to
// people who can actually read (and complete) the lesson — so it shows for free
// users on free lessons, paid users on paid lessons, and never for gated ones.
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  var KNOWN = { foundations: 1, chatgpt: 1, claude: 1, copilot: 1, gemini: 1, perplexity: 1 };

  // Track: from the URL (/lessons/<track>/...), falling back to the
  // "← <Track> Mastery" nav link for lessons that live at /lessons/<slug>.
  var track = null;
  var m = window.location.pathname.match(/\/lessons\/([a-z0-9-]+)\//i);
  if (m && KNOWN[m[1].toLowerCase()]) track = m[1].toLowerCase();
  if (!track) {
    var nb = document.querySelector('a.nav-back[href^="/lessons/"]');
    if (nb) {
      var m2 = (nb.getAttribute('href') || '').match(/\/lessons\/([a-z0-9-]+)/i);
      if (m2 && KNOWN[m2[1].toLowerCase()]) track = m2[1].toLowerCase();
    }
  }
  if (!track) return;

  var row = document.querySelector('.challenge .btn-row');
  if (!row || document.getElementById('lgpt-sticker-btn')) return;

  // Lesson title: prefer og:title, then the H1 minus its serif tagline.
  var title = '';
  var og = document.querySelector('meta[property="og:title"]');
  if (og && og.content) title = og.content.trim();
  if (!title) {
    var h1 = document.querySelector('.lesson h1') || document.querySelector('h1');
    if (h1) {
      var clone = h1.cloneNode(true);
      var serif = clone.querySelector('.serif');
      if (serif) serif.remove();
      title = clone.textContent.trim().replace(/[:—\-\s]+$/, '') || h1.textContent.trim();
    }
  }
  if (!title) title = (document.title || '').split(' — ')[0].trim();

  var a = document.createElement('a');
  a.id = 'lgpt-sticker-btn';
  a.className = 'btn';
  a.href = '/sticker/' + track + '?title=' + encodeURIComponent(title);
  a.textContent = '🎉 Get your sticker →';

  // Record this lesson as completed (per-device) so the account page can fill
  // in its sticker slots. Stored under the track, keyed by the lesson path.
  a.addEventListener('click', function () {
    try {
      var store = JSON.parse(localStorage.getItem('lgpt_completed') || '{}') || {};
      if (!store[track]) store[track] = {};
      store[track][window.location.pathname] = true;
      localStorage.setItem('lgpt_completed', JSON.stringify(store));
    } catch (e) {}
  });

  row.insertBefore(a, row.firstChild);
});
// ─────────────────────────────────────────────────────────────────────────────
// AI COACH (auto-injected) — lessons that embed the Coach inline keep theirs;
// this adds the identical widget to every lesson that lacks one (Fable 5,
// OpenClaw, Grok, and every future track — no per-page code needed).
// Context is built from the page itself: og:title + track nav + lesson text.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  function injectCoach() {
    if (!document.querySelector('article.lesson')) return;   // lesson pages only
    if (document.getElementById('coachFab')) return;         // page has its own

    var style = document.createElement('style');
    style.textContent = `/* ── AI COACH WIDGET ── */
.coach-fab {
  position: fixed; bottom: 28px; right: 28px; z-index: 999;
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, #44e0a4, #7c5cff);
  border: none; box-shadow: 0 8px 28px rgba(68,224,164,0.4);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; cursor: pointer;
  transition: transform .2s, box-shadow .2s;
}
.coach-fab:hover { transform: scale(1.08); box-shadow: 0 12px 36px rgba(68,224,164,0.5); }
.coach-fab .coach-fab-badge {
  position: absolute; top: -4px; right: -4px;
  background: #7c5cff; color: white;
  font-size: 9px; font-weight: 700; padding: 2px 5px;
  border-radius: 999px; border: 2px solid #0a0a1a; line-height: 1.2;
}
.coach-drawer {
  position: fixed; bottom: 90px; right: 28px; z-index: 998;
  width: 360px; max-height: 520px;
  background: #13132a; border: 1px solid rgba(68,224,164,0.25);
  border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,0.5);
  display: flex; flex-direction: column;
  transform: scale(0.92) translateY(16px); opacity: 0; pointer-events: none;
  transition: transform .25s cubic-bezier(.34,1.56,.64,1), opacity .2s;
}
.coach-drawer.open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }
.coach-drawer-head {
  padding: 16px 18px 14px; border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex; align-items: center; gap: 10px;
}
.coach-avatar { width: 32px; height: 32px; border-radius: 10px; background: linear-gradient(135deg, #44e0a4, #7c5cff); display: grid; place-items: center; font-size: 16px; flex-shrink: 0; }
.coach-head-info { flex: 1; }
.coach-head-name { font-weight: 700; font-size: 14px; }
.coach-head-sub { font-size: 11px; color: #44e0a4; }
.coach-close { background: none; border: none; color: #6b6b85; font-size: 18px; padding: 4px; line-height: 1; cursor: pointer; }
.coach-close:hover { color: #f5f5fa; }
.coach-messages { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth; }
.coach-messages::-webkit-scrollbar { width: 4px; }
.coach-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 4px; }
.msg { max-width: 88%; font-size: 13.5px; line-height: 1.6; }
.msg-coach { align-self: flex-start; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px 14px 14px 4px; padding: 10px 14px; color: #f5f5fa; }
.msg-user { align-self: flex-end; background: linear-gradient(135deg, rgba(124,92,255,0.25), rgba(91,141,239,0.25)); border: 1px solid rgba(124,92,255,0.3); border-radius: 14px 14px 4px 14px; padding: 10px 14px; color: #f5f5fa; }
.msg-thinking { align-self: flex-start; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px 14px 14px 4px; padding: 10px 14px; display: flex; align-items: center; gap: 6px; color: #6b6b85; font-size: 13px; }
.thinking-dot { width: 6px; height: 6px; border-radius: 50%; background: #44e0a4; animation: coachPulse 1.2s ease-in-out infinite; }
.thinking-dot:nth-child(2) { animation-delay: .2s; }
.thinking-dot:nth-child(3) { animation-delay: .4s; }
@keyframes coachPulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }
.coach-limit { padding: 10px 18px; font-size: 11px; color: #6b6b85; text-align: center; border-top: 1px solid rgba(255,255,255,0.08); display: none; }
.coach-limit.visible { display: block; }
.coach-limit a { color: #5b8def; }
.coach-input-row { padding: 12px 18px 16px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; gap: 8px; align-items: flex-end; }
.coach-input { flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); color: #f5f5fa; border-radius: 10px; padding: 9px 12px; font-size: 13px; font-family: inherit; resize: none; max-height: 100px; line-height: 1.5; }
.coach-input:focus { outline: none; border-color: #44e0a4; }
.coach-input::placeholder { color: #6b6b85; }
.coach-send { width: 34px; height: 34px; border-radius: 9px; border: none; flex-shrink: 0; background: linear-gradient(135deg, #44e0a4, #7c5cff); color: white; font-size: 15px; display: grid; place-items: center; cursor: pointer; transition: opacity .15s; }
.coach-send:hover { opacity: 0.85; }
.coach-send:disabled { opacity: 0.4; cursor: default; }
@media (max-width: 480px) { .coach-drawer { width: calc(100vw - 32px); right: 16px; bottom: 80px; } .coach-fab { right: 16px; bottom: 16px; } }`;
    document.head.appendChild(style);

    document.body.insertAdjacentHTML('beforeend', `<!-- ── AI COACH FAB ── -->
<button class="coach-fab" id="coachFab" title="Ask the AI Coach">
  🎓
  <span class="coach-fab-badge">AI</span>
</button>

<!-- ── AI COACH DRAWER ── -->
<div class="coach-drawer" id="coachDrawer">
  <div class="coach-drawer-head">
    <div class="coach-avatar">🎓</div>
    <div class="coach-head-info">
      <div class="coach-head-name">AI Coach</div>
      <div class="coach-head-sub">Ask anything about this lesson</div>
    </div>
    <button class="coach-close" id="coachClose">✕</button>
  </div>
  <div class="coach-messages" id="coachMessages">
    <div class="msg msg-coach">Hey! I'm your AI Coach for this lesson. Ask me anything about what you just read — concepts, examples, how to apply it to your work. What's on your mind?</div>
  </div>
  <div class="coach-limit" id="coachLimit">
    Free lesson coaching is limited to 3 questions. <a href="/#waitlist">Upgrade to Pro</a> for unlimited coaching on every lesson.
  </div>
  <div class="coach-input-row">
    <textarea class="coach-input" id="coachInput" placeholder="Ask about this lesson…" rows="1"></textarea>
    <button class="coach-send" id="coachSend">➤</button>
  </div>
</div>`);

    var title = '';
    var og = document.querySelector('meta[property="og:title"]');
    if (og && og.content) title = og.content.trim();
    if (!title) title = (document.title || '').replace(/\s*[—-]\s*LearningGPT.*$/, '');
    var track = 'LearningGPT';
    var nb = document.querySelector('a.nav-back');
    if (nb) track = nb.textContent.replace(/^\s*←\s*/, '').trim();
    var article = document.querySelector('article.lesson');
    var summary = (article ? (article.innerText || article.textContent || '') : '')
      .replace(/\s+/g, ' ').trim().slice(0, 1500);
    var LESSON_CONTEXT = "You are an AI learning coach embedded in a lesson on LearningGPT.ai.\n\nLESSON TITLE: " + title + "\nTRACK: " + track + "\n\nLESSON CONTENT SUMMARY:\n" + summary;

var MAX_FREE = 3;
  var count = 0;
  var isThinking = false;
  var history = [];

  var fab = document.getElementById('coachFab');
  var drawer = document.getElementById('coachDrawer');
  var closeBtn = document.getElementById('coachClose');
  var msgs = document.getElementById('coachMessages');
  var input = document.getElementById('coachInput');
  var sendBtn = document.getElementById('coachSend');
  var limitBar = document.getElementById('coachLimit');

  if (!fab) return; // safety check

  fab.addEventListener('click', function() { toggle(true); });
  closeBtn.addEventListener('click', function() { toggle(false); });

  function toggle(open) {
    drawer.classList.toggle('open', open);
    if (open) setTimeout(function() { input.focus(); }, 300);
  }

  input.addEventListener('input', function() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener('click', send);

  function addMsg(text, type) {
    var d = document.createElement('div');
    d.className = 'msg msg-' + type;
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function addThinking() {
    var d = document.createElement('div');
    d.className = 'msg-thinking';
    d.innerHTML = '<div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  async function send() {
    var text = input.value.trim();
    if (!text || isThinking) return;
    if (count >= MAX_FREE) {
      limitBar.classList.add('visible');
      input.disabled = true;
      sendBtn.disabled = true;
      return;
    }
    count++;
    if (count >= MAX_FREE) limitBar.classList.add('visible');
    addMsg(text, 'user');
    history.push({ role: 'user', content: text });
    input.value = '';
    input.style.height = 'auto';
    isThinking = true;
    sendBtn.disabled = true;
    var thinking = addThinking();
    try {
      var res = await fetch('/api/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coach: true, lessonCoach: true, lessonContext: LESSON_CONTEXT, history: history })
      });
      thinking.remove();
      var data = await res.json();
      var reply = (data && data.coach) ? data.coach : "Sorry, something went wrong. Try again in a moment.";
      addMsg(reply, 'coach');
      history.push({ role: 'assistant', content: reply });
    } catch(err) {
      thinking.remove();
      addMsg("Something went wrong — try again in a moment.", 'coach');
    } finally {
      isThinking = false;
      sendBtn.disabled = count >= MAX_FREE;
    }
  }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCoach);
  } else {
    injectCoach();
  }
})();

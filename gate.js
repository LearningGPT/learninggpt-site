document.addEventListener('DOMContentLoaded', function() {
const navInner = document.querySelector('nav .nav-inner, nav');
  if (navInner && !navInner.querySelector('.sign-in-btn')) {
    const signIn = document.createElement('a');
    signIn.href = '/auth/login';
    signIn.className = 'sign-in-btn';
    signIn.textContent = 'Sign in';
    signIn.style.cssText = 'padding:8px 16px; border-radius:8px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); color:#f5f5fa; font-size:14px; font-weight:600; text-decoration:none; white-space:nowrap;';
    navInner.appendChild(signIn);
  }
  const s = document.createElement('style');
s.textContent = '.lesson h1 { overflow-wrap: break-word; word-break: break-word; } .lesson h1 .serif, .lesson h1 .grad { padding-right: 0.4em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }';
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
    if (prev) html += '<a class="lgpt-lnav-btn lgpt-lnav-prev" href="' + prev.url + '"><span class="lgpt-lnav-dir">\u2190 Previous</span><span class="lgpt-lnav-title">' + esc(prev.title) + '</span></a>';
    else html += '<span class="lgpt-lnav-spacer"></span>';
    html += '<a class="lgpt-lnav-all" href="' + track.index + '">' + esc(track.label) + '</a>';
    if (next) html += '<a class="lgpt-lnav-btn lgpt-lnav-next" href="' + next.url + '"><span class="lgpt-lnav-dir">Next \u2192</span><span class="lgpt-lnav-title">' + esc(next.title) + '</span></a>';
    else html += '<span class="lgpt-lnav-spacer"></span>';
    html += '</div>';

    var wrap = document.createElement('div');
    wrap.className = 'lgpt-lnav-wrap';
    wrap.innerHTML = html;

    var footer = document.querySelector('footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(wrap, footer);
    else document.body.appendChild(wrap);
  })();

  const plan = localStorage.getItem('lgpt_plan') || 'free';
  const token = localStorage.getItem('lgpt_token');

  const proPlusChips = document.querySelectorAll('.chip-pro-plus');
  const proChips = document.querySelectorAll('.chip-pro');
  const freeChips = document.querySelectorAll('.chip:not(.chip-pro):not(.chip-pro-plus)');

  let required = 'free';
  let isFreePreview = false;

  if (proPlusChips.length > 0) required = 'pro_plus';
  else if (proChips.length > 0) required = 'pro';
  else if (freeChips.length > 0) isFreePreview = true;
 
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
          required === 'free' ||
          (required === 'pro' && (data.plan === 'pro' || data.plan === 'pro_plus')) ||
          (required === 'pro_plus' && data.plan === 'pro_plus');
        if (!ok) showPaywall(required);
      } else {
        localStorage.removeItem('lgpt_token');
        localStorage.removeItem('lgpt_plan');
        showSignIn(isFreePreview);
      }
    })
    .catch(() => {
      if (required !== 'free') showPaywall(required);
      else showSignIn(isFreePreview);
    });
  } else {
    showSignIn(isFreePreview);
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
 
  function showSignIn(isPreview) {
    const container = hideContent(isPreview);
    if (!container) return;
    insertWall(container, isPreview, `
      <div style="margin:48px 0;padding:48px 40px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:20px;text-align:center;">
        <div style="font-size:40px;margin-bottom:16px;">👋</div>
        <h2 style="font-size:26px;font-weight:800;margin:0 0 12px;color:#f5f5fa;">Sign in to continue</h2>
        <p style="font-size:16px;color:#a8a8c0;margin:0 0 32px;max-width:380px;margin-left:auto;margin-right:auto;line-height:1.6;">
          Create a free account to access this lesson and track your progress. No credit card required.
        </p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <a href="/auth/signup?redirect=${encodeURIComponent(window.location.pathname)}" style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#7c5cff,#5b8def);color:white;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;box-shadow:0 6px 24px rgba(124,92,255,0.3);">Create free account →</a>
          <a href="/auth/login?redirect=${encodeURIComponent(window.location.pathname)}" style="display:inline-flex;align-items:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:#a8a8c0;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;">Sign in</a>
        </div>
      </div>`);
  }

  function showPaywall(required) {
    const container = hideContent(false);
    if (!container) return;
    const planLabel = required === 'pro_plus' ? 'Pro+' : 'Pro';
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
      title = clone.textContent.trim().replace(/[:\u2014\-\s]+$/, '') || h1.textContent.trim();
    }
  }
  if (!title) title = (document.title || '').split(' \u2014 ')[0].trim();

  var a = document.createElement('a');
  a.id = 'lgpt-sticker-btn';
  a.className = 'btn';
  a.href = '/sticker/' + track + '?title=' + encodeURIComponent(title);
  a.textContent = '\uD83C\uDF89 Get your sticker \u2192';

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

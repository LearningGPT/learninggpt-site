// ─────────────────────────────────────────────────────────────────────────────
// site-nav.js — ONE unified top nav for the entire site.
// Loaded by every marketing page (<script src="/site-nav.js" defer></script>)
// and by gate.js on every lesson page. Change the nav here → it changes
// everywhere. Self-contained: injects its own styles, hides the page's old nav.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  // ── iOS app compliance (Apple 3.1.1): hide ALL purchase UI in the iOS app only ──
  try {
    if (/LearningGPTiOS/i.test((navigator && navigator.userAgent) || '')) {
      document.documentElement.classList.add('ios-app');
      var _iosPath = window.location.pathname.replace(/\/+$/, '');
      if (_iosPath === '/pricing') { window.location.replace('/'); }
      var _iosStyle = document.createElement('style');
      _iosStyle.textContent = '.ios-app a[href="/pricing"],.ios-app a[href^="/pricing/"],.ios-app a[href^="/pricing?"],.ios-app a[href^="/pricing#"],.ios-app a[href="https://learninggpt.ai/pricing"],.ios-app a[href^="https://learninggpt.ai/pricing"],.ios-app #coachLimit{display:none !important;}';
      (document.head || document.documentElement).appendChild(_iosStyle);
    }
  } catch (e) {}
  // ── SEO: ensure every page has exactly one canonical URL ──
  // Strips query strings (?title=...) and trailing slashes so Google
  // consolidates duplicates. Skips pages that already declare a canonical
  // (the /compare pages have their own).
  try {
    if (!document.querySelector('link[rel="canonical"]')) {
      var canonPath = window.location.pathname
        .replace(/\.html$/, '')
        .replace(/\/+$/, '');
      var canon = document.createElement('link');
      canon.setAttribute('rel', 'canonical');
      canon.setAttribute('href', 'https://learninggpt.ai' + (canonPath || '/'));
      document.head.appendChild(canon);
    }
  } catch (e) {}
  function build() {
    if (document.getElementById('lgpt-topnav')) return; // already injected

    // The live Bookings page — one place to change it site-wide.
    var LGPT_BOOKING = 'https://outlook.office.com/bookwithme/user/80f644fba7b04a1cbdfb8d665cc462d4@learninggpt.ai?anonymous';

    // The canonical link set — edit here to change the nav site-wide.
    var LINKS = [
      { href: '/onsite',   label: 'Onsite & remote training', teams: true },
      { href: '/webinars', label: 'Free webinars' },
      { href: '/advisory', label: 'Advisory' },
      { href: '/about',    label: 'About' }
    ];

    // Current path (no trailing slash, no .html) for active-state highlighting.
    var here = window.location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';

    // ── Hide any existing <nav> on the page (kept in DOM so other scripts that
    //    query its links — e.g. the Account swap — still work). ──
    var olds = document.querySelectorAll('nav');
    for (var i = 0; i < olds.length; i++) {
      if (olds[i].id !== 'lgpt-topnav') olds[i].style.display = 'none';
    }

    // ── Build the new nav ──
    var nav = document.createElement('nav');
    nav.id = 'lgpt-topnav';

    var linksHTML = LINKS.map(function (l) {
      var base = l.href.replace(/\/+$/, '');
      var active = (here === base) || (base !== '/' && here.indexOf(base) === 0);
      var cls = 'lgpt-nl' + (l.senior ? ' lgpt-senior' : '') + (l.teams ? ' lgpt-teams' : '') + (active ? ' is-active' : '');
      return '<a href="' + l.href + '" class="' + cls + '">' + l.label + '</a>';
    }).join('');

    nav.innerHTML =
      '<div class="lgpt-nav-inner">' +
        '<a href="/" class="lgpt-logo"><span class="lgpt-logo-mark">L</span> LearningGPT</a>' +
        '<button class="lgpt-burger" aria-label="Menu" aria-expanded="false">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
        '<div class="lgpt-nav-links">' +
          linksHTML +
          '<a href="/auth/login" class="lgpt-nl lgpt-signin" style="display:none">Sign in</a>' +
          '<a href="' + LGPT_BOOKING + '" class="lgpt-nl lgpt-cta">Book a 15-min call →</a>' +
        '</div>' +
      '</div>';

    // ── Styles (self-contained, all prefixed lgpt-) ──
    var css = document.createElement('style');
    css.id = 'lgpt-topnav-style';
    css.textContent = [
      '#lgpt-topnav{position:sticky;top:0;z-index:1000;background:rgba(10,10,26,0.88);backdrop-filter:blur(18px) saturate(160%);-webkit-backdrop-filter:blur(18px) saturate(160%);border-bottom:1px solid rgba(255,255,255,0.08);font-family:"Inter",system-ui,-apple-system,Segoe UI,sans-serif;}',
      '.lgpt-nav-inner{max-width:1180px;margin:0 auto;padding:13px 24px;display:flex;align-items:center;gap:22px;}',
      '.lgpt-logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px;color:#f5f5fa;text-decoration:none;white-space:nowrap;}',
      '.lgpt-logo-mark{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#7c5cff,#5b8def,#44e0a4);display:grid;place-items:center;font-weight:800;font-size:15px;color:#fff;}',
      '.lgpt-nav-links{display:flex;align-items:center;gap:20px;margin-left:auto;}',
      '.lgpt-nl{font-size:14px;color:#a8a8c0;text-decoration:none;white-space:nowrap;transition:color .15s;}',
      '.lgpt-nl:hover{color:#f5f5fa;}',
      '.lgpt-nl.is-active{color:#f5f5fa;}',
      '.lgpt-teams{color:#b6a4ff;border:1px solid rgba(124,92,255,0.5);background:rgba(124,92,255,0.12);padding:6px 13px;border-radius:999px;font-weight:600;}',
      '.lgpt-teams:hover{color:#d3c8ff;border-color:rgba(124,92,255,0.75);}',
      '.lgpt-teams.is-active{color:#fff;background:linear-gradient(135deg,#7c5cff,#5b8def);}',
      '.lgpt-senior{color:#2dd4a7;border:1px solid rgba(45,212,167,0.4);background:rgba(45,212,167,0.10);padding:6px 13px;border-radius:999px;font-weight:600;}',
      '.lgpt-senior:hover{color:#7fe3c8;border-color:rgba(45,212,167,0.6);}',
      '.lgpt-senior.is-active{color:#0a0a1a;background:#2dd4a7;}',
      '.lgpt-signin{padding:8px 15px;border-radius:8px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:#f5f5fa;font-weight:600;}',
      '.lgpt-signin:hover{background:rgba(255,255,255,0.13);color:#fff;}',
      '.lgpt-cta{padding:8px 16px;border-radius:8px;background:linear-gradient(135deg,#7c5cff,#5b8def);color:#fff;font-weight:600;}',
      '.lgpt-cta:hover{color:#fff;opacity:.9;}',
      '.lgpt-burger{display:none;flex-direction:column;gap:5px;background:none;border:0;cursor:pointer;margin-left:auto;padding:6px;}',
      '.lgpt-burger span{display:block;width:24px;height:2px;background:#f5f5fa;border-radius:2px;transition:.2s;}',
      '@media(max-width:860px){',
        '.lgpt-burger{display:flex;}',
        '.lgpt-nav-links{position:absolute;top:100%;left:0;right:0;flex-direction:column;align-items:stretch;gap:0;margin:0;background:rgba(12,12,28,0.98);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,0.08);padding:8px 0;display:none;}',
        '.lgpt-nav-links.open{display:flex;}',
        '.lgpt-nav-links .lgpt-nl{padding:13px 24px;border-radius:0;font-size:15px;}',
        '.lgpt-senior,.lgpt-senior.is-active{border:0;background:none;color:#2dd4a7;border-radius:0;}',
        '.lgpt-signin,.lgpt-cta{margin:8px 24px;border-radius:8px;text-align:center;}',
        '.lgpt-cta{background:linear-gradient(135deg,#7c5cff,#5b8def);}',
      '}'
    ].join('');

    document.head.appendChild(css);
    document.body.insertBefore(nav, document.body.firstChild);

    // ── Mobile menu toggle ──
    var burger = nav.querySelector('.lgpt-burger');
    var links = nav.querySelector('.lgpt-nav-links');
    if (burger && links) {
      burger.addEventListener('click', function () {
        var open = links.classList.toggle('open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    // ── Account swap: signed-in users see "Account" instead of "Sign in" ──
    try {
      if (localStorage.getItem('lgpt_token')) {
        var si = nav.querySelector('.lgpt-signin');
        if (si) {
          si.textContent = 'Account';
          si.setAttribute('href', '/account');
          si.style.display = '';          // signed-in subscribers get it back
        }
      }
    } catch (e) {}
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Site-wide footer bar. The links demoted out of the top nav live here, so
  // they stay reachable and crawlable from every page without competing with
  // the business message above the fold.
  // ───────────────────────────────────────────────────────────────────────────
  function buildFooterBar() {
    if (document.getElementById('lgpt-footbar')) return;

    var GROUPS = [
      { title: 'For individuals', accent: '#44e0a4', tint: '#8fdcc4', links: [
        { href: '/lessons',      label: 'All lessons' },
        { href: '/playground',   label: 'Playground' },
        { href: '/pricing',      label: 'Pricing' },
        { href: '/auth/signup',  label: 'Start free' }
      ]},
      { title: 'Role tracks', accent: '#b6a4ff', tint: '#bdb0f0', links: [
        { href: '/copilot-for-work', label: 'Copilot at work' },
        { href: '/trades',           label: 'AI for the trades' },
        { href: '/seniors',          label: 'AI for Seniors' }
      ]},
      { title: 'Company', accent: '#8fb3f7', tint: '#a8c2f2', links: [
        { href: '/about',        label: 'About' },
        { href: '/testimonials', label: 'Testimonials' },
        { href: '/whats-new',    label: "What's new" },
        { href: '/contact',      label: 'Contact' }
      ]}
    ];

    var bar = document.createElement('div');
    bar.id = 'lgpt-footbar';
    bar.innerHTML =
      '<div class="lgpt-fb-inner">' +
        GROUPS.map(function (g) {
          return '<div class="lgpt-fb-col"><div class="lgpt-fb-h" style="color:' + g.accent + '">' + g.title + '</div>' +
            g.links.map(function (l) {
              return '<a href="' + l.href + '" style="color:' + g.tint + '">' + l.label + '</a>';
            }).join('') + '</div>';
        }).join('') +
        '<div class="lgpt-fb-legal">&copy; 2026 Allen Ventures LLC &middot; Independent. ' +
        'Not affiliated with OpenAI, Anthropic, Microsoft, Google, Perplexity, Meta, or xAI.</div>' +
      '</div>';

    var css = document.createElement('style');
    css.id = 'lgpt-footbar-style';
    css.textContent = [
      '#lgpt-footbar{background:#0a0a1a;border-top:1px solid rgba(255,255,255,0.08);font-family:"Inter",system-ui,-apple-system,Segoe UI,sans-serif;}',
      '.lgpt-fb-inner{max-width:1180px;margin:0 auto;padding:34px 24px 38px;display:flex;flex-wrap:wrap;gap:44px;}',
      '.lgpt-fb-col{display:flex;flex-direction:column;gap:9px;min-width:150px;}',
      '.lgpt-fb-h{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6f6f8c;margin-bottom:2px;}',
      '.lgpt-fb-col a{font-size:13.5px;text-decoration:none;transition:opacity .15s;}',
      '.lgpt-fb-col a:hover{opacity:.72;}',
      '.lgpt-fb-legal{flex:999 1 280px;min-width:0;align-self:flex-end;font-size:13px;line-height:1.6;color:#8a8aa8;}',
      '@media(max-width:560px){.lgpt-fb-inner{gap:28px;padding:28px 20px 32px;}.lgpt-fb-col{min-width:44%;}}'
    ].join('');

    document.head.appendChild(css);
    document.body.appendChild(bar);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Webinar banner. Shows the NEXT upcoming session and nothing else, so this
  // never needs editing between sessions — it rolls forward on its own and
  // disappears once the last one has run. Sits above the sticky nav, so it
  // scrolls away while the nav stays put.
  //
  // To add a session: append to SESSIONS, keeping it sorted by `ends`.
  // `ends` is UTC — 10:00 AM Central in Nov/Dec/Jan (CST, UTC-6) is 16:00Z,
  // plus an hour so the banner outlives the session that is in progress.
  // ───────────────────────────────────────────────────────────────────────────
  function buildWebinarBanner() {
    if (document.getElementById('lgpt-webinar')) return;

    var SESSIONS = [
      { id: 'w1', title: 'AI Fundamentals: Where To Start, Safely',
        when: 'Tue 17 Nov · 10:00 AM CT', ends: '2026-11-17T17:00:00Z',
        url: 'https://events.teams.microsoft.com/event/ced60f77-aaa6-466b-ba19-5063fce84a27@4b745526-3c99-40c0-a5b0-e61524052dfe' },
      { id: 'w2', title: 'Are You Getting The Most Out Of Copilot?',
        when: 'Tue 1 Dec · 10:00 AM CT', ends: '2026-12-01T17:00:00Z',
        url: 'https://events.teams.microsoft.com/event/12530e81-79a1-42a4-8ca9-56d9b4477114@4b745526-3c99-40c0-a5b0-e61524052dfe' },
      { id: 'w3', title: 'How Can ChatGPT Increase Your Productivity?',
        when: 'Thu 3 Dec · 10:00 AM CT', ends: '2026-12-03T17:00:00Z',
        url: 'https://events.teams.microsoft.com/event/338b4608-0c79-4999-bd28-760f29e0469c@4b745526-3c99-40c0-a5b0-e61524052dfe' },
      { id: 'w4', title: 'Make Claude Your Coworker',
        when: 'Tue 26 Jan · 10:00 AM CT', ends: '2027-01-26T17:00:00Z',
        url: 'https://events.teams.microsoft.com/event/b0b8b8c5-bc4a-4b6b-a693-c08cd0070f88@4b745526-3c99-40c0-a5b0-e61524052dfe' },
      { id: 'w5', title: 'Gemini Is More Than Just Another Google Search',
        when: 'Thu 28 Jan · 10:00 AM CT', ends: '2027-01-28T17:00:00Z',
        url: 'https://events.teams.microsoft.com/event/0644dadd-c49c-4c1c-be5f-9f81ba5a5374@4b745526-3c99-40c0-a5b0-e61524052dfe' }
    ];

    // Next session that has not finished yet.
    var now = Date.now(), next = null;
    for (var i = 0; i < SESSIONS.length; i++) {
      if (Date.parse(SESSIONS[i].ends) > now) { next = SESSIONS[i]; break; }
    }
    if (!next) return; // series over — banner retires itself

    // Dismissal is per-session, so closing one does not hide the next.
    try {
      if (localStorage.getItem('lgpt_webinar_off') === next.id) return;
    } catch (e) {}

    var bar = document.createElement('div');
    bar.id = 'lgpt-webinar';
    bar.innerHTML =
      '<a class="lgpt-wb-a" href="' + next.url + '" target="_blank" rel="noopener">' +
        '<span class="lgpt-wb-tag">Free webinar</span>' +
        '<span class="lgpt-wb-t">' + next.title + '</span>' +
        '<span class="lgpt-wb-w">' + next.when + '</span>' +
        '<span class="lgpt-wb-cta">Register &rarr;</span>' +
      '</a>' +
      '<button class="lgpt-wb-x" type="button" aria-label="Dismiss">&times;</button>';

    var css = document.createElement('style');
    css.id = 'lgpt-webinar-style';
    css.textContent = [
      '#lgpt-webinar{position:relative;background:linear-gradient(135deg,#7c5cff,#5b8def);font-family:"Inter",system-ui,-apple-system,Segoe UI,sans-serif;}',
      '.lgpt-wb-a{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 14px;max-width:1180px;margin:0 auto;padding:11px 46px;text-decoration:none;color:#fff;}',
      '.lgpt-wb-tag{font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;background:rgba(255,255,255,0.19);padding:4px 9px;border-radius:999px;white-space:nowrap;}',
      '.lgpt-wb-t{font-size:14px;font-weight:700;}',
      '.lgpt-wb-w{font-size:13.5px;color:rgba(255,255,255,0.86);white-space:nowrap;}',
      '.lgpt-wb-cta{font-size:13.5px;font-weight:700;text-decoration:underline;text-underline-offset:3px;white-space:nowrap;}',
      '.lgpt-wb-a:hover .lgpt-wb-cta{opacity:.82;}',
      '.lgpt-wb-x{position:absolute;top:50%;right:10px;transform:translateY(-50%);background:none;border:0;color:rgba(255,255,255,0.72);font-size:21px;line-height:1;cursor:pointer;padding:4px 9px;border-radius:6px;}',
      '.lgpt-wb-x:hover{color:#fff;background:rgba(255,255,255,0.14);}',
      '@media(max-width:720px){',
        '.lgpt-wb-a{padding:10px 42px 10px 16px;justify-content:flex-start;gap:5px 10px;}',
        '.lgpt-wb-t{font-size:13px;width:100%;}',
        '.lgpt-wb-w{font-size:12.5px;}',
        '.lgpt-wb-cta{font-size:12.5px;}',
      '}'
    ].join('');

    document.head.appendChild(css);
    document.body.insertBefore(bar, document.body.firstChild); // above the sticky nav

    bar.querySelector('.lgpt-wb-x').addEventListener('click', function () {
      try { localStorage.setItem('lgpt_webinar_off', next.id); } catch (e) {}
      bar.parentNode.removeChild(bar);
    });
  }

  function boot() { build(); buildWebinarBanner(); buildFooterBar(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
// ─────────────────────────────────────────────────────────────────────────────
// Google Analytics 4 — loaded on every page via this shared file.
// Property: learninggpt.ai · Measurement ID G-9LW4HXHQBF
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  try {
    var ga = document.createElement('script');
    ga.async = true;
    ga.src = 'https://www.googletagmanager.com/gtag/js?id=G-9LW4HXHQBF';
    document.head.appendChild(ga);
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', 'G-9LW4HXHQBF');
  } catch (e) {}
})();

/* ── PWA bootstrap (added 2026-07-17): manifest + icons + service worker on every page ── */
(function () {
  try {
    var h = document.head;
    function tag(name, attrs) {
      var el = document.createElement(name);
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      h.appendChild(el);
    }
    if (!document.querySelector('link[rel="manifest"]')) tag('link', { rel: 'manifest', href: '/manifest.webmanifest' });
    if (!document.querySelector('link[rel="apple-touch-icon"]')) tag('link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' });
    tag('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    tag('meta', { name: 'apple-mobile-web-app-title', content: 'LearningGPT' });
    tag('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
      });
    }
  } catch (e) {}
})();

/* ── Microsoft Advertising UET tag (added 2026-08-20) ──────────────────────
   Powers conversion tracking for the Microsoft Search campaign so we can see
   which keywords produce signups/purchases, not just clicks.
   To activate: replace UET_TAG_ID below with the Tag ID from
   Microsoft Advertising → Tools → UET tag. Until then this is inert. */
(function () {
  var UET_TAG_ID = '97264176';                 // <-- paste the numeric Tag ID here
  if (!UET_TAG_ID || UET_TAG_ID === 'UET_TAG_ID') return;   // not configured yet
  try {
    window.uetq = window.uetq || [];
    var o = { ti: UET_TAG_ID, enableAutoSpaTracking: true };
    o.q = window.uetq;
    window.uetq = o;
    var s = document.createElement('script');
    s.async = 1;
    s.src = '//bat.bing.com/bat.js';
    s.onload = function () { window.UET && (window.uetq = new window.UET(o)); };
    document.head.appendChild(s);

    // Conversion events, fired from the pages that mean something.
    var p = location.pathname;
    if (/\/auth\/success/.test(p)) {
      window.uetq.push('event', 'purchase', { revenue_value: 9, currency: 'USD' });
    } else if (/\/account/.test(p) && sessionStorage.getItem('lgpt_new_signup') === '1') {
      sessionStorage.removeItem('lgpt_new_signup');
      window.uetq.push('event', 'signup', {});
    }
    // B2B lead signal: any click on a dan@ talk-first CTA counts as a business lead.
    document.addEventListener('click', function (ev) {
      var tEl = ev.target;
      var hit = null;
      if (tEl && tEl.closest) {
        hit = tEl.closest('a[href^="mailto:dan@learninggpt.ai"]') ||
              tEl.closest('button[onclick*="mailto:dan@learninggpt.ai"]');
      }
      if (hit && window.uetq && window.uetq.push) {
        try { window.uetq.push('event', 'business_lead', {}); } catch (e2) {}
      }
    }, true);
  } catch (e) {}
})();

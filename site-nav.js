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

    // The canonical link set — edit here to change the nav site-wide.
    var LINKS = [
      { href: '/lessons',   label: 'Lessons' },
        { href: '/whats-new', label: "What's new" },
      { href: '/playground', label: 'Playground' },
      { href: '/pricing',   label: 'Pricing' },
      { href: '/testimonials', label: 'Testimonials' },
      { href: '/business',  label: 'For business' },
      { href: '/advisory',  label: 'Advisory' },
      { href: '/seniors',   label: 'AI for Seniors', senior: true }
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
      var cls = 'lgpt-nl' + (l.senior ? ' lgpt-senior' : '') + (active ? ' is-active' : '');
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
          '<a href="/auth/login" class="lgpt-nl lgpt-signin">Sign in</a>' +
          '<a href="/auth/signup" class="lgpt-nl lgpt-cta">Start free →</a>' +
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
        if (si) { si.textContent = 'Account'; si.setAttribute('href', '/account'); }
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
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
  var UET_TAG_ID = 'UET_TAG_ID';                 // <-- paste the numeric Tag ID here
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
  } catch (e) {}
})();

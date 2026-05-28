document.addEventListener('DOMContentLoaded', function() {
  const nav = document.querySelector('nav');
  if (nav && !nav.querySelector('.sign-in-btn')) {
    const signIn = document.createElement('a');
    signIn.href = '/auth/login';
    signIn.className = 'sign-in-btn';
    signIn.textContent = 'Sign in';
    signIn.style.cssText = 'margin-left:auto; padding:8px 16px; border-radius:8px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); color:#f5f5fa; font-size:14px; font-weight:600; text-decoration:none;';
    nav.appendChild(signIn);
  }
  const s = document.createElement('style');
s.textContent = '.lesson h1 { overflow-wrap: break-word; word-break: break-word; } .lesson h1 .serif, .lesson h1 .grad { padding-right: 0.4em; }';
  document.head.appendChild(s);
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
 

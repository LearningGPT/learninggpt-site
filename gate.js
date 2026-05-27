(function() {
  const plan = localStorage.getItem('lgpt_plan') || 'free';
  const token = localStorage.getItem('lgpt_token');

  // Detect required plan from page chips
  const chips = document.querySelectorAll('.chip-pro-plus');
  const proChips = document.querySelectorAll('.chip-pro');
  
  let required = 'free';
  if (chips.length > 0) required = 'pro_plus';
  else if (proChips.length > 0) required = 'pro';

  if (required === 'free') return; // No gating needed

  const hasAccess = 
    (required === 'pro' && (plan === 'pro' || plan === 'pro_plus')) ||
    (required === 'pro_plus' && plan === 'pro_plus');

  if (hasAccess) return; // User has access

  // Verify token server-side if we have one
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
        if (
          (required === 'pro' && (data.plan === 'pro' || data.plan === 'pro_plus')) ||
          (required === 'pro_plus' && data.plan === 'pro_plus')
        ) return; // Access confirmed
      }
      showPaywall(required);
    })
    .catch(() => showPaywall(required));
  } else {
    showPaywall(required);
  }

  function showPaywall(required) {
    const article = document.querySelector('article.lesson');
    if (!article) return;

    // Keep the meta section visible, blur the rest
    const container = article.querySelector('.container');
    if (!container) return;

    // Get first two children (meta + title + deck)
    const children = Array.from(container.children);
    
    // Hide everything after the deck
    let pastDeck = false;
    children.forEach(el => {
      if (el.classList.contains('deck') || (el.tagName === 'P' && el.classList.contains('deck'))) {
        pastDeck = true;
        return;
      }
      if (pastDeck) {
        el.style.display = 'none';
      }
    });

    // Insert paywall
    const planLabel = required === 'pro_plus' ? 'Pro+' : 'Pro';
    const planPrice = required === 'pro_plus' ? '$19/mo' : '$9/mo';

    const wall = document.createElement('div');
    wall.innerHTML = `
      <div style="
        margin: 48px 0;
        padding: 48px 40px;
        background: linear-gradient(135deg, rgba(124,92,255,0.12), rgba(91,141,239,0.08));
        border: 1px solid rgba(124,92,255,0.3);
        border-radius: 20px;
        text-align: center;
      ">
        <div style="font-size: 40px; margin-bottom: 16px;">🔒</div>
        <div style="
          display: inline-block;
          background: linear-gradient(135deg, #7c5cff, #5b8def);
          color: white;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 4px 14px;
          border-radius: 100px;
          margin-bottom: 20px;
        ">${planLabel} lesson</div>
        <h2 style="font-size: 26px; font-weight: 800; margin: 0 0 12px; letter-spacing: -0.02em; color: #f5f5fa;">
          This lesson is part of ${planLabel}
        </h2>
        <p style="font-size: 16px; color: #a8a8c0; margin: 0 0 32px; max-width: 420px; margin-left: auto; margin-right: auto; line-height: 1.6;">
          Get full access to every lesson, all tool tracks, and unlimited playground for just <strong style="color: #f5f5fa;">${planPrice}</strong> — founding member pricing, locked in forever.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <a href="/pricing" style="
            display: inline-flex; align-items: center; gap: 8px;
            background: linear-gradient(135deg, #7c5cff, #5b8def);
            color: white; padding: 14px 28px; border-radius: 10px;
            font-size: 15px; font-weight: 600; text-decoration: none;
            box-shadow: 0 6px 24px rgba(124,92,255,0.3);
          ">Unlock ${planLabel} — ${planPrice} →</a>
          <a href="/auth/login?redirect=${encodeURIComponent(window.location.pathname)}" style="
            display: inline-flex; align-items: center;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.14);
            color: #a8a8c0; padding: 14px 28px; border-radius: 10px;
            font-size: 15px; font-weight: 600; text-decoration: none;
          ">Sign in</a>
        </div>
        <p style="font-size: 13px; color: #6b6b85; margin: 20px 0 0;">
          Already a member? <a href="/auth/login" style="color: #7c5cff;">Sign in →</a>
        </p>
      </div>
    `;
    
    // Insert after deck
    const deck = container.querySelector('.deck');
    if (deck) {
      deck.insertAdjacentElement('afterend', wall);
    } else {
      container.appendChild(wall);
    }
  }
})();

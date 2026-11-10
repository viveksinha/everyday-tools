// Everyday Tools: shared helpers for every page (theme, share links, tabs, paging, formatting).

const LINK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>';

// localStorage can throw (private mode, blocked storage), so every access is guarded.
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

/* ---------- Formatting ---------- */
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const inr = (n, d = 0) =>
  isNum(n) ? '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
export const fixed = (n, d = 1) =>
  isNum(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
export const num = (n, maxD = 2) => (isNum(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: maxD }) : '–');
export const pct = (n, d = 0, signed = true) =>
  isNum(n) ? `${signed && n > 0 ? '+' : ''}${(n * 100).toFixed(d)}%` : '–';

/* ---------- Theme: Auto → Light → Dark ---------- */
export function initTheme() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  const order = ['system', 'light', 'dark'];
  const labels = { system: 'Auto', light: 'Light', dark: 'Dark' };
  const apply = (mode) => {
    if (mode === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    btn.querySelector('span').textContent = labels[mode];
    btn.setAttribute('aria-label', `Theme: ${labels[mode]}. Click to change.`);
  };
  let mode = store.get('et:theme', 'system');
  if (!order.includes(mode)) mode = 'system';
  apply(mode);
  btn.addEventListener('click', () => {
    mode = order[(order.indexOf(mode) + 1) % order.length];
    store.set('et:theme', mode);
    apply(mode);
  });
}

/* ---------- Share links ---------- */
export const urlFor = (id) => `${location.origin}${location.pathname}${location.search}#${encodeURIComponent(id)}`;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function shareChip(id, label = 'share link') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'share-chip';
  b.title = 'Copy a link to this section';
  b.innerHTML = `${LINK_ICON}<span>${esc(label)}</span>`;
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    history.replaceState(null, '', `#${encodeURIComponent(id)}`);
    const ok = await copyText(urlFor(id));
    const span = b.querySelector('span');
    b.classList.add('copied');
    span.textContent = ok ? 'copied ✓' : 'link is in the address bar';
    setTimeout(() => {
      b.classList.remove('copied');
      span.textContent = label;
    }, 1600);
  });
  return b;
}

// Any element with data-share gets a visible chip. data-share="some-id" or the element's own id.
export function initShareChips(root = document) {
  root.querySelectorAll('[data-share]').forEach((el) => {
    if (el.querySelector(':scope > .share-chip')) return;
    const id = el.dataset.share || el.id;
    if (id) el.appendChild(shareChip(id));
  });
}

/* ---------- Tabs with hash routing ---------- */
export function initTabs() {
  const list = document.querySelector('[role="tablist"]');
  if (!list) return { activate() {}, goToHash() {} };
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));

  function activate(panelId, updateHash = false) {
    tabs.forEach((t, i) => {
      const on = panels[i].id === panelId;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (updateHash) history.replaceState(null, '', `#${panelId}`);
    document.dispatchEvent(new CustomEvent('tabchange', { detail: panelId }));
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => activate(panels[i].id, true));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
  });

  // A hash can point at a tab panel or anything inside one: open the tab and any
  // collapsed <details> around the target, then scroll to it.
  function goToHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (!target) {
      if (!tabs.some((t) => t.getAttribute('aria-selected') === 'true')) activate(panels[0].id);
      return;
    }
    const panel = target.closest('[role="tabpanel"]');
    if (panel) activate(panel.id);
    if (target.tagName === 'DETAILS') target.open = true;
    for (let d = target.parentElement?.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    if (target !== panel) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }
  window.addEventListener('hashchange', goToHash);
  return { activate, goToHash };
}

/* ---------- Paging: 15 rows at a time, more on scroll or button ---------- */
export function createPager(el, { pageSize = 15, onMore }) {
  el.classList.add('pager');
  el.innerHTML = '<button type="button" class="btn"></button><div class="sentinel" aria-hidden="true"></div>';
  const btn = el.querySelector('button');
  const sentinel = el.querySelector('.sentinel');
  let state = { shown: 0, total: 0 };
  btn.addEventListener('click', () => onMore());
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && state.shown < state.total) onMore();
    }, { rootMargin: '200px' })
    : null;
  io?.observe(sentinel);
  return {
    pageSize,
    update(shown, total) {
      state = { shown, total };
      el.hidden = shown >= total;
      btn.textContent = `Show ${Math.min(pageSize, total - shown)} more · ${shown} of ${total}`;
    },
  };
}

/* ---------- Tooltip for charts ---------- */
export function createTooltip() {
  const el = document.createElement('div');
  el.className = 'tooltip';
  el.setAttribute('role', 'status');
  document.body.appendChild(el);
  return {
    show(html, x, y) {
      el.innerHTML = html;
      el.classList.add('show');
      const r = el.getBoundingClientRect();
      let left = x + 14;
      let top = y + 14;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
      el.style.left = `${Math.max(8, left)}px`;
      el.style.top = `${Math.max(8, top)}px`;
    },
    hide() {
      el.classList.remove('show');
    },
  };
}

export function initPage() {
  initTheme();
  initShareChips();
  const y = document.querySelector('[data-year]');
  if (y) y.textContent = new Date().getFullYear();
}

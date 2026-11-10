// Calculator inputs <-> state <-> URL query string.
// Each input carries data-k (state key); segmented buttons carry data-seg + data-v.
// Only values that differ from their defaults are written to the URL (plus `always` keys).

export function inWords(n) {
  if (!Number.isFinite(n) || n < 1000) return '';
  if (n >= 1e7) return `${+(n / 1e7).toFixed(2)} crore`;
  if (n >= 1e5) return `${+(n / 1e5).toFixed(2)} lakh`;
  return `${+(n / 1e3).toFixed(1)} thousand`;
}

const fmtMoney = (v) => v.toLocaleString('en-IN', { maximumFractionDigits: 0 });

function parseVal(s, raw) {
  if (raw == null) return null;
  switch (s.kind) {
    case 'money':
    case 'money0': {
      const t = String(raw).replace(/[^\d.]/g, '');
      if (!t) return null;
      const v = Math.round(Number(t));
      if (!Number.isFinite(v) || (s.kind === 'money' ? v <= 0 : v < 0) || v > 1e12) return null;
      return v;
    }
    case 'num':
    case 'int': {
      if (String(raw).trim() === '') return null;
      let v = Number(raw);
      if (!Number.isFinite(v)) return null;
      if (s.kind === 'int') v = Math.round(v);
      if (s.min != null && v < s.min) return null;
      if (s.max != null && v > s.max) return null;
      return v;
    }
    case 'check':
      return raw === true || raw === '1' || raw === 'true';
    case 'month':
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : null;
    default: // select / seg
      return s.opts.includes(String(raw)) ? String(raw) : null;
  }
}

export function createForm(spec, onChange) {
  const params = new URLSearchParams(location.search);
  const state = {};
  const defOf = (k) => (typeof spec[k].def === 'function' ? spec[k].def(state) : spec[k].def);
  for (const k of Object.keys(spec)) {
    const raw = params.get(k);
    const v = spec[k].kind === 'check' ? (raw == null ? null : raw === '1') : parseVal(spec[k], raw);
    state[k] = v ?? defOf(k);
  }

  const els = (k) => document.querySelectorAll(`[data-k="${k}"]`);
  function show(k) {
    const v = state[k];
    els(k).forEach((el) => {
      if (el.type === 'checkbox') el.checked = !!v;
      else if (document.activeElement !== el) el.value = spec[k].kind.startsWith('money') ? fmtMoney(v) : String(v);
    });
    document.querySelectorAll(`[data-seg="${k}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    document.querySelectorAll(`[data-words="${k}"]`).forEach((w) => { w.textContent = inWords(v); });
  }
  function sync() {
    const p = new URLSearchParams();
    for (const k of Object.keys(spec)) {
      const v = state[k];
      if (spec[k].always || v !== defOf(k)) p.set(k, spec[k].kind === 'check' ? (v ? '1' : '0') : String(v));
    }
    const q = p.toString();
    history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
  }
  function set(k, v, silent = false) {
    state[k] = v;
    show(k);
    if (!silent) { sync(); onChange(k); }
  }

  for (const k of Object.keys(spec)) {
    els(k).forEach((el) => {
      const evName = el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'month' ? 'change' : 'input';
      el.addEventListener(evName, () => {
        const v = parseVal(spec[k], el.type === 'checkbox' ? el.checked : el.value);
        if (v == null) { el.setAttribute('aria-invalid', 'true'); return; }
        el.removeAttribute('aria-invalid');
        state[k] = v;
        document.querySelectorAll(`[data-words="${k}"]`).forEach((w) => { w.textContent = inWords(v); });
        sync();
        onChange(k);
      });
      el.addEventListener('blur', () => { el.removeAttribute('aria-invalid'); show(k); });
    });
  }
  document.querySelectorAll('[data-seg]').forEach((b) => {
    b.addEventListener('click', () => {
      const k = b.dataset.seg;
      if (state[k] === b.dataset.v) return;
      set(k, b.dataset.v);
    });
  });

  Object.keys(spec).forEach(show);
  return { state, set, sync, show, defOf };
}

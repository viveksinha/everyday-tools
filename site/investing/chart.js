// Small SVG charts for this page: stacked columns and lines, with hover tooltips.
// Same look as the other pages: series colours var(--s1..3), 4px rounded column tops.
import { esc } from '../assets/site.js';

// ₹ axis labels in lakh / crore.
export function shortInr(v) {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${+(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${s}₹${+(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${s}₹${+(a / 1e3).toFixed(0)}k`;
  return `${s}₹${Math.round(a)}`;
}

function niceStep(span, target = 4) {
  const raw = span / target || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

function frame(host, minV, maxV, labels) {
  const W = host.clientWidth;
  const H = W < 640 ? 230 : 290;
  const pad = { left: 58, right: 10, top: 12, bottom: 28 };
  const lo = Math.min(0, minV);
  const step = niceStep(Math.max(maxV, 1) - lo);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.max(step, Math.ceil(maxV / step) * step);
  const plotH = H - pad.top - pad.bottom;
  const y = (v) => pad.top + plotH * (1 - (v - yMin) / (yMax - yMin));
  const bw = (W - pad.left - pad.right) / labels.length;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><g class="axis">`;
  for (let v = yMin; v <= yMax + step / 2; v += step) {
    svg += `<line class="gridline" x1="${pad.left}" x2="${W - pad.right}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.left - 8}" y="${y(v) + 4}" text-anchor="end">${shortInr(v)}</text>`;
  }
  const every = Math.ceil(labels.length / Math.max(2, Math.floor((W - pad.left) / 46)));
  labels.forEach((l, i) => {
    if (i % every === 0) svg += `<text x="${pad.left + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`;
  });
  svg += '</g>';
  return { W, H, pad, y, bw, svg };
}

// series: [{ name, color, values }]; tip(i) returns tooltip HTML for column i.
export function columnChart(host, { labels, series, tip }) {
  if (!host.clientWidth || !labels.length) return;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.values[i]), 0));
  const f = frame(host, 0, Math.max(...totals), labels);
  let { svg } = f;
  const gap = f.bw > 10 ? Math.min(8, f.bw * 0.25) : 1;
  labels.forEach((_, i) => {
    const x = f.pad.left + i * f.bw + gap / 2;
    const w = Math.max(1, f.bw - gap);
    let base = 0;
    let parts = '';
    const top = series.reduce((k, s, j) => (s.values[i] > 0 ? j : k), -1);
    series.forEach((s, j) => {
      const v = Math.max(0, s.values[i]);
      if (!v) return;
      const y0 = f.y(base);
      const y1 = f.y(base + v);
      const h = y0 - y1;
      if (j === top) {
        const r = Math.min(4, w / 2, h);
        parts += `<path d="M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z" fill="${s.color}"/>`;
      } else {
        parts += `<rect x="${x}" y="${y1}" width="${w}" height="${h}" fill="${s.color}"/>`;
      }
      base += v;
    });
    svg += `<g data-tip="${esc(tip(i))}"><rect x="${f.pad.left + i * f.bw}" y="${f.pad.top}" width="${f.bw}" height="${f.H - f.pad.top - f.pad.bottom}" fill="transparent"/>${parts}</g>`;
  });
  host.innerHTML = `${svg}</svg>`;
}

export function lineChart(host, { labels, series, tip, marker }) {
  if (!host.clientWidth || !labels.length) return;
  const all = series.flatMap((s) => s.values);
  const f = frame(host, Math.min(...all), Math.max(...all), labels);
  let { svg } = f;
  const cx = (i) => f.pad.left + i * f.bw + f.bw / 2;
  if (marker != null) {
    svg += `<line x1="${cx(marker)}" x2="${cx(marker)}" y1="${f.pad.top}" y2="${f.H - f.pad.bottom}" stroke="var(--neutral-mark)" stroke-dasharray="4 4"/>`;
  }
  series.forEach((s) => {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${cx(i)},${f.y(v)}`).join('');
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (labels.length <= 41) s.values.forEach((v, i) => { svg += `<circle cx="${cx(i)}" cy="${f.y(v)}" r="3" fill="${s.color}"/>`; });
  });
  labels.forEach((_, i) => {
    svg += `<rect data-tip="${esc(tip(i))}" x="${f.pad.left + i * f.bw}" y="${f.pad.top}" width="${f.bw}" height="${f.H - f.pad.top - f.pad.bottom}" fill="transparent"/>`;
  });
  host.innerHTML = `${svg}</svg>`;
}

// Hover tooltips plus redraw on resize.
export function wireChart(host, tooltip, draw) {
  host.addEventListener('pointermove', (e) => {
    const g = e.target.closest('[data-tip]');
    if (g) tooltip.show(g.dataset.tip, e.clientX, e.clientY);
    else tooltip.hide();
  });
  host.addEventListener('pointerleave', () => tooltip.hide());
  let lastW = 0;
  new ResizeObserver(() => {
    if (host.clientWidth && host.clientWidth !== lastW) {
      lastW = host.clientWidth;
      draw();
    }
  }).observe(host);
}

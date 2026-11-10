import { initPage, initTabs, initShareChips, esc } from '../assets/site.js';

initPage();
const tabs = initTabs();

/* ---------- Rules you might want to change ---------- */
// "See more" cut-off: LinkedIn doesn't publish it. AuthoredUp (checked Nov 2026) gives ~210 desktop, ~140 phone.
const CUT = { desktop: 210, phone: 140, lines: 3 };
const POST_LIMIT = 3000; // LinkedIn's stated post cap
const URL_TEXT_MAX = 1500; // facts longer than this stay out of the link

// Phrases to cut. `re` is matched case-insensitively; straight and curly apostrophes both match.
const ap = "['’]";
const BANNED = [
  ["I'm thrilled to announce", `\\b(i${ap}m|i am|we${ap}re|we are) (so )?thrilled\\b`],
  ['humbled', '\\bhumbled\\b'],
  ['game-changer', '\\bgame[- ]chang(er|ers|ing)\\b'],
  ["in today's fast-paced world", `\\bin today${ap}s (fast[- ]paced|ever[- ]changing|digital) (world|landscape)\\b`],
  ["let's dive in", `\\blet${ap}s (dive|deep[- ]dive) in(to)?\\b`],
  ["it's not just X, it's Y", `\\b(it${ap}s|this is|that${ap}s) not (just|only|merely) [^.!?\\n]{1,60}?[,;—–-]\\s*(it${ap}s|this is|that${ap}s|but)\\b`],
  ['unlock', '\\bunlock(s|ed|ing)?\\b'],
  ['leverage', '\\bleverag(e|es|ed|ing)\\b'],
  ['delve', '\\bdelv(e|es|ed|ing)\\b'],
  ['at the end of the day', '\\bat the end of the day\\b'],
  ['a testament to', '\\ba testament to\\b'],
  ['journey', '\\bjourneys?\\b'],
  ['excited to share', '\\b(excited|delighted|proud|happy) to (share|announce)\\b'],
  ['without further ado', '\\bwithout further ado\\b'],
  ['in conclusion', '\\b(in conclusion|in summary|to sum up)\\b'],
  ['needless to say', '\\bneedless to say\\b'],
  ['empower', '\\bempower(s|ed|ing|ment)?\\b'],
  ['seamless', '\\bseamless(ly)?\\b'],
  ['elevate', '\\belevat(e|es|ed|ing)\\b'],
  ['synergy', '\\bsynerg(y|ies|ize|ise)\\b'],
].map(([label, src]) => ({ label, re: new RegExp(src, 'giu') }));

const TYPES = {
  lesson: ['Lesson learned', 'What happened, what I got wrong or learned, and what I do differently now.'],
  announcement: ['Announcement', "What's new, who it's for, what changes for them, and where to find it."],
  hiring: ['Hiring', "The role, the team's actual work, must-haves versus nice-to-haves, and how to apply."],
  project: ['Project write-up', 'The problem, what was built or done, one hard choice along the way, and the result (numbers only if given).'],
  opinion: ['Opinion', 'The claim, why I hold it (from the facts), the strongest counterpoint, and where I land.'],
  career: ['Career update', "The change, why, what was hard or what I'll miss, and what's next."],
  event: ['Event recap', "What the event was, two specific things I heard or saw, and one thing I'll try."],
  thanks: ['Thanks', 'Who helped (by role unless names are in the facts), what they did specifically, and what it made possible.'],
};
const TONES = {
  plain: ['Plain', 'Plain and clear, like explaining it to a colleague over coffee.'],
  warm: ['Warm', 'Warm and generous, without gushing.'],
  direct: ['Direct', 'Direct: lead with the point and cut the hedges.'],
  technical: ['Technical', 'Technical: use the precise terms this audience knows; explain anything they might not.'],
};
const LENGTHS = {
  short: ['Short', 'Short: 600 characters or fewer.'],
  medium: ['Medium', 'Medium: about 1,200 characters.'],
  long: ['Long', 'Long: about 2,000 characters.'],
};
const HOOKS = {
  statement: ['Plain statement', 'Open with a plain statement of what happened or what I think.'],
  number: ['A number from the facts', 'Open with the most telling number from the facts. If there is no number in the facts, use a plain statement instead.'],
  question: ['A real question', "Open with one direct question this audience is already asking. Not a rhetorical \"Have you ever...?\""],
  mistake: ['What went wrong', 'Open with what went wrong or what I got wrong.'],
  scene: ['A specific moment', 'Open with one concrete moment from the facts: a time, a place, a thing that happened. No "Picture this".'],
  contrast: ['Expected vs actual', 'Open with what people would expect, then what actually happened according to the facts.'],
};
const CTAS = {
  none: ['None', 'End on the last real point. No call to action, no "Thoughts?", no "Agree?".'],
  question: ['Question', 'End with one specific question the audience can answer from their own work. Not "Thoughts?" or "Agree?".'],
  link: ['Link', 'End by saying where to find more, with [LINK] on its own line. I will add the URL myself (or put it in the first comment).'],
};
const EMOJI = { none: ['None', 'No emoji.'], few: ['A few', 'At most two emoji in the whole post, never as bullet points.'] };
const POV = { first: ['First person', 'First person ("I", "we").'], third: ['Third person', 'Third person (about the team or project, not "I").'] };
const TAGS = ['0', '1', '2', '3'];

/* ---------- Small helpers ---------- */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
function flash(btn, ok, label) {
  btn.textContent = ok ? 'Copied ✓' : 'Select and copy by hand';
  setTimeout(() => { btn.textContent = label; }, 1600);
}
const chars = (s) => [...s].length;
const segHtml = (obj, sel) => Object.entries(obj).map(([k, [l]]) => `<button type="button" data-v="${k}" aria-pressed="${k === sel}">${esc(l)}</button>`).join('');
const setSeg = (el, v) => el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
const tile = (lab, value, sub, cls = '') =>
  `<div class="tile ${cls}"><div class="label">${esc(lab)}</div><div class="value">${value}</div><div class="sub" title="${esc(sub)}">${esc(sub)}</div></div>`;

/* =====================================================================
   1. BUILD
   ===================================================================== */
const params = new URLSearchParams(location.search);
const pick = (k, obj, def) => (Object.hasOwn(obj, params.get(k) ?? '') ? params.get(k) : def);
const DEF = { t: 'lesson', tone: 'plain', len: 'medium', hook: 'statement', cta: 'none', tags: '0', emoji: 'none', pov: 'first' };
const b = {
  t: pick('t', TYPES, DEF.t),
  topic: (params.get('topic') || '').slice(0, 200),
  facts: params.get('facts') || '',
  aud: (params.get('aud') || '').slice(0, 160),
  tone: pick('tone', TONES, DEF.tone),
  len: pick('len', LENGTHS, DEF.len),
  hook: pick('hook', HOOKS, DEF.hook),
  cta: pick('cta', CTAS, DEF.cta),
  tags: TAGS.includes(params.get('tags')) ? params.get('tags') : DEF.tags,
  emoji: pick('emoji', EMOJI, DEF.emoji),
  pov: pick('pov', POV, DEF.pov),
};

function buildPrompt() {
  const facts = b.facts.split('\n').map((x) => x.trim().replace(/^[-*•]\s*/, '')).filter(Boolean);
  const nTags = Number(b.tags);
  const lines = [
    'Write a LinkedIn post for me. Use only the facts I give below, and follow every rule in the voice section.',
    '',
    '## The post',
    `- Type: ${TYPES[b.t][0]}. Cover: ${TYPES[b.t][1]}`,
    `- Topic: ${b.topic.trim() || '[TK: topic not given; ask me]'}`,
    `- Audience: ${b.aud.trim() || 'people who work in this field'}`,
    `- Tone: ${TONES[b.tone][1]}`,
    `- Length: ${LENGTHS[b.len][1]} LinkedIn's hard limit is 3,000 characters.`,
    `- Point of view: ${POV[b.pov][1]}`,
    `- Opening line: ${HOOKS[b.hook][1]}`,
    `- Ending: ${CTAS[b.cta][1]}`,
    `- Hashtags: ${nTags ? `${nTags}, on the last line, specific to the topic (not #success or #motivation).` : 'none.'}`,
    `- Emoji: ${EMOJI[b.emoji][1]}`,
    '',
    '## Facts I can stand behind',
    ...(facts.length ? facts.map((f) => `- ${f}`) : ['- [none given yet: ask me for the facts before you write anything]']),
    '',
    '## Voice rules',
    '1. Use only the facts above. Never invent numbers, names, dates, quotes, results or anecdotes. Where the post needs something I have not given, write [TK: what is needed] in its place.',
    '2. Name the hard part plainly: what was slow, what failed, what it cost. No upbeat spin and no silver linings I did not mention.',
    "3. Use contractions (it's, didn't, we're).",
    '4. Prefer short, common words: so, because, but, use, help, start. Not "utilize", "facilitate" or "in order to".',
    '5. Vary sentence length. Mix short sentences with longer ones; never three of the same length in a row.',
    '6. No preamble ("Here is my post", "I want to talk about") and no recap conclusion ("In summary", "The takeaway").',
    '7. Do not group things in threes by reflex. Use the number of items the facts actually have.',
    '8. At most one em-dash (—) in the whole post. Use commas, full stops or brackets instead.',
    `9. The first line must work on its own. LinkedIn shows only about the first ${CUT.desktop} characters on desktop (about ${CUT.phone} on phones) before "see more", so the first line should be under ${CUT.phone} characters and make sense without the rest.`,
    '10. Short paragraphs: one to three lines each, with a blank line between them.',
    `11. Never use these phrases or close variants: ${BANNED.map((x) => `"${x.label}"`).join(', ')}.`,
    '',
    '## Output',
    'Give me the post only, ready to paste: no title, no notes, no alternatives. After the post, on a new line starting with "---", list any [TK] gaps you left so I can fill them in.',
  ];
  return lines.join('\n');
}

const typeEl = document.getElementById('b-type');
const hookEl = document.getElementById('b-hook');
typeEl.innerHTML = Object.entries(TYPES).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('');
hookEl.innerHTML = Object.entries(HOOKS).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('');
const SEGS = { 'b-tone': ['tone', TONES], 'b-len': ['len', LENGTHS], 'b-cta': ['cta', CTAS], 'b-emoji': ['emoji', EMOJI], 'b-pov': ['pov', POV] };
const tagsObj = Object.fromEntries(TAGS.map((t) => [t, [t]]));
SEGS['b-tags'] = ['tags', tagsObj];
const topicEl = document.getElementById('b-topic');
const factsEl = document.getElementById('b-facts');
const audEl = document.getElementById('b-aud');

function fillInputs() {
  typeEl.value = b.t;
  hookEl.value = b.hook;
  topicEl.value = b.topic;
  factsEl.value = b.facts;
  audEl.value = b.aud;
  for (const [id, [key, obj]] of Object.entries(SEGS)) document.getElementById(id).innerHTML = segHtml(obj, b[key]);
}

function syncUrl() {
  const p = new URLSearchParams();
  for (const k of ['t', 'tone', 'len', 'hook', 'cta', 'tags', 'emoji', 'pov']) if (b[k] !== DEF[k]) p.set(k, b[k]);
  if (b.topic) p.set('topic', b.topic);
  if (b.aud) p.set('aud', b.aud);
  const factsTooLong = chars(b.facts) > URL_TEXT_MAX;
  if (b.facts && !factsTooLong) p.set('facts', b.facts);
  const q = p.toString();
  history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
  document.getElementById('b-url-note').textContent = factsTooLong
    ? `Facts are over ${URL_TEXT_MAX.toLocaleString('en-IN')} characters, so the link keeps your other choices but not the facts.`
    : '';
}

function renderBuild(sync = true) {
  const text = buildPrompt();
  document.getElementById('b-prompt').textContent = text;
  document.getElementById('b-count').textContent = `${chars(text).toLocaleString('en-IN')} characters`;
  const fc = chars(b.facts);
  document.getElementById('b-facts-note').textContent = fc > URL_TEXT_MAX
    ? `${fc.toLocaleString('en-IN')} characters · too long to keep in the link`
    : 'Only what you can stand behind. The assistant is told not to add anything.';
  if (sync) syncUrl();
}

typeEl.addEventListener('change', () => { b.t = typeEl.value; renderBuild(); });
hookEl.addEventListener('change', () => { b.hook = hookEl.value; renderBuild(); });
topicEl.addEventListener('input', () => { b.topic = topicEl.value.slice(0, 200); renderBuild(); });
audEl.addEventListener('input', () => { b.aud = audEl.value.slice(0, 160); renderBuild(); });
factsEl.addEventListener('input', () => { b.facts = factsEl.value; renderBuild(); });
for (const [id, [key]] of Object.entries(SEGS)) {
  document.getElementById(id).addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-v]');
    if (!btn) return;
    b[key] = btn.dataset.v;
    setSeg(e.currentTarget, b[key]);
    renderBuild();
  });
}
const copyBtn = document.getElementById('b-copy');
copyBtn.addEventListener('click', async () => flash(copyBtn, await copyText(buildPrompt()), 'Copy prompt'));
document.getElementById('b-reset').addEventListener('click', () => {
  Object.assign(b, DEF, { topic: '', facts: '', aud: '' });
  fillInputs();
  renderBuild();
});
fillInputs();
renderBuild(false);
if (params.has('facts') || params.has('topic')) syncUrl(); // keeps the note honest for shared links

/* =====================================================================
   2. CHECK (pure client-side)
   ===================================================================== */
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const HASHTAG_RE = /(^|\s)#[\p{L}\p{N}_]+/gu;
const LINK_RE = /\b(?:https?:\/\/|www\.)\S+|\blnkd\.in\/\S+/giu;
const DASH_RE = /—/g;

function findRanges(text) {
  const out = [];
  for (const bn of BANNED) {
    bn.re.lastIndex = 0;
    for (const m of text.matchAll(bn.re)) out.push({ s: m.index, e: m.index + m[0].length, cls: 'hl', label: bn.label, txt: m[0] });
  }
  for (const m of text.matchAll(DASH_RE)) out.push({ s: m.index, e: m.index + 1, cls: 'hl dash' });
  for (const m of text.matchAll(LINK_RE)) out.push({ s: m.index, e: m.index + m[0].length, cls: 'hl link' });
  out.sort((a, c) => a.s - c.s || c.e - a.e);
  const merged = [];
  for (const r of out) if (!merged.length || r.s >= merged.at(-1).e) merged.push(r);
  return { all: out, merged };
}

// What shows before "see more": the first n characters or the first CUT.lines lines, whichever is shorter.
// Works on code points so an emoji isn't split in half.
function previewCut(text, n) {
  const cps = [...text];
  let cut = Math.min(cps.length, n);
  let seen = 0;
  for (let i = 0; i < cut; i++) {
    if (cps[i] === '\n' && ++seen === CUT.lines) { cut = i; break; }
  }
  return { shown: cps.slice(0, cut).join('').replace(/\s+$/, ''), cut: cut < cps.length };
}

function analyse(text) {
  const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  const { all } = findRanges(text);
  const banned = all.filter((r) => r.label);
  const dashes = (text.match(DASH_RE) || []).length;
  const emoji = (text.match(EMOJI_RE) || []).length;
  const tags = (text.match(HASHTAG_RE) || []).length;
  const links = (text.match(LINK_RE) || []).length;
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length).filter((n) => n > 0);
  const mean = sentences.length ? sentences.reduce((a, c) => a + c, 0) / sentences.length : 0;
  const sd = sentences.length ? Math.sqrt(sentences.reduce((a, c) => a + (c - mean) ** 2, 0) / sentences.length) : 0;
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const paraLines = (p) => p.split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(chars(l) / 80)), 0);
  const longParas = paras.filter((p) => paraLines(p) > 3).length;
  const firstLine = (text.trim().split('\n')[0] || '').trim();
  return { n: chars(text), words, banned, dashes, emoji, tags, links, sentences, mean, sd, paras: paras.length, longParas, firstLine: chars(firstLine) };
}

const cText = document.getElementById('c-text');
function renderCheck() {
  const text = cText.value;
  const a = analyse(text);
  const empty = !text.trim();
  const st = (bad, warn) => (bad ? 'bad' : warn ? 'warn' : 'good');
  document.getElementById('c-tiles').innerHTML = empty ? '' : [
    tile('Characters', a.n.toLocaleString('en-IN'), a.n > POST_LIMIT ? `Over the ${POST_LIMIT.toLocaleString('en-IN')} limit by ${(a.n - POST_LIMIT).toLocaleString('en-IN')}` : `of ${POST_LIMIT.toLocaleString('en-IN')} allowed`),
    tile('Words', a.words.toLocaleString('en-IN'), `${a.paras} paragraph${a.paras === 1 ? '' : 's'}`),
    tile('First line', `${a.firstLine}<span class="unit">chars</span>`, a.firstLine <= CUT.phone ? 'Fits before "see more" on phones too' : a.firstLine <= CUT.desktop ? 'Fits on desktop; cut on phones' : 'Cut before "see more"'),
    tile('Phrases to cut', String(a.banned.length), a.banned.length ? [...new Set(a.banned.map((x) => x.label))].join(', ') : 'None found'),
    tile('Em-dashes', String(a.dashes), a.dashes > 1 ? 'Aim for one at most' : 'Fine'),
    tile('Emoji', String(a.emoji), a.emoji > 2 ? 'More than two' : 'Fine'),
    tile('Hashtags', String(a.tags), a.tags > 3 ? 'More than three' : 'Fine'),
    tile('Sentence variation', a.sentences.length ? `±${a.sd.toFixed(1)}<span class="unit">words</span>` : '–', a.sentences.length ? `${a.sentences.length} sentences · average ${a.mean.toFixed(1)} words` : 'No sentences yet'),
  ].join('');

  const flags = empty ? [] : [
    [st(a.n > POST_LIMIT, false), a.n > POST_LIMIT ? `Over LinkedIn's ${POST_LIMIT.toLocaleString('en-IN')}-character limit.` : 'Within the 3,000-character limit.'],
    [st(false, a.firstLine > CUT.desktop), a.firstLine > CUT.desktop ? `First line is ${a.firstLine} characters, so it's cut before "see more". Shorten it.` : a.firstLine > CUT.phone ? `First line is ${a.firstLine} characters: whole on desktop, cut on phones.` : 'First line fits before "see more".'],
    [st(a.banned.length > 0, false), a.banned.length ? `${a.banned.length} stock phrase${a.banned.length === 1 ? '' : 's'}: ${[...new Set(a.banned.map((x) => `"${x.txt}"`))].join(', ')}.` : 'No stock phrases from the list.'],
    [st(false, a.dashes > 1), a.dashes > 1 ? `${a.dashes} em-dashes. Keep one at most.` : `${a.dashes} em-dash${a.dashes === 1 ? '' : 'es'}.`],
    [st(false, a.emoji > 2), `${a.emoji} emoji${a.emoji > 2 ? ': more than two reads as decoration' : ''}.`],
    [st(false, a.tags > 3), `${a.tags} hashtag${a.tags === 1 ? '' : 's'}${a.tags > 3 ? ': three is plenty' : ''}.`],
    [st(false, a.links > 0), a.links ? `${a.links} link${a.links === 1 ? '' : 's'} in the body. Many writers put links in the first comment instead.` : 'No links in the body.'],
    [st(false, a.longParas > 0), a.longParas ? `${a.longParas} paragraph${a.longParas === 1 ? '' : 's'} over about three lines. Split ${a.longParas === 1 ? 'it' : 'them'}.` : 'Paragraphs are three lines or fewer.'],
    [st(false, a.sentences.length >= 4 && a.sd < 4), a.sentences.length >= 4 && a.sd < 4 ? `Sentences are all about the same length (±${a.sd.toFixed(1)} words). Mix short and long.` : a.sentences.length >= 4 ? 'Sentence length varies.' : 'Too few sentences to judge rhythm.'],
  ];
  const chip = { good: '<span class="chip good">OK</span>', warn: '<span class="chip warn">Check</span>', bad: '<span class="chip bad">Fix</span>' };
  document.getElementById('c-flags').innerHTML = empty ? '<li class="muted">Paste a draft to see flags.</li>' : flags.map(([s, t]) => `<li data-state="${s}">${chip[s]}<span>${esc(t)}</span></li>`).join('');

  const d = previewCut(text, CUT.desktop);
  const p = previewCut(text, CUT.phone);
  document.getElementById('c-preview').outerHTML = `<div id="c-preview">${empty ? '<div class="li-preview muted">Nothing yet.</div>' : `
    <div class="li-preview"><span class="dev">Desktop · about ${CUT.desktop}</span>${esc(d.shown)}${d.cut ? '<span class="more">…see more</span>' : ''}</div>
    <div class="li-preview"><span class="dev">Phone · about ${CUT.phone}</span>${esc(p.shown)}${p.cut ? '<span class="more">…see more</span>' : ''}</div>`}</div>`;

  const { merged } = findRanges(text);
  let html = '';
  let i = 0;
  for (const r of merged) {
    html += esc(text.slice(i, r.s)) + `<mark class="${r.cls}"${r.label ? ` title="${esc(r.label)}"` : ''}>${esc(text.slice(r.s, r.e))}</mark>`;
    i = r.e;
  }
  html += esc(text.slice(i));
  document.getElementById('c-marked').innerHTML = empty ? '<span class="muted">Your draft shows here with flags highlighted.</span>' : html;
}
cText.addEventListener('input', renderCheck);
const SAMPLE = `I'm thrilled to announce that our team shipped the new reporting tool — and what a journey it's been!

It's not just a tool, it's a new way of working. We leveraged modern practices to unlock faster insights for every team, at every level, in every region, and the feedback has been amazing so far from everyone involved in the rollout across the business.

At the end of the day, it's a testament to great teamwork — so proud of everyone. 🚀🎉🙌

Read more: https://example.com/post
#reporting #data #teamwork #growth`;
document.getElementById('c-sample').addEventListener('click', () => { cText.value = SAMPLE; renderCheck(); });
document.getElementById('c-clear').addEventListener('click', () => { cText.value = ''; renderCheck(); });
renderCheck();

/* =====================================================================
   3. TEMPLATES (outlines only; brackets are for your own facts)
   ===================================================================== */
const TEMPLATES = [
  ['lesson', `[One line: the mistake or surprise, stated plainly.]

[What you were trying to do, and what you expected.]

[What actually happened. One specific detail.]

[What it cost: time, money, a missed date. Only if true.]

[What you do differently now. One concrete change.]

[Optional: who this applies to, in one line.]`],
  ['announcement', `[One line: what's new, in plain words.]

[Who it's for and the problem it solves for them.]

[What changes for them, starting when.]

[One limit or thing it doesn't do yet.]

[Where to find it: link or "link in the first comment".]`],
  ['hiring', `[One line: the role, the team, and where or whether it's remote.]

[What the team works on day to day. Two or three real examples.]

[Must-haves, as a short list.]

[Nice-to-haves, kept separate.]

[Pay range or band, if you can share it.]

[How to apply and by when.]`],
  ['project', `[One line: the result or the problem, whichever is more specific.]

[The problem and why it mattered.]

[What you built or changed.]

[The hard choice along the way, and what you gave up.]

[The result, with the real number if you have one.]

[What you'd do differently next time.]`],
  ['opinion', `[One line: the claim, stated plainly.]

[Why you hold it: one experience or fact.]

[The strongest argument against it, stated fairly.]

[Why you still land where you do, or where you'd change your mind.]

[Optional: one question for people who disagree.]`],
  ['career', `[One line: the change.]

[Why now, in one or two sentences.]

[What was hard, or what you'll miss.]

[Who helped, by role or name if they're happy to be named.]

[What's next, as specific as you can share.]`],
  ['event', `[One line: the event and your one-line takeaway.]

[Specific thing you heard or saw, with who said it if public.]

[A second specific thing.]

[One thing you'll try because of it.]

[Optional: where talks or slides are posted.]`],
  ['thanks', `[One line: who you're thanking and for what.]

[What they did, specifically. Not "went above and beyond".]

[What it made possible.]

[Optional: tag them only if they'd want it.]`],
];
document.getElementById('t-list').innerHTML = TEMPLATES.map(([k, body]) => `<div class="card card-pad tpl" id="tpl-${k}">
  <div class="head"><h3 data-share="tpl-${k}">${esc(TYPES[k][0])}</h3><button class="btn" type="button" data-copy="${k}">Copy outline</button></div>
  <pre>${esc(body)}</pre>
</div>`).join('');
document.getElementById('t-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const body = TEMPLATES.find(([k]) => k === btn.dataset.copy)[1];
  flash(btn, await copyText(body), 'Copy outline');
});

initShareChips(document.getElementById('t-list'));

tabs.goToHash();

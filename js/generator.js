// Paper generator logic: pure functions, no DOM. Works in the browser and in Node.
// A paper is a list of entries {id, parts}: parts === null means the whole question;
// otherwise the chosen top-level part keys (their prerequisite parts are added automatically).

export const CATEGORIES = [
  { key: "MCQ", label: "Multiple choice (Paper 1 / 1A)" },
  { key: "P1B", label: "Paper 1B (data-based)" },
  { key: "P2", label: "Paper 2 (written)" },
  { key: "P3", label: "Paper 3 (written)" },
];

export function categoryOf(item) {
  if (item.mcq) return "MCQ";
  return "P" + item.p; // P1B, P2, P3 (older P2/P3 too)
}

// ---------- seeded randomness ----------
export function hashSeed(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
export function rng(seed) {
  let a = hashSeed(String(seed))();
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomSeed() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
// Weighted random order (Efraimidis-Spirakis): heavier items tend to come first.
function weightedOrder(list, weightFn, rand) {
  return list
    .map((x) => ({ x, k: Math.pow(rand(), 1 / Math.max(1e-6, weightFn(x))) }))
    .sort((a, b) => b.k - a.k)
    .map((o) => o.x);
}

// ---------- parts / marks ----------
export function partClosure(item, keys) {
  if (!item.parts || keys === null) return null;
  const byKey = Object.fromEntries(item.parts.map((p) => [p.k, p]));
  const out = new Set();
  const stack = [...keys];
  while (stack.length) {
    const k = stack.pop();
    if (out.has(k) || !byKey[k]) continue;
    out.add(k);
    for (const n of byKey[k].n || []) stack.push(n);
  }
  return item.parts.map((p) => p.k).filter((k) => out.has(k)); // paper order
}
export function entryParts(item, entry) {
  return partClosure(item, entry.parts); // null = whole question
}
export function entryMarks(item, entry) {
  const ks = entryParts(item, entry);
  if (ks === null || (item.parts && ks.length === item.parts.length)) return item.m;
  return item.parts.filter((p) => ks.includes(p.k)).reduce((s, p) => s + p.m, 0);
}
export function isWhole(item, entry) {
  const ks = entryParts(item, entry);
  return ks === null || !item.parts || ks.length === item.parts.length;
}

// ---------- eligibility ----------
export function topicShare(item, selected) {
  if (!item.parts) return item.t.some((t) => selected[t] > 0) ? 1 : 0;
  const tot = item.parts.reduce((s, p) => s + (p.m || 0), 0) || item.parts.length;
  const on = item.parts.reduce((s, p) => s + (p.t.some((t) => selected[t] > 0) ? p.m || 1 : 0), 0);
  return on / tot;
}
function itemWeight(item, selected) {
  const ps = item.parts || [{ m: 1, t: item.t }];
  let w = 0, tot = 0;
  for (const p of ps) {
    const m = p.m || 1;
    tot += m;
    w += m * Math.max(0, ...p.t.map((t) => selected[t] || 0));
  }
  return tot ? w / tot : 0;
}
export function eligible(bank, item, s) {
  if (s.excludeIds && s.excludeIds.has(item.id)) return false;
  if (s.yearFrom && item.y < s.yearFrom) return false;
  if (s.yearTo && item.y > s.yearTo) return false;
  if (!s.includeOld && bank.guideFirstExam && item.y < bank.guideFirstExam) return false;
  if (s.availableFiles && !s.availableFiles.has(item.qf)) return false;
  if (!(item.m > 0)) return false;
  return topicShare(item, s.topics) >= (s.minShare ?? 0.5);
}
function standaloneParts(item, s) {
  if (!item.parts || item.kw) return [];
  return item.parts
    .filter((p) => (!p.n || p.n.length === 0) && p.m > 0 && p.t.some((t) => s.topics[t] > 0))
    .map((p) => ({ id: item.id, parts: [p.k], m: p.m, w: Math.max(...p.t.map((t) => s.topics[t] || 0)) }));
}

// Exact subset-sum over candidates (random order), fewest pieces first. Returns list or null.
function exactFill(cands, target, rand, maxPieces = 4) {
  if (target === 0) return [];
  const order = weightedOrder(cands.filter((c) => c.m <= target), (c) => c.w || 1, rand);
  // reach[sum] = {prev, idx, n}
  const reach = new Map([[0, { n: 0 }]]);
  for (let i = 0; i < order.length; i++) {
    const c = order[i];
    const sums = [...reach.entries()].sort((a, b) => b[0] - a[0]);
    for (const [sum, info] of sums) {
      const ns = sum + c.m;
      if (ns > target || info.n >= maxPieces) continue;
      if (info.used && info.used.has(c.id)) continue; // one piece per question
      const used = new Set(info.used || []);
      used.add(c.id);
      const cur = reach.get(ns);
      if (!cur || cur.n > info.n + 1) reach.set(ns, { prev: sum, idx: i, n: info.n + 1, used });
    }
    if (reach.has(target) && reach.get(target).n <= 2) break;
  }
  if (!reach.has(target)) return null;
  const out = [];
  let s = target;
  while (s !== 0) {
    const r = reach.get(s);
    out.push(order[r.idx]);
    s = r.prev;
  }
  return out;
}

// Fill one category up to `target` marks, avoiding ids already used.
export function fillCategory(bank, cat, target, used, s, rand) {
  const pool = bank.items.filter((it) => categoryOf(it) === cat && !used.has(it.id) && eligible(bank, it, s));
  const wfn = (it) => itemWeight(it, s.topics) || 0.01;
  if (cat === "MCQ") {
    const picked = weightedOrder(pool, wfn, rand).slice(0, target);
    return { entries: picked.map((it) => ({ id: it.id, parts: null })), marks: picked.length };
  }
  let best = { entries: [], marks: 0 };
  for (let attempt = 0; attempt < 40; attempt++) {
    const order = weightedOrder(pool, wfn, rand);
    const chosen = [];
    let rem = target;
    for (const it of order) {
      if (it.m <= rem) {
        chosen.push(it);
        rem -= it.m;
        if (rem === 0) break;
      }
    }
    // drop 0-2 of the last picks at random, to leave room for an exact top-up
    for (let k = Math.floor(rand() * 3); k > 0 && chosen.length > 1 && rem > 0; k--) rem += chosen.pop().m;
    const usedNow = new Set([...used, ...chosen.map((c) => c.id)]);
    const parts = pool.filter((it) => !usedNow.has(it.id)).flatMap((it) => standaloneParts(it, s));
    const top = exactFill(parts, rem, rand);
    const entries = chosen.map((it) => ({ id: it.id, parts: null }));
    if (top) {
      return { entries: entries.concat(top.map((p) => ({ id: p.id, parts: p.parts }))), marks: target };
    }
    const marks = target - rem;
    if (marks > best.marks) best = { entries, marks };
  }
  return best; // could not hit the exact total: caller reports the shortfall
}

// ---------- paper ----------
// settings: {topics:{code:weight}, targets:{MCQ:n, P1B:n, P2:n, P3:n}, yearFrom, yearTo, includeOld, minShare, seed}
export function generate(bank, settings) {
  const rand = rng(settings.seed);
  const used = new Set();
  const paper = { seed: settings.seed, round: 1, targets: { ...settings.targets }, entries: [], removed: [] };
  for (const c of CATEGORIES) {
    const t = settings.targets[c.key] || 0;
    if (!t) continue;
    const r = fillCategory(bank, c.key, t, used, settings, rand);
    r.entries.forEach((e) => used.add(e.id));
    paper.entries.push(...r.entries);
  }
  return paper;
}

export function itemIndex(bank) {
  if (!bank._idx) bank._idx = Object.fromEntries(bank.items.map((it) => [it.id, it]));
  return bank._idx;
}
export function totals(bank, paper) {
  const idx = itemIndex(bank);
  const t = {};
  for (const e of paper.entries) {
    const it = idx[e.id];
    const c = categoryOf(it);
    t[c] = (t[c] || 0) + entryMarks(it, e);
  }
  return t;
}
export function gaps(bank, paper) {
  const t = totals(bank, paper);
  const g = {};
  for (const c of CATEGORIES) g[c.key] = (paper.targets[c.key] || 0) - (t[c.key] || 0);
  return g;
}

// Remove an entry (it can't come back in later rounds).
export function removeEntry(paper, i) {
  const [e] = paper.entries.splice(i, 1);
  paper.removed.push(e.id);
  return e;
}
// Replace: remove, then try a same-category question with the same marks; else leave the gap for fillGaps.
export function replaceEntry(bank, paper, i, settings) {
  const idx = itemIndex(bank);
  const old = paper.entries[i];
  const it = idx[old.id];
  const marks = entryMarks(it, old);
  const cat = categoryOf(it);
  removeEntry(paper, i);
  const used = new Set([...paper.entries.map((e) => e.id), ...paper.removed]);
  const rand = rng(settings.seed + ":r" + paper.removed.length);
  const pool = bank.items.filter((x) => categoryOf(x) === cat && !used.has(x.id) && x.m === marks && eligible(bank, x, settings));
  if (pool.length) {
    const pick = weightedOrder(pool, (x) => itemWeight(x, settings.topics) || 0.01, rand)[0];
    paper.entries.splice(i, 0, { id: pick.id, parts: null });
    return true;
  }
  return false;
}
// Fill every category back up to its target (new round).
export function fillGaps(bank, paper, settings) {
  const g = gaps(bank, paper);
  const used = new Set([...paper.entries.map((e) => e.id), ...paper.removed]);
  const rand = rng(settings.seed + ":round" + (paper.round + 1));
  let added = 0;
  for (const c of CATEGORIES) {
    if (g[c.key] > 0) {
      const r = fillCategory(bank, c.key, g[c.key], used, settings, rand);
      r.entries.forEach((e) => used.add(e.id));
      // insert at the end of that category's block
      let at = paper.entries.length;
      for (let k = paper.entries.length - 1; k >= 0; k--) {
        if (categoryOf(itemIndex(bank)[paper.entries[k].id]) === c.key) { at = k + 1; break; }
      }
      paper.entries.splice(at, 0, ...r.entries);
      added += r.entries.length;
    }
  }
  paper.round += 1;
  return added;
}
export function setParts(bank, paper, i, keys) {
  const it = itemIndex(bank)[paper.entries[i].id];
  if (!it.parts) return;
  const all = it.parts.map((p) => p.k);
  const cl = keys.length ? partClosure(it, keys) : all;
  paper.entries[i].parts = cl.length === all.length ? null : cl;
}
export function sortByCategory(bank, paper) {
  const order = Object.fromEntries(CATEGORIES.map((c, i) => [c.key, i]));
  const idx = itemIndex(bank);
  paper.entries.sort((a, b) => order[categoryOf(idx[a.id])] - order[categoryOf(idx[b.id])]);
}

// ---------- paper codes ----------
// A code records the exact questions (and kept parts) of a paper, so it can be rebuilt or excluded later.
// v2 format: "2" + base64url(bytes): seed, targets, then per entry a 32-bit hash of the question id
// (stable across bank rebuilds) and, for partial questions, a bitmask of the kept parts.
function fnv32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function hashIndex(bank) {
  if (!bank._hidx) {
    bank._hidx = new Map();
    for (const it of bank.items) { const h = fnv32(it.id); if (!bank._hidx.has(h)) bank._hidx.set(h, it); }
  }
  return bank._hidx;
}
function pushVar(out, n) { do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; out.push(b); } while (n); }
function readVar(buf, pos) { let n = 0, mul = 1, b; do { b = buf[pos.i++]; n += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80); return n; }
function b64url(bytes) {
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  const s = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = typeof atob === "function" ? atob(b) : Buffer.from(b, "base64").toString("binary");
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export function encodePaper(paper, bank) {
  const out = [];
  const seed = String(paper.seed || "").slice(0, 16);
  out.push(seed.length); for (const ch of seed) out.push(ch.charCodeAt(0) & 0x7f);
  for (const c of CATEGORIES) pushVar(out, (paper.targets || {})[c.key] || 0);
  pushVar(out, paper.entries.length);
  const idx = itemIndex(bank);
  for (const e of paper.entries) {
    const h = fnv32(e.id);
    out.push(h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
    const it = idx[e.id];
    if (e.parts && it && it.parts) {
      let mask = 0; it.parts.forEach((p, i) => { if (e.parts.includes(p.k)) mask += 2 ** i; });
      pushVar(out, mask + 1);
    } else out.push(0);
  }
  return "2" + b64url(out);
}
export function decodePaper(code, bank) {
  code = code.replace(/\s+/g, ""); // codes copied from a PDF may carry line breaks
  if (code[0] !== "2") return decodePaperV1(code);
  const buf = unb64url(code.slice(1)), pos = { i: 0 };
  const sl = buf[pos.i++]; let seed = "";
  for (let k = 0; k < sl; k++) seed += String.fromCharCode(buf[pos.i++]);
  const targets = {};
  for (const c of CATEGORIES) { const v = readVar(buf, pos); if (v) targets[c.key] = v; }
  const n = readVar(buf, pos), hidx = hashIndex(bank), entries = [], missing = [];
  for (let k = 0; k < n; k++) {
    const h = ((buf[pos.i] << 24) | (buf[pos.i + 1] << 16) | (buf[pos.i + 2] << 8) | buf[pos.i + 3]) >>> 0; pos.i += 4;
    const m = readVar(buf, pos);
    const it = hidx.get(h);
    if (!it) { missing.push(h); continue; }
    let parts = null;
    if (m && it.parts) { parts = it.parts.filter((p, i) => Math.floor((m - 1) / 2 ** i) % 2 === 1).map((p) => p.k); }
    entries.push({ id: it.id, parts });
  }
  if (pos.i !== buf.length) throw new Error("bad code");
  return { seed, round: 1, targets, removed: [], entries, missing: missing.length };
}
function decodePaperV1(code) {
  const b = code.replace(/-/g, "+").replace(/_/g, "/");
  const json = typeof atob === "function" ? decodeURIComponent(escape(atob(b))) : Buffer.from(b, "base64").toString();
  const o = JSON.parse(json);
  return { seed: o.s, round: 1, targets: o.t, removed: [], missing: 0,
           entries: o.e.map((x) => (Array.isArray(x) ? { id: x[0], parts: x[1] } : { id: x, parts: null })) };
}

export function sourceLabel(item, entry) {
  const ks = entryParts(item, entry);
  const q = ks === null || isWhole(item, entry) ? `Q${item.q}` : `Q${item.q}(${ks.map((k) => k.replace(/^P/, "Part ")).join("),(")})`;
  return `${item.y} ${item.s} ${item.tz} | Paper ${item.p} ${item.lv} | ${q}`;
}

// Marks available for a category under the current settings (shown before generating).
export function capacity(bank, cat, settings) {
  return bank.items
    .filter((it) => categoryOf(it) === cat && eligible(bank, it, settings))
    .reduce((s, it) => s + it.m, 0);
}

// Split pasted text into paper codes, re-joining codes that were broken across lines.
export function splitCodes(text, bank) {
  const toks = text.split(/\s+/).filter(Boolean);
  const codes = [], bad = [];
  let buf = "";
  for (const t of toks) {
    buf += t;
    try {
      const p = decodePaper(buf, bank);
      if (p.entries.length && !p.missing) { codes.push(buf); buf = ""; }
    } catch { /* keep joining */ }
    if (buf.length > 4000) { bad.push(buf.slice(0, 18)); buf = ""; }
  }
  if (buf) {
    try { const p = decodePaper(buf, bank); if (p.entries.length) codes.push(buf); else bad.push(buf.slice(0, 18)); }
    catch { bad.push(buf.slice(0, 18)); }
  }
  return { codes, bad };
}

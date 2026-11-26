// Shared state and UI pieces used by every tab.
import * as G from "./generator.js";

// pdf.js and the PDF builder are large; load them on first use so the page starts fast (and starts at all if one of them fails)
let pdfjsReady = null;
function loadPdfjs() {
  pdfjsReady ??= import("../vendor/pdf.min.mjs").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.mjs", import.meta.url).href;
    return m;
  });
  return pdfjsReady;
}

export const $ = (id) => document.getElementById(id);
export const state = {
  subjects: [], subjectId: null, bank: null, files: new Map(), pdfjs: new Map(),
  paper: null,        // the one paper both Generate and Pick manually work on
  settings: null,     // settings of the last generation (for Replace / Fill the gaps)
  listeners: [],
};
export const store = {
  get(k, d) { try { const v = localStorage.getItem("ibgen:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ibgen:" + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
export function onChange(fn) { state.listeners.push(fn); }
export function changed() { for (const fn of state.listeners) fn(); }
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function topicName(code) { return (state.bank.topics.find((t) => t.code === code) || {}).name || code; }
export function chips(codes) {
  return codes.map((t) => `<span class="chip ${t === "OUT" ? "out" : ""}" title="${esc(topicName(t))}">${t === "OUT" ? "not in syllabus" : t}</span>`).join("");
}
export function emptyPaper() { return { seed: "MANUAL", round: 1, targets: {}, entries: [], removed: [] }; }
export function ensurePaper() { if (!state.paper) state.paper = emptyPaper(); return state.paper; }

// ---------------- exclusions ----------------
export function exclusionList() { return store.get("excl:" + state.subjectId, []); }
export function saveExclusions(list) { store.set("excl:" + state.subjectId, list); changed(); }
export function excludedIds() {
  const ids = new Set();
  for (const x of exclusionList()) for (const id of x.ids) ids.add(id);
  return ids;
}

// ---------------- loading the user's folder ----------------
export function setLoadStatus(progress) {
  const b = state.bank;
  if (progress) { $("load-status").innerHTML = progress; return; }
  const got = state.files.size;
  if (!got) { $("load-status").innerHTML = `<span class="warn">No papers loaded yet.</span> You can still build and review a paper, but previews and PDF downloads need the folder.`; return; }
  const papers = new Set(b.items.map((i) => i.qf));
  const missing = [...papers].filter((fi) => !state.files.has(fi)).length;
  $("load-status").innerHTML = `<span class="ok">Matched ${got} of ${b.files.length} files.</span>` +
    (missing ? ` <span class="warn">${missing} question papers are missing, so their questions are skipped.</span>` : "");
}
async function sha256(file) {
  const h = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function indexFiles(list) {
  const b = state.bank;
  const bySize = new Map();
  b.files.forEach((f, i) => { if (!bySize.has(f.size)) bySize.set(f.size, []); bySize.get(f.size).push(i); });
  const pdfs = list.filter((f) => /\.pdf$/i.test(f.name));
  let done = 0;
  for (const f of pdfs) {
    done++;
    const cands = bySize.get(f.size) || [];
    if (!cands.length) continue;
    const byName = cands.filter((i) => b.files[i].name === f.name && !state.files.has(i));
    if (byName.length) { state.files.set(byName[0], f); continue; }
    if (done % 10 === 0) setLoadStatus(`Checking files… ${done}/${pdfs.length}`);
    const h = await sha256(f);
    for (const i of cands) if (b.files[i].sha256 === h && !state.files.has(i)) { state.files.set(i, f); break; }
  }
  setLoadStatus();
  changed();
}
export async function walkDrop(items) {
  const out = [];
  async function walk(entry) {
    if (entry.isFile) out.push(await new Promise((res, rej) => entry.file(res, rej)));
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const x of batch) await walk(x); } while (batch.length);
    }
  }
  for (const it of items) { const en = it.webkitGetAsEntry && it.webkitGetAsEntry(); if (en) await walk(en); }
  return out;
}

// ---------------- crops with pdf.js ----------------
async function pdfjsDoc(fi) {
  if (!state.pdfjs.has(fi)) {
    const f = state.files.get(fi);
    if (!f) return null;
    state.pdfjs.set(fi, Promise.all([f.arrayBuffer(), loadPdfjs()]).then(([buf, pdfjsLib]) => pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise));
  }
  return state.pdfjs.get(fi);
}
export async function renderRegion(fi, reg, scale) {
  const doc = await pdfjsDoc(fi);
  if (!doc) return null;
  const [p, x0, y0, x1, y1] = reg;
  const page = await doc.getPage(p + 1);
  const vp = page.getViewport({ scale });
  const [a, b, c, d] = vp.convertToViewportRectangle([x0, y0, x1, y1]);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(Math.abs(c - a)));
  canvas.height = Math.max(1, Math.round(Math.abs(d - b)));
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp, transform: [1, 0, 0, 1, -Math.min(a, c), -Math.min(b, d)] }).promise;
  return canvas;
}
export function questionRegions(it, e) {
  if (!it.parts) return it.r;
  const ks = e ? G.entryParts(it, e) : null;
  const keep = ks === null ? it.parts.map((x) => x.k) : ks;
  return [...(it.stem || []), ...it.parts.filter((x) => keep.includes(x.k)).flatMap((x) => x.r)];
}
function markschemeRegions(it, e) {
  let regs = it.ms || [];
  const ks = e ? G.entryParts(it, e) : null;
  if (it.parts && ks && !G.isWhole(it, e)) {
    const ps = it.parts.filter((x) => ks.includes(x.k));
    if (ps.every((x) => x.ms)) regs = [...(it.msStem || []), ...ps.flatMap((x) => x.ms)];
  }
  if (!regs.length && it.parts && it.parts.every((x) => x.ms)) regs = it.parts.flatMap((x) => x.ms);
  return regs;
}
// Lazy thumbnails: any element with data-thumb-id (item id) and optional data-thumb-entry (index in paper).
let observer = null;
export function observeThumbs(root) {
  if (!state.files.size) return;
  if (!observer) {
    observer = new IntersectionObserver(async (es) => {
      for (const en of es) {
        if (!en.isIntersecting) continue;
        observer.unobserve(en.target);
        const it = G.itemIndex(state.bank)[en.target.dataset.thumbId];
        if (!it) continue;
        const ei = en.target.dataset.thumbEntry;
        const e = ei !== undefined && state.paper ? state.paper.entries[+ei] : null;
        en.target.innerHTML = "";
        let h = 0;
        for (const r of questionRegions(it, e && e.id === it.id ? e : null)) {
          const cv = await renderRegion(it.qf, r, 0.6);
          if (!cv) { en.target.textContent = "This paper isn't in your folder"; break; }
          en.target.appendChild(cv);
          h += r[4] - r[2];
          if (h > 260) break;
        }
      }
    }, { rootMargin: "300px" });
  }
  root.querySelectorAll("[data-thumb-id]").forEach((el) => observer.observe(el));
}
let modalOpener = null;
export function closeModal() {
  if ($("modal").hidden) return;
  $("modal").hidden = true;
  document.documentElement.classList.remove("modal-open");
  if (modalOpener && modalOpener.isConnected) modalOpener.focus();
  modalOpener = null;
}
export async function openViewer(id, entry, title) {
  const it = G.itemIndex(state.bank)[id];
  const box = $("modal-content");
  const e = entry || { id, parts: null };
  const m = G.entryMarks(it, e);
  box.innerHTML = `<h3>${esc(title ? title + " - " : "")}${esc(G.sourceLabel(it, e))} [${m} mark${m === 1 ? "" : "s"}]</h3><div class="chips">${chips(it.t)}</div>`;
  if ($("modal").hidden) modalOpener = document.activeElement;
  $("modal").hidden = false;
  document.documentElement.classList.add("modal-open");
  $("modal-close").focus();
  if (!state.files.size) { box.insertAdjacentHTML("beforeend", "<p>Load your past-paper folder to see the question.</p>"); return; }
  for (const r of questionRegions(it, e)) { const c = await renderRegion(it.qf, r, 1.4); if (c) box.appendChild(c); }
  box.insertAdjacentHTML("beforeend", "<h3>Mark scheme</h3>");
  if (it.mcq) { box.insertAdjacentHTML("beforeend", `<p><b>Answer: ${esc(it.ans || "not found")}</b></p>`); return; }
  const regs = markschemeRegions(it, e);
  if (!regs.length) box.insertAdjacentHTML("beforeend", "<p>Mark scheme not found for this question.</p>");
  for (const r of regs) { const c = await renderRegion(it.mf, r, 1.4); if (c) box.appendChild(c); }
}

// ---------------- paper panel (shared by Generate review and Pick manually) ----------------
export function renderPaperPanel(container, mode) {
  const b = state.bank, p = state.paper;
  if (!p) { container.innerHTML = `<p class="hint">No paper yet. ${mode === "manual" ? "Tick questions on the left to add them." : ""}</p>`; return; }
  const idx = G.itemIndex(b);
  const tot = G.totals(b, p);
  const hasTargets = Object.values(p.targets || {}).some((v) => v > 0);
  const cats = G.CATEGORIES.filter((c) => (p.targets || {})[c.key] || tot[c.key]);
  const totalsHtml = cats.map((c) => {
    const have = tot[c.key] || 0, want = (p.targets || {})[c.key] || 0;
    if (!hasTargets) return `<div class="tot"><b>${c.label}</b>: ${have} marks</div>`;
    const cls = have === want ? "ok" : "short";
    const msg = have === want ? "exact" : have < want ? `${want - have} short` : `${have - want} over`;
    return `<div class="tot ${cls}"><b>${c.label}</b>: ${have}/${want} (${msg})</div>`;
  }).join("") + `<div class="tot"><b>Total</b>: ${Object.values(tot).reduce((a, x) => a + x, 0)} marks | ${p.entries.length} questions</div>`;
  const short = hasTargets && G.CATEGORIES.some((c) => (tot[c.key] || 0) < ((p.targets || {})[c.key] || 0));
  const canPdf = state.files.size > 0 && p.entries.length > 0;
  let html = `<div class="totals">${totalsHtml}</div>
    <div class="row wrap">
      ${mode === "generate" ? `<button class="btn primary" data-pact="fill" ${short && state.settings ? "" : "disabled"}>Fill the gaps (next round)</button>` : ""}
      <button class="btn" data-pact="dl-q" ${canPdf ? "" : "disabled"} title="${canPdf ? "" : "Load your past-paper folder first"}">Download question paper</button>
      <button class="btn" data-pact="dl-ms" ${canPdf ? "" : "disabled"}>Download mark scheme</button>
      <button class="btn" data-pact="copy" ${p.entries.length ? "" : "disabled"}>Copy paper code</button>
      <button class="btn" data-pact="load">Load a paper code</button>
      <button class="btn" data-pact="sort" ${p.entries.length > 1 ? "" : "disabled"}>Sort by paper type</button>
    </div>
    <p class="dl-msg" role="status" aria-live="polite"></p>`;
  if (mode === "generate") html += `<p class="hint">Remove or replace questions, or untick parts you don't want. Parts that a kept part depends on stay in. Then <b>Fill the gaps</b> tops each paper type back up with new questions. Removed questions don't come back.</p>`;
  const excl = excludedIds();
  let last = null;
  p.entries.forEach((e, i) => {
    const it = idx[e.id];
    if (!it) return;
    const cat = G.categoryOf(it);
    if (cat !== last) { html += `<div class="cat">${G.CATEGORIES.find((c) => c.key === cat).label}</div>`; last = cat; }
    const ks = G.entryParts(it, e);
    const keep = ks === null ? (it.parts || []).map((x) => x.k) : ks;
    const topics = it.parts ? [...new Set(it.parts.filter((x) => keep.includes(x.k)).flatMap((x) => x.t))] : it.t;
    const parts = it.parts && !it.mcq ? `<div class="parts">${it.parts.map((x) => `<label title="${esc(x.t.join(", "))}${x.n && x.n.length ? " | needs " + x.n.join(", ") : ""}"><input type="checkbox" data-part="${i}" value="${esc(x.k)}" ${keep.includes(x.k) ? "checked" : ""}> (${esc(x.k.replace(/^P/, "Part "))}) ${x.m}m</label>`).join("")}</div>` : "";
    const m = G.entryMarks(it, e);
    html += `<div class="entry"><div class="thumb" data-thumb-id="${esc(it.id)}" data-thumb-entry="${i}" data-pact="view" data-i="${i}" aria-hidden="true">${state.files.size ? "loading…" : "Load your folder to see a preview"}</div>
      <div class="meta"><div class="top"><span class="qn">Question ${i + 1}</span><span>[${m} mark${m === 1 ? "" : "s"}]</span><span class="src">${esc(G.sourceLabel(it, e))}${it.bk ? " | " + G.bookletName(b) : ""}</span>${excl.has(it.id) ? '<span class="flag">used before</span>' : ""}</div>
      <div class="chips">${chips(topics)}</div>${parts}
      <div class="actions">
        <button class="btn small" data-pact="up" data-i="${i}" ${i ? "" : "disabled"} title="Move up" aria-label="Move question ${i + 1} up">&uarr;</button>
        <button class="btn small" data-pact="down" data-i="${i}" ${i < p.entries.length - 1 ? "" : "disabled"} title="Move down" aria-label="Move question ${i + 1} down">&darr;</button>
        ${state.settings ? `<button class="btn small" data-pact="replace" data-i="${i}" aria-label="Replace question ${i + 1}">Replace</button>` : ""}
        <button class="btn small" data-pact="remove" data-i="${i}" aria-label="Remove question ${i + 1}">Remove</button>
        <button class="btn small" data-pact="view" data-i="${i}" aria-label="View question ${i + 1} with mark scheme">View with mark scheme</button></div></div></div>`;
  });
  container.innerHTML = html;
  observeThumbs(container);
}
export function wirePaperPanel(container) {
  container.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-pact]");
    if (!el || el.disabled) return;
    const act = el.dataset.pact, i = el.dataset.i !== undefined ? +el.dataset.i : null;
    const p = state.paper;
    if (act === "remove") { G.removeEntry(p, i); changed(); }
    else if (act === "replace") {
      const s = { ...state.settings, excludeIds: currentExcludeSet() };
      if (!G.replaceEntry(state.bank, p, i, s)) alert('No other question with the same marks fits these settings. The gap stays open; press "Fill the gaps" to fill it.');
      changed();
    } else if (act === "up" && i > 0) { [p.entries[i - 1], p.entries[i]] = [p.entries[i], p.entries[i - 1]]; changed(); }
    else if (act === "down" && i < p.entries.length - 1) { [p.entries[i + 1], p.entries[i]] = [p.entries[i], p.entries[i + 1]]; changed(); }
    else if (act === "view") openViewer(p.entries[i].id, p.entries[i], `Question ${i + 1}`);
    else if (act === "fill") {
      const s = { ...state.settings, excludeIds: currentExcludeSet() };
      const n = G.fillGaps(state.bank, p, s);
      changed();
      const short = Object.entries(G.gaps(state.bank, p)).filter(([, v]) => v > 0);
      if (!n || short.length) alert(short.length ? `Couldn't fill everything: ${short.map(([k, v]) => `${k} ${v} short`).join(", ")}. Not enough unused questions match these settings. Try more topics, a wider year range or a looser topic match in More options.` : "Nothing to fill.");
    } else if (act === "sort") { G.sortByCategory(state.bank, p); changed(); }
    else if (act === "copy") {
      const code = G.encodePaper(p, state.bank);
      try { await navigator.clipboard.writeText(code); alert("Paper code copied. Paste it into \"Load a paper code\" to rebuild this paper, or into Exclusions to keep its questions out of future papers."); }
      catch { prompt("Copy this paper code:", code); }
    } else if (act === "load") loadCodePrompt();
    else if (act === "dl-q" || act === "dl-ms") download(act === "dl-q" ? "q" : "ms", el);
  });
  container.addEventListener("change", (ev) => {
    const cb = ev.target.closest("[data-part]");
    if (!cb) return;
    const i = +cb.dataset.part;
    const keys = [...container.querySelectorAll(`[data-part="${i}"]`)].filter((x) => x.checked).map((x) => x.value);
    if (!keys.length) { cb.checked = true; return alert("Keep at least one part, or press Remove."); }
    G.setParts(state.bank, state.paper, i, keys);
    changed();
  });
}
export function currentExcludeSet() {
  const useEl = $("use-excl");
  return !useEl || useEl.checked ? excludedIds() : new Set();
}
export function loadCodePrompt() {
  const code = prompt("Paste a paper code:");
  if (!code) return;
  try {
    const p = G.decodePaper(code, state.bank);
    if (!p.entries.length) return alert("None of the questions in this code are in this subject's question bank.");
    if (p.missing) alert(`${p.missing} question(s) in this code aren't in this subject's question bank and were skipped.`);
    state.paper = p;
    changed();
  } catch { alert("That doesn't look like a paper code."); }
}
async function download(kind, btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "Building PDF…"; btn.setAttribute("aria-busy", "true");
  try {
    const p = state.paper;
    const code = G.encodePaper(p, state.bank);
    const { buildPdfs } = await import("./pdfbuild.js");
    const out = await buildPdfs(state.bank, p, async (fi) => {
      const f = state.files.get(fi);
      if (!f) throw new Error("Missing paper file: " + state.bank.files[fi].path);
      return new Uint8Array(await f.arrayBuffer());
    }, { showSource: btn.closest('.paperpanel[data-mode="manual"]') ? $("m-showsrc").checked : $("showsrc").checked, code });
    const bytes = kind === "q" ? out.questions : out.markscheme;
    const stamp = p.seed === "MANUAL" ? "manual" : `${p.seed}-r${p.round}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    a.download = `${state.bank.subject} paper ${stamp} - ${kind === "q" ? "questions" : "mark scheme"}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    const msg = btn.closest(".paperpanel")?.querySelector(".dl-msg");
    if (msg) msg.textContent = `Saved ${a.download} to your downloads.`;
  } catch (err) {
    alert("Couldn't build the PDF: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = label; btn.removeAttribute("aria-busy");
  }
}

import * as G from "./generator.js";
import { buildPdfs } from "./pdfbuild.js";
import * as pdfjsLib from "../vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.mjs", import.meta.url).href;

const $ = (id) => document.getElementById(id);
const WEIGHTS = { "A bit": 0.3, Normal: 1, "A lot": 2.5 };
const state = { subjects: [], bank: null, files: new Map(), paper: null, settings: null, pdfjs: new Map(), rest: "P2" };

// ---------------- persistence (light, per browser) ----------------
const store = {
  get(k, d) { try { const v = localStorage.getItem("ibgen:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ibgen:" + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ---------------- subject + bank ----------------
async function init() {
  state.subjects = await (await fetch("data/subjects.json")).json();
  $("subject").innerHTML = state.subjects.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
  $("subject").onchange = () => loadBank($("subject").value);
  $("seed").value = G.randomSeed();
  await loadBank(state.subjects[0].id);
}
async function loadBank(id) {
  const s = state.subjects.find((x) => x.id === id);
  state.bank = await (await fetch(s.bank)).json();
  state.files.clear();
  state.pdfjs.clear();
  state.paper = null;
  $("s-review").hidden = true;
  const years = state.bank.items.map((i) => i.y);
  $("yfrom").value = Math.max(Math.min(...years), state.bank.defaultYearFrom || 0);
  $("yto").value = Math.max(...years);
  renderTopics();
  renderMix();
  setLoadStatus();
}

// ---------------- folder loading ----------------
function setLoadStatus(progress) {
  const b = state.bank;
  const n = b.files.length, got = state.files.size;
  if (progress) { $("load-status").innerHTML = progress; return; }
  if (!got) { $("load-status").innerHTML = `<span class="warn">No papers loaded yet.</span> You can still generate and review a paper; previews and PDF downloads need the folder.`; return; }
  const papers = new Set(b.items.map((i) => i.qf));
  const missingPapers = [...papers].filter((fi) => !state.files.has(fi)).length;
  $("load-status").innerHTML = `<span class="ok">Matched ${got} of ${n} files.</span>` +
    (missingPapers ? ` <span class="warn">${missingPapers} question papers are missing; questions from them are skipped.</span>` : "");
}
async function sha256(file) {
  const buf = await file.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function indexFiles(list) {
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
  renderMix();
}
$("folder").onchange = (e) => indexFiles([...e.target.files]);
const drop = $("drop");
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = async (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const out = [];
  async function walk(entry) {
    if (entry.isFile) out.push(await new Promise((res, rej) => entry.file(res, rej)));
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const x of batch) await walk(x);
      } while (batch.length);
    }
  }
  for (const it of e.dataTransfer.items) { const en = it.webkitGetAsEntry && it.webkitGetAsEntry(); if (en) await walk(en); }
  indexFiles(out);
};

// ---------------- settings ----------------
function renderTopics() {
  const saved = store.get("topics:" + $("subject").value, null);
  $("topics").innerHTML = state.bank.topics.filter((t) => t.code !== "OUT").map((t) => {
    const on = saved ? saved[t.code] > 0 : true;
    const w = saved && saved[t.code] > 0 ? Object.keys(WEIGHTS).find((k) => WEIGHTS[k] === saved[t.code]) || "Normal" : "Normal";
    return `<div class="topic"><label><input type="checkbox" data-t="${t.code}" ${on ? "checked" : ""}> <b>${t.code}</b> ${t.name}</label>
      <select data-w="${t.code}">${Object.keys(WEIGHTS).map((k) => `<option ${k === w ? "selected" : ""}>${k}</option>`).join("")}</select></div>`;
  }).join("");
  $("topics").onchange = () => { store.set("topics:" + $("subject").value, readTopics()); renderMix(); };
}
function readTopics() {
  const t = {};
  document.querySelectorAll("[data-t]").forEach((cb) => {
    const w = document.querySelector(`[data-w="${cb.dataset.t}"]`).value;
    t[cb.dataset.t] = cb.checked ? WEIGHTS[w] : 0;
  });
  return t;
}
$("t-all").onclick = () => { document.querySelectorAll("[data-t]").forEach((c) => (c.checked = true)); $("topics").onchange(); };
$("t-none").onclick = () => { document.querySelectorAll("[data-t]").forEach((c) => (c.checked = false)); $("topics").onchange(); };

function currentSettings() {
  const targets = {};
  document.querySelectorAll("[data-mix]").forEach((i) => (targets[i.dataset.mix] = Math.max(0, parseInt(i.value || "0", 10))));
  return {
    topics: readTopics(), targets,
    yearFrom: parseInt($("yfrom").value, 10), yearTo: parseInt($("yto").value, 10),
    includeOld: $("old").checked, minShare: parseFloat($("share").value),
    seed: $("seed").value.trim() || G.randomSeed(),
    availableFiles: state.files.size ? new Set(state.files.keys()) : null,
  };
}
function renderMix() {
  const prev = {};
  document.querySelectorAll("[data-mix]").forEach((i) => (prev[i.dataset.mix] = i.value));
  const saved = store.get("mix", { MCQ: 20, P1B: 0, P2: 30, P3: 0, rest: "P2" });
  state.rest = prev.__rest || saved.rest || "P2";
  const s = currentSettingsSafe();
  $("mix").innerHTML = G.CATEGORIES.map((c) => {
    const cap = G.capacity(state.bank, c.key, s);
    const v = prev[c.key] ?? saved[c.key] ?? 0;
    return `<div class="mixbox"><div><b>${c.label}</b></div>
      <div class="row"><label>Marks <input data-mix="${c.key}" type="number" min="0" value="${v}"></label>
      <label><input type="radio" name="rest" value="${c.key}" ${state.rest === c.key ? "checked" : ""}> rest</label></div>
      <div class="cap">${cap} marks available with these settings${c.key === "MCQ" ? " (1 mark each)" : ""}</div></div>`;
  }).join("");
  updateTotal();
  $("mix").oninput = (e) => { if (e.target.name === "rest") state.rest = e.target.value; updateTotal(); saveMix(); };
}
function currentSettingsSafe() {
  try { return { ...currentSettings(), targets: {} }; } catch { return { topics: {}, includeOld: true, minShare: 0.5 }; }
}
function updateTotal() {
  let t = 0;
  document.querySelectorAll("[data-mix]").forEach((i) => (t += Math.max(0, parseInt(i.value || "0", 10))));
  $("total").value = t;
}
function saveMix() {
  const m = { rest: state.rest };
  document.querySelectorAll("[data-mix]").forEach((i) => (m[i.dataset.mix] = parseInt(i.value || "0", 10)));
  store.set("mix", m);
}
$("total").oninput = () => {
  const total = Math.max(0, parseInt($("total").value || "0", 10));
  let others = 0;
  document.querySelectorAll("[data-mix]").forEach((i) => { if (i.dataset.mix !== state.rest) others += parseInt(i.value || "0", 10); });
  const restBox = document.querySelector(`[data-mix="${state.rest}"]`);
  restBox.value = Math.max(0, total - others);
  saveMix();
};
["yfrom", "yto", "old", "share"].forEach((id) => ($(id).onchange = renderMix));
$("reseed").onclick = () => ($("seed").value = G.randomSeed());

$("generate").onclick = () => {
  const s = currentSettings();
  if (!Object.values(s.topics).some((w) => w > 0)) return alert("Pick at least one topic.");
  if (!Object.values(s.targets).some((m) => m > 0)) return alert("Give at least one paper type some marks.");
  state.settings = s;
  state.paper = G.generate(state.bank, s);
  renderReview();
  $("s-review").hidden = false;
  $("s-review").scrollIntoView({ behavior: "smooth" });
};

// ---------------- review ----------------
function topicName(code) { return (state.bank.topics.find((t) => t.code === code) || {}).name || code; }
function renderReview() {
  const b = state.bank, p = state.paper, idx = G.itemIndex(b);
  $("round").textContent = `Round ${p.round}`;
  const tot = G.totals(b, p);
  $("totals").innerHTML = G.CATEGORIES.filter((c) => p.targets[c.key] || tot[c.key]).map((c) => {
    const have = tot[c.key] || 0, want = p.targets[c.key] || 0;
    const cls = have === want ? "ok" : have < want ? "short" : "over";
    const msg = have === want ? "exact" : have < want ? `${want - have} short` : `${have - want} over`;
    return `<div class="tot ${cls}"><b>${c.label}</b>: ${have}/${want} (${msg})</div>`;
  }).join("") + `<div class="tot"><b>Total</b>: ${Object.values(tot).reduce((a, x) => a + x, 0)} marks</div>`;
  const shortAll = G.CATEGORIES.some((c) => (tot[c.key] || 0) < (p.targets[c.key] || 0));
  $("fill").disabled = !shortAll;
  const canPdf = state.files.size > 0;
  $("dl-q").disabled = $("dl-ms").disabled = !canPdf;
  $("dl-q").title = $("dl-ms").title = canPdf ? "" : "Load your past-paper folder first";
  let html = "", last = null;
  p.entries.forEach((e, i) => {
    const it = idx[e.id];
    const cat = G.categoryOf(it);
    if (cat !== last) { html += `<div class="cat">${G.CATEGORIES.find((c) => c.key === cat).label}</div>`; last = cat; }
    const ks = G.entryParts(it, e);
    const keep = ks === null ? (it.parts || []).map((x) => x.k) : ks;
    const topics = it.parts ? [...new Set(it.parts.filter((x) => keep.includes(x.k)).flatMap((x) => x.t))] : it.t;
    const chips = topics.map((t) => `<span class="chip ${t === "OUT" ? "out" : ""}" title="${topicName(t)}">${t === "OUT" ? "not in syllabus" : t}</span>`).join("");
    const parts = it.parts && !it.mcq ? `<div class="parts">${it.parts.map((x) => `<label title="${x.t.join(", ")}${x.n && x.n.length ? " | needs " + x.n.join(", ") : ""}"><input type="checkbox" data-part="${i}" value="${x.k}" ${keep.includes(x.k) ? "checked" : ""}> (${x.k.replace(/^P/, "Part ")}) ${x.m}m</label>`).join("")}</div>` : "";
    html += `<div class="entry"><div class="thumb" data-thumb="${i}">${state.files.size ? "loading…" : "load folder to preview"}</div>
      <div class="meta"><div class="top"><span class="qn">Question ${i + 1}</span><span>[${G.entryMarks(it, e)} mark${G.entryMarks(it, e) === 1 ? "" : "s"}]</span><span class="src">${G.sourceLabel(it, e)}${it.bk ? " | data booklet" : ""}</span></div>
      <div class="chips">${chips}</div>${parts}
      <div class="actions"><button class="btn small" data-act="replace" data-i="${i}">Replace</button><button class="btn small" data-act="remove" data-i="${i}">Remove</button><button class="btn small" data-act="view" data-i="${i}">View with mark scheme</button></div></div></div>`;
  });
  $("entries").innerHTML = html || "<p>No questions matched these settings.</p>";
  if (state.files.size) observeThumbs();
}
$("entries").onclick = async (ev) => {
  const btn = ev.target.closest("[data-act]") || ev.target.closest("[data-thumb]");
  if (!btn) return;
  const i = parseInt(btn.dataset.i ?? btn.dataset.thumb, 10);
  const act = btn.dataset.act || "view";
  if (act === "remove") { G.removeEntry(state.paper, i); renderReview(); }
  else if (act === "replace") {
    const ok = G.replaceEntry(state.bank, state.paper, i, state.settings);
    if (!ok) alert("No other question with the same marks fits these settings. The gap is left open: press \"Fill the gaps\" to fill it with whole questions and parts.");
    renderReview();
  } else if (act === "view") openViewer(i);
};
$("entries").onchange = (ev) => {
  const cb = ev.target.closest("[data-part]");
  if (!cb) return;
  const i = parseInt(cb.dataset.part, 10);
  const keys = [...document.querySelectorAll(`[data-part="${i}"]`)].filter((x) => x.checked).map((x) => x.value);
  if (!keys.length) { cb.checked = true; return alert("Keep at least one part, or press Remove."); }
  G.setParts(state.bank, state.paper, i, keys);
  renderReview();
};
$("fill").onclick = () => {
  const n = G.fillGaps(state.bank, state.paper, state.settings);
  renderReview();
  const g = G.gaps(state.bank, state.paper);
  const short = Object.entries(g).filter(([, v]) => v > 0);
  if (!n || short.length) alert(short.length ? `Could not fill everything: ${short.map(([k, v]) => `${k} ${v} short`).join(", ")}. Not enough unused questions match these settings.` : "Nothing to fill.");
};

// ---------------- rendering crops with pdf.js ----------------
async function pdfjsDoc(fi) {
  if (!state.pdfjs.has(fi)) {
    const f = state.files.get(fi);
    if (!f) return null;
    state.pdfjs.set(fi, f.arrayBuffer().then((buf) => pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise));
  }
  return state.pdfjs.get(fi);
}
async function renderRegion(fi, reg, scale) {
  const doc = await pdfjsDoc(fi);
  if (!doc) return null;
  const [p, x0, y0, x1, y1] = reg;
  const page = await doc.getPage(p + 1);
  const vp = page.getViewport({ scale });
  const [a, b, c, d] = vp.convertToViewportRectangle([x0, y0, x1, y1]);
  const minx = Math.min(a, c), miny = Math.min(b, d);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(Math.abs(c - a)));
  canvas.height = Math.max(1, Math.round(Math.abs(d - b)));
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp, transform: [1, 0, 0, 1, -minx, -miny] }).promise;
  return canvas;
}
function questionRegions(it, e) {
  if (!it.parts) return it.r;
  const ks = G.entryParts(it, e);
  const keep = ks === null ? it.parts.map((x) => x.k) : ks;
  return [...(it.stem || []), ...it.parts.filter((x) => keep.includes(x.k)).flatMap((x) => x.r)];
}
function observeThumbs() {
  const io = new IntersectionObserver(async (es) => {
    for (const en of es) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const i = parseInt(en.target.dataset.thumb, 10);
      const e = state.paper.entries[i];
      if (!e) continue;
      const it = G.itemIndex(state.bank)[e.id];
      en.target.innerHTML = "";
      let h = 0;
      for (const r of questionRegions(it, e)) { // preview the first ~260 pt of the question
        const cv = await renderRegion(it.qf, r, 0.6);
        if (!cv) { en.target.textContent = "paper not loaded"; break; }
        en.target.appendChild(cv);
        h += r[4] - r[2];
        if (h > 260) break;
      }
    }
  }, { rootMargin: "300px" });
  document.querySelectorAll("[data-thumb]").forEach((el) => io.observe(el));
}
async function openViewer(i) {
  const e = state.paper.entries[i];
  const it = G.itemIndex(state.bank)[e.id];
  const box = $("modal-content");
  box.innerHTML = `<h3>Question ${i + 1} - ${G.sourceLabel(it, e)} [${G.entryMarks(it, e)} mark${G.entryMarks(it, e) === 1 ? "" : "s"}]</h3>`;
  $("modal").hidden = false;
  if (!state.files.size) { box.innerHTML += "<p>Load your past-paper folder to see the question.</p>"; return; }
  for (const r of questionRegions(it, e)) { const c = await renderRegion(it.qf, r, 1.4); if (c) box.appendChild(c); }
  const h = document.createElement("h3"); h.textContent = "Mark scheme"; box.appendChild(h);
  if (it.mcq) { box.insertAdjacentHTML("beforeend", `<p><b>Answer: ${it.ans || "not found"}</b></p>`); return; }
  let regs = it.ms || [];
  const ks = G.entryParts(it, e);
  if (it.parts && ks && !G.isWhole(it, e)) {
    const ps = it.parts.filter((x) => ks.includes(x.k));
    if (ps.every((x) => x.ms)) regs = [...(it.msStem || []), ...ps.flatMap((x) => x.ms)];
  }
  if (!regs.length) box.insertAdjacentHTML("beforeend", "<p>Mark scheme not found for this question.</p>");
  for (const r of regs) { const c = await renderRegion(it.mf, r, 1.4); if (c) box.appendChild(c); }
}
$("modal-close").onclick = () => ($("modal").hidden = true);
$("modal").onclick = (e) => { if (e.target.id === "modal") $("modal").hidden = true; };

// ---------------- downloads + codes ----------------
async function download(kind) {
  const btn = kind === "q" ? $("dl-q") : $("dl-ms");
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "Building PDF…";
  try {
    const p = state.paper;
    const out = await buildPdfs(state.bank, p, async (fi) => {
      const f = state.files.get(fi);
      if (!f) throw new Error("Missing paper file: " + state.bank.files[fi].path);
      return new Uint8Array(await f.arrayBuffer());
    }, { showSource: $("showsrc").checked, paperId: `${p.seed}-r${p.round}` });
    const bytes = kind === "q" ? out.questions : out.markscheme;
    const name = `${state.bank.subject} paper ${p.seed}-r${p.round} - ${kind === "q" ? "questions" : "mark scheme"}.pdf`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  } catch (err) {
    alert("Could not build the PDF: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}
$("dl-q").onclick = () => download("q");
$("dl-ms").onclick = () => download("ms");
$("copy-code").onclick = async () => {
  const code = G.encodePaper(state.paper);
  try { await navigator.clipboard.writeText(code); alert("Paper code copied. Paste it into \"Load a paper code\" to get exactly this paper again."); }
  catch { prompt("Copy this paper code:", code); }
};
$("load-code").onclick = () => {
  const code = prompt("Paste a paper code:");
  if (!code) return;
  try {
    const p = G.decodePaper(code);
    const idx = G.itemIndex(state.bank);
    const bad = p.entries.filter((e) => !idx[e.id]);
    if (bad.length) return alert("This code is for a different subject or bank version.");
    state.paper = p;
    state.settings = state.settings || currentSettings();
    state.settings.seed = p.seed;
    renderReview();
    $("s-review").hidden = false;
  } catch { alert("That doesn't look like a paper code."); }
};

init();

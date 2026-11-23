// Pick manually: filter questions on the left, tick to add them to the paper on the right.
import * as G from "./generator.js";
import { $, state, store, changed, chips, esc, excludedIds, ensurePaper, emptyPaper, observeThumbs, openViewer, renderPaperPanel, wirePaperPanel } from "./core.js";
import { SHARE_OPTIONS } from "./tab-generate.js";

const PAGE = 25;
let shown = PAGE;
let shuffleKey = Math.random();

export function initManual() {
  $("m-share").innerHTML = SHARE_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  $("m-cats").innerHTML = G.CATEGORIES.map((c) => `<label class="chipbox"><input type="checkbox" data-mcat="${c.key}" checked> ${c.label}</label>`).join("");
  const refilter = () => { shown = PAGE; saveFilters(); renderResults(); };
  ["m-topics", "m-cats"].forEach((id) => ($(id).onchange = refilter));
  ["m-yfrom", "m-yto", "m-mmin", "m-mmax", "m-old", "m-share", "m-hideused", "m-sort"].forEach((id) => ($(id).onchange = refilter));
  $("m-sort").addEventListener("change", () => (shuffleKey = Math.random()));
  $("m-t-all").onclick = () => { document.querySelectorAll("[data-mt]").forEach((c) => (c.checked = true)); refilter(); };
  $("m-t-none").onclick = () => { document.querySelectorAll("[data-mt]").forEach((c) => (c.checked = false)); refilter(); };
  $("m-more").onclick = () => { shown += PAGE; renderResults(); };
  $("m-clear").onclick = () => {
    if (state.paper && state.paper.entries.length && !confirm("Clear the current paper and start an empty one?")) return;
    state.paper = emptyPaper();
    state.settings = null;
    changed();
  };
  $("m-results").addEventListener("change", (ev) => {
    const cb = ev.target.closest("[data-add]");
    if (!cb) return;
    const p = ensurePaper();
    const id = cb.dataset.add;
    if (cb.checked) { if (!p.entries.some((e) => e.id === id)) p.entries.push({ id, parts: null }); }
    else p.entries = p.entries.filter((e) => e.id !== id);
    changed();
  });
  $("m-results").addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-view]");
    if (t) openViewer(t.dataset.view, null);
  });
  wirePaperPanel(document.querySelector('.paperpanel[data-mode="manual"]'));
}

export function resetManual() {
  const saved = store.get("mfilters:" + state.subjectId, null);
  $("m-topics").innerHTML = state.bank.topics.filter((t) => t.code !== "OUT").map((t) =>
    `<label class="chipbox" title="${esc(t.name)}"><input type="checkbox" data-mt="${t.code}" ${saved && saved.topics && !saved.topics.includes(t.code) ? "" : "checked"}> ${t.code}</label>`).join("") +
    `<label class="chipbox" title="Questions or parts outside the current syllabus"><input type="checkbox" data-mt="OUT" ${saved && saved.topics && saved.topics.includes("OUT") ? "checked" : ""}> not in syllabus</label>`;
  const years = state.bank.items.map((i) => i.y);
  $("m-yfrom").value = saved?.yfrom ?? Math.max(Math.min(...years), state.bank.defaultYearFrom || 0);
  $("m-yto").value = saved?.yto ?? Math.max(...years);
  if (saved?.cats) document.querySelectorAll("[data-mcat]").forEach((c) => (c.checked = saved.cats.includes(c.dataset.mcat)));
  shown = PAGE;
}
function saveFilters() {
  store.set("mfilters:" + state.subjectId, {
    topics: [...document.querySelectorAll("[data-mt]")].filter((c) => c.checked).map((c) => c.dataset.mt),
    cats: [...document.querySelectorAll("[data-mcat]")].filter((c) => c.checked).map((c) => c.dataset.mcat),
    yfrom: $("m-yfrom").value, yto: $("m-yto").value,
  });
}

export function refreshManual() {
  renderResults();
  renderPaperPanel(document.querySelector('.paperpanel[data-mode="manual"]'), "manual");
}

function matches() {
  const b = state.bank;
  const topics = {};
  document.querySelectorAll("[data-mt]").forEach((c) => (topics[c.dataset.mt] = c.checked ? 1 : 0));
  const cats = new Set([...document.querySelectorAll("[data-mcat]")].filter((c) => c.checked).map((c) => c.dataset.mcat));
  const yf = +$("m-yfrom").value || 0, yt = +$("m-yto").value || 9999;
  const mmin = $("m-mmin").value === "" ? 0 : +$("m-mmin").value;
  const mmax = $("m-mmax").value === "" ? Infinity : +$("m-mmax").value;
  const share = parseFloat($("m-share").value);
  const old = $("m-old").checked;
  const hideUsed = $("m-hideused").checked;
  const excl = excludedIds();
  let list = b.items.filter((it) =>
    cats.has(G.categoryOf(it)) && it.y >= yf && it.y <= yt && it.m >= mmin && it.m <= mmax &&
    (old || !b.guideFirstExam || it.y >= b.guideFirstExam) &&
    (!hideUsed || !excl.has(it.id)) &&
    (!state.files.size || state.files.has(it.qf)) &&
    G.topicShare(it, topics) >= share);
  const sort = $("m-sort").value;
  const so = { May: 0, Nov: 1 };
  if (sort === "new") list.sort((a, c) => c.y - a.y || so[c.s] - so[a.s] || a.p.localeCompare(c.p) || a.tz.localeCompare(c.tz) || qnum(a) - qnum(c));
  else if (sort === "old") list.sort((a, c) => a.y - c.y || so[a.s] - so[c.s] || a.p.localeCompare(c.p) || a.tz.localeCompare(c.tz) || qnum(a) - qnum(c));
  else if (sort === "marks") list.sort((a, c) => c.m - a.m || c.y - a.y);
  else { const r = G.rng(String(shuffleKey)); list = list.map((x) => [r(), x]).sort((a, c) => a[0] - c[0]).map((x) => x[1]); }
  return list;
}
function qnum(it) { const m = String(it.q).match(/(\d+)/); return (m ? +m[1] : 0) + (/^[A-Z]/.test(it.q) ? (it.q.charCodeAt(0) - 64) * 100 : 0); }

function renderResults() {
  if (!state.bank) return;
  const list = matches();
  const inPaper = new Set((state.paper ? state.paper.entries : []).map((e) => e.id));
  const excl = excludedIds();
  const marks = list.reduce((s, it) => s + it.m, 0);
  $("m-count").textContent = `${list.length} questions match (${marks} marks).${state.files.size ? "" : " Load your folder to see previews."}`;
  $("m-results").innerHTML = list.slice(0, shown).map((it) => `
    <div class="result ${inPaper.has(it.id) ? "in" : ""}">
      <label class="add"><input type="checkbox" data-add="${esc(it.id)}" ${inPaper.has(it.id) ? "checked" : ""} aria-label="Add ${esc(G.sourceLabel(it, { id: it.id, parts: null }))}"> Add</label>
      <div class="thumb small" data-thumb-id="${esc(it.id)}" data-view="${esc(it.id)}" aria-hidden="true">${state.files.size ? "loading…" : ""}</div>
      <div class="meta">
        <div class="top"><span class="src2">${esc(G.sourceLabel(it, { id: it.id, parts: null }))}</span><span>[${it.m} mark${it.m === 1 ? "" : "s"}]</span>
          ${it.bk ? '<span class="hint">data booklet</span>' : ""}${excl.has(it.id) ? '<span class="flag">used before</span>' : ""}</div>
        <div class="chips">${chips(it.t)}</div>
        <button class="btn small" data-view="${esc(it.id)}">View with mark scheme</button>
      </div>
    </div>`).join("");
  $("m-more").hidden = shown >= list.length;
  observeThumbs($("m-results"));
}

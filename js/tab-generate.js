// Generate tab: settings, random generation, review rounds.
import * as G from "./generator.js";
import { $, state, store, changed, esc, excludedIds, currentExcludeSet, renderPaperPanel, wirePaperPanel, topicGroups, syncGroupBoxes } from "./core.js";

const WEIGHTS = { "A bit": 0.3, Normal: 1, "A lot": 2.5 };
export const SHARE_OPTIONS = [
  ["0.5", "At least half the question on my topics"],
  ["0.75", "Mostly on my topics"],
  ["1", "Every part on my topics"],
  ["0.01", "Any part on my topics"],
];
let rest = "P2"; // the paper type that "fill the rest" adjusts

export function initGenerate() {
  $("share").innerHTML = SHARE_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  $("seed").value = G.randomSeed();
  $("t-all").onclick = () => { document.querySelectorAll("[data-t]").forEach((c) => (c.checked = true)); topicsChanged(); };
  $("t-none").onclick = () => { document.querySelectorAll("[data-t]").forEach((c) => (c.checked = false)); topicsChanged(); };
  $("topics").onchange = (e) => {
    const g = e.target.dataset.tg, gw = e.target.dataset.tgw;
    const inGroup = (key) => [...document.querySelectorAll("[data-t]")].filter((c) => c.dataset.t.split(".")[0] === key);
    if (g !== undefined) inGroup(g).forEach((c) => (c.checked = e.target.checked));
    if (gw !== undefined && e.target.value) {
      inGroup(gw).forEach((c) => { c.checked = true; document.querySelector(`[data-w="${c.dataset.t}"]`).value = e.target.value; });
      e.target.value = "";
    }
    topicsChanged();
  };
  $("topics").onclick = (e) => {
    const b = e.target.closest("[data-tgc]");
    if (!b) return;
    const body = document.querySelector(`[data-tgbody="${b.dataset.tgc}"]`);
    body.hidden = !body.hidden;
    b.setAttribute("aria-expanded", String(!body.hidden));
    b.textContent = body.hidden ? "Show subtopics" : "Hide subtopics";
  };
  $("total").oninput = () => {
    const total = Math.max(0, parseInt($("total").value || "0", 10));
    let others = 0;
    document.querySelectorAll("[data-mix]").forEach((i) => { if (i.dataset.mix !== rest) others += parseInt(i.value || "0", 10); });
    document.querySelector(`[data-mix="${rest}"]`).value = Math.max(0, total - others);
    saveMix();
  };
  ["yfrom", "yto", "old", "share", "use-excl"].forEach((id) => ($(id).onchange = renderMix));
  $("reseed").onclick = () => ($("seed").value = G.randomSeed());
  $("generate").onclick = generate;
  wirePaperPanel(document.querySelector('.paperpanel[data-mode="generate"]'));
}

export function resetGenerate() {
  const saved = loadMix();
  rest = G.CATEGORIES.some((c) => c.key === saved.rest) ? saved.rest : (G.CATEGORIES.find((c) => c.key === "P2") || G.CATEGORIES[0]).key;
  $("mix").innerHTML = ""; // don't carry the previous subject's numbers over
  const years = state.bank.items.map((i) => i.y);
  $("yfrom").value = Math.max(Math.min(...years), state.bank.defaultYearFrom || 0);
  $("yto").value = Math.max(...years);
  renderTopics();
  renderMix();
}

export function refreshGenerate() {
  const n = excludedIds().size;
  $("excl-count").textContent = n ? `(${n} questions)` : "(none yet)";
  renderMix();
  const box = $("gen-review");
  if (state.paper && state.paper.seed !== "MANUAL") {
    box.hidden = false;
    box.querySelector(".round").textContent = `Round ${state.paper.round}`;
    renderPaperPanel(box.querySelector(".paperpanel"), "generate");
  } else box.hidden = true;
}

function renderTopics() {
  let saved = store.get("topics:" + state.subjectId, null);
  // a selection saved under an older topic list (e.g. Math's 5 topics before subtopics) doesn't apply
  if (saved && !state.bank.topics.some((t) => t.code in saved)) saved = null;
  const row = (t) => {
    const on = saved ? saved[t.code] > 0 : true;
    const w = saved && saved[t.code] > 0 ? Object.keys(WEIGHTS).find((k) => WEIGHTS[k] === saved[t.code]) || "Normal" : "Normal";
    return `<div class="topic"><label><input type="checkbox" data-t="${t.code}" ${on ? "checked" : ""}> <b>${t.code}</b> ${esc(t.name)}</label>
      <select data-w="${t.code}" aria-label="Weight for ${t.code} ${esc(t.name)}">${Object.keys(WEIGHTS).map((k) => `<option ${k === w ? "selected" : ""}>${k}</option>`).join("")}</select></div>`;
  };
  const groups = topicGroups(state.bank);
  $("topics").classList.toggle("grouped", !!groups);
  if (!groups) { $("topics").innerHTML = state.bank.topics.filter((t) => t.code !== "OUT").map(row).join(""); return; }
  $("topics").innerHTML = groups.map((g) => `<section class="tgroup">
      <div class="tg-head"><label><input type="checkbox" data-tg="${g.key}"> <b>${esc(g.key)}</b> ${esc(g.name)}</label>
        <span class="hint" data-count="${g.key}"></span>
        <select data-tgw="${g.key}" aria-label="Weight for every subtopic of ${esc(g.name)}"><option value="">Weight all…</option>${Object.keys(WEIGHTS).map((k) => `<option>${k}</option>`).join("")}</select>
        <button class="btn small" data-tgc="${g.key}" aria-expanded="false">Show subtopics</button></div>
      <div class="topics" data-tgbody="${g.key}" hidden>${g.topics.map(row).join("")}</div></section>`).join("");
  syncGroupBoxes($("topics"), "data-tg", "data-t");
}
function topicsChanged() { syncGroupBoxes($("topics"), "data-tg", "data-t"); store.set("topics:" + state.subjectId, readTopics()); renderMix(); }
function readTopics() {
  const t = {};
  document.querySelectorAll("[data-t]").forEach((cb) => {
    const w = document.querySelector(`[data-w="${cb.dataset.t}"]`).value;
    t[cb.dataset.t] = cb.checked ? WEIGHTS[w] : 0;
  });
  return t;
}
function currentSettings(withTargets = true) {
  const targets = {};
  if (withTargets) document.querySelectorAll("[data-mix]").forEach((i) => (targets[i.dataset.mix] = Math.max(0, parseInt(i.value || "0", 10))));
  return {
    topics: readTopics(), targets,
    yearFrom: parseInt($("yfrom").value, 10) || 0, yearTo: parseInt($("yto").value, 10) || 0,
    includeOld: $("old").checked, minShare: parseFloat($("share").value),
    seed: $("seed").value.trim() || G.randomSeed(),
    availableFiles: state.files.size ? new Set(state.files.keys()) : null,
    excludeIds: currentExcludeSet(),
  };
}
function renderMix() {
  if (!state.bank) return;
  const prev = {};
  document.querySelectorAll("[data-mix]").forEach((i) => (prev[i.dataset.mix] = i.value));
  const saved = loadMix();
  const s = currentSettings(false);
  $("mix").innerHTML = G.CATEGORIES.map((c) => {
    const cap = G.capacity(state.bank, c.key, s);
    const v = prev[c.key] ?? saved[c.key] ?? c.def ?? 0;
    return `<div class="mixbox"><div><b>${c.label}</b></div>
      <div class="row"><label>Marks <input data-mix="${c.key}" aria-label="Marks for ${c.label}" type="number" min="0" value="${v}"></label>
      <label title="Typing a total changes this box"><input type="radio" name="rest" value="${c.key}" aria-label="${c.label} fills the rest" ${rest === c.key ? "checked" : ""}> fill the rest</label></div>
      <div class="cap">${cap} marks available with these settings${c.key === "MCQ" ? " (1 mark each)" : ""}</div></div>`;
  }).join("");
  updateTotal();
  $("mix").oninput = (e) => { if (e.target.name === "rest") rest = e.target.value; updateTotal(); saveMix(); };
}
function updateTotal() {
  let t = 0;
  document.querySelectorAll("[data-mix]").forEach((i) => (t += Math.max(0, parseInt(i.value || "0", 10))));
  $("total").value = t;
}
function saveMix() {
  const m = { rest };
  document.querySelectorAll("[data-mix]").forEach((i) => (m[i.dataset.mix] = parseInt(i.value || "0", 10)));
  store.set("mix:" + state.subjectId, m);
}
// Marks per paper type, saved per subject (Physics falls back to the key used before subjects existed).
function loadMix() {
  const legacy = state.subjectId === "physics-hl" ? store.get("mix", null) : null;
  return store.get("mix:" + state.subjectId, null) || legacy || {};
}
function generate() {
  const s = currentSettings();
  if (!Object.values(s.topics).some((w) => w > 0)) return alert("Pick at least one topic.");
  if (!Object.values(s.targets).some((m) => m > 0)) return alert("Give at least one paper type some marks.");
  if (state.paper && state.paper.entries.length && !confirm("Replace the current paper with a new one?")) return;
  state.settings = s;
  state.paper = G.generate(state.bank, s);
  changed();
  $("gen-review").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

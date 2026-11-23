// Generate tab: settings, random generation, review rounds.
import * as G from "./generator.js";
import { $, state, store, changed, excludedIds, currentExcludeSet, renderPaperPanel, wirePaperPanel } from "./core.js";

const WEIGHTS = { "A bit": 0.3, Normal: 1, "A lot": 2.5 };
export const SHARE_OPTIONS = [
  ["0.5", "At least half the question on my topics"],
  ["0.75", "Mostly on my topics"],
  ["1", "Every part on my topics"],
  ["0.01", "Any part on my topics"],
];
let rest = "P2";

export function initGenerate() {
  $("share").innerHTML = SHARE_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  $("seed").value = G.randomSeed();
  $("t-all").onclick = () => { document.querySelectorAll("[data-t]").forEach((c) => (c.checked = true)); topicsChanged(); };
  $("t-none").onclick = () => { document.querySelectorAll("[data-t]").forEach((c) => (c.checked = false)); topicsChanged(); };
  $("topics").onchange = topicsChanged;
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
  const saved = store.get("topics:" + state.subjectId, null);
  $("topics").innerHTML = state.bank.topics.filter((t) => t.code !== "OUT").map((t) => {
    const on = saved ? saved[t.code] > 0 : true;
    const w = saved && saved[t.code] > 0 ? Object.keys(WEIGHTS).find((k) => WEIGHTS[k] === saved[t.code]) || "Normal" : "Normal";
    return `<div class="topic"><label><input type="checkbox" data-t="${t.code}" ${on ? "checked" : ""}> <b>${t.code}</b> ${t.name}</label>
      <select data-w="${t.code}" aria-label="Weight for ${t.code} ${t.name}">${Object.keys(WEIGHTS).map((k) => `<option ${k === w ? "selected" : ""}>${k}</option>`).join("")}</select></div>`;
  }).join("");
}
function topicsChanged() { store.set("topics:" + state.subjectId, readTopics()); renderMix(); }
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
  const saved = store.get("mix", { MCQ: 20, P1B: 0, P2: 30, P3: 0, rest: "P2" });
  rest = rest || saved.rest || "P2";
  const s = currentSettings(false);
  $("mix").innerHTML = G.CATEGORIES.map((c) => {
    const cap = G.capacity(state.bank, c.key, s);
    const v = prev[c.key] ?? saved[c.key] ?? 0;
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
  store.set("mix", m);
}
function generate() {
  const s = currentSettings();
  if (!Object.values(s.topics).some((w) => w > 0)) return alert("Pick at least one topic.");
  if (!Object.values(s.targets).some((m) => m > 0)) return alert("Give at least one paper type some marks.");
  if (state.paper && state.paper.entries.length && !confirm("Replace the current paper with a new one?")) return;
  state.settings = s;
  state.paper = G.generate(state.bank, s);
  changed();
  $("gen-review").scrollIntoView({ behavior: "smooth" });
}

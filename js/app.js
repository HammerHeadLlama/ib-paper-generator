import { $, state, onChange, indexFiles, walkDrop, setLoadStatus } from "./core.js";
import { initGenerate, resetGenerate, refreshGenerate } from "./tab-generate.js";
import { initManual, resetManual, refreshManual } from "./tab-manual.js";
import { initExclude, refreshExclude } from "./tab-exclude.js";

let current = "generate";

function showTab(name) {
  current = name;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tabpanel").forEach((p) => (p.hidden = p.id !== "tab-" + name));
  refresh();
}
function refresh() {
  if (!state.bank) return;
  refreshExclude();
  if (current === "generate") refreshGenerate();
  if (current === "manual") refreshManual();
}

async function loadBank(id) {
  state.subjectId = id;
  const s = state.subjects.find((x) => x.id === id);
  state.bank = await (await fetch(s.bank)).json();
  state.files.clear();
  state.pdfjs.clear();
  state.paper = null;
  state.settings = null;
  resetGenerate();
  resetManual();
  setLoadStatus();
  refresh();
}

async function init() {
  state.subjects = await (await fetch("data/subjects.json")).json();
  $("subject").innerHTML = state.subjects.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
  $("subject").onchange = () => loadBank($("subject").value);
  document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => showTab(t.dataset.tab)));
  document.querySelectorAll("[data-goto]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); showTab(a.dataset.goto); }));
  $("folder").onchange = (e) => indexFiles([...e.target.files]);
  const drop = $("drop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = async (e) => { e.preventDefault(); drop.classList.remove("over"); indexFiles(await walkDrop(e.dataTransfer.items)); };
  $("modal-close").onclick = () => ($("modal").hidden = true);
  $("modal").onclick = (e) => { if (e.target.id === "modal") $("modal").hidden = true; };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("modal").hidden = true; });
  initGenerate();
  initManual();
  initExclude();
  onChange(refresh);
  await loadBank(state.subjects[0].id);
}

init();

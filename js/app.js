import * as G from "./generator.js";
import { $, state, onChange, indexFiles, walkDrop, setLoadStatus, closeModal } from "./core.js";
import { initGenerate, resetGenerate, refreshGenerate } from "./tab-generate.js";
import { initManual, resetManual, refreshManual } from "./tab-manual.js";
import { initExclude, refreshExclude } from "./tab-exclude.js";

let current = "generate";

function showTab(name) {
  current = name;
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
  });
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
  G.setCategories(state.bank);
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
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    const tabs = [...document.querySelectorAll(".tab")];
    const i = tabs.indexOf(document.activeElement);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (i < 0 || j === undefined) return;
    e.preventDefault();
    const t = tabs[(j + tabs.length) % tabs.length];
    t.focus();
    showTab(t.dataset.tab);
  });
  document.querySelectorAll("[data-goto]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); showTab(a.dataset.goto); }));
  $("folder").onchange = (e) => indexFiles([...e.target.files]);
  $("files").onchange = (e) => indexFiles([...e.target.files]);
  const drop = $("drop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = async (e) => { e.preventDefault(); drop.classList.remove("over"); indexFiles(await walkDrop(e.dataTransfer.items)); };
  $("modal-close").onclick = closeModal;
  $("modal").onclick = (e) => { if (e.target.id === "modal") closeModal(); };
  document.addEventListener("keydown", (e) => {
    if ($("modal").hidden) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "Tab") { e.preventDefault(); $("modal-close").focus(); } // the close button is the only control inside
  });
  showTab("generate");
  initGenerate();
  initManual();
  initExclude();
  onChange(refresh);
  await loadBank(state.subjects[0].id);
  window.appReady = true;
}

init().catch((err) => window.bootFail && window.bootFail(err));

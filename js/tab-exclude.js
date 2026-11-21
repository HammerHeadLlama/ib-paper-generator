// Exclusions: paper codes whose questions the generator must skip.
import * as G from "./generator.js";
import { $, state, esc, exclusionList, saveExclusions } from "./core.js";

export function initExclude() {
  $("x-add").onclick = () => {
    const { codes: lines, bad } = G.splitCodes($("x-input").value, state.bank);
    if (!lines.length && !bad.length) return;
    const list = exclusionList();
    const msgs = bad.map((b) => `Not a paper code: ${b}…`);
    let added = 0;
    for (const code of lines) {
      if (list.some((x) => x.code === code)) { msgs.push(`Already on the list: ${short(code)}`); continue; }
      try {
        const p = G.decodePaper(code, state.bank);
        if (!p.entries.length) { msgs.push(`No questions from this subject in ${short(code)}`); continue; }
        list.push({ code, label: $("x-label").value.trim(), added: new Date().toISOString().slice(0, 10), ids: p.entries.map((e) => e.id) });
        added++;
        if (p.missing) msgs.push(`${p.missing} question(s) in ${short(code)} aren't in this bank and were skipped`);
      } catch { msgs.push(`Not a paper code: ${short(code)}`); }
    }
    saveExclusions(list);
    $("x-input").value = "";
    $("x-msg").innerHTML = `<span class="ok">Added ${added} paper${added === 1 ? "" : "s"}.</span>` + (msgs.length ? `<br><span class="warn">${msgs.map(esc).join("<br>")}</span>` : "");
  };
  $("x-add-current").onclick = () => {
    if (!state.paper || !state.paper.entries.length) return alert("There's no current paper yet.");
    $("x-input").value = G.encodePaper(state.paper, state.bank);
    $("x-add").onclick();
  };
  $("x-list").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-xdel]");
    if (!b) return;
    const list = exclusionList();
    list.splice(+b.dataset.xdel, 1);
    saveExclusions(list);
  });
}
function short(code) { return code.length > 18 ? code.slice(0, 18) + "…" : code; }

export function refreshExclude() {
  const list = exclusionList();
  const all = new Set(list.flatMap((x) => x.ids));
  $("excl-badge").hidden = !list.length;
  $("excl-badge").textContent = list.length;
  $("x-list").innerHTML = list.length ? `
    <p><b>${list.length} paper${list.length === 1 ? "" : "s"} excluded, ${all.size} questions.</b></p>
    <table class="xtable"><thead><tr><th>#</th><th>Label</th><th>Added</th><th>Questions</th><th>Code</th><th></th></tr></thead><tbody>
    ${list.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.label || "")}</td><td>${esc(x.added)}</td><td>${x.ids.length}</td>
      <td class="code" title="${esc(x.code)}">${esc(short(x.code))}</td><td><button class="btn small" data-xdel="${i}">Remove</button></td></tr>`).join("")}
    </tbody></table>` : `<p class="hint">No papers excluded yet.</p>`;
}

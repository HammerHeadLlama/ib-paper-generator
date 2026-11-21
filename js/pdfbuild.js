// Builds the question paper and the mark scheme as two PDFs by cropping regions out of the user's own past papers.
import { PDFDocument, StandardFonts, rgb, degrees } from "../vendor/pdf-lib.esm.min.js";
import { itemIndex, entryParts, entryMarks, isWhole, sourceLabel, categoryOf, CATEGORIES } from "./generator.js";

const A4 = [595.28, 841.89];
const M = 40;

class Layout {
  constructor(doc, fonts) {
    this.doc = doc; this.f = fonts; this.page = null; this.y = 0; this.pageNo = 0;
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.pageNo += 1;
    this.y = A4[1] - M;
    this.page.drawText(String(this.pageNo), { x: A4[0] / 2 - 4, y: 20, size: 9, font: this.f.reg, color: rgb(0.4, 0.4, 0.4) });
  }
  ensure(h) {
    if (!this.page || this.y - h < M) this.newPage();
  }
  text(s, size = 10, bold = false, color = rgb(0, 0, 0)) {
    const font = bold ? this.f.bold : this.f.reg;
    const maxW = A4[0] - 2 * M;
    const words = [];
    for (const w of s.split(" ")) { // break very long tokens (paper codes) to fit the line
      if (font.widthOfTextAtSize(w, size) <= maxW) { words.push(w); continue; }
      let chunk = "";
      for (const ch of w) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxW) { words.push(chunk); chunk = ""; }
        chunk += ch;
      }
      if (chunk) words.push(chunk);
    }
    let line = "";
    const lines = [];
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(t, size) > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    lines.push(line);
    for (const ln of lines) {
      this.ensure(size * 1.4);
      this.y -= size * 1.25;
      this.page.drawText(ln, { x: M, y: this.y, size, font, color });
      this.y -= size * 0.25;
    }
  }
  regionHeight(rot, reg) {
    const [, x0, y0, x1, y1] = reg;
    const r = ((rot || 0) % 360 + 360) % 360;
    const vw = r % 180 ? y1 - y0 : x1 - x0, vh = r % 180 ? x1 - x0 : y1 - y0;
    let sc = Math.min(1, (A4[0] - 2 * M) / vw);
    return Math.min(vh * sc, A4[1] - 2 * M);
  }
  bar(left, right, firstH = 40) {
    this.ensure(25 + firstH);
    this.y -= 6;
    this.page.drawRectangle({ x: M, y: this.y - 15, width: A4[0] - 2 * M, height: 15, color: rgb(0.92, 0.94, 0.98) });
    this.page.drawText(left, { x: M + 4, y: this.y - 11, size: 9.5, font: this.f.bold, color: rgb(0.1, 0.2, 0.5) });
    if (right) {
      const w = this.f.reg.widthOfTextAtSize(right, 8.5);
      this.page.drawText(right, { x: A4[0] - M - 4 - w, y: this.y - 11, size: 8.5, font: this.f.reg, color: rgb(0.3, 0.3, 0.4) });
    }
    this.y -= 19;
  }
  async region(src, rot, reg) {
    const [p, x0, y0, x1, y1] = reg;
    const sp = src.getPage(p);
    const emb = await this.doc.embedPage(sp, { left: x0, bottom: y0, right: x1, top: y1 });
    const r = ((rot || 0) % 360 + 360) % 360;
    const vw = r % 180 ? y1 - y0 : x1 - x0; // visual size
    const vh = r % 180 ? x1 - x0 : y1 - y0;
    const availW = A4[0] - 2 * M, availH = A4[1] - 2 * M;
    let sc = Math.min(1, availW / vw);
    if (vh * sc > availH) sc = availH / vh;
    const h = vh * sc, w = vw * sc;
    this.ensure(h);
    const X = M, Y = this.y - h; // bottom-left of the visual box
    const opt = { xScale: sc, yScale: sc };
    if (r === 0) this.page.drawPage(emb, { ...opt, x: X, y: Y });
    else if (r === 90) this.page.drawPage(emb, { ...opt, x: X, y: Y + h, rotate: degrees(-90) });
    else if (r === 180) this.page.drawPage(emb, { ...opt, x: X + w, y: Y + h, rotate: degrees(180) });
    else this.page.drawPage(emb, { ...opt, x: X + w, y: Y, rotate: degrees(90) });
    this.y -= h + 3;
  }
}

function regionsForQuestion(item, entry) {
  const ks = entryParts(item, entry);
  if (!item.parts) return item.r;
  const keep = ks === null ? item.parts.map((p) => p.k) : ks;
  return [...(item.stem || []), ...item.parts.filter((p) => keep.includes(p.k)).flatMap((p) => p.r)];
}
function regionsForMarkscheme(item, entry) {
  if (item.mcq) return { regs: [], note: item.ans ? `Answer: ${item.ans}` : "Answer not found in the mark scheme." };
  const ks = entryParts(item, entry);
  if (item.parts && ks !== null && !isWhole(item, entry)) {
    const ps = item.parts.filter((p) => ks.includes(p.k));
    if (ps.every((p) => p.ms && p.ms.length)) return { regs: [...(item.msStem || []), ...ps.flatMap((p) => p.ms)], note: null };
    if (item.ms) return { regs: item.ms, note: "Mark scheme for the selected parts could not be separated: full mark scheme for this question shown." };
    return { regs: [], note: "Mark scheme not found for this question." };
  }
  if (item.ms) return { regs: item.ms, note: null };
  if (item.parts && item.parts.every((p) => p.ms)) return { regs: item.parts.flatMap((p) => p.ms), note: null };
  return { regs: [], note: "Mark scheme not found for this question." };
}

// getFile(fileIndex) -> Promise<Uint8Array | ArrayBuffer>
export async function buildPdfs(bank, paper, getFile, opts = {}) {
  const idx = itemIndex(bank);
  const cache = new Map();
  async function src(fi) {
    if (!cache.has(fi)) cache.set(fi, PDFDocument.load(await getFile(fi), { ignoreEncryption: true, updateMetadata: false }));
    return cache.get(fi);
  }
  const rotOf = (fi, p) => (bank.files[fi].rot || {})[p] || 0;
  const total = paper.entries.reduce((s, e) => s + entryMarks(idx[e.id], e), 0);
  const booklet = paper.entries.some((e) => idx[e.id].bk);
  const title = opts.title || `${bank.subject} practice paper`;
  const codeLine = opts.code ? `Paper code: ${opts.code}` : opts.paperId ? `Paper ID: ${opts.paperId}` : "";

  async function make(kind) {
    const doc = await PDFDocument.create();
    const fonts = { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
    const L = new Layout(doc, fonts);
    L.newPage();
    L.text(kind === "q" ? title : `${title} - mark scheme`, 15, true);
    L.text(`Total: ${total} marks | ${paper.entries.length} questions${booklet && kind === "q" ? " | Data booklet required" : ""}`, 10);
    if (codeLine) L.text(codeLine, 8, false, rgb(0.4, 0.4, 0.4));
    L.y -= 6;
    let n = 0, lastCat = null;
    for (const e of paper.entries) {
      const it = idx[e.id];
      const cat = categoryOf(it);
      if (cat !== lastCat) {
        L.ensure(80);
        L.y -= 8;
        L.text(CATEGORIES.find((c) => c.key === cat).label, 11, true, rgb(0.15, 0.15, 0.15));
        lastCat = cat;
      }
      n += 1;
      const marks = entryMarks(it, e);
      const showSrc = kind === "ms" || opts.showSource !== false;
      let firstH = 30;
      if (kind === "q") { const r0 = regionsForQuestion(it, e)[0]; if (r0) firstH = L.regionHeight(rotOf(it.qf, r0[0]), r0); }
      else { const m0 = regionsForMarkscheme(it, e); if (m0.regs[0]) firstH = L.regionHeight(rotOf(it.mf, m0.regs[0][0]), m0.regs[0]) + (m0.note ? 15 : 0); }
      L.bar(`Question ${n}   [${marks} mark${marks === 1 ? "" : "s"}]`, showSrc ? sourceLabel(it, e) : "", firstH);
      if (kind === "q") {
        const s = await src(it.qf);
        for (const r of regionsForQuestion(it, e)) await L.region(s, rotOf(it.qf, r[0]), r);
      } else {
        const { regs, note } = regionsForMarkscheme(it, e);
        if (note) L.text(note, note.startsWith("Answer:") ? 11 : 9, note.startsWith("Answer:"), note.startsWith("Answer:") ? rgb(0, 0, 0) : rgb(0.7, 0.1, 0.1));
        if (regs.length) {
          const s = await src(it.mf);
          for (const r of regs) await L.region(s, rotOf(it.mf, r[0]), r);
        }
      }
      L.y -= 6;
    }
    return doc.save();
  }
  return { questions: await make("q"), markscheme: await make("ms") };
}

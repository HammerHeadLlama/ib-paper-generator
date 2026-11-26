#!/usr/bin/env python3
"""Export a question bank for the paper generator from an ibsort work folder.

The bank holds NO exam text: only metadata (year, paper, question number, marks, topics, data-booklet flag,
multiple-choice answer letter) and the position of each question and mark-scheme entry inside the ORIGINAL
past-paper PDFs. The website crops those positions out of the user's own copies of the papers.

Usage: python3 -I export_bank.py --work <ibsort work dir> --input <original papers folder> --out data/physics-hl.json
Coordinates: [page_index, x0, y0, x1, y1] in PDF user space of the original file (origin bottom-left),
plus a per-page rotation table for pages carrying /Rotate.
"""
import argparse, hashlib, json, os
from pathlib import Path

import pymupdf as fitz


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


class FileTable:
    def __init__(self, input_root):
        self.root = Path(input_root)
        self.files, self.index, self.docs = [], {}, {}

    def key(self, rel):
        # rel is relative to the ibsort raw folder, e.g. "input/2019 May Examination Session/x.pdf"
        rel = rel.split("/", 1)[1] if rel.startswith("input/") else rel
        if rel not in self.index:
            p = self.root / rel
            doc = fitz.open(p)
            rot = {i: pg.rotation for i, pg in enumerate(doc) if pg.rotation}
            self.index[rel] = len(self.files)
            self.files.append({"path": rel, "name": Path(rel).name, "size": p.stat().st_size, "sha256": sha256(p),
                               "pages": doc.page_count, "rot": rot})
            self.docs[rel] = doc
        return self.index[rel]

    def doc(self, rel):
        rel = rel.split("/", 1)[1] if rel.startswith("input/") else rel
        return self.docs[rel]


def to_pdf_space(doc, p, x0, y0, x1, y1):
    """Visual top-left coords (as measured on the rotation-normalised copy) -> unrotated PDF user space."""
    page = doc[p]
    r = fitz.Rect(x0, y0, x1, y1)
    if page.rotation:
        r = r * page.derotation_matrix  # visual -> unrotated MuPDF space
    r = r * ~page.transformation_matrix  # MuPDF space -> PDF user space (y up)
    r.normalize()
    return [p, round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1)]


def regions(doc, ext, regs):
    out = []
    for p, top, bot in regs:
        e = ext[p] if ext and ext[p] else None
        pw = doc[p].rect.width
        x0 = max(0, e[0] - 6) if e else 0
        x1 = min(pw, e[2] + 6) if e else pw
        out.append(to_pdf_space(doc, p, x0, top, x1, bot))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--subject", default="Physics HL")
    ap.add_argument("--default-year-from", type=int, default=0, help="first year selected by default in the site")
    ap.add_argument("--categories", help='JSON list of paper types, e.g. [{"key":"P1","label":"Paper 1","def":30}] (default: the Physics set)')
    ap.add_argument("--groups", help='JSON object naming topic groups by code prefix, e.g. {"1": "Number and algebra"}; the site then groups subtopics with a tick-all')
    ap.add_argument("--booklet", default="data booklet", help='what the site calls the booklet, e.g. "formula booklet"')
    a = ap.parse_args()
    work = Path(a.work)
    topics = json.loads((work / "topics.json").read_text())
    papers = json.loads((work / "papers.json").read_text())["papers"]
    state = json.loads((work / "state.json").read_text())["papers"]
    ft = FileTable(a.input)
    items, skipped = [], []
    for pid in sorted(papers):
        st = state.get(pid, {}).get("stage")
        if st != "classified":
            skipped.append([pid, st])
            continue
        seg = json.loads((work / "papers" / pid / "segments.json").read_text())
        cl = json.loads((work / "papers" / pid / "classes.json").read_text())
        m = seg["meta"]
        qf = ft.key(m["qp"])
        qdoc = ft.doc(m["qp"])
        mf = ft.key(m["ms"]) if m["ms"] else None
        mdoc = ft.doc(m["ms"]) if m["ms"] else None
        nodes = {n["id"]: n for n in seg["qp_nodes"]}
        msn = {n["id"]: n for n in seg["ms_nodes"]}
        for q in [n for n in seg["qp_nodes"] if n["level"] == 0]:
            qid = q["id"]
            e = cl["questions"][qid]
            kids = [k for k in seg["qp_nodes"] if k["level"] == 1 and k["id"].startswith(qid + ".")]
            it = {"id": f"{pid}:{qid}", "y": m["year"], "s": m["session"], "tz": m["tz"], "p": m["paper"],
                  "lv": m["level"], "q": qid, "mcq": bool(seg["mcq"]), "qf": qf, "mf": mf,
                  "bk": bool(e.get("booklet")), "kw": bool(e.get("keep_whole"))}
            if kids:
                it["stem"] = regions(qdoc, seg["qp_ext"], q.get("stem", []))
                parts = []
                for k in kids:
                    key = k["id"].split(".", 1)[1]
                    pv = e["parts"][key]
                    part = {"k": key, "m": k["marks"], "t": pv["topics"], "n": pv.get("needs", []),
                            "r": regions(qdoc, seg["qp_ext"], k["regions"])}
                    if mdoc is not None and k["id"] in msn:
                        part["ms"] = regions(mdoc, seg["ms_ext"], msn[k["id"]]["regions"])
                    parts.append(part)
                it["parts"] = parts
                it["m"] = q.get("max_mark", sum(p["m"] for p in parts))
                it["t"] = sorted({t for p in parts for t in p["t"]})
            else:
                pv = e["parts"]["_"]
                it["r"] = regions(qdoc, seg["qp_ext"], q["regions"])
                it["m"] = q.get("max_mark", q["marks"]) or (1 if seg["mcq"] else 0)
                it["t"] = pv["topics"]
            if seg["mcq"]:
                it["ans"] = seg["mcq_key"].get(qid)
            elif mdoc is not None and qid in msn:
                it["ms"] = regions(mdoc, seg["ms_ext"], msn[qid]["regions"])
                if msn[qid].get("stem"):
                    it["msStem"] = regions(mdoc, seg["ms_ext"], msn[qid]["stem"])
            items.append(it)
    bank = {"format": 1, "subject": a.subject, "guide": topics.get("guide"), "guideFirstExam": topics.get("guide_first_exam"),
            "topics": topics["topics"] + [{"code": "OUT", "name": "Not in current syllabus"}],
            "files": ft.files, "items": items, "skipped": skipped, "defaultYearFrom": a.default_year_from,
            "booklet": a.booklet}
    if a.categories:
        bank["categories"] = json.loads(a.categories)
    if a.groups:
        bank["groups"] = json.loads(a.groups)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(bank, separators=(",", ":")))
    print(f"{len(items)} items from {len(ft.files)} files -> {a.out} ({os.path.getsize(a.out) / 1e6:.1f} MB); skipped {skipped}")


if __name__ == "__main__":
    main()

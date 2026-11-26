# IB Past Paper Generator

Builds a practice paper out of **real IB past-paper questions**. Pick the topics, the paper types and the marks, review the paper, then download two PDFs: the question paper and its mark scheme.

Nothing is generated or rewritten: every question, diagram and mark-scheme entry is cropped straight from the original past papers.

## Using it

**Pick the subject** (Physics HL, Chemistry HL or Math AA HL), then **load your past papers** (top of the page): click *Choose past-paper folder* and pick that subject's folder of IB past papers (one subfolder per exam session). Files are matched by size and SHA-256 fingerprint, so renamed or reorganised folders still work. Your PDFs never leave your computer.

The page has four tabs:

### Generate
- **Topics**: the list changes with the subject: Physics subtopics A.1 … E.5 plus *TOOLS*, Chemistry S1.1 … R3.4, Math AA topics 1–5. Each is weighted *A bit*, *Normal* or *A lot*.
- **Marks by paper type**: also per subject. Physics and Chemistry: multiple choice (Paper 1 / 1A, 1 mark each), Paper 1B, Paper 2 and Paper 3. Math AA: Papers 1, 2 and 3. Any of them can be 0. Typing a **total** adjusts the type ticked *fill the rest*.
- **Options**: year range, older-syllabus questions on or off, how strictly a question must match your topics, whether the question paper shows sources, and whether to skip questions from excluded papers.
- **Generate**: whole questions are picked at random across years, then stand-alone parts top up the last few marks, so each total is exact when enough questions exist.
- **Review rounds**: **Remove**, **Replace** (same marks), untick parts to keep only some of a question, reorder, or **View with mark scheme**. Then **Fill the gaps** brings each paper type back to its marks with new questions. Removed questions never come back.

### Pick manually
A split view. On the left, filter by topics, paper type, years, marks and syllabus, and tick questions to add them. On the right is your paper: reorder, remove, keep only some parts, view, and download. It's the same paper as the Generate tab, so you can generate first and fine-tune by hand. Questions from excluded papers are marked *used before*.

### Exclusions
Paste the **paper codes** of papers you've already used, as many as you like. Their questions are then skipped by the generator. Every generated PDF prints its paper code at the top, and *Copy paper code* gives it too. Codes copied from a PDF with line breaks still work. Exclusions are saved in your browser.

### How it works
A plain-language explanation of the random picker.

### Paper codes vs seeds
A **seed** drives the randomness: the same settings and seed give the same first-round paper. A **paper code** records the exact final questions and kept parts, so it's what you use to rebuild a paper (*Load a paper code*) or exclude it.

## Copyright

IB past papers and mark schemes are copyright of the International Baccalaureate Organization. **This repository contains none of them.** `data/*.json` holds only metadata: year, session, paper, question number, marks, syllabus topics, the data-booklet flag, multiple-choice answer letters, and the page positions of each question and mark-scheme entry. Each user supplies their own copies of the papers.

## How it works

- `data/subjects.json` lists the subjects in the dropdown. Each points to a question bank (`data/physics-hl.json`, `data/chemistry-hl.json`, `data/math-aa-hl.json`). A bank can list its own paper types (`categories`) and booklet name (`booklet`); without them it gets the Physics paper types. Don't reorder an existing subject's paper types: paper codes depend on that order.
- Each bank holds every question Each question has its topics per part, which parts depend on which (`needs`), the marks, and where it sits in the original PDF (page and rectangle in PDF coordinates).
- `js/generator.js`: seeded random selection, exact mark totals (whole questions plus a small subset-sum over stand-alone parts), replace, partial questions, fill-the-gaps rounds and paper codes. Pure JavaScript with no page code, so it also runs in Node.
- `js/pdfbuild.js` crops the regions out of the original PDFs as vector graphics with [pdf-lib](https://github.com/Hopding/pdf-lib).
- `js/app.js`, `js/core.js` and `js/tab-*.js` are the page (tabs, folder loading, previews with [pdf.js](https://github.com/mozilla/pdf.js), the shared paper panel).
- `tools/export_bank.py` builds a bank from an `ibsort` run (`--categories` and `--booklet` set the paper types and booklet name). That's the pipeline that split the papers into questions and classified each part against the subject guide.

Run locally with any static server, e.g. `python3 -m http.server` in this folder, then open http://localhost:8000. Opening `index.html` directly from disk won't work, because browsers block module scripts from `file://`.

## Current banks

Files are matched by size and SHA-256, so load the subject's folder as downloaded (Physics_HL, Chemistry_HL, Math_HL).

**Physics HL**: 219 papers (1999–2025), 5,045 questions, classified against the Physics guide for first assessment 2025.
- Paper 1B only exists from 2025, so there are few 1B questions.
- 1999 papers are scans: some question boundaries and marks are unreliable, so the year range starts at 2000 by default.
- Mark schemes for a small number of questions (mostly 1999–2001 options) could not be located; their mark-scheme entry says so.

**Chemistry HL**: 201 papers (2000–2025), 4,821 questions, classified against the Chemistry guide for first assessment 2025.
- Paper 3 (options) is from the older syllabus, last set in 2024. The 2025 syllabus has Papers 1A, 1B and 2.

**Math AA HL**: 271 papers (2000–2025), 2,484 questions, classified against the five topics of the Math: analysis and approaches guide (first assessment 2021).
- Before 2021 this was Mathematics HL; its Paper 3 option papers (statistics, sets, series, discrete) count as Paper 3.
- Questions needing the formula booklet are flagged, and the PDF says "Formula booklet required".

## Licences

Code: MIT. Bundled libraries: pdf-lib (MIT) and pdf.js (Apache-2.0). Their licence files are in `vendor/`.

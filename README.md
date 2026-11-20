# IB Past Paper Generator

Builds a practice paper out of **real IB past-paper questions**. Pick the topics, the paper types and the marks, review the paper, then download two PDFs: the question paper and its mark scheme.

Nothing is generated or rewritten: every question, diagram and mark-scheme entry is cropped straight from the original past papers.

## Using it

1. **Load your past papers.** Click *Choose past-paper folder* and pick the folder of IB past papers (one subfolder per exam session, e.g. `2019 May Examination Session`). The page matches files by size and SHA-256 fingerprint, so renamed or reorganised folders still work.
   Your PDFs never leave your computer: they are read in the browser only.
2. **Settings**
   - **Topics**: tick any syllabus subtopics (A.1 … E.5, plus *TOOLS* for uncertainty and graphing questions). Set a weight of *A bit* or *A lot* to get fewer or more questions from a topic.
   - **Marks by paper type**: marks for multiple choice (Paper 1 / 1A, 1 mark each), Paper 1B, Paper 2 and Paper 3. Any of them can be 0. Typing a **total** adjusts the type marked *rest*.
   - **Options**: year range, whether to include older-syllabus questions, how strictly a question must match your topics, and whether the question paper shows each question's source.
   - **Seed**: the same settings with the same seed give the same paper.
3. **Generate.** Whole questions are picked first, at random across years. Stand-alone parts (parts that don't depend on earlier ones) top up the last few marks, so each paper type hits its marks exactly when enough questions exist.
4. **Review (rounds).** For each question you can:
   - **Remove** it, or **Replace** it with another question worth the same marks;
   - untick parts to keep only some of a question (parts it depends on stay in);
   - **View with mark scheme**.

   Then press **Fill the gaps** to start the next round: it brings each paper type back to its marks with new questions. Removed questions never come back.
5. **Download** the question paper and the mark scheme as separate PDFs. **Copy paper code** saves the exact paper, edits included; *Load a paper code* rebuilds it, so a teacher can give a whole class the same paper.

## Copyright

IB past papers and mark schemes are copyright of the International Baccalaureate Organization. **This repository contains none of them.** `data/*.json` holds only metadata: year, session, paper, question number, marks, syllabus topics, the data-booklet flag, multiple-choice answer letters, and the page positions of each question and mark-scheme entry. Each user supplies their own copies of the papers.

## How it works

- `data/physics-hl.json` is the question bank. Each question has its topics per part, which parts depend on which (`needs`), the marks, and where it sits in the original PDF (page and rectangle in PDF coordinates).
- `js/generator.js`: seeded random selection, exact mark totals (whole questions plus a small subset-sum over stand-alone parts), replace, partial questions, fill-the-gaps rounds and paper codes. Pure JavaScript with no page code, so it also runs in Node.
- `js/pdfbuild.js` crops the regions out of the original PDFs as vector graphics with [pdf-lib](https://github.com/Hopding/pdf-lib).
- `js/app.js` is the page, using [pdf.js](https://github.com/mozilla/pdf.js) for previews.
- `tools/export_bank.py` builds a bank from an `ibsort` run. That's the pipeline that split the papers into questions and classified each part against the subject guide.

Run locally with any static server, e.g. `python3 -m http.server` in this folder, then open http://localhost:8000. Opening `index.html` directly from disk won't work, because browsers block module scripts from `file://`.

## Current bank: Physics HL

- 219 papers (1999–2025, HL), 5,045 questions, classified against the Physics guide for first assessment 2025.
- Paper 1B only exists from 2025, so there are few 1B questions.
- 1999 papers are scans: some question boundaries and marks are unreliable, so the year range starts at 2000 by default.
- Mark schemes for a small number of questions (mostly 1999–2001 options) could not be located; their mark-scheme entry says so.

## Licences

Code: MIT. Bundled libraries: pdf-lib (MIT) and pdf.js (Apache-2.0). Their licence files are in `vendor/`.

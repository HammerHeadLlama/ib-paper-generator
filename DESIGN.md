# DESIGN.md — IB Past Paper Generator

Direction: **Exam Hall**. The page should feel like a real IB paper on a desk: black ink on paper-white, thin rules, one navy accent, nothing decorative.

- **Who:** IB Diploma students and teachers, in long focused sessions on laptops and phones.
- **Mode:** a tool (Operate). Scanability and calm beat expression. Brand lives in precise details: serif question numbers, right-aligned `[marks]`, rule lines like a paper's section breaks.
- **Light only.** The question crops are white PDF images, so the page around them stays paper-coloured.

## Tokens

Copy this block to the top of `css/style.css`. Components use these names, never raw values.

```css
:root {
  /* colour: surfaces */
  --desk:        #F3F1EA;  /* page background */
  --paper:       #FFFEFA;  /* cards, question rows, viewer */
  --paper-sunk:  #F8F6F0;  /* hover / inset areas on paper */

  /* colour: ink */
  --ink:         #17191E;  /* text, strong rules      17.4:1 on paper */
  --ink-muted:   #585D66;  /* hints, sources, labels   6.6:1 on paper, 5.9:1 on desk */
  --rule:        #DCD7CB;  /* hairlines, card borders (decorative) */
  --field:       #8A857A;  /* input/checkbox borders   3.6:1 on paper (non-text 3:1) */

  /* colour: accent (navy) */
  --accent:      #1F3A8A;  /* primary buttons, links, active tab  10.3:1 on paper */
  --accent-hover:#18306F;
  --on-accent:   #FFFFFF;  /* text on accent           10.3:1 */
  --accent-tint: #E7EBF5;  /* chips, selected states; accent text on it 8.7:1 */

  /* colour: status */
  --ok:          #1D6A39;  /* exact, saved             6.6:1 on paper */
  --ok-tint:     #EAF3EC;
  --warn:        #9C3D0C;  /* short, used before       6.7:1 on paper */
  --warn-tint:   #FBEFE6;
  --danger:      #B42318;  /* not in syllabus, errors  6.5:1 on paper */
  --danger-tint: #FCEBEA;
  --select:      #D5DDF0;  /* ::selection */

  /* type: families (Google Fonts link below) */
  --font-serif:  "Source Serif 4", "Times New Roman", Times, serif;   /* headings, question numbers, marks */
  --font-ui:     "Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif;  /* everything else */
  --font-mono:   "IBM Plex Mono", ui-monospace, Menlo, monospace;    /* paper codes, seeds */

  /* type: size scale (x1.2, body 16) */
  --text-caption: 12px;  /* chips, pills, footer */
  --text-hint:    13px;  /* helper text, sources, small buttons */
  --text-ui:      15px;  /* labels, buttons, tabs */
  --text-body:    16px;  /* body, inputs */
  --text-h3:      19px;  /* sub-headings, question numbers */
  --text-h2:      23px;  /* card titles */
  --text-h1:      28px;  /* page title */
  --text-display: 34px;  /* reserved */

  --leading-tight: 1.2;   /* headings */
  --leading-ui:    1.4;   /* controls */
  --leading-body:  1.55;  /* prose */
  --weight-regular: 400;
  --weight-semibold: 600;
  --weight-bold:    700;

  /* spacing (4px base, roomy) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;

  /* shape */
  --radius:      2px;    /* cards, buttons, inputs: a paper edge */
  --radius-pill: 999px;  /* pills and badges only */
  --rule-w:      1px;
  --rule-strong: 1.5px;  /* ink rule under section headings */

  /* depth: paper on a desk, never a halo */
  --shadow-paper: 0 1px 2px rgba(23, 25, 30, .06), 0 4px 12px rgba(23, 25, 30, .04);
  --shadow-lift:  0 2px 4px rgba(23, 25, 30, .08), 0 10px 24px rgba(23, 25, 30, .08);  /* viewer */
  --scrim:        rgba(23, 25, 30, .55);

  /* focus */
  --focus-ring: 2px solid var(--accent);
  --focus-offset: 2px;

  /* motion (short; disabled under prefers-reduced-motion) */
  --ease-out: cubic-bezier(.23, 1, .32, 1);
  --dur-fast: 120ms;  /* hover, press */
  --dur:      180ms;  /* tab and panel changes */

  /* layout */
  --page-max:      1100px;
  --page-max-wide: 1440px;  /* Pick manually split view */
  --measure:       72ch;    /* prose line length */
  --tap-min:       44px;    /* touch target on phones */
}
```

### Fonts

One `<link>` in `index.html`. The page requests fonts from Google; past-paper PDFs never leave the browser.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap">
```

## Contrast (WCAG AA)

| Pair | Ratio | Use |
|---|---|---|
| `--ink` on `--paper` | 17.4 | all text |
| `--ink-muted` on `--paper` / `--desk` | 6.6 / 5.9 | hints, sources |
| `--accent` on `--paper` | 10.3 | links, outline buttons |
| `--on-accent` on `--accent` | 10.3 | primary buttons |
| `--accent` on `--accent-tint` | 8.7 | chips, selected |
| `--ok` / `--warn` / `--danger` on `--paper` | 6.6 / 6.7 / 6.5 | status text |
| `--ok` / `--warn` / `--danger` on their `-tint` | 5.8 / 6.0 / 5.7 | status badges |
| `--on-accent` on `--accent-hover` | 12.4 | primary hover |
| `--ink-muted` on `--paper-sunk` / `--accent-tint` | 6.1 / 5.6 | hints on hover/selected |
| `--field` on `--desk` | 3.3 | controls on the desk |
| `--field` on `--paper` | 3.6 | control borders (3:1 needed) |

`--rule` (1.4:1) is decorative only. Anything that marks a control's edge uses `--field`.

## Components

- **Page:** `--desk` background. Cards are `--paper` with a `--rule` border, `--radius`, `--shadow-paper` and `--space-5` padding (`--space-4` under 700px).
- **Headings:** serif. Card titles `--text-h2` at 600 weight. A paper-type section in the review gets a `--rule-strong` ink line under it, like a section break on a real paper.
- **Question rows:** `--paper` with a `--rule` border. "Question N" in serif `--text-h3`. `[N marks]` in serif bold, right-aligned, tabular numerals. The source line is `--text-hint` in `--ink-muted`.
- **Buttons:** `--radius`, `--text-ui`, minimum height 36px (`--tap-min` on phones).
  - Primary: `--accent` fill with `--on-accent` text. Use it for one main action per area: Generate, and the two Downloads.
  - Secondary: paper fill, `--field` border.
  - Tertiary (code, sort): `--text-hint` size, `--ink-muted` text.
- **Inputs, selects, checkboxes:** `--field` border, `--paper` fill, `accent-color: var(--accent)`. Checkboxes are 18px.
- **Tabs:** text tabs on the desk. The active tab is paper-coloured, joined to the card below, with `--ink` text at 600 weight. On phones they scroll in one line.
- **Chips:** `--text-caption` on `--accent-tint`. "not in syllabus" uses `--danger` on `--danger-tint`. "used before" uses `--warn` on `--warn-tint`.
- **Status:** "exact" uses `--ok` text on `--ok-tint`. "short" and "over" use `--warn` on `--warn-tint`. Always show words alongside the colour.
- **Codes and seeds:** `--font-mono`.
- **Focus:** `--focus-ring` with `--focus-offset` on every control. Never remove it.
- **Browser surfaces:** `::selection` uses `--select`. Links use `text-underline-offset: 2px`.

## Don't

- No gradients, glass, glows, coloured side-bars, or emoji icons.
- No second accent colour. Status colours mean status only.
- No body text under 12px, and no grey text on the desk below 4.5:1.
- No animation beyond hover/press feedback and tab changes. Respect `prefers-reduced-motion`.

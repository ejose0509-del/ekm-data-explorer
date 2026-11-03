---
name: EKM Data Explorer
description: A statistical analyzer drawn on a lecture-hall chalkboard; every result reads Method, Result, Conclusion.
colors:
  board: "#1d3630"
  board-2: "#234139"
  board-3: "#172c27"
  ledge: "#12221e"
  chalk: "#edf0e8"
  chalk-2: "#b7c4bb"
  chalk-3: "#9aaca3"
  rule: "rgba(237, 240, 232, .16)"
  rule-2: "rgba(237, 240, 232, .32)"
  yellow: "#f2d56b"
  blue: "#93c8f2"
  pink: "#f3a6be"
  green: "#a9dda0"
  orange: "#f4b27a"
  red: "#ff9b8f"
  violet: "#c7b3f5"
typography:
  display:
    fontFamily: "STIX Two Text, Cambria Math, Georgia, serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0em"
  headline:
    fontFamily: "STIX Two Text, Cambria Math, Georgia, serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "STIX Two Text, Cambria Math, Georgia, serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
  lede:
    fontFamily: "STIX Two Text, Cambria Math, Georgia, serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.45
  math:
    fontFamily: "STIX Two Math, Cambria Math, math"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.6
  figure:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.15
    fontFeature: "tnum"
  body:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "tnum"
  control:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
  label:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
rounded:
  key: "2px"
  control: "3px"
  panel: "4px"
  numeral: "50%"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "36px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.chalk}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "7px 14px"
  button-primary:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.board}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "#f6e08f"
  pill:
    backgroundColor: "transparent"
    textColor: "{colors.chalk-2}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  pill-on:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.board}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.chalk-2}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 8px"
  input:
    backgroundColor: "{colors.board-3}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
  card:
    backgroundColor: "{colors.board-2}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.panel}"
    padding: "{spacing.s5}"
  poster:
    backgroundColor: "{colors.board-2}"
    rounded: "{rounded.panel}"
    padding: "{spacing.s5}"
  ledge:
    backgroundColor: "{colors.ledge}"
    textColor: "{colors.chalk-2}"
    height: "60px"
  figure-key:
    textColor: "{colors.chalk}"
    typography: "{typography.display}"
    rounded: "{rounded.key}"
    padding: "4px 12px"
---

# Design System: EKM Data Explorer

## Overview

**Creative North Star: "The Lecture-Hall Chalkboard"**

EKM is a slate-green board under a darker chalk ledge. Everything is written on it in chalk: white for the argument, coloured chalk for emphasis and series. Work sits in ruled board panels, and every analysis is laid out like a conference poster, numbered 1 Method, 2 Result, 3 Conclusion, so a reading is never separated from how it was made. The Method panel writes the actual formula, typeset.

This is one committed dark world for every viewer, pinned by the user: there is no light theme and no theme switch (`color-scheme: dark`). Density is that of a working document, not a dashboard: figures sit in ruled rows rather than floating metric cards, panels are flat, and the only motion is chalk being rewritten when a number changes.

The world rejects the grey SaaS dashboard of loose metric cards, and within the chalkboard it rejects costume: no wood frame, no chalk-dust texture, no handwriting fonts. The chalk is in the palette and the outlines, not in imitation materials.

**Key Characteristics:**
- Single dark chalkboard world; no light theme.
- Poster panels: Method | Result | Conclusion, numbered in yellow chalk circles.
- STIX Two Text writes headings, ledes and formulas; Archivo writes controls, labels and figures.
- Flat, ruled surfaces: 1px chalk rules and 1.5px chalk outlines, no shadows.
- Coloured chalk carries meaning: yellow highlights, blue links and data, green/orange/red quality.
- One motion: the chalk-write reveal on a changed number.

## Colors

A slate-green board in three tones, a near-black ledge, chalk white in three strengths, and seven coloured chalks used sparingly for meaning.

### Primary
- **Highlight Chalk Yellow** (yellow): the one emphasis colour. Primary button fill, active tab underline, step numerals, the boxed key figure, recipe markers, focus ring, selection, checkbox accent, fit lines in charts (via the `--ve` alias).

### Secondary
- **Link Chalk Blue** (blue): links, link buttons, disclosure summaries, the "reported" quality chip, and the default data series (scatter points, first series, via the `--accent` alias).

### Tertiary
- **Series Chalks** (pink, green, orange, violet): chart series in fixed order after blue and yellow (blue, yellow, pink, green, orange, violet, chalk-2). Green and orange also mark change direction in Before | Now (up green, down orange); orange marks warnings and the caveat rule.
- **Correction Red** (red): only the "excluded" quality chip.

### Neutral
- **Lecture Board** (board): the page surface.
- **Panel Board** (board-2): raised ruled panels (cards, poster, the Now half).
- **Well Board** (board-3): inset wells: inputs, notes, fix forms, selected dataset row.
- **Chalk Ledge** (ledge): the sticky top band and the html backdrop; darkest tone.
- **Chalk White** (chalk): primary text and figures.
- **Worn Chalk** (chalk-2): secondary text, labels, table headers, inactive tabs, control outlines.
- **Faint Chalk** (chalk-3): tertiary text, placeholders, chart ticks, input outlines, neutral chips.
- **Chalk Rule** (rule) and **Strong Rule** (rule-2): 16% and 32% chalk-white lines that divide panels, rows and halves.

### Named Rules
**The One Highlight Rule.** Yellow is the only emphasis chalk. It marks the primary action, the active place, the step numbers, the key figure and focus; it never decorates.

**The Chalk Means Something Rule.** Every coloured chalk has a job (link, series, quality tier, change direction, warning). A colour that carries no meaning is not used.

## Typography

**Display Font:** STIX Two Text (with Cambria Math, Georgia, serif)
**Formula Font:** STIX Two Math for MathML (with Cambria Math, math)
**UI Font:** Archivo (with Helvetica Neue, Arial, sans-serif)

**Character:** a mathematician's serif for what is said and proved, a plain grotesque for what is operated and counted. All numbers use tabular figures.

### Hierarchy
The scale is strict: six steps, 12 / 13.5 / 15 / 18 / 24 / 34px (`--t1` to `--t6`). Nothing sits between steps.
- **Display** (STIX Two Text 600, 34px, 1.1): the view title, one per view.
- **Headline** (STIX Two Text 600, 24px, 1.2): section headings; the brand in the ledge (700).
- **Title** (STIX Two Text 600, 18px): card headings and the numbered step headings.
- **Lede** (STIX Two Text 400, 18px, 1.45, max 70ch): the sentence under the title.
- **Math** (STIX Two Math, 18px, 1.6): block formulas in the Method panel, ruled above and below, scrolling sideways rather than wrapping.
- **Figure** (Archivo 600, 24px, 1.15): numbers in figure rows; 18px inside the poster.
- **Body** (Archivo 400, 15px, 1.55): running text and lists.
- **Control** (Archivo 600, 13.5px): buttons, tabs, pills, tables, notes.
- **Label** (Archivo 600, 12px, sentence case): figure labels, field labels, table headers, chips.
- **Caption** (STIX Two Text italic, 13.5px): "Fig. n" captions under charts, the figure number in upright chalk white.

### Named Rules
**The Two Hands Rule.** STIX writes statements, headings and formulas; Archivo writes controls, labels and figures. Do not swap them.

**The Six Steps Rule.** Type sizes come only from `--t1`..`--t6`. Chart text is the one exception (ticks 14px Archivo, axis titles 15px italic STIX) because SVG text scales with the chart.

## Layout

A centred column, max 1240px, with side padding of at least 16px plus the safe-area inset, 36px above and 64px below. The ledge band is sticky at the top (60px tall on desktop) and holds the brand and a horizontally scrolling tab row. Views stack as a grid with 24px gaps.

Spacing comes only from the six-step scale (4 / 8 / 12 / 16 / 24 / 36px, `--s1`..`--s6`). Panels pad at 24px with 16px internal gaps.

The Analyze view is a main column plus a 280 to 340px aside. The poster panel is three columns weighted roughly 1 : 1.6 : 0.95 (Method narrower, Result widest). Figure rows auto-fit at a 140px minimum.

Responsive behaviour:
- **960px:** the poster stacks to one column, sections divided by a top rule instead of a left rule.
- **860px:** the aside stacks above the main column; ledge gap tightens and tab padding drops; Before | Now halves stack; their figure grid goes from four to two columns.
- **600px:** charts render at a 360-unit width (640 otherwise) with a 112-unit label gutter (196 otherwise) when the chart is narrower than 400, so text stays legible on a phone instead of shrinking; the chart's 440px minimum width is lifted; the key figure drops to 24px.
- Charts never exceed 960px wide and centre within their panel; wider content (tables, formulas, charts on desktop) scrolls sideways inside its own wrapper, never the page.

## Elevation & Depth

Flat. There are no shadows anywhere. Depth is tonal and ruled: the ledge is darkest, the board is the plane, panels are one step lighter, wells one step darker, and 1px chalk rules divide them. A panel that needs more weight gets the strong rule (32%), not a shadow.

### Named Rules
**The Written-On Rule.** Things on a chalkboard do not float. Depth comes from board tone and chalk lines only.

## Shapes

Nearly square. Panels and well containers take a 4px corner, controls and chips 3px, the boxed key figure 2px. The only round shape is the step numeral, a 26px circle outlined in yellow chalk. Outlines are chalk strokes: 1px for rules and panel borders, 1.5px for interactive outlines (buttons, inputs, pills, chips, the key-figure box, the drop zone, which is dashed).

## Components

### Buttons
Outlined in chalk, filled only when primary.
- **Shape:** slightly softened square (3px).
- **Default:** transparent, chalk-white text, 1.5px worn-chalk outline, 7px 14px padding, Archivo 600 13.5px.
- **Primary:** yellow fill and outline, board-green text; hover lightens the yellow (#f6e08f).
- **Hover / Focus:** default hover brightens the outline to chalk white and adds a 6% chalk wash; 150ms ease-out on background and border only. Focus is a 2px yellow outline at 2px offset everywhere. Disabled drops to 45% opacity.
- **Link button:** blue text, no border, underline on hover.

### Pills (option toggles)
- **Style:** transparent, worn-chalk text, 1.5px strong-rule outline, 3px corner, 6px 12px.
- **State:** hover brightens text and outline; selected inverts to a chalk-white fill with board text. Counts inside sit at 70% opacity.

### Chips (quality tiers)
- **Style:** outline only, no fill: 1.5px outline and text in the tier's chalk, Archivo 600 12px, 3px corner.
- **Tiers:** verified green, reported blue, estimated orange, excluded red; untiered uses faint chalk.

### Cards / Containers
- **Corner Style:** 4px.
- **Background:** panel board, 1px chalk rule border.
- **Shadow Strategy:** none (see Elevation).
- **Internal Padding:** 24px, 16px gap between children; card headings at Title size.
- **Wells** (notes, fix forms, selected rows): well board with a 1px rule, 12px 16px padding.

### Inputs / Fields
- **Style:** well-board fill, 1.5px faint-chalk outline, 3px corner, 7px 10px, Archivo 400 13.5px; field labels sit above in Label style.
- **Hover / Focus:** outline brightens to worn chalk; focus takes the yellow ring. Checkboxes use yellow accent.
- **Drop zone:** 1.5px dashed faint-chalk outline; on drag-over turns yellow with a 7% yellow wash.

### Navigation (the ledge band)
- **Style:** sticky ledge-coloured band with a bottom rule; brand in STIX 700 24px with an Archivo subtitle; tabs in Archivo 600 13.5px.
- **States:** inactive tabs worn chalk; hover chalk white; the current tab chalk white with a 3px yellow underline. The tab row scrolls horizontally without a scrollbar on narrow screens.

### Tables
Ruled, not boxed: a strong rule above, Label-style headers over a strong rule, rows divided by 1px rules, a 3% chalk wash on row hover, tabular figures.

### Poster Panel (signature)
The analysis result as a conference poster: one ruled panel in three sections, each headed by a yellow-circled numeral and a STIX title, **1 Method**, **2 Result**, **3 Conclusion**, divided by vertical rules. Method states what was done and writes the formula; Result holds the figures and the chart with its "Fig. 1" caption; Conclusion holds the plain-language reading and caveats (each caveat marked by a 1px orange left rule).

### Figure Rows and the Key Figure
Figures sit in a ruled row (rules above and below, vertical rules between), each a Label over a number, never as separate cards. The first figure of an analysis may be the **key figure**: set in STIX 600 at Display size inside a 1.5px yellow chalk box (2px corner, 4px 12px padding), spanning the row.

### Before | Now Halves
Clean & enhance compares the dataset as two halves of one bordered panel (strong rule): Before on the board, Now on panel board, divided by a strong rule. Each half lists its figures in a four-column grid (two on narrow screens); a figure that went up is green, down is orange.

### Charts
SVG drawn from the tokens, never literal colours: ticks in faint chalk (Archivo), axis titles in italic STIX worn chalk, rules for gridlines. Scatter points are blue at 70% opacity (3.5 radius); the fit line is a 2px yellow stroke. Further series follow the fixed chalk order. Legends use 14 by 2px chalk strokes.

### Chalk-Write Motion
The only motion in the system. When a figure's value changes in place, it is rewritten: a left-to-right clip reveal over 450ms, `cubic-bezier(.16, 1, .3, 1)`. It runs only on a changed value, never on first render, and is removed under reduced motion (as are all transitions).

## Do's and Don'ts

### Do:
- **Do** keep every surface on the dark chalkboard: board, panel board, well board, ledge. There is no light theme.
- **Do** present every analysis as the 1 Method | 2 Result | 3 Conclusion poster panel, with the formula typeset in the Method section.
- **Do** take sizes only from the six-step type scale and the six-step spacing scale.
- **Do** reserve yellow for the primary action, active tab, step numerals, key figure, fit line and focus.
- **Do** draw charts with token colours and size them with the phone rules (360/640 width, 112/196 label gutter) so chart text stays legible at 400px.
- **Do** put figures in ruled rows and comparisons in Before | Now halves.
- **Do** use the chalk-write reveal only when a shown number actually changes.

### Don't:
- **Don't** add a light theme or a theme toggle; the dark world is user-pinned.
- **Don't** build the grey SaaS dashboard of loose, shadowed metric cards.
- **Don't** add a wood frame, chalk-dust texture or handwriting font.
- **Don't** use shadows; depth is board tone and chalk rules.
- **Don't** fill chips; quality tiers are chalk outlines in their tier colour.
- **Don't** add motion beyond the chalk-write reveal and 150ms control hovers.

## The Paper (manuscript and exports)
The Write-up tab pins a sheet of paper to the board: background #f7f6f1, ink #1d2722, muted ink #59665f/#5b6862, rules #cfd6d1, control borders #8a958f, STIX Two Text at 16px body, 16.5px item headings, 19px section heads, 28px title. Exported reports and figures use the same print palette (chart ink #1b2620, blue #1f5fa8, amber #a86b00) on white. This is a deliberate second material for documents leaving the board; its sizes sit outside the board's six-step ramp on purpose. Chalk sketches in empty states use 9.5–13px SVG text that scales with the drawing.

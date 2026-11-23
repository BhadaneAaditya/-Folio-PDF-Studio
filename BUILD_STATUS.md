# BUILD_STATUS

Legend: **Done** = implemented and verified by an automated test · **Partial** = working subset · **Planned** = not implemented yet.

## Milestone 1 — four-document workflow (complete)

| Feature | Status | Test | Dependency / note |
| --- | --- | --- | --- |
| Open four PDFs in one workspace | Done | `tests/unit/workflow.test.ts`, `tests/e2e/workflow.spec.ts` | pdf.js, pdf-lib |
| Unique selectable page labels A1–D2 | Done | sample PDFs + `pageLabels()` independent pdf.js read | StandardFonts text is selectable |
| Highlight A2 as a real PDF annotation | Done | `highlightAnnotations()` reads `/Highlight` + QuadPoints from export | pdf-lib low-level annotation API |
| One-action swap A2 ↔ C1, ID preserved | Done | unit + browser test | pure `swapPages()` |
| Move D2 between B1 and B2 | Done | unit + browser test | pure `movePages()` |
| Download all four as ZIP | Done | browser test opens ZIP with JSZip and re-reads each PDF | JSZip |
| Verified exported page order | Done | independent pdf.js read of exported bytes | A=[A1,C1], B=[B1,D2,B2], C=[A2,C2], D=[D1] |
| Undo / redo move and swap as single operations | Done | unit + browser test | single workspace history |
| Copy page → edit copy → source independent | Done | unit test | new stable ID + cloned marks |
| Keyboard-only transfer | Done | browser test | Space selects, C preset, native selects, Enter commits |
| Frontend-only, zero document data sent over the network | Done | all processing in-browser; no fetch of document bytes | Vite serves static assets only |
| Four columns, thumbnails, counts, selection, dirty flag | Done | browser test | on-demand PDF.js thumbnail rendering |
| Rename / reorder / close columns | Done | UI (commands wired to reducer) | — |
| Drag-and-drop transfer with insertion marker | Done | UI (HTML5 DnD) | — |
| Screen-reader announcements, focus states, labels | Done | browser test uses accessible roles | `aria-live`, `:focus-visible` |
| Reduced motion / transparency / dark mode | Done | CSS media queries | — |

## Milestone 2 — viewer, organization, layout, markup, forms (partial)

| Feature | Status | Test | Dependency / note |
| --- | --- | --- | --- |
| Local draft save / restore / clear | Done | UI | IndexedDB via `idb` |
| Portable editable project export/import | Done | UI | JSON with base64 source bytes |
| Per-document zoom preservation, Fit, Rotate | Done | UI | state kept per document |
| Multiple/ranged/nonconsecutive selection | Done | unit test for `1-3, 6, 9-11`; UI: Ctrl/Cmd/Shift click + range entry | — |
| Highlight markup | Done | unit + browser | other markup tool buttons currently report "planned" |
| Mobile responsive source/destination controls | Done | CSS breakpoint | transfer panel collapses under columns |
| Viewer toolbar: page n/total with prev/next, zoom −/+ and preset dropdown, Fit page / Fit width, print, fullscreen | Done | unit + browser | zoom clamped 10–800%, fit computed from live stage size |
| High-quality rendering: 2× supersampled device-pixel canvases, cancel-before-resize, 4096 px cap, HQ toggle | Done | unit + browser | 2× is the default; HQ toggles between 1× and 2× |
| Search current / all PDFs | Done | unit + browser | PDF.js `getTextContent`; prev/next result navigation |
| Duplicate / delete / reverse / extract to new document | Done | unit + browser | one history entry per command |
| Column footer actions: Blank page, From device (JPG/PNG/PDF), Delete selected | Done | unit + browser | JPG/PNG wrapped into a fitted PDF page; PDF pages inserted directly into the column; one history entry |
| Per-thumbnail delete button | Done | browser | labelled `Remove <page label>` |
| Crop / reset / A4 / Letter / custom / margins / centred preview | Done | unit + browser | applied at export via `setCropBox` |
| Bookmarks, continuous multi-page scroll view | Planned | — | no blocker, time |
| Full markup set (draw, notes, shapes, stamps, signatures) | Planned | — | — |
| Form fill/create/flatten, same-name resolution | Planned | — | — |
| High-resolution rendering (device-pixel-ratio canvases, readable default zoom) | Done | browser test | thumbnails and editor render at display resolution or higher |
| Drag-to-resize document columns and editor pane (keyboard arrow keys too) | Done | unit + browser | widths persisted in local drafts; bounds 160–640 px / 320–900 px |
| Maximize / restore a document column, maximize / minimize the editor pane | Done | unit + browser | Escape restores both; maximized state persisted in drafts |
| Per-column thumbnail size − / + (80–320 px) and per-page Maximize in viewer | Done | unit + browser | thumbnails re-render crisply at the new size; size persisted in drafts |

## Milestone 3 — advanced processing (planned)

| Feature | Status | Dependency / blocker |
| --- | --- | --- |
| Existing-content text replacement | Done | unit + browser | content-stream surgery removes the original text operator; replacement drawn with Helvetica is searchable; original absent. Warns on unsupported encodings |
| Existing-content image replacement | Planned | — | — |
| OCR (English / Hindi / Marathi) | Planned | optional worker + Tesseract language packs not installed |
| JPG/PNG↔PDF, Office→PDF, PDF→text/table/DOCX/PPTX | Planned | optional worker + LibreOffice not installed |
| Compression (lossless object streams + raster JPEG with DPI/quality, size preview, never larger) | Done | unit + browser | raster mode is image-only and labelled as non-editable |
| Compress at download: option in export dialog applied to single PDF, merged PDF, and each PDF inside the ZIP, with total size preview | Done | unit + browser | original bytes kept whenever compression would increase size |
| Image extraction, blank-page detection | Planned | — | — |
| Side-by-side compare, batch operations | Planned | — |
| Password protection / signature validation / certificate signing | Planned | — |
| Permanent redaction + metadata cleanup | Planned | qpdf / content-stream rewrite engine required |
| Bookmark & metadata editing, repair, PDF/A | Planned | — |
| Worker capability discovery, consent, job binding | Planned | backend intentionally absent; frontend works fully offline |

## Milestone 4 — guest review / signing / accessibility / performance (planned)

Not implemented. Ordinary editing deliberately works with no accounts, sharing, or network.

## Verification actually performed (this build)

- `npx tsc -b --pretty false` — passed
- `npx vitest run` — 15 unit tests passed (four-document workflow, independent PDF re-reads, highlight annotation read, ZIP, ranges, page ops, search, crop geometry, content-stream text replacement, compression incl. export-time, resize/maximize/thumbnail bounds, fit-zoom, insert-from-source)
- `npx playwright test` — 12 browser tests passed (full workflow, search + page ops + crop, keyboard-only transfer, drag-to-resize, maximize/restore, page preview sizing + per-page maximize, column delete/add-from-device, viewer toolbar, render resolution, text replacement in exported ZIP, compress-at-download, compression preview/copy)
- `npx vite build` — production build succeeded
- `npm run samples` — generated `samples/A.pdf` … `samples/D.pdf`

## Licenses

MIT for this project. Runtime: pdf-lib (MIT), PDF.js (Apache-2.0), JSZip (MIT/GPLv3 dual, used under MIT), idb (ISC), React (MIT), Vite (MIT). Test tools: Vitest, Playwright (Apache-2.0).

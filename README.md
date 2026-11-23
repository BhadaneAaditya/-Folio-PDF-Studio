# Folio PDF Studio

A free, open-source, offline-first PDF editing workspace. Open several PDFs in one screen, move / copy / swap pages between them, mark up a page, and download every revised document — as separate PDFs, one merged PDF, or a ZIP. No accounts, no login, no subscriptions, no watermarks, no uploads. Document bytes never leave the browser.

## Quick start (Windows PowerShell, frontend only)

```powershell
cd E:\SARVAGYAAI
npm install
npm run dev
```

Open http://localhost:5173 and choose **Try sample files**. Everything works with the backend offline — there is no backend in this setup.

## Commands

```powershell
# install dependencies
npm install

# start the development server
npm run dev

# generate the four sample PDFs into .\samples
npm run samples

# type-check
npx tsc -b --pretty false

# unit tests (document operations, export verification with an independent PDF engine)
npm test

# browser tests (installs/uses Playwright Chromium)
npx playwright install chromium
npm run test:e2e

# production build into .\dist, then serve it
npm run build
npm run preview
```

### Self-hosted worker

Not required and not implemented yet. The application is fully functional as a static site. When the optional worker is added, capability discovery and per-job consent will be required before any document leaves the device; see `BUILD_STATUS.md`.

## Milestone 1 workflow

1. **Try sample files** opens A.pdf `[A1, A2]`, B.pdf `[B1, B2]`, C.pdf `[C1, C2]`, D.pdf `[D1, D2]`.
2. Click **A2**, choose the **Highlight** tool and drag over the label — a real `/Highlight` PDF annotation is attached to that page instance.
3. In the transfer bar choose source **A**, destination **C**, "Swap with" **C1**, press **Swap**. The highlight travels with A2.
4. Click **D2**, choose source **D**, destination **B**, relative to **B2**, position **Before**, press **Move**.
5. **Export → Download all as ZIP**. Reopened exports contain A=`[A1,C1]`, B=`[B1,D2,B2]`, C=`[A2,C2]` (with highlight), D=`[D1]`.
6. **Undo** twice restores the original order; **Redo** twice restores the revised order.

### Editing text inside a PDF

Click a page, choose **Edit text**, drag a box around the word, then type the replacement. The original text-showing operator is removed from the page content stream and the new text is drawn with Helvetica, so the replacement is searchable and the old text is gone from that location. Unsupported encodings produce a warning instead of a silent change. Marked pages keep their edits when moved or swapped.

### Compressing

Compression is available both as a standalone tool and **at download time**: in **Export**, choose None / Lossless / Raster under "Compress at download", optionally preview the total before/after size, then download a single PDF, the merged PDF, or the ZIP. Each PDF in the ZIP is compressed individually, and original bytes are kept whenever compression would make a file larger. Raster mode is labelled as image-only.

**Compress → Preview size → Open compressed copy.** "Lossless" rewrites object streams and clears metadata without visual change. "Reduce image resolution" renders pages to JPEG at the chosen DPI/quality and is explicitly marked image-only (text is no longer selectable). If compression would increase the file size, the original bytes are kept. The result opens as a new document, leaving the source editable.

The viewer toolbar under the page has page navigation (`1 / 10` style), zoom −/+, a zoom dropdown with presets plus **Fit page** and **Fit width**, and an **HQ** toggle for 2× supersampled rendering (on by default). Pages re-render at device-pixel resolution whenever zoom or quality changes, with a 4096 px canvas cap.

Each column footer has **+ Blank page**, **From device** (JPG, PNG or PDF — images are wrapped into a fitted PDF page and inserted into that column), and **Delete** for the selected pages. A small × on each thumbnail deletes that page directly.

Drag the thin handle on the right edge of a document column, or the left edge of the editor pane, to resize it. Widths are bounded (160–640 px for columns, 320–900 px for the editor), the handles are focusable separators usable with the arrow keys, and the widths are saved with local drafts. The ⤢ button in a column header maximizes that column to fill the workspace; ⤡ restores it. The editor has its own Maximize/Minimize button. Escape restores both.

Each column header also has **− / +** controls for the page-preview size (80–320 px, shown as a badge); previews re-render sharply at the new size. The ⤢ button on a page thumbnail opens that page maximized in the viewer; use **Minimize editor** to return.

Pages can also be dragged between columns; a blue insertion marker shows the landing position. Ctrl/Cmd+click or Shift+click selects ranges and nonconsecutive pages. The transfer panel is fully keyboard operable; press `?` for the shortcut list.

## Architecture

- `src/core/types.ts` — immutable `SourceDocument`, stable `PageInstance` (id, source reference, geometry, marks), `OutputDocument`.
- `src/core/workspace.ts` — pure `swapPages`, `movePages`, `copyPages`, `addMark`, `undo`, `redo`, one shared history for cross-document actions.
- `src/core/exportPdf.ts` — pdf-lib assembly, real highlight annotations, per-document filenames with collision handling, ZIP export.
- `src/core/pdfjs.ts` — PDF.js loading, text/label extraction, on-demand thumbnails and page rendering.
- `src/core/storage.ts` — IndexedDB drafts and portable JSON projects.
- `src/components/` — columns, thumbnails, editor pane, transfer bar, dialogs.
- Source bytes are immutable; a move keeps the page ID, a copy mints a new ID with cloned marks. Annotation coordinates are stored in PDF page coordinates so zoom/rotation/crop do not detach them.

## Tests actually run

- 15 unit tests: four-document import; highlight + swap + move + verified ZIP export including independent pdf.js re-reads and highlight annotation inspection; undo/redo; copy independence; stable IDs; page-range parsing; duplicate/delete/reverse; search; crop geometry; content-stream text replacement (original text absent, replacement searchable, other content preserved); compression incl. export-time; resize/maximize/thumbnail bounds; fit-to-window zoom; inserting pages from a new source into an existing document.
- 12 Playwright browser tests: the full workflow above with a real mouse-drawn highlight and downloaded ZIP verified with JSZip + pdf.js; search + page organization + crop with undo; keyboard-only copy transfer; drag-to-resize columns and editor; maximize/restore column and editor; page preview sizing and per-page maximize; column delete/add-from-device actions; viewer toolbar navigation/zoom/fit; render resolution; text editing verified inside the exported PDF; compress-at-download; compression preview and compressed-copy creation.
- Type-check and production build passed.

## Known limitations

Milestones 1 and a substantial part of 2 are complete, plus in-PDF text editing and PDF compression from Milestone 3; see `BUILD_STATUS.md` for exact per-feature status and dependency blockers (OCR/Office/redaction need an optional self-hosted engine and are not advertised as working). Markup tools other than Highlight currently show a "planned" notice. Text replacement works on digitally created PDFs with supported encodings and warns when it cannot locate the text; it is not OCR. Raster compression is image-only and is labelled as losing selectable text. There is no form editing, OCR, conversion, comparison, signing, bookmark editing, continuous multi-page reader, or redaction yet.

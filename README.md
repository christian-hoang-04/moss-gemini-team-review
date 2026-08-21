# MOSS + Gemini team annotation web

Review tool for the completed `moss_gemini_37` run. The `public/` folder is a self-contained GitHub Pages build with the 13 MP3 chunks and normalized Gemini segment data. The local Node server remains available for shared-machine use; the hosted Pages version saves annotations in each reviewer’s browser and supports JSON/JSONL export.

Review workflow: the original Gemini output is retained. Reviewers click individual words, can save a `word_disagreement` record with optional context, and can also save a `word_correction` for any selected word. Both actions are available in the same shared mode.

Word actions are organized as `Change word`, `Cannot hear`, `Delete word`, or `Add word`. Small `+` controls appear when the pointer reaches a boundary between tokens and remain visible after that boundary is selected; arbitrary insertion outside a token boundary is not supported.

Saved token states remain visible in the main label column: `Cannot hear` is red, changed words replace the displayed Gemini token, added words are blue, and deleted words disappear. The selected word keeps a bold outer boundary until another word is selected.

The chunk/filter sidebar can be hidden with the vertical `Hide chunks` / `Show chunks` control on the left edge; its state is remembered in the browser. The word review panel sits on the right of the transcript on wide screens and moves below it on smaller screens.

Start with:

```powershell
node server.js
```

Open http://127.0.0.1:4173. To use another source directory, set `MOSS_GEMINI_SOURCE` before starting the server.

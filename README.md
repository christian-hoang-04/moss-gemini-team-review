# MOSS + Gemini team annotation web

Review tool for the completed `moss_gemini_37` run. The `public/` folder is a self-contained GitHub Pages build with the 13 MP3 chunks and normalized Gemini segment data. The local Node server remains available for shared-machine use; the hosted Pages version saves annotations in each reviewer’s browser and supports JSON/JSONL export.

Annotator workflow: the Gemini output is read-only. Annotators click individual words that they disagree with, optionally add context, and save a `word_disagreement` record. There is no replacement-label or suggested-correction field; an expert reviewer supplies the correct label later. The original segment text is retained in every disagreement record.

Start with:

```powershell
node server.js
```

Open http://127.0.0.1:4173. To use another source directory, set `MOSS_GEMINI_SOURCE` before starting the server.

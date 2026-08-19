# MOSS + Gemini team annotation web

Review tool for the completed `moss_gemini_37` run. The `public/` folder is a self-contained GitHub Pages build with the 13 MP3 chunks and normalized Gemini segment data. The local Node server remains available for shared-machine use; the hosted Pages version saves annotations in each reviewer’s browser and supports JSON/JSONL export.

Start with:

```powershell
node server.js
```

Open http://127.0.0.1:4173. To use another source directory, set `MOSS_GEMINI_SOURCE` before starting the server.

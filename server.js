const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 4173);
const APP_ROOT = __dirname;
const PUBLIC_ROOT = path.join(APP_ROOT, 'public');
const SOURCE_ROOT = process.env.MOSS_GEMINI_SOURCE || 'D:/projects/others/viLLMs/results/moss_gemini_37';
const ANNOTATIONS_FILE = path.join(APP_ROOT, 'annotations.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function safeJoin(root, relative) {
  const resolved = path.resolve(root, relative);
  const base = path.resolve(root) + path.sep;
  if (!resolved.startsWith(base)) throw new Error('Path escapes root');
  return resolved;
}
function loadAnnotations() {
  if (!fs.existsSync(ANNOTATIONS_FILE)) return [];
  const value = readJson(ANNOTATIONS_FILE);
  return Array.isArray(value) ? value : (Array.isArray(value.annotations) ? value.annotations : []);
}
function buildDataset() {
  const manifest = readJson(path.join(SOURCE_ROOT, 'manifest.json'));
  const rows = readJson(path.join(SOURCE_ROOT, 'gemini', 'run_rows.json'));
  const rowById = new Map(rows.map(row => [row.clip_id, row]));
  return manifest.map(item => {
    const row = rowById.get(item.clip_id) || {};
    const chunkRoot = path.join(SOURCE_ROOT, 'gemini', item.clip_id);
    let segments = [];
    try {
      segments = readJson(path.join(chunkRoot, 'gemini_segment_rows.json')).map((segment, index) => ({
        index: segment.segment_index ?? index + 1,
        start: Number(segment.start ?? 0),
        end: Number(segment.end ?? 0),
        speaker: segment.speaker || '',
        mossText: segment.moss_text || '',
        geminiText: segment.gemini_text || '',
        selectedText: segment.selected_text || '',
        selectedSource: segment.selected_source || '',
        medicalTerms: Array.isArray(segment.medical_terms) ? segment.medical_terms : [],
        alignment: {
          overlap: segment.token_overlap_ratio,
          distance: segment.relative_token_distance,
          changed: segment.changed_token_count
        }
      }));
    } catch (_) {}
    return {
      chunkId: item.clip_id,
      audioFile: item.audio_file,
      audioUrl: `/media/${encodeURIComponent(item.audio_file)}`,
      durationSeconds: Number(item.duration_seconds || 0),
      mossTranscript: row.moss_plain_transcript || '',
      geminiTranscript: row.gemini_merged_plain_transcript || '',
      segments,
      metadata: {
        model: 'google/gemini-3.7-flash',
        backend: 'kaggle-proxy',
        mossHints: row.gemini_prompt_mode === 'moss-hint',
        audioPaddingSeconds: Number(row.gemini_segment_padding_seconds || 0)
      }
    };
  });
}
function collectBody(req) {
  return new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => resolve(body)); req.on('error', reject); });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/dataset') return send(res, 200, { samples: buildDataset(), sourceRoot: SOURCE_ROOT });
    if (url.pathname === '/api/annotations' && req.method === 'GET') return send(res, 200, { annotations: loadAnnotations() });
    if (url.pathname === '/api/annotations' && req.method === 'POST') {
      const body = JSON.parse(await collectBody(req));
      const annotations = Array.isArray(body) ? body : body.annotations;
      if (!Array.isArray(annotations)) return send(res, 400, { error: 'Expected an annotations array' });
      const temp = `${ANNOTATIONS_FILE}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(annotations, null, 2), 'utf8');
      fs.renameSync(temp, ANNOTATIONS_FILE);
      return send(res, 200, { ok: true, count: annotations.length });
    }
    if (url.pathname.startsWith('/media/')) {
      const filename = decodeURIComponent(url.pathname.slice('/media/'.length));
      const file = safeJoin(path.join(SOURCE_ROOT, 'chunks'), filename);
      if (!fs.existsSync(file)) return send(res, 404, { error: 'Audio not found' });
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
      return fs.createReadStream(file).pipe(res);
    }
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = safeJoin(PUBLIC_ROOT, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'Not found' });
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (error) { send(res, 500, { error: error.message }); }
});

server.listen(PORT, '127.0.0.1', () => console.log(`MOSS + Gemini annotation web: http://127.0.0.1:${PORT}`));

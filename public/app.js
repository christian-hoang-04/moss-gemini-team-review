const state = { samples: [], annotations: [], selected: null, segment: null };
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const fmt = seconds => { seconds = Number(seconds || 0); return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; };
const annotationsFor = chunkId => state.annotations.filter(a => a.chunkId === chunkId);
const revisionsFor = (chunkId, segmentIndex) => state.annotations.filter(a => a.kind === 'revision' && a.chunkId === chunkId && a.segmentIndex === segmentIndex).sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)));
const commentsFor = (chunkId, segmentIndex) => state.annotations.filter(a => (a.kind === 'comment' || !a.kind) && a.chunkId === chunkId && a.segmentIndex === segmentIndex);
function currentSample() { return state.samples.find(s => s.chunkId === state.selected); }
function currentSegment(sample, segment) { return sample?.segments.find(s => s.index === segment); }
function revisionFor(sample, segment) { return revisionsFor(sample.chunkId, segment.index).at(-1); }
function displayedSegment(sample, segment) {
  const revision = revisionFor(sample, segment);
  return revision ? { ...segment, start: revision.revisedStartSeconds, end: revision.revisedEndSeconds, speaker: revision.revisedSpeaker, geminiText: revision.revisedText } : segment;
}
function notify(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1800); }
function renderSummary() {
  const reviewed = new Set(state.annotations.map(a => a.chunkId));
  $('summary').innerHTML = [['13','chunks'], [reviewed.size,'reviewed'], [state.annotations.length,'review notes'], [new Set(state.annotations.map(a => a.annotator).filter(Boolean)).size,'annotators']].map(x => `<div class="metric"><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('');
}
function renderAnnotatorFilter() {
  const old = $('annotatorFilter').value;
  const names = [...new Set(state.annotations.map(a => a.annotator).filter(Boolean))].sort();
  $('annotatorFilter').innerHTML = '<option value="all">All annotators</option>' + names.map(n => `<option>${esc(n)}</option>`).join('');
  $('annotatorFilter').value = names.includes(old) ? old : 'all';
}
function filteredSamples() {
  const query = $('search').value.toLowerCase(), status = $('statusFilter').value, type = $('typeFilter').value, annotator = $('annotatorFilter').value;
  return state.samples.filter(sample => {
    const notes = annotationsFor(sample.chunkId);
    const matchesStatus = status === 'all' || (status === 'unreviewed' && !notes.length) || (status === 'reviewed' && notes.length) || (status === 'issue' && notes.some(a => a.issueType && a.issueType !== 'Review note'));
    const matchesType = type === 'all' || notes.some(a => a.issueType === type);
    const matchesAnnotator = annotator === 'all' || notes.some(a => a.annotator === annotator);
    const transcript = sample.geminiTranscript || sample.segments.map(s => s.geminiText).join(' ');
    return (!query || `${sample.chunkId} ${transcript}`.toLowerCase().includes(query)) && matchesStatus && matchesType && matchesAnnotator;
  });
}
function renderList() {
  const list = filteredSamples();
  $('sampleList').innerHTML = list.map(sample => {
    const notes = annotationsFor(sample.chunkId), revisions = notes.filter(a => a.kind === 'revision');
    return `<div class="sample ${sample.chunkId === state.selected ? 'active' : ''}" data-id="${esc(sample.chunkId)}"><div class="sample-title"><span>${esc(sample.chunkId)}</span><span class="pill ${notes.length ? 'issue' : ''}">${notes.length ? `${notes.length} note${notes.length > 1 ? 's' : ''}` : 'unreviewed'}</span></div><div class="sample-meta">${fmt(sample.durationSeconds)} · ${sample.segments.length} segments${revisions.length ? ` · ${revisions.length} edits` : ''}</div></div>`;
  }).join('') || '<div class="sample-meta" style="padding:16px">No chunks match these filters.</div>';
  document.querySelectorAll('.sample').forEach(el => el.onclick = () => { state.selected = el.dataset.id; state.segment = 1; renderList(); renderDetail(); });
}
function renderDetail() {
  const sample = currentSample();
  if (!sample) return;
  if (!state.segment || !currentSegment(sample, state.segment)) state.segment = sample.segments[0]?.index;
  const selected = currentSegment(sample, state.segment), current = displayedSegment(sample, selected);
  $('detail').innerHTML = `<div class="detail-head"><div><p class="eyebrow dark">REVIEW CHUNK</p><h2>${esc(sample.chunkId)}</h2><p>${esc(sample.audioFile)} · ${fmt(sample.durationSeconds)} · click a segment to seek audio</p></div><span class="pill">${annotationsFor(sample.chunkId).length} saved note(s)</span></div><audio id="audio" class="audio" controls preload="metadata" src="${sample.audioUrl}"></audio><section class="transcript-card gemini-only"><div class="card-heading"><h3>Gemini 3.7 Flash transcript</h3><span class="pill">source of truth · editable revisions below</span></div><p class="hint">The original Gemini output is kept unchanged. Edit text, timestamps, or diarization on a segment, then save a revision.</p><div class="segment-table-wrap"><table class="segment-table"><thead><tr><th class="time">Time</th><th class="speaker">Speaker</th><th>Gemini transcript segment</th><th class="edit-col">Edit</th></tr></thead><tbody>${sample.segments.map(segment => segmentRow(sample, segment)).join('')}</tbody></table></div></section>${commentPanel(sample, selected, current)}`;
  document.querySelectorAll('[data-segment]').forEach(row => row.onclick = event => { if (event.target.closest('input,textarea,select,button')) return; state.segment = Number(row.dataset.segment); const seekTo = displayedSegment(sample, currentSegment(sample, state.segment)).start; renderDetail(); $('audio').currentTime = seekTo; });
  document.querySelectorAll('[data-seek]').forEach(button => button.onclick = () => { $('audio').currentTime = Number(button.dataset.seek); $('audio').play().catch(() => {}); });
  document.querySelectorAll('[data-save-revision]').forEach(button => button.onclick = () => saveRevision(sample, Number(button.dataset.saveRevision)));
  $('saveComment').onclick = () => saveComment(sample, selected, current);
  document.querySelectorAll('[data-comment-status]').forEach(button => button.onclick = () => updateCommentStatus(button.dataset.commentStatus, button.dataset.id));
  document.querySelectorAll('[data-segment] input,[data-segment] textarea,[data-segment] select').forEach(input => input.onfocus = event => { state.segment = Number(event.target.closest('[data-segment]').dataset.segment); });
}
function segmentRow(sample, segment) {
  const current = displayedSegment(sample, segment), revision = revisionFor(sample, segment), selected = segment.index === state.segment;
  return `<tr class="${selected ? 'selected' : ''} ${revision ? 'revised' : ''}" data-segment="${segment.index}"><td class="time"><button class="time-link" data-seek="${current.start}">${fmt(current.start)}–${fmt(current.end)}</button><div class="inline-edit"><input aria-label="Start time" data-field="start" type="number" min="0" step="0.01" value="${current.start}"><span>–</span><input aria-label="End time" data-field="end" type="number" min="0" step="0.01" value="${current.end}"></div></td><td class="speaker"><input aria-label="Speaker" data-field="speaker" value="${esc(current.speaker)}"></td><td><textarea aria-label="Gemini segment text" data-field="text">${esc(current.geminiText)}</textarea>${revision ? `<div class="original-text"><span>Original</span> ${esc(segment.geminiText)}</div>` : ''}</td><td class="edit-col"><button class="save-row" data-save-revision="${segment.index}">${revision ? 'Save new' : 'Save edit'}</button>${revision ? '<span class="revision-mark">edited</span>' : ''}</td></tr>`;
}
function commentPanel(sample, segment, current) {
  const comments = commentsFor(sample.chunkId, segment.index);
  return `<section class="comment-panel"><div class="card-heading"><div><h3>Review comments</h3><p class="hint">Second-check comments stay attached to this segment, like Google Docs notes.</p></div><span class="pill">${comments.filter(c => c.status !== 'resolved').length} open</span></div><div class="thread-list">${comments.map(comment => `<article class="comment ${comment.status === 'resolved' ? 'resolved' : ''}"><div class="comment-head"><strong>${esc(comment.annotator || 'Unknown')}</strong><span>${new Date(comment.createdAt).toLocaleString()}</span></div><p>${esc(comment.notes || comment.comment || '')}</p>${comment.suggestedCorrection ? `<div class="suggestion"><span>Suggested change</span>${esc(comment.suggestedCorrection)}</div>` : ''}<div class="comment-foot"><span>${comment.status === 'resolved' ? 'Resolved' : 'Open'}</span><button data-comment-status="${comment.status === 'resolved' ? 'open' : 'resolved'}" data-id="${esc(comment.id)}">${comment.status === 'resolved' ? 'Reopen' : 'Resolve'}</button></div></article>`).join('') || '<div class="empty-thread">No comments on this segment yet.</div>'}</div><div class="new-comment"><label class="field">Add comment<textarea id="commentText" placeholder="What should the next reviewer check?"></textarea></label><label class="field">Suggested change<textarea id="commentCorrection" placeholder="Optional proposed wording, timestamp, or speaker"></textarea></label><button id="saveComment">Comment on ${fmt(current.start)} segment</button></div></section>`;
}
async function saveRevision(sample, segmentIndex) {
  const row = document.querySelector(`[data-segment="${segmentIndex}"]`), original = sample.segments.find(s => s.index === segmentIndex), text = row.querySelector('[data-field="text"]').value.trim(), start = Number(row.querySelector('[data-field="start"]').value), end = Number(row.querySelector('[data-field="end"]').value), speaker = row.querySelector('[data-field="speaker"]').value.trim(), annotator = $('annotator').value.trim();
  if (!annotator || !text || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return notify('Name, transcript text, and valid times are required');
  const revision = { id: crypto.randomUUID(), kind: 'revision', chunkId: sample.chunkId, sampleId: sample.chunkId, segmentIndex, originalText: original.geminiText, originalStartSeconds: original.start, originalEndSeconds: original.end, originalSpeaker: original.speaker, revisedText: text, revisedStartSeconds: start, revisedEndSeconds: end, revisedSpeaker: speaker, issueType: 'Transcript revision', annotator, createdAt: new Date().toISOString() };
  state.annotations.push(revision); await persist(); renderAll(); renderDetail(); notify('Original preserved; revision saved');
}
async function saveComment(sample, segment, current) {
  const text = $('commentText').value.trim(), correction = $('commentCorrection').value.trim(), annotator = $('annotator').value.trim();
  if (!annotator || !text) return notify('Annotator name and comment are required');
  state.annotations.push({ id: crypto.randomUUID(), kind: 'comment', threadId: `${sample.chunkId}:${segment.index}`, chunkId: sample.chunkId, sampleId: sample.chunkId, segmentIndex: segment.index, startSeconds: current.start, endSeconds: current.end, speaker: current.speaker, originalText: segment.geminiText, currentText: current.geminiText, issueType: 'Review comment', notes: text, suggestedCorrection: correction, annotator, status: 'open', createdAt: new Date().toISOString() });
  await persist(); renderAll(); renderDetail(); notify('Comment added');
}
async function updateCommentStatus(status, id) { const comment = state.annotations.find(a => a.id === id); if (!comment) return; comment.status = status; await persist(); renderAll(); renderDetail(); notify(status === 'resolved' ? 'Comment resolved' : 'Comment reopened'); }
async function persist() { try { const response = await fetch('/api/annotations', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(state.annotations) }); if (!response.ok) throw new Error('static mode'); } catch (_) { localStorage.setItem('moss-gemini-annotations-v2', JSON.stringify(state.annotations)); } }
function download(name, text, type) { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], {type})); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
function exportJson() { download('moss-gemini-review.json', JSON.stringify(state.annotations, null, 2), 'application/json'); }
function exportJsonl() { download('moss-gemini-review.jsonl', state.annotations.map(a => JSON.stringify(a)).join('\n') + '\n', 'application/jsonl'); }
async function loadImported(file) { const text = await file.text(); const data = file.name.endsWith('.jsonl') ? text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : JSON.parse(text); state.annotations = Array.isArray(data) ? data : (data.annotations || []); await persist(); renderAll(); renderDetail(); notify(`Loaded ${state.annotations.length} review records`); }
function renderAll() { renderSummary(); renderAnnotatorFilter(); renderList(); }
async function init() {
  const dataUrl = new URL('dataset.json', document.baseURI).href;
  const datasetRequest = fetch('/api/dataset').then(r => { if (!r.ok) throw new Error('static mode'); return r.json(); }).catch(() => fetch(dataUrl).then(r => r.json()));
  const annotationsRequest = fetch('/api/annotations').then(r => { if (!r.ok) throw new Error('static mode'); return r.json(); }).catch(() => ({ annotations: JSON.parse(localStorage.getItem('moss-gemini-annotations-v2') || '[]') }));
  const [dataset, annotations] = await Promise.all([datasetRequest, annotationsRequest]);
  state.samples = dataset.samples; state.annotations = annotations.annotations || []; state.selected = state.samples[0]?.chunkId; state.segment = state.samples[0]?.segments[0]?.index;
  ['search','statusFilter','typeFilter','annotatorFilter'].forEach(id => $(id).oninput = renderList);
  $('loadBtn').onclick = () => $('fileInput').click(); $('fileInput').onchange = event => event.target.files[0] && loadImported(event.target.files[0]); $('exportJsonBtn').onclick = exportJson; $('exportJsonlBtn').onclick = exportJsonl; $('annotator').onchange = renderList;
  renderAll(); renderDetail();
}
init().catch(error => { $('detail').innerHTML = `<div class="empty">Could not load run data: ${esc(error.message)}</div>`; });

const API = '';
let token = localStorage.getItem('token');
let appSettings = null;
let currentProject = null;
let currentSong = null;
let currentVersion = null;
let uploadFile = null;
let ws = null; // wavesurfer
let adminComments = [];

// --- API ---
async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.json) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  delete opts.json;
  const res = await fetch(API + path, { ...opts, headers });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) {
    if (Array.isArray(data.detail)) throw new Error(data.detail.map(e => e.msg).join(', '));
    throw new Error(data.detail || 'Request failed');
  }
  return data;
}
const $ = (id) => document.getElementById(id);

// ============================================================
// AUTH
// ============================================================
let isSetupMode = false;

async function init() {
  await loadAppSettings();
  if (token) {
    try { await api('/admin/projects'); showDashboard(); }
    catch { token = null; localStorage.removeItem('token'); showLogin(); }
  } else showLogin();
}

async function checkSetupNeeded() {
  const s = await api('/admin/auth/status');
  isSetupMode = !s.setup_complete;
  $('setup-notice').classList.toggle('hidden', !isSetupMode);
  $('login-btn').textContent = isSetupMode ? 'Create Account' : 'Login';
}

function showLogin() { $('login-screen').classList.remove('hidden'); $('dashboard').classList.add('hidden'); checkSetupNeeded(); }
function showDashboard() {
  $('login-screen').classList.add('hidden'); $('dashboard').classList.remove('hidden');
  const storedName = localStorage.getItem('mixreaview_admin_name');
  if (storedName) $('admin-author-name').value = storedName;
  showProjects();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault(); $('login-error').classList.add('hidden');
  try {
    const loginUsername = $('username').value;
    const data = await api(isSetupMode ? '/admin/auth/setup' : '/admin/auth/login',
      { method: 'POST', json: { username: loginUsername, password: $('password').value } });
    localStorage.setItem('mixreaview_admin_name', loginUsername);
    token = data.access_token; localStorage.setItem('token', token);
    $('admin-author-name').value = loginUsername;
    showDashboard();
  } catch (err) { $('login-error').textContent = err.message; $('login-error').classList.remove('hidden'); }
});
$('logout-btn').addEventListener('click', () => { token = null; localStorage.removeItem('token'); destroyPlayer(); showLogin(); });

// ============================================================
// VIEW 1: PROJECTS LIST
// ============================================================
function hideAllViews() {
  $('projects-view').classList.add('hidden');
  $('project-view').classList.add('hidden');
  $('song-view').classList.add('hidden');
  $('settings-view').classList.add('hidden');
}

async function showProjects() {
  hideAllViews(); $('projects-view').classList.remove('hidden');
  destroyPlayer(); currentProject = null; currentSong = null; currentVersion = null;
  const projects = await api('/admin/projects');
  if (projects.length === 0) { $('projects-list').innerHTML = ''; $('projects-empty').classList.remove('hidden'); return; }
  $('projects-empty').classList.add('hidden');
  $('projects-list').innerHTML = projects.map(p => `
    <div class="bg-dark-800 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-dark-700 transition"
         onclick="openProject('${p.id}')">
      <div>
        <div class="font-medium">${esc(p.title)}</div>
        <div class="text-sm text-gray-500 mt-1">
          ${p.song_count} song${p.song_count !== 1 ? 's' : ''} · ${p.comment_count} comment${p.comment_count !== 1 ? 's' : ''} · ${formatDate(p.created_at)}
        </div>
      </div>
      <code class="text-xs text-gray-500">${p.share_link}</code>
    </div>
  `).join('');
}

$('new-project-btn').addEventListener('click', () => {
  openModal('New Project', 'Project title', async (title) => { await api('/admin/projects', { method: 'POST', json: { title } }); showProjects(); });
});

// ============================================================
// VIEW 2: PROJECT DETAIL (songs list)
// ============================================================
window.openProject = async function(id) {
  const project = await api(`/admin/projects/${id}`);
  currentProject = project; currentSong = null; currentVersion = null; destroyPlayer();
  hideAllViews(); $('project-view').classList.remove('hidden');
  $('project-title').textContent = project.title;
  $('share-link').textContent = `${window.location.origin}/${project.share_link}`;
  renderSongsList(project.songs);
};

function renderSongsList(songs) {
  if (songs.length === 0) { $('songs-list').innerHTML = ''; $('songs-empty').classList.remove('hidden'); return; }
  $('songs-empty').classList.add('hidden');
  $('songs-list').innerHTML = songs.map(s => `
    <div class="bg-dark-800 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-dark-700 transition"
         onclick="openSong(${s.id})">
      <div>
        <div class="font-medium">${esc(s.title)}</div>
        <div class="text-sm text-gray-500 mt-1">
          ${s.version_count} version${s.version_count !== 1 ? 's' : ''} · ${s.open_count > 0 ? `<span class="text-amber-400">💬${s.open_count}</span>` : '<span class="text-green-400">✓</span>'}
        </div>
      </div>
      <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
    </div>
  `).join('');
}

$('back-to-projects').addEventListener('click', () => showProjects());
$('project-title').addEventListener('click', () => {
  openModal('Rename Project', 'Project title', async (title) => { await api(`/admin/projects/${currentProject.id}`, { method: 'PUT', json: { title } }); openProject(currentProject.id); }, currentProject.title);
});
$('copy-link-btn').addEventListener('click', () => {
  navigator.clipboard.writeText($('share-link').textContent);
  $('copy-link-btn').textContent = 'Copied!'; setTimeout(() => $('copy-link-btn').textContent = 'Copy', 1500);
});
$('delete-project-btn').addEventListener('click', async () => {
  if (!confirm('Delete this project and all its songs/versions?')) return;
  await api(`/admin/projects/${currentProject.id}`, { method: 'DELETE' }); showProjects();
});
$('add-song-btn').addEventListener('click', () => {
  openModal('Add Song', 'Song title', async (title) => { await api(`/admin/projects/${currentProject.id}/songs`, { method: 'POST', json: { title } }); openProject(currentProject.id); });
});

// ============================================================
// VIEW 3: SONG DETAIL (2-column)
// ============================================================
window.openSong = async function(songId) {
  // Refresh project data to get latest versions
  const project = await api(`/admin/projects/${currentProject.id}`);
  currentProject = project;
  const song = project.songs.find(s => s.id === songId);
  if (!song) return;
  currentSong = song;

  hideAllViews(); $('song-view').classList.remove('hidden');
  $('back-project-name').textContent = project.title;
  $('song-title').textContent = song.title;

  renderVersionsList(song.versions);

  // Auto-play latest version if available
  if (song.versions.length > 0) {
    const target = currentVersion && song.versions.find(v => v.id === currentVersion.id)
      ? song.versions.find(v => v.id === currentVersion.id)
      : (song.versions.find(v => v.favourite) || song.versions[song.versions.length - 1]);
    playVersion(target);
  } else {
    $('player-area').classList.add('hidden');
    $('comment-input-area').classList.add('hidden');
    $('versions-empty').classList.remove('hidden');
    adminComments = []; renderComments();
  }
};

function renderVersionsList(versions) {
  if (versions.length === 0) {
    $('versions-list').innerHTML = ''; $('versions-empty').classList.remove('hidden'); return;
  }
  $('versions-empty').classList.add('hidden');
  $('versions-list').innerHTML = versions.map(v => {
    const unsolved = allSongComments.filter(c => c.version_id === v.id && !c.solved).length;
    return `
    <div class="flex items-center justify-between p-3 rounded-lg cursor-pointer transition
      ${currentVersion && currentVersion.id === v.id ? 'bg-accent/10 border border-accent/30' : 'bg-dark-800 hover:bg-dark-700'}"
         onclick="playVersion(${JSON.stringify(v).replace(/"/g, '&quot;')})">
      <div class="flex items-center gap-2">
        <button onclick="event.stopPropagation(); toggleFavourite(${v.id})"
          class="text-lg leading-none transition ${v.favourite ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400/60'}"
          title="Set as favourite">${v.favourite ? '★' : '☆'}</button>
        <span class="font-mono text-accent text-sm">v${v.version_number}</span>
        <span class="text-sm">${esc(v.label)}</span>
        ${unsolved > 0 ? `<span class="text-xs text-amber-400" title="${unsolved} open comments">💬${unsolved}</span>` : ''}
      </div>
      <div class="flex items-center gap-3">
        <a href="/api/audio/${v.id}" download="${esc(v.original_filename)}"
           onclick="event.stopPropagation()" class="text-xs text-gray-400 hover:text-white transition">Download</a>
        <button onclick="event.stopPropagation(); renameVersion(${v.id}, '${escAttr(v.label)}')"
          class="text-xs text-gray-400 hover:text-white transition">&#9998;</button>
        <button onclick="event.stopPropagation(); deleteVersion(${v.id}, ${v.version_number})"
          class="text-xs text-red-400/60 hover:text-red-400 transition">&#10005;</button>
        <span class="text-xs text-gray-500">${formatDate(v.created_at)}</span>
      </div>
    </div>`;
  }).join('');
}

window.playVersion = function(version) {
  currentVersion = version;
  $('player-area').classList.remove('hidden');
  $('comment-input-area').classList.remove('hidden');

  // Highlight active version
  renderVersionsList(currentSong.versions);

  const seekTo = ws ? ws.getCurrentTime() : undefined;
  const playing = ws ? ws.isPlaying() : false;
  loadAudio(version.id, seekTo, playing);
  loadComments(version.id);
};

$('back-to-project').addEventListener('click', () => { destroyPlayer(); currentSong = null; currentVersion = null; openProject(currentProject.id); });
$('song-title').addEventListener('click', () => {
  openModal('Rename Song', 'Song title', async (title) => { await api(`/admin/songs/${currentSong.id}`, { method: 'PUT', json: { title } }); openSong(currentSong.id); }, currentSong.title);
});
$('delete-song-btn').addEventListener('click', async () => {
  if (!confirm(`Delete song "${currentSong.title}" and all its versions?`)) return;
  await api(`/admin/songs/${currentSong.id}`, { method: 'DELETE' }); destroyPlayer(); currentSong = null; openProject(currentProject.id);
});
$('upload-version-btn').addEventListener('click', () => { if (currentSong) startUpload(currentSong.id); });

window.renameVersion = function(versionId, currentLabel) {
  openModal('Rename Version', 'Version name', async (label) => { await api(`/admin/versions/${versionId}`, { method: 'PUT', json: { label } }); openSong(currentSong.id); }, currentLabel);
};
window.deleteVersion = async function(versionId, versionNumber) {
  if (!confirm(`Delete version v${versionNumber}?`)) return;
  await api(`/admin/versions/${versionId}`, { method: 'DELETE' });
  if (currentVersion && currentVersion.id === versionId) { currentVersion = null; destroyPlayer(); }
  openSong(currentSong.id);
};

window.toggleFavourite = async function(versionId) {
  await api(`/admin/versions/${versionId}/favourite`, { method: 'PATCH' });
  openSong(currentSong.id);
};

// ============================================================
// WAVESURFER
// ============================================================
function loadAudio(versionId, seekTo, wasPlaying) {
  destroyPlayer();
  ws = WaveSurfer.create({
    container: '#admin-waveform',
    waveColor: (appSettings ? getThemeColors(appSettings).waveform : '#4b5563'),
    progressColor: (appSettings ? getThemeColors(appSettings).waveformProgress : '#6366f1'),
    cursorColor: (appSettings ? getThemeColors(appSettings).text : '#e5e7eb'), cursorWidth: 1, height: window.innerWidth < 768 ? 64 : 128,
    barWidth: 2, barGap: 1, barRadius: 2, normalize: true,
  });
  ws.load(`/api/audio/${versionId}`);
  ws.on('ready', () => {
    $('admin-time-duration').textContent = formatTime(ws.getDuration());
    if (typeof seekTo === 'number' && ws.getDuration() > 0) ws.seekTo(Math.min(seekTo / ws.getDuration(), 1));
    if (wasPlaying) ws.play();
    renderCommentMarkers();
  });
  ws.on('audioprocess', updateTime);
  ws.on('seeking', updateTime);
  ws.on('play', () => { $('admin-play-icon').classList.add('hidden'); $('admin-pause-icon').classList.remove('hidden'); });
  ws.on('pause', () => { $('admin-play-icon').classList.remove('hidden'); $('admin-pause-icon').classList.add('hidden'); });
}

function destroyPlayer() { if (ws) { ws.destroy(); ws = null; } }
function updateTime() {
  if (!ws) return;
  $('admin-time-current').textContent = formatTime(ws.getCurrentTime());
  $('admin-comment-timecode').textContent = '@' + formatTime(ws.getCurrentTime());
}

$('admin-play-btn').addEventListener('click', () => { if (ws) ws.playPause(); });
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); if (ws) ws.playPause(); } });

// ============================================================
// COMMENTS
// ============================================================
let allSongComments = []; // all comments across all versions of current song

async function loadComments(versionId) {
  if (!currentProject) return;
  try {
    // Load comments for current version (displayed)
    adminComments = await api(`/api/projects/${currentProject.share_link}/comments?version_id=${versionId}`);
    // Load all comments for all versions in this song (for unsolved counts)
    allSongComments = await api(`/api/projects/${currentProject.share_link}/comments?song_id=${currentSong.id}`);
  } catch { adminComments = []; allSongComments = []; }
  renderComments(); renderCommentMarkers();
}

function renderComments() {
  if (adminComments.length === 0) { $('admin-comments-list').innerHTML = ''; $('admin-comments-empty').classList.remove('hidden'); return; }
  $('admin-comments-empty').classList.add('hidden');
  $('admin-comments-list').innerHTML = adminComments.map(c => `
    <div class="bg-dark-800 rounded-lg p-3 mb-2 ${c.solved ? 'opacity-50' : ''}">
      <div class="flex items-center gap-2 mb-1">
        <button onclick="jumpTo(${c.timecode})"
          class="text-xs font-mono text-amber-400 bg-dark-700 px-2 py-1.5 rounded hover:bg-dark-600 transition min-h-[44px] min-w-[44px] inline-flex items-center justify-center">
          @${formatTime(c.timecode)}
        </button>
        <span class="text-sm font-medium text-gray-300">${esc(c.author_name)}</span>
        <label class="ml-auto flex items-center gap-1 cursor-pointer">
          <input type="checkbox" ${c.solved ? 'checked' : ''} onchange="toggleSolved(${c.id}, this.checked)"
            class="accent-green-500">
          <span class="text-xs ${c.solved ? 'text-green-400' : 'text-gray-500'}">Done</span>
        </label>
        <button onclick="editComment(${c.id}, '${escAttr(c.text)}')" class="text-gray-400 hover:text-white transition ml-1 touch-btn"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
        <button onclick="deleteComment(${c.id})" class="text-red-400/60 hover:text-red-400 transition touch-btn"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
      </div>
      <p class="text-sm text-gray-400 ${c.solved ? 'line-through' : ''}">${esc(c.text)}</p>
      ${(c.replies && c.replies.length > 0) ? c.replies.map(r => `<div class="mt-2 ml-3 pl-3 border-l-2 border-accent/30"><p class="text-sm text-gray-300">${esc(r.text)}</p><span class="text-xs text-gray-500">— ${esc(r.author_name)} · ${formatDate(r.created_at)}</span></div>`).join('') : ''}
      <div class="mt-2">
        <button onclick="toggleReplyInput(${c.id})" class="text-sm text-accent hover:text-indigo-400 transition py-2 px-3 min-h-[44px]">Reply</button>
      </div>
      <div id="reply-input-${c.id}" class="hidden mt-2 rounded-lg p-3" style="background:#2d2d2d;">
        <input type="text" id="reply-text-${c.id}" placeholder="Write a reply..."
          class="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded text-sm focus:border-accent focus:outline-none mb-2">
        <div class="flex gap-2 items-center">
          <button onclick="submitReply(${c.id})" class="px-4 py-2 bg-accent hover:bg-indigo-600 rounded text-sm font-medium transition">Send</button>
          <button onclick="closeReplyInput(${c.id})" class="px-3 py-2 text-gray-400 hover:text-white text-sm transition">Cancel</button>
        </div>
      </div>
    </div>
  `).join('');
}

window.toggleSolved = async function(commentId, solved) {
  await api(`/admin/comments/${commentId}`, { method: 'PUT', json: { solved } });
  await loadComments(currentVersion.id);
  renderVersionsList(currentSong.versions);
};

window.editComment = function(commentId, currentText) {
  openModal('Edit Comment', 'Comment text', async (text) => {
    await api(`/admin/comments/${commentId}`, { method: 'PUT', json: { text } });
    await loadComments(currentVersion.id);
  }, currentText);
};

window.deleteComment = async function(commentId) {
  if (!confirm('Delete this comment?')) return;
  await api(`/admin/comments/${commentId}`, { method: 'DELETE' });
  await loadComments(currentVersion.id);
  renderVersionsList(currentSong.versions);
};

window.toggleReplyInput = function(commentId) {
  document.querySelectorAll('[id^="reply-input-"]').forEach(el => {
    if (el.id !== `reply-input-${commentId}`) el.classList.add('hidden');
  });
  const el = document.getElementById(`reply-input-${commentId}`);
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) document.getElementById(`reply-text-${commentId}`).focus();
};

window.closeReplyInput = function(commentId) {
  document.getElementById(`reply-input-${commentId}`).classList.add('hidden');
};

window.submitReply = async function(commentId) {
  const text = document.getElementById(`reply-text-${commentId}`).value.trim();
  if (!text) return;
  const replyAuthor = localStorage.getItem('mixreaview_admin_name') || 'Admin';
  await api(`/api/projects/${currentProject.share_link}/comments/${commentId}/reply`, { method: 'POST', json: { author_name: replyAuthor, text } });
  await loadComments(currentVersion.id);
};

function renderCommentMarkers() {
  document.querySelectorAll('.comment-marker').forEach(el => el.remove());
  if (!ws || !ws.getDuration()) return;
  const container = document.querySelector('#admin-waveform');
  const dur = ws.getDuration();
  adminComments.forEach(c => {
    const m = document.createElement('div');
    m.className = 'comment-marker';
    m.style.left = ((c.timecode / dur) * 100) + '%';
    m.title = `@${formatTime(c.timecode)} - ${c.author_name}: ${c.text}`;
    m.addEventListener('click', (e) => { e.stopPropagation(); jumpTo(c.timecode); });
    container.appendChild(m);
  });
}

window.jumpTo = function(s) { if (ws && ws.getDuration()) ws.seekTo(s / ws.getDuration()); };

$('admin-comment-submit').addEventListener('click', submitComment);
$('admin-comment-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitComment(); });

async function submitComment() {
  const author = $('admin-author-name').value.trim();
  const text = $('admin-comment-text').value.trim();
  if (!author) { $('admin-author-name').focus(); return; }
  if (!text) { $('admin-comment-text').focus(); return; }
  if (!currentVersion || !currentProject) return;
  try {
    await api(`/api/projects/${currentProject.share_link}/comments`, {
      method: 'POST', json: { version_id: currentVersion.id, timecode: ws ? ws.getCurrentTime() : 0, author_name: author, text },
    });
    $('admin-comment-text').value = '';
    await loadComments(currentVersion.id);
  } catch (err) { alert('Failed: ' + err.message); }
}

// ============================================================
// UPLOAD
// ============================================================
function startUpload(songId) {
  uploadFile = null; $('upload-file').value = ''; $('upload-label').value = ''; $('upload-version').value = '';
  $('upload-selected').classList.add('hidden'); $('upload-confirm').classList.add('hidden');
  $('upload-progress').classList.add('hidden'); $('upload-bar').style.width = '0%';
  $('upload-overlay').classList.remove('hidden'); $('upload-label').focus();
}
function closeUpload() { $('upload-overlay').classList.add('hidden'); uploadFile = null; }

$('upload-cancel').addEventListener('click', closeUpload);
$('upload-overlay').addEventListener('click', (e) => { if (e.target === $('upload-overlay')) closeUpload(); });
$('upload-drop').addEventListener('click', () => $('upload-file').click());
$('upload-drop').addEventListener('dragover', (e) => { e.preventDefault(); $('upload-drop').classList.add('border-accent'); });
$('upload-drop').addEventListener('dragleave', () => $('upload-drop').classList.remove('border-accent'));
$('upload-drop').addEventListener('drop', (e) => { e.preventDefault(); $('upload-drop').classList.remove('border-accent'); if (e.dataTransfer.files.length) selectFile(e.dataTransfer.files[0]); });
$('upload-file').addEventListener('change', (e) => { if (e.target.files.length) selectFile(e.target.files[0]); });

function selectFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['wav', 'mp3', 'flac'].includes(ext)) { alert('Only WAV, MP3, and FLAC files are allowed.'); return; }
  uploadFile = file;
  $('upload-selected').textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  $('upload-selected').classList.remove('hidden'); $('upload-confirm').classList.remove('hidden');
}

$('upload-confirm').addEventListener('click', async () => {
  if (!uploadFile || !currentSong) return;
  $('upload-confirm').classList.add('hidden'); $('upload-progress').classList.remove('hidden');
  const fd = new FormData();
  fd.append('file', uploadFile); fd.append('label', $('upload-label').value.trim());
  const vn = $('upload-version').value.trim(); if (vn) fd.append('version_number', vn);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${API}/admin/songs/${currentSong.id}/versions`);
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) $('upload-bar').style.width = Math.round((e.loaded / e.total) * 100) + '%'; });
  xhr.addEventListener('load', () => { if (xhr.status === 201) { closeUpload(); openSong(currentSong.id); } else { alert('Upload failed'); $('upload-confirm').classList.remove('hidden'); $('upload-progress').classList.add('hidden'); } });
  xhr.addEventListener('error', () => { alert('Upload failed'); $('upload-confirm').classList.remove('hidden'); $('upload-progress').classList.add('hidden'); });
  xhr.send(fd);
});

// ============================================================
// MODAL
// ============================================================
let modalCb = null;
function openModal(title, ph, cb, prefill) {
  $('modal-title').textContent = title; $('modal-input').placeholder = ph; $('modal-input').value = prefill || '';
  $('modal-overlay').classList.remove('hidden'); $('modal-input').focus(); $('modal-input').select(); modalCb = cb;
}
function closeModal() { $('modal-overlay').classList.add('hidden'); modalCb = null; }
$('modal-cancel').addEventListener('click', closeModal);
$('modal-overlay').addEventListener('click', (e) => { if (e.target === $('modal-overlay')) closeModal(); });
$('modal-confirm').addEventListener('click', async () => { const v = $('modal-input').value.trim(); if (!v || !modalCb) return; await modalCb(v); closeModal(); });
$('modal-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('modal-confirm').click(); });

// ============================================================
// HELPERS
// ============================================================
function formatTime(s) { return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`; }
function formatDate(iso) {
  const d = new Date(iso);
  if (window.innerWidth < 768) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString();
}
function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escAttr(str) { return str.replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

// ============================================================
// SETTINGS
// ============================================================
const COLOR_FIELDS = [
  'accent_color', 'dark_900', 'dark_800', 'dark_700', 'dark_600',
  'text_color', 'waveform_color', 'waveform_progress_color',
];
const LIGHT_COLOR_FIELDS = [
  'light_accent_color', 'light_bg_900', 'light_bg_800', 'light_bg_700', 'light_bg_600',
  'light_text_color', 'light_waveform_color', 'light_waveform_progress_color',
];
const COLOR_DEFAULTS = {
  accent_color: '#6366f1', dark_900: '#0f0f0f', dark_800: '#1a1a1a',
  dark_700: '#2a2a2a', dark_600: '#3a3a3a', text_color: '#e5e7eb',
  waveform_color: '#4b5563', waveform_progress_color: '#6366f1',
};
const LIGHT_COLOR_DEFAULTS = {
  light_accent_color: '#4f46e5', light_bg_900: '#ffffff', light_bg_800: '#f9fafb',
  light_bg_700: '#f3f4f6', light_bg_600: '#e5e7eb', light_text_color: '#111827',
  light_waveform_color: '#d1d5db', light_waveform_progress_color: '#4f46e5',
};

async function loadAppSettings() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) { appSettings = await res.json(); applySettings(appSettings); }
  } catch { /* defaults */ }
}

function getThemeColors(s) {
  if (currentTheme === 'light') {
    return {
      bg900: s.light_bg_900 || '#ffffff', bg800: s.light_bg_800 || '#f9fafb',
      bg700: s.light_bg_700 || '#f3f4f6', bg600: s.light_bg_600 || '#e5e7eb',
      accent: s.light_accent_color || '#4f46e5', text: s.light_text_color || '#111827',
      waveform: s.light_waveform_color || '#d1d5db', waveformProgress: s.light_waveform_progress_color || '#4f46e5',
    };
  }
  return {
    bg900: s.dark_900, bg800: s.dark_800, bg700: s.dark_700, bg600: s.dark_600,
    accent: s.accent_color, text: s.text_color,
    waveform: s.waveform_color, waveformProgress: s.waveform_progress_color,
  };
}

function applySettings(s) {
  const c = getThemeColors(s);
  let style = document.getElementById('app-settings-style');
  if (!style) { style = document.createElement('style'); style.id = 'app-settings-style'; document.head.appendChild(style); }
  style.textContent = `
    body { background-color: ${c.bg900} !important; color: ${c.text} !important; }
    .bg-dark-900 { background-color: ${c.bg900} !important; }
    .bg-dark-800 { background-color: ${c.bg800} !important; }
    .bg-dark-700 { background-color: ${c.bg700} !important; }
    .bg-dark-600 { background-color: ${c.bg600} !important; }
    .bg-accent { background-color: ${c.accent} !important; }
    .text-accent { color: ${c.accent} !important; }
    .font-mono.text-accent { color: ${c.accent} !important; }
    .border-dark-700 { border-color: ${c.bg700} !important; }
    .border-dark-600 { border-color: ${c.bg600} !important; }
    .border-accent\\/30 { border-color: ${c.accent}4d !important; }
    .bg-accent\\/10 { background-color: ${c.accent}1a !important; }
    .hover\\:bg-dark-700:hover { background-color: ${c.bg700} !important; }
    .hover\\:bg-dark-600:hover { background-color: ${c.bg600} !important; }
    .hover\\:bg-indigo-600:hover { background-color: ${c.accent} !important; filter: brightness(0.85); }
    .focus\\:border-accent:focus { border-color: ${c.accent} !important; }
  `;
  // Logo
  const logo = $('header-logo');
  const text = $('header-text');
  if (s.logo_url) {
    logo.src = s.logo_url + '?t=' + Date.now();
    logo.style.height = (s.logo_height || 32) + 'px';
    logo.classList.remove('hidden');
    text.classList.add('hidden');
  } else {
    logo.classList.add('hidden');
    text.classList.remove('hidden');
  }
}

const FIELD_TO_ID = {
  accent_color: 'color-accent', dark_900: 'color-dark-900', dark_800: 'color-dark-800',
  dark_700: 'color-dark-700', dark_600: 'color-dark-600', text_color: 'color-text',
  waveform_color: 'color-waveform', waveform_progress_color: 'color-waveform-progress',
  light_accent_color: 'color-light-accent', light_bg_900: 'color-light-900', light_bg_800: 'color-light-800',
  light_bg_700: 'color-light-700', light_bg_600: 'color-light-600', light_text_color: 'color-light-text',
  light_waveform_color: 'color-light-waveform', light_waveform_progress_color: 'color-light-waveform-progress',
};
function fieldToInputId(field) { return FIELD_TO_ID[field]; }

// Theme mode
let currentTheme = localStorage.getItem('mixreaview_theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

$('settings-btn').addEventListener('click', () => {
  hideAllViews(); $('settings-view').classList.remove('hidden'); destroyPlayer();
  // Populate color inputs
  if (appSettings) {
    COLOR_FIELDS.forEach(f => {
      const el = $(fieldToInputId(f));
      if (el) el.value = appSettings[f];
    });
    LIGHT_COLOR_FIELDS.forEach(f => {
      const el = $(fieldToInputId(f));
      if (el) el.value = appSettings[f] || LIGHT_COLOR_DEFAULTS[f];
    });
    // Logo
    if (appSettings.logo_url) {
      $('logo-img').src = appSettings.logo_url + '?t=' + Date.now();
      $('logo-img').classList.remove('hidden'); $('logo-placeholder').classList.add('hidden');
      $('delete-logo-btn').classList.remove('hidden');
      $('logo-size-control').classList.remove('hidden');
      $('logo-size').value = appSettings.logo_height || 32;
      $('logo-size-label').textContent = appSettings.logo_height || 32;
    } else {
      $('logo-img').classList.add('hidden'); $('logo-placeholder').classList.remove('hidden');
      $('delete-logo-btn').classList.add('hidden');
      $('logo-size-control').classList.add('hidden');
    }
  }
});

$('back-from-settings').addEventListener('click', () => showProjects());

$('logo-size').addEventListener('input', () => {
  $('logo-size-label').textContent = $('logo-size').value;
  $('logo-img').style.height = $('logo-size').value + 'px';
});

$('save-settings-btn').addEventListener('click', async () => {
  const data = {};
  COLOR_FIELDS.forEach(f => { data[f] = $(fieldToInputId(f)).value; });
  LIGHT_COLOR_FIELDS.forEach(f => { data[f] = $(fieldToInputId(f)).value; });
  data.logo_height = parseInt($('logo-size').value);
  try {
    appSettings = await api('/admin/settings', { method: 'PUT', json: data });
    applySettings(appSettings);
    $('save-status').textContent = 'Saved!';
    setTimeout(() => $('save-status').textContent = '', 2000);
  } catch (err) { alert('Failed: ' + err.message); }
});

$('reset-colors-btn').addEventListener('click', () => {
  COLOR_FIELDS.forEach(f => { $(fieldToInputId(f)).value = COLOR_DEFAULTS[f]; });
  LIGHT_COLOR_FIELDS.forEach(f => { $(fieldToInputId(f)).value = LIGHT_COLOR_DEFAULTS[f]; });
});

// Logo upload
$('upload-logo-btn').addEventListener('click', () => $('logo-file-input').click());
$('logo-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  try {
    const res = await fetch('/admin/settings/logo', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
    if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Upload failed'); }
    appSettings = await res.json();
    applySettings(appSettings);
    $('logo-img').src = appSettings.logo_url + '?t=' + Date.now();
    $('logo-img').classList.remove('hidden'); $('logo-placeholder').classList.add('hidden');
    $('delete-logo-btn').classList.remove('hidden');
  } catch (err) { alert(err.message); }
  $('logo-file-input').value = '';
});

$('delete-logo-btn').addEventListener('click', async () => {
  if (!confirm('Remove logo?')) return;
  await api('/admin/settings/logo', { method: 'DELETE' });
  appSettings = await (await fetch('/api/settings')).json();
  applySettings(appSettings);
  $('logo-img').classList.add('hidden'); $('logo-placeholder').classList.remove('hidden');
  $('delete-logo-btn').classList.add('hidden');
});

// Theme toggle
function updateThemeIcon() {
  $('theme-toggle-btn').textContent = currentTheme === 'dark' ? '🌙' : '☀️';
}
$('theme-toggle-btn').addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('mixreaview_theme', currentTheme);
  if (appSettings) applySettings(appSettings);
  updateThemeIcon();
});

init();
updateThemeIcon();

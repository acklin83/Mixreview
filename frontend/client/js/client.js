const $ = (id) => document.getElementById(id);

// Extract share link from URL path
const shareLink = window.location.pathname.replace(/^\//, '');
let appSettings = null;
let project = null;
let currentSong = null;
let currentVersion = null;
let ws = null; // wavesurfer
let comments = [];
let authorStorageKey = 'mixreaview_author';
let currentTheme = localStorage.getItem('mixreaview_theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

// --- API ---
async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('Not found');
  return res.json();
}

async function postComment(data) {
  const res = await fetch(`/api/projects/${shareLink}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to post comment');
  }
  return res.json();
}

// --- Settings ---
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
  if (s.logo_url) {
    $('header-logo').src = s.logo_url;
    $('header-logo').style.height = (s.logo_height || 32) + 'px';
    $('header-logo').classList.remove('hidden');
  }
}

// --- Init ---
async function init() {
  await loadAppSettings();
  try {
    project = await api(`/api/projects/${shareLink}`);
  } catch {
    $('loading').classList.add('hidden');
    $('not-found').classList.remove('hidden');
    return;
  }

  $('loading').classList.add('hidden');
  $('client').classList.remove('hidden');
  $('project-title').textContent = project.title;

  // Restore author name (per-project, with fallback to global)
  authorStorageKey = `mixreaview_author_${shareLink}`;
  const saved = localStorage.getItem(authorStorageKey) || localStorage.getItem('mixreaview_author');
  if (saved) {
    $('author-name').value = saved;
  } else {
    $('author-name').value = project.title;
  }

  showSongsList();
}

// ============================================================
// VIEW 1: SONGS LIST
// ============================================================
function hideAllViews() {
  $('songs-view').classList.add('hidden');
  $('song-view').classList.add('hidden');
}

function showSongsList() {
  hideAllViews();
  $('songs-view').classList.remove('hidden');
  destroyPlayer();
  currentSong = null;
  currentVersion = null;

  if (project.songs.length === 0) {
    $('songs-list').innerHTML = '';
    $('songs-empty').classList.remove('hidden');
    return;
  }
  $('songs-empty').classList.add('hidden');
  $('songs-list').innerHTML = project.songs.map(s => `
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

  // If only one song, auto-open it
  if (project.songs.length === 1) {
    openSong(project.songs[0].id);
  }
}

// ============================================================
// VIEW 2: SONG DETAIL (2-column)
// ============================================================
window.openSong = function(songId) {
  const song = project.songs.find(s => s.id === songId);
  if (!song) return;
  currentSong = song;

  hideAllViews();
  $('song-view').classList.remove('hidden');
  $('song-title').textContent = song.title;

  // Show/hide back button (hide if only one song)
  $('back-to-songs').classList.toggle('hidden', project.songs.length <= 1);

  renderVersionsList(song.versions);

  // Auto-play latest version
  if (song.versions.length > 0) {
    const target = currentVersion && song.versions.find(v => v.id === currentVersion.id)
      ? song.versions.find(v => v.id === currentVersion.id)
      : (song.versions.find(v => v.favourite) || song.versions[song.versions.length - 1]);
    playVersion(target);
  } else {
    $('player-area').classList.add('hidden');
    $('comment-input-area').classList.add('hidden');
    $('versions-empty').classList.remove('hidden');
    comments = [];
    renderComments();
  }
};

function renderVersionsList(versions) {
  if (versions.length === 0) {
    $('versions-list').innerHTML = '';
    $('versions-empty').classList.remove('hidden');
    return;
  }
  $('versions-empty').classList.add('hidden');
  $('versions-list').innerHTML = versions.map(v => `
    <div class="flex items-center justify-between p-3 rounded-lg cursor-pointer transition
      ${currentVersion && currentVersion.id === v.id ? 'bg-accent/10 border border-accent/30' : 'bg-dark-800 hover:bg-dark-700'}"
         onclick="playVersion(${JSON.stringify(v).replace(/"/g, '&quot;')})">
      <div class="flex items-center gap-2">
        <button onclick="event.stopPropagation(); toggleFavourite(${v.id})"
          class="text-lg leading-none transition ${v.favourite ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400/60'}"
          title="Set as favourite">${v.favourite ? '★' : '☆'}</button>
        <span class="font-mono text-accent text-sm">v${v.version_number}</span>
        <span class="text-sm">${esc(v.label)}</span>
      </div>
      <div class="flex items-center gap-3">
        <a href="/api/audio/${v.id}" download="${esc(v.original_filename)}"
           onclick="event.stopPropagation()" class="text-xs text-gray-400 hover:text-white transition">Download</a>
        <span class="text-xs text-gray-500">${formatDate(v.created_at)}</span>
      </div>
    </div>
  `).join('');
}

window.toggleFavourite = async function(versionId) {
  await fetch(`/api/projects/${shareLink}/versions/${versionId}/favourite`, { method: 'PATCH' });
  // Reload project data to refresh favourite state
  project = await api(`/api/projects/${shareLink}`);
  const song = project.songs.find(s => s.id === currentSong.id);
  if (song) { currentSong = song; renderVersionsList(song.versions); }
};

window.playVersion = function(version) {
  currentVersion = version;
  $('player-area').classList.remove('hidden');
  $('comment-input-area').classList.remove('hidden');

  // Re-render to highlight active version
  renderVersionsList(currentSong.versions);

  const seekTo = ws ? ws.getCurrentTime() : undefined;
  const playing = ws ? ws.isPlaying() : false;
  loadAudio(version.id, seekTo, playing);
  loadComments(version.id);
};

$('back-to-songs').addEventListener('click', () => {
  destroyPlayer();
  currentSong = null;
  currentVersion = null;
  showSongsList();
});

// ============================================================
// WAVESURFER
// ============================================================
function loadAudio(versionId, seekTo, wasPlaying) {
  destroyPlayer();
  ws = WaveSurfer.create({
    container: '#waveform',
    waveColor: (appSettings ? getThemeColors(appSettings).waveform : '#4b5563'),
    progressColor: (appSettings ? getThemeColors(appSettings).waveformProgress : '#6366f1'),
    cursorColor: (appSettings ? getThemeColors(appSettings).text : '#e5e7eb'), cursorWidth: 1, height: window.innerWidth < 768 ? 64 : 128,
    barWidth: 2, barGap: 1, barRadius: 2, normalize: true,
  });
  ws.load(`/api/audio/${versionId}`);
  ws.on('ready', () => {
    $('time-duration').textContent = formatTime(ws.getDuration());
    if (typeof seekTo === 'number' && ws.getDuration() > 0) ws.seekTo(Math.min(seekTo / ws.getDuration(), 1));
    if (wasPlaying) ws.play();
    renderCommentMarkers();
  });
  ws.on('audioprocess', updateTime);
  ws.on('seeking', updateTime);
  ws.on('play', () => { $('play-icon').classList.add('hidden'); $('pause-icon').classList.remove('hidden'); });
  ws.on('pause', () => { $('play-icon').classList.remove('hidden'); $('pause-icon').classList.add('hidden'); });
}

function destroyPlayer() { if (ws) { ws.destroy(); ws = null; } }
function updateTime() {
  if (!ws) return;
  $('time-current').textContent = formatTime(ws.getCurrentTime());
  $('comment-timecode').textContent = '@' + formatTime(ws.getCurrentTime());
}

$('play-btn').addEventListener('click', () => { if (ws) ws.playPause(); });
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); if (ws) ws.playPause(); } });

// ============================================================
// COMMENTS
// ============================================================
async function loadComments(versionId) {
  try { comments = await api(`/api/projects/${shareLink}/comments?version_id=${versionId}`); }
  catch { comments = []; }
  renderComments();
  renderCommentMarkers();
}

function renderComments() {
  if (comments.length === 0) { $('comments-list').innerHTML = ''; $('comments-empty').classList.remove('hidden'); return; }
  $('comments-empty').classList.add('hidden');
  $('comments-list').innerHTML = comments.map(c => `
    <div class="bg-dark-800 rounded-lg p-3 mb-2 ${c.solved ? 'opacity-50' : ''}">
      <div class="flex items-center gap-2 mb-1">
        <button onclick="jumpTo(${c.timecode})"
          class="text-xs font-mono text-amber-400 bg-dark-700 px-2 py-1.5 rounded hover:bg-dark-600 transition min-h-[44px] min-w-[44px] inline-flex items-center justify-center">
          @${formatTime(c.timecode)}
        </button>
        <span class="text-sm font-medium text-gray-300">${esc(c.author_name)}</span>
        ${c.solved ? '<span class="text-xs text-green-400 ml-auto">✓ Done</span>' : ''}
        <span class="text-xs text-gray-600 ${c.solved ? '' : 'ml-auto'}">${formatDate(c.created_at)}</span>
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
          <input type="text" id="reply-author-${c.id}" placeholder="Your name"
            class="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded text-sm focus:border-accent focus:outline-none">
          <button onclick="submitReply(${c.id})" class="px-4 py-2 bg-accent hover:bg-indigo-600 rounded text-sm font-medium transition">Send</button>
          <button onclick="closeReplyInput(${c.id})" class="px-3 py-2 text-gray-400 hover:text-white text-sm transition">Cancel</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderCommentMarkers() {
  document.querySelectorAll('.comment-marker').forEach(el => el.remove());
  if (!ws || !ws.getDuration()) return;
  const container = document.querySelector('#waveform');
  const dur = ws.getDuration();
  comments.forEach(c => {
    const m = document.createElement('div');
    m.className = 'comment-marker';
    m.style.left = ((c.timecode / dur) * 100) + '%';
    m.title = `@${formatTime(c.timecode)} - ${c.author_name}: ${c.text}`;
    m.addEventListener('click', (e) => { e.stopPropagation(); jumpTo(c.timecode); });
    container.appendChild(m);
  });
}

window.jumpTo = function(s) { if (ws && ws.getDuration()) ws.seekTo(s / ws.getDuration()); };

window.toggleReplyInput = function(commentId) {
  // Close all other reply inputs first
  document.querySelectorAll('[id^="reply-input-"]').forEach(el => {
    if (el.id !== `reply-input-${commentId}`) el.classList.add('hidden');
  });
  const el = document.getElementById(`reply-input-${commentId}`);
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) {
    const authorInput = document.getElementById(`reply-author-${commentId}`);
    const saved = localStorage.getItem(authorStorageKey) || '';
    if (saved && !authorInput.value) authorInput.value = saved;
    document.getElementById(`reply-text-${commentId}`).focus();
  }
};

window.closeReplyInput = function(commentId) {
  document.getElementById(`reply-input-${commentId}`).classList.add('hidden');
};

window.submitReply = async function(commentId) {
  const text = document.getElementById(`reply-text-${commentId}`).value.trim();
  const author = document.getElementById(`reply-author-${commentId}`).value.trim();
  if (!text || !author) return;
  try {
    await fetch(`/api/projects/${shareLink}/comments/${commentId}/reply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_name: author, text })
    });
    localStorage.setItem(authorStorageKey, author);
    await loadComments(currentVersion.id);
  } catch (err) { alert('Failed to reply: ' + err.message); }
};

$('comment-submit').addEventListener('click', submitComment);
$('comment-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitComment(); });

async function submitComment() {
  const author = $('author-name').value.trim();
  const text = $('comment-text').value.trim();
  if (!author) { $('author-name').focus(); return; }
  if (!text) { $('comment-text').focus(); return; }
  if (!currentVersion) return;
  const timecode = ws ? ws.getCurrentTime() : 0;
  try {
    await postComment({ version_id: currentVersion.id, timecode, author_name: author, text });
    localStorage.setItem(authorStorageKey, author);
    $('comment-text').value = '';
    await loadComments(currentVersion.id);
  } catch (err) { alert('Failed to post comment: ' + err.message); }
}

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

// --- Theme Toggle ---
function updateThemeIcon() {
  $('theme-icon-moon').classList.toggle('hidden', currentTheme !== 'dark');
  $('theme-icon-sun').classList.toggle('hidden', currentTheme !== 'light');
}
$('theme-toggle-btn').addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('mixreaview_theme', currentTheme);
  if (appSettings) applySettings(appSettings);
  updateThemeIcon();
});

// --- Start ---
updateThemeIcon();
init();

# MixReaview - Development Roadmap (Compact)

**Branch:** `feature/mobile-fixes-and-enhancements`

---

## 🚨 PRIORITY 0: Waveform Click Verification

**Status:** Reportedly working again, but needs verification

**Action:**
- Test waveform click/tap on Desktop (Chrome, Safari, Firefox)
- Test on Mobile (iOS Safari, Android Chrome)
- If broken: Check Wavesurfer config has `interact: true`
- If broken: Check CSS has `pointer-events: auto` on waveform
- Document what fixed it (if it was broken)

**Time:** 30min testing

---

## TODAY - Task 1: Mobile UI Fixes

### 1.1 Reply Form Overlap Fix (CRITICAL)

**Problem:** Reply input form overlaps comment text on mobile

**Fix:**
- Reply form must appear BELOW parent comment (not overlapping)
- Hidden by default, toggle on "Reply" button click
- Only one reply form open at a time
- Full-width on mobile
- Light background (#2d2d2d) to distinguish from parent
- Add Cancel button or tap-outside-to-close

### 1.2 Default Guest Name

**Requirement:**
- When guest accesses via share link, author input defaults to **Project Name**
- Example: Project "Album XY - Mastering" → Default name "Album XY - Mastering"
- User can edit/change name
- Store changed name in localStorage for future comments (per-project)
- localStorage key: `mixreaview_author_{project_uuid}`

### 1.3 Touch Targets

**Fix all touch targets to minimum 44x44px:**
- Reply/Jump/Resolve buttons
- Timecode links (@0:37)
- Comment markers on waveform
- Version selector dropdown
- Play/pause button

### 1.4 Open Comments Count

**Requirement:**
- In song overview/list, show count of open (unresolved) comments
- Display format: "5 open" (number + text)
- Calculate as sum across ALL versions of that song
- Update count when comment resolved/unresolved
- Show in:
  * Admin project view (song list)
  * Client share link view (if multiple songs)
  * Next to each song title

**Example:**
```
Song A          5 open
Song B          All resolved
Song C          1 open
```

**Backend:** Query count of `resolved=false` comments per song
**Frontend:** Display badge/text next to song title

### 1.5 Mobile Polish

- No zoom on input focus (viewport meta: `user-scalable=no`)
- Prevent tap highlight (CSS: `-webkit-tap-highlight-color: transparent`)
- Safe-area padding for iPhone notch
- Timestamps shorter on mobile: "21:35" instead of "29.1.2026, 21:35:12"

**Files to modify:**
- `frontend/client/index.html`
- `frontend/client/css/styles.css`
- `frontend/client/js/app.js`
- `frontend/admin/` (same fixes if needed)

**Time estimate:** 3-4 hours

---

## TODAY - Task 2: REAPER ExtState Memory

### Requirement

**Goal:** REAPER project remembers its MixReaview UUID automatically

**Implementation:**
```lua
-- On script start:
1. Get current project path
2. Generate project_id = MD5(path)
3. Check ExtState: reaper.GetExtState("MixReaview", project_id)
4. If exists: Auto-load comments from that UUID
5. If not: Show "Link to Project" button

-- Link Project:
1. User pastes share link (or just UUID)
2. Save: reaper.SetExtState("MixReaview", project_id, uuid, true)
3. Reload comments

-- Unlink Project:
1. Button to remove link
2. Clear ExtState
```

**UI Changes:**
- Show status: "✓ Linked to: Song A" or "Not linked"
- "Link to Project" button (when not linked)
- "Unlink Project" button (when linked)
- Input field for UUID paste

**Files to modify:**
- `reaper/mixreaview_comments.lua`

**Time estimate:** 1-2 hours

---

## PHASE 2 (Later) - Advanced Features

### Task 3: REAPER Upload from Script

**Goal:** Upload rendered mixes directly from REAPER without browser

**Key Features:**
- File browser for WAV/MP3/FLAC selection
- Create new project OR add to existing project
- Dropdowns for project/song selection
- Upload with progress indicator
- Share link copied to clipboard
- Auto-link to current REAPER project

**Backend needs:**
- `POST /api/admin/upload` endpoint
- `GET /api/admin/projects/list` for dropdown

**Files:**
- `reaper/mixreaview_upload.py` (new)
- Backend API extensions

**Time estimate:** 6-9 hours

---

### Task 4: Marker Display

**Goal:** Show embedded REAPER markers in waveform

**How it works:**
1. User exports from REAPER with "Embed markers" enabled
2. Backend extracts markers from WAV/MP3/FLAC on upload
3. Frontend displays as vertical lines with labels on waveform
4. Click marker = jump to that position

**Visual:**
```
    Intro    Verse    Chorus    Bridge
      |        |         |         |
  ▶ [=|========|=========|=========|====]
```

**Backend needs:**
- Extract markers from audio files (BWF cue points, ID3 tags)
- New `Marker` database model
- `GET /api/versions/{id}/markers` endpoint

**Frontend needs:**
- Render vertical lines at marker positions
- Show marker names as labels
- Click handler to jump to timecode

**Files:**
- Backend: `models.py`, `utils/audio.py`, `routers/projects.py`
- Frontend: `app.js`, `styles.css`

**Time estimate:** 5-7 hours

---

### Task 5: WebView Script (Big Feature)

**Goal:** Beautiful web UI instead of ImGui for REAPER integration

**Architecture:**
```
Browser Window (localhost:9999)
    ↕ WebSocket
Python Script in REAPER
    ↕ REAPER API
```

**Benefits:**
- Identical UI to website (professional look)
- Better UX than ImGui
- Marketing/demo advantage

**Implementation:**
- Python script starts HTTP server + WebSocket server
- Opens browser automatically
- Browser displays same UI as website
- WebSocket sends jump/play commands to REAPER
- REAPER sends playhead position to browser

**Time estimate:** 6-8 hours

---

## Testing Checklist

**Mobile UI:**
- [ ] Reply forms display below comments (not overlapping)
- [ ] Default author name = project name
- [ ] Author name persists in localStorage after change
- [ ] Touch targets all 44x44px minimum
- [ ] Open comments count shows per song
- [ ] Count updates when resolving/unresolving
- [ ] No zoom on input focus (iOS)
- [ ] Timestamps shortened on mobile

**ExtState:**
- [ ] UUID saved to ExtState on link
- [ ] UUID persists after REAPER restart
- [ ] Different projects have different UUIDs
- [ ] Unlink removes UUID
- [ ] Status indicator shows correct state

**Waveform Click:**
- [ ] Works on Desktop (Chrome, Safari, Firefox)
- [ ] Works on iOS Safari
- [ ] Works on Android Chrome
- [ ] Playhead updates immediately
- [ ] Audio seeks to clicked position

---

## Implementation Notes

**For Claude Code:**

- Start with Task 1 (Mobile UI) - most critical for user experience
- Then Task 2 (ExtState) - quick win, big UX improvement
- Test thoroughly on mobile devices (not just desktop)
- Keep code simple and maintainable
- Add comments for complex logic
- Phase 2 features: implement only when Tasks 1+2 are complete and tested

**Priority:**
1. Mobile UI fixes (TODAY)
2. ExtState memory (TODAY)
3. Waveform click verification (if needed)
4. Phase 2 features (LATER)

**Timeline:**
- Today: Tasks 1+2 (4-6 hours total)
- Phase 2: When ready for advanced features

---

## Database Changes Needed

### For Open Comments Count:

No schema changes needed - just query:
```sql
SELECT song_id, COUNT(*) as open_count
FROM comments c
JOIN versions v ON c.version_id = v.id  
WHERE c.resolved = false
GROUP BY song_id
```

### For Markers (Phase 2):

New table:
```sql
CREATE TABLE markers (
    id INTEGER PRIMARY KEY,
    version_id INTEGER REFERENCES versions(id),
    timecode FLOAT NOT NULL,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(7) DEFAULT '#f59e0b',
    created_at TIMESTAMP
);
```

---

## Success Criteria

**Today's Goals:**
✅ Mobile UI is touch-friendly and polished  
✅ Reply forms don't overlap  
✅ Default guest names work  
✅ Open comments visible per song  
✅ REAPER remembers project links  
✅ Waveform click verified working  

**Phase 2 Goals:**
✅ Upload from REAPER works  
✅ Markers display in waveform  
✅ WebView provides beautiful UI  

---

**SHIP IT! 🚀**

# Mix Reaview System - Project Documentation

## Project Overview
A self-hosted audio review platform for Störsender-Studio that allows clients to listen to mix versions and leave timeline-based comments via secure share links.

## Core Requirements

### Functionality
- **Projects**: Container for multiple songs (e.g., "Album XY - Mastering")
- **Songs**: Individual tracks within a project
- **Versions**: Multiple mix versions per song (v1, v2, v3, auto-incrementing)
- **Comments**: Timeline-based comments with precise timecode (@0:45)
- **Share Links**: UUID-based, one link per project (gives access to all songs/versions)
- **Admin Interface**: Upload management, project organization
- **Client View**: Clean, minimal player interface for customers

### Data Model
```
Project
  ├─ id (UUID)
  ├─ title
  ├─ share_link (UUID)
  ├─ created_at
  └─ Songs[]
       ├─ id
       ├─ title
       ├─ position (order in project)
       └─ Versions[]
            ├─ id
            ├─ version_number (v1, v2, v3...)
            ├─ file_path
            ├─ created_at
            └─ Comments[]
                 ├─ id
                 ├─ timecode (seconds, float)
                 ├─ author_name
                 ├─ text
                 ├─ solved (boolean)
                 ├─ created_at
                 └─ Replies[]
                      ├─ id
                      ├─ author_name
                      ├─ text
                      └─ created_at
```

### Key Design Decisions
- **Comments are per-version**: Each version has its own comment thread
- **No user accounts for clients**: Share link is the only auth needed
- **Admin uses simple login**: Basic auth for studio owner, password set during setup
- **Download enabled**: Clients can download approved versions
- **File formats**: WAV, MP3, FLAC (other formats rejected at upload)

## Technical Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: SQLite (sufficient for use case, simple backup)
- **ORM**: SQLAlchemy
- **Validation**: Pydantic models
- **Auth**: JWT for admin, UUID share links for clients

### Frontend
- **Framework**: Vanilla JavaScript (no build step needed)
- **Audio Player**: Wavesurfer.js (waveform visualization + playback)
- **Styling**: TailwindCSS via CDN
- **Comments**: Real-time display with jump-to-timecode functionality

### Deployment
- **Container**: Docker + Docker-Compose
- **Target**: Synology DiskStation (10GbE network)
- **Reverse Proxy**: nginx with SSL/TLS (Let's Encrypt)
- **Storage**: Volume mount to DiskStation shared folder

## Infrastructure

### DiskStation Setup
- **Network**: 10GbE connection (bandwidth not a bottleneck)
- **Docker**: Native Docker support via Container Manager
- **Storage**: Dedicated volume for audio files and database
- **Domain**: mix.stoersender.ch (subdomain of existing stoersender.ch)
- **SSL**: Let's Encrypt via Synology DSM
- **Reverse Proxy**: nginx routing to Docker container port 8000

### URL Structure
- **Client Share Links**: `https://mix.stoersender.ch/{short-uuid}`
  - Short UUID format: 12 characters (e.g., `7f3a9c2d4b8e`)
  - Provides 3+ trillion unique combinations
  - Example: `https://mix.stoersender.ch/a1b2c3d4e5f6`
- **Admin Interface**: `https://mix.stoersender.ch/admin`
  - Login protected (JWT authentication)
  - Password set during initial setup (not default password)

### Directory Structure
```
mixreaview/
├── docker-compose.yml
├── nginx/
│   ├── Dockerfile
│   └── nginx.conf
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── database.py
│   │   ├── auth.py
│   │   └── routers/
│   │       ├── admin.py
│   │       ├── projects.py
│   │       └── comments.py
│   └── tests/
├── frontend/
│   ├── admin/
│   │   ├── index.html
│   │   ├── css/
│   │   └── js/
│   └── client/
│       ├── index.html
│       ├── css/
│       └── js/
├── reaper/
│   └── mixreaview_comments.lua  # REAPER ReaImGui integration script
└── data/
    ├── uploads/          # Audio files
    ├── database/         # SQLite DB
    └── static/           # Generated waveforms, thumbnails
```

## Interface Design

### Admin Interface
**Projects Overview:**
- Table view: Title, Items (song count), Comments, Created, Modified
- Actions: View, Upload Version, Settings, Delete
- "New Project" button

**Upload Flow:**
1. Select existing project or create new
2. Select song (existing or new)
3. Auto-increment version number
4. Drag-drop audio file
5. Optional notes/description

**Project Detail:**
- List all songs with version counts
- Quick actions per song
- Share link display with copy button
- Access management (optional future: expiration dates)

### Client Interface (Share Link View)
**Layout:**
- Project title and metadata at top
- Primary audio player with waveform
- Version selector dropdown
- Song list (if multiple songs in project)
- Comment timeline on waveform
- Comment input with current timecode
- Comment thread below player

**Player Features:**
- Play/pause, scrubbing
- Waveform with comment markers
- Click waveform to jump
- Click comment marker to jump and highlight comment
- Download button (if enabled for version)

**Comment Features:**
- Timecode auto-links: `@0:45` format
- Author name (required)
- Click timecode in comment to jump
- Chronological display
- Visual markers on waveform

## Development Phases

### Phase 1: Core Backend + Database
- SQLAlchemy models
- FastAPI endpoints (CRUD)
- Authentication (admin JWT, share link validation)
- File upload handling
- Database migrations

### Phase 2: Admin Interface
- Login page
- Projects overview
- Upload interface
- Project management

### Phase 3: Client Interface
- Share link handler
- Wavesurfer.js integration
- Comment system
- Version switching

### Phase 4: Polish & Deploy
- Waveform generation (ffmpeg)
- Error handling
- Mobile responsiveness
- Docker optimization
- DiskStation deployment

## API Endpoints (Draft)

### Admin Routes (JWT protected)
```
POST   /admin/auth/login              # Initial setup creates admin user
POST   /admin/auth/setup              # One-time setup endpoint
GET    /admin/projects
POST   /admin/projects
GET    /admin/projects/{id}
PUT    /admin/projects/{id}
DELETE /admin/projects/{id}
POST   /admin/projects/{id}/songs
POST   /admin/songs/{id}/versions
POST   /admin/upload
```

### Client Routes (Share link validated)
```
GET    /{short-uuid}                                    # Main client view
GET    /api/projects/{short-uuid}                       # Project metadata
GET    /api/projects/{short-uuid}/songs/{song_id}       # Song details
GET    /api/projects/{short-uuid}/versions              # All versions
GET    /api/audio/{version_id}                          # Audio file streaming
POST   /api/projects/{short-uuid}/comments              # Post comment
GET    /api/projects/{short-uuid}/comments              # Get all comments
```

## Security Considerations
- Admin password set during initial setup (not hardcoded)
- Password hashing with bcrypt
- JWT with expiration for admin sessions
- Share links: 12-character short UUID (cryptographically random)
- Rate limiting on comment endpoints
- File upload validation (type: WAV/MP3/FLAC only, size limits)
- Sanitize user input (comment text)
- CORS configuration for production
- HTTPS only in production (mix.stoersender.ch)

## Performance Optimization
- Audio streaming (range requests)
- Waveform caching (generate once, serve static)
- Database indexing (share_link, project_id, song_id)
- Nginx serving static files
- Optional: Multiple quality audio files (320kbps review, 128kbps mobile)

## Future Enhancements (Out of Scope for V1)
- Email notifications on new comments
- Multiple file formats per version
- Stem playback (separate tracks)
- A/B comparison mode
- Mobile app
- Real-time updates (WebSocket)
- Analytics (play counts, engagement)
- Link expiration dates
- Password protection per project

## Reference Implementation
This system is inspired by mixup.audio's interface:
- Clean, minimal design (dark theme)
- Waveform-centric player
- Inline commenting with timecode links
- Version management
- Project/playlist organization

## Deployment Instructions

### Initial Setup
```bash
# First start - creates admin account
docker-compose up -d

# Visit setup page
https://mix.stoersender.ch/admin/setup
# Set admin password (bcrypt hashed, stored in DB)

# After setup, setup endpoint is disabled
```

### Local Development
```bash
# Clone/create project
cd ~/Projects/mixreaview

# Start services
docker-compose up --build

# Access
Admin: http://localhost:8000/admin
Client: http://localhost:8000/{short-uuid}
API Docs: http://localhost:8000/docs
```

### Synology Deployment
```bash
# From development machine
rsync -avz ~/Projects/mixreaview/ user@diskstation:/volume1/docker/mixreaview/

# On DiskStation
ssh user@diskstation
cd /volume1/docker/mixreaview
docker-compose up -d

# Configure in Synology DSM:
# 1. Control Panel → Security → Certificate → Add Let's Encrypt for mix.stoersender.ch
# 2. Control Panel → Application Portal → Reverse Proxy → Create:
#    Source: mix.stoersender.ch (HTTPS, port 443)
#    Destination: localhost (HTTP, port 8000)
```

### Reverse Proxy Configuration (Synology DSM)
```
Source:
  Protocol: HTTPS
  Hostname: mix.stoersender.ch
  Port: 443

Destination:
  Protocol: HTTP
  Hostname: localhost
  Port: 8000

Custom Headers:
  X-Real-IP: $remote_addr
  X-Forwarded-For: $proxy_add_x_forwarded_for
  X-Forwarded-Proto: $scheme
```

## Contact & Studio Info
**Studio**: Störsender-Studio  
**Owner**: Frank  
**Location**: Switzerland  
**Network**: 10GbE DiskStation  
**Use Case**: Professional audio production review workflow

## Comment System

### Data Model
Comments support nested replies (one level deep) and a resolved/solved status:

```
Comment
  ├─ id, version_id, timecode, author_name, text, solved (bool)
  ├─ created_at
  └─ Replies[]
       ├─ id, comment_id, author_name, text
       └─ created_at
```

### Comment API Endpoints
```
GET    /api/projects/{uuid}/comments                        # Returns comments with replies + solved status
POST   /api/projects/{uuid}/comments                        # Create root comment
POST   /api/projects/{uuid}/comments/{id}/reply             # Reply to comment (one level)
PATCH  /api/projects/{uuid}/comments/{id}/resolve           # Toggle resolved (admin JWT required)
PATCH  /api/projects/{uuid}/comments/{id}/resolve-client    # Toggle resolved (share link, requires clients_can_resolve setting)
```

### Settings
- `clients_can_resolve` (boolean, default: false) - Controls whether clients with share links can resolve/unresolve comments. Configurable via `PUT /admin/settings`.

## REAPER Integration

### Script: `reaper/mixreaview_comments.lua`
A ReaImGui-based script for managing Mix Reaview comments directly from REAPER.

**Requirements:**
- REAPER 6.0+
- ReaImGui extension (install via ReaPack)

**Installation:**
1. Copy `reaper/mixreaview_comments.lua` to your REAPER Scripts folder
2. In REAPER: Actions → Show Action List → Load ReaScript
3. Assign a keyboard shortcut if desired

**Features:**
- Admin login (JWT authentication via username/password)
- Load project by share link
- Song/version selection dropdowns
- **Calibration**: Set song start offset from REAPER cursor position (persisted per song/version)
- **New comments**: Author name + text, timecode from current REAPER cursor position (relative to calibration offset)
- **Comment list**: Filterable (All / Open / Resolved), sorted by timecode
- **Jump**: Sets REAPER edit cursor to comment timecode + starts playback
- **Reply**: Inline reply input per comment
- **Resolve/Unresolve**: Toggle via admin JWT (requires login)
- **Refresh**: Reload comments from server

**Persisted state** (via `reaper.ExtState`):
- Server URL, username, author name, last share link
- Calibration offsets per song/version

## Development Notes
- Prefer simple, maintainable solutions over complex frameworks
- Direct, efficient code - no unnecessary abstractions
- Performance matters: 10GbE network, optimize for concurrent users
- Swiss user base: Consider German language support (optional)
- Integration potential: REAPER scripts, existing studio workflows

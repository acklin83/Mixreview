# Mix Reaview

A self-hosted audio review platform for studios. Clients listen to mix versions and leave timeline-based comments via secure share links. Built with REAPER integration in mind.

## Features

- **Projects & Songs** - Organize mixes by project with multiple songs and versions
- **Waveform Player** - Visual waveform with playback, scrubbing, and comment markers
- **Timeline Comments** - Precise timecode-based comments (@0:45) with nested replies
- **Share Links** - UUID-based, no client accounts needed
- **Version Management** - Auto-incrementing versions per song (v1, v2, v3...)
- **Favourite Versions** - Star ★ your preferred version per song (auto-selected on song switch)
- **Done Workflow** - Mark comments as done/resolved
- **REAPER Integration** - ReaImGui script for managing comments directly from your DAW
- **Admin Interface** - Upload management, project organization, theming

## Quick Start

```bash
docker-compose up --build -d
```

Then visit:
- **Admin**: `http://localhost:8000/admin` (first visit: setup admin password)
- **API Docs**: `http://localhost:8000/docs`

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI (Python 3.12) |
| Database | SQLite + SQLAlchemy |
| Frontend | Vanilla JS + TailwindCSS + Wavesurfer.js |
| Auth | JWT (admin) + UUID share links (clients) |
| Deployment | Docker + Docker Compose |

## REAPER Integration

The included Lua script (`reaper/mixreview_comments.lua`) connects REAPER to your Mix Reaview instance:

- Login with admin credentials
- Load project by share link (paste full URL or just the code)
- Browse songs/versions
- **Calibrate** song start position from REAPER cursor
- **Create comments** with timecode from current cursor position
- **Jump** to comment timecode + start playback
- **Reply** to comments inline
- **Resolve/Unresolve** comments

### Installation

1. Install [ReaImGui](https://forum.cockos.com/showthread.php?t=250419) via ReaPack
2. Copy `reaper/mixreview_comments.lua` to your REAPER Scripts folder
3. REAPER: Actions > Show Action List > Load ReaScript
4. Assign a keyboard shortcut if desired

## Deployment (Synology DiskStation)

```bash
# Clone repo on DiskStation
git clone https://github.com/acklin83/Mixreview.git /volume1/docker/mixreaview

# Start
cd /volume1/docker/mixreaview
sudo docker-compose up --build -d
```

Configure reverse proxy in DSM:
- Source: `https://mix.stoersender.ch:443`
- Destination: `http://localhost:8000`

## Project Structure

```
mixreaview/
├── backend/          # FastAPI application
│   └── app/
│       ├── main.py
│       ├── models.py
│       ├── schemas.py
│       ├── auth.py
│       └── routers/
├── frontend/
│   ├── admin/        # Admin interface
│   └── client/       # Client share link view
├── reaper/
│   └── mixreview_comments.lua
├── nginx/
├── docker-compose.yml
└── data/             # Uploads, DB, static files
```

## API Overview

### Admin (JWT protected)
```
POST /admin/auth/setup          # One-time setup
POST /admin/auth/login          # Get JWT token
GET  /admin/projects            # List projects
POST /admin/projects            # Create project
POST /admin/projects/{id}/songs # Add song
POST /admin/songs/{id}/versions # Upload version
PATCH /admin/versions/{id}/favourite  # Toggle favourite
```

### Client (share link)
```
GET  /api/projects/{uuid}                          # Project data
GET  /api/projects/{uuid}/comments                 # Comments + replies
POST /api/projects/{uuid}/comments                 # New comment
POST /api/projects/{uuid}/comments/{id}/reply      # Reply to comment
PATCH /api/projects/{uuid}/comments/{id}/resolve   # Toggle resolved (admin)
PATCH /api/projects/{uuid}/versions/{id}/favourite  # Toggle favourite
```

---

Made for [Stoersender-Studio](https://stoersender.ch) in Switzerland.

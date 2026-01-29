import os
import shutil
import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..auth import (
    create_access_token,
    get_current_admin,
    hash_password,
    verify_password,
)
from ..database import get_db
from ..models import AdminUser, Comment, Project, Song, Version
from ..schemas import (
    CommentOut,
    CommentUpdate,
    LoginRequest,
    ProjectCreate,
    ProjectDetail,
    ProjectSummary,
    ProjectUpdate,
    SetupRequest,
    SongCreate,
    SongOut,
    TokenResponse,
    VersionOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "uploads")
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".flac"}


# --- Auth ---

@router.get("/auth/status")
def auth_status(db: Session = Depends(get_db)):
    has_admin = db.query(AdminUser).first() is not None
    return {"setup_complete": has_admin}


@router.post("/auth/setup", response_model=TokenResponse)
def setup(req: SetupRequest, db: Session = Depends(get_db)):
    if db.query(AdminUser).first() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin already configured")
    user = AdminUser(username=req.username, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    return TokenResponse(access_token=create_access_token(user.username))


@router.post("/auth/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(AdminUser).filter(AdminUser.username == req.username).first()
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.username))


# --- Projects ---

@router.get("/projects", response_model=list[ProjectSummary])
def list_projects(
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    projects = db.query(Project).order_by(Project.updated_at.desc()).all()
    result = []
    for p in projects:
        song_count = db.query(func.count(Song.id)).filter(Song.project_id == p.id).scalar()
        comment_count = (
            db.query(func.count(Comment.id))
            .join(Version)
            .join(Song)
            .filter(Song.project_id == p.id)
            .scalar()
        )
        result.append(ProjectSummary(
            id=p.id, title=p.title, share_link=p.share_link,
            song_count=song_count, comment_count=comment_count,
            created_at=p.created_at, updated_at=p.updated_at,
        ))
    return result


@router.post("/projects", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
def create_project(
    req: ProjectCreate,
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    project = Project(title=req.title)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects/{project_id}")
def get_project(
    project_id: str,
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    project = db.query(Project).options(
        joinedload(Project.songs).joinedload(Song.versions)
    ).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    from .projects import _enrich_songs
    return {
        "id": project.id,
        "title": project.title,
        "share_link": project.share_link,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "songs": _enrich_songs(project.songs, db),
    }


@router.put("/projects/{project_id}", response_model=ProjectDetail)
def update_project(
    project_id: str,
    req: ProjectUpdate,
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    project.title = req.title
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()


# --- Songs ---

@router.post("/projects/{project_id}/songs", response_model=SongOut, status_code=status.HTTP_201_CREATED)
def create_song(
    project_id: str,
    req: SongCreate,
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    max_pos = db.query(func.max(Song.position)).filter(Song.project_id == project_id).scalar() or 0
    song = Song(project_id=project_id, title=req.title, position=max_pos + 1)
    db.add(song)
    db.commit()
    db.refresh(song)
    return song


# --- Versions (upload) ---

@router.post("/songs/{song_id}/versions", response_model=VersionOut, status_code=status.HTTP_201_CREATED)
def upload_version(
    song_id: int,
    file: UploadFile = File(...),
    label: str = Form(""),
    version_number: int | None = Form(None),
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    song = db.query(Song).filter(Song.id == song_id).first()
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    max_ver = db.query(func.max(Version.version_number)).filter(Version.song_id == song_id).scalar() or 0
    next_ver = version_number if version_number and version_number > 0 else max_ver + 1

    dest_dir = os.path.join(UPLOAD_DIR, str(song.project_id), str(song_id))
    os.makedirs(dest_dir, exist_ok=True)
    filename = f"v{next_ver}{ext}"
    dest_path = os.path.join(dest_dir, filename)

    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    version = Version(
        song_id=song_id,
        version_number=next_ver,
        label=label.strip() or f"Version {next_ver}",
        file_path=dest_path,
        original_filename=file.filename or filename,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


@router.put("/songs/{song_id}")
def update_song(
    song_id: int,
    req: SongCreate,
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    song = db.query(Song).filter(Song.id == song_id).first()
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    song.title = req.title
    db.commit()
    return {"ok": True}


@router.put("/versions/{version_id}")
def update_version(
    version_id: int,
    req: dict,
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    version = db.query(Version).filter(Version.id == version_id).first()
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")
    if "label" in req:
        version.label = req["label"]
    db.commit()
    return {"ok": True}


@router.delete("/songs/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_song(
    song_id: int,
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    song = db.query(Song).filter(Song.id == song_id).first()
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    # Delete audio files
    for v in song.versions:
        if os.path.isfile(v.file_path):
            os.remove(v.file_path)
    db.delete(song)
    db.commit()


@router.delete("/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_version(
    version_id: int,
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    version = db.query(Version).filter(Version.id == version_id).first()
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")
    if os.path.isfile(version.file_path):
        os.remove(version.file_path)
    db.delete(version)
    db.commit()


# --- Comments (admin) ---

@router.put("/comments/{comment_id}", response_model=CommentOut)
def update_comment(
    comment_id: int,
    req: CommentUpdate,
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    if req.text is not None:
        comment.text = req.text
    if req.solved is not None:
        comment.solved = req.solved
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    _admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    db.delete(comment)
    db.commit()

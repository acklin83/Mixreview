import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..auth import get_project_by_share_link
from ..database import get_db
from ..models import Comment, Project, Song, Version
from ..schemas import ClientProjectOut, SongOut

router = APIRouter(tags=["client"])


def _enrich_songs(songs, db):
    """Add version_count and comment_count to each song."""
    result = []
    for s in songs:
        ver_count = len(s.versions)
        comment_count = (
            db.query(func.count(Comment.id))
            .join(Version)
            .filter(Version.song_id == s.id)
            .scalar()
        )
        open_count = (
            db.query(func.count(Comment.id))
            .join(Version)
            .filter(Version.song_id == s.id, Comment.solved == False)
            .scalar()
        )
        song_data = SongOut(
            id=s.id, title=s.title, position=s.position,
            created_at=s.created_at, versions=s.versions,
            version_count=ver_count, comment_count=comment_count,
            open_count=open_count,
        )
        result.append(song_data)
    return result


@router.get("/api/projects/{share_link}")
def get_project_by_link(
    share_link: str,
    db: Session = Depends(get_db),
):
    project = db.query(Project).options(
        joinedload(Project.songs).joinedload(Song.versions)
    ).filter(Project.share_link == share_link).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "title": project.title,
        "songs": _enrich_songs(project.songs, db),
    }


@router.patch("/api/projects/{share_link}/versions/{version_id}/favourite")
def toggle_favourite_client(
    share_link: str,
    version_id: int,
    db: Session = Depends(get_db),
):
    project = get_project_by_share_link(share_link, db)
    version = db.query(Version).filter(Version.id == version_id).first()
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")
    # Verify version belongs to this project
    song = db.query(Song).filter(Song.id == version.song_id).first()
    if song is None or song.project_id != project.id:
        raise HTTPException(status_code=404, detail="Version not found in this project")
    if version.favourite:
        version.favourite = False
    else:
        db.query(Version).filter(Version.song_id == version.song_id).update({"favourite": False})
        version.favourite = True
    db.commit()
    return {"ok": True, "favourite": version.favourite}


@router.get("/api/audio/{version_id}")
def stream_audio(
    version_id: int,
    db: Session = Depends(get_db),
):
    version = db.query(Version).filter(Version.id == version_id).first()
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")
    if not os.path.isfile(version.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    ext = os.path.splitext(version.file_path)[1].lower()
    media_types = {".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac"}
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        version.file_path,
        media_type=media_type,
        filename=version.original_filename,
    )

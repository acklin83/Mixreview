from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Comment, Project, Song, Version
from ..schemas import CommentCreate, CommentOut

router = APIRouter(tags=["comments"])


def _validate_share_link(share_link: str, db: Session) -> Project:
    project = db.query(Project).filter(Project.share_link == share_link).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/api/projects/{share_link}/comments", response_model=list[CommentOut])
def get_comments(
    share_link: str,
    version_id: int | None = None,
    song_id: int | None = None,
    db: Session = Depends(get_db),
):
    _validate_share_link(share_link, db)
    query = (
        db.query(Comment)
        .join(Version)
        .join(Song)
        .join(Project)
        .filter(Project.share_link == share_link)
    )
    if version_id is not None:
        query = query.filter(Comment.version_id == version_id)
    if song_id is not None:
        query = query.filter(Song.id == song_id)
    return query.order_by(Comment.timecode).all()


@router.post("/api/projects/{share_link}/comments", response_model=CommentOut, status_code=201)
def create_comment(
    share_link: str,
    req: CommentCreate,
    db: Session = Depends(get_db),
):
    project = _validate_share_link(share_link, db)

    # Verify version belongs to this project
    version = (
        db.query(Version)
        .join(Song)
        .filter(Song.project_id == project.id, Version.id == req.version_id)
        .first()
    )
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found in this project")

    comment = Comment(
        version_id=req.version_id,
        timecode=req.timecode,
        author_name=req.author_name,
        text=req.text,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment

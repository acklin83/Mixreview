import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _short_uuid() -> str:
    return secrets.token_hex(6)  # 12 hex chars


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    share_link: Mapped[str] = mapped_column(String(12), unique=True, index=True, default=_short_uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    songs: Mapped[list["Song"]] = relationship(back_populates="project", cascade="all, delete-orphan", order_by="Song.position")


class Song(Base):
    __tablename__ = "songs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[str] = mapped_column(String(32), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    project: Mapped["Project"] = relationship(back_populates="songs")
    versions: Mapped[list["Version"]] = relationship(back_populates="song", cascade="all, delete-orphan", order_by="Version.version_number")


class Version(Base):
    __tablename__ = "versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    song_id: Mapped[int] = mapped_column(Integer, ForeignKey("songs.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    favourite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    song: Mapped["Song"] = relationship(back_populates="versions")
    comments: Mapped[list["Comment"]] = relationship(back_populates="version", cascade="all, delete-orphan", order_by="Comment.timecode")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version_id: Mapped[int] = mapped_column(Integer, ForeignKey("versions.id", ondelete="CASCADE"), index=True)
    timecode: Mapped[float] = mapped_column(Float, nullable=False)
    author_name: Mapped[str] = mapped_column(String(100), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    solved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    version: Mapped["Version"] = relationship(back_populates="comments")
    replies: Mapped[list["Reply"]] = relationship(back_populates="comment", cascade="all, delete-orphan", order_by="Reply.created_at")


class Reply(Base):
    __tablename__ = "replies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    comment_id: Mapped[int] = mapped_column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), index=True)
    author_name: Mapped[str] = mapped_column(String(100), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    comment: Mapped["Comment"] = relationship(back_populates="replies")


class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    accent_color: Mapped[str] = mapped_column(String(7), default="#6366f1")
    dark_900: Mapped[str] = mapped_column(String(7), default="#0f0f0f")
    dark_800: Mapped[str] = mapped_column(String(7), default="#1a1a1a")
    dark_700: Mapped[str] = mapped_column(String(7), default="#2a2a2a")
    dark_600: Mapped[str] = mapped_column(String(7), default="#3a3a3a")
    text_color: Mapped[str] = mapped_column(String(7), default="#e5e7eb")
    waveform_color: Mapped[str] = mapped_column(String(7), default="#4b5563")
    waveform_progress_color: Mapped[str] = mapped_column(String(7), default="#6366f1")
    logo_path: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
    logo_height: Mapped[int] = mapped_column(Integer, default=32)
    clients_can_resolve: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

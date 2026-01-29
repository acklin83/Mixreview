from datetime import datetime
from pydantic import BaseModel, Field


# --- Auth ---

class SetupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Project ---

class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ProjectUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ProjectSummary(BaseModel):
    id: str
    title: str
    share_link: str
    song_count: int
    comment_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectDetail(BaseModel):
    id: str
    title: str
    share_link: str
    created_at: datetime
    updated_at: datetime
    songs: list["SongOut"]

    model_config = {"from_attributes": True}


# --- Song ---

class SongCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class SongOut(BaseModel):
    id: int
    title: str
    position: int
    created_at: datetime
    version_count: int = 0
    comment_count: int = 0
    versions: list["VersionOut"]

    model_config = {"from_attributes": True}


# --- Version ---

class VersionOut(BaseModel):
    id: int
    version_number: int
    label: str
    original_filename: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Comment ---

class CommentCreate(BaseModel):
    version_id: int
    timecode: float = Field(ge=0)
    author_name: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=5000)


class ReplyCreate(BaseModel):
    author_name: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=5000)


class ReplyOut(BaseModel):
    id: int
    comment_id: int
    author_name: str
    text: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentOut(BaseModel):
    id: int
    version_id: int
    timecode: float
    author_name: str
    text: str
    solved: bool = False
    replies: list[ReplyOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Settings ---

class SettingsUpdate(BaseModel):
    accent_color: str | None = Field(default=None, pattern=r'^#[0-9A-Fa-f]{6}$')
    dark_900: str | None = Field(default=None, pattern=r'^#[0-9A-Fa-f]{6}$')
    dark_800: str | None = Field(default=None, pattern=r'^#[0-9A-Fa-f]{6}$')
    dark_700: str | None = Field(default=None, pattern=r'^#[0-9A-Fa-f]{6}$')
    dark_600: str | None = Field(default=None, pattern=r'^#[0-9A-Fa-f]{6}$')
    text_color: str | None = Field(default=None, pattern=r'^#[0-9A-Fa-f]{6}$')
    waveform_color: str | None = Field(default=None, pattern=r'^#[0-9A-Fa-f]{6}$')
    waveform_progress_color: str | None = Field(default=None, pattern=r'^#[0-9A-Fa-f]{6}$')
    logo_height: int | None = Field(default=None, ge=16, le=120)
    clients_can_resolve: bool | None = None


class SettingsOut(BaseModel):
    accent_color: str
    dark_900: str
    dark_800: str
    dark_700: str
    dark_600: str
    text_color: str
    waveform_color: str
    waveform_progress_color: str
    logo_url: str | None = None
    logo_height: int = 32
    clients_can_resolve: bool = False

    model_config = {"from_attributes": True}


# --- Client view ---

class ClientProjectOut(BaseModel):
    title: str
    songs: list[SongOut]

    model_config = {"from_attributes": True}

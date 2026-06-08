from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
from typing import Optional, List
import re


class TagBase(BaseModel):
    name: str
    color: Optional[str] = "#3498db"

    @field_validator('name')
    def name_must_be_valid(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('标签名称不能为空')
        if len(v) > 50:
            raise ValueError('标签名称长度不能超过50个字符')
        return v

    @field_validator('color')
    def color_must_be_valid(cls, v):
        if v and not v.startswith('#'):
            raise ValueError('颜色必须以#开头')
        if v and len(v) != 7:
            raise ValueError('颜色格式必须为#RRGGBB')
        return v


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

    @field_validator('name')
    def name_must_be_valid(cls, v):
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError('标签名称不能为空')
            if len(v) > 50:
                raise ValueError('标签名称长度不能超过50个字符')
        return v

    @field_validator('color')
    def color_must_be_valid(cls, v):
        if v is not None:
            if not v.startswith('#'):
                raise ValueError('颜色必须以#开头')
            if len(v) != 7:
                raise ValueError('颜色格式必须为#RRGGBB')
        return v


class Tag(TagBase):
    id: int
    created_at: datetime
    user_id: int

    class Config:
        from_attributes = True


class NoteTagRequest(BaseModel):
    tag_ids: List[int]


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str

    @field_validator('username')
    def username_must_be_valid(cls, v):
        if len(v) < 3 or len(v) > 50:
            raise ValueError('用户名长度必须在3-50个字符之间')
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('用户名只能包含字母、数字和下划线')
        return v

    @field_validator('password')
    def password_must_be_strong(cls, v):
        if len(v) < 6:
            raise ValueError('密码长度不能少于6个字符')
        return v


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(UserBase):
    id: int
    is_active: int
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None


class NoteBase(BaseModel):
    title: str
    content: str
    content_plain: Optional[str] = None


class NoteCreate(NoteBase):
    tag_ids: Optional[List[int]] = None


class NoteUpdate(NoteBase):
    title: Optional[str] = None
    content: Optional[str] = None
    tag_ids: Optional[List[int]] = None


class Note(NoteBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    user_id: Optional[int] = None
    tags: Optional[List[Tag]] = None
    is_favorited: int = 0
    favorited_at: Optional[datetime] = None
    is_pinned: int = 0
    pin_priority: int = 0
    pinned_at: Optional[datetime] = None
    is_shared: int = 0
    share_token: Optional[str] = None
    share_password: Optional[str] = None
    share_expires_at: Optional[datetime] = None
    share_created_at: Optional[datetime] = None
    share_view_count: int = 0
    deleted_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NoteShareConfig(BaseModel):
    password: Optional[str] = None
    expires_days: Optional[int] = None


class NoteShareResponse(BaseModel):
    is_shared: int
    share_token: Optional[str] = None
    share_password: Optional[str] = None
    share_expires_at: Optional[datetime] = None
    share_created_at: Optional[datetime] = None
    share_view_count: int = 0
    share_url: Optional[str] = None


class PublicShareNoteResponse(BaseModel):
    id: int
    title: str
    content: str
    content_plain: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    tags: Optional[List[Tag]] = None
    owner_name: Optional[str] = None
    owner_username: Optional[str] = None


class SharePasswordRequest(BaseModel):
    password: str


class ShareStatsResponse(BaseModel):
    view_count: int
    share_created_at: Optional[datetime] = None
    share_expires_at: Optional[datetime] = None
    is_shared: int
    recent_views: List[dict] = []


class NoteBatchFavoriteRequest(BaseModel):
    note_ids: List[int]
    is_favorited: bool


class NoteBatchPinRequest(BaseModel):
    note_ids: List[int]
    is_pinned: bool
    pin_priority: Optional[int] = 0


class FileBase(BaseModel):
    pass


class FileResponse(FileBase):
    id: int
    original_filename: str
    file_size: int
    file_type: str
    file_extension: Optional[str] = None
    uploaded_at: datetime
    user_id: int
    uploader_name: Optional[str] = None

    class Config:
        from_attributes = True


class FileUploadResponse(BaseModel):
    message: str
    files: List[FileResponse]


class FileDeleteResponse(BaseModel):
    message: str
    deleted_count: int


class FileBatchDeleteRequest(BaseModel):
    file_ids: List[int]


class DocumentPreviewResponse(BaseModel):
    file_id: int
    filename: str
    file_type: str
    content_type: str
    content: Optional[str] = None
    rows: Optional[List[List[str]]] = None
    headers: Optional[List[str]] = None
    total_rows: Optional[int] = None
    total_columns: Optional[int] = None


class NoteExportRequest(BaseModel):
    note_ids: Optional[List[int]] = None
    format: str = "md"
    include_tags: bool = True
    include_metadata: bool = True


class NoteExportResponse(BaseModel):
    message: str
    filename: str
    download_url: str
    note_count: int
    file_size: int


class NoteBatchRestoreRequest(BaseModel):
    note_ids: List[int]


class NoteBatchPermanentDeleteRequest(BaseModel):
    note_ids: List[int]


class NoteTrashCountResponse(BaseModel):
    count: int

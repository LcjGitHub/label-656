from fastapi import FastAPI, Depends, HTTPException, Query, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, inspect
from typing import List, Optional
from datetime import timedelta, datetime
import os
import shutil
import uuid
import csv
import io
import time
import re
from pathlib import Path
from urllib.parse import quote
import bleach
from html import unescape

from database import engine, Base, get_db
from models import Note as NoteModel, User as UserModel, File as FileModel, Tag as TagModel
from schemas import (
    Note, NoteCreate, NoteUpdate, NoteTagRequest,
    NoteBatchFavoriteRequest, NoteBatchPinRequest,
    UserCreate, UserLogin, UserResponse, Token,
    FileResponse as FileSchema, FileUploadResponse,
    FileDeleteResponse, FileBatchDeleteRequest,
    DocumentPreviewResponse,
    Tag, TagCreate, TagUpdate,
    NoteExportRequest, NoteExportResponse
)
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_active_user, ACCESS_TOKEN_EXPIRE_MINUTES
)


def run_database_migration():
    inspector = inspect(engine)
    conn = engine.connect()
    try:
        if not inspector.has_table("notes"):
            Base.metadata.create_all(bind=engine)
            return

        columns = [col["name"] for col in inspector.get_columns("notes")]

        if "content_plain" not in columns:
            conn.execute(text("ALTER TABLE notes ADD COLUMN content_plain TEXT"))
            conn.commit()
            notes = conn.execute(text("SELECT id, content FROM notes")).fetchall()
            for note_id, content in notes:
                if content:
                    plain_text = html_to_plain_text(content)
                    conn.execute(
                        text("UPDATE notes SET content_plain = :plain WHERE id = :nid"),
                        {"plain": plain_text, "nid": note_id}
                    )
            conn.commit()
            print(f"Migration: content_plain 字段已添加，回填 {len(notes)} 条记录")

    except Exception as e:
        print(f"Database migration error: {e}")
        conn.rollback()
    finally:
        conn.close()


Base.metadata.create_all(bind=engine)
run_database_migration()

app = FastAPI(title="笔记管理 API")

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

MAX_FILE_SIZE = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "bmp", "webp",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "txt", "md", "csv", "zip", "rar", "7z"
}



app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(UserModel).filter(UserModel.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="用户名已存在")

    db_user = db.query(UserModel).filter(UserModel.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    hashed_pw = hash_password(user.password)
    db_user = UserModel(
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        hashed_password=hashed_pw
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@app.post("/api/auth/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.username == user_credentials.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=400, detail="用户已被禁用")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/api/auth/logout")
def logout(current_user: UserModel = Depends(get_current_active_user)):
    return {"message": "登出成功"}


@app.get("/api/auth/me", response_model=UserResponse)
def get_current_user_info(current_user: UserModel = Depends(get_current_active_user)):
    return current_user


@app.get("/api/tags", response_model=List[Tag])
def get_tags(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    tags = db.query(TagModel).filter(
        TagModel.user_id == current_user.id
    ).order_by(TagModel.created_at.desc()).all()
    return tags


@app.post("/api/tags", response_model=Tag, status_code=status.HTTP_201_CREATED)
def create_tag(
    tag: TagCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    existing_tag = db.query(TagModel).filter(
        TagModel.name == tag.name.strip(),
        TagModel.user_id == current_user.id
    ).first()
    if existing_tag:
        raise HTTPException(status_code=400, detail="该标签已存在")

    db_tag = TagModel(
        name=tag.name.strip(),
        color=tag.color,
        user_id=current_user.id
    )
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag


@app.put("/api/tags/{tag_id}", response_model=Tag)
def update_tag(
    tag_id: int,
    tag: TagUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    db_tag = db.query(TagModel).filter(
        TagModel.id == tag_id,
        TagModel.user_id == current_user.id
    ).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    if tag.name is not None:
        existing_tag = db.query(TagModel).filter(
            TagModel.name == tag.name.strip(),
            TagModel.id != tag_id,
            TagModel.user_id == current_user.id
        ).first()
        if existing_tag:
            raise HTTPException(status_code=400, detail="该标签名称已存在")
        db_tag.name = tag.name.strip()

    if tag.color is not None:
        db_tag.color = tag.color

    db.commit()
    db.refresh(db_tag)
    return db_tag


@app.delete("/api/tags/{tag_id}")
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    db_tag = db.query(TagModel).filter(
        TagModel.id == tag_id,
        TagModel.user_id == current_user.id
    ).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    db.delete(db_tag)
    db.commit()
    return {"message": "标签删除成功"}


@app.get("/api/notes", response_model=List[Note])
def get_notes(
    search: Optional[str] = Query(None, description="关键词搜索"),
    tag_id: Optional[int] = Query(None, description="按标签筛选"),
    only_favorites: Optional[bool] = Query(False, description="仅显示收藏笔记"),
    only_pinned: Optional[bool] = Query(False, description="仅显示置顶笔记"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    from sqlalchemy import func
    query = db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(NoteModel.user_id == current_user.id)
    if search:
        query = query.filter(
            (NoteModel.title.contains(search)) |
            (NoteModel.content_plain.contains(search))
        )
    if tag_id:
        tag = db.query(TagModel).filter(
            TagModel.id == tag_id,
            TagModel.user_id == current_user.id
        ).first()
        if not tag:
            raise HTTPException(status_code=404, detail="标签不存在")
        query = query.filter(NoteModel.tags.contains(tag))
    if only_favorites:
        query = query.filter(NoteModel.is_favorited == 1)
    if only_pinned:
        query = query.filter(NoteModel.is_pinned == 1)
    notes = query.order_by(
        NoteModel.is_pinned.desc(),
        NoteModel.pin_priority.desc(),
        NoteModel.pinned_at.desc().nullslast(),
        NoteModel.updated_at.desc().nullslast(),
        NoteModel.created_at.desc()
    ).all()
    return notes


@app.get("/api/notes/favorites", response_model=List[Note])
def get_favorite_notes(
    search: Optional[str] = Query(None, description="关键词搜索"),
    tag_id: Optional[int] = Query(None, description="按标签筛选"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    from sqlalchemy import func
    query = db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(
        NoteModel.user_id == current_user.id,
        NoteModel.is_favorited == 1
    )
    if search:
        query = query.filter(
            (NoteModel.title.contains(search)) |
            (NoteModel.content_plain.contains(search))
        )
    if tag_id:
        tag = db.query(TagModel).filter(
            TagModel.id == tag_id,
            TagModel.user_id == current_user.id
        ).first()
        if not tag:
            raise HTTPException(status_code=404, detail="标签不存在")
        query = query.filter(NoteModel.tags.contains(tag))
    notes = query.order_by(
        NoteModel.favorited_at.desc().nullslast(),
        NoteModel.updated_at.desc().nullslast(),
        NoteModel.created_at.desc()
    ).all()
    return notes


@app.get("/api/notes/pinned", response_model=List[Note])
def get_pinned_notes(
    search: Optional[str] = Query(None, description="关键词搜索"),
    tag_id: Optional[int] = Query(None, description="按标签筛选"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    from sqlalchemy import func
    query = db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(
        NoteModel.user_id == current_user.id,
        NoteModel.is_pinned == 1
    )
    if search:
        query = query.filter(
            (NoteModel.title.contains(search)) |
            (NoteModel.content_plain.contains(search))
        )
    if tag_id:
        tag = db.query(TagModel).filter(
            TagModel.id == tag_id,
            TagModel.user_id == current_user.id
        ).first()
        if not tag:
            raise HTTPException(status_code=404, detail="标签不存在")
        query = query.filter(NoteModel.tags.contains(tag))
    notes = query.order_by(
        NoteModel.pin_priority.desc(),
        NoteModel.pinned_at.desc().nullslast(),
        NoteModel.updated_at.desc().nullslast(),
        NoteModel.created_at.desc()
    ).all()
    return notes


@app.put("/api/notes/{note_id}/favorite", response_model=Note)
def toggle_note_favorite(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    from sqlalchemy import func
    db_note = db.query(NoteModel).filter(
        NoteModel.id == note_id,
        NoteModel.user_id == current_user.id
    ).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    db_note.is_favorited = 0 if db_note.is_favorited == 1 else 1
    db_note.favorited_at = func.now() if db_note.is_favorited == 1 else None

    db.commit()
    db.refresh(db_note)
    return db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(NoteModel.id == note_id).first()


@app.put("/api/notes/{note_id}/pin", response_model=Note)
def toggle_note_pin(
    note_id: int,
    pin_priority: Optional[int] = Query(0, description="置顶优先级，数值越大越靠前"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    from sqlalchemy import func
    db_note = db.query(NoteModel).filter(
        NoteModel.id == note_id,
        NoteModel.user_id == current_user.id
    ).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    db_note.is_pinned = 0 if db_note.is_pinned == 1 else 1
    db_note.pinned_at = func.now() if db_note.is_pinned == 1 else None
    if db_note.is_pinned == 1:
        db_note.pin_priority = pin_priority

    db.commit()
    db.refresh(db_note)
    return db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(NoteModel.id == note_id).first()


@app.put("/api/notes/batch/favorite", response_model=List[Note])
def batch_set_favorite(
    request: NoteBatchFavoriteRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    from sqlalchemy import func
    if not request.note_ids:
        raise HTTPException(status_code=400, detail="请选择要操作的笔记")

    notes = db.query(NoteModel).filter(
        NoteModel.id.in_(request.note_ids),
        NoteModel.user_id == current_user.id
    ).all()

    if not notes:
        raise HTTPException(status_code=404, detail="未找到要操作的笔记")

    for note in notes:
        note.is_favorited = 1 if request.is_favorited else 0
        note.favorited_at = func.now() if request.is_favorited else None

    db.commit()

    note_ids = [note.id for note in notes]
    return db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(
        NoteModel.id.in_(note_ids)
    ).order_by(NoteModel.favorited_at.desc().nullslast()).all()


@app.put("/api/notes/batch/pin", response_model=List[Note])
def batch_set_pin(
    request: NoteBatchPinRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    from sqlalchemy import func
    if not request.note_ids:
        raise HTTPException(status_code=400, detail="请选择要操作的笔记")

    notes = db.query(NoteModel).filter(
        NoteModel.id.in_(request.note_ids),
        NoteModel.user_id == current_user.id
    ).all()

    if not notes:
        raise HTTPException(status_code=404, detail="未找到要操作的笔记")

    for note in notes:
        note.is_pinned = 1 if request.is_pinned else 0
        note.pinned_at = func.now() if request.is_pinned else None
        if request.is_pinned:
            note.pin_priority = request.pin_priority or 0

    db.commit()

    note_ids = [note.id for note in notes]
    return db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(
        NoteModel.id.in_(note_ids)
    ).order_by(NoteModel.pin_priority.desc(), NoteModel.pinned_at.desc().nullslast()).all()


@app.put("/api/notes/unpin-all")
def unpin_all_notes(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    notes = db.query(NoteModel).filter(
        NoteModel.user_id == current_user.id,
        NoteModel.is_pinned == 1
    ).all()

    if not notes:
        return {"message": "没有置顶的笔记", "unpinned_count": 0}

    for note in notes:
        note.is_pinned = 0
        note.pinned_at = None
        note.pin_priority = 0

    db.commit()

    return {"message": f"成功取消 {len(notes)} 条笔记的置顶", "unpinned_count": len(notes)}


@app.put("/api/notes/batch/unfavorite")
def batch_unfavorite_notes(
    request: NoteBatchFavoriteRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    if not request.note_ids:
        raise HTTPException(status_code=400, detail="请选择要取消收藏的笔记")

    notes = db.query(NoteModel).filter(
        NoteModel.id.in_(request.note_ids),
        NoteModel.user_id == current_user.id,
        NoteModel.is_favorited == 1
    ).all()

    if not notes:
        raise HTTPException(status_code=404, detail="未找到要取消收藏的笔记")

    for note in notes:
        note.is_favorited = 0
        note.favorited_at = None

    db.commit()

    return {"message": f"成功取消 {len(notes)} 条笔记的收藏", "unfavorited_count": len(notes)}


@app.get("/api/notes/{note_id}", response_model=Note)
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    note = db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(
        NoteModel.id == note_id,
        NoteModel.user_id == current_user.id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return note


ALLOWED_TAGS = [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'img',
    'blockquote', 'pre', 'code',
    'span', 'div',
]

ALLOWED_ATTRIBUTES = {
    '*': ['class'],
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
}


def sanitize_html(html_content: str) -> str:
    if not html_content:
        return ''
    cleaned = bleach.clean(
        html_content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True,
        strip_comments=True,
    )
    cleaned = bleach.linkify(cleaned)
    return cleaned


def html_to_plain_text(html_content: str) -> str:
    if not html_content:
        return ''
    text = re.sub(r'<br\s*/?>', '\n', html_content, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</li>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</div>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</h[1-6]>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = unescape(text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def validate_note_data(title: str = None, content: str = None):
    if title is not None:
        if not title.strip():
            raise HTTPException(status_code=400, detail="标题不能为空或仅包含空格")
        if len(title.strip()) > 200:
            raise HTTPException(status_code=400, detail="标题长度不能超过200个字符")
    if content is not None:
        plain_text = html_to_plain_text(content)
        if not plain_text:
            raise HTTPException(status_code=400, detail="内容不能为空或仅包含空格")
        if len(plain_text) > 2000:
            raise HTTPException(status_code=400, detail="内容长度不能超过2000个字符")


@app.post("/api/notes", response_model=Note)
def create_note(
    note: NoteCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    validate_note_data(title=note.title, content=note.content)
    sanitized_content = sanitize_html(note.content)
    plain_content = html_to_plain_text(sanitized_content)
    db_note = NoteModel(
        title=note.title.strip(),
        content=sanitized_content,
        content_plain=plain_content,
        user_id=current_user.id
    )
    if note.tag_ids:
        tags = db.query(TagModel).filter(
            TagModel.id.in_(note.tag_ids),
            TagModel.user_id == current_user.id
        ).all()
        db_note.tags = tags
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(NoteModel.id == db_note.id).first()


@app.put("/api/notes/{note_id}", response_model=Note)
def update_note(
    note_id: int,
    note: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    db_note = db.query(NoteModel).filter(
        NoteModel.id == note_id,
        NoteModel.user_id == current_user.id
    ).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    validate_note_data(title=note.title, content=note.content)

    if note.title is not None:
        db_note.title = note.title.strip()
    if note.content is not None:
        sanitized_content = sanitize_html(note.content)
        db_note.content = sanitized_content
        db_note.content_plain = html_to_plain_text(sanitized_content)
    if note.tag_ids is not None:
        tags = db.query(TagModel).filter(
            TagModel.id.in_(note.tag_ids),
            TagModel.user_id == current_user.id
        ).all()
        db_note.tags = tags

    db.commit()
    db.refresh(db_note)
    return db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(NoteModel.id == note_id).first()


@app.delete("/api/notes/{note_id}")
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    db_note = db.query(NoteModel).filter(
        NoteModel.id == note_id,
        NoteModel.user_id == current_user.id
    ).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    db.delete(db_note)
    db.commit()
    return {"message": "笔记删除成功"}


@app.post("/api/notes/{note_id}/tags", response_model=Note)
def add_tags_to_note(
    note_id: int,
    request: NoteTagRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    db_note = db.query(NoteModel).filter(
        NoteModel.id == note_id,
        NoteModel.user_id == current_user.id
    ).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    tags = db.query(TagModel).filter(
        TagModel.id.in_(request.tag_ids),
        TagModel.user_id == current_user.id
    ).all()
    for tag in tags:
        if tag not in db_note.tags:
            db_note.tags.append(tag)

    db.commit()
    return db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(NoteModel.id == note_id).first()


@app.put("/api/notes/{note_id}/tags", response_model=Note)
def update_note_tags(
    note_id: int,
    request: NoteTagRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    db_note = db.query(NoteModel).filter(
        NoteModel.id == note_id,
        NoteModel.user_id == current_user.id
    ).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    tags = db.query(TagModel).filter(
        TagModel.id.in_(request.tag_ids),
        TagModel.user_id == current_user.id
    ).all()
    db_note.tags = tags

    db.commit()
    return db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(NoteModel.id == note_id).first()


@app.delete("/api/notes/{note_id}/tags/{tag_id}", response_model=Note)
def remove_tag_from_note(
    note_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    db_note = db.query(NoteModel).filter(
        NoteModel.id == note_id,
        NoteModel.user_id == current_user.id
    ).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    tag = db.query(TagModel).filter(
        TagModel.id == tag_id,
        TagModel.user_id == current_user.id
    ).first()
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    if tag in db_note.tags:
        db_note.tags.remove(tag)
        db.commit()

    return db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(NoteModel.id == note_id).first()


def get_file_extension(filename: str) -> str:
    return filename.split(".")[-1].lower() if "." in filename else ""


def is_allowed_file(filename: str) -> bool:
    ext = get_file_extension(filename)
    return ext in ALLOWED_EXTENSIONS


def format_file_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.2f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.2f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


@app.get("/api/files", response_model=List[FileSchema])
def get_files(
    search: Optional[str] = Query(None, description="关键词搜索文件名"),
    file_type: Optional[str] = Query(None, description="按文件类型过滤"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    query = db.query(FileModel, UserModel.username, UserModel.full_name).join(
        UserModel, FileModel.user_id == UserModel.id
    ).filter(FileModel.user_id == current_user.id)

    if search:
        query = query.filter(FileModel.original_filename.contains(search))

    if file_type:
        if file_type == "image":
            image_exts = ["jpg", "jpeg", "png", "gif", "bmp", "webp"]
            query = query.filter(FileModel.file_extension.in_(image_exts))
        elif file_type == "document":
            doc_exts = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv"]
            query = query.filter(FileModel.file_extension.in_(doc_exts))
        elif file_type == "archive":
            archive_exts = ["zip", "rar", "7z"]
            query = query.filter(FileModel.file_extension.in_(archive_exts))

    results = query.order_by(FileModel.uploaded_at.desc()).all()

    response_files = []
    for file_model, username, full_name in results:
        file_data = file_model.__dict__.copy()
        file_data["uploader_name"] = full_name or username
        response_files.append(file_data)

    return response_files


@app.post("/api/files/upload", response_model=FileUploadResponse)
async def upload_files(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    uploaded_files = []
    errors = []

    for file in files:
        try:
            file_content = await file.read()

            if len(file_content) > MAX_FILE_SIZE:
                errors.append(f"文件 {file.filename} 超过最大限制 (50MB)")
                continue

            if not is_allowed_file(file.filename):
                errors.append(f"文件 {file.filename} 类型不支持")
                continue

            ext = get_file_extension(file.filename)
            unique_filename = f"{uuid.uuid4().hex}_{int(os.times()[4])}.{ext}"
            file_path = UPLOAD_DIR / unique_filename

            with open(file_path, "wb") as buffer:
                buffer.write(file_content)

            db_file = FileModel(
                original_filename=file.filename,
                stored_filename=unique_filename,
                file_path=str(file_path),
                file_size=len(file_content),
                file_type=file.content_type or "application/octet-stream",
                file_extension=ext,
                user_id=current_user.id
            )
            db.add(db_file)
            db.commit()
            db.refresh(db_file)
            uploaded_files.append(db_file)

        except Exception as e:
            errors.append(f"上传文件 {file.filename} 失败: {str(e)}")
            db.rollback()

    if not uploaded_files and errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    message = f"成功上传 {len(uploaded_files)} 个文件"
    if errors:
        message += f"，但有 {len(errors)} 个文件上传失败: {'; '.join(errors)}"

    return {"message": message, "files": uploaded_files}


@app.get("/api/files/{file_id}")
def get_file_info(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    return file


@app.get("/api/files/{file_id}/download")
def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")

    if not os.path.exists(file.file_path):
        raise HTTPException(status_code=404, detail="文件在服务器上不存在")

    return FileResponse(
        path=file.file_path,
        filename=file.original_filename,
        media_type=file.file_type
    )


@app.get("/api/files/{file_id}/preview")
def preview_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")

    if not os.path.exists(file.file_path):
        raise HTTPException(status_code=404, detail="文件在服务器上不存在")

    image_extensions = {"jpg", "jpeg", "png", "gif", "bmp", "webp"}
    if file.file_extension not in image_extensions:
        raise HTTPException(status_code=400, detail="该文件类型不支持预览")

    return FileResponse(
        path=file.file_path,
        media_type=file.file_type
    )


@app.delete("/api/files/{file_id}", response_model=FileDeleteResponse)
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")

    try:
        if os.path.exists(file.file_path):
            os.remove(file.file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除文件失败: {str(e)}")

    db.delete(file)
    db.commit()

    return {"message": "文件删除成功", "deleted_count": 1}


@app.post("/api/files/batch-delete", response_model=FileDeleteResponse)
def batch_delete_files(
    request: FileBatchDeleteRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    if not request.file_ids:
        raise HTTPException(status_code=400, detail="请选择要删除的文件")

    files = db.query(FileModel).filter(
        FileModel.id.in_(request.file_ids),
        FileModel.user_id == current_user.id
    ).all()

    if not files:
        raise HTTPException(status_code=404, detail="未找到要删除的文件")

    deleted_count = 0
    for file in files:
        try:
            if os.path.exists(file.file_path):
                os.remove(file.file_path)
            db.delete(file)
            deleted_count += 1
        except Exception as e:
            continue

    db.commit()

    return {"message": f"成功删除 {deleted_count} 个文件", "deleted_count": deleted_count}


@app.get("/api/files/{file_id}/preview-document", response_model=DocumentPreviewResponse)
def preview_document(
    file_id: int,
    max_rows: int = Query(100, description="最大预览行数", ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")

    if not os.path.exists(file.file_path):
        raise HTTPException(status_code=404, detail="文件在服务器上不存在")

    text_extensions = {"txt", "md", "csv"}
    excel_extensions = {"xls", "xlsx"}
    ext = file.file_extension.lower()

    if ext in text_extensions:
        try:
            with open(file.file_path, "r", encoding="utf-8") as f:
                content = f.read()

            if ext == "csv":
                try:
                    csv_data = []
                    reader = csv.reader(io.StringIO(content))
                    for i, row in enumerate(reader):
                        if i > max_rows:
                            break
                        csv_data.append([str(cell) for cell in row])

                    if csv_data:
                        headers = csv_data[0]
                        rows = csv_data[1:max_rows + 1]
                        return DocumentPreviewResponse(
                            file_id=file.id,
                            filename=file.original_filename,
                            file_type=file.file_type,
                            content_type="table",
                            headers=headers,
                            rows=rows,
                            total_rows=len(csv_data) - 1,
                            total_columns=len(headers)
                        )
                except Exception as e:
                    pass

            return DocumentPreviewResponse(
                file_id=file.id,
                filename=file.original_filename,
                file_type=file.file_type,
                content_type="text",
                content=content[:100000]
            )
        except UnicodeDecodeError:
            try:
                with open(file.file_path, "r", encoding="gbk") as f:
                    content = f.read()
                return DocumentPreviewResponse(
                    file_id=file.id,
                    filename=file.original_filename,
                    file_type=file.file_type,
                    content_type="text",
                    content=content[:100000]
                )
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"无法读取文件内容: {str(e)}")

    elif ext in excel_extensions:
        try:
            import pandas as pd

            df = pd.read_excel(file.file_path, nrows=max_rows)
            df = df.fillna("")

            headers = [str(col) for col in df.columns.tolist()]
            rows = df.values.tolist()
            rows = [[str(cell) for cell in row] for row in rows]

            return DocumentPreviewResponse(
                file_id=file.id,
                filename=file.original_filename,
                file_type=file.file_type,
                content_type="table",
                headers=headers,
                rows=rows,
                total_rows=len(rows),
                total_columns=len(headers)
            )
        except ImportError:
            raise HTTPException(status_code=500, detail="服务器未安装 Excel 处理库，请联系管理员")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"无法读取 Excel 文件: {str(e)}")

    else:
        raise HTTPException(
            status_code=400,
            detail=f"该文件类型不支持在线预览。支持的类型: txt, md, csv, xls, xlsx"
        )


@app.get("/api/files/{file_id}/image-blob")
def get_image_blob(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")

    if not os.path.exists(file.file_path):
        raise HTTPException(status_code=404, detail="文件在服务器上不存在")

    image_extensions = {"jpg", "jpeg", "png", "gif", "bmp", "webp"}
    if file.file_extension not in image_extensions:
        raise HTTPException(status_code=400, detail="该文件不是图片类型")

    return FileResponse(
        path=file.file_path,
        media_type=file.file_type
    )


EXPORT_DIR = UPLOAD_DIR / "exports"
EXPORT_DIR.mkdir(exist_ok=True)

EXPORT_FILE_TTL_SECONDS = 3600


def get_user_export_dir(user_id: int, create: bool = True) -> Path:
    user_dir = (EXPORT_DIR / f"user_{user_id}").resolve()
    if create:
        user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir


def migrate_legacy_exports(user_id: int):
    try:
        user_dir = get_user_export_dir(user_id, create=True)
        legacy_files = list(EXPORT_DIR.glob("*.md")) + list(EXPORT_DIR.glob("*.txt"))
        for f in legacy_files:
            if f.is_file():
                try:
                    target = user_dir / f.name
                    if not target.exists():
                        shutil.move(str(f), str(target))
                    else:
                        f.unlink()
                except Exception:
                    pass
    except Exception:
        pass


def cleanup_expired_exports(user_id: int):
    migrate_legacy_exports(user_id)
    user_dir = get_user_export_dir(user_id, create=False)
    if not user_dir.exists():
        return
    now = time.time()
    try:
        files = list(user_dir.glob("*"))
        for f in files:
            if f.is_file():
                if now - f.stat().st_mtime > EXPORT_FILE_TTL_SECONDS:
                    try:
                        f.unlink()
                    except Exception:
                        pass
    except Exception:
        pass


def sanitize_filename(filename: str) -> str:
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    filename = filename.strip()
    filename = filename[:100] if len(filename) > 100 else filename
    return filename or "untitled"


def encode_filename_header(filename: str) -> str:
    encoded = quote(filename, safe='')
    return f"filename*=UTF-8''{encoded}"


def format_note_date(dt) -> str:
    if not dt:
        return ""
    if isinstance(dt, str):
        return dt
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def get_note_plain_content(note) -> str:
    if note.content_plain:
        return note.content_plain
    return html_to_plain_text(note.content or "")


def note_to_markdown(note, include_tags: bool = True, include_metadata: bool = True) -> str:
    lines = []
    lines.append(f"# {note.title or '无标题'}")
    lines.append("")

    if include_metadata:
        metadata_parts = []
        metadata_parts.append(f"- 创建时间: {format_note_date(note.created_at)}")
        if note.updated_at:
            metadata_parts.append(f"- 更新时间: {format_note_date(note.updated_at)}")
        if note.is_favorited == 1:
            metadata_parts.append(f"- 收藏: 是")
            if note.favorited_at:
                metadata_parts.append(f"- 收藏时间: {format_note_date(note.favorited_at)}")
        if note.is_pinned == 1:
            metadata_parts.append(f"- 置顶: 是 (优先级: {note.pin_priority})")
            if note.pinned_at:
                metadata_parts.append(f"- 置顶时间: {format_note_date(note.pinned_at)}")
        if metadata_parts:
            lines.extend(metadata_parts)
            lines.append("")

    if include_tags and note.tags and len(note.tags) > 0:
        tag_names = [f"`{tag.name}`" for tag in note.tags]
        lines.append(f"**标签**: {', '.join(tag_names)}")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(get_note_plain_content(note))
    lines.append("")

    return "\n".join(lines)


def note_to_txt(note, include_tags: bool = True, include_metadata: bool = True) -> str:
    lines = []
    lines.append(f"{note.title or '无标题'}")
    lines.append("=" * 50)
    lines.append("")

    if include_metadata:
        metadata_parts = []
        metadata_parts.append(f"创建时间: {format_note_date(note.created_at)}")
        if note.updated_at:
            metadata_parts.append(f"更新时间: {format_note_date(note.updated_at)}")
        if note.is_favorited == 1:
            metadata_parts.append(f"收藏: 是")
            if note.favorited_at:
                metadata_parts.append(f"收藏时间: {format_note_date(note.favorited_at)}")
        if note.is_pinned == 1:
            metadata_parts.append(f"置顶: 是 (优先级: {note.pin_priority})")
            if note.pinned_at:
                metadata_parts.append(f"置顶时间: {format_note_date(note.pinned_at)}")
        if metadata_parts:
            lines.extend(metadata_parts)
            lines.append("")

    if include_tags and note.tags and len(note.tags) > 0:
        tag_names = [tag.name for tag in note.tags]
        lines.append(f"标签: {', '.join(tag_names)}")
        lines.append("")

    lines.append("-" * 50)
    lines.append("")
    lines.append(get_note_plain_content(note))
    lines.append("")

    return "\n".join(lines)


def notes_to_single_markdown(notes, include_tags: bool = True, include_metadata: bool = True) -> str:
    lines = []
    lines.append(f"# 笔记导出")
    lines.append(f"")
    lines.append(f"导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"笔记数量: {len(notes)}")
    lines.append("")
    lines.append("---")
    lines.append("")

    for i, note in enumerate(notes, 1):
        lines.append(f"## {i}. {note.title or '无标题'}")
        lines.append("")

        if include_metadata:
            metadata_parts = []
            metadata_parts.append(f"- 创建时间: {format_note_date(note.created_at)}")
            if note.updated_at:
                metadata_parts.append(f"- 更新时间: {format_note_date(note.updated_at)}")
            if note.is_favorited == 1:
                metadata_parts.append(f"- 收藏: 是")
            if note.is_pinned == 1:
                metadata_parts.append(f"- 置顶: 是 (优先级: {note.pin_priority})")
            if metadata_parts:
                lines.extend(metadata_parts)
                lines.append("")

        if include_tags and note.tags and len(note.tags) > 0:
            tag_names = [f"`{tag.name}`" for tag in note.tags]
            lines.append(f"**标签**: {', '.join(tag_names)}")
            lines.append("")

        lines.append(get_note_plain_content(note))
        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def notes_to_single_txt(notes, include_tags: bool = True, include_metadata: bool = True) -> str:
    lines = []
    lines.append("笔记导出")
    lines.append("=" * 50)
    lines.append("")
    lines.append(f"导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"笔记数量: {len(notes)}")
    lines.append("")
    lines.append("=" * 50)
    lines.append("")

    for i, note in enumerate(notes, 1):
        lines.append(f"{i}. {note.title or '无标题'}")
        lines.append("-" * 40)

        if include_metadata:
            metadata_parts = []
            metadata_parts.append(f"创建时间: {format_note_date(note.created_at)}")
            if note.updated_at:
                metadata_parts.append(f"更新时间: {format_note_date(note.updated_at)}")
            if note.is_favorited == 1:
                metadata_parts.append(f"收藏: 是")
            if note.is_pinned == 1:
                metadata_parts.append(f"置顶: 是 (优先级: {note.pin_priority})")
            if metadata_parts:
                lines.extend(metadata_parts)
                lines.append("")

        if include_tags and note.tags and len(note.tags) > 0:
            tag_names = [tag.name for tag in note.tags]
            lines.append(f"标签: {', '.join(tag_names)}")
            lines.append("")

        lines.append(get_note_plain_content(note))
        lines.append("")
        lines.append("=" * 50)
        lines.append("")

    return "\n".join(lines)


@app.post("/api/notes/export", response_model=NoteExportResponse)
def export_notes(
    request: NoteExportRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    fmt = request.format.lower()
    if fmt not in ("md", "txt"):
        raise HTTPException(status_code=400, detail="不支持的导出格式，仅支持 md 和 txt")

    cleanup_expired_exports(current_user.id)

    if request.note_ids and len(request.note_ids) > 0:
        notes = db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(
            NoteModel.id.in_(request.note_ids),
            NoteModel.user_id == current_user.id
        ).order_by(NoteModel.created_at.desc()).all()
        if not notes:
            raise HTTPException(status_code=404, detail="未找到要导出的笔记")
    else:
        notes = db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(
            NoteModel.user_id == current_user.id
        ).order_by(NoteModel.created_at.desc()).all()
        if not notes:
            raise HTTPException(status_code=404, detail="没有可导出的笔记")

    user_dir = get_user_export_dir(current_user.id)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_ext = fmt

    if len(notes) == 1:
        note = notes[0]
        base_name = sanitize_filename(note.title or "note")
        filename = f"{base_name}_{timestamp}.{file_ext}"
        file_path = user_dir / filename

        if fmt == "md":
            content = note_to_markdown(note, request.include_tags, request.include_metadata)
        else:
            content = note_to_txt(note, request.include_tags, request.include_metadata)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
    else:
        base_name = f"notes_export_{len(notes)}"
        filename = f"{base_name}_{timestamp}.{file_ext}"
        file_path = user_dir / filename

        if fmt == "md":
            content = notes_to_single_markdown(notes, request.include_tags, request.include_metadata)
        else:
            content = notes_to_single_txt(notes, request.include_tags, request.include_metadata)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

    file_size = os.path.getsize(file_path)
    download_url = f"/api/exports/download/{current_user.id}/{filename}"

    return NoteExportResponse(
        message=f"成功导出 {len(notes)} 条笔记",
        filename=filename,
        download_url=download_url,
        note_count=len(notes),
        file_size=file_size
    )


@app.get("/api/notes/{note_id}/export/{fmt}")
def export_single_note(
    note_id: int,
    fmt: str,
    include_tags: bool = Query(True),
    include_metadata: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    fmt = fmt.lower()
    if fmt not in ("md", "txt"):
        raise HTTPException(status_code=400, detail="不支持的导出格式，仅支持 md 和 txt")

    note = db.query(NoteModel).options(joinedload(NoteModel.tags)).filter(
        NoteModel.id == note_id,
        NoteModel.user_id == current_user.id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    if fmt == "md":
        content = note_to_markdown(note, include_tags, include_metadata)
        media_type = "text/markdown"
        ext = "md"
    else:
        content = note_to_txt(note, include_tags, include_metadata)
        media_type = "text/plain"
        ext = "txt"

    filename = f"{sanitize_filename(note.title or 'note')}.{ext}"
    content_disposition = f"attachment; {encode_filename_header(filename)}"

    headers = {
        "Content-Disposition": content_disposition,
    }

    return Response(
        content=content,
        media_type=media_type,
        headers=headers
    )


@app.get("/api/exports/download/{user_id}/{filename}")
def download_export_file(
    user_id: int,
    filename: str,
    current_user: UserModel = Depends(get_current_active_user)
):
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权限访问该导出文件")

    cleanup_expired_exports(current_user.id)

    user_dir = get_user_export_dir(current_user.id).resolve()
    safe_filename = os.path.basename(filename)
    file_path = (user_dir / safe_filename).resolve()

    try:
        file_path.relative_to(user_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="非法的文件名")

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="导出文件不存在或已过期")

    if safe_filename.endswith(".md"):
        media_type = "text/markdown"
    elif safe_filename.endswith(".txt"):
        media_type = "text/plain"
    else:
        media_type = "application/octet-stream"

    content_disposition = f"attachment; {encode_filename_header(safe_filename)}"

    return FileResponse(
        path=str(file_path),
        filename=safe_filename,
        media_type=media_type,
        headers={"Content-Disposition": content_disposition}
    )

from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import timedelta

from database import engine, Base, get_db
from models import Note as NoteModel, User as UserModel
from schemas import (
    Note, NoteCreate, NoteUpdate,
    UserCreate, UserLogin, UserResponse, Token
)
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_active_user, ACCESS_TOKEN_EXPIRE_MINUTES
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="笔记管理 API")

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


@app.get("/api/notes", response_model=List[Note])
def get_notes(
    search: Optional[str] = Query(None, description="关键词搜索"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    query = db.query(NoteModel).filter(NoteModel.user_id == current_user.id)
    if search:
        query = query.filter(
            (NoteModel.title.contains(search)) |
            (NoteModel.content.contains(search))
        )
    notes = query.order_by(NoteModel.updated_at.desc().nullslast(), NoteModel.created_at.desc()).all()
    return notes


@app.get("/api/notes/{note_id}", response_model=Note)
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    note = db.query(NoteModel).filter(
        NoteModel.id == note_id,
        NoteModel.user_id == current_user.id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return note


def validate_note_data(title: str = None, content: str = None):
    if title is not None:
        if not title.strip():
            raise HTTPException(status_code=400, detail="标题不能为空或仅包含空格")
        if len(title.strip()) > 200:
            raise HTTPException(status_code=400, detail="标题长度不能超过200个字符")
    if content is not None:
        if not content.strip():
            raise HTTPException(status_code=400, detail="内容不能为空或仅包含空格")
        if len(content.strip()) > 2000:
            raise HTTPException(status_code=400, detail="内容长度不能超过2000个字符")


@app.post("/api/notes", response_model=Note)
def create_note(
    note: NoteCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user)
):
    validate_note_data(title=note.title, content=note.content)
    db_note = NoteModel(
        title=note.title.strip(),
        content=note.content.strip(),
        user_id=current_user.id
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note


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
        db_note.content = note.content.strip()

    db.commit()
    db.refresh(db_note)
    return db_note


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

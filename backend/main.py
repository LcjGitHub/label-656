from fastapi import FastAPI, Depends, HTTPException, Query, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import timedelta
import os
import shutil
import uuid
import csv
import io
from pathlib import Path

from database import engine, Base, get_db
from models import Note as NoteModel, User as UserModel, File as FileModel
from schemas import (
    Note, NoteCreate, NoteUpdate,
    UserCreate, UserLogin, UserResponse, Token,
    FileResponse as FileSchema, FileUploadResponse,
    FileDeleteResponse, FileBatchDeleteRequest,
    DocumentPreviewResponse
)
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_active_user, ACCESS_TOKEN_EXPIRE_MINUTES
)

Base.metadata.create_all(bind=engine)

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

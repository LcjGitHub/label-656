from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
from typing import Optional
import re


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


class NoteCreate(NoteBase):
    pass


class NoteUpdate(NoteBase):
    title: Optional[str] = None
    content: Optional[str] = None


class Note(NoteBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    user_id: Optional[int] = None

    class Config:
        from_attributes = True

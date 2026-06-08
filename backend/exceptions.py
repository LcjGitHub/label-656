from fastapi import HTTPException, status


class AppException(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class NoteNotFoundError(AppException):
    def __init__(self, detail: str = "笔记不存在"):
        super().__init__(status.HTTP_404_NOT_FOUND, detail)


class NoteInTrashNotFoundError(AppException):
    def __init__(self, detail: str = "回收站中未找到该笔记"):
        super().__init__(status.HTTP_404_NOT_FOUND, detail)


class TagNotFoundError(AppException):
    def __init__(self, detail: str = "标签不存在"):
        super().__init__(status.HTTP_404_NOT_FOUND, detail)


class FileNotFoundError(AppException):
    def __init__(self, detail: str = "文件不存在"):
        super().__init__(status.HTTP_404_NOT_FOUND, detail)


class CommentNotFoundError(AppException):
    def __init__(self, detail: str = "评论不存在"):
        super().__init__(status.HTTP_404_NOT_FOUND, detail)


class NotificationNotFoundError(AppException):
    def __init__(self, detail: str = "通知不存在"):
        super().__init__(status.HTTP_404_NOT_FOUND, detail)


class ValidationError(AppException):
    def __init__(self, detail: str):
        super().__init__(status.HTTP_400_BAD_REQUEST, detail)


class ForbiddenError(AppException):
    def __init__(self, detail: str = "无权限执行该操作"):
        super().__init__(status.HTTP_403_FORBIDDEN, detail)


class UnauthorizedError(AppException):
    def __init__(self, detail: str = "未授权"):
        super().__init__(status.HTTP_401_UNAUTHORIZED, detail)


class BadRequestError(AppException):
    def __init__(self, detail: str):
        super().__init__(status.HTTP_400_BAD_REQUEST, detail)


class NotFoundError(AppException):
    def __init__(self, detail: str):
        super().__init__(status.HTTP_404_NOT_FOUND, detail)


def raise_http(exc: AppException):
    raise HTTPException(status_code=exc.status_code, detail=exc.detail)

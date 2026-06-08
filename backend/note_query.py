from enum import Enum
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy.orm import Session, joinedload, Query
from sqlalchemy import or_, desc, asc, nullslast

from models import Note as NoteModel, Tag as TagModel
from exceptions import TagNotFoundError, BadRequestError


class NoteSortOrder(str, Enum):
    DEFAULT = "default"
    FAVORITES = "favorites"
    PINNED = "pinned"
    TRASH = "trash"
    CREATED_DESC = "created_desc"
    CREATED_ASC = "created_asc"
    UPDATED_DESC = "updated_desc"


class NoteQueryBuilder:
    def __init__(self, db: Session, user_id: Optional[int] = None):
        self.db = db
        self._query: Query = db.query(NoteModel).options(joinedload(NoteModel.tags))
        self._user_id = user_id
        if user_id is not None:
            self._query = self._query.filter(NoteModel.user_id == user_id)

    def active_only(self) -> "NoteQueryBuilder":
        self._query = self._query.filter(NoteModel.deleted_at.is_(None))
        return self

    def trash_only(self) -> "NoteQueryBuilder":
        self._query = self._query.filter(NoteModel.deleted_at.isnot(None))
        return self

    def with_note_id(self, note_id: int) -> "NoteQueryBuilder":
        self._query = self._query.filter(NoteModel.id == note_id)
        return self

    def with_note_ids(self, note_ids: List[int]) -> "NoteQueryBuilder":
        self._query = self._query.filter(NoteModel.id.in_(note_ids))
        return self

    def with_search(self, search: Optional[str]) -> "NoteQueryBuilder":
        if search:
            self._query = self._query.filter(
                or_(
                    NoteModel.title.contains(search),
                    NoteModel.content_plain.contains(search)
                )
            )
        return self

    def with_tag(self, tag_id: Optional[int]) -> "NoteQueryBuilder":
        if tag_id:
            tag = self.db.query(TagModel).filter(
                TagModel.id == tag_id,
                TagModel.user_id == self._user_id
            ).first()
            if not tag:
                raise TagNotFoundError()
            self._query = self._query.filter(NoteModel.tags.contains(tag))
        return self

    def favorites_only(self) -> "NoteQueryBuilder":
        self._query = self._query.filter(NoteModel.is_favorited == 1)
        return self

    def pinned_only(self) -> "NoteQueryBuilder":
        self._query = self._query.filter(NoteModel.is_pinned == 1)
        return self

    def with_is_favorited(self, is_favorited: Optional[bool]) -> "NoteQueryBuilder":
        if is_favorited is not None:
            self._query = self._query.filter(NoteModel.is_favorited == (1 if is_favorited else 0))
        return self

    def with_is_pinned(self, is_pinned: Optional[bool]) -> "NoteQueryBuilder":
        if is_pinned is not None:
            self._query = self._query.filter(NoteModel.is_pinned == (1 if is_pinned else 0))
        return self

    def with_deleted_range(
        self,
        deleted_from: Optional[str] = None,
        deleted_to: Optional[str] = None
    ) -> "NoteQueryBuilder":
        if deleted_from:
            try:
                from_date = datetime.strptime(deleted_from, "%Y-%m-%d")
                self._query = self._query.filter(NoteModel.deleted_at >= from_date)
            except ValueError:
                raise BadRequestError("deleted_from 格式错误，应为 YYYY-MM-DD")
        if deleted_to:
            try:
                to_date = datetime.strptime(deleted_to, "%Y-%m-%d") + timedelta(days=1)
                self._query = self._query.filter(NoteModel.deleted_at < to_date)
            except ValueError:
                raise BadRequestError("deleted_to 格式错误，应为 YYYY-MM-DD")
        return self

    def order_by(self, sort_order: NoteSortOrder) -> "NoteQueryBuilder":
        order_rules = _SORT_ORDERS.get(sort_order, _SORT_ORDERS[NoteSortOrder.DEFAULT])
        self._query = self._query.order_by(*order_rules)
        return self

    def first(self) -> Optional[NoteModel]:
        return self._query.first()

    def all(self) -> List[NoteModel]:
        return self._query.all()

    def count(self) -> int:
        return self._query.count()

    def build(self) -> Query:
        return self._query


_SORT_ORDERS = {
    NoteSortOrder.DEFAULT: [
        desc(NoteModel.is_pinned),
        desc(NoteModel.pin_priority),
        nullslast(desc(NoteModel.pinned_at)),
        nullslast(desc(NoteModel.updated_at)),
        desc(NoteModel.created_at),
    ],
    NoteSortOrder.FAVORITES: [
        nullslast(desc(NoteModel.favorited_at)),
        nullslast(desc(NoteModel.updated_at)),
        desc(NoteModel.created_at),
    ],
    NoteSortOrder.PINNED: [
        desc(NoteModel.pin_priority),
        nullslast(desc(NoteModel.pinned_at)),
        nullslast(desc(NoteModel.updated_at)),
        desc(NoteModel.created_at),
    ],
    NoteSortOrder.TRASH: [
        desc(NoteModel.deleted_at),
    ],
    NoteSortOrder.CREATED_DESC: [
        desc(NoteModel.created_at),
    ],
    NoteSortOrder.CREATED_ASC: [
        asc(NoteModel.created_at),
    ],
    NoteSortOrder.UPDATED_DESC: [
        nullslast(desc(NoteModel.updated_at)),
        desc(NoteModel.created_at),
    ],
}


def get_active_note_or_404(db: Session, note_id: int, user_id: int) -> NoteModel:
    note = NoteQueryBuilder(db, user_id).active_only().with_note_id(note_id).first()
    if not note:
        from exceptions import NoteNotFoundError
        raise NoteNotFoundError()
    return note


def get_trash_note_or_404(db: Session, note_id: int, user_id: int) -> NoteModel:
    note = NoteQueryBuilder(db, user_id).trash_only().with_note_id(note_id).first()
    if not note:
        from exceptions import NoteInTrashNotFoundError
        raise NoteInTrashNotFoundError()
    return note


def get_shared_note_or_404(db: Session, token: str) -> NoteModel:
    note = (
        db.query(NoteModel)
        .options(joinedload(NoteModel.tags), joinedload(NoteModel.owner))
        .filter(
            NoteModel.share_token == token,
            NoteModel.deleted_at.is_(None),
        )
        .first()
    )
    if not note:
        from exceptions import NotFoundError
        raise NotFoundError("分享链接不存在")
    return note

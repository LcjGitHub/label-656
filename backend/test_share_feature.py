import os
import sys
import uuid
import pytest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import Base, get_db
from main import app
from models import Note as NoteModel, User as UserModel, ShareView as ShareViewModel
from auth import hash_password, create_access_token


TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


def get_new_session() -> Session:
    return TestingSessionLocal()


@pytest.fixture(scope="function", autouse=True)
def setup_teardown():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client():
    with TestClient(app) as c:
        yield c


def create_test_user(db, username=None, password="testpass123"):
    if username is None:
        username = f"testuser_{uuid.uuid4().hex[:8]}"
    user = UserModel(
        username=username,
        email=f"{username}@example.com",
        full_name="Test User",
        hashed_password=hash_password(password),
        is_active=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_test_note(db, user_id, title="Test Note", content="<p>Test content</p>"):
    note = NoteModel(
        title=title,
        content=content,
        content_plain="Test content",
        user_id=user_id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def get_auth_headers(user):
    token = create_access_token(data={"sub": user.username, "user_id": user.id})
    return {"Authorization": f"Bearer {token}"}


class TestEnableShare:
    def test_enable_share_successfully(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["is_shared"] == 1
            assert data["share_token"] is not None
            assert len(data["share_token"]) > 0
            assert data["share_password"] is None
            assert data["share_expires_at"] is None
            assert data["share_created_at"] is not None
            assert data["share_view_count"] == 0
            assert data["share_url"] is not None
            assert "/share/" in data["share_url"]

            db.expire_all()
            db_note = db.query(NoteModel).filter(NoteModel.id == note.id).first()
            assert db_note.is_shared == 1
            assert db_note.share_token == data["share_token"]
            assert db_note.share_created_at is not None
        finally:
            db.close()

    def test_enable_share_with_password(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response = client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "sharepass123"},
                headers=headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["is_shared"] == 1
            assert data["share_password"] == "****"
            assert data["share_token"] is not None

            db.expire_all()
            db_note = db.query(NoteModel).filter(NoteModel.id == note.id).first()
            assert db_note.share_password is not None
            assert db_note.share_password != "sharepass123"
        finally:
            db.close()

    def test_enable_share_with_short_password_should_fail(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response = client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "123"},
                headers=headers,
            )

            assert response.status_code == 400
            assert "密码长度不能少于4位" in response.json()["detail"]
        finally:
            db.close()

    def test_enable_share_with_expiration(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response = client.post(
                f"/api/notes/{note.id}/share",
                json={"expires_days": 7},
                headers=headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["is_shared"] == 1
            assert data["share_expires_at"] is not None

            expires_at = datetime.fromisoformat(data["share_expires_at"].replace("Z", "+00:00"))
            expected_min = datetime.utcnow() + timedelta(days=6, hours=23)
            expected_max = datetime.utcnow() + timedelta(days=7, hours=1)
            assert expected_min < expires_at.replace(tzinfo=None) < expected_max
        finally:
            db.close()

    def test_enable_share_with_password_and_expiration(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response = client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "mypassword", "expires_days": 3},
                headers=headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["is_shared"] == 1
            assert data["share_password"] == "****"
            assert data["share_expires_at"] is not None
            assert data["share_token"] is not None
        finally:
            db.close()

    def test_update_existing_share_config(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response1 = client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "oldpass", "expires_days": 1},
                headers=headers,
            )
            assert response1.status_code == 200
            old_token = response1.json()["share_token"]

            response2 = client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "newpass", "expires_days": 30},
                headers=headers,
            )

            assert response2.status_code == 200
            data = response2.json()
            assert data["share_token"] == old_token
            assert data["share_password"] == "****"
            assert data["share_expires_at"] is not None
        finally:
            db.close()

    def test_enable_share_nonexistent_note(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            headers = get_auth_headers(user)

            response = client.post(
                "/api/notes/99999/share",
                json={},
                headers=headers,
            )

            assert response.status_code == 404
        finally:
            db.close()

    def test_enable_share_unauthorized(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)

            response = client.post(
                f"/api/notes/{note.id}/share",
                json={},
            )

            assert response.status_code == 401
        finally:
            db.close()

    def test_enable_share_other_users_note(self, client):
        db = get_new_session()
        try:
            user1 = create_test_user(db, username="user1")
            user2 = create_test_user(db, username="user2")
            note = create_test_note(db, user1.id)
            headers2 = get_auth_headers(user2)

            response = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers2,
            )

            assert response.status_code == 404
        finally:
            db.close()


class TestDisableShare:
    def test_disable_share_successfully(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "testpass"},
                headers=headers,
            )

            response = client.delete(
                f"/api/notes/{note.id}/share",
                headers=headers,
            )

            assert response.status_code == 200
            assert response.json()["message"] == "分享已关闭"

            db.expire_all()
            db_note = db.query(NoteModel).filter(NoteModel.id == note.id).first()
            assert db_note.is_shared == 0
            assert db_note.share_password is None
            assert db_note.share_expires_at is None
        finally:
            db.close()

    def test_disable_share_then_access_should_fail(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            client.delete(
                f"/api/notes/{note.id}/share",
                headers=headers,
            )

            response = client.get(f"/api/public/share/{token}")
            assert response.status_code == 404
        finally:
            db.close()

    def test_disable_share_nonexistent_note(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            headers = get_auth_headers(user)

            response = client.delete(
                "/api/notes/99999/share",
                headers=headers,
            )

            assert response.status_code == 404
        finally:
            db.close()

    def test_disable_share_unauthorized(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)

            response = client.delete(f"/api/notes/{note.id}/share")
            assert response.status_code == 401
        finally:
            db.close()


class TestGetShareInfo:
    def test_get_share_info_shared_note(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "secret123", "expires_days": 5},
                headers=headers,
            )

            response = client.get(
                f"/api/notes/{note.id}/share",
                headers=headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["is_shared"] == 1
            assert data["share_token"] is not None
            assert data["share_password"] == "****"
            assert data["share_expires_at"] is not None
            assert data["share_created_at"] is not None
            assert data["share_view_count"] == 0
            assert data["share_url"] is not None
        finally:
            db.close()

    def test_get_share_info_unshared_note(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response = client.get(
                f"/api/notes/{note.id}/share",
                headers=headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["is_shared"] == 0
            assert data["share_token"] is None
            assert data["share_password"] is None
            assert data["share_expires_at"] is None
            assert data["share_url"] is None
        finally:
            db.close()

    def test_get_share_info_unauthorized(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)

            response = client.get(f"/api/notes/{note.id}/share")
            assert response.status_code == 401
        finally:
            db.close()


class TestPublicShareAccess:
    def test_access_public_share_without_password(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id, title="Public Note", content="<p>Public content</p>")
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            response = client.get(f"/api/public/share/{token}")

            assert response.status_code == 200
            data = response.json()
            assert data["id"] == note.id
            assert data["title"] == "Public Note"
            assert data["content"] == "<p>Public content</p>"
            assert data["owner_username"] == user.username
            assert data["owner_name"] == user.full_name
            assert "requires_password" not in data
        finally:
            db.close()

    def test_access_password_protected_share_without_password(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "protected123"},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            response = client.get(f"/api/public/share/{token}")

            assert response.status_code == 200
            data = response.json()
            assert data["requires_password"] is True
            assert "该分享需要访问密码" in data["message"]
        finally:
            db.close()

    def test_access_password_protected_share_with_correct_password(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id, title="Protected Note")
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "correctpass"},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            response = client.post(
                f"/api/public/share/{token}/access",
                json={"password": "correctpass"},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["id"] == note.id
            assert data["title"] == "Protected Note"
        finally:
            db.close()

    def test_access_password_protected_share_with_wrong_password(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "correctpass"},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            response = client.post(
                f"/api/public/share/{token}/access",
                json={"password": "wrongpass"},
            )

            assert response.status_code == 401
            assert "访问密码错误" in response.json()["detail"]
        finally:
            db.close()

    def test_access_share_with_invalid_token(self, client):
        response = client.get("/api/public/share/invalid_token_12345")
        assert response.status_code == 404
        assert "分享链接不存在" in response.json()["detail"]

    def test_access_expired_share(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={"expires_days": 1},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            db_note = db.query(NoteModel).filter(NoteModel.id == note.id).first()
            db_note.share_expires_at = datetime.utcnow() - timedelta(hours=1)
            db.commit()
            db.close()

            db2 = get_new_session()
            try:
                response = client.get(f"/api/public/share/{token}")
                assert response.status_code == 410
                assert "已过期" in response.json()["detail"]
            finally:
                db2.close()
        except:
            db.close()
            raise

    def test_access_deleted_note_share(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            db_note = db.query(NoteModel).filter(NoteModel.id == note.id).first()
            db_note.deleted_at = datetime.utcnow()
            db.commit()
            db.close()

            db2 = get_new_session()
            try:
                response = client.get(f"/api/public/share/{token}")
                assert response.status_code == 404
            finally:
                db2.close()
        except:
            db.close()
            raise

    def test_access_unshared_note_via_token(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            response_before = client.get(f"/api/public/share/{token}")
            assert response_before.status_code == 200

            client.delete(
                f"/api/notes/{note.id}/share",
                headers=headers,
            )

            response = client.get(f"/api/public/share/{token}")
            assert response.status_code == 404
        finally:
            db.close()

    def test_access_protected_share_no_password_set_via_access_endpoint(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id, title="Open Note")
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            response = client.post(
                f"/api/public/share/{token}/access",
                json={"password": "anypassword"},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["title"] == "Open Note"
        finally:
            db.close()


class TestShareViewStats:
    def test_view_count_increments_on_access(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            client.get(f"/api/public/share/{token}")
            client.get(f"/api/public/share/{token}")
            client.get(f"/api/public/share/{token}")

            db.expire_all()
            db_note = db.query(NoteModel).filter(NoteModel.id == note.id).first()
            assert db_note.share_view_count == 3

            share_views = db.query(ShareViewModel).filter(ShareViewModel.note_id == note.id).all()
            assert len(share_views) == 3
        finally:
            db.close()

    def test_view_count_increments_on_password_access(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "mypass"},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            client.post(
                f"/api/public/share/{token}/access",
                json={"password": "mypass"},
            )
            client.post(
                f"/api/public/share/{token}/access",
                json={"password": "mypass"},
            )

            db.expire_all()
            db_note = db.query(NoteModel).filter(NoteModel.id == note.id).first()
            assert db_note.share_view_count == 2
        finally:
            db.close()

    def test_get_share_stats(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={"expires_days": 10},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            client.get(f"/api/public/share/{token}")
            client.get(f"/api/public/share/{token}")

            response = client.get(
                f"/api/notes/{note.id}/share/stats",
                headers=headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["view_count"] == 2
            assert data["is_shared"] == 1
            assert data["share_created_at"] is not None
            assert data["share_expires_at"] is not None
            assert len(data["recent_views"]) == 2
            assert "viewed_at" in data["recent_views"][0]
        finally:
            db.close()

    def test_share_stats_unshared_note(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response = client.get(
                f"/api/notes/{note.id}/share/stats",
                headers=headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["view_count"] == 0
            assert data["is_shared"] == 0
            assert len(data["recent_views"]) == 0
        finally:
            db.close()

    def test_share_stats_unauthorized(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)

            response = client.get(f"/api/notes/{note.id}/share/stats")
            assert response.status_code == 401
        finally:
            db.close()


class TestShareQRCode:
    def test_get_share_qrcode_shared_note(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )

            response = client.get(
                f"/api/notes/{note.id}/share/qrcode",
                headers=headers,
            )

            assert response.status_code == 200
            assert response.headers["content-type"] == "image/png"
            assert len(response.content) > 0
        finally:
            db.close()

    def test_get_share_qrcode_unshared_note(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response = client.get(
                f"/api/notes/{note.id}/share/qrcode",
                headers=headers,
            )

            assert response.status_code == 400
            assert "尚未开启分享" in response.json()["detail"]
        finally:
            db.close()


class TestSharePermissionControl:
    def test_other_user_cannot_see_share_info(self, client):
        db = get_new_session()
        try:
            user1 = create_test_user(db, username="owner")
            user2 = create_test_user(db, username="other")
            note = create_test_note(db, user1.id)
            headers1 = get_auth_headers(user1)
            headers2 = get_auth_headers(user2)

            client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers1,
            )

            response = client.get(
                f"/api/notes/{note.id}/share",
                headers=headers2,
            )
            assert response.status_code == 404
        finally:
            db.close()

    def test_other_user_cannot_disable_share(self, client):
        db = get_new_session()
        try:
            user1 = create_test_user(db, username="owner2")
            user2 = create_test_user(db, username="other2")
            note = create_test_note(db, user1.id)
            headers1 = get_auth_headers(user1)
            headers2 = get_auth_headers(user2)

            client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers1,
            )

            response = client.delete(
                f"/api/notes/{note.id}/share",
                headers=headers2,
            )
            assert response.status_code == 404
        finally:
            db.close()

    def test_other_user_cannot_modify_share(self, client):
        db = get_new_session()
        try:
            user1 = create_test_user(db, username="owner3")
            user2 = create_test_user(db, username="other3")
            note = create_test_note(db, user1.id)
            headers1 = get_auth_headers(user1)
            headers2 = get_auth_headers(user2)

            client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers1,
            )

            response = client.post(
                f"/api/notes/{note.id}/share",
                json={"password": "hacked"},
                headers=headers2,
            )
            assert response.status_code == 404
        finally:
            db.close()


class TestShareEdgeCases:
    def test_share_deleted_note_should_fail(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            db_note = db.query(NoteModel).filter(NoteModel.id == note.id).first()
            db_note.deleted_at = datetime.utcnow()
            db.commit()

            response = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )
            assert response.status_code == 404
        finally:
            db.close()

    def test_share_with_zero_expires_days_no_expiration(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response = client.post(
                f"/api/notes/{note.id}/share",
                json={"expires_days": 0},
                headers=headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["share_expires_at"] is None
        finally:
            db.close()

    def test_share_with_negative_expires_days_no_expiration(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response = client.post(
                f"/api/notes/{note.id}/share",
                json={"expires_days": -5},
                headers=headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["share_expires_at"] is None
        finally:
            db.close()

    def test_disable_already_disabled_share(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            response = client.delete(
                f"/api/notes/{note.id}/share",
                headers=headers,
            )

            assert response.status_code == 200
            assert response.json()["message"] == "分享已关闭"

            db.expire_all()
            db_note = db.query(NoteModel).filter(NoteModel.id == note.id).first()
            assert db_note.is_shared == 0
        finally:
            db.close()

    def test_re_enable_share_preserves_token(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            share_resp1 = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )
            token1 = share_resp1.json()["share_token"]

            client.delete(
                f"/api/notes/{note.id}/share",
                headers=headers,
            )

            share_resp2 = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )
            token2 = share_resp2.json()["share_token"]

            assert token1 == token2
        finally:
            db.close()

    def test_recent_views_limited_to_20(self, client):
        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id)
            headers = get_auth_headers(user)

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            for i in range(30):
                client.get(f"/api/public/share/{token}")

            response = client.get(
                f"/api/notes/{note.id}/share/stats",
                headers=headers,
            )

            data = response.json()
            assert data["view_count"] == 30
            assert len(data["recent_views"]) == 20
        finally:
            db.close()

    def test_public_share_returns_correct_tags(self, client):
        from models import Tag as TagModel

        db = get_new_session()
        try:
            user = create_test_user(db)
            note = create_test_note(db, user.id, title="Tagged Note")
            headers = get_auth_headers(user)

            tag = TagModel(name="TestTag", color="#ff0000", user_id=user.id)
            db.add(tag)
            db.commit()
            db.refresh(tag)

            note.tags.append(tag)
            db.commit()

            share_resp = client.post(
                f"/api/notes/{note.id}/share",
                json={},
                headers=headers,
            )
            token = share_resp.json()["share_token"]

            response = client.get(f"/api/public/share/{token}")
            data = response.json()

            assert len(data["tags"]) == 1
            assert data["tags"][0]["name"] == "TestTag"
            assert data["tags"][0]["color"] == "#ff0000"
        finally:
            db.close()

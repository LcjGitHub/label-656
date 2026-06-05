import json
import sqlite3
import urllib.request
import uuid
import os

BASE = "http://localhost:8000/api"
TEST_DIR = os.path.dirname(__file__)

req = urllib.request.Request(
    BASE + "/auth/login",
    json.dumps({"username": "filetestuser", "password": "test123456"}).encode(),
    {"Content-Type": "application/json"},
)
token = json.loads(urllib.request.urlopen(req).read())["access_token"]
H = {"Authorization": f"Bearer {token}"}

# upload txt
txt_path = os.path.join(TEST_DIR, "test.txt")
boundary = uuid.uuid4().hex
with open(txt_path, "rb") as f:
    content = f.read()
body = b""
body += f"--{boundary}\r\n".encode()
body += b'Content-Disposition: form-data; name="files"; filename="test.txt"\r\n'
body += b"Content-Type: text/plain\r\n\r\n"
body += content + b"\r\n"
body += f"--{boundary}--\r\n".encode()
req = urllib.request.Request(
    BASE + "/files/upload",
    data=body,
    headers={**H, "Content-Type": f"multipart/form-data; boundary={boundary}"},
    method="POST",
)
print("upload txt:", urllib.request.urlopen(req).read().decode())

# static access test
for db_name in ["notes.db", "app.db"]:
    db_path = os.path.join(os.path.dirname(TEST_DIR), "backend", db_name)
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        try:
            row = conn.execute("select stored_filename from files limit 1").fetchone()
            print(f"db {db_name} stored:", row)
            if row:
                try:
                    r = urllib.request.urlopen(f"http://localhost:8000/uploads/{row[0]}")
                    print("static access:", r.status, len(r.read()))
                except Exception as e:
                    print("static fail:", getattr(e, "code", e))
        except Exception as e:
            print(f"db {db_name} error:", e)
        conn.close()

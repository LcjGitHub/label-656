import json
import mimetypes
import os
import urllib.request
import uuid

BASE = "http://localhost:8000/api"
TEST_DIR = os.path.dirname(__file__)
png_path = os.path.join(TEST_DIR, "test.png")

req = urllib.request.Request(
    BASE + "/auth/login",
    json.dumps({"username": "filetestuser", "password": "test123456"}).encode(),
    {"Content-Type": "application/json"},
)
token = json.loads(urllib.request.urlopen(req).read())["access_token"]
H = {"Authorization": f"Bearer {token}"}

boundary = uuid.uuid4().hex
with open(png_path, "rb") as f:
    content = f.read()
body = b""
body += f"--{boundary}\r\n".encode()
body += b'Content-Disposition: form-data; name="files"; filename="test.png"\r\n'
body += b"Content-Type: image/png\r\n\r\n"
body += content + b"\r\n"
body += f"--{boundary}--\r\n".encode()

req = urllib.request.Request(
    BASE + "/files/upload",
    data=body,
    headers={**H, "Content-Type": f"multipart/form-data; boundary={boundary}"},
    method="POST",
)
print(urllib.request.urlopen(req).read().decode())

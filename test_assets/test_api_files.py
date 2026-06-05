import json
import mimetypes
import os
import urllib.request
import uuid

BASE = "http://localhost:8000/api"
TEST_DIR = os.path.dirname(__file__)

# create test files
png_path = os.path.join(TEST_DIR, "test.png")
txt_path = os.path.join(TEST_DIR, "test.txt")
if not os.path.exists(png_path):
    png_bytes = bytes([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
        0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0,
        0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 3, 1, 1,
        0, 24, 221, 141, 219, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
    ])
    with open(png_path, "wb") as f:
        f.write(png_bytes)
with open(txt_path, "w", encoding="utf-8") as f:
    f.write("测试文档内容")

req = urllib.request.Request(
    BASE + "/auth/login",
    json.dumps({"username": "filetestuser", "password": "test123456"}).encode(),
    {"Content-Type": "application/json"},
)
token = json.loads(urllib.request.urlopen(req).read())["access_token"]
H = {"Authorization": f"Bearer {token}"}


def upload_files(file_paths):
    boundary = uuid.uuid4().hex
    body = b""
    for fpath in file_paths:
        fname = os.path.basename(fpath)
        with open(fpath, "rb") as f:
            content = f.read()
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="files"; filename="{fname}"\r\n'.encode()
        ct = mimetypes.guess_type(fname)[0] or "application/octet-stream"
        body += f"Content-Type: {ct}\r\n\r\n".encode()
        body += content + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    headers = {**H, "Content-Type": f"multipart/form-data; boundary={boundary}"}
    req = urllib.request.Request(BASE + "/files/upload", data=body, headers=headers, method="POST")
    return urllib.request.urlopen(req)


print("=== 上传测试 ===")
r = upload_files([png_path, txt_path])
print("upload:", r.status, r.read()[:400])

req = urllib.request.Request(BASE + "/files", headers=H)
files = json.loads(urllib.request.urlopen(req).read())
print("list count:", len(files))

if files:
    png_file = next((f for f in files if f["file_extension"] == "png"), files[0])
    fid = png_file["id"]
    stored = png_file.get("stored_filename", "")

    print("\n=== 预览鉴权测试 ===")
    try:
        urllib.request.urlopen(f"http://localhost:8000/api/files/{fid}/preview")
        print("preview no auth: OK (安全问题)")
    except Exception as e:
        print("preview no auth:", getattr(e, "code", e))

    req = urllib.request.Request(BASE + f"/files/{fid}/preview", headers=H)
    r = urllib.request.urlopen(req)
    print("preview with auth:", r.status, "size:", len(r.read()))

    print("\n=== 静态目录访问测试 ===")
    if stored:
        try:
            r = urllib.request.urlopen(f"http://localhost:8000/uploads/{stored}")
            print("static /uploads access:", r.status, "(未鉴权可访问)")
        except Exception as e:
            print("static access fail:", getattr(e, "code", e))

    print("\n=== 下载测试 ===")
    req = urllib.request.Request(BASE + f"/files/{fid}/download", headers=H)
    r = urllib.request.urlopen(req)
    print("download:", r.status, "size:", len(r.read()))

    print("\n=== 类型筛选测试 ===")
    req = urllib.request.Request(BASE + "/files?file_type=image", headers=H)
    imgs = json.loads(urllib.request.urlopen(req).read())
    print("image filter:", len(imgs))

    print("\n=== 搜索测试 ===")
    req = urllib.request.Request(BASE + "/files?search=test", headers=H)
    searched = json.loads(urllib.request.urlopen(req).read())
    print("search test:", len(searched))

    print("\n=== 超大文件测试 ===")
    big_path = os.path.join(TEST_DIR, "big.bin")
    with open(big_path, "wb") as f:
        f.write(b"0" * (51 * 1024 * 1024))
    try:
        r = upload_files([big_path])
        print("big file upload:", r.status, r.read()[:200])
    except Exception as e:
        print("big file rejected:", getattr(e, "code", e), e.read().decode() if hasattr(e, "read") else "")
    os.remove(big_path)

    print("\n=== 不支持类型测试 ===")
    bad_path = os.path.join(TEST_DIR, "bad.exe")
    with open(bad_path, "wb") as f:
        f.write(b"fake")
    try:
        r = upload_files([bad_path])
        print("exe upload:", r.status, r.read()[:200])
    except Exception as e:
        print("exe rejected:", getattr(e, "code", e), e.read().decode() if hasattr(e, "read") else "")
    os.remove(bad_path)

    print("\n=== 批量删除测试 ===")
    ids = [f["id"] for f in files]
    req = urllib.request.Request(
        BASE + "/files/batch-delete",
        json.dumps({"file_ids": ids}).encode(),
        {**H, "Content-Type": "application/json"},
        method="POST",
    )
    r = urllib.request.urlopen(req)
    print("batch delete:", r.status, r.read())

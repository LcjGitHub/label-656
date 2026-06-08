import requests
import json
import time

BASE_URL = "http://localhost:8003"
API = f"{BASE_URL}/api"

timestamp = int(time.time())
username = f"testuser_{timestamp}"
email = f"test_{timestamp}@example.com"
password = "testpass123"

auth_headers = {}


def test_step(name):
    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"{'='*60}")


def print_response(label, resp):
    print(f"[{label}] Status: {resp.status_code}")
    if resp.status_code != 204:
        try:
            data = resp.json()
            print(f"[{label}] Response: {json.dumps(data, ensure_ascii=False, indent=2)}")
            return data
        except:
            print(f"[{label}] Response: {resp.text}")
    return None


test_step("1. 注册用户")
resp = requests.post(f"{API}/auth/register", json={
    "username": username,
    "email": email,
    "password": password,
    "full_name": "Test User"
})
print_response("Register", resp)


test_step("2. 登录获取Token")
resp = requests.post(f"{API}/auth/login", json={
    "username": username,
    "password": password
})
data = print_response("Login", resp)
if data and "access_token" in data:
    auth_headers["Authorization"] = f"Bearer {data['access_token']}"
    print("Auth headers set successfully")


test_step("3. 创建3条测试笔记")
note_ids = []
for i in range(1, 4):
    resp = requests.post(f"{API}/notes", json={
        "title": f"回收站测试笔记 {i}",
        "content": f"<p>这是第 {i} 条用于测试回收站功能的笔记内容</p>",
        "tag_ids": []
    }, headers=auth_headers)
    data = print_response(f"Create Note {i}", resp)
    if data and "id" in data:
        note_ids.append(data["id"])

print(f"Created note IDs: {note_ids}")
assert len(note_ids) == 3, "Failed to create 3 notes"


test_step("4. 检查回收站数量（删除前应为0）")
resp = requests.get(f"{API}/notes/trash/count", headers=auth_headers)
data = print_response("Trash Count Before Delete", resp)
if data and "count" in data:
    assert data["count"] == 0, f"Expected 0, got {data['count']}"
    print("✅ Trash count is 0 before delete")


test_step("5. 检查回收站列表（删除前应为空）")
resp = requests.get(f"{API}/notes/trash", headers=auth_headers)
data = print_response("Trash List Before Delete", resp)
if isinstance(data, list):
    assert len(data) == 0, f"Expected empty list, got {len(data)} items"
    print("✅ Trash list is empty before delete")


test_step("6. 软删除笔记 1 和 笔记 2")
for nid in note_ids[:2]:
    resp = requests.delete(f"{API}/notes/{nid}", headers=auth_headers)
    print_response(f"Soft Delete Note {nid}", resp)


test_step("7. 验证已删除笔记不在正常列表中")
resp = requests.get(f"{API}/notes", headers=auth_headers)
data = print_response("Normal Notes List After Delete", resp)
if isinstance(data, list):
    remaining_ids = [n["id"] for n in data]
    print(f"Remaining note IDs: {remaining_ids}")
    assert note_ids[0] not in remaining_ids, f"Note {note_ids[0]} should NOT be in normal list!"
    assert note_ids[1] not in remaining_ids, f"Note {note_ids[1]} should NOT be in normal list!"
    assert note_ids[2] in remaining_ids, f"Note {note_ids[2]} SHOULD be in normal list!"
    print("✅ Normal list filter works correctly")


test_step("8. 检查回收站数量（应为2）")
resp = requests.get(f"{API}/notes/trash/count", headers=auth_headers)
data = print_response("Trash Count After Delete", resp)
if data and "count" in data:
    assert data["count"] == 2, f"Expected 2 notes in trash, got {data['count']}"
    print("✅ Trash count is correct (2)")


test_step("9. 检查回收站列表（应返回2条笔记）")
resp = requests.get(f"{API}/notes/trash", headers=auth_headers)
data = print_response("Trash List After Delete", resp)
if isinstance(data, list):
    trash_ids = [n["id"] for n in data]
    print(f"Trash note IDs: {trash_ids}")
    assert len(data) == 2, f"Expected 2 notes in trash, got {len(data)}"
    assert note_ids[0] in trash_ids, f"Note {note_ids[0]} should be in trash!"
    assert note_ids[1] in trash_ids, f"Note {note_ids[1]} should be in trash!"
    for note in data:
        assert note.get("deleted_at") is not None, f"Note {note['id']} should have deleted_at set!"
    print("✅ Trash list returns correct data with deleted_at field")


test_step("10. 回收站搜索功能测试")
resp = requests.get(f"{API}/notes/trash", params={"search": "测试笔记 1"}, headers=auth_headers)
data = print_response("Trash Search", resp)
if isinstance(data, list):
    assert len(data) == 1, f"Expected 1 note from search, got {len(data)}"
    assert "测试笔记 1" in data[0]["title"], "Search result mismatch"
    print("✅ Trash search works correctly")


test_step("11. 单条恢复笔记 1")
resp = requests.put(f"{API}/notes/{note_ids[0]}/restore", headers=auth_headers)
data = print_response(f"Restore Note {note_ids[0]}", resp)
if data:
    assert data.get("message") == "笔记已恢复", "Restore message mismatch"
    print("✅ Single note restore works")


test_step("12. 验证恢复的笔记回到正常列表")
resp = requests.get(f"{API}/notes", headers=auth_headers)
data = print_response("Normal Notes After Restore", resp)
if isinstance(data, list):
    remaining_ids = [n["id"] for n in data]
    assert note_ids[0] in remaining_ids, f"Note {note_ids[0]} should be back in normal list!"
    print("✅ Restored note is back in normal list")


test_step("13. 回收站数量现在应为1")
resp = requests.get(f"{API}/notes/trash/count", headers=auth_headers)
data = print_response("Trash Count After Restore", resp)
if data and "count" in data:
    assert data["count"] == 1, f"Expected 1 note in trash, got {data['count']}"
    print("✅ Trash count correct after restore (1)")


test_step("14. 再删除笔记3，准备批量恢复测试")
resp = requests.delete(f"{API}/notes/{note_ids[2]}", headers=auth_headers)
print_response(f"Soft Delete Note {note_ids[2]}", resp)


test_step("15. 回收站数量现在应为2")
resp = requests.get(f"{API}/notes/trash/count", headers=auth_headers)
data = print_response("Trash Count Before Batch Restore", resp)
if data and "count" in data:
    assert data["count"] == 2, f"Expected 2 notes in trash, got {data['count']}"
    print("✅ Trash count correct before batch restore (2)")


test_step("16. 批量恢复笔记 2 和 笔记 3")
resp = requests.put(f"{API}/notes/batch/restore", json={
    "note_ids": [note_ids[1], note_ids[2]]
}, headers=auth_headers)
data = print_response("Batch Restore", resp)
if data:
    assert data.get("restored_count") == 2, f"Expected restored_count=2, got {data.get('restored_count')}"
    print("✅ Batch restore works correctly (2 notes)")


test_step("17. 回收站数量现在应为0")
resp = requests.get(f"{API}/notes/trash/count", headers=auth_headers)
data = print_response("Trash Count After Batch Restore", resp)
if data and "count" in data:
    assert data["count"] == 0, f"Expected 0 notes in trash, got {data['count']}"
    print("✅ Trash count correct after batch restore (0)")


test_step("18. 所有笔记都在正常列表中")
resp = requests.get(f"{API}/notes", headers=auth_headers)
data = print_response("Normal Notes After Batch Restore", resp)
if isinstance(data, list):
    remaining_ids = [n["id"] for n in data]
    for nid in note_ids:
        assert nid in remaining_ids, f"Note {nid} should be in normal list!"
    print("✅ All 3 notes back in normal list")


test_step("19. 删除笔记 1，测试永久删除")
resp = requests.delete(f"{API}/notes/{note_ids[0]}", headers=auth_headers)
print_response(f"Soft Delete Note {note_ids[0]} for perm test", resp)


test_step("20. 单条永久删除笔记 1")
resp = requests.delete(f"{API}/notes/{note_ids[0]}/permanent", headers=auth_headers)
data = print_response(f"Permanent Delete Note {note_ids[0]}", resp)
if data:
    assert data.get("message") == "笔记已永久删除", "Permanent delete message mismatch"
    print("✅ Permanent delete works")


test_step("21. 验证永久删除的笔记不在回收站也不在正常列表")
resp = requests.get(f"{API}/notes/trash/count", headers=auth_headers)
data = print_response("Trash Count After Perm Delete", resp)
if data and "count" in data:
    assert data["count"] == 0, f"Expected 0 notes in trash, got {data['count']}"
    print("✅ Trash count 0 after permanent delete")

resp = requests.get(f"{API}/notes", headers=auth_headers)
data = print_response("Normal Notes After Perm Delete", resp)
if isinstance(data, list):
    remaining_ids = [n["id"] for n in data]
    assert note_ids[0] not in remaining_ids, f"Note {note_ids[0]} should NOT exist anywhere!"
    print("✅ Permanently deleted note is gone")


test_step("22. 批量永久删除测试")
for nid in note_ids[1:]:
    requests.delete(f"{API}/notes/{nid}", headers=auth_headers)

resp = requests.get(f"{API}/notes/trash/count", headers=auth_headers)
data = print_response("Trash Count Before Batch Perm Delete", resp)

resp = requests.post(f"{API}/notes/batch/permanent-delete", json={
    "note_ids": note_ids[1:]
}, headers=auth_headers)
data = print_response("Batch Permanent Delete", resp)
if data:
    assert data.get("deleted_count") == 2, f"Expected deleted_count=2, got {data.get('deleted_count')}"
    print("✅ Batch permanent delete works correctly (2 notes)")


test_step("23. 最终验证 - 回收站和正常列表都为空")
resp = requests.get(f"{API}/notes/trash/count", headers=auth_headers)
data = print_response("Final Trash Count", resp)
if data and "count" in data:
    assert data["count"] == 0, f"Expected 0, got {data['count']}"
    print("✅ Final trash count is 0")

resp = requests.get(f"{API}/notes", headers=auth_headers)
data = print_response("Final Normal Notes", resp)
if isinstance(data, list):
    assert len(data) == 0, f"Expected 0 normal notes, got {len(data)}"
    print("✅ Final normal notes count is 0")


print("\n" + "="*60)
print("  🎉 所有回收站接口测试通过！")
print("="*60)

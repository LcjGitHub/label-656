import requests
import json

base_url = 'http://localhost:8000'

print('=' * 50)
print('用户认证系统 API 测试')
print('=' * 50)

print('\n1. 测试用户注册')
print('-' * 30)
register_data = {
    'username': 'testuser',
    'email': 'test@example.com',
    'password': 'password123',
    'full_name': '测试用户'
}
resp = requests.post(f'{base_url}/api/auth/register', json=register_data)
print(f'状态码: {resp.status_code}')
if resp.status_code == 201:
    print('✅ 注册成功')
    print(f'  用户信息: {resp.json()["username"]} ({resp.json()["email"]})')
else:
    print(f'❌ 注册失败: {resp.json()}')

print('\n2. 测试重复用户名注册')
print('-' * 30)
resp = requests.post(f'{base_url}/api/auth/register', json=register_data)
print(f'状态码: {resp.status_code}')
if resp.status_code == 400:
    print(f'✅ 正确拒绝重复注册: {resp.json()["detail"]}')
else:
    print('❌ 应该拒绝重复注册')

print('\n3. 测试用户登录')
print('-' * 30)
login_data = {
    'username': 'testuser',
    'password': 'password123'
}
resp = requests.post(f'{base_url}/api/auth/login', json=login_data)
print(f'状态码: {resp.status_code}')
if resp.status_code == 200:
    print('✅ 登录成功')
    login_result = resp.json()
    token = login_result['access_token']
    print(f'  Token: {token[:50]}...')
    headers = {'Authorization': f'Bearer {token}'}
else:
    print(f'❌ 登录失败: {resp.json()}')
    exit(1)

print('\n4. 测试错误密码登录')
print('-' * 30)
wrong_login = {'username': 'testuser', 'password': 'wrongpassword'}
resp = requests.post(f'{base_url}/api/auth/login', json=wrong_login)
print(f'状态码: {resp.status_code}')
if resp.status_code == 401:
    print(f'✅ 正确拒绝错误密码: {resp.json()["detail"]}')
else:
    print('❌ 应该拒绝错误密码')

print('\n5. 测试获取当前用户信息（受保护路由）')
print('-' * 30)
resp = requests.get(f'{base_url}/api/auth/me', headers=headers)
print(f'状态码: {resp.status_code}')
if resp.status_code == 200:
    user_data = resp.json()
    print('✅ 获取用户信息成功')
    print(f'  用户名: {user_data["username"]}')
    print(f'  邮箱: {user_data["email"]}')
    print(f'  姓名: {user_data["full_name"]}')
else:
    print(f'❌ 获取用户信息失败: {resp.json()}')

print('\n6. 测试无 Token 访问受保护路由')
print('-' * 30)
resp = requests.get(f'{base_url}/api/notes')
print(f'状态码: {resp.status_code}')
if resp.status_code == 401:
    print(f'✅ 正确要求认证: {resp.json()["detail"]}')
else:
    print('❌ 应该要求认证')

print('\n7. 测试创建笔记（受保护路由）')
print('-' * 30)
note_data = {'title': '测试笔记标题', 'content': '这是一条测试笔记的内容'}
resp = requests.post(f'{base_url}/api/notes', json=note_data, headers=headers)
print(f'状态码: {resp.status_code}')
if resp.status_code == 200:
    print('✅ 创建笔记成功')
    note = resp.json()
    print(f'  笔记ID: {note["id"]}')
    print(f'  标题: {note["title"]}')
    note_id = note['id']
else:
    print(f'❌ 创建笔记失败: {resp.status_code}')
    print(f'  响应: {resp.text}')
    exit(1)

print('\n8. 测试获取笔记列表（受保护路由）')
print('-' * 30)
resp = requests.get(f'{base_url}/api/notes', headers=headers)
print(f'状态码: {resp.status_code}')
if resp.status_code == 200:
    notes = resp.json()
    print(f'✅ 获取笔记列表成功，共 {len(notes)} 条笔记')
    for n in notes:
        print(f'  - {n["title"]} (ID: {n["id"]})')
else:
    print(f'❌ 获取笔记列表失败: {resp.json()}')

print('\n9. 测试更新笔记（受保护路由）')
print('-' * 30)
update_data = {'title': '更新后的标题', 'content': '更新后的内容'}
resp = requests.put(f'{base_url}/api/notes/{note_id}', json=update_data, headers=headers)
print(f'状态码: {resp.status_code}')
if resp.status_code == 200:
    updated = resp.json()
    print('✅ 更新笔记成功')
    print(f'  新标题: {updated["title"]}')
else:
    print(f'❌ 更新笔记失败: {resp.json()}')

print('\n10. 测试搜索笔记')
print('-' * 30)
resp = requests.get(f'{base_url}/api/notes?search=测试', headers=headers)
print(f'状态码: {resp.status_code}')
if resp.status_code == 200:
    notes = resp.json()
    print(f'✅ 搜索成功，找到 {len(notes)} 条匹配笔记')
else:
    print(f'❌ 搜索失败: {resp.json()}')

print('\n11. 测试删除笔记（受保护路由）')
print('-' * 30)
resp = requests.delete(f'{base_url}/api/notes/{note_id}', headers=headers)
print(f'状态码: {resp.status_code}')
if resp.status_code == 200:
    print('✅ 删除笔记成功')
else:
    print(f'❌ 删除笔记失败: {resp.json()}')

print('\n12. 测试用户登出')
print('-' * 30)
resp = requests.post(f'{base_url}/api/auth/logout', headers=headers)
print(f'状态码: {resp.status_code}')
if resp.status_code == 200:
    print(f'✅ 登出成功: {resp.json()["message"]}')
else:
    print(f'❌ 登出失败: {resp.json()}')

print('\n' + '=' * 50)
print('✅ 所有 API 测试通过！')
print('=' * 50)

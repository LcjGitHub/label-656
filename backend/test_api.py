import requests
import json
import tempfile
import os

BASE_URL = 'http://localhost:8000'

def test_all():
    print('=' * 60)
    print('后端 API 功能测试')
    print('=' * 60)
    print()

    # 1. 测试登录
    print('【1/6】测试登录')
    print('-' * 40)
    import uuid
    random_suffix = uuid.uuid4().hex[:8]
    username = f'testuser_{random_suffix}'
    login_data = {'username': username, 'password': 'test123456'}

    print(f'使用测试用户: {username}')
    try:
        print('尝试注册新用户...')
        register_data = {
            'username': username,
            'email': f'{username}@example.com',
            'password': 'test123456',
            'full_name': '测试用户'
        }
        response = requests.post(f'{BASE_URL}/api/auth/register', json=register_data)
        print(f'注册状态: {response.status_code}')
        if response.status_code in [200, 201]:
            print('注册成功，尝试登录...')
            response = requests.post(f'{BASE_URL}/api/auth/login', json=login_data)
            print(f'登录状态: {response.status_code}')
            if response.status_code == 200:
                token = response.json()['access_token']
                headers = {'Authorization': f'Bearer {token}'}
                print('✓ 登录成功，获取到Token')
            else:
                print(f'✗ 登录失败: {response.text}')
                return
        else:
            print(f'✗ 注册失败: {response.text}')
            # 尝试直接登录（如果用户已存在）
            print('尝试直接登录...')
            response = requests.post(f'{BASE_URL}/api/auth/login', json=login_data)
            if response.status_code == 200:
                token = response.json()['access_token']
                headers = {'Authorization': f'Bearer {token}'}
                print('✓ 直接登录成功')
            else:
                return
    except Exception as e:
        print(f'✗ 登录异常: {e}')
        import traceback
        traceback.print_exc()
        return
    print()

    # 2. 测试获取文件列表（包含上传者信息）
    print('【2/6】测试获取文件列表（包含上传者信息）')
    print('-' * 40)
    try:
        response = requests.get(f'{BASE_URL}/api/files', headers=headers)
        print(f'状态码: {response.status_code}')
        if response.status_code == 200:
            data = response.json()
            print(f'文件数量: {len(data)}')
            if len(data) > 0:
                first_file = data[0]
                print(f'第一个文件: {first_file["original_filename"]}')
                print(f'上传者ID: {first_file["user_id"]}')
                print(f'上传者姓名: {first_file.get("uploader_name", "未返回")}')
                if first_file.get("uploader_name"):
                    print('✓ 接口正确返回上传者信息')
                else:
                    print('✗ 接口未返回上传者姓名')
            else:
                print('⚠ 暂无文件，请先上传文件后再测试')
        else:
            print(f'✗ 错误: {response.text}')
    except Exception as e:
        print(f'✗ 异常: {e}')
    print()

    # 3. 测试公开静态访问是否已关闭
    print('【3/6】测试公开静态访问是否已关闭')
    print('-' * 40)
    try:
        response = requests.get(f'{BASE_URL}/uploads/test.jpg')
        print(f'/uploads/test.jpg 状态码: {response.status_code}')
        if response.status_code == 404 or response.status_code == 405:
            print('✓ 公开静态访问已关闭')
        else:
            print('✗ 公开静态访问可能还存在')
    except Exception as e:
        print(f'请求异常（预期）: {e}')
        print('✓ 公开静态访问已关闭')
    print()

    # 4. 测试未授权访问文件接口
    print('【4/6】测试未授权访问')
    print('-' * 40)
    try:
        response = requests.get(f'{BASE_URL}/api/files')
        print(f'未授权访问文件列表状态码: {response.status_code}')
        if response.status_code == 401:
            print('✓ 未授权访问被正确拦截')
        else:
            print('✗ 未授权访问未被拦截')
    except Exception as e:
        print(f'✗ 异常: {e}')
    print()

    # 5. 测试上传接口校验顺序
    print('【5/6】测试上传接口校验顺序')
    print('-' * 40)

    large_file = None
    exe_file = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.txt') as f:
            f.write(b'x' * (60 * 1024 * 1024))
            large_file = f.name

        with tempfile.NamedTemporaryFile(delete=False, suffix='.exe') as f:
            f.write(b'test')
            exe_file = f.name

        # 测试超大文件
        print('测试超大文件上传（60MB .txt）:')
        with open(large_file, 'rb') as f:
            files = [('files', ('large_file.txt', f, 'text/plain'))]
            response = requests.post(f'{BASE_URL}/api/files/upload', headers=headers, files=files)
        print(f'  状态码: {response.status_code}')
        result = response.json()
        print(f'  响应: {json.dumps(result, ensure_ascii=False)}')
        if '超过最大限制' in result.get('message', '') or (result.get('errors') and any('超过最大限制' in e for e in result['errors'])):
            print('  ✓ 超大文件返回大小超限提示')
        else:
            print('  ✗ 超大文件提示不正确')

        print()

        # 测试类型不支持
        print('测试不支持类型文件（.exe）:')
        with open(exe_file, 'rb') as f:
            files = [('files', ('test.exe', f, 'application/exe'))]
            response = requests.post(f'{BASE_URL}/api/files/upload', headers=headers, files=files)
        print(f'  状态码: {response.status_code}')
        result = response.json()
        print(f'  响应: {json.dumps(result, ensure_ascii=False)}')
        if '类型不支持' in result.get('message', '') or (result.get('errors') and any('类型不支持' in e for e in result['errors'])):
            print('  ✓ 不支持类型文件返回类型错误提示')
        else:
            print('  ✗ 不支持类型文件提示不正确')

        print()

        # 测试超大且类型不支持的文件
        print('测试超大且类型不支持（60MB .exe）:')
        with tempfile.NamedTemporaryFile(delete=False, suffix='.exe') as f:
            f.write(b'x' * (60 * 1024 * 1024))
            large_exe = f.name
        try:
            with open(large_exe, 'rb') as f:
                files = [('files', ('large.exe', f, 'application/exe'))]
                response = requests.post(f'{BASE_URL}/api/files/upload', headers=headers, files=files)
            print(f'  状态码: {response.status_code}')
            result = response.json()
            print(f'  响应: {json.dumps(result, ensure_ascii=False)}')
            if result.get('errors') and any('超过最大限制' in e for e in result['errors']):
                print('  ✓ 校验顺序正确：先检查大小')
            else:
                print('  ✗ 校验顺序可能有问题')
        finally:
            os.unlink(large_exe)

    finally:
        if large_file and os.path.exists(large_file):
            os.unlink(large_file)
        if exe_file and os.path.exists(exe_file):
            os.unlink(exe_file)

    print()

    # 6. 测试文档预览接口
    print('【6/6】测试文档预览接口')
    print('-' * 40)

    txt_file_id = None
    csv_file_id = None

    try:
        # 先上传一个 txt 文件
        print('上传测试文本文件...')
        with tempfile.NamedTemporaryFile(delete=False, suffix='.txt', mode='w', encoding='utf-8') as f:
            f.write('Hello World!\n这是一个测试文件。\n第三行内容。')
            test_txt = f.name

        with open(test_txt, 'rb') as f:
            files = [('files', ('test.txt', f, 'text/plain'))]
            response = requests.post(f'{BASE_URL}/api/files/upload', headers=headers, files=files)
        result = response.json()
        if result.get('files'):
            txt_file_id = result['files'][0]['id']
            print(f'✓ txt 上传成功，ID: {txt_file_id}')

            # 测试文档预览
            print('测试 txt 文档预览:')
            response = requests.get(f'{BASE_URL}/api/files/{txt_file_id}/preview-document', headers=headers)
            print(f'  状态码: {response.status_code}')
            if response.status_code == 200:
                data = response.json()
                print(f'  内容类型: {data.get("content_type")}')
                print(f'  内容: {data.get("content", "")[:50]}...')
                print('  ✓ txt 文档预览正常')
            else:
                print(f'  ✗ 预览失败: {response.text}')
        else:
            print('⚠ txt 上传失败，跳过预览测试')

        os.unlink(test_txt)
        print()

        # 上传一个 csv 文件
        print('上传测试 CSV 文件...')
        with tempfile.NamedTemporaryFile(delete=False, suffix='.csv', mode='w', encoding='utf-8') as f:
            f.write('姓名,年龄,城市\n张三,25,北京\n李四,30,上海\n王五,28,广州')
            test_csv = f.name

        with open(test_csv, 'rb') as f:
            files = [('files', ('test.csv', f, 'text/csv'))]
            response = requests.post(f'{BASE_URL}/api/files/upload', headers=headers, files=files)
        result = response.json()
        if result.get('files'):
            csv_file_id = result['files'][0]['id']
            print(f'✓ csv 上传成功，ID: {csv_file_id}')

            # 测试表格预览
            print('测试 csv 表格预览:')
            response = requests.get(f'{BASE_URL}/api/files/{csv_file_id}/preview-document', headers=headers)
            print(f'  状态码: {response.status_code}')
            if response.status_code == 200:
                data = response.json()
                print(f'  内容类型: {data.get("content_type")}')
                print(f'  表头: {data.get("headers")}')
                print(f'  行数: {data.get("total_rows")}, 列数: {data.get("total_columns")}')
                print(f'  第一行: {data.get("rows", [[]])[0]}')
                print('  ✓ csv 表格预览正常')
            else:
                print(f'  ✗ 预览失败: {response.text}')
        else:
            print('⚠ csv 上传失败，跳过预览测试')

        os.unlink(test_csv)

    except Exception as e:
        print(f'✗ 文档预览测试异常: {e}')
        import traceback
        traceback.print_exc()

    # 清理测试文件
    print()
    print('清理测试文件...')
    for file_id in [txt_file_id, csv_file_id]:
        if file_id:
            try:
                response = requests.delete(f'{BASE_URL}/api/files/{file_id}', headers=headers)
                print(f'  删除文件 {file_id}: {response.status_code}')
            except:
                pass

    print()
    print('=' * 60)
    print('后端 API 测试完成！')
    print('=' * 60)

if __name__ == '__main__':
    test_all()

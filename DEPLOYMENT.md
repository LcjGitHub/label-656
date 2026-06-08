# 笔记管理系统 Docker 部署文档

## 目录
- [系统架构](#系统架构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [环境变量配置](#环境变量配置)
- [服务说明](#服务说明)
- [数据持久化](#数据持久化)
- [常见问题](#常见问题)

---

## 系统架构

该笔记管理系统采用容器化部署，包含以下三个服务：

| 服务 | 镜像/构建 | 端口 | 说明 |
|------|-----------|------|------|
| `db` | postgres:16-alpine | 内部 5432 | PostgreSQL 数据库 |
| `backend` | 本地构建 (Python 3.11) | 内部 8000 | FastAPI 后端服务 |
| `frontend` | 本地构建 (nginx:alpine) | 宿主 8080:80 | React 前端 + Nginx 反向代理 |

所有服务通过 `notes-network` 桥接网络互联。

---

## 环境要求

- **Docker Engine**: >= 20.10
- **Docker Compose**: >= 2.0
- **磁盘空间**: >= 2GB（含镜像和数据卷）
- **内存**: >= 2GB

---

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd label-656
```

### 2. 配置环境变量（可选）

在项目根目录创建 `.env` 文件（如不需要自定义，可跳过此步，使用默认值）：

```bash
# .env
POSTGRES_DB=notes_app
POSTGRES_USER=notes_user
POSTGRES_PASSWORD=your_secure_password_here
FRONTEND_BASE_URL=http://localhost:8080
WEB_PORT=8080
```

### 3. 启动所有服务

```bash
docker compose up -d --build
```

首次执行会自动构建前后端镜像并拉取 PostgreSQL 镜像，需要等待几分钟。

### 4. 验证服务状态

```bash
docker compose ps
```

正常输出应显示三个服务状态均为 `Up (healthy)`：

```
NAME                 IMAGE               COMMAND                  SERVICE             CREATED             STATUS                    PORTS
label-656-backend-1  label-656-backend   "uvicorn main:app --…"   backend             30 seconds ago      Up 27 seconds (healthy)   8000/tcp
label-656-db-1       postgres:16-alpine  "docker-entrypoint.s…"   db                  35 seconds ago      Up 33 seconds (healthy)   5432/tcp
label-656-frontend-1 label-656-frontend  "/docker-entrypoint.…"   frontend            30 seconds ago      Up 27 seconds (healthy)   0.0.0.0:8080->80/tcp
```

### 5. 访问应用

打开浏览器访问：**http://localhost:8080**

### 6. 查看日志

```bash
# 查看所有服务日志
docker compose logs -f

# 仅查看后端日志
docker compose logs -f backend

# 仅查看数据库日志
docker compose logs -f db
```

### 7. 停止服务

```bash
docker compose down
```

如需同时删除数据卷（谨慎操作，会删除所有数据）：

```bash
docker compose down -v
```

---

## 环境变量配置

可在项目根目录 `.env` 文件中配置以下变量：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `POSTGRES_DB` | `notes_app` | PostgreSQL 数据库名 |
| `POSTGRES_USER` | `notes_user` | PostgreSQL 用户名 |
| `POSTGRES_PASSWORD` | `notes_password_123` | PostgreSQL 密码（生产环境必须修改） |
| `FRONTEND_BASE_URL` | `http://localhost:8080` | 前端访问地址，用于生成笔记分享链接 |
| `WEB_PORT` | `8080` | 前端 Nginx 映射到宿主机的端口 |

---

## 服务说明

### 后端服务 (backend)

- **基础镜像**: python:3.11-slim（多阶段构建优化）
- **运行用户**: `appuser`（非 root，提升安全性）
- **健康检查**: 每 30 秒请求 `/api/health`，验证服务和数据库连接
- **进程管理**: uvicorn 2 个 worker 进程
- **暴露端口**: 8000（仅内部网络）

### 前端服务 (frontend)

- **构建阶段**: node:20-alpine（编译 React + Vite）
- **运行阶段**: nginx:alpine（托管静态资源 + 反向代理）
- **反向代理规则**:
  - `/api/*` → `http://backend:8000/api/*`
  - `/uploads/*` → `http://backend:8000/uploads/*`
  - 其他路径 → 单页应用 `index.html`（支持 React Router）
- **Gzip 压缩**: 启用，减少传输体积
- **最大上传**: 50MB

### 数据库服务 (db)

- **镜像**: postgres:16-alpine
- **健康检查**: 使用 `pg_isready` 验证数据库就绪
- **数据持久化**: 通过 `postgres_data` 卷持久化

---

## 数据持久化

以下 Docker 卷用于数据持久化，停止或删除容器不会丢失数据：

| 卷名 | 挂载路径 | 内容 |
|------|----------|------|
| `postgres_data` | `/var/lib/postgresql/data` | PostgreSQL 数据库文件 |
| `uploads_data` | `/app/uploads` | 用户上传的文件和导出文件 |

### 备份数据库

```bash
# 创建数据库备份
docker compose exec db pg_dump -U notes_user notes_app > backup_$(date +%Y%m%d).sql
```

### 恢复数据库

```bash
# 从备份恢复
docker compose exec -T db psql -U notes_user notes_app < backup_20260608.sql
```

### 备份上传文件

```bash
# 将上传文件从数据卷复制到宿主机
docker run --rm -v label-656_uploads_data:/data -v $(pwd):/backup alpine tar czf /backup/uploads_backup.tar.gz -C /data .
```

---

## 常见问题

### 1. 服务启动后访问 502 Bad Gateway

这通常是后端服务尚未完全启动。请等待健康检查通过后再访问，可使用以下命令查看状态：

```bash
docker compose ps
```

如后端一直不健康，查看日志排查原因：

```bash
docker compose logs backend
```

### 2. 数据库连接失败

确保数据库服务已启动并通过健康检查：

```bash
docker compose ps db
```

如果 `DATABASE_URL` 环境变量被自定义，请确认格式正确：

```
postgresql+psycopg2://用户名:密码@主机:端口/数据库名
```

### 3. 文件上传失败（413 Request Entity Too Large）

Nginx 默认限制已设为 50MB。如需更大限制，修改 `frontend/nginx.conf` 中的 `client_max_body_size`，然后重启前端服务：

```bash
docker compose up -d --build frontend
```

### 4. 如何更新代码？

```bash
# 拉取最新代码
git pull

# 重新构建并启动服务
docker compose up -d --build
```

### 5. 生产环境部署建议

- **修改默认密码**: 务必修改 `POSTGRES_PASSWORD`
- **配置 HTTPS**: 使用 Nginx 反向代理 + Let's Encrypt，或在已有负载均衡器上配置
- **资源限制**: 在 `docker-compose.yml` 中为各服务添加 `deploy.resources.limits` 限制 CPU/内存
- **定期备份**: 设置定时任务自动备份数据库和上传文件
- **日志轮转**: 配置 Docker daemon 的日志驱动限制日志文件大小

---

## 命令速查表

| 操作 | 命令 |
|------|------|
| 构建并启动 | `docker compose up -d --build` |
| 停止服务 | `docker compose down` |
| 停止并删除数据 | `docker compose down -v` |
| 查看状态 | `docker compose ps` |
| 查看日志 | `docker compose logs -f [服务名]` |
| 重启单个服务 | `docker compose restart backend` |
| 进入后端容器 | `docker compose exec backend bash` |
| 进入数据库 | `docker compose exec db psql -U notes_user notes_app` |

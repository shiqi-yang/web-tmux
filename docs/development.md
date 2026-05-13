# 开发与部署指南

## 环境要求

- Node.js >= 18
- tmux >= 3.0（需在 PATH 中）
- Python 3 / make / gcc（node-pty 编译原生模块需要）

## 安装依赖

```bash
cd server && npm install
cd ../client && npm install
```

## 开发启动

### 首次启动（初始化管理员账号）

```bash
cd server
ADMIN_USER=admin ADMIN_PASSWORD=yourpassword node index.js
```

`users.json` 创建完成后，后续无需再传环境变量。

### 日常开发

```bash
# 终端 1：启动后端（默认监听 3000 端口）
cd server && node index.js

# 终端 2：启动前端开发服务（默认 5173 端口）
cd client && npm run dev
```

前端 Vite 开发服务器将以下路径代理到后端：

| 路径前缀 | 代理目标 |
|----------|----------|
| `/api` | `http://localhost:3000` |
| `/auth` | `http://localhost:3000` |
| `/ws` | `ws://localhost:3000` |

访问 `http://localhost:5173` 即可使用，首次访问会跳转登录页。

## 生产部署

```bash
# 构建前端静态文件
cd client && npm run build
# 产物输出到 client/dist/

# 启动后端（自动托管 client/dist，单端口对外）
cd server && NODE_ENV=production node index.js
```

生产模式下后端直接托管前端静态文件，只需暴露一个端口（默认 3000）。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 后端监听端口 |
| `JWT_SECRET` | 随机生成（重启失效） | JWT 签名密钥，生产环境务必显式设置 |
| `ADMIN_USER` | — | 初始化时创建的管理员用户名 |
| `ADMIN_PASSWORD` | — | 初始化时创建的管理员密码 |

> **生产环境注意**：务必通过环境变量或 `.env` 文件显式设置 `JWT_SECRET`，否则每次重启后所有已登录用户的 token 将失效。

## 建议的 nginx 反向代理配置

生产环境建议通过 nginx 终止 TLS，转发到后端：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    # TLS 证书配置...

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

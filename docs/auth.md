# 认证模块

## 认证流程

```
┌──────────┐          ┌──────────────────┐          ┌──────────────┐
│ Browser  │          │  Express /auth   │          │  users.json  │
└────┬─────┘          └────────┬─────────┘          └──────┬───────┘
     │  POST /auth/login        │                           │
     │  { username, password }  │                           │
     │─────────────────────────>│  bcrypt.compare()         │
     │                          │──────────────────────────>│
     │                          │<──────────────────────────│
     │                          │  JWT 签发 (7d 有效期)      │
     │<─────────────────────────│                           │
     │  { token }               │                           │
     │                          │                           │
     │  GET /api/sessions       │                           │
     │  Authorization: Bearer <token>                       │
     │─────────────────────────>│  verifyJWT middleware     │
     │                          │  校验通过 → 继续处理        │
     │<─────────────────────────│                           │
     │  sessions 列表            │                           │
     │                          │                           │
     │  WS ws://...?token=<jwt> │                           │
     │─────────────────────────>│  upgrade 前校验 token      │
     │  连接建立                 │  失败 → 401 拒绝升级        │
```

## 校验规则

- **登录页**（`/login.html`）和 `/auth/login` 接口不需要认证，其余全部需要
- 所有 `/api/*` 接口：Express 中间件检查 `Authorization: Bearer <token>`
- WebSocket 升级：从 URL query string 取 `?token=<jwt>` 校验，失败则返回 401 拒绝 upgrade
- Token 存储在浏览器 `localStorage`，401 响应或 token 缺失时自动跳转 `/login.html`

## 用户存储

用户数据持久化在 `server/users.json`，密码使用 bcrypt hash（cost factor 12）。

```jsonc
// users.json 结构示例
[
  {
    "username": "admin",
    "passwordHash": "$2b$12$...",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

## 初始管理员账号

首次启动时若 `users.json` 不存在，自动从环境变量创建默认管理员：

```bash
ADMIN_USER=admin ADMIN_PASSWORD=yourpassword node index.js
```

若环境变量未设置且文件不存在，服务启动失败并打印提示信息。

## 服务端模块职责

### `auth.js`

- `signToken(username)` — 签发 JWT，payload 含 `{ username, iat, exp }`
- `verifyToken(token)` — 校验并解码 token，抛出异常表示失效
- `requireAuth` — Express 中间件，从 `Authorization` 头提取并校验 token
- `upgradeAuth(req)` — WebSocket upgrade 前的 token 校验，返回 decoded payload 或 null

### `users.js`

- `loadUsers()` / `saveUsers()` — 读写 `users.json`
- `findUser(username)` — 按用户名查找
- `createUser(username, password)` — bcrypt hash 后写入
- `deleteUser(username)` — 从列表移除并持久化
- `verifyPassword(username, password)` — bcrypt 比对，返回布尔值

# API 参考

## HTTP API

所有 `/api/*` 接口均需在请求头携带有效 JWT：

```
Authorization: Bearer <token>
```

### 认证

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/auth/login` | 否 | 登录，返回 `{ token }` |

**POST /auth/login**

```jsonc
// 请求体
{ "username": "admin", "password": "yourpassword" }

// 成功响应 200
{ "token": "<jwt>" }

// 失败响应 401
{ "error": "Invalid username or password" }
```

### Sessions

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions` | 列出所有 tmux sessions |
| POST | `/api/sessions` | 创建新 session |
| DELETE | `/api/sessions/:name` | 关闭指定 session |

**GET /api/sessions**

```jsonc
// 响应 200
{
  "sessions": [
    { "name": "main", "windows": 2, "created": "2024-01-01 12:00:00" }
  ]
}
```

**POST /api/sessions**

```jsonc
// 请求体
{ "name": "my-session" }

// 成功响应 201
{ "name": "my-session" }

// 失败响应 409（session 已存在）
{ "error": "Session already exists" }
```

**DELETE /api/sessions/:name**

```jsonc
// 成功响应 204（无响应体）

// 失败响应 404
{ "error": "Session not found" }
```

### 用户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 列出所有用户（隐藏密码哈希） |
| POST | `/api/users` | 创建用户 |
| DELETE | `/api/users/:username` | 删除用户（不能删除自己） |

**GET /api/users**

```jsonc
// 响应 200
{
  "users": [
    { "username": "admin", "createdAt": "2024-01-01T00:00:00.000Z" }
  ]
}
```

**POST /api/users**

```jsonc
// 请求体
{ "username": "alice", "password": "securepassword" }

// 成功响应 201
{ "username": "alice" }

// 失败响应 409（用户已存在）
{ "error": "User already exists" }
```

**DELETE /api/users/:username**

```jsonc
// 成功响应 204（无响应体）

// 失败响应 403（不能删除自己）
{ "error": "Cannot delete yourself" }

// 失败响应 404
{ "error": "User not found" }
```

---

## WebSocket 协议

连接地址：`ws://<host>/ws?token=<jwt>`

Token 校验失败时，服务端拒绝 HTTP upgrade，返回 401。

### 消息格式

控制消息使用 **JSON 文本帧**，终端数据使用 **Binary 帧（ArrayBuffer）**：

- 收到文本帧 → JSON 控制消息
- 收到二进制帧 → 键盘输入数据，直接写入 PTY
- 发出文本帧 → JSON 控制消息
- 发出二进制帧 → PTY 原始输出，含 ANSI 转义序列

### 客户端 → 服务端

```jsonc
// 附加到已有 session
{ "type": "attach", "sessionName": "main" }

// 终端尺寸变化
{ "type": "resize", "cols": 220, "rows": 50 }
```

```
// 键盘输入：直接发 Binary 帧
ArrayBuffer  // UTF-8 编码的按键字节
```

### 服务端 → 客户端

```jsonc
// 当前 session 列表（连接建立后立即推送一次，之后有变化时再推送）
{
  "type": "sessions",
  "list": [
    { "name": "main", "windows": 2, "created": "2024-01-01 12:00:00" }
  ]
}

// 附加成功
{ "type": "attached", "sessionName": "main" }

// 错误通知
{ "type": "error", "message": "Session not found" }
```

```
// PTY 输出：直接发 Binary 帧
ArrayBuffer  // 原始终端字节流，含 ANSI/VT100 转义序列
```

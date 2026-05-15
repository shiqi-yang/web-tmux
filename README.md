# tmux-proxy

> **这是一个最小 POC（概念验证原型），不适合直接用于生产环境。**

在浏览器里查看、启动并与 tmux session 交互的全栈系统。

## 部署

**依赖环境**：Node.js 18+、tmux、autossh（SSH 隧道可选）

```bash
# 1. 安装依赖
cd server && npm install
cd ../client && npm install

# 2. 启动（首次运行会自动创建管理员账号）
ADMIN_USER=admin ADMIN_PASSWORD=yourpassword bash start.sh
```

可通过环境变量配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ADMIN_USER` | `yang` | 管理员用户名 |
| `ADMIN_PASSWORD` | — | 管理员密码（首次启动必填） |
| `BACKEND_PORT` | `18080` | 后端端口 |
| `FRONTEND_PORT` | `18081` | 前端端口 |

启动后访问 `http://localhost:18081`。

## 使用

**登录**：用管理员账号登录，也可在页面内创建更多用户。

**Session 管理**（左侧边栏）：

| 操作 | 方式 |
|------|------|
| 新建 session | 在底部输入名称后点 `+` |
| 切换 session | 点击列表中的 session 名 |
| 重命名 | 点 `✎` 后输入新名称，回车确认 |
| 删除 | 点 `✕` |
| 设为默认（下次自动连接）| 点 `★` |

**键盘透传**（工具栏 `⌨` 按钮）：

- **开**（蓝色高亮）：键盘直接输入到 tmux，命令栏隐藏
- **关**：显示命令输入框，在框中输入后点"发送"或回车

**快捷键栏**（移动端底部）：内置常用按键（方向键、Ctrl+C/D/Z 等），长按自定义按钮可删除，点 `＋` 新增自定义快捷键。

**字体大小**：工具栏 `A-` / `A+` 调整，设置自动持久化。

## 文档

| 文档 | 内容 |
|------|------|
| [架构总览](docs/architecture.md) | 系统结构图、技术栈、目录结构 |
| [认证模块](docs/auth.md) | JWT 登录流程、用户存储、模块职责 |
| [API 参考](docs/api.md) | HTTP API + WebSocket 通信协议 |
| [PTY 实现](docs/pty.md) | PTY 附加方式、Resize 处理、Session 生命周期 |
| [开发与部署](docs/development.md) | 本地启动、生产部署、环境变量、nginx 配置 |

## 后续可扩展方向

- [ ] 多用户隔离（每用户独立 tmux socket）
- [ ] Session 持久化配置（启动时自动恢复上次的 session 列表）
- [ ] 移动端虚拟键盘适配
- [ ] HTTPS / WSS 支持（建议通过 nginx 反向代理终止 TLS）

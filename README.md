# tmux-proxy

> **这是一个最小 POC（概念验证原型），不适合直接用于生产环境。**

在浏览器里查看、启动并与 tmux session 交互的全栈系统。

## 文档

| 文档 | 内容 |
|------|------|
| [架构总览](docs/architecture.md) | 系统结构图、技术栈、目录结构 |
| [认证模块](docs/auth.md) | JWT 登录流程、用户存储、模块职责 |
| [API 参考](docs/api.md) | HTTP API + WebSocket 通信协议 |
| [PTY 实现](docs/pty.md) | PTY 附加方式、Resize 处理、Session 生命周期 |
| [开发与部署](docs/development.md) | 本地启动、生产部署、环境变量、nginx 配置 |

## 快速开始

```bash
# 安装依赖
cd server && npm install
cd ../client && npm install

# 首次启动（创建管理员账号）
cd server && ADMIN_USER=admin ADMIN_PASSWORD=yourpassword node index.js

# 前端开发服务
cd client && npm run dev
# 访问 http://localhost:5173
```

## 后续可扩展方向

- [ ] 多用户隔离（每用户独立 tmux socket）
- [ ] Session 持久化配置（启动时自动恢复上次的 session 列表）
- [ ] 移动端虚拟键盘适配
- [ ] HTTPS / WSS 支持（建议通过 nginx 反向代理终止 TLS）

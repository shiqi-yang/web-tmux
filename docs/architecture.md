# 架构总览

## 系统结构图

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  ┌──────────────┐   ┌──────────────────────────────────┐   │
│  │  Session 列表 │   │  Terminal (xterm.js)              │   │
│  │  - 新建       │   │  实时渲染 PTY 输出                 │   │
│  │  - 切换       │   │  键盘输入 → WebSocket → 后端       │   │
│  │  - 关闭       │   │                                  │   │
│  └──────┬───────┘   └──────────────┬───────────────────┘   │
│         │                          │  WebSocket             │
└─────────┼──────────────────────────┼─────────────────────────┘
          │                          │
┌─────────▼──────────────────────────▼─────────────────────────┐
│  Node.js Backend                                            │
│  ┌─────────────────┐   ┌────────────────────────────────┐   │
│  │  Express HTTP   │   │  WebSocket Server (ws)         │   │
│  │  - /auth/*      │   │  - 每个连接对应一个 tmux pane   │   │
│  │  - /api/        │   │  - 转发 PTY 输出到浏览器        │   │
│  │    sessions     │   │  - 转发键盘输入到 PTY           │   │
│  │  - /api/        │   │  - resize 事件处理              │   │
│  │    users        │   └────────────┬───────────────────┘   │
│  └────────┬────────┘                │                        │
│           │  auth middleware        │                        │
│  ┌────────▼────────────────────────▼───────────────────┐   │
│  │  PTY Manager                                         │   │
│  │  - 维护 sessionName → Set<pty> 的 Map                │   │
│  │  - 启动: tmux new-session -d -s <name>               │   │
│  │  - 附加: tmux attach-session -t <name>  (via pty)    │   │
│  │  - 终止: tmux kill-session -t <name>                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 技术栈

| 层 | 技术 | 用途 |
|----|------|------|
| 前端终端渲染 | [xterm.js](https://xtermjs.org/) | 在浏览器里渲染 VT100/xterm 转义序列 |
| 前端 resize | xterm.js FitAddon | 自动适配终端尺寸 |
| 前端框架 | Vanilla JS + Vite | 轻量，无额外依赖 |
| 实时通信 | WebSocket (`ws`) | 低延迟双向数据流 |
| 后端框架 | Express | HTTP API + 静态文件托管 |
| PTY | `node-pty` | 创建伪终端，运行 tmux attach |
| 进程管理 | 内置 Map | 管理多个 PTY 实例 |
| 认证 | JWT (`jsonwebtoken`) + bcrypt | 用户名/密码登录，Token 校验 |

## 目录结构

```
tmux-proxy/
├── server/
│   ├── index.js          # Express + WebSocket 服务入口
│   ├── ptyManager.js     # PTY 实例生命周期管理
│   ├── auth.js           # JWT 签发与校验中间件
│   ├── users.js          # 用户存储（bcrypt 哈希，JSON 文件持久化）
│   └── package.json
├── client/
│   ├── index.html        # 主页面（已登录时显示终端，否则跳登录页）
│   ├── login.html        # 登录页面
│   ├── main.js           # 前端逻辑：session 列表 + xterm.js
│   ├── login.js          # 登录表单逻辑
│   ├── style.css
│   └── package.json      # xterm.js、vite 依赖
├── docs/
│   ├── architecture.md   # 本文档
│   ├── auth.md           # 认证模块设计
│   ├── api.md            # HTTP API + WebSocket 协议
│   ├── pty.md            # PTY / tmux 实现细节
│   └── development.md    # 开发与部署指南
└── README.md
```

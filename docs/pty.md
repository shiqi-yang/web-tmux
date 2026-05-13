# PTY 与 tmux 实现细节

## PTY 附加方式

不直接控制 tmux 服务进程，而是为**每个 WebSocket 连接**单独 spawn 一个附加进程：

```
node-pty  →  tmux attach-session -t <sessionName>
```

这样做有两个关键好处：
1. **多客户端**：多个浏览器 Tab 可同时查看同一 session，tmux 服务端负责状态同步
2. **会话保持**：WebSocket 断开后 tmux session 继续在后台运行，重连后可恢复

## PTY Manager 数据结构

```
sessionPtys: Map<sessionName, Set<pty>>
```

同一 session 可挂载多个 PTY 实例（每个 WS 连接一个）。session 被 kill 时，批量调用 `pty.kill()` 清理全部实例。

```
┌──────────────────────────────────────┐
│  sessionPtys                         │
│  "main"  →  { pty_A, pty_B, pty_C } │  ← 3个浏览器Tab同时查看
│  "logs"  →  { pty_D }               │
└──────────────────────────────────────┘
```

## PTY 生命周期

```
WS 连接建立
    │
    ├─ 收到 { type: "attach", sessionName }
    │       │
    │       ├─ tmux has-session -t <name> ?
    │       │     否 → 发 error，结束
    │       │
    │       └─ pty = node-pty.spawn("tmux", ["attach-session", "-t", name])
    │             │
    │             ├─ pty.onData  → WS.send(binary)   // 输出转发到浏览器
    │             ├─ pty.onExit  → 从 Map 移除，发 sessions 更新
    │             └─ 写入 sessionPtys[name]
    │
    ├─ 收到 binary frame
    │       └─ pty.write(data)                        // 键盘输入写入 PTY
    │
    ├─ 收到 { type: "resize", cols, rows }
    │       └─ 见下节
    │
    └─ WS 关闭
            └─ pty.kill()，从 sessionPtys[name] 移除
```

## Resize 处理

xterm.js FitAddon 在容器尺寸变化时计算出 `{ cols, rows }`，之后：

1. 前端通过 WebSocket 发送 `{ type: "resize", cols, rows }`
2. 后端调用 `pty.resize(cols, rows)` 更新 PTY 窗口尺寸
3. 后端执行 `tmux resize-window -t <name> -x <cols> -y <rows>` 同步 tmux 窗口

> 步骤 3 确保 tmux 侧的窗口尺寸与 PTY 一致，避免 ncurses 类程序（如 vim、htop）布局错乱。

## 创建与销毁 Session

**创建**（对应 `POST /api/sessions`）：

```bash
tmux new-session -d -s <name>
# -d: 后台运行，不附加到当前终端
```

创建成功后向所有在线 WebSocket 连接广播更新后的 session 列表。

**销毁**（对应 `DELETE /api/sessions/:name`）：

```bash
tmux kill-session -t <name>
```

销毁前先调用 `sessionPtys[name]` 中所有 pty 实例的 `.kill()`，再从 Map 中删除条目。

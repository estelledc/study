---
title: Hermes Agent Web/Mobile UI — 零基础学习笔记
来源: https://github.com/nesquena/hermes-webui
日期: 2026-06-13
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

## 1. 日常类比：给 AI 助手装个"遥控面板"

想象一下，你有一个聪明的助手（Hermes Agent），它住在你的服务器上，能干很多事：写代码、查文件、定时执行任务。但问题是，你只能通过黑色终端窗口（命令行）来指挥它，就像只能通过对讲机跟它说话。

Hermes WebUI 做的事情就是给这个助手装了一个网页版的"遥控面板"。你在浏览器里打开它，就能像用聊天软件一样跟 AI 对话，还能看到它做了什么、浏览服务器上的文件、管理历史对话。最酷的是，你的手机也能访问，相当于随时随地的遥控器。

这个项目的核心口号是：**"没有构建步骤，没有框架，没有打包器。只有 Python 和原生 JavaScript。"**

## 2. 核心概念

### 2.1 什么是"Agent"？

Agent（智能体）不是简单的聊天机器人。普通聊天机器人你问一句它答一句，聊完就忘。而 Hermes Agent 有记忆，它会记住你的项目结构、你的编程习惯、你之前做过的事。即使你关掉终端再打开，它还记得上下文。

### 2.2 三栏布局

WebUI 的界面分成三个部分：

| 面板 | 位置 | 功能 |
|------|------|------|
| 会话列表 | 左侧 | 管理所有对话（创建、搜索、归档、分组） |
| 聊天区 | 中间 | 主要的对话区域，AI 的回答会流式显示 |
| 文件浏览器 | 右侧 | 浏览和编辑服务器上的文件 |

### 2.3 技术栈：极简主义

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端 | Python stdlib（http.server） | 不用 Flask、不用 Django，只用 Python 标准库 |
| 前端 | 原生 JavaScript + CSS | 不用 React、不用 Vue，纯手写 |
| 通信 | SSE（Server-Sent Events） | 服务器主动推送到浏览器的单向流式通信 |
| 部署 | 可直接运行或 Docker | 一条命令启动 |

SSE 是什么呢？你可以把它想象成"新闻推送"——一旦 AI 开始回答，回答会一个字一个字地"推"到浏览器上，你就能看到实时打字效果，不用等整个回答完成。

### 2.4 会话持久化

每个对话都会自动保存到磁盘上的 JSON 文件中。即使你关闭浏览器、重启服务器，下次打开还能找到所有历史对话。这就像你的微信聊天记录，不会因为你关了 app 就消失。

## 3. 代码示例

### 示例 1：启动服务器（后端核心）

下面这段代码来自 `server.py`，是 Hermes WebUI 的服务器入口。它展示了如何用不到 50 行 Python 标准库代码搭建一个完整的 HTTP 服务器：

```python
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    timeout = 30  # 空闲30秒的连接自动断开

    def do_GET(self):
        # 解析请求路径，比如 /api/chat/stream
        parsed = urlparse(self.path)
        # 检查用户是否已登录（如果有密码保护）
        if not check_auth(self, parsed):
            return
        # 根据路径分发到不同的处理函数
        result = handle_get(self, parsed)
        if result is False:
            return j(self, {'error': 'not found'}, status=404)

    def do_POST(self):
        # 处理发消息、创建会话等写操作
        result = handle_post(self, parsed)
```

这里的关键点：
- `ThreadingHTTPServer` 意味着每个请求在独立的线程中处理，你可以同时打开多个对话
- `do_GET` / `do_POST` 是 HTTP 的基本方法：GET 用来获取数据，POST 用来提交数据
- 所有路由逻辑都在 `handle_get` 和 `handle_post` 中用 `if/elif` 链判断，不用任何路由框架

### 示例 2：流式对话（SSE 引擎）

这是 WebUI 最有趣的部分——当你按下发送按钮后，对话是如何实时流式传输的：

```python
# 浏览器按下"发送"后，先调用这个接口创建一条消息
# POST /api/chat/start
# 服务器立即返回一个 stream_id
stream_id = str(uuid4().hex)
queue = Queue()  # 创建一个消息队列
STREAMS[stream_id] = queue

# 在一个后台线程中运行 AI 代理
threading.Thread(
    target=_run_agent_streaming,
    args=(session_id, msg_text, model, workspace, stream_id),
    daemon=True
).start()

# 浏览器同时打开这个 SSE 连接
# GET /api/chat/stream?stream_id=xxx
# 浏览器会一直"挂着"这个连接，等待服务器推送数据

# SSE 事件类型：
# token    -> 推送到浏览器的文字片段（实现"打字机"效果）
# tool     -> AI 调用了工具（比如执行了 ls 命令）
# approval -> AI 请求用户确认一个危险操作
# done     -> AI 回答完成，返回完整的会话数据
# error    -> 出错了
```

这个设计的巧妙之处在于**两个并行通道**：浏览器同时发起一个 POST 请求（发消息）和一个 GET 请求（等回复）。POST 很快返回，GET 则保持打开状态，服务器有新数据就推过来。

## 4. 关键功能一览

**对话功能**
- 流式响应：AI 回答一个字一个字显示
- 编辑历史消息：可以修改之前发过的消息，然后重新生成
- 工具调用卡片：AI 执行的每个操作都展示为可展开的卡片
- 代码块复制：一键复制代码片段
- 语音输入：浏览器麦克风直接转文字

**会话管理**
- 创建、重命名、复制、删除、搜索会话
- 会话归档（隐藏但不删除）
- 会话分组（按项目、按日期）
- 标签和星标

**安全**
- 可选密码保护
- Passkey（WebAuthn）支持
- 安全头（防止点击劫持等攻击）
- 文件路径遍历保护（`../../etc/passwd` 会被拒绝）

**部署**
- 直接运行：`python3 bootstrap.py` 或 `./start.sh`
- Docker 一键部署
- SSH 隧道远程访问
- 手机浏览器也能用（响应式设计）

## 5. 架构总览

```
浏览器
  │
  ├─ GET /              → 静态页面（HTML + CSS + JS）
  ├─ POST /api/chat/start → 发送消息，创建流
  ├─ GET  /api/chat/stream → 接收流式回复（SSE）
  ├─ GET  /api/list      → 浏览文件目录
  ├─ POST /api/upload    → 上传文件
  └─ GET  /api/sessions  → 获取会话列表

server.py（路由壳）
  │
  └─ api/（业务逻辑）
       ├── routes.py    → 所有请求处理
       ├── streaming.py → SSE 引擎 + AI 代理调用
       ├── models.py    → 会话数据模型
       ├── workspace.py → 文件操作
       ├── auth.py      → 认证
       └── config.py    → 配置加载
```

整个项目的代码量不小（超过 17,000 行 Python + JS），但结构非常清晰：后端只负责"接收请求、处理逻辑、返回结果"，前端只负责"渲染界面、发送请求、处理事件"。中间的通信靠 JSON 和 SSE 两种格式。

## 6. 为什么这个项目值得学习

对于零基础学习者来说，Hermes WebUI 是一个**完美的学习对象**，原因有三：

第一，**技术栈简单**。不用学习 React 的生命周期、不用配置 Webpack、不用处理 npm 依赖冲突。Python 标准库 + 原生 JS，每一行代码你都能直接理解。

第二，**架构完整**。虽然技术简单，但它实现了完整的 Web 应用：用户认证、数据持久化、流式通信、文件上传、前后端交互。学完后你具备了理解任何现代 Web 应用的基础。

第三，**与真实 AI Agent 对接**。它不是空壳 demo，而是连接了真实可运行的 Hermes Agent——一个能写代码、能执行命令、能定时任务的自主 AI 助手。这让你理解了 AI Agent 从"对话界面"到"实际行动"的完整链路。

## 7. 快速上手

在项目目录中执行：

```bash
git clone https://github.com/nesquena/hermes-webui.git
cd hermes-webui
python3 bootstrap.py
```

`bootstrap.py` 会做以下几件事：自动检测或安装 Hermes Agent、创建 Python 虚拟环境、安装依赖、启动服务器（默认端口 8787）、在浏览器中打开界面。整个过程只需要一条命令。

启动后访问 `http://127.0.0.1:8787` 即可使用。如果需要从手机或另一台电脑访问，可以通过 SSH 隧道：

```bash
ssh -N -L 8787:127.0.0.1:8787 user@your-server
```

## 8. 思考题

这篇文章没有留作业，但你可以带着以下问题继续探索：

1. SSE（服务器推送事件）和 WebSocket 有什么区别？为什么这个项目选择了 SSE 而不是 WebSocket？
2. `server.py` 中用 `os.environ` 传递环境变量给 AI Agent，这种方式在多线程环境下有什么隐患？
3. 如果把 `api/` 下的每个模块都拆成独立的文件（当前 `routes.py` 已经超过 9000 行），你会怎么划分？

带着这些问题去读代码，你会比直接读文档收获更多。

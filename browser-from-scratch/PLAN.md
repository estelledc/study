# 从零写浏览器：长期路线图（详细版 v2）

**起点**：2026-05-22
**修订**：2026-05-22 v2（详细版，资源已验证）
**目标**：成为浏览器领域的**生产级贡献者 / 子系统专家**——能给 Chromium / WebKit / Ladybird / Servo 提核心 PR，深入吃透 1-2 个子系统。
**总投入预期**：7-10 年持续投入，每周 5-15 小时。
**核心加持**：Claude Code 全程协作。每阶段 CC 角色不同。

---

## 0. 现实校准

| 事实 | 数据来源 |
|---|---|
| Chromium 代码量 | ~3500 万行，1000+ 全职工程师，20 年历史 |
| Ladybird 代码量 | C++ 为主，正在迁 Rust，Alpha 2026 首发，8 全职 + 志愿者 |
| Servo 代码量 | Rust，~50 万行级别 |
| browser.engineering 教学浏览器 | ~3000 行 Python（含 Part 4 高级特性） |
| Crafting Interpreters Lox | ~2000 行 Java + ~3000 行 C |

**单人写到 Chrome 级别 = 不可能**——CC 让单人产出提 10-100 倍，但还差三个量级。
**修正后目标 = 深入贡献到生产级浏览器**——可行，需 7-10 年。

---

## 1. 路线图总览

| 阶段 | 主题 | 时间 | 主资源 | 产出 |
|---|---|---|---|---|
| 0 | 起步 + 环境 | 1-2 周 | browser.engineering Ch 1 | Python 环境、第一段代码、立总契约 |
| 1 | 玩具浏览器（Python） | 6-9 个月 | browser.engineering 16 章 | ~3000 行 Python 浏览器 |
| 2 | JS 解释器原理（Java） | 2-3 个月 | Crafting Interpreters Part II | ~2000 行 Java 树遍历解释器 |
| 3 | JS 引擎进阶 + C 入门 | 4-6 个月 | Crafting Interpreters Part III | ~3000 行 C 字节码 VM |
| 4 | 真生产级浏览器导读 | 2-3 个月 | Ladybird + Servo + Rust Book | 本地编译运行、模块导读笔记 |
| 5 | 第一波贡献 | 6-12 个月 | Ladybird issue tracker + Discord | 5-10 个 merged PR |
| 6 | 子系统专精 | 2-3 年 | 选定方向 | 子系统级贡献 / 演讲 / 博客 |
| 7（可选） | Chromium / WebKit | 2-3 年+ | 上游文档 + 邮件列表 | committer 资格、标准讨论 |

---

## 2. CC 在不同阶段的角色

| 阶段 | CC 角色 | 你的角色 | 典型 CC prompt 模板 |
|---|---|---|---|
| 0-1 | **老师 + 答疑机器** | 学生 | "用日常类比讲清 X，再给最小代码例子" |
| 2-3 | **导读 + 代码侦探** | 进阶学习者 | "对照 servo 的对应模块，差距在哪" |
| 4 | **巨型代码库导航员** | 探索者 | "Ladybird 中 HTML parser 入口在哪，沿调用链给我画一遍" |
| 5 | **PR 副驾** | 贡献者 | "review 这段 C++ 改动，挑刺" |
| 6-7 | **速度倍增器** | 工程师 / 专家 | "ECMAScript spec 第 X 节翻译成可执行清单" |

---

## 3. 阶段 0：起步（1-2 周，每周 5-10 小时）

### 3.1 目标
- Python 3 环境就绪 ✓（已确认 Python 3.14.5）
- 跑通 browser.engineering Ch 1 前 2 节（URL 解析 + socket 连 example.com）
- 立总学习契约
- 建立"边做边问 CC"的工作流

### 3.2 步骤

| # | 任务 | 预估时间 | 产出 |
|---|---|---|---|
| 1 | 立 `/li 写浏览器（生产级贡献者路径）` 总契约 | 30 分钟 | 契约登记 |
| 2 | 跑通 `socket + example.com` 单行验证（命令在 §10） | 30 分钟 | 看到 200 OK + HTML |
| 3 | Ch 1 §1-2「Connecting to a Server」「Requesting Information」 | 2 小时 | URL 类、socket 连接 |
| 4 | Ch 1 §3-5「The Server's Response」「Telnet in Python」「Request and Response」 | 2 小时 | HTTP 响应解析 |
| 5 | Ch 1 §6「Displaying the HTML」+ §7「Encrypted Connections」 | 1 小时 | tag 剥离、HTTPS |
| 6 | Ch 1 章末练习 1-1（User-Agent + Connection 头），写 learnings | 1.5 小时 | 一个练习 + 笔记 |

**阶段 0 总投入预估**：~7.5 小时

### 3.3 Python 知识增量（CC 边做边讲）

| 概念 | 用在哪 | CC 讲法 |
|---|---|---|
| `socket.socket()` | §1 | 类比电话机 |
| `connect((host, port))` | §1 | 类比拨号 |
| `send(b"...")` | §2 | `b"..."` 为什么是 bytes |
| `makefile()` | §3 | 把 socket 包装成"读文件"接口 |
| `sys.argv` | §6 | Java 的 `String[] args` 同物 |
| `class` / `__init__` / `self` | §1 起 | 你 Java 已会，对应过去 |
| `casefold()` / `strip()` | §4 | 字符串归一 |
| `ssl.create_default_context()` | §7 | 加密版 socket 包装 |

### 3.4 验证标准（出阶段 0）

- [ ] `/li 写浏览器` 总契约登记
- [ ] 跑通 example.com socket 一行命令
- [ ] 完整跑通 Ch 1 全部 §1-7 代码
- [ ] 完成 Ch 1 章末练习 1-1
- [ ] 在 `learnings/browser/01-http-from-scratch.md` 写一篇笔记
- [ ] 没卡住的 Python 概念 ≥ 80%（卡住的部分 CC 都讲清了）

### 3.5 失败信号 → 调整

- 卡 Python 语法 > 30% 时间 → **暂停，插 1 周 Python 速成**（推荐《流畅的 Python》前 5 章）
- socket / HTTP 概念听不懂 → 插 HPBN 第 1-2 章作为前置
- 觉得太简单 → 把章末练习 1-2 至 1-9 全做完

---

## 4. 阶段 1：玩具浏览器（6-9 个月，每周 5-10 小时）

### 4.1 目标
跟着 browser.engineering 全 16 章实现一个能渲染简单真实网页的 Python 浏览器。

### 4.2 工具栈（已验证）

| 工具 | 用途 | 版本 |
|---|---|---|
| Python 3 | 主语言 | ≥ 3.10 推荐，已有 3.14.5 |
| Tk | 窗口（来自 stdlib） | 自带 |
| Skia | 绘图（Part 4 起） | 通过 pip 装 |
| SDL | 事件循环（Part 4 起） | 通过 pip 装 |
| DukPy | 嵌入 JS 引擎（Ch 9 起） | 通过 pip 装 |

### 4.3 16 章步骤（每章一个步骤）

| # | 章 | 主题 | 难度 | 代码量 | 预估时间 |
|---|---|---|---|---|---|
| 1 | Ch 1 | Downloading Web Pages | 易 | 14 块/~200 行 | 8 小时 |
| 2 | Ch 2 | Drawing to the Screen | 易 | ~150 行 | 8 小时 |
| 3 | Ch 3 | Formatting Text | 中 | ~150 行 | 10 小时 |
| 4 | Ch 4 | Constructing an HTML Tree | 中 | ~200 行 | 12 小时 |
| 5 | Ch 5 | Laying Out Pages | **较难** | 150-200 行 | 15 小时 |
| 6 | Ch 6 | Applying Author Styles | 中 | ~200 行 | 12 小时 |
| 7 | Ch 7 | Handling Buttons and Links | 中 | ~150 行 | 8 小时 |
| 8 | Ch 8 | Sending Information to Servers | 易 | ~100 行 | 6 小时 |
| 9 | Ch 9 | Running Interactive Scripts | **较难** | 200-300 行 | 15 小时 |
| 10 | Ch 10 | Keeping Data Private | 中 | ~150 行 | 10 小时 |
| **— Part 4 分界 —** | | | | | |
| 11 | Ch 11 | Adding Visual Effects | 难 | ~250 行 | 15 小时 |
| 12 | Ch 12 | Scheduling Tasks and Threads | 难 | ~250 行 | 18 小时 |
| 13 | Ch 13 | Animating and Compositing | 难 | ~250 行 | 18 小时 |
| 14 | Ch 14 | Making Content Accessible | 中 | ~200 行 | 10 小时 |
| 15 | Ch 15 | Supporting Embedded Content | 中 | ~200 行 | 10 小时 |
| 16 | Ch 16 | Reusing Previous Computation | **难** | ~300 行 | 20 小时 |

**阶段 1 总投入预估**：~195 小时（按每周 5-10 小时投入 → 5-9 个月）

### 4.4 关键节点

| 完成节点 | 能做什么 | 立子契约 |
|---|---|---|
| Part 1（Ch 1-3） | 能下载网页 + 在窗口里显示文字 | `/li 完成 browser.engineering Part 1` |
| Part 2（Ch 4-7） | 能渲染带 CSS 的 HTML，点链接跳转 | `/li 完成 Part 2 + 写 5 篇 learnings` |
| Part 3（Ch 8-10） | 浏览器能跑 JS、提交表单、处理 Cookie | `/li 完成 Part 3 + 玩具浏览器能登录 HN` |
| Part 4（Ch 11-16） | 接近真生产级架构（合成、调度、增量） | `/li 完成 Part 4 + 总结全书` |

### 4.5 CC 用法（关键 prompt 模板）

#### 每章开始
```
我要开始 browser.engineering 第 X 章「$主题」。
1. 用 3 个日常类比讲清这章的核心概念
2. 列出本章需要的前置知识（包含上一章已经实现的）
3. 给我一个 5 分钟能看懂的"本章会做什么"的鸟瞰
```

#### 卡在某段代码
```
这段代码我看不懂：
```python
$paste
```
1. 这段在干什么（一句话）
2. 每一行做什么（逐行）
3. 为什么这么写（设计取舍）
4. 类似的事 Java 怎么写（对照我的背景）
```

#### 一章结束
```
我刚跑通了第 X 章。请：
1. 出 5 道题验证我是否真懂（不只是抄完代码）
2. 列出本章实现 vs 真生产浏览器（Chromium / Ladybird）的 3 个差距点
3. 推荐 1 个章末练习作为巩固（要够难但不超出本章范围）
```

#### 写 learnings 笔记
```
帮我把第 X 章的内容按 learnings/template.md 的结构起一个草稿：
- 核心概念（用类比）
- 关键代码片段（带注释）
- 踩过的坑（我说的，不要编）
- 与真生产浏览器的差距
```

### 4.6 验证标准（出阶段 1）

- [ ] 16 章全部跑通，玩具浏览器能渲染 example.com / news.ycombinator.com / 简单 wiki 页
- [ ] 16+ 篇 learnings/browser/ 笔记
- [ ] GitHub repo `toy-browser` 公开
- [ ] 累计 ~3000 行 Python
- [ ] 能口述每个模块的设计取舍

---

## 5. 阶段 2：JS 解释器原理（2-3 个月，每周 5-10 小时）

### 5.1 为什么插入这一段
browser.engineering 用 DukPy 嵌入现成 JS 引擎——你**没真懂 JS 引擎内部**。要走生产级路径，必须吃透 JS 引擎原理。

### 5.2 教材：Crafting Interpreters Part II

#### 概念地图（来自 Map of the Territory）

```
源代码
  ↓
Scanning（词法分析）→ 字符流变成 token
  ↓
Parsing（语法分析）→ token 变成 AST
  ↓
Static Analysis（静态分析）→ 解析标识符、检查作用域
  ↓
[Part II 直接执行 AST]    [Part III 编译成字节码再 VM 执行]
```

**Part II 路径**：Scanning → Parsing → Analysis → Tree-walk Execute

#### 章节步骤（10 章）

| # | 章 | 主题 | 预估时间 |
|---|---|---|---|
| 1 | Ch 4 | Scanning（词法） | 6 小时 |
| 2 | Ch 5 | Representing Code（AST） | 6 小时 |
| 3 | Ch 6 | Parsing Expressions | 6 小时 |
| 4 | Ch 7 | Evaluating Expressions | 6 小时 |
| 5 | Ch 8 | Statements and State | 6 小时 |
| 6 | Ch 9 | Control Flow | 6 小时 |
| 7 | Ch 10 | Functions | 10 小时 |
| 8 | Ch 11 | Resolving and Binding（作用域） | 10 小时 |
| 9 | Ch 12 | Classes | 6 小时 |
| 10 | Ch 13 | Inheritance | 6 小时 |

**阶段 2 总投入预估**：~68 小时（按每周 5-10 小时投入 → 2-3 个月）

### 5.3 工具栈
- **Java**（你已有底子，复习 OOP 即可）
- 无外部依赖（书里手写所有解析）

### 5.4 CC 用法重点
- **每章理论 + 代码**：先让 CC 用类比讲算法（递归下降、visitor pattern、environment）
- **挑战题**：每章末挑战题挑 1-2 做（CC 协助）
- **对照 Lox 与 JS**：让 CC 标注"Lox 的 X 在真 JS 里对应什么"

### 5.5 验证标准
- [ ] 实现一个能跑 Lox 的解释器（jlox）
- [ ] 用 Lox 写一个 100 行的小程序（比如 fibonacci、二叉树、闭包计数器）
- [ ] 5+ 篇 learnings/lang/ 笔记
- [ ] 能解释 jlox 的每个组件（scanner / parser / resolver / interpreter）干什么

---

## 6. 阶段 3：JS 引擎进阶 + C 入门（4-6 个月，每周 5-10 小时）

### 6.1 教材：Crafting Interpreters Part III

#### 路径
源代码 → Scanning → Parsing → 编译成**字节码** → **VM 执行**

#### 章节步骤（17 章）

| # | 章 | 主题 | 难度 | 预估时间 |
|---|---|---|---|---|
| 1 | Ch 14 | Chunks of Bytecode | 中（C 入门） | 12 小时 |
| 2 | Ch 15 | A Virtual Machine | 中 | 12 小时 |
| 3 | Ch 16 | Scanning on Demand | 中 | 10 小时 |
| 4 | Ch 17 | Compiling Expressions | 中 | 12 小时 |
| 5 | Ch 18 | Types of Values | 易 | 6 小时 |
| 6 | Ch 19 | Strings | 中 | 6 小时 |
| 7 | Ch 20 | Hash Tables | 中 | 10 小时 |
| 8 | Ch 21 | Global Variables | 易 | 6 小时 |
| 9 | Ch 22 | Local Variables | 中 | 6 小时 |
| 10 | Ch 23 | Jumping Back and Forth | 中 | 6 小时 |
| 11 | Ch 24 | Calls and Functions | 中 | 10 小时 |
| 12 | Ch 25 | Closures | 难 | 12 小时 |
| 13 | **Ch 26 | Garbage Collection** | **极难** | **25 小时** |
| 14 | Ch 27 | Classes and Instances | 中 | 6 小时 |
| 15 | Ch 28 | Methods and Initializers | 中 | 6 小时 |
| 16 | Ch 29 | Superclasses | 中 | 6 小时 |
| 17 | Ch 30 | Optimization | 难 | 12 小时 |

**阶段 3 总投入预估**：~163 小时（按每周 5-10 小时投入 → 4-7 个月）

### 6.2 GC 章节单独说明（来自实际拉取）

> **算法**：Mark-Sweep（标记-清除）+ tricolor 抽象
> **代码量**：200-300 行新代码
> **难度根源**：
> - 不可见性：跑不跑都看不出 GC 在干啥
> - 不确定性：bug 现场远离 root cause
> - 多组件耦合：要和编译器、VM 栈、闭包系统、字符串 intern 协同

**预算 3-4 周专门攻这一章是合理的**，CC 加持也救不了完全——这章需要静下来调试。

### 6.3 C 语言学习（与 Ch 14 并行）

| 概念 | Ch 14 用到 | CC 讲清 + 你练习 |
|---|---|---|
| 指针 / 解引用 | 全章 | 类比"地址条" |
| `malloc / free / realloc` | 动态数组 | 手动内存管理为什么存在 |
| `struct` / `enum` | 全章 | 类比 Java class（无方法） |
| `->` vs `.` | 访问 struct 字段 | 指针调字段时用 `->` |
| 宏（`#define`） | 简化代码 | 类比模板（但更暴力） |
| 头文件（`.h`）/ 实现文件（`.c`）| 模块组织 | 类比 Java 接口 + 实现，但分文件 |

### 6.4 CC 用法重点
- **C 语言陪练**：每个新概念 CC 给 5 分钟讲解 + 3 道小练习
- **指针调试**：内存问题 CC 帮你想清"指针指哪、谁拥有、谁释放"
- **GC 章节**：CC 用 mark-sweep 简化案例先讲清算法，再看书里实现

### 6.5 验证标准
- [ ] 实现 clox（C 字节码 VM），跑通 Lox 标准测试
- [ ] 能口述：从源码到执行的完整路径（每一阶段做什么）
- [ ] 能解释：为什么字节码 VM 比 jlox 快几十倍
- [ ] 能解释：Mark-Sweep GC 怎么工作、为什么需要 tricolor
- [ ] 8+ 篇 learnings/vm/ 笔记
- [ ] 能读懂 V8 文档里的 Ignition / TurboFan 概念（不需要懂全，能 map 到 clox 的对应概念）

---

## 7. 阶段 4：真生产级浏览器导读（2-3 个月）

### 7.1 主路径：Ladybird

#### 项目状态（已验证）
- C++23 + 正在迁 Rust
- Alpha 2026 首发
- 8 全职 + 志愿者
- Discord 活跃，有 #code-review 和 #build-problems
- 12 名 maintainer 审 PR
- PR 21 天无活动 stale，27 天关闭

#### macOS 编译（已验证可行）
```bash
xcode-select --install
brew install autoconf autoconf-archive automake ccache cmake libtool nasm ninja pkg-config qt
git clone https://github.com/LadybirdBrowser/ladybird.git
cd ladybird
./Meta/ladybird.py run
```

#### 编译时坑（已验证）
- `"Unable to find a build program corresponding to Ninja"` → 实际是 vcpkg 依赖编译失败，看 `vcpkg-manifest-install.log`
- 内存少：`LAGOM_LINK_POOL_SIZE=2` 减少并行链接

### 7.2 副路径：Servo（学 Rust 浏览器架构）

#### Servo Book 完整 TOC（已验证）

```
1. The Servo Book（intro）
2. Getting servoshell（下载 + 跑预编译版）
3. Getting the code
4. Building Servo（mach 工具）
5-11. Building for Linux/macOS/Windows/NixOS/WSL/Android/OpenHarmony
12. Building Offline
13. General Troubleshooting
14. Overview: Embedding Servo
15. Servo LTS releases
16. Getting Started（贡献入门）
17. Finding Things to Do（含"less complex issues"）
18. Git Setup
19. Editor Setup（VSCode/Zed/Emacs）
20. Style Guide
21. Making a Pull Request
22. Testing（含 WPT）
```

**特别注意 §17「Finding Things to Do」**——明确有"less complex issues"路径，比 Ladybird CONTRIBUTING 友好（Ladybird 没有显式 good-first-issue 标签）。

### 7.3 Rust 入门（必须）

参考 **The Rust Programming Language**（doc.rust-lang.org/book）—— 21 章 + 附录，覆盖：
- Ch 1-3：基础语法（变量、控制流、函数）
- Ch 4：所有权（Rust 核心，必啃）
- Ch 5-6：结构体、枚举、模式匹配
- Ch 7-9：模块、集合、错误处理
- Ch 10：泛型、trait、生命周期
- Ch 11-13：测试、命令行项目、函数式特性
- Ch 14-16：Cargo、智能指针、并发
- Ch 17：异步
- Ch 18-20：OO 模式、模式匹配进阶、高级特性
- Ch 21：完整项目（多线程 web 服务器）
- 附录 A-G

**学习策略**（CC 加持）：
- Ch 1-10 必看（4-6 周，每周 5 小时）
- Ch 11-21 + 附录 → 边读 Servo / Ladybird 源码边查

### 7.4 阶段 4 步骤

| # | 任务 | 预估时间 |
|---|---|---|
| 1 | Rust Book Ch 1-10（所有权 / trait / 错误处理为重点） | 30 小时 |
| 2 | 编译运行 Ladybird（含 vcpkg 依赖踩坑） | 8 小时 |
| 3 | 编译运行 Servo（含跨平台依赖排查） | 8 小时 |
| 4 | Ladybird 源码导读：从 main 入口顺调用链 | 15 小时 |
| 5 | Servo 源码导读：对比 Ladybird 架构 | 15 小时 |
| 6 | 写 5 篇模块导读笔记（HTML parser / CSS / layout / network / JS bridge） | 10 小时 |
| 7 | 加 Ladybird Discord，提一个有意义的问题 | 2 小时 |
| 8 | 立 stage 5 子契约 | 30 分钟 |

**阶段 4 总投入预估**：~88 小时（按每周 5-10 小时投入 → 2-4 个月）

### 7.5 CC 用法（巨型代码库导航）
```
我在 Ladybird 源码里找 HTML 解析器。
1. 从 main 入口开始，沿调用链画一遍：解析在哪里被触发？
2. 列出 HTML parser 的核心文件路径
3. 这个 parser 实现的是 WHATWG HTML 标准的哪一部分？
4. 与我玩具浏览器的 HTML parser 相比，最大的 3 个架构差异？
```

### 7.6 验证标准
- [ ] 本地能编译运行 Ladybird ✓
- [ ] 本地能编译运行 Servo ✓
- [ ] Rust Book Ch 1-10 完成
- [ ] 5+ 篇模块导读笔记（HTML parser / CSS engine / layout / network / JS bridge）
- [ ] 能在 Ladybird Discord 介绍自己 + 提一个有意义的问题

---

## 8. 阶段 5：第一波贡献（6-12 个月）

### 8.1 路径

#### Ladybird CONTRIBUTING（已验证）

| 项 | 要求 |
|---|---|
| 语言 | C++23 + AK 容器 |
| 格式 | clang-format，CodingStyle.md |
| commit 格式 | "Category: Brief description"（imperative，无句号，72 字符内） |
| 原子化 | 每个 commit 都得 build/tests 过 |
| 提交后 | rebase + amend，**不要追加新 commit** |
| 起步建议 | "前几个 PR 从小事开始" |
| 起步路径 | 没有 good-first-issue 标签，去 Discord #code-review |

#### Servo CONTRIBUTING（已验证）
- 有"less complex issues"路径（§17）
- 用 `git-webkit` 工具链或自己 git
- WPT 测试导入是常见 PR 类型

### 8.2 第一波贡献步骤

| # | 任务 | 预估时间 |
|---|---|---|
| 1 | 在 Ladybird / Servo 找到第 1 个可做的 issue | 5 小时 |
| 2 | 第 1 个 PR：写测试 / 修文档 / 修小 bug（含 review 来回） | 15 小时 |
| 3 | 第 2-3 个 PR：小 bug 修复 | 30 小时 |
| 4 | 第 4-7 个 PR：功能补全 / 规范合规 | 80 小时 |
| 5 | 第 8-10 个 PR：开始有方向选择 | 60 小时 |
| 6 | 选定阶段 6 子系统方向 + 写复盘 | 5 小时 |

**阶段 5 总投入预估**：~195 小时（按每周 5-10 小时投入 → 5-10 个月）

> 第一个 PR 通常最慢——熟悉流程、踩 review 文化、改 commit 格式。第 5 个 PR 之后会显著加速。

### 8.3 CC 用法
```
这是 Ladybird 上一个 issue：$paste
1. 用我的话翻译这个 issue 在抱怨什么
2. 给我最小复现步骤
3. 帮我定位需要改的文件（用 grep / Glob）
4. 起一个 fix 草稿
5. review 我的草稿，挑刺
```

### 8.4 验证标准（出阶段 5）
- [ ] 5-10 个 merged PR
- [ ] 在 Ladybird 或 Servo Discord 被认识
- [ ] 选定阶段 6 子系统方向
- [ ] 立 `/li 阶段 6 - 专精 X` 子契约

---

## 9. 阶段 6 + 7：子系统专精与跨上游（2-5 年+）

### 9.1 4 个方向（4 选 1 或 2）

| 方向 | 学什么 | 主资源 | 出口 |
|---|---|---|---|
| **JS 引擎** | V8 / SpiderMonkey 内部、JIT、GC | V8 docs（已验证）、TC39 process（已验证） | Google V8 / runtime 创业 |
| **布局 + 渲染** | Blink layout、合成线程、GPU 光栅化 | Chromium docs、Servo paper、CSS specs | Chrome Graphics 团队 |
| **网络 / 协议** | HTTP/2/3、QUIC、TLS、cache | HPBN（已验证 18 章）、RFC | Cloudflare / 协议组 |
| **安全 / 沙箱** | 进程隔离、Site Isolation、CSP | Chromium security docs、CVE | 安全研究 / 漏洞赏金 |

### 9.2 V8 方向具体（已验证 docs）

V8 docs 涵盖：
- **Building & Contributing**：从源码编译、贡献流程
- **Debugging**：ARM 模拟器、GDB、Inspector Protocol、内存泄漏
- **Embedding V8**：在 C++ App 中嵌 V8
- **Under the Hood**：Ignition（解释器）、TurboFan（JIT）、Torque、CSA、隐藏类
- **Performance**：sample-based profiler、Linux perf

**V8 → 你阶段 3 的 clox 对照表**：
- Ignition ≈ clox 的字节码 VM
- TurboFan ≈ clox 没有的（JIT 编译热代码到机器码）
- Hidden classes ≈ clox 的对象表示，但更复杂
- Torque/CSA ≈ V8 的内置函数 DSL

### 9.3 TC39 process（已验证）
JS 提案 6 阶段：
- 0 Strawperson → 1 Proposal → 2 Draft → 2.7 Candidate → 3 Candidate → 4 Finished
- Stage 4 要求"两个兼容实现 + 通过 Test262"
- 外部贡献者要在 Ecma International 注册

**长期目标**：自己提一个 TC39 proposal（≥ Stage 1）—— 这是阶段 7 的标志性产出。

### 9.4 阶段 7：Chromium / WebKit committer

#### Chromium（资源拉取受限，需阶段 4 时再深挖）
- 文档站 chromium.googlesource.com 有 503 限制，需要 chrome dev console 或本地 git clone 看
- 关键文档需阶段 4 时本地 clone Chromium repo 后读 `docs/contributing.md`、`docs/get_the_code.md`

#### WebKit CONTRIBUTING（已验证）
- 用 Bugzilla 而不是 GitHub Issues
- `Tools/Scripts/git-webkit setup` + `git-webkit pull-request`
- Reviewer 必须是 WebKit reviewer（有正式头衔）
- 测试用 `run-webkit-tests`

---

## 10. 立刻能做的事（阶段 0 起点）

### 10.1 立总学习契约
```
/li 写浏览器（生产级贡献者路径）
```
契约标准建议：
- 完成 PLAN.md 中阶段 0-3 的全部验证标准
- 累计 200+ 篇 learnings/
- 至少 5 个 merged PR 到 Ladybird / Servo

### 10.2 第一个验证命令（30 秒）

打开终端跑：
```bash
python3 -c "import socket; s=socket.socket(); s.connect(('example.com', 80)); s.send(b'GET / HTTP/1.0\r\nHost: example.com\r\n\r\n'); print(s.recv(2000).decode()[:500])"
```

预期输出：`HTTP/1.0 200 OK ...` 后跟 example.com 的 HTML 前 500 字符。

报错（任何）→ 贴给我，一起定位。

---

## 11. 资源库（按可用度分级）

### 11.1 Tier 1：已验证 + 完整可用

| 资源 | URL | 用途 |
|---|---|---|
| browser.engineering | browser.engineering | 主教材（阶段 1） |
| Crafting Interpreters | craftinginterpreters.com | JS 解释器（阶段 2-3） |
| Ladybird repo | github.com/LadybirdBrowser/ladybird | 阶段 4-5 |
| Ladybird CONTRIBUTING | repo 里 | 阶段 5 |
| Servo Book | book.servo.org | 阶段 4 |
| WebKit contributing | webkit.org/contributing-code | 阶段 5 / 7 |
| HPBN | hpbn.co | 网络方向参考 |
| WPT | github.com/web-platform-tests/wpt | 测试基础 |
| WHATWG HTML standard | html.spec.whatwg.org | 规范参考 |
| V8 docs | v8.dev/docs | JS 引擎方向 |
| TC39 process | tc39.es/process-document | JS 标准化 |

### 11.2 Tier 2：已知存在，需阶段 4 时本地深挖

| 资源 | 状态 |
|---|---|
| Chromium contributing.md | WebFetch 503，本地 git clone 后可读 |
| Chromium get_the_code.md | 同上 |
| The Rust Book TOC（详细） | WebFetch 不返回完整 TOC，本地 `rustup doc --book` 或访问站点直接看 |

### 11.3 Tier 3：训练数据已有，无需主动拉

| 资源 | 备注 |
|---|---|
| K&R《C 程序设计语言》 | C 入门经典 |
| Rust Book 21 章结构 | 同 §7.3 列出 |
| ECMAScript spec 章节结构 | 阶段 6 时按需查 |

---

## 12. 风险登记册

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 卡 Python 语法太久 | 中 | 阶段 1 推迟 | 阶段 0 验证标准没达标 → 插 1 周 Python 速成 |
| 阶段 1 Part 4 太难放弃 | 中高 | 跳到阶段 2 | 接受先完成 Part 1-3 即可，Part 4 后期回炉 |
| GC 章节卡 1 个月以上 | 中 | 阶段 3 延期 | 接受，这章本来就难 |
| Ladybird 无 good-first-issue → 第 1 PR 慢 | 高 | 阶段 5 启动慢 | 改去 Servo（有 less complex issues 路径） |
| Chromium 5-10 GB 编译失败 | 中 | 阶段 7 启动慢 | 阶段 6 时先 1 年攒经验，阶段 7 再尝试 |
| 学到一半发现方向不感兴趣 | 中 | 整个路径调整 | 每完成一个阶段做一次 1 小时复盘 |
| 工作 / 生活变化导致投入不足 | 高 | 时间线拉长 | 路径本来就是 7-10 年弹性的 |

---

## 13. 学习契约结构

### 13.1 总契约
```
/li 写浏览器（生产级贡献者路径）
```

### 13.2 子契约（按阶段）
- `/li 阶段 0 - 跑通 Ch 1 + 立总契约`
- `/li 阶段 1 - 完成 browser.engineering Part 1`
- `/li 阶段 1 - 完成 Part 2`
- `/li 阶段 1 - 完成 Part 3`
- `/li 阶段 1 - 完成 Part 4`
- `/li 阶段 2 - Crafting Interpreters Part II 完成`
- `/li 阶段 3 - Part III Ch 14-25 完成（前置）`
- `/li 阶段 3 - GC 章节攻克`
- `/li 阶段 3 - Part III 全部完成`
- `/li 阶段 4 - Rust Book Ch 1-10`
- `/li 阶段 4 - 编译运行 Ladybird + Servo`
- `/li 阶段 4 - 5 篇模块导读笔记`
- `/li 阶段 5 - 第 1 个 merged PR`
- `/li 阶段 5 - 第 5 个 merged PR`
- `/li 阶段 5 - 第 10 个 + 选定专精方向`
- `/li 阶段 6 - 子系统专精`（多个）
- `/li 阶段 7 - Chromium / WebKit committer`

每子契约结束 `/she` 验证 + `/shu` 沉淀笔记。

---

## 14. 文档维护

- 每完成一个阶段，回填实际耗时、实际产出、与预估的偏差
- 资源失效（链接、教材更新）时同步修订，标注 last-verified 日期
- 路径本身可以变——发现某段不对就调整，记录"为什么变"
- v3+ 在阶段 4 结束时撰写（届时 Chromium / Rust 信息已本地完整）

---

## 15. 下次会话恢复

新会话只需读这一个文件 + 总契约即可续上：
```
/learn 状态        # 看活跃契约
Read explorations/browser-from-scratch/PLAN.md
```

**当前位置**：阶段 0，未启动。下一步 = 立 `/li` 总契约 + 跑 §10.2 的验证命令。

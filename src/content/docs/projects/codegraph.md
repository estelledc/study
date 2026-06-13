---
title: CodeGraph — 从零到一的代码知识图谱
来源: https://github.com/colbymchenry/codegraph
日期: 2026-06-13
分类: CLI
子分类: ai-ml-tools
provenance: pipeline-v3
---

## 一句话

CodeGraph 把代码仓库变成一张**可查询的知识图谱**，让 AI 编程代理（Claude Code、Cursor、OpenCode 等）不再靠盲目 grep 探索代码，而是直接查图获取答案。

## 日常类比

想象你要找一本图书馆里某本书的位置。

- **没有 CodeGraph**：你像无头苍蝇一样走进图书馆，一排排书架翻找，可能翻半天才知道书在 3 楼 B 区。对应到代码里，就是 `grep`、`find`、`Read` 一遍遍扫文件。
- **有 CodeGraph**：图书馆有一张完整的目录卡片系统。你直接去查"这本书叫什么"，卡片告诉你"3 楼 B 区第 5 排"。对应到代码里，就是查图谱找到函数定义在哪里、谁调用了它。

CodeGraph 做的就是在你的代码仓库第一次建好这张"目录卡"，之后每次你改代码，它自动更新。

## 核心概念

### 1. 知识图谱（Knowledge Graph）

代码不只是文本文件，文件之间是有关系的。CodeGraph 提取这些关系：

- **节点（Node）**：代表代码中的实体——函数、类、变量、导入、路由等
- **边（Edge）**：代表节点之间的关系——调用、继承、导入、引用等

把这些节点和边存进一个本地 SQLite 数据库，就形成了一张**代码知识图谱**。

### 2. Tree-sitter 解析

Tree-sitter 是一个增量式语法解析器，能把源代码变成抽象语法树（AST）。CodeGraph 用它来理解代码的结构，而不是简单地做字符串匹配。

比如这段代码：

```typescript
class UserService {
  async getUser(id: string) {
    const db = getDb();
    return db.query('SELECT * FROM users WHERE id = ?', id);
  }
}
```

CodeGraph 会提取出：

| 类型 | 节点 | 关系 |
|------|------|------|
| 类 | `UserService` | — |
| 方法 | `getUser` | 属于 `UserService` |
| 函数调用 | `getDb()` | 被 `getUser` 调用 |
| 函数调用 | `db.query()` | 被 `getUser` 调用 |

### 3. 自动同步（Auto-Sync）

你编辑代码时，CodeGraph 通过操作系统级别的文件监听（macOS 的 FSEvents、Linux 的 inotify）自动检测变化，在 2 秒静默窗口后重新索引。不需要手动运行任何命令。

## 安装与使用

### 安装（一行命令，不需要 Node.js）

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh

# 或者如果你已经有 npm
npm i -g @colbymchenry/codegraph
```

### 连接到 AI 代理

```bash
codegraph install
```

这个命令会自动检测你安装了哪些代理（Claude Code、Cursor、Codex、OpenCode 等），并把 CodeGraph 配置进去。

### 初始化项目

```bash
cd your-project
codegraph init
```

一条命令完成初始化 + 首次建图。之后会在项目目录下生成 `.codegraph/` 目录存放索引。

## 核心工具

CodeGraph 提供几个关键工具，每个解决不同的问题：

### `codegraph_explore` — 万能入口

回答"这个模块怎么工作的"、"X 怎么走到 Y"这类问题。一次调用返回相关代码的完整上下文。

### `codegraph_search` — 查找符号

按名字搜索代码库里的函数、类、变量等。

### `codegraph_callers` — 谁调用了它

找到某个函数的所有调用点。

### `codegraph_impact` — 改了会怎样

分析修改某个符号会影响哪些代码。

## 代码示例

### 示例 1：探索一个模块的工作方式

假设你在一个 Express.js 项目中，想知道"登录请求是怎么处理的"：

```bash
# 直接问 CodeGraph
codegraph explore "how does the login request flow work"
```

输出会包含：

```
## Express Auth Module

### Entry Points
- `POST /api/login` → `authController.login` (src/controllers/auth.ts:12)

### Related Symbols
- `authController.login` (src/controllers/auth.ts:12)
  - calls `UserModel.findOne()` (src/models/User.ts:8)
  - calls `jsonwebtoken.sign()` (node_modules/jsonwebtoken/index.js)
  - calls `bcrypt.hash()` (node_modules/bcrypt/bcrypt.js)

### Impact Radius
- Called by: Express router (src/routes/auth.ts:5)
- Depends on: UserModel, jsonwebtoken, bcrypt
```

不需要手动 grep 找文件，不需要一个个打开看。

### 示例 2：查找谁调用了某个函数

假设你想重构 `formatDate` 函数，但不知道哪些地方在用：

```bash
# 查找所有调用点
codegraph callers formatDate
```

输出：

```
## Callers of `formatDate`

### src/utils/date.ts:5 - formatDate(date, format)

1. src/components/UserProfile.tsx:23
   const formatted = formatDate(user.createdAt, 'YYYY-MM-DD');

2. src/components/OrderList.tsx:45
   <span>{formatDate(order.date)}</span>

3. src/services/reportGenerator.ts:12
   report.date = formatDate(new Date());

Found 3 callers
```

现在你知道修改这个函数需要同时检查这 3 个文件了。

### 示例 3：分析影响范围

```bash
# 修改了 User 模型，看看影响多大
codegraph impact UserModel
```

输出会显示完整的依赖链——谁导入了它、谁调用了它的方法、哪些测试文件可能受影响。

## 技术架构

```
你的代码仓库
    │
    ▼
Tree-sitter 解析（AST 提取）
    │
    ▼
构建知识图谱（节点 + 边）
    │
    ▼
存入 SQLite（带 FTS5 全文搜索）
    │
    ▼
MCP Server 暴露给 AI 代理
    │
    ▼
代理直接查图，不再盲目 grep
```

关键点：
- **100% 本地运行**，数据不出机器，不需要 API key
- 支持 **20+ 种语言**（TypeScript、Python、Go、Rust、Java、Swift 等）
- 支持 **17 种 Web 框架**的路由识别（Express、Django、Rails、Spring 等）
- 内置 iOS / React Native 跨语言桥接追踪

## 为什么值得学

CodeGraph 代表了一个重要的趋势：**AI 编程代理正在从"读文件"进化到"查知识"**。

以前代理回答问题的方式是：
1. `grep` 搜索关键词
2. `glob` 找相关文件
3. `Read` 打开文件
4. 重复以上步骤直到找到答案

这个过程消耗大量 token 和时间。CodeGraph 把这个流程压缩成一次查询：

1. `codegraph_explore` 一次拿到答案

对于大仓库（几千到几万文件），这种差距尤其明显——Benchmark 显示 VS Code 仓库（约 1 万文件）上，工具调用少了 81%，token 少了 64%。

## 下一步

如果你想动手试试：

```bash
# 在你的项目里快速体验
npx @colbymchenry/codegraph

# 它会引导你完成安装 + 连接代理 + 初始化
```

或者先看看它的文档网站：https://colbymchenry.github.io/codegraph/

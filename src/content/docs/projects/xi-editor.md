---
title: xi-editor — 异步架构编辑器的先驱实验
来源: 'https://github.com/xi-editor/xi-editor'
日期: 2026-06-24
分类: 编辑器
难度: 中级
---

## 是什么

xi-editor 是 **Google 工程师 Raph Levien 发起的一个实验性代码/文本编辑器**，用 Rust 写后端（xi-core），前端可以换成任意 GUI（Cocoa、GTK、Electron 都有人写过）。日常类比：传统编辑器像一整台洗衣机（界面和引擎焊在一起，换面板要拆机器），xi-editor 像把洗衣机拆成"控制面板"和"滚筒引擎"两个独立模块——面板和引擎之间只用一根 JSON-RPC 线连着，想换触屏面板还是旋钮面板随你。

它引入了两个在当时（2016-2018）领先的想法：

- **rope 数据结构**存文本——不像普通编辑器用一整块字符串，rope 是一棵"把文本拆成碎片挂在树上"的平衡树，改中间一段不用复制整份文档
- **异步前后端分离**——后端算好高亮、自动补全后通知前端，前端先画再等结果，打字永远不等后端

截至归档前约 20k stars。项目已在 2023 年被标记为 **archived**（只读），不再活跃维护。

## 为什么重要

不理解 xi-editor 做过的探索，下面这些事都没法解释：

- 为什么 Zed 和 Lapce 都选择"Rust 后端 + 自研前端 + 异步通信"这条路——xi-editor 是这条路的第一个公开原型
- 为什么 rope 数据结构在现代编辑器里被广泛采用——xi-editor 是现代开源编辑器语境里较早系统实践 rope、并公开写博客讲 tradeoff 的项目
- 为什么"前后端分离"能让编辑器打字永不卡——这个观点在早期 Electron 编辑器（如 Atom）里并不主流
- 为什么一个"失败的项目"（归档了没人用）会成为后来两个明星编辑器的思想源头——工程探索的价值不在产品本身，在于它验证的架构思路

## 核心要点

xi-editor 的设计可以拆成 **三个核心决定**：

1. **rope 数据结构**：传统编辑器用一个大字符串（gap buffer 或 piece table）存文本，插入/删除要移动大量数据。xi-editor 用 rope——一棵 B-tree 变体，叶子节点存小段字符串（通常 1-2KB），内部节点存子树长度。类比：一本书不装订成一整册，而是拆成活页夹，插一页只要掀开夹子，不用重抄全书。rope 让"在 10 万行文件中间插一行"的开销从 O(n) 降到 O(log n)。

2. **前后端通过 JSON-RPC 异步通信**：xi-core（后端进程）负责文本存储、语法高亮、撤销/重做、插件管理；前端（任意 GUI 框架）只负责渲染和接收用户输入。两者通过 stdin/stdout 上的 JSON-RPC 消息通信，完全解耦。类比：后厨（xi-core）和服务员（前端）只靠传菜窗口的小纸条沟通——后厨慢了服务员照样能招呼客人，不会站在窗口等菜干瞪眼。

3. **CRDT 化的文本模型**：xi-editor 后期探索了 CRDT（Conflict-free Replicated Data Type）来管理并发编辑。日常类比：两人同时改同一份共享文档，系统按规则自动合并，而不是互相覆盖。每次编辑带版本号和位置偏移，多个编辑可无冲突合并；这思路后来直接影响了 Zed 的实时协作。

## 实践案例

### 案例 1：体验前后端分离的直觉

xi-editor 虽已归档，但你可以通过它的架构理解"分离"的好处：

```
用户按下一个键
  -> 前端立刻把字符画到屏幕上（乐观渲染）
  -> 同时发一条 JSON-RPC 消息给 xi-core
  -> xi-core 在后台更新 rope、重新计算语法高亮
  -> xi-core 算完后发 update 消息给前端
  -> 前端刷新高亮颜色
```

关键：**用户看到字符出现在屏幕上是即时的**，高亮颜色可能延迟几十毫秒才刷新。这种"先画再算"的模式在今天被 Zed 和 Lapce 沿用。

### 案例 2：rope 对大文件的意义

```
传统编辑器（gap buffer）：
  打开 500MB 日志 -> 分配 500MB 连续内存
  在第 100 行插入一行 -> 把第 101 行到末尾的数据全部往后挪

xi-editor（rope）：
  打开 500MB 日志 -> 拆成若干 1-2KB 的叶子节点挂在树上
  在第 100 行插入一行 -> 只修改那个叶子节点 + 沿路更新几个内部节点的长度
  时间从 O(n) 变成 O(log n)
```

### 案例 3：JSON-RPC 协议长什么样

前端发给后端的一条消息：

```json
{"method": "edit", "params": {"method": "insert", "params": {"chars": "h"}}}
```

后端发给前端的更新：

```json
{"method": "update", "params": {"ops": [
  {"op": "copy", "n": 5},
  {"op": "ins", "lines": [{"text": "hello\n", "styles": [0, 5, 1]}]}
]}}
```

这种简洁的协议设计让任何人都能用任意语言写一个 xi-editor 前端——社区确实出现过 Swift/Cocoa、GTK、Electron、Qt 等多种实现。想跟读实现：clone 仓库后看 `rust/rope/`，对照上面的 insert/update 消息理解后端怎么改树。

## 踩过的坑

1. **前端碎片化**：因为前端可以随便换，结果没有一个前端做到"够好用"——官方 macOS 前端半成品，社区 GTK 前端维护不稳，Electron 前端性能又回到老问题。"可以换"不等于"有人做好一个"。

2. **异步带来的同步难题**：前后端异步通信听起来美好，但前端"乐观渲染"后如果后端返回的结果和前端预期不一致（比如自动补全触发了格式化），前端要做回滚或修正，这个逻辑极难写对。Raph Levien 在博客中多次坦言这是最大的工程挑战。

3. **CRDT 开销**：在单机编辑器上引入 CRDT 带来了额外的内存和计算开销。xi-editor 后期发现"为了将来可能的协作而在今天付出性能代价"这个 tradeoff 不划算——大部分用户不需要协作，但每个用户都要为 CRDT 的元数据买单。

4. **一人项目瓶颈**：xi-editor 核心开发者基本只有 Raph Levien 一人（虽然是 20% time 项目）。一个人同时推进 rope 实现、CRDT 模型、插件系统、多个前端协调，精力分散导致每个方向都是"验证了可行性但没做到产品级"。

## 适用 vs 不适用场景

**适用（作为学习对象）**：
- 想理解现代编辑器为什么选择 rope 而不是 gap buffer——xi-editor 的博客和代码是最好的第一手材料
- 想理解"前后端分离"在 GUI 应用中怎么做——JSON-RPC 协议设计简洁，适合入门
- 想学 Rust 的实际工程项目——xi-core 代码量不大（约 2 万行 Rust），结构清晰
- 想理解 Zed / Lapce 为什么长成现在这样——倒推回 xi-editor 能看到思想源头

**不适用**：
- 不能当日常编辑器用——已归档，无维护，无二进制发布
- 不适合学"怎么做一个成功的开源产品"——xi-editor 在产品层面是失败的
- 不适合学 CRDT 的生产实现——xi-editor 的 CRDT 实验没走完，想学 CRDT 看 Yjs 或 Automerge

## 历史小故事（可跳过）

- **2016 年**：Raph Levien 在 Google 以 20% time 项目启动 xi-editor，目标是"从零设计一个不妥协的编辑器"。他当时已经是字体渲染领域的专家（后来做了 Vello 2D 渲染引擎）
- **2017-2018 年**：xi-editor 在 Hacker News 上多次上热榜，社区兴奋地讨论 rope + async 架构。多个第三方前端涌现，一度看起来会成为"编辑器界的 Linux 内核"
- **2019 年**：Raph Levien 在博客中反思 xi-editor 的 async 设计难题，坦言"理想很美，工程现实很骨感"。开发节奏明显放缓
- **2020 年**：Lapce 项目启动，明确致敬 xi-editor 的 rope + Rust 路线，但选择了单体架构避开"前端碎片化"问题
- **2022 年**：Zed 项目公开，Nathan Sobo（前 Atom 核心）接过 xi-editor 的 CRDT + async 思路，配合 GPUI 自研渲染做到了产品级
- **2023 年**：xi-editor 仓库被标记为 archived。一个实验结束了，但它验证的想法活在了下一代编辑器里

## 学到什么

1. **"验证思路"和"做成产品"是两件事**：xi-editor 成功验证了 rope + async + CRDT 三个方向全部可行，但没有一个做到产品级——验证需要一个人，产品需要一个团队
2. **rope 是大文件编辑的正确数据结构**：O(log n) 插入 vs O(n) 移动，在 10 万行以上的文件差距是人能感知的
3. **异步是免费午餐也是陷阱**：前后端分离让打字不卡，但"乐观渲染 + 后端修正"的同步逻辑是隐藏的复杂度炸弹
4. **一个"失败"项目可以是最好的教材**——代码量小、意图清晰、有作者博客讲 why，比读 VS Code 的百万行代码学得快

## 延伸阅读

- Raph Levien 的 xi-editor 博客：[xi-editor retrospective](https://raphlinus.github.io/xi/2020/06/27/xi-retrospective.html)（作者亲自复盘为什么项目没走到终点）
- rope 数据结构入门：[Ropes: Theory and Practice](https://www.cs.rit.edu/~tjh/courses/2011-2/cs264/recitations/ropes.pdf)（经典 rope 论文的简化版讲解）
- xi-editor 架构文档：[Frontend Protocol](https://xi-editor.io/docs/frontend-protocol.html)（JSON-RPC 协议的完整定义）
- Raph Levien 的新项目：[Xilem](https://github.com/linebender/xilem)（xi-editor 的精神继承者，专注 Rust GUI 框架）
- [[zed]] —— 接过 xi-editor 异步 + CRDT 思路做到产品级的编辑器

## 给零基础读者的"先做这件事"

xi-editor 已经归档，不能直接用，但它仍然是一个极好的学习对象：

1. **读 Raph Levien 的回顾博客**：[xi-editor retrospective](https://raphlinus.github.io/xi/2020/06/27/xi-retrospective.html)——用 30 分钟理解一个顶级工程师为什么启动这个项目、遇到了什么困难、学到了什么。这篇文章比任何教科书都真实
2. **翻 xi-core 的 rope 实现**：`rust/rope/src/` 目录下大约 2000 行 Rust，是学 rope 数据结构最好的工程代码之一
3. **对比 Zed 和 Lapce**：装一个 Zed，打开大文件体验"打字不卡"——然后回想 xi-editor 最先提出的 async 架构，理解"思想源头"和"产品落地"之间的距离
4. **读前端协议文档**：理解 JSON-RPC 怎么在两个进程之间传递编辑操作——这个模式在 LSP（Language Server Protocol）里也在用

## 关联

- [[atom]] —— 同为"探索编辑器新路线"的先驱，Atom 走 Web 技术路线而 xi-editor 走 Rust 原生路线
- [[vscode]] —— xi-editor 想解决的"打字卡顿"问题，VS Code 用工程优化缓解了但没根治
- [[emacs]] —— 老牌可扩展编辑器，xi-editor 的"前后端分离"可以类比 Emacs 的 Emacs Lisp 层 + C 核心层
- [[vim]] —— 另一个"核心极小、扩展靠插件"的编辑器哲学，但 Vim 是单进程同步模型
- [[zed]] —— xi-editor 思想的最成功继承者，CRDT + Rust + 自研渲染
- [[tree-sitter]] —— 同属增量解析方向；xi 讨论过用它替代 syntect 高亮，但未合入核心，Atom/Neovim/Zed 路线把它做成熟
- [[electron]] —— xi-editor 想要避开的那条路：用浏览器引擎做编辑器 UI

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[atom]] —— Atom — Web 技术做桌面编辑器的先驱
- [[emacs]] —— GNU Emacs — 一个伪装成编辑器的 Lisp 操作系统
- [[textmate]] —— TextMate — macOS 上定义 bundle 宏系统的编辑器
- [[vim]] —— Vim — 键盘上弹钢琴的编辑器
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳


---
title: 培养计划
description: AI 时代产品工程师的"主题树 + 横向对比"成长路径
sidebar:
  order: 1
---

> 本页是路径说明。具体笔记见左侧分组；当前规模 1900+ 篇（论文 1019 + 项目 961）。

## 1. 路径模型的演化

最初这里写的是"6 个月 / 4 个 phase / 20 篇代表项目"的线性路线图。

随着笔记数过千、主题跨度从 PL 到分布式到 AI Agent 全部展开，线性路线已经不够用。当前模型是：

- **主题树**：每个一级主题下沉到经典论文 / 关键项目，论文与项目交叉引用
- **横向对比**：同一问题在不同系统里的解法摆在一起读（例如共识算法 Paxos vs Raft，类型推断 HM vs Bidirectional）
- **反向链接驱动**：枢纽节点（被反向引最多的）就是该主题的"必经之地"
- **不追求闭环**：路径是常态打开的，写新笔记时回头补旧主题树是常事

线性路线退役不等于目标变了。目标画像见 §2，主题树见 §3。

## 2. 目标画像：AI 时代的产品工程师

不是"前端工程师"也不是"AI 工程师"，是：

| 维度 | 期望状态 |
|------|----------|
| 全栈基础 | 前后端独立做完整功能；新框架一周上手 |
| AI 工具链 | Claude API / Agent 框架是日常工具 |
| 产品判断力 | 看穿一行需求背后的真实痛点；会拒绝伪需求 |
| 系统视野 | 共识 / 存储 / 编译 / 类型 / 调度 都有可解释的模型 |
| 工程品味 | 代码可维护、架构有 trade-off 意识、愿意删代码 |
| 自学能力 | 看陌生代码库不发怵；能从大型 OSS 中拎可迁移模式 |

不追的：

- 不为了用框架而用框架
- 不背面试题
- 不卷工时（输出质量 > 时长）

## 3. 主题树（按反向链接密度排序）

每个一级主题列：枢纽节点 + 数量级。枢纽节点是当前笔记网络中被反向引最多的节点，新读相关材料先在它附近找位置。

### 3.1 编程语言与类型理论（76 篇笔记）

枢纽：[[hindley-milner]]（126 反向引，全站最高） · [[lambda-calculus]]（64） · [[hoare-logic]]（63）

为什么这条线最密：HM 是 TS / Rust / Swift / Haskell 类型系统的共同祖先；λ 演算是 PL 理论起点；Hoare 逻辑跨 PL 与形式化方法两条线。

横向对比线索：HM vs Bidirectional Typing；Effect Systems vs Monads；Substructural Types（Rust 借用）vs GC。

### 3.2 分布式系统（76 篇笔记 + 近 30 天 47 个 commit）

枢纽：[[paxos-1998]]（67） · [[raft]]（63） · [[lamport-1978]]（56） · [[spanner-2012]]（48）

横向对比线索：Paxos vs Raft（可工程化差距）；Lamport Clock vs Vector Clock vs HLC；2PC vs Paxos Commit；Spanner TrueTime vs CockroachDB HLC。

### 3.3 数据库（47 篇）

枢纽：[[postgresql]]（66，drizzle / prisma / postgres-js 都反向引）· [[bigtable-2006]]（46）· [[aries-1992]]

横向对比线索：B-Tree vs LSM；Aries 恢复 vs WAL-only；列存 Bigtable / Parquet vs 行存 Postgres；MVCC 实现差异。

### 3.4 操作系统（46 篇）

侧重虚拟化、调度、文件系统几条主线。横向对比：进程模型 vs 协程 vs Actor；Page Cache vs Buffer Pool；Cgroup vs Jail。

### 3.5 机器学习与 AI Agent（44 + 24 篇）

枢纽：[[attention]]（103，所有 LLM / NLP 笔记的根） · [[bert]]（42） · [[pytorch]]（67，框架枢纽）

横向对比线索：RNN / Attention / Mamba 序列建模代际；Pre-training Objectives（MLM / CLM / Span）；Agent 架构（ReAct / Plan-Execute / Self-Evolving）。近 30 天 self-evolving agents 新增 10+ 篇，是当前活跃前沿。

### 3.6 基础设施（38 篇 + 近 30 天 444 commit，最热）

枢纽：[[kubernetes]]（66，跨容器 / 调度 / 网络多主题）· LLVM / IR 在编译器线（[[llvm]] 50 反向引）

横向对比：Kubernetes vs Nomad；Docker vs containerd vs CRI-O；CNI / CSI / CRI 三大插件接口设计哲学。

### 3.7 形式化方法（27 篇）

枢纽：[[hoare-logic]]（63）。线索：Hoare / Separation Logic / TLA+ / Coq；与 PL 类型系统线在 Curry-Howard 处汇合。

### 3.8 图形学（36 篇）

枢纽：[[3d-gaussian-splatting]]（41）。线索：光栅化 vs 光线追踪 vs Splatting；NeRF / Gaussian / SDF 三代神经渲染。

### 3.9 前端工程（项目侧）

枢纽：[React](/study/projects/react/)（68，前端门面，Lexical / Next / Radix 全部反向引）

横向对比：React vs Solid vs Svelte 响应式模型；CSR / SSR / RSC；headless（Radix / TanStack）vs 一体化（MUI）。

### 3.10 其他活跃主题

- 编程语言（项目侧 76 篇）：TS / Rust / Go / Zig / Swift 实现侧
- 编译器（11 篇 + 近 30 天 72 commit）：LLVM / Cranelift / V8 等
- 区块链（44 篇）：BTC / ETH / 共识 / ZK
- 网络协议（37 篇）：TCP / QUIC / HTTP/3 / gRPC
- 信息检索（25 篇）：倒排索引 / 向量检索 / RAG

## 4. 学习节奏（不再以"phase"组织）

工作流：

1. 遇到具体问题或好奇点 → 在主题树里找最近的枢纽节点
2. 读时同时反向回填上游（祖宗论文 / 基础概念）和横向对比（同问题别的解法）
3. 写笔记时强制建立反向链接（pre-commit hook 拦截孤儿页）
4. 每周回看新建节点是否被引；长期没被引的要么是冷门要么是没消化好

不再追求"按 phase 顺序读完"。任何时候都可以同时在多条线推进。

## 5. 当前优势与短板

强项（截至当前 1900+ 篇规模）：

- 编程语言与类型理论：完整覆盖 HM / λ / Hoare 链
- 分布式共识：Paxos / Raft / Lamport 主线齐全
- AI Agent 基础设施：MCP / Claude Code / parallel agents / self-evolving 在跟前沿
- 编译器与基础设施：近 30 天最热（444 + 72 commit）

短板：

- 数据库恢复与并发控制（Aries 之外的现代实现纵深不够）
- 网络协议握手与拥塞控制细节
- 形式化方法工具链实操（TLA+ / Coq 写过几个但没沉淀）
- 真实产品工程闭环（知道概念但缺端到端跑通的项目）

## 6. 工件边界

| 想做 | 去哪 |
|------|------|
| 看下一个研究目标 | [推荐队列](/study/queue/) |
| 看项目主题统计 | [项目全景](/study/projects-atlas/) |
| 看论文主题统计 | [论文全景](/study/papers-atlas/) |
| 看方法论 | [7 层方法论](/study/method/) |

具体笔记从左侧分组进，或在主题树里点枢纽节点。

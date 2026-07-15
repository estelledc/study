---
title: 推荐队列
description: 按主题分组的 pillar 项目推荐——961 篇项目笔记的导航起点
sidebar:
  order: 2
---

> 不是"读哪 20 个"的清单，是"先读哪 5 个就能撑起一个领域"的导航。
> 当前站点 961 篇项目笔记 + 1075 篇论文笔记，凑数没有意义，**取舍**才有。
> 每个主题给 3-5 个 pillar：反向链接最多、跨主题被引最广、读完能形成判断。

## 怎么用这页

- 想入门某个领域 → 看对应主题的"先读这几个"
- 想看全景 → 跳到文末 [全景 atlas](#全景-atlas)
- 想读论文枢纽 → 走 [papers-queue](/study/papers-queue/) / [papers-atlas](/study/papers-atlas/)
- 想看挑选标准 → 看 [立场宣言](/study/about/)

---

## 前端与全栈

承上 React 生态、向下到运行时与构建。这条线**反向链接最密**：
[React](/study/projects/react/) 一篇被 68 篇引用，是站点的前端枢纽。

- [React](/study/projects/react/) — 前端枢纽。Lexical / Next / Radix / shadcn 全部反向汇聚到这
- [[shadcn-ui]] — 不是组件库，是代码分发协议
- [[tanstack-query]] — 服务端状态是独立物种，不是 Redux 的子集
- [[zustand]] — 101 行核心 + 反 Provider 派的极简心智
- [[radix-ui]] — 无样式 primitive 的工程化范式

横向对比已写：[[swr]] 与 [[tanstack-query]] 的"全局事件广播 vs Query Observer"对照。

---

## 类型系统与设计工具

类型不是"写完代码再加"，是**先把约束讲清楚再写**。
理论根在论文侧 [[hindley-milner]]（126 反向链接，全站最高）和 [[lambda-calculus]]。

- [[zod]] — schema-first：编译期类型 + 运行时校验同源
- [[trpc]] — 协议消失：函数即 API，类型从 server 流到 client
- [[tanstack-router]] — 类型当 UX 工具：路由、loader、search params 全推断
- [[xstate]] — 把"看起来简单的状态"画成图
- [[effect]] — 函数式错误 + 资源管理，TS 生态的另一个未来

---

## 构建与运行时

`npm run dev` 背后到底在做什么。这条线适合下钻一层、补"看不见的速度差异"。

- [[esbuild]] — 一个人写的 Go 工程美学，比 webpack 快两个数量级的源头
- [[vite]] — dev / build 不对称，现代构建工具的胜出范式
- [[bun]] — 全栈运行时另一条路：性能优先 vs 兼容优先
- [[biome]] — 一个工具替代 ESLint + Prettier 的勇气与判断
- [[turborepo]] / [[nx]] — monorepo 缓存与任务图

---

## 分布式系统

这条线在站点里**论文反向链接最浓**：[[paxos-1998]] (67) / [[raft]] (63) /
[[lamport-1978]] (56) 三篇构成共识与时序的地基。项目侧映射工程化形态。

- [[etcd]] — Raft 的工业级实现，Kubernetes 的状态心脏
- [[tikv]] / [[tidb]] — Raft + Percolator 在生产规模的开源演进
- [[cockroachdb]] — Spanner 思路的开源化（对应论文 [[spanner-2012]]）
- [[temporal]] — 工作流编排：把"长任务 + 重试 + 状态"变成可写的代码
- [Kafka](/study/projects/kafka/) — 事件日志的事实标准；[[pulsar]] 是同问题的另一种回答

---

## 数据库

[[postgresql]] 一个项目笔记被 66 篇反向引用——drizzle / prisma / postgres-js
全汇到这里。论文根 [[bigtable-2006]] / [[aries-1992]] / [[spanner-2012]]。

- [[postgresql]] — 关系数据库的工程枢纽
- [[sqlite]] — 嵌入式 + WAL，单文件数据库的极简哲学
- [ClickHouse](/study/projects/clickhouse/) — 列式 OLAP 的开源王者
- [[duckdb]] — 进程内 OLAP，"SQLite for analytics"
- [[mongodb]] / [[cassandra]] — 文档与宽列两条非关系路线

---

## 基础设施与编排

[[kubernetes]] 项目笔记被 66 篇反向引用，跨容器/调度/网络多主题。
近 30 天 444 commits 集中在这条线，是站点最热的写作区。

- [[kubernetes]] — 基础设施门面
- [[terraform]] / [[pulumi]] — 声明式基础设施的两种世界观
- [[helm]] — Kubernetes 包管理的 de facto
- [[istio]] / [[envoy]] — 服务网格 + L7 代理
- [[prometheus]] / [[grafana]] — 监控的事实组合

---

## 机器学习与 AI 框架

[[pytorch]] 项目笔记被 67 篇反向引用，是 ML 框架枢纽。
论文根 [[attention]] (103) / [[bert]] (42)。

- [[pytorch]] — 动态图 + autograd，论文实现侧的反向引最多
- [vLLM](/study/projects/vllm/) / [[sglang]] — LLM 推理引擎，PagedAttention 与 RadixAttention 两路
- [[ray]] — 分布式 Python 的统一抽象
- [[ollama]] — 本地 LLM 跑起来的最低门槛
- [[comfyui]] — 节点式工作流，AI 图像生产的可编排心智

---

## AI Agent

近 30 天新建 10+ 篇 self-evolving / agent 笔记，是站点正在长出的新主题。
工程焦点：协议、状态机、工具契约。

- [[claude-code]] — 你天天用的工具自己怎么写的，元学习
- [[mcp-ts-sdk]] — MCP 协议设计：让 AI 调用外部世界的最小契约
- [[langchain]] / [[llamaindex]] — 早期 agent 框架的两种取舍
- [AutoGen](/study/projects/autogen/) / [[crewai]] — 多 agent 协作的两条路
- [[anthropic-cookbook]] — 一线工程范式的样本库

---

## 编译器与编程语言

PL 理论在论文侧根扎得最深：[[hindley-milner]] / [[lambda-calculus]] /
[[hoare-logic]] 三篇加起来 253 反向链接。项目侧覆盖 IR 与现代实现。

- [[ast-grep]] — 结构化代码搜索，CST 层的 grep
- [[neovim]] / [[helix]] — 编辑器即编译期前端，模态编辑两条路线
- [[turborepo]] — task graph + 远程缓存，是构建系统也是 PL 思维
- [[arrow-rs]] — 列式内存格式的 Rust 实现，跨语言 IR

---

## 信息检索与向量库

- [[meilisearch]] / [[typesense]] — 全文检索的开发者友好两路
- [[elasticsearch]] — Lucene 之上的事实标准
- [[weaviate]] / [[qdrant]] / [[milvus]] — 向量库三家的取舍
- [[faiss]] — 向量检索的底层算法库
- [[ann-benchmarks]] — 横向 benchmark 的事实参考

---

## 数据可视化

- [[d3]] — SVG 操控的祖宗
- [[echarts]] — 工业级开箱可视化
- [[antv-g2]] / [[antv-g6]] — 语法图 + 关系图两条路
- [[visx]] — D3 + React 的工程化整合
- [[3d-force-graph]] — 三维关系图的现成方案

---

## CLI 与开发者体验

- [[ripgrep]] — grep 替代品，Rust 工程美学样本
- [[fzf]] / [[zoxide]] — 模糊匹配重塑命令行交互
- [[lazygit]] — TUI git 客户端的事实标准
- [[bat]] / [[starship]] — cat 与 prompt 的现代化重写
- [[ast-grep]] — 结构化搜索，比正则准

---

## 区块链

近 30 天 44 篇集中写作。论文根侧侧重共识，项目侧侧重 EVM 与替代 L1。

- [[solana]] — 单链高性能的工程取舍
- [[aptos-core]] — Move 语言 + 并行执行
- [[hardhat]] / [[foundry]] — Solidity 开发框架两路
- [[arbitrum]] — Optimistic Rollup 的代表实现

---

## 图形学与画布

- [[konva]] — 2D canvas 的封装事实标准
- [[excalidraw]] — canvas + 协同的最小心脏
- [[3d-force-graph]] — 三维关系图运行时

论文侧 pillar：[[3d-gaussian-splatting]] (41 反向链接) 是近年 3D 渲染拐点。

---

## 全景 atlas

- 项目全景（961 篇按主题分组、反向链接热度、消化状态）：[projects-atlas](/study/projects-atlas/)
- 论文全景（1075 篇按子领域、pillar 标记、未消化队列）：[papers-atlas](/study/papers-atlas/)
- 论文推荐入口（与本页平行的论文版导航）：[papers-queue](/study/papers-queue/)
- 方法论与挑选标准：[about](/study/about/) / [method](/study/method/) / [papers-method](/study/papers-method/)

## 这页的偏见

- 不收"功能强大但读不出取舍"的项目——读到累但学不到判断力
- 不收同类竞品并列——已收 [[shadcn-ui]] 就不再单独写 Mantine
- 不收维护停滞或商业模式扭曲的项目
- 优先收"心脏代码能在 1-2 个文件读完"的项目——[[zustand]] vanilla.ts 是范例
- 优先收"展示了清晰判断"的项目——[[biome]] 拿掉 ESLint+Prettier 是判断力

如果你觉得某个项目应该进 pillar 或被替换，提"X 应该进，因为 Y"。
反例能改判断；凑数不行。

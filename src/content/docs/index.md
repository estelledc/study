---
title: Jason's Study
description: 1900+ 篇笔记的开源项目与论文研究站点，零基础友好，结论先行
template: splash
hero:
  title: 把开源项目和经典论文，啃成自己的语言
  tagline: 1900+ 篇笔记，每篇 150-200 行，每篇 30 分钟读完。从日常类比起步，零术语假设。给同样想从零基础长出工程判断力的人。
  actions:
    - text: 项目研究
      link: /study/queue/
      icon: right-arrow
    - text: 论文研究
      link: /study/papers-queue/
      icon: open-book
      variant: minimal
    - text: 方法论
      link: /study/method/
      icon: setting
      variant: minimal
---

## 一句话宣言

不是"必读 100 个开源项目"合集，也不是论文摘要堆。是**把每个项目和每篇论文按同一套结构啃下来**，让陌生概念变成能动手的东西。

## 三句话定位

- **规模**：1014 篇论文 + 961 个项目 = 1975 篇笔记，按主题簇组织（分布式系统、编程语言、数据库、操作系统、机器学习、图形学、形式化方法等 19 个主题）。
- **写法**：每篇 150-200 行，统一结构（一句话定位 / Why / How 从日常类比起步 / Hands-on / 与当前工作的连接 / 自检问题）。零术语假设，零基础友好。
- **导航**：站点用反向链接织网，从任一篇都能跳到它的"祖宗"和"后代"。下面列的旗舰笔记是网中节点最密的几篇。

## 进入路径

### 项目研究

读现代开源项目的代码组织、设计取舍、踩坑路径。门面级枢纽：

- [React](/study/projects/react/)（68 反向链接）— 前端枢纽，Lexical / Next / Radix 都向它汇
- [[pytorch]]（67）— ML 框架枢纽，论文实现侧最常被引
- [[kubernetes]]（66）— 基础设施门面，跨容器/调度/网络
- [[postgresql]]（66）— 数据库枢纽，drizzle / prisma / postgres-js 都反向引

### 论文研究

啃经典论文，把"为什么是这条路"讲清楚。地基级 pillar：

- [[hindley-milner]]（126 反向链接）— PL 类型推断祖宗，TS / Rust / Swift 类型系统都通它
- [[attention]]（103）— Transformer 起点，所有 LLM / NLP 笔记的根
- [[paxos-1998]]（67）— 分布式共识地基，Raft / Spanner / Chubby 全反向引
- [[lambda-calculus]]（64）— PL 理论起点
- [[raft]]（63）— 可工程化共识，etcd / TiKV / CockroachDB 反向引
- [[hoare-logic]]（63）— 形式化方法门面

### 方法论

每篇笔记按同一套结构展开：

- **一句话定位**：一行讲清是什么，不堆术语，不抄项目自述。
- **Why**：它解决了什么以前没人解决的问题。
- **How**：从日常类比起步（租房 vs 买房、跑腿 vs 仓库管理员），再切到代码。
- **Hands-on**：30 分钟能跑通的最小命令清单。
- **与当前工作的连接**：能立刻迁移的具体路径，不是抽象建议。
- **自检问题**：留给下次精读时回头查。

完整方法论见 [method](/study/method/)；要找具体笔记走左侧导航或站内搜索。

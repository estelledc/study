---
title: 怎么消化一个 GitHub 项目
description: 7 层方法论——把陌生开源项目变成可立刻迁移的工程养分
sidebar:
  order: 0
---

> 这是这个站点所有项目笔记遵循的方法论。
> 不是拍脑袋的章节清单，是"如何让一个项目从 README 翻译变成你脑子里的可调用工具"。
> 每篇笔记长度 400-700 行不嫌多——浅层笔记一周后会忘，深层笔记会变成肌肉记忆。

## 失败模式（先看这个）

不达标的笔记长这样：

- 段落是 README 翻译，没读过任何源码
- "How" 段是项目自己的话复读一遍
- Hands-on 只是 `npm install + 用一下`，没改过任何东西
- 没和任何竞品对比，看完不知道这个项目和它的"敌人"差在哪
- 自检问题是 ChatGPT 凑数生成的，自己根本不知道答案

如果一篇笔记达成上面任意一条，**这篇笔记不及格，要重做**。

## 7 层结构（约 75 分钟一篇）

### Layer 0 · 身份扫描（5 分钟）

抓硬指标，建立尺度感。命令：

```bash
gh repo view <org/repo> --json stargazerCount,forkCount,licenseInfo,pushedAt,defaultBranchRef
gh api repos/<org/repo>/commits --jq '.[0:10] | .[].commit.committer.date'  # 最近 10 commit 时间
gh api repos/<org/repo>/contributors --jq '.[0:5] | .[].login'              # 主贡献者
```

判断：

- Star < 5k 且 < 1 年 → 新兴项目，记笔记时标"早期"
- 维护者就 1-2 人 → 标"个人项目"，要警惕 bus factor
- 最近 commit > 6 个月前 → 项目可能已死，谨慎推荐

输出到笔记顶部表格：star / version / 最近活跃 / 主语言 / 维护方。

### Layer 1 · 存在理由（10 分钟）

**关键问题**：这东西如果不存在，世界会缺少什么？

操作：

1. 读 README 顶部 5 段
2. 找作者的"manifesto" 文章——通常在 docs/ 顶部、blog 第一篇、或 v1.0 release notes
3. 找 launch HN 帖（搜 `<project name> site:news.ycombinator.com`）

输出：3-5 句话，**用你自己的话**总结 "why this exists"。
拒绝写"它是一个 X 库，提供 Y 功能"——这是 README 翻译。
要写"在它出现之前，做 X 这件事的人都遇到 Y 痛苦；它的核心 insight 是 Z"。

### Layer 2 · 仓库地形（10 分钟）

操作：

```bash
git clone --depth 1 https://github.com/<org/repo>
cd <repo>
ls -la                          # 顶层文件
tree -L 2 -I 'node_modules'     # 二级目录树
```

输出："仓库结构注释表"——每个顶层目录写一句它的角色：

```
apps/v4/              ← 文档站点（Next.js）
packages/cli/         ← npx shadcn 命令的实现
packages/registry/    ← registry schema 与 resolver
templates/            ← 用户 init 时复制的脚手架
scripts/              ← 维护者用的发布脚本
```

然后**找心脏目录**——最被 import 的 / commit 最频繁的：

```bash
git log --format='' --name-only | sort | uniq -c | sort -rn | head -20
```

这 20 个文件就是项目的"热点"，记下其中 2-3 个最关键的，下一层精读它们。

### Layer 3 · 心脏代码精读（20 分钟）

**最重要的一步**。选 1-2 个核心文件通读。

操作：

1. 选定文件（来自 Layer 2 的热点）
2. 完整读完（如果 > 500 行，读最关键的函数）
3. 在笔记里**贴 30-100 行真实代码片段**（不是伪代码！）
4. 给每段代码写"这里在做什么 + 为什么这么写"的旁注

输出：3-5 段"机制揭秘"，每段含：

- 一段 GitHub 永久链接（`https://github.com/<org/repo>/blob/<sha>/path#Lxx-Lyy`）
- 真实代码片段
- 旁注：状态机变化、关键 trade-off、为什么不用更直接的写法

**禁止**：贴一段代码就放那里不解释——如果读者只能在 GitHub 上读到同样的代码，
你的笔记就没价值。

### Layer 4 · 改一处（10 分钟）

操作：

1. 在本地 clone 里改一行核心代码
2. 跑测试（`npm test` 或类似）或跑 example
3. 观察行为变化

例：shadcn 的 button.tsx 把 `forwardRef` 删掉，看 `<Button asChild>` 还能不能用。
TanStack Query 把 `staleTime` 默认值从 0 改成 Infinity，看 devtools 里查询行为。

输出：1 个具体的"我改了 X，发生了 Y"案例。这一步是把抽象的"机制"
变成你身体能感知的因果。

### Layer 5 · 横向对比（10 分钟）

找 1-2 个直接竞品。**要找哲学不同的，不是同一流派的下位替代**。

例：

- shadcn-ui ↔ MUI（哲学差异：代码分发 vs npm install）
- TanStack Query ↔ SWR（哲学差异：显式 invalidation vs revalidate）
- Hono ↔ Express（哲学差异：边缘运行时优先 vs Node 优先）
- Drizzle ↔ Prisma（哲学差异：SQL-first vs schema-first）

输出：对比表（不只是功能差异，还有设计哲学差异），加一句
"什么场景选 A，什么场景选 B"。

### Layer 6 · 与当前工作的连接（5 分钟）

写明 3 件事：

1. **今天就能用的部分**：你正在做的项目里，哪个文件能立刻替换成这个工具
2. **下个月能用的部分**：需要一些重构准备的迁移路径
3. **不要用的部分**：这个项目里有些设计不适合你的场景，明确标出来

输出：迁移路径（含优先级），以及"不要的"清单。

### Layer 7 · 自检 + 延伸阅读（5 分钟）

**自检问题**：3-5 个**你目前答不上来**的具体问题。
不是"这个库的设计哲学是什么"——这是空话。
要像："`useQuery` 在组件 unmount 后，AbortController 是在哪里被 abort 的？追到具体行号。"

**延伸阅读**：精读完心脏文件后，下一步该读哪 2-3 个文件，按什么顺序，回答什么问题。

## 笔记输出结构（按层映射）

```markdown
---
title: <项目名> — <一句话定位>
description: ...
sidebar:
  label: <项目名>
  order: <序号>
---

| 项目 | 信息 |
|------|------|
| Layer 0 数据填这里 |

## 一句话定位
（Layer 1 输出）

## Why（为什么推荐你看）
（Layer 1 输出，3-5 句作者意图 + 你的转译）

## 仓库地形
（Layer 2 输出：目录注释表 + 心脏文件标识）

## 核心机制
（Layer 3 输出：3-5 段代码精读，每段含 GitHub 永久链接 + 代码 + 旁注）

## Hands-on（含改一处实验）
（Layer 4 输出：30 分钟跑通命令 + 1 个具体修改实验）

## 横向对比
（Layer 5 输出：对比表 + 选型建议）

## 与你当前工作的连接
（Layer 6 输出：今天/下月/不要 三段）

## 自检问题 + 延伸阅读
（Layer 7 输出）
```

## 时间分配的取舍

完整 7 层做完约 75 分钟，对应一篇 400-700 行 markdown。

如果时间紧（30 分钟轻量版）：跳 Layer 4 + Layer 5，但**绝不跳 Layer 3**（贴真实代码 + 旁注）。
没读过源码的笔记没有价值，是这个站点的硬底线。

## 这套方法的来源

不是凭空发明，参考了：

- 抖音 / Linear 工程团队的 "code archaeology" 实践
- Julia Evans 的 zine 写作法（一页讲清一个概念）
- "How to read papers" 的 three-pass 读法迁移到代码
- Karpathy 的"读代码先读 train loop"的项目入门法

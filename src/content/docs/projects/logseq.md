---
title: Logseq — 块结构离线知识库
来源: 'https://github.com/logseq/logseq'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

Logseq 是一个把笔记拆成一小块一小块，再自动连成知识图谱的开源知识库。

日常类比：它像一本会自己长索引的活页本。你只管把想法写成条目，哪怕今天写在日记里，明天写在项目页里，只要提到同一个名字，它就能把两处牵到一起。

最小例子长这样：

```markdown
- 今天读 [[Logseq]]
  - 发现每一段都是一个 block
  - TODO 把 [[双链笔记]] 的想法整理成卡片 #writing
```

这里的 `[[Logseq]]` 和 `[[双链笔记]]` 是页面引用，`TODO` 把普通条目变成任务，`#writing` 给块打标签。

和传统 Markdown 文件最大的差别是：Logseq 不只关心“这一页写了什么”，还关心“这一块和哪些块相连”。

## 为什么重要

不用 Logseq 这类块结构工具，下面这些事会变得很难：

- 笔记散在几十个文件里，后来想找“所有提到某个项目的段落”，只能全文搜索碰运气。
- 复盘时你会复制同一段判断标准，久了以后多个版本互相打架。
- 任务、日记、阅读摘录混在一起，没有办法按日期、标签、状态重新组合。
- 想保留本地 Markdown / Org-mode 文件，又想要 Roam 式双链和图谱，常常只能二选一。

Logseq 的价值不是“多一个编辑器”，而是把个人知识库从文件夹思维换成图结构思维。

## 核心要点

1. **块是最小单位**。类比：不是整本书上架，而是每张便利贴都有地址。Logseq 里的一个缩进条目就能被引用、折叠、查询和移动。

2. **链接自动变成索引**。类比：你在多处写同一个人名，通讯录会自动列出所有相关记录。`[[page]]`、标签和引用让散落的块聚合到同一个页面。

3. **本地优先但不封闭**。类比：菜谱本放在你家抽屉里，但可以贴便利签、拍照、同步到别处。文件图以 Markdown / Org-mode 为主，DB 图则在保留导出能力的同时强化属性、表格、同步和协作。

## 实践案例

### 案例 1：用 daily journal 接住零散输入

```markdown
- 上午开会记到 [[搜索体验]]
  - 用户说“结果太散”，先标成 #feedback
- 下午读文档
  - TODO 回看 [[搜索体验]] 的失败案例 SCHEDULED: <2026-07-08>
```

逐部分解释：

- 第一行把当天会议和 `[[搜索体验]]` 页面连起来，以后打开这个页面能看到这条反向引用。
- `#feedback` 不是文件夹，而是跨页面集合；同一天的别的反馈也能被聚到一起。
- `SCHEDULED` 给任务一个日期，Logseq 会把它放进对应时间视图。

这个案例来自官方文档里的 journal、任务和引用能力：日记页自动按日期出现，日期也能通过属性创建 journal。

### 案例 2：把任务写在语境里，而不是搬到单独清单

```markdown
- [[实习周报]]
  - TODO [#A] 写本周学到的 3 个概念 DEADLINE: <2026-07-10>
  - DOING 整理代码评审反馈 #mentor
  - LATER 每天 20 分钟清 inbox SCHEDULED: <2026-07-07 21:00 .+1d>
```

逐部分解释：

- `TODO / DOING / LATER` 是任务状态，能用快捷键或斜杠命令切换。
- `[#A]` 是优先级，适合把最重要的任务浮出来。
- `DEADLINE` 和 `SCHEDULED` 都能挂在普通块上；`.+1d` 表示完成后按完成时间推下一次。

这不是单独的待办软件思路：任务仍然留在它发生的项目页、会议页或日记页里。

### 案例 3：用 query 把分散信息重新捞出来

```clojure
#+BEGIN_QUERY
{:title "最近 7 天提到 Logseq 的块"
 :query [:find (pull ?b [*])
         :in $ ?start ?today ?tag
         :where
         (between ?b ?start ?today)
         (page-ref ?b ?tag)]
 :inputs [:-7d :today "logseq"]}
#+END_QUERY
```

逐部分解释：

- `:find` 说明要返回什么，这里返回匹配到的块。
- `between` 把范围限制在最近 7 天到今天。
- `page-ref` 要求块里引用过 `logseq` 这个页面。

官方 advanced queries 文档用 Datalog 查询本地图数据库；新手不必一上来学全，只要知道 query 是“向笔记库提问”。

## 踩过的坑

1. **把页面当文件夹**：Logseq 的强项是块和引用，不是把一切塞进深层目录；文件夹越深，双链价值越弱。

2. **到处复制块内容**：复制会制造多个事实来源；需要复用结论时，优先考虑 block reference 或 embed。

3. **一开始就重度写高级 query**：高级查询基于 Datalog，语法陌生；先用简单 query 和标签跑通流程，再写复杂条件。

4. **把 DB 版当稳定主库**：官方 README 明确提醒 DB 版仍有 beta / alpha 部分，重要资料应先备份或放测试图。

## 适用 vs 不适用场景

**适用**：

- 个人知识管理：阅读摘录、日记、项目复盘、会议记录互相引用。
- 任务和笔记强相关：你希望待办留在上下文里，而不是被搬到孤立清单。
- 本地优先：你在意数据可导出、可备份、可用普通文本工具检查。
- 想学图结构思维：先从 `[[page]]`、block、tag 这些小概念开始。

**不适用**：

- 只想写长文章：纯 Markdown 编辑器更安静，比如 [[marktext]]。
- 团队需要强权限、表单、数据库视图：Notion / Coda 这类协作产品更省事。
- 不愿接受学习曲线：query、属性、block reference 都需要一点建模意识。
- 不能承担 beta 风险：DB 图、RTC 和新移动端还在变化，关键资料要谨慎迁移。

## 历史小故事（可跳过）

- 2020 年前后，Roam Research 带火了“段落即节点”的双链笔记体验，但它不是开源本地优先路线。
- Tienson Qin 发起 Logseq，把类似 outliner + 双链图谱的体验放到开源项目里。
- 社区很快围绕插件、主题、模板和教程扩展出个人知识管理生态。
- 2024 年后，Logseq 团队开始公开推进 DB 图，把页面和块统一叫 node，并加入更强的属性、表格、同步与协作方向。
- 到 2026 年，GitHub 仓库已经是 4 万 star 级别项目，但官方仍提醒新 DB 能力要备份和测试。

## 学到什么

- 好的笔记系统不是“文件更多”，而是让每一条想法都有可追踪的位置。
- 双链的本质是减少人工整理：你写引用，系统替你维护入口。
- 本地优先和协作并不天然冲突，但会带来同步、迁移、备份这些工程代价。
- 对新手来说，先稳定使用 journal、tag、task，再逐步进入 query 和属性系统，最不容易弃坑。

## 延伸阅读

- 官方仓库：[logseq/logseq](https://github.com/logseq/logseq)
- 官方文档入口：[docs.logseq.com](https://docs.logseq.com/)
- DB 图说明：[Logseq DB version](https://github.com/logseq/docs/blob/master/db-version.md)
- 任务文档：[Tasks](https://github.com/logseq/docs/blob/master/pages/Tasks.md)
- 高级查询文档：[Advanced Queries](https://github.com/logseq/docs/blob/master/pages/Advanced%20Queries.md)
- [[foam]] —— VS Code 里的 Markdown 双链知识库

## 关联

- [[foam]] —— 同样用 `[[wikilink]]` 组织知识，但更贴近 VS Code 文件工作流
- [[marktext]] —— 更像纯 Markdown 写作工具，适合作为“只写长文”的对照
- [[emacs]] —— Org-mode 是 Logseq 支持的另一种笔记语法来源
- [[sqlite]] —— DB 图导出和本地数据库思路可以从它理解
- [[markdown-it]] —— Markdown 渲染层面的工具，和 Logseq 的块语义形成对照
- [[ripgrep]] —— 本地文件可搜索是本地优先知识库的底层安全感

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

---
title: the_silver_searcher (ag) — 比 grep/ack 快一个数量级的代码搜索
来源: 'https://github.com/ggreer/the_silver_searcher'
日期: 2026-05-31
分类: 命令行工具
难度: 初级
---

## 是什么

`the_silver_searcher`（命令行名 **ag**）是一个用 C 写的命令行**代码搜索工具**。日常类比：你在一个堆满抽屉的房间里找一张写着"TODO"的便签，`grep -r` 会把每个抽屉一格一格翻；ag 雇了 8 个人同时翻，并且**自动跳过房间里那些已经贴了"勿动"标签的柜子**（比如 `node_modules` 和 `.git`）。

最小例：

```bash
ag "useState" src/
```

这一行就把 `src/` 下所有出现 `useState` 的位置打印出来，文件名 + 行号 + 高亮。它默认会读 `.gitignore` 把那些已被 git 忽略的目录（依赖、构建产物）跳过，所以在大仓里几乎是按完回车就出结果。

ag 在 2013 年的 benchmark 里搜一个 8GB 的代码库只用 3.2 秒，同样输入 ack 要 110 秒，约 34 倍。

## 为什么重要

不理解 ag 这一类工具，下面这些事都没法解释：

- 为什么资深开发在 vim 里按 `\g` 就出结果，而你 `grep -r` 要等十几秒
- 为什么很多教程让你写 `.ignore` 文件而不是直接改 `.gitignore`——这是搜索器的私活
- 为什么 2016 年 Rust 写的 ripgrep 一发布就被吹爆——它在抢的是 ag 的位置
- 为什么"搜索快"会改变写代码的方式——你会更敢做大重构，因为找引用不再是负担

## 核心要点

ag 比 grep 快不靠魔法，靠**三件套**：

1. **mmap 读文件**：把文件用 `mmap` 直接映射到进程地址空间，`grep` 默认走 `read` 一块块拷到 buffer，ag 跳过这一步。类比：`read` 是把书一页页复印一份再读，`mmap` 是直接把书摊开在桌上读。

2. **pthreads 多线程**：一个遍历线程负责走目录树，多个工作线程并行扫文件。grep -r 是单线程串行。类比：grep 是一个人翻所有抽屉，ag 是一队人分工。

3. **算法分层**：字面量（不带正则）走 **Boyer-Moore**，能跳着比；正则走 **PCRE 的 JIT**（PCRE 是 Perl 兼容的正则引擎，JIT 把正则编译成机器码再执行）。类比：找"TODO"四个字时不用挨个对，可以从后往前看完不匹配直接跳一截。

加上**默认尊重 .gitignore**，省下扫 `node_modules` 的几百 MB——这才是日常感受到的"快"的最大来源。

## 实践案例

### 案例 1：在大型 monorepo 里搜函数定义

```bash
ag -G '\.tsx?$' "function handleSubmit"
```

**逐部分解释**：

- `-G '\.tsx?$'` 用正则限定文件名以 `.ts` 或 `.tsx` 结尾，只在这些文件里搜
- `"function handleSubmit"` 是要找的字面量
- 没写路径，默认从当前目录递归
- 自动跳过 `.gitignore` 里的 `node_modules` / `dist` / `.next`，所以即便仓库 200MB 也是秒级

如果改用 `grep -r "function handleSubmit"`，会被 `node_modules` 拖到几十秒甚至卡死。

### 案例 2：和 vim/neovim 联动做"跳到引用"

在 `.vimrc` 里加：

```vim
let g:ackprg = 'ag --vimgrep --nocolor --nogroup --column'
```

之后在 vim 里 `:Ack handleSubmit`，所有匹配会进 quickfix 列表（vim 内置的"搜索结果待跳转"面板），按 `:cn` `:cp` 跳转。

- `--vimgrep` 让每行输出都是 `file:line:col:match` 格式，vim 直接能解析
- `--nogroup` 关掉"按文件分组"，每个匹配独立一行，方便 quickfix
- 等于给 vim 装了一个"找所有引用"按钮，不用 LSP 就够日常用

### 案例 3：写 `.ignore` 文件让结果更干净

仓库根放一个 `.ignore`：

```
/dist
/coverage
/snapshots
*.min.js
```

这告诉 ag："除了 `.gitignore` 之外，再额外忽略这些路径"。常用于：

- `dist/` 是本地构建产物，没进 `.gitignore`（团队约定不忽略）但你不想搜
- `*.min.js` 没人想读压缩后的代码
- `snapshots/` 测试快照，搜出来全是噪音

`.ignore` 跟 `.gitignore` 语法相同，但只对搜索器（ag / ripgrep）生效，不影响 git。

## 踩过的坑

1. **`.gitignore` 双星 `**` 不支持**：写 `**/dist` 在 git 里有效，在 ag 里被静默忽略。要写 `/dist` 或 `dist/`。原因：ag 自己实现了 gitignore 解析器，比 git 的弱。

2. **单星 `*` 必须有前导 `/`**：`*.log` 在 ag 里**不会**忽略所有 `.log` 文件，得写 `/*.log` 或在每个目录单独放规则。这是 ag 的 ignore 解析器的一个老坑。

3. **mmap 遇到超大单文件反而慢**：搜一个 10GB 的 `app.log` 时 ag 会试图 mmap 整个文件，物理内存不够就走交换甚至 OOM。这种场景用 `grep` 流式读反而快。

4. **`.agignore` 已废弃**：2.0 之前用 `.agignore`，2.0 起统一改 `.ignore`。老博客教程里的 `.agignore` 现在写了不生效，是 silent fail。

## 适用 vs 不适用场景

**适用**：

- 在 git 仓库里搜代码、找引用、找 TODO（最主流的用法）
- 配合 vim / emacs / VSCode 做"跳到引用"的轻量替代
- 对 `grep` / `ack` 不满、又还没切到 ripgrep 的人
- 做大重构时反复确认"还有谁在调这个函数"

**不适用**：

- 搜超过物理内存的单文件日志 → 用 `grep` 或 `rg --no-mmap`
- 需要解析 AST 才能正确匹配（比如"所有作为参数传入的 useState"）→ 用 [[ast-grep]]
- 需要交互式过滤搜索结果 → 配合 [[fzf]]
- 已经在用 [[ripgrep]]：rg 在大多数 benchmark 里更快、ignore 解析更准、Unicode 支持更好；多数机器上 rg 已是默认更优选择，没必要回切

## 历史小故事（可跳过）

- **2011 年底**：Geoff Greer 在公司用 ack 搜代码慢得受不了，索性自己用 C 重写，强调"快 + 默认尊重 .gitignore"，年底在博客发文 *The Silver Searcher: Better Than Ack* 公开 benchmark。
- **2012-2013 年**：项目快速涨星到上万，名字"silver-searcher"据说取自托尔金笔下的精灵银 mithril 双关。
- **2014-2017 年**：ag 成为前端 / 系统程序员的默认搜索器，集成进 vim ack.vim / emacs ag.el / fzf.vim。
- **2016 年起**：[[ripgrep]] 用 Rust 重写并发布对比文，速度更快、ignore 解析更准、维护更活跃，社区注意力开始迁移；同年 ag/rg 约定统一用 `.ignore`。
- **现在**：ag 仍在 26k+ stars 量级被维护，Apache-2.0，但增长曲线已经平了，rg 是更主流的下一代选择。

## 学到什么

1. **快 = 不做不必要的工作**：ag 的"快"七分来自跳过 `node_modules`，三分来自 mmap + 多线程。先省 I/O，再谈优化。
2. **CLI 工具的护城河是默认行为**：默认尊重 `.gitignore` 这一个决定，比任何性能优化都更影响日常体感。
3. **同一个生态位会被新语言重写**：ack（Perl）→ ag（C）→ rg（Rust），每一代都在前一代的 benchmark 上踩着上去。这是命令行工具领域的常态。
4. **mmap 不是银弹**：超大单文件场景反而是它的弱项，工具选型要看输入分布。

## 延伸阅读

- 作者博客原文：[The Silver Searcher: Better Than Ack](https://geoff.greer.fm/2011/12/27/the-silver-searcher-better-than-ack/)（2011 立项，2013 收尾，作者讲为什么要写）
- 仓库 README：[ggreer/the_silver_searcher](https://github.com/ggreer/the_silver_searcher)（含完整 flag 列表 + 各平台安装命令）
- 社区 wiki：[Advanced Usage](https://github.com/ggreer/the_silver_searcher/wiki/Advanced-Usage)（讲 .ignore 语法陷阱）
- ripgrep 作者的对比文：[ripgrep is faster than {grep, ag, git grep, ucg, pt, sift}](https://blog.burntsushi.net/ripgrep/)（2016，基本是 ag 落幕的分水岭）
- [[ripgrep]] —— 同一生态位的下一代产品，建议直接学这个

## 关联

- [[ripgrep]] —— Rust 写的下一代代码搜索器，ag 的精神继承者，更快更准
- [[ast-grep]] —— 不再按字符串而是按 AST 匹配，搜"作为参数的 useState"这种结构化模式
- [[fzf]] —— 模糊查找器，常和 ag/rg 组合：`ag pattern | fzf` 做交互式过滤
- [[fd]] —— sharkdp 写的"找文件名"工具，跟 ag/rg 的"找内容"互补
- [[broot]] —— 交互式目录树，可以跟 ag 一起用作仓库巡视
- [[ranger]] —— 终端文件管理器，常配合 ag 在仓库里跳转

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[sonic]] —— Sonic — 极简前缀搜索引擎
- [[tantivy]] —— Tantivy — Rust 版 Lucene

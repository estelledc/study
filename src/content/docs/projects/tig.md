---
title: tig — 老牌 ncurses git 浏览器，把 log/blame/diff 玩到骨子里
来源: https://github.com/jonas/tig
日期: 2026-05-31
分类: cli
难度: 入门
---

## 是什么

tig 是 **Jonas Fonseca 2006 年开始用 C 写的 ncurses 文本界面 git 浏览器**。它和 [[gitui]] / [[lazygit]] 都属于"git TUI"这个大类，但定位不同——tig 主打**看 log、查 blame、读 diff**；status 视图也能 stage / commit，但 push / rebase 这类完整写工作流默认仍回 git CLI。

日常类比：

- **lazygit / gitui 是终端里的图形客户端**——能看也能改，菜单铺满整屏
- **tig 是 git 的高级 less**——浏览为主，键位贴 vim/less；暂存像"在 less 里顺手勾几行"，不是整套 IDE

数据上看：截至 2026-05，约 13.2k stars、2900+ commits、最新常见发行版 2.6.0（2025-09）。代码库 C 约 82%、Shell 约 15%，跑在 ncurses 上。有 git + ncurses 后 `make && make install` 即可。

## 为什么重要

不理解 tig 的设计取舍，下面这些事都没法解释：

- 为什么一个 2006 年的项目到 2026 年还在更新——需求很窄、底层 API 稳，**没什么需要追的潮流**
- 为什么"浏览向 git TUI"长期有市场——`git log --oneline` 看几屏没问题，看几千个 commit 就需要分页 + 跳转 + 搜索
- 为什么用 C + ncurses 而不是 Rust + ratatui——历史包袱是一面，**ncurses 够用且依赖少**也是一面
- 为什么 blame 体验比原生命令顺——光标移动、按 `,` 追该行 parent、回车直接看那个 commit；这比反复敲 `git blame` / `git show` 省一截心智

## 核心要点

tig 的设计可以拆成 **4 件事**：

1. **复用 git porcelain 输出**：不调 libgit2、不读 `.git` 内部，而是 fork `git log --pretty=raw` 再解析。和 [[lazygit]] 同源思路，慢一点，但**跟得上 git 主仓新功能**（sparse-checkout / LFS / partial clone）。
2. **核心视图**：main（log）/ diff / blame / status（可 stage）。键盘 `hjkl` 移动，回车展开下一层；多视图可水平分屏。
3. **键位贴 vim/less**：`j/k` 上下、`/` 搜索、`n/N` 跳结果、`q` 退出、`:` 命令模式。学过 vim 几乎零成本上手。
4. **pager 模式当 less 替代**：`git show HEAD | tig` 可当分页器；很多人配 `git config core.pager tig`。
   类比：less 负责"翻页看字"，tig 负责"翻页看 git 语义"（高亮 diff、回车进 commit）。

## 实践案例

### 案例 1：大仓库里追一行代码的修改链

```bash
cd ~/code/some-big-repo
tig blame src/parser.c
# j/k 移到目标行 → Enter 看引入该改动的 commit
# 在 blame 里按 , （逗号）→ 加载该行 parent blame
# 再按 < （Shift+,）可退回更近的一层
```

**逐部分解释**：

- `tig blame` 全屏：左作者+hash，右源码
- 默认 parent 键是 `,`（move to parent）；若想用 `P`，在 `~/.tigrc` 写 `bind blame P parent`
- 整条链路不离开 tig；CLI 要反复 `git log -L` / `git blame`

### 案例 2：当 git 默认 pager

```bash
git config --global core.pager tig
git log
# j/k 滚动、回车展开 commit、/ 搜索；q 退回 shell
```

这一步把 tig 从"偶尔打开的独立工具"变成 git 输出的副驾驶：习惯不变，输出超一屏就自动有分页与跳转。

### 案例 3：能 stage/commit，但不做完整写工作流

```bash
tig status          # 或在 tig 里按 s
# 光标在文件上按 u → stage / unstage（类似 git add）
# 按 c → 进入 stage 视图，可按 chunk 精修暂存
# 在 status 视图按 C → 调用 git commit
# 想 push / rebase -i → 仍回 git CLI（或自写 :! 绑定）
```

**边界**：浏览 + 有限暂存/提交是内建能力；push、interactive rebase、改 config 不是默认菜单项——那是 [[lazygit]] / [[gitui]] 的赛道。

### 案例 4：和 fzf / delta 串起来

```bash
# 命令模式 :! 调外部命令
:!git log --oneline | fzf
# 或在 ~/.tigrc 把 delta 绑成外部 diff 渲染
```

扩展方式是 **`.tigrc` 的 `bind` + `!` 外部命令**，没有插件市场，但够用。
想把常用外部命令固化成一键，就在配置里写一行 `bind`，比学一整套插件 API 轻。

## 踩过的坑

1. **macOS 系统 ncurses 偏旧**：`brew install tig` 通常没问题；自编译需 `./configure --with-ncursesw`，否则 256 色 theme 易花屏。
2. **大仓首次进 main 慢**：启动会跑 `git log` 装入历史，约 30 万 commit 可能等 5–10 秒；之后翻页在内存里很快。lazygit/gitui 异步加载无此停顿。
3. **blame 的 `,` 在 merge 上走 first-parent**：线性历史很顺；merge 可能漏另一侧引入点。可用 `set blame-options = --first-parent` 或按需改选项。
4. **`/` 搜的是屏幕可见文本**：main 里是短 hash/作者/标题首行，不是完整 message 或 diff；搜 message 用 `:` 跑 `git log --grep`。
5. **无 Windows 原生 GUI fallback**：纯 ncurses，需 WSL/Cygwin；[[gitui]] / [[lazygit]] 在这点更友好。

## 适用 vs 不适用场景

**适用**：

- SSH 到机器查历史——只要 git + ncurses，不必装 Rust/Go runtime
- 想升级默认 pager——`core.pager tig` 一行配置
- 重度 blame——`, ` / `<` 追溯链路很顺手
- 喜欢 vim/less 键位，不想再学 lazygit 快捷键表
- 依赖洁癖——主要链 ncurses + 调用系统 git

**不适用**：

- 要在终端里完整管 git（频繁 push / rebase / 多分支操作）——去 [[lazygit]] / [[gitui]]
- Windows 原生（不上 WSL）——ncurses 路径别扭
- 巨型仓库要求秒开——首屏构建 commit list 非异步
- 团队大量新人——视图切换不如菜单型 TUI 直观
- 要鼠标 / GUI——tig 键盘驱动

## 历史小故事（可跳过）

- **2006**：Jonas Fonseca 嫌 `git log` 翻页不顺，写出第一版 tig；git 本身 2005 年才发布，周边几乎空白
- **2008–2012**：成为终端浏览历史的事实标准之一，进入 Debian / Ubuntu / Homebrew
- **2013–2020**：维护变慢，每年小版本；lazygit（2018）/ gitui（2020）等新世代 TUI 出现
- **2021–2025**：项目仍在更新，2.6.0 于 2025-09 发布（近期提交含 Thomas Koutcher 等）；约 13k stars，说明"浏览历史"是真长期需求

## 学到什么

1. **"浏览优先"可以是独立产品定位**——不必和 lazygit 争全功能赛道；收窄范围是长寿原因之一
2. **复用 porcelain vs 直读 .git**——跟主仓功能 vs 性能/控制力，各有理由（对照 [[gitui]] 的 libgit2）
3. **复用 vim/less 键位是隐藏产品力**——零迁移成本往往比自创漂亮键位更长寿
4. **C + ncurses 在 2026 仍可合理**——逻辑简单、依赖稳的工具，老栈未必该重写
   选型标准可以是"还要不要追生态潮流"，而不是"是不是新语言"

## 延伸阅读

- 项目主页：[jonas/tig](https://github.com/jonas/tig)
- 官方手册：[tig manual](https://jonas.github.io/tig/doc/manual.html)（视图、键位、tigrc）
- ncurses 入门：[NCURSES Programming HOWTO](https://tldp.org/HOWTO/NCURSES-Programming-HOWTO/)
- [[gitui]] —— 同品类 Rust 实现
- [[lazygit]] —— 同品类 Go 全功能 TUI

## 关联

- [[gitui]] —— Rust + libgit2 vs C + git 子进程的两条路线
- [[lazygit]] —— 全功能 git TUI，写操作更全
- [[delta]] —— diff 渲染，可作 tig 外部 viewer
- [[fzf]] —— 经 `:!fzf` 嵌入模糊搜索
- [[ripgrep]] —— 同样"专注一件事"的工程哲学

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

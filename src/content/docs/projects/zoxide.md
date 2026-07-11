---
title: zoxide — 学会你常去哪的智能 cd
来源: 'https://github.com/ajeetdsouza/zoxide'
日期: 2026-05-30
分类: cli
难度: 初级
---

## 是什么

zoxide 是一个**会记住你常去哪些目录的 cd 替代品**。日常类比：像浏览器地址栏——你输 "git" 它就把 github.com 排第一，因为你天天去；冷门网站再准也排不到前面。

你写：

```bash
z proj
```

它从你过去 cd 过的所有目录里，挑一个 **最常去 + 最近去过 + 名字带 "proj"** 的，直接跳过去。等价于你手敲：

```bash
cd "$HOME/projects/big-project/services/api"
```

底层是 **Rust 单二进制 + 自有二进制小数据库**（默认在 `~/.local/share/zoxide/db.zo`，存"路径、访问分数、最后访问时间"三元组，不是 SQLite）。第一次用要先 `cd` 一遍学路径，之后就只敲关键词。

## 为什么重要

不理解 zoxide，下面这些事都没法解释：

- 为什么 dotfiles 仓库里几乎每个高 star 模板都默认装它，把 cd 直接 alias 成 z
- 为什么 z.sh / autojump 这两个老 shell 脚本被 Rust 党集体抛弃——同一个想法 zoxide 启动只要 5ms，老脚本要 100ms+
- 为什么 "frecency" 这个词从 Firefox 地址栏走出来，变成 CLI 工具圈的标配排序术语
- 为什么 `z foo` 偶尔跳错地方——它不是按字母序，是按你"过去用得多不多 + 最近用没用"

## 核心要点

zoxide 的工作可以拆成 **三步**：

1. **学习**：你每 cd 一次，zoxide 把目标路径写进数据库，访问次数 +1，时间戳更新。类比：地址栏每次你点过的网址都加 1 分。

2. **打分**：你输 `z foo`，zoxide 把匹配的路径拿出来，按 **frecency** 打分——基础分是访问次数；再按"多久没去过"乘系数（一小时内 ×4、一天内 ×2、一周内 ×0.5、更久 ×0.25）。然后 `cd` 到分最高的。

3. **衰减**：环境变量 `_ZO_MAXAGE` 默认 **10000**，限制的是库里**分数总和**（不是条目数）。总和超了就把每条分数按比例压低，压到低于 1 的条目删掉。所以很久不去的目录会自然消失——不需要你手动维护。

三步合起来就是教学版 **frecency ≈ frequency × recency**：常去的 + 最近去过的，权重最高。

## 实践案例

### 案例 1：装上、初始化、第一次用

```bash
brew install zoxide              # macOS；Linux 可用 apt / cargo install zoxide
echo 'eval "$(zoxide init zsh)"' >> ~/.zshrc
source ~/.zshrc

cd ~/projects/big-project        # 先 cd 一次让它学
cd ~                              # 回家
z proj                            # 跳回 ~/projects/big-project
```

`zoxide init zsh` 不是装包，是**让 zoxide 把 z / zi 这两个 shell 函数注入到当前 shell**。没 eval 这一步，命令行只有 `zoxide` 二进制能用，不会有 `z` 这个简短入口。

每个 shell 注入的函数体长这样（zoxide init 输出，简化版）：

```bash
function z() {
  local result=$(zoxide query --exclude "$PWD" -- "$@")
  cd "$result"
}
```

也就是说 `z` 等同于"问 zoxide 一句、cd 过去"，逻辑全在 zoxide 二进制里，shell 只剩一层薄壳。

### 案例 2：多关键词消歧

```bash
# 你有两个目录都带 'foo'：~/work/foo 和 ~/notes/foo-archive
z foo            # 只筛含 foo 的路径，再按 frecency 取 top-1
z work foo       # 路径里要同时按顺序出现 work 和 foo → 只剩 ~/work/foo
z notes foo      # 同理只剩 ~/notes/foo-archive
```

**逐步对照**：`z foo` 两个都匹配，谁 frecency 高谁赢；加 `work` / `notes` 是再加一道过滤，不是换排序公式——所以能压过"单纯 foo 的盲跳"。

### 案例 3：zi 交互模式（配合 fzf）

```bash
zi proj
```

弹出 fzf 选单，把所有匹配 "proj" 的目录按 frecency 排好让你看。再输几个字过滤，回车跳。

**适合你不确定排第一的是不是想要的那个**——比 z 更安全，比 cd 更快。日常工作流：

- 频繁去的 5 个目录用 `z 关键词`（盲打最快）
- 偶尔去的、记不清完整名字的用 `zi 关键词`（fzf 选）
- 全新目录或临时去一次用普通 `cd`（不污染数据库也行）

## 踩过的坑

1. **没在 rc 里 eval zoxide init**：装了 zoxide 二进制但 shell 里 `z` 命令找不到——zoxide 不是 alias，是 init 时动态注入的 shell 函数，必须 `eval "$(zoxide init zsh)"` 才生效。

2. **第一次用直接 z foo 报 no match**：数据库是空的，zoxide 没有"扫盘"功能，必须靠你 cd 一次次教。前两天会觉得它没用，过一周才显威力。

3. **多个候选时跳错**：z 默认只返回 top-1，不是字母序最近的。想看所有候选用 zi（fzf 选单），不要硬猜。

4. **z.sh 和 zoxide 同时装**：两个都注册 z 函数，后 init 的覆盖先 init 的，但**数据库不互通**——历史记录只在一个里。装 zoxide 前先把 .zshrc 里 z.sh 的 source 注释掉。zoxide 自带 `zoxide import` 子命令可以把老 z.sh / autojump 的库导过来，别白白丢了几个月的训练数据。

## 适用 vs 不适用场景

**适用**：
- 经常在 5-50 个固定项目目录间跳来跳去（前端 monorepo / 多服务后端 / 学习仓库）
- 习惯命令行多于 GUI 文件管理器，cd 是你最高频命令之一
- 喜欢 Rust 工具链（fd / ripgrep / bat / eza / sd）的零依赖单二进制风格

**不适用**：
- 你的目录每天都在变（临时容器、CI 沙箱）——zoxide 学不到稳定模式
- 你只在 1-2 个目录工作，cd 一次就不出来——上 zoxide 是杀鸡用牛刀
- 你需要跳到从没去过的新目录——zoxide 不会魔法，必须先 cd 学一次
- 你的 shell 是非主流（rc / xonsh 早期版本）——init 模板可能不存在

## 历史小故事（可跳过）

- **2006 年**：Firefox 2.0 引入 frecency 地址栏排序——访问次数 × 时间衰减。那时还没人想到把这思路搬到 shell。
- **2009 年**：rupa 写 z.sh（500 行 bash），第一次让 shell 有 frecency 跳转。慢，但能用。
- **2010 年**：wting 用 Python 写 autojump，加了模糊匹配和数据库。比 z.sh 快但启动还是慢（Python 解释器冷启）。
- **2018 年**：Ajeet D'Souza 用 Rust 重写成 zoxide。启动从 100ms 降到 5ms，零依赖单二进制，覆盖 5 种 shell。
- **2022 年起**：被几乎所有热门 dotfiles 模板默认装上，事实上替代了 z.sh。
- **2026 年现在**：3 万+ star，社区把它当 "cd 默认替代" 来推荐，初学 Linux 的教程开始把 zoxide 写进第一周配置。

## 学到什么

1. **frecency 是个跨领域工程模式**——浏览器、编辑器最近文件、IDE 跳转、CLI 跳转，全都用它
2. **shell 函数注入是 CLI 工具的常见落地方式**——eval 一行字符串往当前 shell 塞函数，不需要修改 shell 本身
3. **Rust 重写老 shell 工具是 2018-2024 的大潮**——启动延迟和单二进制分发是核心吸引力
4. **数据库要有衰减机制**——否则一年后排第一的还是你大学时打开过 200 次的那个目录

## 延伸阅读

- 官方 wiki：[zoxide algorithm](https://github.com/ajeetdsouza/zoxide/wiki/Algorithm)（讲 frecency 公式细节）
- 视频：[YouTube — Why I replaced cd with zoxide](https://www.youtube.com/results?search_query=zoxide+cd+replacement)
- 概念溯源：[Mozilla Wiki — The Places frecency algorithm](https://wiki.mozilla.org/User:Jesse/NewFrecency)（Firefox 起源）
- [[fzf]] —— zi 交互模式背后的选单引擎
- [[fd]] —— 同 Rust CLI 工具圈的 find 替代品

## 关联

- [[fzf]] —— zi 子命令直接 pipe 到 fzf 出选单
- [[fd]] —— 同生态 Rust 重写——find → fd，cd → zoxide
- [[ripgrep]] —— Rust 重写老工具的开山之作，zoxide 受它影响
- [[bat]] —— Rust 重写 cat，同生态零依赖单二进制
- [[eza]] —— Rust 重写 ls，常和 zoxide 一起出现在 dotfiles
- [[sd]] —— Rust 重写 sed，同款"小工具单一职责"哲学

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[htop]] —— htop — top 的彩色交互替代（鼠标点选 / 树视图 / 过滤）
- [[lazygit]] —— lazygit — Go 写的全功能 git TUI，键盘驱动 stage / rebase / cherry-pick
- [[ranger]] —— ranger — Python 写的 vim 风格三栏文件管理器

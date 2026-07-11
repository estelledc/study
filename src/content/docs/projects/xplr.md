---
title: xplr — 用 Lua 当配置语言的可 hack 终端文件管理器
来源: 'https://github.com/sayanarijit/xplr'
日期: 2026-05-31
分类: cli
难度: 中级
---

## 是什么

xplr 是一个**在终端里浏览文件、但允许你用 Lua 把它任意改造**的小程序。日常类比：像一辆出厂就拆了引擎盖的车——开着能跑，但你想换发动机、加涡轮、把方向盘挪到右边，全部允许。

打开它，看到的就是一列文件名（和 nnn / ranger / lf 一样）：

```
/home/jason/code
> xplr/
  ranger/
  notes.md
  build.sh
```

按 `j/k` 上下、`l` 进目录、`q` 退。但区别在 `~/.config/xplr/init.lua`——这是一个真正的 Lua 文件，里面写着 xplr **每一个**按键、每一块 UI、每一个工作流。改它，xplr 当场就变成另一个程序。

作者 Arijit Basu 用 Rust 写了核心（启动快、内存小），把所有"可变行为"暴露给 Lua（让用户能改）。GitHub 约 4.8k 星，最新版 v1.1.0（2025-12-08）。

## 为什么重要

不理解 xplr，下面这些事都没法解释：

- 为什么"用脚本语言写配置"在 2026 年回潮——和 Neovim（Lua 配置）、Hammerspoon（Lua 控 macOS）一脉相承
- 为什么同样是 Rust 写的 TUI 文件管理器，broot 选了"少配置"路线、xplr 选了"全可改"路线——同一套技术栈两种哲学
- 为什么"把自己当库"是 CLI 工具的高级形态——xplr 接收 stdin、输出 stdout，可以被 bash 脚本套着用
- 为什么不重写 ls / find / fzf，而是用 UI 把它们粘起来——这是 Unix 哲学的现代演绎

## 核心要点

xplr 的设计可以拆成 **三件事**：

1. **Lua 配置而非 DSL**：不发明新配置语言（lf 是这么干的），直接让你写 Lua。类比：vim 让你写 vimscript，xplr 让你写 Lua——但 Lua 是真正的编程语言，能跑循环、调函数、引模块。

2. **模式系统（modes）**：和 vim 一样分 normal / search / filter / action 等模式，每个模式有独立按键绑定。类比：钢琴有不同踏板模式，按下去同样的键发出不同的声。这套机制让按键空间扩大 N 倍而不冲突。

3. **stdin/stdout 当管道传话**：xplr 可以读 shell 喂给它的文件路径列表（stdin），用户操作后再把选中的路径吐回 shell（stdout）。类比：把 xplr 当 fzf 那样套在管道里用——`find . | xplr | xargs rm`。

三件事加起来叫"hackable orchestrator"：浏览与按键分发自己做，**文件操作尽量交给外部命令**。

## 实践案例

### 案例 1：装上就能用

```bash
brew install xplr      # macOS
cargo install xplr     # 任何有 Rust 的系统
xplr                   # 在当前目录开
```

**逐步跟做**：

1. 安装后直接跑 `xplr`，屏幕出现当前目录的文件列表
2. 按 `j` / `k` 上下移动高亮；按 `l` 进入目录，`h` 返回上级
3. 按 `?` 看当前模式全部按键；按 `q` 退出

无任何配置就能跑——先熟悉默认键位，再改 `init.lua`。

### 案例 2：用 Lua 改一个按键

`~/.config/xplr/init.lua` 加一段：

```lua
xplr.config.modes.builtin.default.key_bindings.on_key.g = {
  help = "go to top",
  messages = { "FocusFirst" },
}
```

含义逐字读：

- `xplr.config.modes.builtin.default` —— 进入"内置默认模式"的配置
- `key_bindings.on_key.g` —— 绑定字母 g 这个键
- `messages = { "FocusFirst" }` —— 触发"焦点跳到第一行"这个内置消息

**没编译、没重启，下次开 xplr 就生效**。这就是 Lua 配置的力量——配置文件 = 程序本身。

### 案例 3：当库用，套在管道里

```bash
selected=$(find . -name "*.md" | xplr -)
echo "$selected" | xargs cat
```

`xplr -` 表示"从 stdin 读路径列表"。用户在 xplr 里挑文件，按 `enter` 退出，选中的路径从 stdout 吐回。**xplr 在这里不是终点，是中间一道交互式过滤器**。

fzf 适合纯文本模糊查；xplr 适合"还要看文件元信息再决定"的场景。

### 案例 4：一键复制当前文件的绝对路径

```lua
-- macOS 用 pbcopy；Linux 可换成 xclip -selection clipboard 或 wl-copy
xplr.config.modes.builtin.default.key_bindings.on_key.Y = {
  help = "yank absolute path",
  messages = {
    { BashExec = [[echo -n "$XPLR_FOCUS_PATH" | pbcopy]] },
    { LogSuccess = "已复制" },
  },
}
```

`BashExec` 让 xplr 跳出来执行 shell，`$XPLR_FOCUS_PATH` 是 xplr 自动注入的环境变量。这种"按一个键 = 起 shell + 跑命令 + 回来"的模式，是 xplr 工作流的核心。

## 踩过的坑

1. **Lua 报错杀全局**：init.lua 里写错一行（拼错变量名），xplr 启动直接退出。和 vim 不同（vimscript 出错还能降级跑），xplr 出错就是不开。**调试技巧**：先用 `lua-language-server` 对小文件做语法检查。

2. **模式切换链容易绕晕**：自定义模式 A → B → C 之后，忘了在 C 里写"按 esc 回 default"，就卡死出不来。**对策**：每个自定义模式必加 `{ on_key.esc = { messages = {"PopMode"} } }`。

3. **启动比 nnn 慢一截**：xplr 冷启动大约几十毫秒（Rust + Lua VM），nnn 大约数毫秒（纯 C）。在 SSH 远程脚本里频繁启停时，差距会放大。**对策**：一次开、多次操作，或换 nnn。

4. **Lua API 文档相对薄**：xplr.dev 有完整 API 列表但缺"完整工作示例"。新人想做事得去 awesome-xplr 翻别人源码学。

## 适用 vs 不适用场景

**适用**：

- 你已经在用 Neovim 且会写一点 Lua —— 配置语言相通，迁移成本几乎 0
- 工作流里要把"文件管理器 + 自定义脚本"深度耦合（如批量重命名 / 自定义预览）
- 想做一个团队共享的"专用文件管理器"（针对某代码库结构定制按键和动作）
- SSH 进远端服务器要一个比 ranger 快、比 nnn 灵活的东西

**不适用**：

- 只想随便看看文件（用 nnn 或系统自带 ls 就够，xplr 配置成本浪费）
- 不会也不想写 Lua（建议 lf 或 broot，配置更轻）
- 内存和启动时间敏感的容器/嵌入式环境（用 nnn）
- 主打"树视图 + 模糊导航"的工作流（用 broot 更对口）

## 历史小故事（可跳过）

- 2021-02：Arijit Basu（sayanarijit）在 GitHub 开仓，目标是"可 hack 的终端文件浏览器"，灵感来自 nnn 与 fzf
- 2021-04：crates.io 早期公开发布；同年 5 月起用 Lua 配置（`init.lua`）取代更死板的 YAML，hackability 真正成型
- 2021–2024：插件生态在 awesome-xplr 聚集，作者博客写了从 ranger 迁到 xplr 的动机
- 2025-03：v1.0.0 稳定版；2025-12：v1.1.0（性能与 LuaJIT 字节码等），仍由作者主维护

## 学到什么

1. **配置语言用真编程语言更好**：Lua 比自创 DSL 强——用户已会、社区有库、可调试
2. **核心做小，扩展全开**：发布包大约数兆字节，但 awesome-xplr 有大量第三方扩展，因为暴露了完整 Lua API
3. **Unix 哲学的现代写法**：不重写 fzf / find / ls，而是把它们粘起来——交互式 orchestrator 是 CLI 工具的新形态
4. **快慢权衡有学问**：选 Rust 不是因为时髦，是因为"启动够快，能跑 Lua VM"——C 启动更快但跑 Lua 麻烦，Python 慢

## 延伸阅读

- 官方文档：[xplr.dev](https://xplr.dev/)（教程 + Lua API + 配置示例齐全）
- 官方 GitHub：[sayanarijit/xplr](https://github.com/sayanarijit/xplr)（README 自带演示）
- 插件生态：[awesome-xplr](https://github.com/sayanarijit/awesome-xplr)（主题 / 插件 / 集成）
- 作者博客：[Why I switched from ranger to xplr](https://arijitbasu.in/posts/xplr/)（设计动机）
- [[nnn]] —— C 写的极简对照组，xplr 的"快"参照系
- [[fzf]] —— xplr 工作流里最常配合的模糊查找器

## 关联

- [[nnn]] —— 同类终端文件管理器，nnn 选"极简快"，xplr 选"可 hack"
- [[broot]] —— 同样 Rust 写的 TUI 文件工具，broot 主打树视图，xplr 主打可定制
- [[fzf]] —— xplr 通过 stdin/stdout 经常和 fzf 串管道用
- [[lazygit]] —— 同样"用 TUI 把已有 CLI 工具粘起来"的代表，思路一脉相承
- [[ripgrep]] —— xplr 自定义动作里调最多的搜索工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[fzf]] —— fzf — 命令行模糊查找
- [[lazygit]] —— lazygit — Go 写的全功能 git TUI，键盘驱动 stage / rebase / cherry-pick
- [[nnn]] —— nnn — 50KB 内存就能跑的极简终端文件管理器
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep

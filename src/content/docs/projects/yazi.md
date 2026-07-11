---
title: yazi — Rust 写的异步 TUI 文件管理器，终端里直接看图
来源: https://github.com/sxyazi/yazi
日期: 2026-05-31
分类: CLI
难度: 中级
---

## 是什么

yazi 是 sxyazi 在 2023 年用 Rust 写的命令行文件管理器。它在终端里铺出三栏画面（左父目录、中当前、右预览），光标用 vim 的 `hjkl` 走，但底层做了两件 ranger 没做的事：**全异步 I/O** 和 **原生图片协议**。

日常类比：

> 把 `ranger` 拆掉旧引擎，换上电动机——同一辆车的方向盘、踏板、座椅都没变，但起步、转向、爬坡的体感全部不一样。

最直观的画面，光标停在中间栏的某张 PNG：

```
~/photos          2024/         IMG_0312.png
  2024/       >   raw/      >   ┌─────────────┐
  raw/            export/       │ (实际图片)  │
  export/         README.md     │             │
                                └─────────────┘
```

普通 ranger 在这一格通常是 ASCII 字符画或一行 `image: 1920x1080`；yazi 直接通过 kitty graphics protocol 把 PNG 像素送进终端缓冲区——**终端里就是真图**。

## 为什么重要

不了解 yazi，下面这些场景每天都要付学费：

- 在 10 万文件的目录里 `ls`，ranger 同步遍历卡 3-5 秒不能动；yazi 异步在约 100ms 内先出首屏，剩下的边滑边补
- 服务器 ssh 上去想看一眼某张截图——ranger 要装 w3mimgdisplay + 改 scope.sh + 配终端，yazi 默认就有
- 想给文件管理器加自定义预览（比如 `.parquet` 用 `duckdb` 抽前 10 行），ranger 改 shell 脚本，yazi 写一段 Lua
- 给同事推荐 ranger，对方装完发现"预览图片是 ASCII 字符画"——劝退

yazi 和 [[fzf]] / [[fd]] / [[bat]] 是同一个潮流：**把上一代 Python/C 终端工具用 Rust + 现代终端协议重写一遍**。同代竞品 lf / nnn 默认不内建原生图片协议，[[ranger]] 能看图但要外挂；yazi 是异步 + 原生图片协议组合上目前最完整的之一。

## 核心要点

yazi 的设计可以拆成 **三个支柱**：

1. **异步运行时**：基于 tokio（Rust 异步引擎）的 task scheduler，把列目录、读 git 状态、生成预览全部丢进后台 task。光标移动 → UI 立刻刷新，预览稍后追上。类比：餐厅把"点单"和"出菜"分开两条线，前台不会因为后厨忙就停下来。

2. **原生图片协议**：检测终端能力后选 kitty graphics / iTerm2 inline / Sixel / chafa（ASCII fallback）等降级路径。终端是 iTerm2 / Kitty / WezTerm 时直接送像素；普通终端退到字符画。类比：网页根据浏览器能力切 WebP / JPG / GIF，**能力探测后再发**。

3. **Lua 插件 + DDS 消息总线**：UI、键位、预览器都用 Lua 描述；配套 CLI `ya` 通过 DDS（Data Distribution Service，进程间发消息的总线）给运行中的 yazi 发命令。类比：游戏的 mod 系统——主程序留口子，玩家用脚本写扩展，运行时挂上去不重启。

三件事叠加，结果是"用起来像 ranger，但快一个量级、看图不折腾、改起来不用碰 Rust"。

## 实践案例

### 案例 1：装上、跑起来、第一次看图

```bash
brew install yazi  # macOS；或 cargo install --locked yazi-fm yazi-cli
yazi
```

进入后用 `hjkl` 走、`/` 搜索、`q` 退出。把光标停在任意 PNG / JPG 上：iTerm2 / Kitty / WezTerm 右栏出真图；Terminal.app 则是 chafa 字符画 fallback。第一次跑就能感觉到和 ranger 的差别——不用配 `scope.sh`、不用装 w3mimgdisplay。

### 案例 2：用 Lua 加一个 parquet 预览器

前提：本机已装 `duckdb`；插件目录名必须是 `parquet.yazi`。

把下面文件放到 `~/.config/yazi/plugins/parquet.yazi/init.lua`：

```lua
local M = {}
function M:peek()
  local cmd = Command("duckdb")
    :args({ "-c", "SELECT * FROM '" .. tostring(self.file.url) .. "' LIMIT 10" })
    :stdout(Command.PIPED):output()
  if cmd then
    ya.preview_widgets(self, { ui.Text(cmd.stdout):area(self.area) })
  end
end
return M
```

**逐部分解释**：

1. `peek`：光标停在文件上时 yazi 调用的预览入口
2. `Command(...):stdout(...):output()`：在后台跑 duckdb，把前 10 行读进 `cmd.stdout`
3. `ya.preview_widgets`：把文本画进右侧预览区 `self.area`

再在 `~/.config/yazi/yazi.toml` 注册：

```toml
[plugin]
prepend_previewers = [{ name = "*.parquet", run = "parquet" }]
```

下次光标停在 `.parquet` 上就能看见前 10 行。

### 案例 3：用 ya emit 让外部脚本驱动 yazi

`ya` 是配套 CLI，`yazi` 是 TUI 主程序。在 yazi 开出的子 shell（有 `$YAZI_ID`）里，构建脚本跑完后让界面跳到生成目录：

```bash
some-build-script.sh && ya emit cd "$(pwd)"
```

**逐部分解释**：`ya emit` 发的是**动作**（和 keymap 里写的命令同格式），不是普通 pub 消息；`cd` 是内置动作，参数是目标路径。这样 yazi 能嵌进已有 shell 工作流，而不只是"被人开来用"。

## 踩过的坑

1. **图片预览看终端脸色**：iTerm2 / Kitty / WezTerm / Ghostty 原生支持，**Terminal.app / gnome-terminal / VS Code 内置终端**只能退到 chafa ASCII。换终端比改配置便宜。
2. **0.x API 不稳**：Lua 插件 API 在 0.x 期间会破坏性变更。升级前看 CHANGELOG，第三方插件经常要等几天才跟上。
3. **从 ranger 迁移的肌肉记忆冲突**：ranger 默认"光标即选中"，yazi 默认"光标只是 cursor，space 才 toggle 选择"。前两天会反复"以为选了实际没选"。
4. **ya 不是 yazi**：`ya` 发消息/装插件，`yazi` 是 TUI 主程序；装的时候两个都要（`yazi-cli` + `yazi-fm`）。

## 适用 vs 不适用场景

**适用**：

- iTerm2 / Kitty / WezTerm 用户想在终端里直接看图、看 PDF 缩略图
- 大目录（约 10 万 + 文件）下 ranger 卡到不能用
- 想给文件管理器加自定义预览但不想写 shell
- ranger 用户嫌"装一堆外挂才能看图"

**不适用**：

- 终端是 Terminal.app / gnome-terminal —— 图片协议退化，体验和 ranger 差不多
- 已经有大量 ranger 配置（rifle.conf / scope.sh / commands.py）—— 迁移成本高
- 需要稳定脚本化 API —— 0.x 还在改
- 偏好极简（nnn / lf 风格）—— yazi 默认功能比它们多

## 历史小故事（可跳过）

- 2009 前后：[[ranger]] 用 Python 把三栏 + vim 键位做成终端文件管理器标杆，但同步 I/O 和大目录卡顿一直是痛点
- 2010 年代中后期：lf（Go）、nnn（C）走更轻、更快路线，图片预览多靠外挂
- 2023-07：sxyazi 发布 yazi，用 Rust + tokio 重做异步，并把 kitty / iTerm2 / Sixel 等图片协议做成内建能力
- 之后：Lua 插件与 DDS（`ya emit` / `ya pub`）让它能嵌进 shell / Neovim 工作流，社区插件市场跟上

## 学到什么

1. **异步 I/O 在 TUI 里同样有意义**——不只是 web server 才需要 tokio
2. **能力探测 + 多级降级** 是兼容老终端的工业做法（图片协议多级 fallback）
3. **Lua 插件比 shell 脚本更适合扩展 TUI**——不用 fork 进程、能传结构化数据
4. **DDS 消息总线** 让 TUI 程序能嵌进 shell 工作流，而不只是"被人开来用"

## 延伸阅读

- 官方文档：[yazi-rs.github.io](https://yazi-rs.github.io/) （配置、插件、键位映射）
- DDS 说明：[Data Distribution Service](https://yazi-rs.github.io/docs/dds/) （`ya emit` / `ya pub` 用法）
- 插件市场：[yazi-rs/plugins](https://github.com/yazi-rs/plugins) （预览器、主题、键位包）
- 终端图片协议：[Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/) （像素怎么送进终端）
- 相关笔记：[[ranger]]、[[fzf]]、[[bat]]

## 关联

- [[ranger]] —— Python 三栏文件管理器，yazi 的视觉模型来源；yazi 把异步和原生图片补上
- [[fzf]] —— 模糊查找器，yazi 的搜索面板有相似键位；可以和 yazi 互补
- [[fd]] —— Rust 文件查找；yazi 内部也用 fd-like 逻辑列目录
- [[bat]] —— Rust 高亮 cat；yazi 文本预览默认走 bat
- [[broot]] —— Rust 交互式目录浏览器，赛道相邻但走不同路（broot 重过滤、yazi 重预览）
- [[zellij]] —— Rust 终端复用器，常和 yazi 同屏使用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[helix]] —— Helix — Rust 后现代模态编辑器，LSP 和 Tree-sitter 默认开机
- [[ranger]] —— ranger — Python 写的 vim 风格三栏文件管理器

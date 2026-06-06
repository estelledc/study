---
title: Doom Emacs — 极简风 Emacs 发行
来源: 'https://github.com/doomemacs/doomemacs'
日期: 2026-05-30
分类: CLI
子分类: 编辑器与 IDE
难度: 初级
---

## 是什么

**Doom Emacs** 是一套给 **GNU Emacs** 用的「预制装修方案」：你不用从零写几千行配置，clone 下来、勾选模块、改自己的私人目录，就能拥有一台启动快、键位统一、包可复现的编辑器。

日常类比：Emacs 本身是毛坯房；Doom 是宜家样板间——墙漆、插座、橱柜布局都帮你选好，但你想换沙发（主题）、加书房（Rust module）仍在你自己的 `private` 目录里改。

它面向「Emacs 破产老兵」：曾折腾过配置、被包更新搞崩过的人。口号之一是 **Gotta go fast**——启动和运行都要快；另一个是 **Close to metal**——尽量贴近 vanilla Emacs，少一层神秘黑盒，方便你读源码、自己改。

## 为什么重要

不理解 Doom，下面这些事都没法解释：

- 为什么有人放弃 Spacemacs 却还在 Emacs 阵营——Doom 用更少框架层换更快的启动
- 为什么 `bin/doom sync` 和 `doom doctor` 会出现在 Emacs 教程里——Doom 把包管理做成了声明式 CLI
- 为什么 evil 用户按 **SPC** 能弹出整棵命令树——Doom 默认 Spacemacs 风格的 leader / localleader 键位
- 为什么重装电脑后有人能十分钟恢复同一套编辑环境——module + straight.el + Git 让配置可 pin、可回滚

## 核心要点

Doom 可以拆成 **三块** 来记：

1. **模块开关（init.el）**：像手机设置里的「功能列表」。`:editor evil` 开 Vim 键位，`:lang/python` 开 Python 语法与工具，`:tools magit` 开 Git 界面。类比：你只勾选需要的 App，没勾的不会拖慢启动。

2. **声明式包管理（packages.el + straight.el）**：额外要的包写进 `packages.el`，用 `bin/doom sync` 安装、删孤儿包、重建缓存。类比：购物清单交给仓库管理员，而不是每次开机现去应用商店搜。

3. **bin/doom 命令行**：`install` 首次安装，`sync` 改配置后同步，`upgrade` 升 Doom 与包，`doctor` 查缺依赖，`env` 把 shell 的 PATH 导出给 Emacs。类比：给编辑器配了一个运维脚本，不用进 Emacs 也能修环境。

## 实践案例

### 案例 1：第一次安装，只开最小心跳

终端执行（路径可按习惯改）：

```sh
git clone --depth 1 https://github.com/doomemacs/doomemacs ~/.config/emacs
~/.config/emacs/bin/doom install
```

安装向导会问一些问题；装完后编辑 `~/.config/emacs/init.el`，确保类似片段存在：

```elisp
(doom! :completion ivy
       :editor evil
       :ui doom
       :config default)
```

**逐部分解释**：

- `doom!` 是 Doom 的「总开关」宏，后面列的都是 module 关键字
- `:completion ivy` 用 ivy 做模糊搜索补全（也可换 vertico）
- `:editor evil` 打开 Vim 式移动与模式（normal / insert）
- 保存后运行 `~/.config/emacs/bin/doom sync`，再启动 `emacs`，按 **SPC** 应弹出 leader 菜单

### 案例 2：自己加一个包并同步

在私人目录 `~/.config/emacs/modules/` 旁的 `packages.el`（或 `config.el` 按文档约定）里声明：

```elisp
(package! magit)  ; Git 图形界面
```

然后：

```sh
~/.config/emacs/bin/doom sync
```

**逐部分解释**：

- `package!` 告诉 Doom「我要这个包」，版本可由 straight  pin 到某次 commit
- `sync` 会装新包、卸你删掉声明的孤儿包、刷新 autoload 缓存
- 若忘了 `sync`，Emacs 里会表现为「包找不到」或旧键位——这是新人最高频失误之一

### 案例 3：写 Rust 并开 LSP

在 `init.el` 增加语言与检查 module：

```elisp
(doom! :completion ivy
       :editor evil
       :lang rust
       :tools lsp
       :checkers spell
       :config default)
```

终端检查环境：

```sh
~/.config/emacs/bin/doom doctor
which rustc ripgrep
```

**逐部分解释**：

- `:lang rust` 拉进 rust-mode、相关键位与（若启用）tree-sitter 等集成
- `:tools lsp` 用 lsp-mode 或 eglot 连 `rust-analyzer`，需在系统里已安装 LSP 二进制
- `doom doctor` 列出缺失的系统依赖——Doom **不会**悄悄替你 `apt install`，避免「装了一堆你不知道的东西」

## 踩过的坑

1. **不稳定 Emacs 构建**：版本号带 `.50`、`.91` 的预发布版常让 module 随机炸——应用稳定版 30.x 或文档推荐区间，并用 `doom doctor` 验证。

2. **改配置不 sync**：动了 `init.el` / `packages.el` 却直接重启 Emacs，包和 autoload 仍是旧的——养成「改完就 `doom sync`」的肌肉记忆。

3. **没开 module 却期待全能 IDE**：只开 `:editor evil` 就想写 Python + LSP + Docker——要在 `doom!` 里显式启用 `:lang/*`、`:tools/*`，并自己装 ripgrep、语言服务器等系统工具。

4. **键位脑裂**：从 [[vim]] / [[spacemacs]] 迁来仍按旧 leader，与 Doom 默认 **SPC** / **SPC m**（localleader）打架——先读 `:lang` 文档里的 evil 绑定，短期放慢速度换长期一致。

## 适用 vs 不适用场景

**适用**：

- 想要 **Emacs 生态**（org-mode、magit、elfeed 等）又嫌自写配置太累
- 需要 **模块化开关**：机器慢就关动画 module，写单一语言就只开对应 `:lang`
- 接受 **evil/Vim 键位** 或愿意学 Doom 的 leader 体系
- 重视 **可复现**：配置进 Git，`doom sync` / pin 包版本，换机可快速恢复

**不适用**：

- 只想「装个 VS Code 替代品」、完全不想学 Emacs 概念（buffer、mode、elisp）——学习曲线仍陡
- 必须坚持 **默认 GNU 键位** 且讨厌前缀键——可能要大量自改 `+evil-bindings.el` 或选其他发行
- 需要 **GUI 开箱即用 IDE**（断点调试 UI、重构菜单一应俱全）——Emacs 往往要叠 module 与插件
- 团队统一 **Neovim/LazyVim** 工具链——选 [[neovim]] 更省事，除非你就是 Emacs 派

## 历史小故事（可跳过）

- **叙事起源**：官方 README 写了一个「shell 住客 vimmer」投奔 Emacs 黑暗面的小故事——点明用户画像：要快、要 Vim 手感、又怕配置地狱。
- **相对 Spacemacs**：Doom 刻意减少框架厚度，用 straight.el 做可 pin 的包管理，并把性能优化写进 mantra（懒加载、改包默认）。
- **社区规模**：GitHub 约 **22k** star，Discord 活跃；文档在仓库 `docs/getting_started.org`，`bin/doom` 是日常运维入口。
- **持续演进**：roadmap 公开在 doomemacs.org；大版本升级前看 #announcements，避免 breaking 键位或 module 改名踩雷。

## 学到什么

1. **编辑器发行版** 解决的是「配置工程」问题，不是换了一个 exe——Doom 的价值在 module 边界与运维命令。
2. **声明式 + sync** 把「我装了啥包」变成可 diff 的文本，比纯 `package-install` 随机装更利于复现。
3. **Leader 键体系** 是 Spacemacs/Doom 类产品的 UX 核心——先接受前缀键，再谈效率。
4. **doctor / env** 体现「你的系统你负责」哲学：Emacs 不偷偷改系统，但会给你体检清单。

## 延伸阅读

- 官方入门：[Getting Started](https://github.com/doomemacs/doomemacs/blob/master/docs/getting_started.org)
- 模块列表：[modules.org](https://github.com/doomemacs/doomemacs/blob/master/docs/modules.org)（~150 个可选 module）
- 视频：System Crafters 等频道的 Doom Emacs 系列（安装与 module 导览）
- FAQ：[docs/faq.org](https://github.com/doomemacs/doomemacs/blob/master/docs/faq.org)（改主题、字体、常见误配置）
- [[spacemacs]] —— 同类 Emacs 发行，键位理念相近但框架更重
- [[emacs]] —— Doom 所依附的 GNU Emacs 本体

## 关联

- [[emacs]] —— Doom 是 Emacs 上的配置框架，不是独立编辑器
- [[spacemacs]] —— 键位与 module 理念的近亲，常被拿来对比启动速度与复杂度
- [[vim]] —— evil-mode 要模拟的键位来源；Doom 默认面向 evil 用户
- [[neovim]] —— 另一支「可扩展编辑器」路线；与 Doom 争的是「谁更值得学」而非同一安装包
- [[nix]] —— README 称赞声明式可复现环境；可与 Doom 配置一起进版本管理

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

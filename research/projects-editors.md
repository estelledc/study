---
title: 项目候选 — 代码编辑器 / IDE
日期: 2026-05-29
---

# 代码编辑器 / IDE 项目候选

候选 60 个，按子类分组（现代 IDE 10 / 经典 6 / Vim·Emacs 配置 6 / Cloud IDE 6 / AI 编辑器 5 / Markdown 写作 5 / 笔记知识库 6 / 学术·协作 6 / 数据笔记本 6 / 专业创作 4）。

已过滤现存"编辑器/富文本"主题：codemirror / prosemirror / lexical / monaco-editor / yjs（库）以及 continue / claude-code（AI 助手）。本表只收"独立编辑器 / IDE / 笔记应用 / Markdown 编辑器"等可直接打开使用的成品。

闭源（VS Code Live Share、Cursor、Windsurf、Sublime、JetBrains 全家桶、Replit、Stackblitz、Notion、Obsidian、Typora 等）一律跳过。Stars 量级为 2025-2026 区间近似值，仅作影响力参考。

## 现代 IDE / 代码编辑器（10 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `vscode` | VS Code — 微软通用代码编辑器 | ~165k | TS/Node 实现的多语言 IDE 框架，扩展生态定义现代编辑器标准 | https://github.com/microsoft/vscode |
| `vscodium` | VSCodium — 去微软遥测的 VS Code | ~24k | 用 OSS 部分构建的纯净 VS Code，免遥测 + 中性品牌 | https://github.com/VSCodium/vscodium |
| `neovim` | Neovim — Lua 可扩展 vim 现代分叉 | ~84k | 内置 LSP + Tree-sitter + 异步任务，重塑模态编辑器架构 | https://github.com/neovim/neovim |
| `helix` | Helix — Rust 后现代模态编辑器 | ~36k | 内置 LSP + Tree-sitter，无需配置即开箱即用的 vim-like | https://github.com/helix-editor/helix |
| `zed` | Zed — 多人协作 GPU 编辑器 | ~52k | Atom 团队 Rust 重写，多线程 + GPU + 实时协作三合一 | https://github.com/zed-industries/zed |
| `lapce` | Lapce — Rust 跨平台 GPU 编辑器 | ~36k | Druid GUI + WGPU 渲染 + WASM 插件，云原生编辑器探索 | https://github.com/lapce/lapce |
| `micro` | micro — Go 终端编辑器 | ~26k | 终端里的 nano 升级版，鼠标 / 多光标 / 插件全有 | https://github.com/zyedidia/micro |
| `kakoune` | Kakoune — 多光标优先模态编辑器 | ~10k | "选择 → 操作"反转 vim 流程，多光标是一等公民 | https://github.com/mawww/kakoune |
| `lite-xl` | Lite-XL — Lua 扩展轻量编辑器 | ~7k | rxi/lite 后继，单二进制 + Lua 插件，性能与简洁兼得 | https://github.com/lite-xl/lite-xl |
| `notepad-plus-plus` | Notepad++ — Windows 国民文本编辑器 | ~25k | Scintilla 内核 + C++ 实现，Windows 桌面经典 | https://github.com/notepad-plus-plus/notepad-plus-plus |

## 经典 / 历史编辑器（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `vim` | Vim — 模态编辑器之父 | ~38k | 几十年 vi 系活化石，键盘 DSL 至今仍是范式 | https://github.com/vim/vim |
| `emacs` | GNU Emacs — Lisp 自文档编辑器 | ~6k | 操作系统级编辑器，Lisp 元语言定义可编程编辑器范式 | https://github.com/emacs-mirror/emacs |
| `atom` | Atom — 已归档的 Web 编辑器先驱 | ~60k | GitHub 出品的 Electron 编辑器，开启 Web 技术做桌面 IDE 风潮 | https://github.com/atom/atom |
| `xi-editor` | xi-editor — Google 实验性编辑器 | ~20k | rope 数据结构 + 异步前后端分离，Zed/Lapce 的思想源头 | https://github.com/xi-editor/xi-editor |
| `textmate` | TextMate — macOS 经典编辑器 | ~15k | "find your bundle"宏系统，影响 Sublime / VS Code 语法定义 | https://github.com/textmate/textmate |
| `geany` | Geany — GTK 轻量 IDE | ~1.7k | C 写的小型 IDE，启动快 + 占用低，老牌轻量选择 | https://github.com/geany/geany |

## Vim / Emacs 配置发行版（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `spacemacs` | Spacemacs — Vim + Emacs 融合发行 | ~24k | "evil-mode + 助记键 + layer"，Emacs 入门标杆配置 | https://github.com/syl20bnr/spacemacs |
| `doom-emacs` | Doom Emacs — 极简风 Emacs 发行 | ~22k | 启动 < 1 秒 + module 化配置，spacemacs 之外的主流选 | https://github.com/doomemacs/doomemacs |
| `lunarvim` | LunarVim — 一体化 Neovim IDE | ~19k | 内置 LSP / DAP / 终端，零配置即用的 Neovim 发行 | https://github.com/LunarVim/LunarVim |
| `lazyvim` | LazyVim — lazy.nvim 驱动的发行 | ~22k | folke 出品，按需懒加载 + 完整 IDE，Neovim 当代主流 | https://github.com/LazyVim/LazyVim |
| `nvchad` | NvChad — 极致美观的 Neovim 配置 | ~26k | 0.5 秒启动 + 主题切换 UI，前端工程师的 Neovim 选择 | https://github.com/NvChad/NvChad |
| `astronvim` | AstroNvim — 社区驱动 Neovim 配置 | ~14k | 模块化 + 插件市场，现代 Neovim 配置范例 | https://github.com/AstroNvim/AstroNvim |

## Web / Cloud IDE（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `theia` | Eclipse Theia — 云原生 IDE 框架 | ~21k | VS Code 协议兼容 + 插件互通，可定制企业级云 IDE 基座 | https://github.com/eclipse-theia/theia |
| `code-server` | code-server — 浏览器里的 VS Code | ~73k | 单机部署即可远程访问完整 VS Code，云端开发普及代表 | https://github.com/coder/code-server |
| `openvscode-server` | OpenVSCode Server — VS Code Server 上游 | ~7k | Gitpod 维护的最小化补丁，让 microsoft/vscode 跑在远程 | https://github.com/gitpod-io/openvscode-server |
| `coder` | Coder — 自托管开发环境平台 | ~10k | Terraform 描述工作区 + SSH/VS Code/JetBrains 多入口，企业 DevBox | https://github.com/coder/coder |
| `gitpod` | Gitpod — 预构建云开发环境 | ~13k | 把 git 仓库变成"prebuilt 工作区"，cloud workspace 鼻祖 | https://github.com/gitpod-io/gitpod |
| `eclipse-che` | Eclipse Che — Kubernetes 原生云 IDE | ~7k | DevWorkspace + Devfile 标准化云 IDE 描述，企业级方案 | https://github.com/eclipse/che |

## AI 编辑器 / Coding Agent（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `aider` | Aider — 终端 AI 结对编程 CLI | ~36k | git-aware 的 CLI 编辑会话，把 LLM 编辑直接 commit 到仓库 | https://github.com/Aider-AI/aider |
| `cline` | Cline — VS Code 自主编码代理 | ~50k | "看代码 + 改代码 + 跑命令"全自主 VS Code agent | https://github.com/cline/cline |
| `void` | Void — 开源 Cursor 替代 | ~24k | VS Code fork，自带 AI chat / inline edit / agent，模型自托管 | https://github.com/voideditor/void |
| `opencode` | opencode — SST 出品的终端 AI IDE | ~12k | 终端里的 100% TypeScript AI 编程助手，多模型可切换 | https://github.com/sst/opencode |
| `roo-code` | Roo Code — 多模式 VS Code AI 助手 | ~16k | Cline 分叉，加 architect/code/debug 多角色切换 | https://github.com/RooCodeInc/Roo-Code |

## Markdown / 写作编辑器（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `marktext` | MarkText — 实时预览 Markdown 编辑器 | ~52k | "所见即所得"风格 markdown，无双栏切换的纯净写作 | https://github.com/marktext/marktext |
| `zettlr` | Zettlr — 学者向 Markdown 编辑器 | ~10k | Citation/BibTeX/Pandoc 内置，论文写作首选 markdown 工具 | https://github.com/Zettlr/Zettlr |
| `ghostwriter` | ghostwriter — Qt 干净 Markdown 写作器 | ~2.5k | 暗色专注 + Hemingway 风格高亮，长文写作首选 | https://github.com/wereturtle/ghostwriter |
| `foam` | Foam — VS Code 上的 Roam-like | ~17k | 把 VS Code 改造成 Zettelkasten 工作流，纯 markdown + 双链 | https://github.com/foambubble/foam |
| `silverbullet` | SilverBullet — 自托管笔记 web 应用 | ~3k | TS 实现的 markdown + 反查链 + 插件即代码块 | https://github.com/silverbulletmd/silverbullet |

## 笔记 / 个人知识库（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `logseq` | Logseq — 块结构离线知识库 | ~36k | "段落即图节点"的 Roam 开源对标，本地优先 + 双链全文 | https://github.com/logseq/logseq |
| `joplin` | Joplin — 开源 Evernote 替代 | ~50k | E2E 加密 + 多设备同步 + Markdown，跨平台个人笔记标杆 | https://github.com/laurent22/joplin |
| `anytype-ts` | Anytype — 本地优先块编辑器 | ~5k | P2P + E2E + 类型化对象图，去中心化 Notion 思路 | https://github.com/anyproto/anytype-ts |
| `trilium` | Trilium — 树形层级笔记系统 | ~30k | 服务端 + 客户端架构，超大笔记树 + 关系图 + 脚本 | https://github.com/zadam/trilium |
| `siyuan` | SiYuan — 国产块结构笔记 | ~24k | 思源笔记，本地优先 + 双链 + 自托管 + 中文优化 | https://github.com/siyuan-note/siyuan |
| `appflowy` | AppFlowy — Rust 写的开源 Notion | ~64k | Flutter 客户端 + Rust 内核，自托管 Notion 对标的最大项目 | https://github.com/AppFlowy-IO/AppFlowy |

## 学术 / 协作文档（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `texstudio` | TeXstudio — LaTeX IDE | ~3.4k | Qt 实现的 LaTeX 集成编辑器，宏 / 公式补全 / 实时预览 | https://github.com/texstudio-org/texstudio |
| `overleaf` | Overleaf — 在线 LaTeX 协作 | ~16k | Web 端实时协作 LaTeX，社区版可自托管 | https://github.com/overleaf/overleaf |
| `hedgedoc` | HedgeDoc — 协作 Markdown 编辑 | ~14k | CodiMD 分叉，多人实时编辑 markdown，带演示模式 | https://github.com/hedgedoc/hedgedoc |
| `etherpad-lite` | Etherpad — 经典协作文本编辑器 | ~17k | OT 算法实战代表，浏览器多人同时编辑文档先驱 | https://github.com/ether/etherpad-lite |
| `outline` | Outline — 团队 Wiki 协作平台 | ~30k | ProseMirror 富文本 + 实时协作 + 团队权限，开源 Notion-for-team | https://github.com/outline/outline |
| `bookstack` | BookStack — 文档型 Wiki | ~17k | Book/Chapter/Page 三层结构 + WYSIWYG，企业知识库自托管 | https://github.com/BookStackApp/BookStack |

## 数据笔记本（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `jupyter-notebook` | Jupyter Notebook — 经典数据科学笔记本 | ~12k | IPython 衍生，定义"代码 + 输出 + Markdown"交互范式 | https://github.com/jupyter/notebook |
| `jupyterlab` | JupyterLab — 下一代 Jupyter IDE | ~15k | 标签页 / 多面板布局 + 扩展，把 Jupyter 升级为完整 IDE | https://github.com/jupyterlab/jupyterlab |
| `marimo` | marimo — 反应式 Python 笔记本 | ~17k | 单文件 .py + DAG 自动重算，去掉 Jupyter 隐藏状态痛点 | https://github.com/marimo-team/marimo |
| `pluto-jl` | Pluto.jl — Julia 反应式笔记本 | ~5.4k | 单元改动自动级联重算，纯 Julia 实现，浏览器即 IDE | https://github.com/fonsp/Pluto.jl |
| `zeppelin` | Apache Zeppelin — JVM 多语言笔记本 | ~6k | Spark / Flink / Scala / SQL / Python 一锅端，企业大数据交互 | https://github.com/apache/zeppelin |
| `observable-framework` | Observable Framework — 数据应用静态站 | ~3.3k | Markdown + JS + SQL 编译为静态 dashboard，Observable 升级版 | https://github.com/observablehq/framework |

## 专业创作编辑器（4 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `blender` | Blender — 全流程 3D 创作套件 | ~12k | 建模 / 动画 / 渲染 / 视频剪辑全栈，开源 3D 内容创作旗舰 | https://github.com/blender/blender |
| `godot` | Godot Engine — 开源游戏引擎 + 编辑器 | ~95k | 节点树 + GDScript + 自带编辑器，独立游戏开发器代表 | https://github.com/godotengine/godot |
| `inkscape` | Inkscape — 矢量图形编辑器 | ~8k | C++ 实现的 SVG 原生编辑器，对标 Illustrator 的开源标准 | https://github.com/inkscape/inkscape |
| `krita` | Krita — 数字绘画专业编辑器 | ~1.4k | Qt + KDE 出品，CMYK / 笔刷引擎专业级，插画师开源首选 | https://github.com/KDE/krita |

## 备选 / 后续可补

下列项目质量同样在线，本轮配额已满或与已收录重复度高，可作为替补：

- **现代代码编辑器**：sublime-text（闭源跳）/ pulsar-edit（atom 后继 ~2.6k）/ nova（闭源）/ fleet（闭源）
- **经典编辑器**：nano（mirror 太小）/ ne / joe / yi-haskell-editor
- **Vim 系**：kickstart.nvim / nvim-lua-config / chadrc / lvim-iaf
- **Cloud IDE**：codespaces（闭源）/ replit（闭源）/ stackblitz（闭源）/ glitch（闭源）/ codesandbox（闭源）
- **AI 编辑器**：cursor（闭源）/ windsurf（闭源）/ cody（IDE 扩展，非编辑器本体 ~3k）/ tabby-terminal
- **Markdown / 笔记**：obsidian（闭源）/ typora（闭源）/ standard-notes / dendron（已停滞）/ notable / qownnotes
- **学术**：lyx（mirror 太小且镜像不稳定）/ kile / texmaker / typst（typesetting 编译器，非编辑器）
- **协作**：focalboard / wiki-js / dokuwiki / mediawiki
- **笔记本**：deepnote（闭源）/ databricks-notebook（闭源）/ google-colab（闭源）/ starboard-notebook / jupytext / nteract
- **专业**：gimp（mirror）/ darktable（摄影非代码）/ scribus / audacity（音频）/ shotcut

## 选取与避坑说明

- **重复检查**：与 `src/content/docs/projects/*.md` 的 157 个现存 slug 做过 diff，本表 60 个 slug 全部新增，与已有 codemirror / prosemirror / lexical / monaco-editor / yjs / continue / claude-code / excalidraw / penpot / affine / shiki / midscene / plane / immich / librechat / dify 等无重叠。
- **库 vs 应用边界**：本表只收"独立可打开使用的编辑器/笔记本应用"。库（CodeMirror、ProseMirror、Lexical、Monaco、Yjs、TipTap、Slate、Quill、Draft.js、Editor.js）已在原 5 项中覆盖或不在本主题范围。
- **闭源排除**：Cursor / Windsurf / VS Code Insiders 二进制 / Sublime / JetBrains / Replit / Stackblitz / Codespaces / Notion / Obsidian / Typora 等不收。VSCode 主仓 microsoft/vscode 是 OSS 源码，可入选；商业版 Visual Studio Code 二进制不入选。
- **归档项目保留**：atom / xi-editor 虽已归档，但作为思想源头与历史里程碑（Atom → Tree-sitter / Electron 模式；xi-editor → rope + 异步前后端分离），值得作教学样本保留。
- **冷门控制**：所有候选都能搜到中文 / 英文一手文档 + 设计 blog / paper / 项目 wiki，可写 130-200 行入门词条。
- **专业创作类**：blender / godot / inkscape / krita 严格说不全是"代码编辑器"，但都是其领域的 IDE 级编辑器（可视化场景图、节点图、矢量、笔刷），按"专业领域 editor"归入本主题。

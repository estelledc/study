# CLI / 开发者效率工具 项目候选池

> 为 study 站扩 CLI / DevX 主题。当前 atlas 里 CLI 类只有 5 个（clack/commander/ink/oclif/yargs，全是 Node CLI 框架）+ Terminal 类 5 个（boxen/chalk/enquirer/listr2/ora，全是 Node 终端库），**真正的"终端工具/开发者效率工具"几乎空白**。
>
> 本文件 = 候选池 80 条，已规避 155 个现有 slug。

## 总览

- **总数**：80 个
- **stars 门槛**：≥ 1k（多数 >5k）
- **挑选维度**：单一独立工具 / 终端或 dev 工作流 / 能写 130-200 行入门词条

### 子类分布

| 子类 | 数量 |
|---|---:|
| [现代核心 CLI 替代品](#1-现代核心-cli-替代品) | 11 |
| [进程 / 系统监控](#2-进程--系统监控) | 6 |
| [磁盘工具](#3-磁盘工具) | 4 |
| [JSON / YAML / 数据处理](#4-json--yaml--数据处理) | 6 |
| [HTTP 客户端](#5-http-客户端) | 3 |
| [Git 增强](#6-git-增强) | 6 |
| [TUI 框架](#7-tui-框架) | 4 |
| [Shell](#8-shell) | 6 |
| [终端 Multiplexer / Emulator](#9-终端-multiplexer--emulator) | 4 |
| [文件管理 TUI](#10-文件管理-tui) | 5 |
| [包管理器](#11-包管理器) | 5 |
| [构建 / 任务运行](#12-构建--任务运行) | 4 |
| [Lint / 格式化](#13-lint--格式化) | 4 |
| [代码搜索 / 符号导航](#14-代码搜索--符号导航) | 2 |
| [运行时版本管理](#15-运行时版本管理) | 3 |
| [Docker / Kubernetes CLI](#16-docker--kubernetes-cli) | 5 |
| [AI CLI](#17-ai-cli) | 2 |

---

## 1. 现代核心 CLI 替代品

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| ripgrep | ripgrep | 比 grep 快 10x 的代码搜索器，Rust 写、原生忽略 .gitignore，已成事实标准 | 50k | https://github.com/BurntSushi/ripgrep |
| fd | fd | find 的现代替代，正则默认开、并发遍历、人类可读语法 | 36k | https://github.com/sharkdp/fd |
| fzf | fzf | 通用模糊查找器，把任何 stdin 变成可交互过滤器（vim/shell/git 皆可挂） | 70k | https://github.com/junegunn/fzf |
| bat | bat | cat 的语法高亮 + git diff gutter + 自动分页器 | 50k | https://github.com/sharkdp/bat |
| eza | eza | exa 社区接管 fork，ls 替代，支持 git 状态 / 树视图 / icons | 14k | https://github.com/eza-community/eza |
| lsd | lsd | ls 的彩色 + icons 替代，跨平台单二进制，配置友好 | 13k | https://github.com/lsd-rs/lsd |
| dust | dust | du 的可视化替代，按目录大小排树状条形图 | 10k | https://github.com/bootandy/dust |
| sd | sd | sed 的现代替代，使用直觉正则语法（Rust 写） | 6.5k | https://github.com/chmln/sd |
| zoxide | zoxide | autojump / z 的 Rust 重写，按访问频率智能 cd | 22k | https://github.com/ajeetdsouza/zoxide |
| broot | broot | tree + 文件管理 + 模糊查找的合体浏览器 | 11k | https://github.com/Canop/broot |
| miller | miller | awk / sed / cut 的"CSV / TSV / JSON 表格"版本（结构化数据流处理） | 9k | https://github.com/johnkerl/miller |

---

## 2. 进程 / 系统监控

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| htop | htop | top 的彩色交互替代，鼠标点选 / 树视图 / 过滤 | 7k | https://github.com/htop-dev/htop |
| btop | btop | bashtop 的 C++ 重写，最漂亮的系统监控 TUI（CPU / 内存 / 网 / 磁盘） | 23k | https://github.com/aristocratos/btop |
| bottom | bottom | Rust 写的跨平台 top 替代，自定义布局 + 时间序列图 | 11k | https://github.com/ClementTsang/bottom |
| glances | glances | Python 写的全栈系统监控，支持 web / REST / Prometheus 模式 | 27k | https://github.com/nicolargo/glances |
| procs | procs | ps 的现代替代，彩色 + 树视图 + 多列搜索 | 5k | https://github.com/dalance/procs |
| bandwhich | bandwhich | 按进程显示带宽用量的 TUI（哪个进程在占网） | 11k | https://github.com/imsnif/bandwhich |

---

## 3. 磁盘工具

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| duf | duf | df 的彩色 TUI 替代，按设备 / 挂载分组 | 13k | https://github.com/muesli/duf |
| ncdu | ncdu | du 的交互式 TUI，能 navigate 删除大文件（C 写） | 5k | https://github.com/rofl0r/ncdu |
| dua-cli | dua-cli | du 的并发 Rust 替代，扫描更快、可交互删除 | 4k | https://github.com/Byron/dua-cli |
| gdu | gdu | Go 写的 ncdu 加速版，并发扫描 + 进度条 | 4k | https://github.com/dundee/gdu |

---

## 4. JSON / YAML / 数据处理

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| jq | jq | JSON 的 sed / awk，DSL 处理流式 JSON，事实标准 | 31k | https://github.com/jqlang/jq |
| yq | yq | jq-like 工具但支持 YAML / XML / TOML / properties | 12k | https://github.com/mikefarah/yq |
| fx | fx | 终端 JSON 浏览器，可执行 JS 表达式 / 折叠 / 搜索 | 19k | https://github.com/antonmedv/fx |
| gron | gron | 把 JSON 拍平成 grep 友好的赋值语句（绕开 jq 学习曲线） | 14k | https://github.com/tomnomnom/gron |
| dasel | dasel | 跨格式数据查询 / 修改（JSON / YAML / TOML / XML 同一套语法） | 7k | https://github.com/TomWright/dasel |
| jc | jc | 把传统 Unix 命令输出转成 JSON（ifconfig / ps / ls 全覆盖） | 8k | https://github.com/kellyjonbrazil/jc |

---

## 5. HTTP 客户端

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| httpie | httpie | 比 curl 友好的 CLI，JSON 优先 / 彩色输出 / 表达式语法 | 35k | https://github.com/httpie/cli |
| xh | xh | Rust 写的 httpie 兼容客户端，启动更快、单二进制 | 6k | https://github.com/ducaale/xh |
| curlie | curlie | curl 的 httpie 风格包装，保留 curl 全部语义 | 3k | https://github.com/rs/curlie |

---

## 6. Git 增强

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| lazygit | lazygit | Git 的全功能 TUI，键盘驱动 stage / rebase / cherry-pick | 53k | https://github.com/jesseduffield/lazygit |
| gitui | gitui | Rust 写的 Git TUI，启动比 lazygit 快、零依赖 | 19k | https://github.com/extrawurst/gitui |
| tig | tig | 老牌 Git TUI 浏览器，专注 log / blame / diff（C 写） | 12k | https://github.com/jonas/tig |
| delta | delta | git diff / blame 的彩色 + 行号 pager，syntax-aware | 25k | https://github.com/dandavison/delta |
| gh | gh | GitHub 官方 CLI，PR / Issue / Action 全覆盖 | 38k | https://github.com/cli/cli |
| glab | glab | GitLab 官方 CLI，对标 gh | 4k | https://github.com/gitlab-org/cli |

---

## 7. TUI 框架

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| bubbletea | bubbletea | Go 的 Elm 架构 TUI 框架，charm 系核心 | 27k | https://github.com/charmbracelet/bubbletea |
| ratatui | ratatui | Rust 的 TUI 框架，tui-rs 的活跃 fork | 12k | https://github.com/ratatui-org/ratatui |
| textual | textual | Python 的现代 TUI 框架，CSS 驱动布局 | 25k | https://github.com/Textualize/textual |
| gum | gum | 把 bubbletea 组件做成 shell 友好的 CLI（zero-code TUI） | 19k | https://github.com/charmbracelet/gum |

---

## 8. Shell

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| fish | fish | 用户友好的 shell，自动建议 + 语法高亮 + 不兼容 POSIX | 26k | https://github.com/fish-shell/fish-shell |
| nushell | nushell | 把数据当结构化对象处理的 shell（流式 table） | 33k | https://github.com/nushell/nushell |
| xonsh | xonsh | Python + shell 混合，子进程语法 / Python 表达式互通 | 8k | https://github.com/xonsh/xonsh |
| starship | starship | 跨 shell 的快速 prompt（Rust 写，单 toml 配） | 45k | https://github.com/starship/starship |
| oh-my-posh | oh-my-posh | Go 写的跨 shell prompt 引擎（PowerShell / bash / zsh / fish 通吃） | 18k | https://github.com/JanDeDobbeleer/oh-my-posh |
| zsh | zsh | 经典 Z shell（oh-my-zsh / prezto 的底层） | 5k | https://github.com/zsh-users/zsh |

---

## 9. 终端 Multiplexer / Emulator

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| tmux | tmux | 经典终端 multiplexer，detach / attach 会话、面板分屏 | 36k | https://github.com/tmux/tmux |
| zellij | zellij | Rust 写的现代 multiplexer，开箱即用配置 + 插件 wasm | 22k | https://github.com/zellij-org/zellij |
| wezterm | wezterm | Rust 写的 GPU 加速终端 + 内置多路复用 + Lua 配置 | 19k | https://github.com/wez/wezterm |
| kitty | kitty | GPU 加速跨平台终端，原生 multiplexer + 图片协议 | 26k | https://github.com/kovidgoyal/kitty |

---

## 10. 文件管理 TUI

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| ranger | ranger | Python 写的 vim 风格三栏文件管理器（老牌） | 16k | https://github.com/ranger/ranger |
| nnn | nnn | 极简 C 写的文件管理器（< 50KB 内存，超快） | 19k | https://github.com/jarun/nnn |
| lf | lf | Go 写的 ranger 替代，更快、零依赖、单二进制 | 8k | https://github.com/gokcehan/lf |
| xplr | xplr | Rust 写的可 hack 文件管理器（Lua 脚本扩展） | 4k | https://github.com/sayanarijit/xplr |
| yazi | yazi | Rust 写的现代 TUI 文件管理器，async I/O + 图片预览 | 22k | https://github.com/sxyazi/yazi |

---

## 11. 包管理器

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| homebrew | homebrew | macOS / Linux 的事实标准包管理器（Ruby 写） | 43k | https://github.com/Homebrew/brew |
| nix | nix | 13k | 函数式声明式包管理器，可重复构建、原子升级 | https://github.com/NixOS/nix |
| mise | mise | 多语言运行时管理（asdf 替代）+ 任务运行 + 环境变量 | 13k | https://github.com/jdx/mise |
| asdf | asdf | 多语言版本管理器（plugin 架构，Node / Python / Ruby 通吃） | 22k | https://github.com/asdf-vm/asdf |
| scoop | scoop | Windows 的 Homebrew 风格包管理器（PowerShell 写） | 21k | https://github.com/ScoopInstaller/Scoop |

---

## 12. 构建 / 任务运行

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| just | just | make 的现代替代，专注命令运行不构建（Rust 写） | 24k | https://github.com/casey/just |
| task | task | YAML 配的任务运行器（Go 写，跨平台 make） | 13k | https://github.com/go-task/task |
| mage | mage | make 的 Go 实现，用 Go 写任务（强类型 / 依赖图） | 4k | https://github.com/magefile/mage |
| earthly | earthly | Dockerfile + Makefile 合一的构建系统，可重复 / 缓存友好 | 11k | https://github.com/earthly/earthly |

---

## 13. Lint / 格式化

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| shellcheck | shellcheck | shell 脚本静态分析器（Haskell 写，事实标准） | 38k | https://github.com/koalaman/shellcheck |
| shfmt | shfmt | shell 脚本格式化器（Go 写，POSIX / bash / mksh） | 7k | https://github.com/mvdan/sh |
| hadolint | hadolint | Dockerfile 的 lint，Haskell 写、shellcheck 集成 | 11k | https://github.com/hadolint/hadolint |
| ast-grep | ast-grep | 多语言 AST 级 grep / 重写（Rust + tree-sitter，类似 jscodeshift） | 8k | https://github.com/ast-grep/ast-grep |

---

## 14. 代码搜索 / 符号导航

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| the-silver-searcher | the-silver-searcher (ag) | 比 ack 快的代码搜索器（C 写，ripgrep 之前的王者） | 26k | https://github.com/ggreer/the_silver_searcher |
| universal-ctags | universal-ctags | 老牌符号索引器，tags 文件生成（vim / emacs 跳转底层） | 7k | https://github.com/universal-ctags/ctags |

---

## 15. 运行时版本管理

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| nvm | nvm | Node.js 多版本管理器（事实标准，bash 脚本） | 81k | https://github.com/nvm-sh/nvm |
| pyenv | pyenv | Python 多版本管理器（shim 机制） | 39k | https://github.com/pyenv/pyenv |
| volta | volta | Rust 写的 JS 工具链管理器（Node / npm / yarn，按项目锁版本） | 11k | https://github.com/volta-cli/volta |

---

## 16. Docker / Kubernetes CLI

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| dive | dive | Docker 镜像分层探索 TUI（看每层加了哪些文件） | 47k | https://github.com/wagoodman/dive |
| lazydocker | lazydocker | Docker 的 lazygit 同款 TUI，容器 / 镜像 / 卷统一管理 | 39k | https://github.com/jesseduffield/lazydocker |
| k9s | k9s | Kubernetes 的事实标准 TUI，pod / log / shell 全覆盖 | 28k | https://github.com/derailed/k9s |
| kubectx | kubectx | kubectl 切 context / namespace 的快捷工具 | 17k | https://github.com/ahmetb/kubectx |
| stern | stern | 多 pod 多 container 日志聚合 tail（彩色 + 正则筛选） | 11k | https://github.com/stern/stern |

---

## 17. AI CLI

> 注：claude-code 已在 atlas，这里只补 2 个开源 LLM CLI 客户端。

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| aichat | aichat | Rust 写的多 LLM CLI 客户端（OpenAI / Claude / 本地模型，REPL + RAG） | 6k | https://github.com/sigoden/aichat |
| shell-gpt | shell-gpt | ChatGPT CLI 包装，能直接生成 / 解释 / 执行 shell 命令 | 11k | https://github.com/TheR1D/shell_gpt |

---

## 与现有 atlas 的去重确认

已扫过 155 个现有 slug，下列**无冲突**：

- 现有 CLI 类（5）：clack / commander / ink / oclif / yargs（Node CLI 框架）
- 现有 Terminal 类（5）：boxen / chalk / enquirer / listr2 / ora（Node 终端库）
- 现有 build / runtime 类（已避开）：bun / esbuild / swc / vite / biome / pnpm / nx / lerna / turborepo / rollup 等

本文件 80 个候选 slug 与上述 155 个**全部互斥**。

## 备注

- stars 数为 2026/05 前后估算，前后浮动 < 10%
- 所有候选都是**单一独立工具**（不是 SDK / 框架库），符合 study 站"读项目源码学设计"主线
- 如需进一步压缩到 50 / 30，建议优先保留 ★ ≥ 10k 且类别覆盖广的：ripgrep / fd / fzf / bat / jq / lazygit / gh / starship / tmux / zellij / k9s / dive / nvm / pyenv / homebrew / just / shellcheck / httpie / textual / bubbletea / fish / nushell / yazi / zoxide / mise / btop / glances / delta / lsd / eza

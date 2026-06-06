---
title: lazydocker — Go 写的 Docker TUI，五面板看容器 / 镜像 / 网络 / 卷
来源: https://github.com/jesseduffield/lazydocker
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

lazydocker 是 **Jesse Duffield 用 Go 写的 Docker 终端图形界面客户端**，把 `docker ps` / `docker logs` / `docker stats` / `docker compose up` 等十来条命令的常用操作全塞进**一屏多面板的 TUI**——每个面板对应一类 Docker 概念（容器 / 镜像 / 卷 / 网络 / 服务），单键就能切面板、查日志、看 CPU、进 shell。它和同一作者的 [[lazygit]] 是亲兄弟：底层 TUI 框架、配置思路、键位风格都一脉相承，只是把对象从 git 仓库换成了 Docker 引擎。

日常类比：

- **docker CLI 像手写工单**——每次都要写全（`docker logs -f --tail 100 my_app`、`docker stats my_app` 各开一个终端），啰嗦还要记容器名
- **lazydocker 像值机大屏**——所有航班（容器）一眼可见，光标移过去就同时刷出实时图表 / 日志 / 元数据，按一个字母键就执行操作

启动后默认五面板：**Project**（项目状态摘要）/ **Containers**（运行中和已停止的容器）/ **Images**（镜像列表）/ **Volumes**（卷）/ **Networks**（网络）。如果当前目录有 `docker-compose.yml`，自动多出一个 **Services** 面板，可以按服务粒度 `up/down/restart`。

## 为什么重要

Docker 用了一阵子的人都会积累一组痛苦：

- `docker ps` 看不到 CPU / 内存——还得另开一个 `docker stats` 窗口
- `docker logs -f` 占一个终端，看完得 Ctrl-C 切回去
- 容器名长 / 哈希难记——每条命令都要 tab 补全或复制粘贴
- 想进容器排查得敲 `docker exec -it <id> /bin/sh`，敲完发现镜像没装 bash 或 sh

lazydocker 把这些痛点**一次性打包**：

- 光标停在哪个容器，右侧自动显示该容器的 logs / stats / config / top / env，**不用切窗口也不用敲命令**
- 实时 CPU / 内存图（点状曲线）就画在面板里——和 [[btop]] 看系统资源是同一类视觉密度
- 单键 `e` exec 进容器、单键 `r` 重启、单键 `d` 删除（带确认）、单键 `p` prune

所以装 lazydocker 不是为了酷，是**把 Docker 学习曲线砍一半**——新人不用先记十几个 docker 子命令，看屏幕提示就能干活。

## 核心要点

lazydocker 的设计可以拆成 **4 件事**：

1. **gocui TUI 框架**：作者自己写的 Go 版 ncurses 替代（也开源），负责画面板边框、捕获键盘、渲染 ANSI。和 [[lazygit]] 共用同一个底层，所以两者键位手感几乎一致。

2. **直接调 docker 子进程**：lazydocker 自己不实现 Docker 引擎协议，每个操作都通过 docker CLI / Docker SDK for Go 拿数据——容器列表是 `docker ps`，日志是 `docker logs --follow`，资源图是 `docker stats --stream`。**好处**：和 [[docker]] 行为完全一致，引擎升级不用动 lazydocker；**代价**：远程 / 慢网络下每次面板切换都要重新拉数据。

3. **YAML 配置 + 自定义命令**：`~/.config/lazydocker/config.yml` 改键位、改颜色、改刷新频率、加 `customCommands`——可以绑一个键跑任意 shell，比如把 `docker compose pull && docker compose up -d` 绑到 `U`。和 [[lazygit]] / [[btop]] 一样能进团队 dotfiles 共享。

4. **docker-compose 一等公民**：检测到 `docker-compose.yml` 自动加 Services 面板，同一个服务的多个副本聚合在一起，单键 `restart` 只重启这一个服务而不动数据库。这是**比裸 docker CLI 更贴近开发工作流**的关键设计。

## 实践案例

### 案例 1：找出谁在吃内存

```bash
lazydocker
# 默认进 Containers 面板，光标移到可疑容器
# 右侧自动出 CPU / Memory 实时曲线
# 按 m 切到 stats 标签页看完整指标
# 看清是哪个容器涨内存，按 r 重启
```

原来需要 `docker ps` + `docker stats` + 心算找元凶；lazydocker 一屏就完了。

### 案例 2：docker-compose 项目里只重启一个服务

```bash
cd ~/myproject  # 含 docker-compose.yml
lazydocker
# 自动出现 Services 面板（按 5 切过去）
# 光标停在 'web' 服务上，按 r 重启
# 切到 logs 标签页（按 [ / ] 切 tab）看新日志
```

不再需要敲 `docker compose restart web && docker compose logs -f web` 两条命令。

### 案例 3：清理硬盘的 prune 操作

```bash
lazydocker
# 按 4 切到 Images 面板
# 按 p（prune），弹出确认菜单
# 选 'Prune unused images'，回车
# 几秒后看 Images 列表少了一半，硬盘多出 5GB
```

裸 CLI 是 `docker image prune -a` + `docker volume prune` + `docker container prune` 三条；lazydocker 一个 `p` 键带菜单选。

## 踩过的坑

1. **Mac 上看不到任何容器**：`DOCKER_HOST` 没设。Docker Desktop 用 `unix:///var/run/docker.sock`；colima 用 `~/.colima/default/docker.sock`；OrbStack 自己处理。设错或没设会出现"明明 docker ps 有，lazydocker 空白"。

2. **prune 一旦按下不可撤销**：在 Volumes 面板按 p 会删未挂载的卷，**包括你忘了挂回去的数据库 volume**——按之前一定看清当前面板。

3. **远程 Docker 慢**：`DOCKER_HOST=tcp://prod-host:2375` 也能用，但每次切面板都要远程拉数据，体感卡顿。生产环境别这么用，看监控走 [[prometheus]] / cAdvisor。

4. **日志面板长行被截**：默认不换行。`config.yml` 加 `logs: { wrap: true, timestamps: true }` 后能看完整时间戳和换行。

5. **键位和 tmux prefix 冲突**：进 lazydocker 后某些键被 tmux 截走。和 [[lazygit]] 一样，可以在 config.yml 的 keybinding 段重映射，或调整 tmux prefix 到 backtick。

## 适用 vs 不适用场景

**适用**：

- 日常本地 Docker 开发——一屏看全所有容器的 CPU / 日志 / 状态
- docker-compose 项目——按服务粒度重启 / 看日志比 CLI 快一倍
- 找内存 / CPU 异常容器——实时曲线一目了然
- 团队 dotfiles 默认装一份——和 [[lazygit]] 配套，新人上手快
- 定期 prune 清理硬盘——TUI 带确认菜单比裸命令安全

**不适用**：

- 生产服务器监控——TUI 要 tty，没法常驻；用 [[prometheus]] + cAdvisor + Grafana
- Kubernetes 集群——lazydocker 只看 Docker 引擎，看不到 pod / deployment；用 k9s
- 脚本化 / CI 流水线——TUI 没 batch 模式；用 docker CLI
- 极端低带宽 ssh——面板刷新成本高，用 `docker ps` / `docker logs` 更省

## 历史小故事（可跳过）

- **2019 年**：Jesse Duffield 写完 [[lazygit]] 后顺手用同一套 gocui 框架做了 lazydocker——共用底层、共用配置思路、共用键位风格
- **2020-2022 年**：在 Docker 重度用户（后端 / DevOps）圈子里慢慢传开，brew formula 进官方仓库
- **2023 年**：纳入许多 DevOps dotfiles 默认包，和 lazygit / [[fzf]] / [[bat]] / [[delta]] 一起被推荐为 "现代终端栈"
- **2024-2025 年**：稳定期，低频次发版主要修 bug，37k+ star，是 GitHub 上最受欢迎的 Docker TUI
- **特别之处**：作者一个人维护 lazygit / lazydocker / lazynpm / gocui 四个项目，"懒人 TUI" 系列已经自成流派

## 学到什么

1. **TUI 不是炫技，是降低学习曲线**——lazydocker 没替代 docker，只是把命令翻译成可见菜单；新人不用记十几条 docker 子命令
2. **不重新发明轮子，调子进程**——lazydocker 不实现 Docker 引擎协议，每次操作都 fork docker CLI；和 [[docker]] 行为永远一致，是工程上聪明的偷懒
3. **同一套底层造一族工具**——gocui + lazygit + lazydocker + lazynpm，作者把 TUI 框架的复用做到极致
4. **YAML + customCommands 是开放式扩展**——和 [[lazygit]] / [[btop]] / [[fzf]] 一样，配置进 dotfiles，团队风格统一
5. **多面板 + 实时曲线是 TUI 流派的共同语言**——[[btop]] 五面板看资源，lazydocker 五面板看 Docker，[[lazygit]] 五面板看 git；都是"密度第一"的设计哲学

## 延伸阅读

- 官方 README：[github.com/jesseduffield/lazydocker](https://github.com/jesseduffield/lazydocker)（含 GIF 演示和键位速查）
- 作者频道：搜 "lazydocker tutorial Jesse Duffield"，作者本人录的入门视频
- gocui 项目：[github.com/jesseduffield/gocui](https://github.com/jesseduffield/gocui)（lazydocker 底层 TUI 框架）
- 同类对比：搜 "lazydocker vs ctop vs dive"——lazydocker 功能最全，ctop 最早最轻，dive 专攻镜像层分析
- [[docker]] —— lazydocker 的"被驱动对象"，看懂 docker 才看得懂 lazydocker
- [[lazygit]] —— 同作者同框架的 git 版本，键位互通

## 关联

- [[lazygit]] —— 同作者 / 同 gocui 框架 / 同设计哲学，git 和 docker 各占一台
- [[docker]] —— lazydocker 是它的 TUI 前端，所有操作最后都翻译成 docker 子进程
- [[btop]] —— 同走"多面板 + 实时曲线"路线，btop 看系统 lazydocker 看容器
- [[fzf]] —— 同样常进 dotfiles，搜索思路类似
- [[gitui]] —— 同样的 git TUI 思路，但 Rust 写、libgit2 直连

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bat]] —— bat — 现代 cat 替代
- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[delta]] —— delta — git diff 的语法高亮分页器
- [[fzf]] —— fzf — 命令行模糊查找
- [[lazygit]] —— lazygit — Go 写的全功能 git TUI，键盘驱动 stage / rebase / cherry-pick
- [[lima]] —— Lima — macOS 上跑 Linux 虚拟机的轻量 CLI
- [[prometheus]] —— Prometheus — 时序监控系统


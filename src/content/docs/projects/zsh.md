---
title: zsh — 比 bash 更聪明的兼容派 shell
来源: https://github.com/zsh-users/zsh
日期: 2026-05-31
子分类: DevOps 与运维
分类: 基础设施
难度: 入门
provenance: pipeline-v3
---

## 是什么

zsh 全名 **Z Shell**，是一个**既能跑老 bash 脚本、又自带现代体验**的命令行 shell。日常类比：bash 像 1979 年的固话机，fish 是另起炉灶的智能机，zsh 则是**把固话机改装成智能机**——拨号方式没变，多了来电显示、通讯录、自动补全。

打开它，最常见的体验是：

```
$ git che<TAB>
checkout  cherry-pick  cherry
```

按 Tab 列出可选项，再 Tab 在选项之间切换，回车选定。这种"补全菜单可视化"是 zsh 默认就有，而 bash 要按两下 Tab 才显示一个粗糙列表。

## 为什么重要

不学 zsh 也能写代码，但理解它能让你看清三件事：

- **macOS Catalina（2019）起 zsh 是系统默认 shell** —— 苹果把 bash 换掉，是 zsh 推广史最大的一次顺风
- **POSIX 兼容 + 扩展叠加** —— 和 fish 的"故意不兼容"相反，zsh 选择"老脚本一字不改能跑，新功能往上加"。这是更保守、也更主流的演化路径
- **zsh 是基础设施，不是终点** —— oh-my-zsh / prezto / zinit / starship 都把它当宿主，学会底层后这些"全家桶"才不再是黑盒

如果你 macOS 默认就在用 zsh，花一个下午搞懂它的启动文件链和补全系统，回报率比换 fish 还高——因为你已经在用了。

## 核心要点

### 1. 启动文件链（最容易踩的入口）

zsh 启动时按顺序读 5 类文件，分别对应**所有用户/当前用户**和**何种 shell**：

```
/etc/zshenv  → ~/.zshenv      （所有 zsh 进程都读，含脚本）
/etc/zprofile → ~/.zprofile   （登录 shell 才读）
/etc/zshrc   → ~/.zshrc       （交互 shell 才读，最常改）
/etc/zlogin  → ~/.zlogin      （登录 shell，在 zshrc 之后）
/etc/zlogout → ~/.zlogout     （退出时）
```

**踩坑提示**：`~/.zshenv` 是非交互脚本也会读的，写慢操作（如 `nvm.sh`）会让 `git status` 都变慢。把重活留给 `~/.zshrc`。

### 2. compinit —— 补全引擎入口

zsh 补全不是"读 man page 自动生成"，而是有人手写补全函数（如 `_git`、`_kubectl`），放在 `$fpath` 里。

```zsh
autoload -Uz compinit
compinit
```

这两行**必须在 `.zshrc`**。`autoload` 把函数延迟到第一次调用才加载；`compinit` 扫 `$fpath` 编译补全索引（缓存到 `~/.zcompdump`）。

### 3. 递归 glob `**`

zsh 比 bash 早多年支持：

```zsh
ls **/*.md           # 当前及所有子目录的 md 文件
rm **/*.tmp(.)       # (.) 限定只匹配普通文件
```

`(.)` 这种**glob 限定符**是 zsh 独有，能在 glob 上加文件类型/时间/大小过滤，省掉一半 `find` 调用。

### 4. zle（Zsh Line Editor）

命令行编辑器框架。你装的 zsh-syntax-highlighting / zsh-autosuggestions 都是 **zle widget**——一段在你按键时被调用的 zsh 函数。理解这个就理解了为什么"插件"能改命令行行为。

### 5. RPROMPT 与 prompt 系统

zsh 支持**右侧 prompt**：

```zsh
RPROMPT='%F{cyan}%~%f'
```

bash 没有等价；这就是为什么 starship/powerlevel10k 在 zsh 上能做出更花哨的状态栏。

## 实践案例

### 案例 1：zmv 批量重命名

```zsh
autoload -U zmv
zmv '(*).jpeg' '$1.jpg'
```

把所有 `.jpeg` 改成 `.jpg`。`(*)` 是捕获组，`$1` 是反引用。**不用写 for 循环**——这是 zsh 内建的杀手锏。

### 案例 2：参数扩展旗标

```zsh
files=(a.txt b.txt c.txt)
echo ${(j:, :)files}    # 输出 a.txt, b.txt, c.txt
echo ${(U)PATH}         # 把 PATH 全大写
```

`${(j:, :)var}` 用逗号空格 join 数组；`${(U)var}` 大写化。bash 完全没有这种短旗标。

### 案例 3：用 typeset -U 给 PATH 去重

```zsh
typeset -U path
path=(~/bin /usr/local/bin $path)
```

`typeset -U` 声明数组**自动去重**——后加重复值会被忽略。常年累月加 PATH 不再爆炸。

## 踩过的坑

1. **`~/.zshenv` 拖慢所有命令**：非交互脚本也读它。`nvm.sh` 这种重活放进去，每次 `git commit` hook 都慢半秒。**解决**：交互逻辑留给 `~/.zshrc`。

2. **compinit 抱怨 insecure directories**：补全目录权限松（如 `chmod 777`）会被拒绝加载。临时绕过 `compinit -u`，正解是 `chmod 755 $fpath`。

3. **数组从 1 开始**：从 bash 迁移过来最容易翻车的一处。`${arr[1]}` 是第一个元素，不是第二个。`KSH_ARRAYS` 选项可以切回 0-based，但不推荐——和生态不一致。

4. **PATH 越累越长**：`~/.zshenv` 和 `~/.zshrc` 都 `export PATH=...:$PATH`，登录 shell 会读两次，PATH 翻倍。用 `typeset -U path` 一劳永逸。

## 适用 vs 不适用场景

**适用**：

- macOS 日常用户（系统默认就是它）
- 想要"老脚本能跑 + 现代体验"的兼顾派
- 用 oh-my-zsh / starship / powerlevel10k 全家桶的人

**不适用**：

- 服务器最小 init 脚本（用 `/bin/sh` 更稳）
- 嵌入式或 BusyBox 环境（zsh 体积比 ash/bash 大）
- 想要极致开箱体验的人——zsh 默认很朴素，要靠插件堆出 fish 那种感觉

## 历史小故事（可跳过）

- **1990 年**：普林斯顿学生 Paul Falstad 写出 zsh，名字取自当时助教 Zhong Shao 的首字母
- **1997 年**：zsh 3.0，功能闭环成形——补全、glob 限定符、zle 都到位
- **2009 年**：Robby Russell 发起 oh-my-zsh，让"配 zsh"从手写 .zshrc 变成 `curl | sh` 一键
- **2019 年**：macOS Catalina 默认 shell 从 bash 切到 zsh（bash 停在 3.2 不能升是 GPLv3 许可问题），zsh 一夜成为亿级用户工具

这条线说明 zsh **不是赢在功能新**，而是**赢在兼容性 + 苹果背书**。

## 学到什么

1. **兼容是策略不是包袱**——fish 选断舍离，zsh 选叠加，两条路都活下来
2. **基础设施和上层框架要分清**——zsh 是 shell，oh-my-zsh 只是配置；混淆会让"我的 shell 怎么这么慢"找不到根
3. **默认体验不是终点**——zsh 默认朴素，但留了 zle/fpath/补全这些扩展点，让别人能堆出花

## 延伸阅读

- 官方手册：[zsh.sourceforge.io/Doc/Release/](https://zsh.sourceforge.io/Doc/Release/)
- 对照 bash 的迁移指南：[scriptingosx.com/2019/06/moving-to-zsh/](https://scriptingosx.com/2019/06/moving-to-zsh/)
- 配置框架入口：[oh-my-zsh](https://github.com/ohmyzsh/ohmyzsh)
- 启动文件可视化：[zsh startup files diagram](https://zsh.sourceforge.io/Intro/intro_3.html)

## 关联

- [[fish]] —— 另一条 shell 路线，故意不兼容 POSIX 换默认体验
- [[nushell]] —— 第三条路，把命令之间传结构化数据
- [[starship]] —— 跨 shell prompt，常和 zsh 搭
- [[warp]] —— 现代终端，底层常驻一个 zsh

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[fish]] —— fish — 装好就比 bash 加插件好用的交互 shell
- [[fish-shell]] —— fish-shell — 友好交互式命令行 Shell
- [[starship]] —— Starship — 一份配置点亮所有 shell 的 prompt
- [[tmux]] —— tmux — 一个终端窗口里跑多个会话还能脱离重连
- [[warp]] —— warp — Rust 里把请求处理拼成 Filter 积木的 web 框架


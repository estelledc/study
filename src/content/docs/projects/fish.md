---
title: fish — 装好就比 bash 加插件好用的交互 shell
来源: https://github.com/fish-shell/fish-shell
日期: 2026-05-31
分类: 命令行工具
难度: 入门
---

## 是什么

fish 全名 **Friendly Interactive Shell**，是一个**给人用、不给脚本用**的交互式命令行。日常类比：bash 像功能机的拨号键盘，fish 像智能手机——**你打前两个字母，它把整句话灰色补出来**，按右箭头就接受。

打开它，你看到的是这样：

```
$ git che_____________  ← 灰色：ckout main（来自历史）
```

按右箭头，`git checkout main` 就填进去了。这种"打字时就能预览"的体验是 fish 默认就有，bash 要装一堆插件才接近。

## 为什么重要

不学 fish 也不影响你写代码，但理解它能让你看清两件事：

- **shell 不是只能继承 1979 年的 sh** —— fish 故意**不兼容 POSIX**，证明一个 shell 可以重新设计而不是抱着旧标准
- **默认值的力量** —— 同样是装好就用，bash 让你看 `$` 和黑屏，fish 给你高亮、补全、Web 配置页，用户体验差出一个时代

如果你换新机器装 macOS / Linux，把默认 shell 从 zsh 切到 fish 大概是**一行命令的小投资换长期回报**。

## 核心要点

fish 默认开箱的**四个能力**，是其他 shell 要装插件才有的：

1. **autosuggestions（灰色自动建议）**：从历史和补全里挑最可能的下一句，按 → 接受。**你打字越多，它越懂你**——它会按"最近用过、当前目录用过"加权排序。

2. **syntax highlighting（语法高亮）**：命令存在变绿、不存在变红，路径存在变下划线。**红色出现就是打错了**，回车前就知道，省下一次报错往返。

3. **从 man page 解析补全**：装 `git`，fish 会读 `man git` 自动生成 `git` 的子命令补全。**不需要维护一个补全文件**——这是 fish 比 bash / zsh 长期领先的一招。

4. **fish_config Web 配置页**：在终端敲 `fish_config`，浏览器打开一个本地页，可视化改主题、看历史。**没有第二个 shell 这么做**。

加一个**故意不兼容 POSIX**的设计哲学：fish 不让你 `source` 旧的 `.sh`，因为它认为 POSIX 语法本身有坑（变量分词、引号嵌套、错误处理），与其修补不如重来。

## 实践案例

### 案例 1：变量赋值不一样

bash / zsh：

```bash
export PATH="$HOME/bin:$PATH"
```

fish：

```fish
set -gx PATH $HOME/bin $PATH
# 现代写法更推荐：
# fish_add_path $HOME/bin
```

**逐字解释**：`set` 是赋值命令，`-g` 全局，`-x` 导出（export），多个值**用空格分隔不用拼字符串**——fish 的列表是真列表，不是空格分割的字符串。日常加路径优先用 `fish_add_path`，少踩 universal / 重复条目的坑。

### 案例 2：if / function 用 end 收尾

```fish
function greet
    set name $argv[1]
    if test -z "$name"
        echo "hi 陌生人"
    else
        echo "hi $name"
    end
end
```

**对照 bash** 用 `fi` 和 `}`，fish 统一用 `end`——一个关键字关三种块（if / function / for），少记两个语法。

### 案例 3：universal variable（所有 fish 会话共享）

```fish
set -U FISHER_PLUGINS jorgebucaran/fisher
```

`-U` 是 fish 独有的"universal"——**写一次，所有打开的 fish 都看得到，关机重开也在**。bash / zsh 没有等价物，必须写到 `.bashrc` 让每个新 shell 重读。

底层实现是 fish 把 universal 变量写到 `~/.config/fish/fish_variables`，由后台守护进程通知所有运行中的 fish 实例**实时更新**。所以你在终端 A 改了 `set -U EDITOR vim`，终端 B 不用重开就生效。

### 案例 4：抽象函数（abbr）—— 比 alias 更聪明

```fish
abbr -a gco git checkout
```

打 `gco` 然后空格，fish **当场把 `gco` 替换成 `git checkout` 显示出来**——你看到完整命令、历史里也存完整命令。alias 是隐藏替换，abbr 是**显式展开**，调试和分享时不会混淆。

## 踩过的坑

1. **服务器脚本不要写 fish**：服务器默认没装 fish，CI 也大多用 bash。**fish 只用于交互**，写部署脚本仍用 bash / sh。

2. **`source` 旧 .sh 失败**：很多工具的 `init` 脚本是 bash 语法（`export FOO=bar`），fish 直接报错。**解决**：用 `bass`（fish 插件）翻译，或重写为 `.fish`。

3. **`$(cmd)` 不工作**：fish 用 `(cmd)` 做命令替换。**心智切换成本最高的一个**——肌肉记忆经常打错。

4. **从 C++ 重写到 Rust**：fish 4.0 用 Rust 重写。**意味着旧版二进制和新版行为可能微妙不一致**——升级前看一眼 changelog。

## 适用 vs 不适用场景

**适用**：

- 日常交互——cd / git / ls / vim 调用，几乎每个命令都受益
- 新机器零配置——装完 `brew install fish` 就比配 bash 一周强
- 不写复杂 shell 脚本的桌面用户

**不适用**：

- 团队部署脚本（同事机器没装就跑不了）
- 需要 POSIX 兼容的 CI / 容器入口
- 重度 sh-script 生态（很多工具的 `install.sh` 假设 bash）

## 历史小故事（可跳过）

- **2005 年**：Axel Liljencrantz 在瑞典发布 fish 1.0，主打"对新手友好"，第一次把语法高亮带进 shell
- **2018 年**：fish 3.0，确立现代功能闭环（autosuggestions / 高亮 / 补全 / Web 配置），周边插件管理器 Fisher 也在这时成熟
- **2024-2025 年**：核心从 C++ 迁移到 Rust，4.0 启动；目的是降低维护门槛、吸引新贡献者，也借机把多年累积的内存/线程问题清理一遍

这条时间线说明 **fish 不是热门一两年的工具**，它是 20 年慢慢演化的"日常体验流派"代表。

## 学到什么

1. **shell 是工具不是教条**——可以为了"日常好用"放弃 POSIX 兼容
2. **默认值定义体验**——同样是高星开源项目，差别常常不在功能数而在"开箱第一分钟"
3. **"不兼容"也是一种选择**——重写比修补更便宜的时候，敢于断舍离

## 延伸阅读

- 官方教程：[fishshell.com/docs/current/tutorial.html](https://fishshell.com/docs/current/tutorial.html)（半小时上手）
- 对照表：[fish-vs-bash cheat sheet](https://fishshell.com/docs/current/fish_for_bash_users.html)
- Rust 重写动因：[fish-shell/fish-shell #9512 讨论](https://github.com/fish-shell/fish-shell/issues/9512)
- 插件入口：[Fisher](https://github.com/jorgebucaran/fisher)

## 关联

- [[wezterm]] —— Rust 写的现代终端，和 fish 常一起组成「现代交互」日常组合
- [[starship]] —— 跨 shell 通用 prompt，常和 fish 配对
- [[zsh]] —— fish 的另一个选择，POSIX 兼容但默认体验不如 fish
- [[nushell]] —— 另一条「重想 shell」路线，偏结构化数据管道

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[nushell]] —— nushell — 让命令之间传 Excel 表而不是传纸条
- [[oh-my-posh]] —— oh-my-posh — 一份配置让所有 shell 都长一个样
- [[xonsh]] —— xonsh — 在同一行里同时写 bash 命令和 Python 代码
- [[zsh]] —— zsh — 比 bash 更聪明的兼容派 shell

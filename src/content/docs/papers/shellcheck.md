---
title: ShellCheck — 帮你抓 Bash 脚本里那些"半夜才发作"的坑
来源: Vidar Holen, ShellCheck 项目，2012 年起，GitHub koalaman/shellcheck
日期: 2026-05-31
分类: infrastructure
难度: 入门
---

## 是什么

ShellCheck 是一个**专门给 shell 脚本（bash / sh / dash / ksh）做体检的工具**。日常类比：你写完一份合同，请律师替你审一遍，找出"这条措辞会被对方钻空子"的地方——ShellCheck 就是 shell 脚本的律师。

你写（注意：赋值本身要先加引号，否则 bash 会把 `report.txt` 当成命令去跑）：

```bash
file="my report.txt"
rm $file
```

ShellCheck 立刻喊：

```
SC2086: Double quote to prevent globbing and word splitting.
```

意思是："这个 `$file` 没加双引号，shell 会按空格切成两半，你以为在删一个文件，其实在删两个。"

每条警告都有一个稳定编号（`SC2086`、`SC2046`），可以点进 wiki 看为什么、怎么改。它既是 lint，也是教材。

## 为什么重要

不用 ShellCheck 写 shell，等于裸手玩玻璃刀：

- shell 的**变量展开规则反直觉**——空格、星号、问号会被默默"加工"，新人踩中后查半天
- 这类 bug **运行时才暴露**，而且常常是"周末跑批量脚本时才中招"
- shell 是基础设施粘合剂——CI、Docker entrypoint、运维脚本都靠它，一个 `$file` 没引号能删错目录
- 每条警告自带 wiki 解释——**装上 ShellCheck 等于雇了一个 24 小时在线的 bash 老师**

## 核心要点

ShellCheck 干的事可以拆成 **三块**：

1. **静态分析**：不运行你的脚本，只读文本。类比：律师审合同不用真的执行合同，光读字就知道哪里有坑。

2. **稳定的警告编号**：每条问题给一个 `SCnnnn` 号，不会因版本变化乱跳。你 google `SC2086` 永远能找到同一篇解释。

3. **就地建议**：不光说"这里有问题"，还告诉你"改成这样"。比如 `rm $file` → 提示 `rm "$file"`。

底层用 **Haskell** 写，2012 年 Vidar Holen 开源，到现在仍是 shell 静态分析事实标准。

## 实践案例

### 案例 1：最常踩的 SC2086 — 没加双引号

```bash
file="my report.txt"
cat $file       # 警告 SC2086
```

**为什么错**：shell 看到 `$file` 没引号，会先展开成 `my report.txt`，再按空格切成两个词，于是变成 `cat my report.txt`，去找两个文件。

**怎么改**：

```bash
cat "$file"     # 通过
```

### 案例 2：SC2046 — 命令替换也要引号

```bash
rm $(find . -name '*.log')   # 警告 SC2046
```

如果某个 log 文件名带空格，`find` 输出后还是会被切碎。

**怎么改**：

```bash
find . -name '*.log' -exec rm {} +
```

或者用数组：

```bash
mapfile -t files < <(find . -name '*.log')
rm "${files[@]}"
```

### 案例 3：SC2164 — cd 失败你都不知道

```bash
cd /tmp/build
rm -rf *           # 万一 cd 失败，rm 在当前目录！
```

ShellCheck 提示加上短路：

```bash
cd /tmp/build || exit
rm -rf -- *
```

短短两个字符救你一条命。

### 案例 4：SC2155 — declare 和赋值分开

```bash
local x=$(some_cmd)        # 警告 SC2155
```

**为什么错**：`local` 本身有自己的退出码，会**吞掉** `some_cmd` 的失败状态——你以为脚本在 `set -e` 下能捕获错误，其实悄悄漏过。

**怎么改**：

```bash
local x
x=$(some_cmd)
```

### 案例 5：在 CI 里跑

```yaml
# .github/workflows/lint.yml
- name: ShellCheck
  run: |
    find scripts -name '*.sh' -print0 | xargs -0 shellcheck
```

`-print0` / `-0` 配对的意思是"用空字节而不是换行分隔文件名"——这样含空格 / 换行的文件名也不会被切错。合并 PR 前自动跑一遍，新增脚本带坑就拦下来。

## 踩过的坑

1. **关掉警告前先看懂**：`# shellcheck disable=SC2086` 一行就能消音，但**只在你确定值不可能含空格 / 星号时**才用，否则等于把保险栓拔了再开枪。

2. **静态分析有边界**：ShellCheck 不会真的跑你的脚本，所以"运行时才出现的 bug"它抓不到。比如 API 返回值变化、文件权限问题，仍要靠测试。

3. **source 动态路径它跟不进去**：`source "$config_dir/x.sh"` 这种 ShellCheck 不知道里面是啥，会给 SC1090/SC1091。可以加 `# shellcheck source=./x.sh` 注释手动指路（这是 ShellCheck 自家的指令注释，不是 bash 语法）。

4. **它不管 zsh / fish**：只覆盖 POSIX shell 家族（sh / bash / dash / ksh）。zsh 用户得另外找工具。

## 适用 vs 不适用场景

**适用**：

- 任何写 bash 脚本的项目——CI / Dockerfile / 部署脚本 / git hook
- pre-commit 钩子——每次提交自动扫描改动的 `.sh`
- 编辑器插件（VSCode / Vim）——边写边亮黄
- 教 shell——把警告 wiki 当 bash 进阶教材读

**不适用**：

- zsh / fish 专用脚本——它不认
- 运行时 bug（变量真实值依赖 API）——静态分析看不到
- 格式化（缩进、换行）——那是 `shfmt` 的活，分工要清楚
- 性能瓶颈——ShellCheck 看正确性，不看快慢

## 历史小故事（可跳过）

- **2012 年**：挪威开发者 Vidar Holen（GitHub 用户名 koalaman）开源 ShellCheck，用 Haskell 写。最初动机：他自己写 bash 脚本踩坑太多。
- **2014 - 2015 年**：被各大 Linux 发行版打包，shellcheck.net 上线在线 demo。
- **2017 年起**：成为 CI 标配。pre-commit / husky / Earthly 等工具内建支持。
- **现在**：许多 Linux 发行版、Homebrew formula，以及各类 CI / Ansible 工作流都把 ShellCheck 当标配。

写 Haskell 的工具能在 bash 圈封神，本身就是个段子。

## 学到什么

1. **静态分析不止给 C 和 Java 用**——脚本语言一样可以静态查 bug，只要规则清楚
2. **稳定的错误编号 + wiki = 自带教材**——好工具的报错本身就是文档
3. **shell 的反直觉默认行为是历史包袱**——没引号默认 split 在 70 年代是 feature，现在是 bug 源头；ShellCheck 在帮你绕开这些遗产
4. **Lint 是文化的一部分**——一个项目装不装 ShellCheck，能看出团队对脚本的认真程度

## 延伸阅读

- 官方站点：[shellcheck.net](https://www.shellcheck.net)（粘脚本进去就能查）
- GitHub 仓库：[koalaman/shellcheck](https://github.com/koalaman/shellcheck)
- 警告 wiki 入口：[ShellCheck Wiki](https://www.shellcheck.net/wiki/)（每个 SCnnnn 都有页）
- 配套工具：`shfmt`（shell 格式化器）、`bats`（bash 测试框架）

## 关联

- [[shfmt]] —— 只管缩进换行的 shell 格式化器，和 ShellCheck 的正确性检查互补
- [[hadolint]] —— Dockerfile 的静态检查，思路同属「配置/脚本也要 lint」
- [[earthly]] —— Earthly 等 CI 工具常把 ShellCheck 作为默认步骤
- [[docker]] —— 镜像 entrypoint / 启动脚本最容易踩未引号展开
- [[ansible]] —— playbook 与运维脚本常嵌 shell，适合进 CI 扫一遍
- [[nushell]] —— 另一条结构化 shell 路线；ShellCheck 只管 POSIX/bash 家族
- [[playwright]] —— 浏览器侧自动测试 vs 脚本侧自动审查，思路同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

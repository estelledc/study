---
title: ShellCheck — shell 脚本的静态体检医生
来源: https://github.com/koalaman/shellcheck
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

ShellCheck 是一个**专门给 shell 脚本（bash / sh / dash / ksh）做静态体检**的工具。

日常类比：

- 写代码就像装修房子，shell 是其中最容易漏水的水管
- ShellCheck 像装修验收师傅，**不开水龙头**也能指出："这个接口没拧紧（变量没加引号），住进来一年后会漏水"
- 静态分析 = 不跑脚本，光读代码就找问题

挪威开发者 Vidar Holen（GitHub 名 `koalaman`）2012 年开源，**Haskell** 写成，GPL-3.0 协议。

仓库：[github.com/koalaman/shellcheck](https://github.com/koalaman/shellcheck)。在线试用：[shellcheck.net](https://www.shellcheck.net)（贴脚本就能看报错）。

## 为什么重要

shell 脚本是基础设施的**胶水**——CI 流水线、部署脚本、Docker entrypoint 全靠它。但 shell 的语法陷阱多到反人类：

1. **bug 通常凌晨 3 点才暴露**：脚本平时跑得好好的，某天文件名带了空格 / 路径有星号，**生产环境直接炸**。ShellCheck 在写的时候就告诉你
2. **新手写出 CVE 形状的 bug**：`rm $file` 看上去没问题，但 `$file` 是 `a b` 时会变成 `rm a b`——删错文件。这种坑 ShellCheck 一秒看出来
3. **每条警告有稳定 ID**：`SC2086` / `SC2046` 这种编号链到 wiki 页，**报错本身就是教材**——这一点 ESLint、pylint 都做不到那么细
4. **CI 标准工具**：Linux 内核脚本、Homebrew formulae、Ansible playbook 都把 ShellCheck 接进了流水线

不用 ShellCheck 直接写 bash 的代价 = 等于在凌晨 3 点 oncall 时给自己埋雷。

## 核心要点

ShellCheck 抓的最常见 6 类问题：

| 编号 | 问题 | 错例 → 正例 |
|------|------|------|
| SC2086 | 变量没加引号会被分词 / 通配 | `rm $f` → `rm "$f"` |
| SC2046 | 命令替换 `$(...)` 也要加引号 | `rm $(find ...)` → 加引号或 `-exec` |
| SC2148 | 没写 shebang，无法判断方言 | 加 `#!/bin/bash` |
| SC2164 | `cd` 失败后继续执行很危险 | `cd /foo` → `cd /foo \|\| exit` |
| SC2155 | 声明 + 赋值同行会吞返回值 | `local x=$(cmd)` → 拆两行 |
| SC2034 | 变量定义但没用 | 删掉或加上下划线前缀 |

背后涉及的 3 个概念，**每个都得理解才能正确读警告**：

1. **静态分析（static analysis）**：不跑脚本、只读代码，找可疑模式。优点是快、不用准备环境；缺点是**只能发现语法层面的坑**，跑起来才出现的逻辑 bug 抓不到
2. **分词（word splitting）**：shell 默认会把没加引号的变量按空格 / 制表符 / 换行**切开**成多个参数。`name="a b"; echo $name` 会输出 `a b`（两个参数），加引号才是 `"a b"`（一个参数）
3. **通配（globbing）**：shell 把 `*` `?` `[]` 这些当**文件名通配符**展开。`echo *` 会列出当前目录所有文件名。这意味着没加引号的变量如果含 `*`，会被替换成文件列表

## 实践案例

### 案例 1：CI 接 ShellCheck

最常见用法——`.github/workflows/lint.yml` 里加一行：

```yaml
- name: ShellCheck
  uses: ludeeus/action-shellcheck@master
```

每次 push，CI 自动扫所有 `*.sh` 文件，有警告就**红叉挡 merge**。

### 案例 2：本地预提交钩子

用 [[pre-commit]] 框架接：

```yaml
repos:
  - repo: https://github.com/koalaman/shellcheck-precommit
    rev: v0.10.0
    hooks:
      - id: shellcheck
```

`git commit` 时自动跑，**有问题直接拒绝提交**。和测试同等地位。

### 案例 3：编辑器内联警告

VS Code 装 `timonwong.shellcheck` 扩展，写脚本时**红色波浪线**实时提示，鼠标悬停看警告说明 + SC 编号 + 修复建议。和 TypeScript 在 IDE 里的体验一样。

### 案例 4：手动一次性扫

```bash
shellcheck deploy.sh
```

输出长这样：

```
In deploy.sh line 12:
rm $temp_file
   ^-- SC2086 (info): Double quote to prevent globbing and word splitting.
```

点 SC2086 链接（[wiki](https://www.shellcheck.net/wiki/SC2086)）有完整解释 + 多种修复方式。

## 踩过的坑

1. **不假思索关警告**：写 `# shellcheck disable=SC2086` 关掉某条警告**很容易**，但 90% 的情况是该改代码不是关警告。规则：**没读完 wiki 页之前不许 disable**
2. **静态分析 ≠ 全部 bug**：ShellCheck 不会跑你的脚本，所以**逻辑错误**（条件写反、判断漏 case）抓不到。它只管"语法层面看着可疑的东西"
3. **source 动态路径不分析**：`source "$dir/lib.sh"`——ShellCheck 不知道 `$dir` 运行时是什么，会报 SC1090 / SC1091。可以加 `# shellcheck source=./lib.sh` 注释告诉它
4. **不支持 zsh / fish**：ShellCheck 只管 **POSIX 系**（sh / bash / dash / ksh）。zsh 独有语法（数组下标、glob qualifiers）会被误报。zsh 用户用 [[zshelldoctor]] 之类的工具

## 适用 vs 不适用场景

**适用**：

- 任何写 bash / sh 的项目的 CI 防线
- 团队新人 onboarding——警告本身就是 shell 教程
- 老脚本接手——一次扫完看遗留多少坑
- 本地编辑器实时提示

**不适用**：

- zsh-only 或 fish 脚本（语法不兼容）
- 运行时 / 动态 bug（要单元测试 + [[bats-core]]）
- 性能 / 内存问题（不是 ShellCheck 的范畴）
- 代码风格统一（缩进、空行）→ 用 [[shfmt]]，两者经常组合用

## 历史

- **2012**：Vidar Holen 在 GitHub 起了 `koalaman/shellcheck`，最早只是个 side project
- **2015 前后**：被各大 Linux 发行版 packaging，[shellcheck.net](https://www.shellcheck.net) 上线，可以贴脚本立即看报错
- **2017 后**：进入 CI 标配——pre-commit、Husky、各家 GitHub Action 都集成
- **现在**：Linux 内核构建脚本、Homebrew formulae、Ansible 模块都默认接 ShellCheck，**不接的项目反而是少数**

## 学到什么

1. **静态分析是低成本高回报的安全网**——5 分钟接进 CI，一辈子少踩 50 个坑
2. **错误信息加 wiki 链接是教学利器**——ShellCheck 的 SC 编号体系值得任何 linter 学习
3. **shell 看着简单但语法陷阱深**——分词 / 通配 / 引号规则没学透就别裸写 bash
4. **专门工具打专门战场**——shell 不是通用 linter（ESLint / pylint）能管的，得用领域专用工具

## 延伸阅读

- 仓库：[koalaman/shellcheck](https://github.com/koalaman/shellcheck)（GPL-3.0，38k 星）
- 在线 demo：[shellcheck.net](https://www.shellcheck.net)（贴脚本立刻看报错）
- 警告字典：[ShellCheck wiki](https://www.shellcheck.net/wiki/)（每个 SC 编号一页详解）
- Google Shell Style Guide：[google.github.io/styleguide/shellguide.html](https://google.github.io/styleguide/shellguide.html)（搭配 ShellCheck 用）
- [[pre-commit]] —— 最常见的本地接入方式
- [[bats-core]] —— shell 单元测试框架，补 ShellCheck 抓不到的运行时 bug

## 关联

- [[pre-commit]] —— ShellCheck 最常通过 pre-commit 接入仓库
- [[shfmt]] —— shell 格式化器，与 ShellCheck 是互补的两个工具
- [[bats-core]] —— shell 测试框架，处理 ShellCheck 抓不到的逻辑问题
- [[husky]] —— Node.js 项目里给 shell 钩子接 ShellCheck 的常见宿主

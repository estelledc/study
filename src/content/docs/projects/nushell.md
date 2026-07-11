---
title: nushell — 让命令之间传 Excel 表而不是传纸条
来源: https://github.com/nushell/nushell
日期: 2026-05-31
分类: 命令行工具
难度: 入门
---

## 是什么

nushell（命令是 `nu`）是一个**用 Rust 写、把命令之间流动的东西从字节流换成结构化表格**的 shell。日常类比：bash 里命令之间像在传纸条——每段拿到都得自己重新解析；nushell 里命令之间像在传 Excel 表——每段拿到的就已经是带列名的行列。

具体看一行：

```nu
ls | where size > 1mb | sort-by modified | first 5
```

`ls` 输出**不是文字**，而是一张 table，列叫 `name / size / modified / type`。`where size > 1mb` 直接按列名过滤，不用 `awk '{print $5}'` 那种数第几列。

这就是 nushell 想推的核心：**shell 也能像 SQL 那样按字段操作数据**。

## 为什么重要

不学 nushell 也不影响干活，但理解它能让你看清三件事：

- **shell 的 pipeline 不是只能传字节流** —— 1973 年 Unix 决定 pipeline 传字节，是当年内存极小的妥协；50 年后这个默认值开始挡路
- **shell 也可以有类型信息** —— int / string / list / record / table 全是一等公民，命令签名能写成 `path -> table`
- **PowerShell 不是孤例** —— 微软 2006 年就做了对象 pipeline，nushell 把这个想法做成开源、跨平台、Rust 实现

如果你经常 `curl ... | jq ... | awk ... | xargs ...` 调 4 个工具拼一行，nushell 的卖点就是**这一行变成 4 段同语言、不用记 4 种小语法**。

## 核心要点

nushell 和 bash 最根本的差别是 **三处**：

1. **管道传 value 不传 byte**：`ls | first 1` 给你的是一行 record（有 name/size 等字段），不是一行文本。下一条命令按字段访问，不用 cut/awk。

2. **数据格式原生支持**：`open config.json` 直接解析成 record，`open data.csv` 解析成 table，`open log.parquet` 也行。**不用先 cat 再 jq 再 awk**。

3. **带类型的值与命令签名**：int / string / list / record / table 是一等公民，命令有签名（如 `where: condition -> table`）。写错列名往往当场报错，不是跑到一半才崩——比 bash 字符串世界更可检查，但不是经典编译期静态类型语言。

加上一个故意的设计：**不兼容 POSIX**。老的 `.sh` 脚本跑不了，nushell 团队认为修补 POSIX 语法（变量分词、引号、错误处理）的坑不如重来——这点和 fish 同源。

## 实践案例

### 案例 1：找占用大的文件

bash 里要这样：

```bash
ls -la | awk '{ if ($5 > 1048576) print $5, $9 }' | sort -rn | head -5
```

nushell 里：

```nu
ls | where size > 1mb | sort-by size --reverse | first 5
```

**逐部分解释**：

- `ls` 返回 table，列 `name / size / modified / type`
- `where size > 1mb` 直接按列名过滤，**`1mb` 是字面量**——nushell 懂大小单位
- `sort-by size --reverse` 按列排序，不用记 `sort -k 5 -rn` 哪个标志干啥

bash 那行任何一个空格、引号、`$5`/`$9` 写错都崩；nushell 这行靠列名定位，写错列名当场报。

### 案例 2：处理 JSON 不用 jq

```nu
open package.json | get dependencies | columns
```

**逐部分解释**：

- `open package.json` 解析 JSON 成 record
- `get dependencies` 取出 `dependencies` 字段，仍是 record
- `columns` 列出所有键名

bash 等价：`cat package.json | jq '.dependencies | keys[]'`——要会 jq 的查询语法。
nushell 把 JSON 当成它自己的数据模型，直接复用同一套命令。

### 案例 3：进程过滤

```nu
ps | where cpu > 50 | select pid name cpu mem
```

**逐部分解释**：

- `ps` 也是 table，列 `pid / name / cpu / mem / status`
- `where cpu > 50` 按列过滤
- `select` 只保留这几列输出

bash 等价要 `ps aux | awk '$3 > 50 {print $2, $11, $3, $4}'`，得记 `aux` 输出第几列是 CPU。

### 案例 4：跨格式互转

```nu
open users.csv | where age > 30 | to json | save adults.json
```

**逐部分解释**：

- `open users.csv` 解析 CSV 成 table
- `where age > 30` 按列过滤
- `to json` 把 table 序列化成 JSON 文本
- `save adults.json` 写文件

bash 要先 `csvkit` 装一套、再 `jq` 装一套，nushell 把 CSV/JSON/YAML/TOML/Parquet 全部当成同一套 table 看。

## 踩过的坑

1. **老 `.sh` 跑不了**：故意的，不是 bug。nushell 不打算兼容 POSIX，要跑老脚本只能 `bash old.sh` 显式调 bash。

2. **生态远小于 bash**：`oh-my-bash`、`zsh-autosuggestions` 这些生态在 nushell 还在补。装 plugin 用 `register` 注册，不像 bash 直接 source。

3. **长期 0.x、命令名会变**：2019 启动后多年仍是 0.x（截至 2026 年中尚未正式发 1.0，社区在推稳定语法与 SemVer）。旧博客里的命令名可能已改——要看你用的版本文档。

4. **不能完全替代 bash 当系统 shell**：很多发行版的启动脚本、Dockerfile RUN 都假设 sh，nushell 适合**当交互 shell + 写自己的脚本**，不适合替换 `/bin/sh`。

## 历史小故事（可跳过）

- **2006 年**：微软发 PowerShell，第一个把"对象 pipeline"做进主流 shell。但绑死 .NET、闭源、Windows 限定。
- **2019 年**：Jonathan Turner（Rust 编译器组前成员）发起 nushell，目标是"PowerShell 的想法 + Rust 实现 + 跨平台 + 开源"。和 Andres Robalino、Yehuda Katz 一起推。
- **2019–2026 年**：长期 0.x，约四周一发、命令名与语法仍会 breaking；社区持续讨论 1.0（稳定核心语法与 SemVer）。从 PowerShell 想法到跨平台开源实现，跨了两波生态。

## 适用 vs 不适用场景

**适用**：

- 数据探索：日志、CSV、JSON 反复 grep/awk 想成 SQL 风格
- 跨格式转换：`open data.json | to csv | save data.csv` 一行
- 自己写的运维脚本，不需要给别人传

**不适用**：

- 给别人发的 install.sh / Dockerfile RUN
- 已经精通 bash + jq + awk，迁移成本不划算
- 极致性能场景（结构化处理有开销，传字节最快）

## 学到什么

1. **pipeline 模型可以重新设计**：传字节流是 1973 年的工程妥协，不是物理定律。50 年后内存够大、CPU 够快，传结构化数据完全成立。

2. **类型信息能进 shell**：以前觉得 shell 必须是纯字符串随便拼。nushell 证明带类型的值与命令签名后，**写错列名往往当场报**，体验更稳。

3. **故意不兼容旧标准**：fish 不兼容 POSIX、nushell 不兼容 POSIX、Deno 不兼容 npm。"放弃兼容"反而成为这一代工具的共同选择——兼容旧设计的代价已经超过了新设计的红利。

## 延伸阅读

- 官网：[nushell.sh](https://www.nushell.sh/)（左侧"Book"是入门最快的路径，比 GitHub README 详）
- 视频：[Jonathan Turner — Nushell: Modern Shell for the GitHub Era](https://www.youtube.com/watch?v=eXanRn8Acws)（作者讲为什么要做这个）
- 灵感对比：PowerShell 的对象 pipeline——理解 nushell 等于一半理解 PowerShell

## 关联

- [[fish]] —— 同样故意不兼容 POSIX 的现代交互 shell，但 fish 还是传字节，nushell 传结构化数据，两条不同路线
- [[warp]] —— 终端模拟器层面的现代化（输入框、AI 补全），和 nushell 的 shell 层重设计互补
- [[ripgrep]] —— 也是 Rust 写的命令行工具，但只做搜索；nushell 把多个这种工具的能力收进一个 shell

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

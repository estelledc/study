---
title: Miller (mlr) — 懂 CSV/JSON 表头的 awk
来源: https://github.com/johnkerl/miller
日期: 2026-05-30
分类: CLI
难度: 中级
---

## 是什么

Miller（命令名 `mlr`）是 **John Kerl 2015 年起做的命令行数据处理工具**（早期用 C，2022 年 Miller 6 起整库改写成 Go）——把 awk / sed / cut / grep / join / sort 的能力，搬到 CSV / TSV / JSON / JSON-Lines 这些"有表头有结构"的数据上。

日常类比：

- **awk 是不识字的工人**——你给它一行 `Alice,30,Beijing`，它只知道"第 1 段、第 2 段、第 3 段"，要写 `$2` 才能拿年龄
- **mlr 是识字的工人**——同一行配上表头 `name,age,city`，它知道每段叫什么，写 `$age` 就行

一份 CSV 里加一列、按某列分组求平均、转成 JSON——三件事在 awk 里要写三段不同的脚本，在 mlr 里是三个 verb 拼成一行管道。

## 为什么重要

不是"awk 加糖"，是补一类工具空白：

- **awk / sed / cut 不懂表头**——脚本里全是 `$3 $5 $7`，列顺序一变全炸
- **jq 只懂 JSON**——CSV 还是得回 awk
- **pandas 太重**——为读一个 CSV 起 Python、装依赖、写 5 行脚本，对一次性探索性任务不划算
- **mlr 在中间**——单二进制零依赖、像 awk 一样 grep-able，但 schema-aware

数据团队、SRE 排查日志、Bug 单做统计、跨格式转换——这是高频场景，mlr 的位置是"awk 写不动 + 上 pandas 不值得"那一段。

## 核心要点

mlr 的设计可以拆成 **3 件事**：

1. **字段名而非编号**：DSL 里写 `$age`、`$city`、`$total = $a + $b`——读代码就知道在算什么。awk 的 `$2 $5` 在 6 个月后回看就没人能读懂。

2. **格式正交**：输入格式（`--icsv` / `--ijson` / `--itsv` / `--ijsonl`）和输出格式（`--ocsv` / `--ojson` / `--opprint` 对齐打印）独立指定。一个工具完成 CSV → JSON、JSON → TSV、TSV → 对齐表格。

3. **链式 verb**：50+ 内置动词，像 Unix 管道一样串：
   ```
   mlr --icsv --ojson \
     filter '$age > 18' then \
     cut -f name,age then \
     sort -f name \
     people.csv
   ```
   `then` 把多个 verb 接成一条流式管道，每条记录依次经过。

## 实践案例

### 案例 1：CSV → JSON 一行命令

```bash
mlr --icsv --ojson cat people.csv
```

`cat` 是默认 verb（不变换、只读出来）。`--icsv` 告诉 mlr 输入是 CSV，`--ojson` 是 JSON。一行命令搞定一份 CSV → JSON 转换；如果你只想要前几条还可以加 `head -n 5` verb 在中间。

### 案例 2：按列分组求统计

```bash
mlr --icsv stats1 -a mean,p95 -f response_ms -g endpoint logs.csv
```

读 `logs.csv`，按 `endpoint` 列分组，对每组的 `response_ms` 算 mean 和 95 分位。同样的事在 awk 里要 `awk -F, ... | sort | uniq -c | ...` 写 5 行。

### 案例 3：两个 CSV 按 key join

```bash
mlr --csv join -j user_id -f users.csv then sort -nr signup_date orders.csv
```

`users.csv` 和 `orders.csv` 按 `user_id` 内连接，再按 `signup_date` 倒序。`--csv` 是 `--icsv --ocsv` 的简写。POSIX `join` 命令要先两边各自 sort、参数难记；mlr 的 `join` verb 自动处理。

### 案例 4：加一列计算字段

```bash
mlr --csv put '$total = $price * $qty; $tax = $total * 0.13' orders.csv
```

`put` verb 跑 DSL 表达式，对每条记录新增 `total` 和 `tax` 两列。多个赋值用 `;` 分隔，全程不离开 mlr——awk 也能做但要写 `BEGIN { FS="," }` 和手动处理 header，mlr 一行写完。

## 踩过的坑

1. **CSV 输入默认期望 header**——没 header 的文件直接 `mlr --icsv cat foo.csv` 会把第一行当列名。**修法**：加 `--implicit-csv-header`，列名变成 `1,2,3,...` 让你后续 `rename` 改名。

2. **字段访问是 `$name` 不是 `$1`**——写 `mlr put '$1 = $2 + 1'` 会得到字面量字符串 "1"，不是第一个字段。mlr DSL 没有"按位置取列"语法，要么用名字、要么先 `--implicit-csv-header` 再用 `$1`。

3. **输入输出格式要分别声明**——`mlr cat foo.csv` 默认按 DKVP（`a=1,b=2` key=value 行）解析，CSV 文件直接报"missing key"。养成总写 `--icsv --ojson` 的习惯。

4. **`sort` / `stats1` / `tac` 需要全量缓冲**——mlr 多数 verb 是流式（一次过一条记录），但这几个排序/聚合/反转 verb 必须读完全文件才能输出。几 GB CSV 上这些 verb 内存会爆；要先 `head` 或拆文件。

5. **嵌套 JSON 默认被压平**——`{"user":{"id":1}}` 的 `user.id` 在 `--ijson` 下默认变成名为 `user.id` 的扁平字段。要保留嵌套结构得加 `--no-auto-flatten`，否则 `mlr --ijson --ojson cat` 会"破坏"原始 JSON 形状。

## 历史小故事（可跳过）

- **2015**：John Kerl 在金融数据处理中受够 awk 写不动 CSV，用 **C** 写出 mlr 第一版
- **2018 v5**：DSL 引入 then 链式 verb、map / array 类型；从"awk 替代"升级成"小型 ETL 语言"
- **2022-01 v6**：整库从 C **重写为 Go**，加入更好的 Windows 支持、JSON Lines / Markdown / PPRINT；此后只维护 Go 版
- **2023+**：进入维护期，按周发布 patch；社区贡献者活跃但核心仍是 Kerl 一个人
- **2024–2025**：Parquet / Arrow 实验性输入支持加入，但定位仍是"轻量结构化数据 CLI"，重 OLAP 场景明确推用户上 [[duckdb-2019]]

mlr 没有 [[ripgrep]] 那种"替换一类核心命令"的爆点，但在数据工程师 / SRE / 数据科学家圈子里口碑非常稳——9k+ star 大多来自"用过就回不去"的私下推荐。用户常先用 mlr 探索结构，再把结果固化成 jq / awk 脚本进 cron。

## 适用 vs 不适用场景

**适用**：

- 一次性数据探索——读 CSV、看分布、算统计、转 JSON 给前端
- CSV / TSV / JSON 之间互转——比写 Python 脚本快 10x
- 日志做按字段聚合分析——`stats1 -a count,mean -g status_code`
- 中等大小数据（几十 MB 到几 GB）——超过这个量上 [[duckdb-2019]] 或 pandas

**不适用**：

- 数据规模超过单机内存的 sort / stats——mlr 流式没问题但聚合 verb 会爆，上 DuckDB 或 Spark
- 复杂多表 join + 窗口函数——上 SQL（DuckDB / SQLite）
- 需要可视化 / 交互式探索——mlr 是 CLI，要图表去 pandas + Jupyter
- 不识 CSV / JSON 的二进制格式（Parquet 现在部分支持，但首选 DuckDB）

## 学到什么

1. **schema-aware 是关键差异**——不是"性能更快"也不是"功能更多"，而是"读 6 个月前自己写的命令仍能秒懂"。字段名比编号在协作和回溯上是质变
2. **格式正交比新增格式重要**——mlr 把"输入格式"和"输出格式"拆成两个独立标志，而不是为每对格式做一个命令；新增一个格式就能和所有现有格式互转
3. **流式 + 缓冲 verb 显式区分**——多数 verb 流式（O(1) 内存），需要全量的 sort/stats 单独标出；让用户知道"什么时候不能用大文件"
4. **Unix 哲学还活着**——50+ 单一职责 verb 用 `then` 拼，没有"魔法配置"——和 awk / grep / sed 的设计同根
5. **中间地带工具有市场**——awk 太底层、pandas 太重，mlr 在中间这一段有稳定刚需。设计上别试图覆盖两端，找到自己的甜点
6. **DSL 的"够小"是优点**——mlr 的 put/filter DSL 大概只有 awk 的 1/3 复杂度，但 90% 的数据探索任务用不到那 2/3。够用就停，是工具长期可维护的关键

## 延伸阅读

- 官方文档：[miller.readthedocs.io](https://miller.readthedocs.io/en/latest/)（cookbook 很厚，几乎每个常见任务都有 1-2 行示例）
- 作者 John Kerl 的演讲：[Miller: Awk for JSON](https://www.youtube.com/watch?v=DTsx1Kj0wT4)（30 分钟把设计动机和 verb 链讲一遍）
- 实战对比：搜 "miller vs jq vs awk" 有大量博客，挑一篇 2022+ 的看，verb 语法稳定后写的更准
- 50+ verb 的速查表：`mlr --help` 列出所有 verb，配 `mlr <verb> --help` 看具体用法；建议第一次用先把 cut / cat / sort / filter / put / stats1 / join / rename 这 8 个吃透

## 关联

- [[bat]] —— 同代终端工具家族（Rust / Go 写的"现代 cat / grep / find"）
- [[ripgrep]] —— grep 替代；mlr 是它的"结构化数据"近邻
- [[fd]] —— find 替代；和 mlr 经常出现在同一份 dotfiles
- [[fzf]] —— 模糊查找；`fzf --preview 'mlr --icsv --opprint cat {}'` 做 CSV 预览很顺手
- [[sd]] —— 直觉语法的 sed 替代；和 mlr 互补（sd 处理纯文本、mlr 处理结构化）
- [[duckdb-2019]] —— mlr 撞墙时的下一站：能在 CSV / Parquet 上直接跑 SQL
- [[jq]] —— JSON 专精的 mlr 邻居；mlr 的 JSON 处理简单场景够用，复杂深嵌套还是 jq
- [[eza]] —— 同样是"现代 ls"路线的 Rust 工具，和 mlr 一起构成数据探索工作流的"看目录 + 看内容"两步

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[jc]] —— jc — 把 100+ Unix 命令的输出一键 JSON 化
- [[jq]] —— jq — JSON 的 sed/awk

---
title: jq — JSON 的 sed/awk
来源: https://github.com/jqlang/jq
日期: 2026-05-30
分类: CLI
难度: 中级
---

## 是什么

jq 是 Stephen Dolan 在 2012 年用 C 写的**命令行 JSON 处理器**。日常类比：

- **awk**：1977 年的工具，把每行文本切成字段，过滤、计算、重输出——但只懂"行"和"字段"
- **jq**：把 JSON 当一等公民的 awk——它懂"对象"、"数组"、"嵌套"，并且自带一门小 DSL 让你像写 SQL `where + select` 那样写过滤条件

最小例子：

```bash
curl -s https://api.github.com/repos/jqlang/jq \
  | jq '.stargazers_count, .open_issues'
```

`.` 表示当前 JSON 节点，`|` 是把上一步的结果灌给下一步——和 shell 管道完全同形。一行就能从一个 GitHub API 响应里挑出星数和未关 issue 数。

## 为什么重要

jq 在 shell 工具链里**没有真正的替代品**，原因有几层：

- **GitHub / AWS CLI / kubectl / Stripe / Cloudflare 等大厂的官方文档默认你装了 jq**——他们的示例命令直接 `curl ... | jq '...'`，不解释 jq 是什么
- **DevOps / CI 脚本几乎离不开它**：从 GitHub Actions 的 matrix 生成，到 Terraform 输出处理，再到 Docker inspect 过滤，jq 都是默认拼图
- **DSL 表达力够强**：`select` / `map` / `group_by` / `reduce` 都在，复杂查询不需要写 Python 脚本
- **单二进制 + 14 年稳定** + man page 完整——31k+ stars 的真正护城河

如果说 [[ripgrep]] 把 grep 干掉了 50% 场景、[[fd]] 把 find 干掉了 70% 场景，那么 **jq 是从无到有造了一个新场景**——在 jq 之前，处理 shell 里的 JSON 要么写 Python，要么写一行长得变形的 sed 正则。

## 核心要点

jq 的心智模型可以拆成 **三层**：

1. **filter（过滤器）**：每个 jq 表达式都是一个"输入 JSON → 输出 JSON 流"的函数。`.foo` 是过滤器，`.[]` 是过滤器，`.foo | .bar` 也是过滤器（先 .foo 再 .bar）。

2. **流（stream）而非单值**：`.users[]` 不是返回数组，是把数组**展开成多个独立的 JSON 值**——后面的 `|` 会对每个值跑一次。这点和 SQL 的 `unnest` / Python 的 generator 同构。

3. **数据不可变**：`.a = 1` 不是赋值，是"返回一个把 a 改成 1 的新对象"。整套语义是函数式的，所以 `|=`（更新）和 `=`（赋值）是不同算子——这是新人最常混淆的地方。

三层叠加，让 jq 能在一行里写出"取数组中年龄 > 18 的人，按城市分组，输出每组人数"这种查询。

## 实践案例

### 案例 1：从 GitHub API 挑字段

```bash
gh api repos/jqlang/jq | jq '{name, stars: .stargazers_count, lang: .language}'
```

`{a, b: .c}` 是构造对象的简写——`a` 等价于 `a: .a`。这一句重塑了原 JSON 的字段结构，输出一个干净的小对象。

### 案例 2：和 [[ripgrep]] / [[fzf]] 联动

ripgrep 的 `--json` 输出是 ndjson（每行一个 JSON）：

```bash
rg --json "TODO" | jq -r 'select(.type=="match") | .data.path.text' | sort -u | fzf
```

链路是：rg 输出结构化匹配 → jq 挑出 type=match 的行并取文件路径 → 去重 → fzf 交互选一个。这是"shell pipeline 标配组合"的活样本。

### 案例 3：和 [[fd]] 配合批量改 JSON

```bash
# 预览：改 version 后打印到 stdout（不写盘）
fd -e json . config/ -x jq '.version = "2.0"' {}

# 就地写回：先写临时文件再 mv（fd 的 -x 不需要 find 那种 \;）
fd -e json . config/ -x sh -c 'jq ".version = \"2.0\"" "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ {}
```

fd 找出所有 .json，jq 改字段。注意：不要把多文件输出重定向到同一个 `/tmp/out.json`——那会糊成一份；要改原文件就按上面"临时文件 + mv"。
## 踩过的坑

1. **shell 引号**：表达式必须**单引号**包起来（`'.foo'`），用双引号会被 shell 把 `$` 和反引号展开。新人 80% 的"jq 报错"都是引号问题。

2. **`select` 不匹配返回 empty 不是 null**：`echo '[1,2,3]' | jq '.[] | select(. > 5)'` 没有输出，**不是** null。链式后整个值会"消失"——这是流语义的副作用。

3. **`=` vs `|=`**：`.a = 1` 把 a 设成常量 1；`.a |= . + 1` 把 a 更新为"原值 +1"。语法相近但语义差很多。

4. **数字精度**：1.7 之前所有数字按 IEEE 754 double 处理，超过 2^53 的整数会被截断（区块链 / 金融场景容易踩）。1.7 加了 `--decimal` 但默认不开。

5. **巨大文件 OOM**：默认把整个输入读进内存。处理几个 GB 的 JSON 要用 `--stream` 或 `inputs` + `--seq` 流式模式，写法变化大，新人常常先 OOM 再发现这个开关。

6. **gojq / jaq 不完全等价**：gojq（Go 重写）和 jaq（Rust 重写）速度更快但有少量语法差异和未实现的内置函数——脚本要跨工具跑要小心。

## 适用 vs 不适用场景

**适用**：
- shell 里所有"我有一段 JSON，想挑/重塑/聚合"的需求
- API 响应快速 inspect（curl / gh / aws cli + jq）
- CI/CD 配置文件批量改写
- 日志 ndjson 聚合统计
- kubectl / docker inspect 输出过滤

**不适用**：
- 业务逻辑复杂、需要单元测试 → 用 Python / Node 写脚本
- 数据量超内存（默认非流式） → 用 `--stream` 或换 [[miller]]（懂 ndjson 也懂 CSV）
- 需要 schema 校验 → 用 jsonschema / ajv
- YAML/TOML/XML 输入 → 用 yq / dasel（jq 只吃 JSON）

## 历史小故事（可跳过）

- **2012**：Stephen Dolan 在都柏林发布 jq 1.0，灵感来自 XQuery + 函数式语言。原始博客标题 "jq is sed for JSON" 直接定义了它的市场定位。
- **2014**：1.4 加 try/catch、自定义函数、模块系统——社区从此爆发。
- **2018**：1.6 发布后进入**长期 stagnation**，Dolan 几年不响应 issue，社区一度担心项目死掉。
- **2022 末**：仓库从 `stedolan/jq` 迁到 `jqlang/jq` 组织，新维护者团队接管。
- **2023-09**：1.7 时隔 5 年发布——加 `--decimal`、SQL-style operators、OAuth 工具函数。同年 12 月 1.7.1 修补。
- **2024-2026**：gojq / jaq 等重写版本繁荣，但官方 jq 仍是事实标准。

## 学到什么

1. **造一个新场景比抢老场景更难也更值钱**——ripgrep 是把 grep 做更好，jq 是从无到有。后者的护城河更深，因为没有"老用户惯性"可以攻击它。

2. **DSL 是 CLI 工具的天花板**——awk / sed / jq 之所以经久不衰，是因为它们都有自己的 mini-language。没有 DSL 的工具天花板很低。

3. **流语义统一管道和数据**——jq 的 `.[]` 把数组展开成流，让 JSON 处理和 shell `|` 同构。这是它"在 shell 里感觉很自然"的根本原因。

4. **维护者更替也是开源项目的常态**——jq 经历了 5 年停滞 + 组织迁移 + 复活，没有死掉。这种"项目不属于个人"的治理是 31k stars 项目的标配。

## 延伸阅读

- 入门：[jq 官方 manual](https://jqlang.github.io/jq/manual/)（结构清晰，新手 1 小时看完即可上手）
- 在线 playground：[jqplay.org](https://jqplay.org/)（粘 JSON + 输入 filter，实时看输出）
- 进阶：[jq Cookbook](https://github.com/stedolan/jq/wiki/Cookbook)（社区维护的实用 pattern 合集）
- 设计：[Stephen Dolan 的原始博客](https://stedolan.github.io/jq/)（jq is sed for JSON）

## 关联

- [[ripgrep]] —— 同属"shell 工具链现代化"，rg 输出 `--json` 后常配 jq 解析
- [[fd]] —— `fd -e json -x jq` 是批量改 JSON 的标准组合
- [[fzf]] —— jq 输出灌进 fzf 做交互选择是 DevOps 常见 pattern
- [[miller]] —— 表格 + ndjson 处理，jq 不擅长 CSV 时的搭档
- [[claude-code]] —— Claude Code 的 bash 工具调用经常依赖 jq 解析 API 响应

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[curlie]] —— curlie — curl 的能力 + HTTPie 的语法
- [[dasel]] —— dasel — 一把刀同时切 JSON / YAML / TOML / XML / CSV
- [[fx]] —— fx — JSON 的交互式查看器（jq 的 TUI 表亲）
- [[fzf]] —— fzf — 命令行模糊查找
- [[gron]] —— gron — 把 JSON 拍平成 grep 能吃的赋值行
- [[httpie]] —— HTTPie — curl 的人话版本
- [[jc]] —— jc — 把 100+ Unix 命令的输出一键 JSON 化
- [[miller]] —— Miller (mlr) — 懂 CSV/JSON 表头的 awk
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[xh]] —— xh — HTTPie 的 Rust 重写版
- [[yq]] —— yq — YAML 的 jq（也吃 XML/TOML/properties）


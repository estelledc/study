---
title: dasel — 一把刀同时切 JSON / YAML / TOML / XML / CSV
来源: https://github.com/TomWright/dasel
日期: 2026-05-30
分类: CLI
难度: 入门
---

## 是什么

dasel（**da**ta **sel**ector）是一个 **Go 写的命令行工具**，用**同一套选择器语法**查询、修改、转换 5 种数据格式：JSON / YAML / TOML / XML / CSV。

日常类比：以前你家厨房有 5 把刀——切肉的（jq 切 JSON）、切菜的（yq 切 YAML）、削皮的、剪刀、剥蒜器，每把只对一种食材。dasel 是一把瑞士军刀——一把搞定 5 种。

```bash
# 同一个选择器，吃任何格式
dasel -f config.json   '.server.port'    # JSON
dasel -f config.yaml   '.server.port'    # YAML
dasel -f config.toml   '.server.port'    # TOML
```

7k stars，单一静态二进制（Go 编译，无运行时依赖），由 Tom Wright 2020 年开源。

## 为什么重要

不理解 dasel，下面这些场景你只能用 5 个工具拼：

- CI 流水线要改 helm `values.yaml` 一个字段——以前要装 yq；想再读个 JSON 配置——还得装 jq
- 把 `docker-compose.yaml` 里的 image 列表抽出来转成 JSON 喂给下游 webhook——`yq -o=json` 又是另一套语法
- 工程师在 macOS / Linux / Windows 上各装各的 yq（mikefarah 的 v4 vs python yq vs go yq），版本对不上脚本就炸
- 写脚本要支持"用户传什么格式都能吃"——jq 只吃 JSON，吃别的得先转

dasel 的卖点是 **"一套语法 + 一个二进制"**，覆盖 90% 日常 DevOps 场景。

## 核心要点

dasel 的设计可以拆成 **三块**：

1. **统一中间表示**：读入任何格式 → 转成内部 `dencoding.Map` / `[]any` 树 → 选择器在这棵树上走 → 输出时再编码成目标格式。所以 `-r yaml -w json` 一行就完成转换。

2. **选择器语法**：借鉴 jq 但更短。
   - `.users.[0].name` —— 第一个用户的 name（jq 写 `.users[0].name`，dasel 多一个点）
   - `.users.[*].name` —— 所有用户的 name
   - `.users.(name=alice)` —— filter 出 name 是 alice 的用户

3. **三种动作**：`select`（默认，读）/ `put`（写一个值）/ `delete`（删一个键）。put 还能改类型：`dasel put string -f f.yaml '.port' 8080`。

## 实践案例

### 案例 1：跨格式查询

```bash
# 都能用同一个选择器
echo '{"name":"alice"}'      | dasel -r json '.name'
echo 'name: alice'           | dasel -r yaml '.name'
echo 'name = "alice"'        | dasel -r toml '.name'
```

输出一致：`alice`。

### 案例 2：CI 改 helm values

```bash
# 把 image tag 改成本次构建的 SHA
dasel put string \
  -f charts/web/values.yaml \
  '.image.tag' "$GIT_SHA"
```

原地写回，YAML 缩进 / 注释（部分）保留。jq 做不到——jq 只能 JSON 进 JSON 出。

### 案例 3：YAML → JSON 转换

```bash
# 一行：docker-compose.yaml → JSON
dasel -r yaml -w json < docker-compose.yaml > out.json

# 也可以只转一个子树
dasel -r yaml -w json -f docker-compose.yaml '.services.web'
```

这个动作以前是 `yq -o=json '.' file.yaml`，现在 dasel 一把搞定。

## 与 jq / yq / gron / fx 的关系

| 工具 | 主战场 | 语法风格 | 互补点 |
|------|--------|----------|--------|
| **dasel** | 5 种格式统一查改 | 短选择器，类 jq | 跨格式 + 单二进制 |
| **jq** | JSON 重度查询 | 完整 DSL，能管道 / reduce / paths | 复杂逻辑用它 |
| **yq** | YAML 为主，也吃 XML | 接近 jq | 大型 YAML 操作更顺手 |
| **gron** | JSON 转赋值行 | 不是查询，是拍平 | 用 grep 找路径 |
| **fx** | JSON 交互式查看 | TUI，鼠标 / 键盘浏览 | 探索陌生 JSON 用它 |

**判断流**：

- 只有 JSON 且要写复杂逻辑 → [[jq]]
- 只有 YAML 且要写复杂逻辑 → [[yq]]
- 多格式 + 简单查改 → **dasel**
- 不知道 JSON 长什么样想点开看 → [[fx]]
- 想用 grep 在 JSON 里找东西 → [[gron]]

## 踩过的坑

1. **选择器索引多一个点**：jq 写 `.users[0]`，dasel 写 `.users.[0]`。从 jq 迁过来最常见的语法错误就是漏这个点。

2. **put 不会创建中间路径的某些类型**：`dasel put string -f f.json '.a.b.c' 1` 如果 `.a` 不存在，会报错。需要先建结构或 put object。

3. **XML 属性前缀**：XML 有 attribute（`<tag attr="x"/>`）和 element（`<tag>x</tag>`）两种写法，dasel 用 `-attr` 区分：`.tag.-name`。从 jq 习惯过来要重学。

4. **CSV 默认假设第一行表头**：如果你的 CSV 没表头，要 `--csv-no-header`，否则第一行数据被吃掉当 schema。

5. **v1 → v2 不完全兼容**：2022 年 v2 重写选择器引擎，老脚本升级前一定测试。

## 适用 vs 不适用场景

**适用**：

- DevOps / CI 改 YAML / TOML / JSON 配置一两个字段
- 跨格式互转（YAML ↔ JSON ↔ TOML）
- 单二进制环境（Docker 镜像、CI runner）省装 jq + yq 两份
- 团队里 macOS / Linux / Windows 都有，要语法统一

**不适用**：

- 重度 JSON 查询、需要 `reduce` / `paths` / 自定义函数 → 还是 [[jq]]
- 想交互式浏览 → [[fx]]
- 想用 grep 找路径 → [[gron]]
- 需要严格的 YAML 注释保留（dasel 部分保留，不是 100%）→ 用 yq v4

## 历史小故事（可跳过）

- **2020 年**：Tom Wright（英国独立开发者）受够了"jq 装一份、yq 装一份、TOML 没人管"，开源 dasel
- **2021 年**：突破 1k stars，进入 awesome-go / awesome-cli 等列表
- **2022 年**：v2 重写选择器引擎，加入 `filter` / `mapOf` / `typeOf` 等函数；选择器语法升级
- **2024 年**：7k stars，仍由作者一人主力维护，社区贡献者 80+

## 学到什么

1. **统一中间表示是工具普适性的核心**——dasel 的本质是 "5 个解码器 + 1 个选择器引擎 + 5 个编码器"，不是 5 套独立工具拼装
2. **DSL 借鉴优于发明**——dasel 选择器抄 jq，迁移成本低，社区文档可复用
3. **单二进制 vs 包管理器**——Go 静态编译让"装一个工具"等于"复制一个文件"，对 CI 镜像极友好
4. **覆盖 90% 不等于覆盖 100%**——dasel 不追求替代 jq 的完整 DSL，只覆盖最常用场景，留出口子让重度用户回到 jq

## 延伸阅读

- 官方文档：[daseldocs.tomwright.me](https://daseldocs.tomwright.me/)（选择器语法 + 函数库）
- 仓库 README：[TomWright/dasel](https://github.com/TomWright/dasel)（含完整对比表）
- [[jq]] —— JSON 的 sed/awk，dasel 选择器语法的祖师
- [[yq]] —— YAML 版的 jq，dasel 的直接对手
- [[gron]] —— 把 JSON 拍平成 grep 能吃的赋值行
- [[fx]] —— JSON 的交互式 TUI 查看器

## 关联

- [[jq]] —— 提供选择器 DSL 设计参考；dasel 是 "jq 跨格式版"
- [[yq]] —— 在 YAML 战场最直接的对手；语法更接近 jq，但 dasel 更轻
- [[gron]] —— 互补工具：dasel 做语义查询，gron 做 grep 友好的拍平
- [[fx]] —— 互补工具：dasel 是脚本工具，fx 是交互式查看器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[curlie]] —— curlie — curl 的能力 + HTTPie 的语法
- [[httpie]] —— HTTPie — curl 的人话版本
- [[jc]] —— jc — 把 100+ Unix 命令的输出一键 JSON 化
- [[xh]] —— xh — HTTPie 的 Rust 重写版

---
title: Task — 用 YAML 写一份跨平台的 ‘项目命令清单’
来源: https://github.com/go-task/task
日期: 2026-05-31
分类: 命令行工具
难度: 入门
---

## 是什么

Task（仓库名 `go-task/task`）是一个**用 YAML 写项目命令的小工具**——把日常要敲的 `pytest`、`docker compose up`、`go build ./...` 写到一个 `Taskfile.yml` 里，以后只要 `task test` / `task dev` / `task build` 就能跑。日常类比：餐馆后厨墙上贴的 ‘出餐单’，每道菜的步骤、需要哪几样食材都写清楚；Task 就是把这张单变成一个会照单做菜的小机器人。

最小 `Taskfile.yml`：

```yaml
version: '3'

tasks:
  test:
    cmds:
      - go test ./...

  build:
    cmds:
      - go build -o bin/app ./cmd/app
```

命令行：

```bash
task test       # 等价于 go test ./...
task build      # 等价于 go build ...
task --list     # 列出全部 task
```

截至 2026-07，Go 写、单二进制、约 15.8k stars，brew/scoop/snap/go install 都能装。官网 [taskfile.dev](https://taskfile.dev)。

## 为什么重要

不理解 Task 的设计选择，下面这些事都没法解释：

- 为什么有了 make / just，还要再造一个跑命令的工具
- 为什么它**特意做增量构建**（sources/generates），是 just 砍掉的那一半重新长回来
- 为什么 Windows 团队特别爱用——它不依赖 bash，Go 自带跨平台 shell
- 为什么 YAML 这种 ‘被骂烂了’ 的格式反而是它的卖点

## 核心要点

Task 的设计可以拆成 **三个判断**：

1. **YAML 不是 bug，是 feature**：YAML 工具链成熟（编辑器补全 / schema 校验 / CI 已经会读），新人看一眼就懂层级。代价是缩进敏感，但 IDE 都能高亮——比 Makefile 的 tab vs 空格友好得多。

2. **重新加回增量构建**：`sources` 列源文件，`generates` 列产物，Task 算 mtime/checksum，没变就跳过。这是 just 故意砍掉的功能，Task 把它做回来——因为它瞄的是 Go / 通用项目，不只是 ‘命令编排’。

3. **不依赖系统 bash**：内嵌 [mvdan/sh](https://github.com/mvdan/sh)（Go 写的 POSIX shell），Windows 上也能跑管道、`&&`、变量展开。但 **shell ≠ coreutils**：早期 `cp`/`rm` 仍要 PATH 里有实现；**2025** 起 Task 才内置 Go 版 core utils（`TASK_CORE_UTILS`，Windows 默认开）。

## 实践案例

### 案例 1：基础 task + 变量 + 依赖

```yaml
version: '3'

vars:
  BIN: bin/app

tasks:
  build:
    cmds:
      - go build -o {{.BIN}} ./cmd/app

  test:
    deps: [build]
    cmds:
      - go test ./...

  run:
    deps: [build]
    cmds:
      - ./{{.BIN}}
```

`task run` 会先跑 `build`（被 `deps` 拉起来），然后才跑 `./bin/app`。`{{.BIN}}` 是 Go template 语法（标准库 `text/template`），所有变量都用这套插值。

### 案例 2：增量构建（sources / generates）

```yaml
tasks:
  css:
    sources:
      - styles/**/*.scss
    generates:
      - public/style.css
    cmds:
      - sass styles/main.scss public/style.css
```

跑 `task css`：
- 第一次：编译 SCSS → CSS
- 第二次（没改 SCSS）：**跳过**，输出 ‘task: Task "css" is up to date’
- 改了某个 .scss：重新编译

判定方式默认是 `timestamp`（mtime 比对），可改成 `checksum`（算 SHA256）。这是 Task 比 just 多的核心能力。

### 案例 3：包含子 Taskfile（monorepo 友好）

```yaml
version: '3'

includes:
  api: ./services/api/Taskfile.yml
  web: ./services/web/Taskfile.yml

tasks:
  dev:
    deps: [api:start, web:start]
```

`task dev` 同时启动 api 和 web 两个子项目的 `start`。`task api:test` 只跑 api 那个 Taskfile 里的 test。这种命名空间天然适合 monorepo。

## 踩过的坑

1. **YAML 的字符串地狱**：`cmds` 里写带冒号 / 引号 / 反斜杠的命令容易翻车。例：`echo "a:b"` 必须 `'echo "a:b"'` 整体单引号包起来，否则 YAML 把它当 map 解析。

2. **`deps` 是并行跑的**：`deps: [a, b, c]` 会同时跑 a/b/c，不是顺序。要顺序得用 `cmds` 里 `- task: a` / `- task: b`。这个差异第一次踩必中。

3. **mtime 增量在 Docker 里失灵**：容器里文件 mtime 可能被 COPY 重置，导致 Task 误判 ‘源没变’ 跳过编译。解决：CI 里强制 `--force` 或切到 `method: checksum`。

4. **`set -e` 行为不直观**：单条 `cmds:` 里的多行 shell 默认每行独立——前一行失败不会阻断下一行（除非显式 `&&`）。要全条失败立刻停得在顶层加 `set: [errexit]`。

5. **只有 shell、没有 `cp`**：旧版 Windows / 关掉 `TASK_CORE_UTILS` 时，`cp -r`、`rm -rf` 会直接找不到命令。别把「能跑 sh 语法」当成「Unix 工具都在」。

## 适用 vs 不适用场景

**适用**：

- Go 项目（社区主流选择，作者就是 Go 圈）
- 需要增量构建但又不想上 bazel / make 的中型项目
- Windows + macOS + Linux 混合团队（无 shell 依赖）
- monorepo 多子项目命令编排（includes 友好）

**不适用**：

- 极简单只跑两三条命令 → npm scripts / shell 别名够了
- 需要复杂 DAG 调度、缓存远端化 → turborepo / nx / bazel
- 已经全员熟练 make 且没跨平台需求 → 没必要换
- 不会写 YAML / 讨厌 YAML → just（自定义 DSL）/ mage（Go 代码）

## 对比表

| 工具 | 配置语言 | 增量构建 | 跨平台 shell | 单二进制 | 学习成本 |
|------|---------|---------|------------|---------|---------|
| make | Makefile DSL | 有 | 差（需 sh） | 否 | 高 |
| just | 自定义 DSL | 无 | 好（用系统 shell） | 是 | 低 |
| **task** | **YAML** | **有（sources/generates）** | **好（内嵌 sh）** | **是** | **中** |
| mage | Go 代码 | 自己写 | 好 | 编译产物 | 中（要会 Go） |
| npm scripts | package.json | 无 | 好 | N/A | 低 |

## 历史小故事（可跳过）

- **2017**：Andrey Nering（@andreynering）开第一个 commit。动机：Windows 上跑 Makefile 太痛，又不想强迫团队装 WSL
- **早期**：很快改用内嵌 mvdan/sh，统一 POSIX 语法；但 Windows 上 `cp`/`rm` 仍常缺
- **2018**：v2 引入 `sources`/`generates` 增量
- **2020**：v3 重写解析器，YAML schema 稳定，进入 brew 主仓库
- **2025**：内置 Go 版 core utils（`TASK_CORE_UTILS`），Windows 文件命令才真正「开箱能用」
- **2026**：约 15.8k stars，go-task 组织维护；Hugo 等项目常用作任务入口

## 学到什么

1. **复活 ‘被砍掉的功能’ 也是设计**：just 砍增量构建换简单，Task 把它加回来换实用。同一个领域两种判断，受众不同
2. **跨平台不是口号，是分层实现**：mvdan/sh 解决语法；2025 core utils 才补齐 Windows 上的 `cp`/`rm`。少一层就会在生产翻车
3. **YAML 选型理由要讲清**：『工具链成熟、IDE 友好、CI 已经会读』是真理由，不是『大家都用所以用』
4. **命名空间 + includes** 是 monorepo 工具的隐形分水岭——能不能干净地拆子项目，直接决定能不能在大仓里活

## 延伸阅读

- 官方文档：[taskfile.dev](https://taskfile.dev/)（含完整 schema 和迁移指南）
- GitHub：[go-task/task](https://github.com/go-task/task)
- 内嵌 shell：[mvdan/sh](https://github.com/mvdan/sh) — Go 写的 POSIX shell，Task 跨平台的核心
- [[just]] —— 同领域另一种判断（砍掉增量、自定义 DSL）
- [[turborepo]] —— monorepo 调度，比 Task 多了远端缓存和并行调度

## 关联

- [[just]] —— 直接对比对象，YAML vs 自定义 DSL，有增量 vs 无增量
- [[turborepo]] —— 上一层（带缓存的调度），Task 是它下面 ‘单项目命令入口’ 的位置
- [[biome]] —— 同样 ‘单二进制替代老工具’ 的思路，但走 Rust 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

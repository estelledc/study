---
title: just — 把 make 拆成两半，只留 ‘命令编排’ 那一半
来源: https://github.com/casey/just
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

just 是一个**专门跑项目命令的小工具**——你把日常要敲的长命令（`pytest -v --cov`、`docker compose up`、`pnpm build && pnpm preview`）写到一个叫 `justfile` 的文件里，以后只要 `just test` / `just dev` / `just deploy` 就能跑。日常类比：家里冰箱贴一张便签 ‘晚饭菜单’，写好每道菜怎么做；just 就是把这张便签变成一个会自己执行的小机器人。

你写 `justfile`：

```just
# 跑测试
test:
    pytest -v --cov

# 起开发服
dev:
    pnpm dev
```

然后命令行：

```bash
just test     # 等价于 pytest -v --cov
just dev      # 等价于 pnpm dev
just --list   # 列出全部 recipe（食谱）
```

截至 2026-05，作者 Casey Rodarmor，Rust 写，24k stars，brew/cargo/apt/scoop 都能装。

## 为什么重要

不理解 just 的设计选择，下面这些事都没法解释：

- 为什么 `make` 已经存在 50 年（1976），还能被一个新工具撬动一块地盘
- 为什么 just 故意**不做增量构建**——这不是功能缺失，是判断
- 为什么团队 README 里那一长串 ‘项目怎么跑’ 文档，可以直接被一份 `justfile` 替代
- 为什么 monorepo / 多语言项目特别爱用它，单一 Node 项目反而不太需要

## 核心要点

just 的设计可以拆成 **三个判断**：

1. **不是构建系统**：make 既做 ‘命令编排’（跑哪些命令）又做 ‘增量构建’（哪些文件变了才跑）。just 砍掉后者，只留前者。代价是不能替你做 C/C++ 这种 ‘源文件变了才编译’ 的活；好处是语法和心智模型都简单一半。

2. **类 Makefile 语法但修掉痛点**：保留 ‘target: 命令’ 的形状（这种结构看一眼就懂），但修掉 make 三大坑——
   - tab vs 空格的诡异区分（just 接受任一缩进）
   - 隐式规则（`%.o: %.c`）这种新人完全看不懂的魔法（just 没有）
   - shell 语法在 make 里被双重转义（just 干净传给 shell）

3. **每个 recipe 可换解释器**：第一行可以写 `#!/usr/bin/env python`，整个 recipe 由 Python 跑；下一个 recipe 又可以是 bash / node / ruby。一份 `justfile` 里混多种脚本语言完全合法。

## 实践案例

### 案例 1：基础 recipe + 参数

```just
# 默认 recipe（就 just 一下，不带参数时跑这个）
default:
    @just --list

# 带参数的 recipe
deploy env="staging":
    echo "deploying to {{env}}"
    ./scripts/deploy.sh {{env}}
```

命令行：

```bash
just              # 跑 default → 列出全部
just deploy       # env 用默认值 staging
just deploy prod  # env=prod
```

`{{env}}` 是 just 的模板插值语法——和 mustache / handlebars 一致，新人 0 学习成本。

### 案例 2：recipe 之间依赖

```just
build:
    cargo build --release

test: build
    cargo test

ship: test
    ./scripts/upload.sh
```

`just ship` 会自动先跑 `build` → `test` → `ship`。但**注意**：每次都重跑 `build`，不管 `Cargo.toml` 变没变。这就是 just 不做增量构建的代价——简单换 always-fresh。

### 案例 3：跨语言混搭

```just
#!/usr/bin/env bash
backup-bash:
    tar czf backup.tgz ./data

#!/usr/bin/env python3
analyze-py:
    import json, statistics
    data = json.load(open('metrics.json'))
    print(statistics.mean(data['latencies']))
```

第一个 recipe 用 bash，第二个直接写 Python。一个项目里数据科学家、后端、运维各写各的语言，统一用 `just <recipe>` 调度。

## 踩过的坑

1. **不要用它替代 make 跑 C/C++ 编译**：just 每次都全跑，没增量。100 个 .c 文件每次重新编一遍会被打死。这种场景留给 make / cmake / bazel。

2. **`{{var}}` 和 shell 的 `${var}` 不一样**：`{{var}}` 是 just 在执行**前**插值（像模板渲染），`${var}` 是 shell 运行时变量。混用会绕晕——记住 `{{}}` 是 just 的，`$$` 是 shell 的。

3. **Windows 上的 shell 默认是 sh**：意味着如果你机器没装 git-bash / WSL，recipe 里的 `cp -r` 之类会跑不动。解决：`justfile` 顶部写 `set windows-shell := ["powershell.exe", "-c"]` 切到 PowerShell。

4. **没有缓存机制**：意味着 `just test` 跑 5 分钟，每次都跑 5 分钟，不会因为 ‘代码没变’ 而快进。要快进得在 recipe 里自己加判断（或上 turbo / nx 这类带缓存的工具）。

## 适用 vs 不适用场景

**适用**：

- monorepo / 多语言项目（Python + Rust + Node 混在一起）
- 需要把团队 README 里 ‘跑这个先跑那个再跑这个’ 流程固化下来
- 跨平台需求（macOS + Linux + Windows 团队成员一起用）
- 替代散落的 `scripts/` 文件夹里十几个 `*.sh`

**不适用**：

- 需要增量构建（C/C++ / 大型 monorepo 编译）→ make / bazel / turbo
- 单纯 Node.js 项目且全队都装了 npm → npm scripts 够用
- 需要复杂 DAG 调度 / 并行任务编排 → task / mage / Earthly
- 需要 ‘源文件 → 输出文件’ 的依赖追踪 → make / ninja

## 对比表

| 工具 | 增量构建 | 跨平台 | 跨语言 | 单文件二进制 | 学习成本 |
|------|---------|--------|--------|------------|----------|
| make | 有 | 差 | 是 | 否 | 高 |
| just | 无 | 好 | 是 | 是 | 低 |
| task (Go) | 有限 | 好 | 是 | 是 | 中（YAML） |
| npm scripts | 无 | 好 | 否（锁 Node） | N/A | 低 |
| bazel | 强 | 好 | 是 | 否 | 极高 |

## 历史小故事（可跳过）

- **2016**：Casey Rodarmor 在 GitHub 开第一个 commit，最早只是 ‘自己受不了 make 的语法’ 的周末项目
- **2018**：1.0 发布，进入各包管理器
- **2022**：被 Casey 同时维护的另一个项目 ord（Bitcoin 序数协议）带火——ord 用 just 编排，更多 Rust 圈用户接触到
- **2026**：24k stars，已成 Rust 项目和 monorepo 默认 ‘命令入口’ 之一

## 学到什么

1. **拆问题比解问题更重要**：make 把构建 + 编排塞一起，just 把它劈开只取一半，结果更简单也更通用
2. **‘故意不做’ 是设计**：不做增量构建不是缺失，是判断——加上会让工具复杂 5 倍但只惠及一小部分人
3. **修小痛点也能撬动老巨头**：tab vs space、隐式规则、shell 转义——make 用户忍了 50 年的小毛病，全部修掉就是产品
4. **单二进制 + Rust** 是新一代命令行工具的标配：分发简单、跨平台、没运行时依赖

## 延伸阅读

- 官方文档：[just.systems](https://just.systems/man/en/)（手册式，30 分钟读完）
- GitHub：[casey/just](https://github.com/casey/just)
- 对比文章：[Why I prefer just over make](https://news.ycombinator.com/item?id=32957938)（HN 讨论串）
- [[makerdao]] —— 名字有 make 但和构建系统无关，DeFi 协议
- [[biome]] —— 同样 ‘Rust 重写、单二进制’ 的工具链思路
- [[nix]] —— 另一种 ‘命令编排 + 可重复’ 的极端方案

## 关联

- [[biome]] —— 都属于 ‘Rust 单二进制 + 替代老工具’ 这一波
- [[nix]] —— Nix 把可重复性做到极致，just 只做命令编排，互补
- [[turborepo]] —— monorepo 调度，比 just 多了缓存和并行
- [[make]] —— just 直接致敬和取代的对象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[mage]] —— Mage — 用 Go 写 build 脚本，告别 Makefile
- [[makerdao]] —— MakerDAO — 用抵押 ETH 铸出锚定美元的 DAI
- [[nix]] —— Nix — 函数式声明式包管理与可重复构建
- [[task]] —— Task — 用 YAML 写一份跨平台的 ‘项目命令清单’
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"


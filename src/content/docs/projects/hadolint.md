---
title: hadolint — 给 Dockerfile 做体检的小工具
来源: https://github.com/hadolint/hadolint
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

hadolint 是一个**专门读你的 Dockerfile，告诉你哪里写得不规范**的命令行工具。日常类比：像写完作文交给老师，老师把红笔圈出来——这里少了句号、那里错别字、这段太啰嗦。

举个最简单的用法：

```bash
hadolint Dockerfile
```

它会输出类似：

```
Dockerfile:5 DL3008 warning: Pin versions in apt-get install
Dockerfile:7 DL4006 warning: Set the SHELL option -o pipefail before RUN
```

每一条都告诉你**第几行、什么规则、严重等级**。你拿这个去改，改完再跑一遍直到没警告。

## 为什么重要

Dockerfile 是构建容器镜像的"配方"，写得不好会出三类问题：

- **构建失败的不稳定性**：`apt-get install curl` 不锁版本，今天装的是 7.81，下个月重建变成 8.0，你的程序行为可能就变了
- **镜像变胖、变慢**：每写一个 `RUN` 就多一层，10 个 RUN 就 10 层，镜像 push/pull 都更慢
- **运行时坑**：忘了 `-o pipefail`，shell 命令里 `curl x | tar y` 中 curl 失败但 tar 成功，构建照常通过，部署上去才发现问题

hadolint 把这些"老司机才知道的坑"编码成 100+ 条规则，新手装一下就能避掉大半。

## 核心要点

**1. 两套规则系统**

- `DL` 前缀：hadolint 自己的 Dockerfile 规则（DL3008、DL3018、DL4006...）
- `SC` 前缀：内嵌 ShellCheck 的 bash 规则——因为 `RUN` 后面写的是 shell 脚本，hadolint 直接把那段交给 ShellCheck 再查一遍

**2. 三步工作流程**

1. 读 Dockerfile → 解析成抽象语法树（AST，类比拆成"第 N 行是什么类型的指令"的列表）
2. 遍历 AST，每条规则像一个检查员盯着自己关心的指令类型
3. 输出违规清单（行号 + 规则号 + 严重等级 + 描述）

**3. 用 Haskell 写**

为什么是 Haskell？两个原因：

- Haskell 的代数数据类型（ADT）天然适合表达"指令有 FROM / RUN / COPY ... 这十几种"
- 它复用了一个叫 `language-docker` 的 Haskell 包，那个包专门做 Dockerfile 解析

新手不必学 Haskell 才能用 hadolint——它发布**单文件可执行**（连 musl 静态链接都做好），下载就跑。

## 实践案例

### 案例 1：DL3008 锁版本

不规范写法：

```dockerfile
RUN apt-get update && apt-get install -y curl
```

hadolint 抱怨：`DL3008 Pin versions in apt-get install`。

规范写法：

```dockerfile
RUN apt-get update && apt-get install -y curl=7.81.0-1ubuntu1.15
```

锁版本好处：明年重建镜像，结果**完全一样**。坏处：版本被下架时构建会挂——所以工程上常配合"定期升级 + lockfile 提交到仓库"的节奏。

### 案例 2：DL4006 pipefail 救命

```dockerfile
RUN curl -L https://example.com/x.tar.gz | tar xz
```

如果 curl 失败（404），管道左边是错的，但 `tar` 收到空输入也会"成功退出"——构建通过，镜像里没东西，部署上去才崩。

hadolint 提示 `DL4006`。修复：

```dockerfile
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN curl -L https://example.com/x.tar.gz | tar xz
```

### 案例 3：CI 集成

GitHub Actions 里加一步：

```yaml
- uses: hadolint/hadolint-action@v3.1.0
  with:
    dockerfile: Dockerfile
```

PR 里只要 Dockerfile 改了，自动跑一遍，不规范直接 fail PR。

## 踩过的坑

1. **规则太严，全开会被淹没**：默认 100+ 条规则，老项目一开全报红。实战做法：建 `.hadolint.yaml`，先 ignore 一批，逐步降低 noise

2. **DL3008 锁版本和"自动升级"冲突**：锁了版本之后 Renovate / Dependabot 就管不了，需要单独写一个升级机器人盯 Dockerfile（很多团队最后选择**只锁基础镜像 tag，不锁 apt 版本**）

3. **`# hadolint ignore=DL3008` 行内豁免**：能在某一行临时关规则，但写多了等于没规则——只在"已知技术债 + 写明原因"时用

4. **shell 不是 bash 时漏检**：默认按 POSIX sh 检查，写了 bash-only 语法（如 `[[ ]]`）会被误报；用 `# hadolint shell=bash` 注释告诉它

## 适用 vs 不适用场景

**适用**：
- 任何用 Docker 构建镜像的项目（个人 / 团队 / 开源都值得加）
- CI 流水线门禁——比代码 review 时人肉抓更省心
- 团队约定 Dockerfile 风格的"自动执行版"——靠 lint 而不是 wiki 文档

**不适用**：
- Windows 容器 / PowerShell 镜像——支持有限，规则覆盖窄
- 镜像安全扫描（CVE / 漏洞）——那是 trivy / grype 的活，hadolint 只看"写法"
- 镜像体积优化建议——只检查指令规范，不分析最终镜像大小（那是 dive / docker-slim）

## 学到什么

1. **lint 工具的本质就三步**：解析成 AST → 遍历检查 → 输出报告。所有 lint（eslint / clippy / hadolint）都是这个套路
2. **复用比自造强**：hadolint 没自己写 bash 解析器，直接调 ShellCheck——把"我懂 Dockerfile"和"我懂 bash"两件事拆开各做各的
3. **规则编号是契约**：`DL3008` 这种代码不光是给人看，还是配置文件、行内豁免、CI 报错时的稳定 ID。改名等于破坏向后兼容
4. **lint 必须能定制**：默认严格能把人逼疯，所以 `.hadolint.yaml` 让你 ignore / 降级——工具想被用，必须给一个"逐步治理"的滑梯
5. **小工具也能赢**：核心代码不到 5000 行 Haskell，没炫技、没大架构，就是"读 Dockerfile 报错"这一件事做到位，照样长到 12k 星——专一比全能更稀缺

## 延伸阅读

- 在线试一下：[hadolint.github.io](https://hadolint.github.io/hadolint/)（粘贴 Dockerfile 立刻看检查结果）
- 完整规则列表：[Rules wiki](https://github.com/hadolint/hadolint/wiki)
- 配套：ShellCheck 项目本体 [shellcheck.net](https://www.shellcheck.net/)
- [[shellcheck]] —— hadolint 内嵌的 bash linter
- [[docker-engine]] —— Dockerfile 是给它读的

## 关联

- [[shellcheck]] —— hadolint 复用它检查 RUN 里的 bash
- [[dockerfile-best-practices]] —— hadolint 规则的来源就是这份官方最佳实践
- [[trivy]] —— 互补：hadolint 看写法，trivy 看安全漏洞
- [[pre-commit]] —— 常见集成方式，把 hadolint 挂到 git commit 钩子

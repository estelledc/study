---
title: zizmor — GitHub Actions 工作流静态安全分析
来源: https://github.com/zizmorcore/zizmor
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

## 是什么

**zizmor**（读作 /ˈzɪzmɔːr/，名字来自 Yiddish「干净」）是 William Woodruff 等人用 **Rust** 写的 **GitHub Actions 专用静态分析器（SAST）**。它不执行 workflow，也不连上你的 runner，只读 `.github/workflows/*.yml`、composite/Docker `action.yml`、以及可选的 `dependabot.yml`，在本地或 CI 里扫描已知漏洞模式。

日常类比：

- **装修图纸审查员**：GitHub Actions workflow 像一份「自动装修图纸」——写清楚什么时候开工、用什么工具、谁能拿钥匙。zizmor 不会真的去你家装修，而是对着图纸问：「这把万能钥匙是不是人人能拿？」「外来工人能不能改图纸？」「螺丝是不是没锁版本、明天就被人换掉？」
- **机场安检 vs 黑盒测试**：跑一遍 CI 是「让旅客过安检门」；zizmor 是「在旅客进站前检查行李清单和登机牌规则有没有漏洞」。很多 **Pwn Request**、**模板注入**、**凭证落盘** 问题，在 PR 合并前就能被规则命中，而不必等攻击者真的 fork 你的仓库。
- **和 [[gitleaks]] 的分工**：Gitleaks 找的是「秘密有没有写进代码」；zizmor 找的是「CI 流水线本身有没有设计缺陷，导致秘密或写权限被外人利用」。两者常一起出现在安全基线里。

最简单的本地体验：

```bash
# 安装（任选其一）
brew install zizmor          # macOS Homebrew
uvx zizmor --version         # Python 生态，无需全局安装
cargo install zizmor         # 从 crates.io

# 审计当前仓库（默认离线也能跑）
zizmor .

# 只看 workflows 目录
zizmor .github/workflows/
```

有 findings 时，终端会以类似 `cargo` 诊断的风格输出规则 ID、严重级别、文件位置与修复建议链接（`https://docs.zizmor.sh/audits/<rule-id>/`）。

## 为什么重要

不理解 zizmor 这类工具，下面几类事故很难在代码审查阶段拦住：

- **Pwn Request**：fork 来的 PR 触发 `pull_request_target`，在**目标仓库权限**下执行攻击者可控输入——经典文章 [*Keeping your GitHub Actions and workflows secure Part 1: Preventing pwn requests*](https://securitylab.github.com/resources/research-tutorials/github-actions-preventing-pwn-requests/) 描述的正是这类模式；zizmor 的 `dangerous-triggers` 等规则专门盯这类触发器。
- **模板注入（Template Injection）**：`${{ github.event.issue.title }}` 直接拼进 `run: |` 的 shell 脚本，会在执行前被展开成任意 shell 代码；zizmor 的 `template-injection` 规则会推动你改成 `env:` + `$VAR` 模式。
- **凭证持久化（ArtiPACKED）**：`actions/checkout` 默认把 `GITHUB_TOKEN` 写进 `.git/config` 或 runner 临时目录，后续 `upload-artifact` 可能把 token 打进公开产物；`artipacked` 规则建议 `persist-credentials: false`。
- **供应链固定**：`uses: actions/checkout@v4` 这种**可漂移的 tag** 在 zizmor v1.20+ 默认策略下会被 `unpinned-uses` 标记，推荐改成 **commit SHA 钉死**（`@de0fac2e... # v6`）。

维护方文档强调：zizmor 是**纯静态**工具——看不到运行时 `matrix` 的真实值，因此对 `${{ matrix.foo }}` 可能偏保守（宁可误报也不漏报）。理解这一点，才能正确配置 `persona`、忽略注释和 `zizmor.yml`。

## 核心要点

zizmor 的工作流可以拆成 **五层**：

### 1. 输入收集（Collection）

扫描前会先收集待审计对象：

| 输入形式 | 示例 | 说明 |
|----------|------|------|
| 本地目录 | `zizmor .` | 递归找 workflows、actions |
| 单个文件 | `zizmor path/to/ci.yml` | 从文件所在目录向上发现配置 |
| 远程仓库 | `zizmor owner/repo` | 需 `GH_TOKEN` / `--gh-token` 调 GitHub API |

`--collect` 可限定种类：`workflows`、`actions`、`dependabot` 等。`--strict-collection` 则在 YAML 语法/ schema 错误时直接失败，而不是警告继续。

### 2. 运行模式（Offline / Online）

- **离线（默认）**：不设置 token 时，只分析本地已 checkout 的文件；多数规则（`template-injection`、`unpinned-uses`、`dangerous-triggers` 等）**离线可用**。
- **在线**：提供 `GH_TOKEN` 后可拉远程仓库、查 action 是否归档、提高 `typosquat-uses` 等规则的置信度。
- **`--offline`**：即使设置了 token 也强制纯离线。

对日常开发：**本地 pre-commit / PR 前跑 `zizmor .` 通常不需要 token**。

### 3. Persona（审计人格）

| Persona | 行为 |
|---------|------|
| `regular`（默认） | 高信噪比，只报较有把握的 issue |
| `pedantic` | 更严格，例如 `template-injection` 会标记所有代码上下文里的 `${{ }}` |
| `auditor` | 最激进，适合安全审计或基线建立 |

CLI：`-p` / `--pedantic`，或 `--persona auditor`。还可配合 `--min-severity`、`--min-confidence` 过滤输出。

### 4. 审计规则（Audits）

官方文档列出 **三十余条** 规则，覆盖 workflow、composite action、Dependabot 配置。常见几类：

| 规则 ID | 关注点 |
|---------|--------|
| `dangerous-triggers` | `pull_request_target`、`workflow_run` 等高危触发器 |
| `template-injection` | `${{ }}` 进入 shell 的注入面 |
| `artipacked` | checkout 后 token 落盘、artifact 泄露 |
| `excessive-permissions` | workflow/job 权限过大或未最小化 |
| `unpinned-uses` | action 引用未钉 SHA |
| `unpinned-images` | 容器镜像使用可变 tag |
| `cache-poisoning` | 发布流程误用可被投毒的 build cache |
| `bot-conditions` | 用 `github.actor` 冒充 Dependabot 等 |
| `typosquat-uses` | `action/checkout` 类拼写劫持 |
| `adhoc-packages` | `run: npm install foo` 无 lockfile |
| `dependabot-cooldown` | Dependabot 未配置更新冷却期 |

每条规则文档页有 **Before / After** 示例、是否支持 `--fix`、是否可写 `zizmor.yml` 覆盖策略。

### 5. 输出与集成

| `--format` | 用途 |
|------------|------|
| `plain`（默认） | 终端人类可读 |
| `github` | GitHub Actions 注解，无需 Advanced Security |
| `sarif` | 上传 Code Scanning / Advanced Security |
| `json` / `json-v1` | 自定义流水线消费 |

**实验性自动修复**：`zizmor --fix`（及 `safe` / `unsafe-only` / `all` 模式）可自动改部分 finding（如 `template-injection`、`artipacked`）。

**配置**：可选 `zizmor.yml` / `.github/zizmor.yml`，支持按规则 `disable`、为 `unpinned-uses` 配置 `policies`（例如允许 `actions/*` 使用 tag）。行内可用 `# zizmor: ignore[rule-id]` 忽略单条。

### 6. 静态分析的边界（必读）

文档明确两点限制：

1. **不执行代码**——无法知道 `matrix.os` 运行时到底是什么，只能对表达式做保守分析。
2. **只审计定义文件**——`run: ./scripts/build.sh` 里的 shell 脚本内容**不会**被深入分析，除非脚本直接写在 workflow YAML 里。

因此：zizmor 是 **CI 设计审查**，不能替代对业务脚本、第三方 action 内部逻辑的手工审计或动态测试。

## 代码示例

### 示例 1：修复模板注入（`template-injection`）

**问题写法**：把用户可控的 issue 标题直接插进 shell，攻击者可构造标题注入额外命令。

```yaml
# ❌ zizmor 会报 template-injection
- name: Check title
  run: |
    title="${{ github.event.issue.title }}"
    if [[ ! $title =~ ^.*:\ .*$ ]]; then
      echo "Bad issue title"
      exit 1
    fi
```

**推荐写法**：模板展开放进 `env:`，shell 里用普通变量（注意不要用 `${{ env.ISSUE_TITLE }}`，那仍是模板展开）：

```yaml
# ✅ 由 shell 做变量展开，受引号保护
- name: Check title
  run: |
    title="${ISSUE_TITLE}"
    if [[ ! $title =~ ^.*:\ .*$ ]]; then
      echo "Bad issue title"
      exit 1
    fi
  env:
    ISSUE_TITLE: ${{ github.event.issue.title }}
```

Windows runner 上若用 PowerShell，变量语法不同；跨平台时可设 `shell: bash` 统一行为。

### 示例 2：最小权限 + 钉死 action + 不持久化凭证

下面是一段「安全基线」风格的 fragment，同时回应 `excessive-permissions`、`unpinned-uses`、`artipacked` 多条规则：

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

# 工作流级默认零权限，各 job 按需开启
permissions: {}

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
        with:
          persist-credentials: false

      - name: Run tests
        run: npm ci && npm test
```

对比**常见隐患写法**：

```yaml
# ❌ 工作流级宽泛权限；checkout 未关 persist-credentials；uses 仅 tag
permissions:
  contents: write
  pull-requests: write

steps:
  - uses: actions/checkout@v4
  - run: echo "${{ github.event.pull_request.title }}"
```

第一处触发 `excessive-permissions`；第二处 `artipacked`；第三处同时有 `unpinned-uses` 与 `template-injection` 风险。

### 示例 3：在 GitHub Actions 里集成（SARIF）

公开仓库或已购买 Advanced Security 的私有仓库，可用官方 [zizmor-action](https://github.com/zizmorcore/zizmor-action) 或手写步骤：

```yaml
name: GitHub Actions Security Analysis

on:
  pull_request:
  push:
    branches: [main]

permissions:
  security-events: write
  contents: read
  actions: read

jobs:
  zizmor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
        with:
          persist-credentials: false

      - name: Run zizmor
        run: uvx zizmor --format=sarif . > results.sarif
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@7211b7c8077ea37d8641b6271f6a365a22a5fbfa # v4
        with:
          sarif_file: results.sarif
          category: zizmor
```

没有 Advanced Security 时，可改用 `--format=github` 在 PR 里显示注解，无需 `security-events: write`。

### 示例 4：项目级配置 `zizmor.yml`

在 monorepo 或需要允许部分 namespace 用 tag 时：

```yaml
# .github/zizmor.yml
rules:
  unpinned-uses:
    config:
      policies:
        # 官方 actions 组织允许 ref-pin（@v4），第三方仍要求 SHA
        actions/*: ref-pin
        # 自家内部 action 允许 tag
        my-org/*: ref-pin
```

配合 CLI：`zizmor --persona regular .`，对暂时接受的 finding 用 `# zizmor: ignore[unpinned-uses]` 并写明理由，避免静默烂掉。

## 与相近工具的关系

| 工具 | 扫描对象 | 与 zizmor 的关系 |
|------|----------|------------------|
| [[gitleaks]] | 仓库中的密钥字符串 | 互补：秘密是否**进库** |
| GitHub CodeQL | 多语言源码 | 互补：应用代码漏洞 |
| actionlint | workflow 语法/类型 | 可并用：actionlint 偏语法，zizmor 偏**安全语义** |
| Dependabot / Renovate | 依赖版本更新 | zizmor 还能审 `dependabot.yml` 的 cooldown 等策略 |

推荐流水线顺序：**actionlint（快）→ zizmor（安全）→ 测试 job**。本地可用 [pre-commit](https://docs.zizmor.sh/integrations/) hook 在提交前拦截。

## 学习路径建议

1. **Quickstart**：对自家仓库跑 `zizmor .`，先不加 `-p`，熟悉输出格式。
2. **读规则目录**：浏览 [Audit Rules](https://docs.zizmor.sh/audits/)，重点 `dangerous-triggers`、`template-injection`、`artipacked`、`unpinned-uses`。
3. **修一轮**：对可自动修复项试 `zizmor --fix=safe .`，其余手工改并写 `zizmor.yml` / ignore 注释。
4. **接入 CI**：从 `--format=github` 注解模式起步，有条件再上 SARIF + Security 面板。
5. **建立基线**：用 `--persona auditor` 扫一遍，把真实误报记入配置，而不是永久 `--no-ignores`。

## 常见坑

- **以为离线扫远程 fork PR 足够**：离线只分析**当前 checkout 的 YAML**；要扫 PR 里改的 workflow，必须在 CI 里对 PR 分支 checkout 后再跑 zizmor。
- **误用 `${{ env.X }}` 修注入**：在 `run:` 里仍属模板展开，应改用 `$X` / `${X}`。
- **只钉第三方 action**：v1.20+ 默认要求**全部** `uses` SHA 钉死；需要放宽时在 `zizmor.yml` 写 policy。
- **忽略 `pull_request_target`**：「我们不 checkout PR 代码就安全」是错的；参数注入、环境变量、`workflow_run` 等仍有攻击面——以官方 dangerous-triggers 文档为准。
- **把 zizmor 当万能**：composite action 引用的外部脚本、运行时下载的 action 内容，静态阶段都看不到。

## 资源

- 官网与文档：[zizmor.sh](https://zizmor.sh/) · [docs.zizmor.sh](https://docs.zizmor.sh/)
- 源码：[zizmorcore/zizmor](https://github.com/zizmorcore/zizmor)（MIT，Rust）
- GitHub Action 封装：[zizmorcore/zizmor-action](https://github.com/zizmorcore/zizmor-action)
- 安装方式汇总：[Installation](https://docs.zizmor.sh/installation/)（Homebrew、uvx、pip、cargo、GitHub Releases 等）
- 背景阅读：GitHub Security Lab 的 Actions 安全系列；ArtiPACKED 论文讨论 artifact 与 git 凭证竞态

## 小结

zizmor 把 GitHub Actions 领域里反复出现的 CI/CD 设计错误，沉淀成可离线运行、可接 SARIF 的规则集。对零基础使用者：先把它当成 **「workflow YAML 的安全 linter」**，从 `zizmor .` 开始，理解 **静态边界**，再逐步收紧 **权限、钉版本、模板与触发器** 四条主线，就能在不动 runner 的前提下，显著降低 Pwn Request 与供应链漂移风险。

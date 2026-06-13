---
title: Gitleaks — Git 仓库密钥泄露扫描
来源: https://github.com/gitleaks/gitleaks
日期: 2026-06-13
子分类: 安全与隐私
分类: 安全与隐私
provenance: pipeline-v3
---

## 是什么

Gitleaks 是 Zach Rice 2018 年用 Go 写的**密钥泄露扫描器**（SAST，静态应用安全测试）。它会在 Git 提交历史、工作区文件、甚至管道输入里，用正则 + 熵值启发式去找硬编码的密码、API Key、私钥、Token 等敏感信息。

日常类比：

- **把代码仓库当成一本公开日记**：你每 `git commit` 一次，就等于在日记里新写了一页。Gitleaks 不是只读「当前这一页」，而是能把**整本日记从第一页翻到现在**，看有没有哪一页不小心写进了家门钥匙的复印件。
- **门禁 vs 保安巡逻**：`.gitignore` 像「以后别再把钥匙贴门上」；Gitleaks 像保安拿着清单，检查**历史上有没有已经贴出去过**——删了文件、改了配置，旧 commit 里的秘密仍然在 `git log` 里躺着。
- **金属探测器**：机场安检不关心你「现在口袋里有没有刀」，它扫的是**所有可能藏违禁品的位置**。Gitleaks 对 AWS Key、GitHub PAT、数据库连接串等有上千条内置规则，相当于针对不同「违禁品形状」的探测器。

最简单的体验，扫描当前目录这个 Git 仓库：

```bash
# 安装（macOS）
brew install gitleaks

# 扫描本地 git 仓库（v8.19+ 推荐用 git 子命令，替代已弃用的 detect）
gitleaks git -v .

# 只扫某个目录/文件，不依赖 .git
gitleaks dir -v ./src
```

有泄露时，终端会打印 `Finding`、`Secret`、`RuleID`、文件行号、关联的 commit 与作者——足够你定位「谁、何时、在哪一行」把秘密写进了历史。

## 为什么重要

不理解 Gitleaks 这类工具，下面这些事很容易踩坑：

- **「我已经删了」不等于安全**：密钥进过 Git 历史，就等于可能被 fork、镜像、CI 日志、备份磁带永久保留。轮换密钥 + 清历史是另一回事，扫描是发现问题的第一步。
- **`.env` 在 `.gitignore` 里不够**：开发者可能误 `git add`，或在测试文件、README 示例、Terraform 变量里硬编码。Gitleaks 扫的是**实际进入版本库的内容**（以及 `dir` 模式下的明文文件）。
- **合规与供应链**：PCI-DSS、SOC2、ISO 27001 等审计常问「如何防止密钥进入代码库」。在 PR / pre-commit / 定时任务里跑 Gitleaks，是可落地的控制点。
- **成本极低、收益极高**：开源、单二进制、无 agent；与 [[ansible]]、[[kubernetes]] 流水线、GitHub Actions 集成都只需几行 YAML。官方 [Gitleaks-Action](https://github.com/gitleaks/gitleaks-action) 在组织仓库需免费 License Key，个人账号可直接用。

维护者 2026 年声明 Gitleaks **功能已基本冻结**（后续以安全补丁为主），新能力转向 [Betterleaks](https://github.com/betterleaks/betterleaks)。但对绝大多数团队，v8 的规则库与生态仍足够日常防护。

## 核心要点

Gitleaks 的检测模型可以拆成 **五层**：

1. **扫描模式（Scan Mode）**
   - `gitleaks git`：通过 `git log -p` 看 patch，能扫**完整提交历史**；可用 `--log-opts` 限定 commit 范围。
   - `gitleaks dir`：扫目录或单文件，不依赖 Git；适合 CI 里扫构建产物、或未初始化的快照。
   - `gitleaks stdin`：从管道读入，方便 `cat file | gitleaks stdin` 嵌入自定义流水线。

2. **规则（Rules）**
   - 每条规则有 `id`、`description`、`regex`（Go 正则，不支持 lookahead）、可选 `entropy`（香农熵下限，过滤低随机字符串）、`keywords`（预过滤加速）、`path`（只匹配特定路径）。
   - 默认配置内置数百条规则（AWS、GCP、GitHub、Slack、Stripe 等），见上游 [`config/gitleaks.toml`](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml)。
   - v8.28+ 支持**复合规则**：主规则 + `[[rules.required]]` 辅助规则，并可用 `withinLines` / `withinColumns` 做邻近匹配，降低误报。

3. **配置加载顺序**
   1. `--config` / `-c` 指定路径
   2. 环境变量 `GITLEAKS_CONFIG`（文件路径）
   3. 环境变量 `GITLEAKS_CONFIG_TOML`（文件内容）
   4. 目标路径下的 `.gitleaks.toml`
   5. 以上皆无 → 使用内嵌默认配置

4. **降噪机制**
   - **Allowlist**：全局 `[[allowlists]]` 或规则级 `[[rules.allowlists]]`，按 commit、路径、正则、stopwords 忽略误报。
   - **Baseline**：`--baseline-path` 指向旧报告，只报**新增**泄露，适合「历史债太多、先止血再还债」。
   - **`.gitleaksignore`**：按 finding 的 `Fingerprint` 逐条忽略（实验特性）。
   - **行内注释**：`#gitleaks:allow` 标记已知测试用假密钥。

5. **报告与集成**
   - 输出格式：`json`、`csv`、`junit`、`sarif`（可进 GitHub Security / 其他 SARIF 消费者）、自定义 Go template。
   - 退出码：0 = 无泄露；1 = 有泄露或错误；可用 `--exit-code` 自定义。
   - 进阶：`--max-decode-depth` 自动解码 Base64/Hex/Percent 嵌套秘密；`--max-archive-depth` 解压 zip/tar 等归档再扫。

简单说：**规则定义「什么算秘密」，三种模式决定「扫哪里」，allowlist/baseline 决定「什么可以暂时不管」，报告格式决定「怎么接进 CI」**。

## 实践案例

### 案例 1：本地仓库全量扫描 + SARIF 报告

适合第一次在自有项目上摸底：

```bash
cd /path/to/your-repo

# 全历史扫描，详细日志，输出 SARIF 供 GitHub / IDE 消费
gitleaks git -v \
  --report-path gitleaks.sarif \
  --report-format sarif \
  .

# 只看最近 7 天的 commit（缩小范围、加快反馈）
gitleaks git -v \
  --log-opts="--since=7.days" \
  .
```

若历史太长、一时修不完，先建 baseline，后续只盯增量：

```bash
# 第一次：把当前所有发现存成基线
gitleaks git --report-path baseline.json .

# 之后：只报告 baseline 里没有的新泄露
gitleaks git \
  --baseline-path baseline.json \
  --report-path new-findings.json \
  .
```

### 案例 2：自定义规则 + pre-commit 守门

在 monorepo 根目录放 `.gitleaks.toml`，扩展默认规则并屏蔽测试目录：

```toml
title = "acme gitleaks config"

[extend]
useDefault = true
disabledRules = []  # 可按需关闭噪声大的默认规则

[[rules]]
id = "acme-internal-token"
description = "Acme internal service token (acme_live_...)"
regex = '''acme_live_[a-zA-Z0-9]{32}'''
tags = ["acme", "token"]

[[allowlists]]
description = "test fixtures and docs examples"
paths = [
  '''(?:^|/)tests/fixtures/''',
  '''(?:^|/)docs/examples/''',
]
```

配合 [pre-commit](https://pre-commit.com/) 在提交前阻断：

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.30.1
    hooks:
      - id: gitleaks
```

```bash
pre-commit install
git commit -m "feat: add payment client"   # 含真实密钥时会 Failed
SKIP=gitleaks git commit -m "..."        # 紧急时跳过（慎用）
```

代码里故意的假密钥可加注释（仅当你确信安全时）：

```python
# 文档示例，非生产密钥
FAKE_STRIPE_KEY = "sk_test_51234567890abcdef"  #gitleaks:allow
```

### 案例 3：GitHub Actions 持续扫描

在 PR 与定时任务里自动扫，组织账号需配置 `GITLEAKS_LICENSE`（[gitleaks.io](https://gitleaks.io) 免费申请）：

```yaml
# .github/workflows/gitleaks.yml
name: gitleaks
on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "0 4 * * *"   # 每天 4:00 UTC 扫全历史

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # 必须拉全历史，否则扫不到旧 commit

      - uses: gitleaks/gitleaks-action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}
          GITLEAKS_CONFIG: .gitleaks.toml
```

`fetch-depth: 0` 是关键细节：默认浅克隆只带最近一次 commit，历史泄露会被漏掉。

## 命令对照（v8.19+ 迁移）

旧版常用的 `detect` / `protect` 已弃用，对应关系：

| 旧命令 | 新写法 |
|--------|--------|
| `gitleaks detect` | `gitleaks git` |
| `gitleaks protect`（pre-commit） | `gitleaks git --pre-commit` 或 pre-commit hook |
| 扫非 git 目录 | `gitleaks dir` |
| 管道输入 | `gitleaks stdin` |

Docker 一行跑（挂载当前目录）：

```bash
docker run --rm -v "$(pwd):/path" ghcr.io/gitleaks/gitleaks:latest \
  git -v --source /path
```

## 与其他工具的关系

| 工具 | 侧重点 | 与 Gitleaks 的分工 |
|------|--------|-------------------|
| **git-secrets**（AWS） | Git hook + 简单正则 | 更轻，规则少；Gitleaks 规则库与报告更丰富 |
| **TruffleHog** | 熵 + 验证器（调 API 验密钥是否仍有效） | 误报处理不同；可并用 |
| **detect-secrets**（Yelp） | 基线 + 插件式检测 | 适合「只关心新增」；Gitleaks 默认 SARIF/CI 生态更熟 |
| **GitHub Secret Scanning** | 平台侧推送保护 | 对公开/受支持格式自动扫；私有库或自建 Git 仍需 Gitleaks |

Gitleaks 的定位是：**自托管、可定制、能扫完整 Git 历史的开源守门员**——不替代密钥管理服务（Vault、云厂商 Secrets Manager），而是防止秘密**先**以明文形式进入版本库。

## 常见误报与排查

1. **示例文档、单元测试里的假 Key**：用 `[[allowlists]].paths` 或 `#gitleaks:allow`，不要关规则。
2. **锁文件、vendor、图片二进制**：默认配置已 allowlist 大量 `node_modules`、`package-lock.json` 等；若仍报，检查是否自定义配置覆盖了默认 extend。
3. **高熵随机字符串**：UUID、hash 可能撞上 `generic-api-key`；用 `stopwords` 或提高 `entropy` 阈值。
4. **扫描太慢**：`--log-opts="--since=30.days"`、baseline、或 `--max-target-megabytes` 跳过大文件。
5. **CI 扫不到历史泄露**：检查 `fetch-depth` 是否为 0。

## 学习路径建议

1. **零基础**：`brew install gitleaks` → 在练习仓库 `gitleaks git -v .` 看输出字段含义。
2. **接进团队**：加 `.gitleaks.toml`（`useDefault = true`）→ pre-commit → GitHub Action + SARIF。
3. **治理历史债**：全量扫描 → `baseline.json` → 排期轮换密钥 + `git filter-repo` / BFG 清历史（清历史是独立高危操作，需团队协调）。
4. **深入**：读默认 `gitleaks.toml` 里一条 AWS 规则；试写一条内部 token 正则；了解复合规则与 `--max-decode-depth`。

## 延伸阅读

- 官方仓库与默认配置：[gitleaks/gitleaks](https://github.com/gitleaks/gitleaks)
- 检测思路博文：[Regex is (almost) all you need](https://lookingatcomputer.substack.com/p/regex-is-almost-all-you-need)
- 高级配置：[Stop Leaking Secrets Configuration 2.3](https://blog.gitleaks.io/stop-leaking-secrets-configuration-2-3-aeed293b1fbf)
- 命令迁移 gist：[v8.19 detect/protect 迁移](https://gist.github.com/zricethezav/b325bb93ebf41b9c0b0507acf12810d2)
- 相关笔记：密钥管理与零信任可结合 [[vault]]、[[sigstore-cosign-2022]] 等专题理解「秘密全生命周期」。

---

*最后更新：2026-06-13*

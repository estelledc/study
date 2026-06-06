---
title: gh — GitHub 官方命令行
来源: https://github.com/cli/cli
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

**gh** 是 GitHub 官方的命令行工具，2020 年开源，用 Go 写成单个静态二进制。一句话：**GitHub 网页能干的事，绝大多数能在终端用一条命令干完**。

日常类比：

- 没有 gh 的时候：写完代码 push，切到浏览器，点 New Pull Request，填标题，等 CI，再切回终端 `git checkout` 别人的分支审，点 Approve，回到终端 merge……一次 PR 流程切 5-10 次窗口。
- 有 gh 之后：`gh pr create -f` → `gh pr view --web` → `gh pr checkout 123` → `gh pr review --approve` → `gh pr merge --squash`，全在同一个终端窗口。

它不替代 `git`。`git` 管"代码版本"，`gh` 管"GitHub 这个平台之上的协作动作"——PR、issue、release、Action、Codespaces、API 调用。

## 为什么重要

不理解 gh，下面这些事都说不清：

- **为什么资深开发者从不打开 PR 页面**：所有协作动作都有命令，浏览器只用来看图表和讨论
- **为什么 GitHub Actions 里几乎每个 step 都有 gh**：runner 内置 gh、自动注入 `GITHUB_TOKEN`，比手写 `curl + Authorization` 短 5 倍
- **为什么 hub 这个老牌工具被淘汰**：hub 是 2010 年第三方写的，gh 出来后 GitHub 自己背书 + 持续迭代，社区两年内全迁过去
- **为什么"扩展生态"是杀手锏**：`gh extension install` 让任何人能给 gh 加新命令，gh-dash / gh-copilot / gh-poi 把 gh 变成可拔插平台

## 核心要点

gh 的设计可以拆成 **四层**：

### 命令结构（Cobra 框架）

底层用 `spf13/cobra`（kubectl、docker CLI 同款），命令永远是 `gh <topic> <command>` 两段：

- `gh auth login` / `gh auth status` / `gh auth refresh`
- `gh repo create` / `gh repo clone` / `gh repo view`
- `gh pr create` / `gh pr checkout` / `gh pr merge`
- `gh issue list` / `gh release create` / `gh run watch`

每个 topic 都有 `--help`，新手记不住命令时 `gh pr --help` 就够。

### 认证（OAuth device flow）

第一次用敲 `gh auth login`，它给你一个 8 位 code，你在浏览器打开 `github.com/login/device` 贴进去——不用手生成 PAT，不用复制粘贴长 token。CI 场景则读 `GH_TOKEN` 环境变量。

### API 直通（gh api）

```bash
gh api repos/cli/cli/issues --jq '.[].title'
gh api graphql -f query='query { viewer { login } }'
```

`gh api` 自动加好鉴权头、自动处理分页（`--paginate`）、自带 `--jq` 现场过滤——本来你要写 `curl -H "Authorization: ..." | jq ...` 三段，现在一句。

### 扩展机制

```bash
gh extension install dlvhdr/gh-dash    # 终端 PR/issue 仪表盘
gh extension install github/gh-copilot # 命令行 Copilot
```

约定：扩展仓库必须以 `gh-` 前缀命名；可执行文件入口任意语言（Go/Python/shell 都行）。这让 gh 像 VS Code 装插件一样可拔插。

## 实践案例

### 案例 1：完整 PR 流程一气呵成

```bash
git checkout -b feat/login
# ... 改代码 ...
git push -u origin feat/login
gh pr create --fill            # 自动用 commit message 填标题/描述
gh pr view --web               # 浏览器看一眼 CI
gh pr merge --squash --delete-branch
```

整套不切窗口。`--fill` 是关键技巧——commit message 写好了，PR 描述自动同步。

### 案例 2：在 GitHub Actions 里用 gh

```yaml
- run: gh issue close ${{ github.event.issue.number }} -c "auto closed by bot"
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

runner 自带 gh、token 已注入。同样动作用 octokit 要 5 行 JS + import；用 gh 一行。

### 案例 3：脚本化批量操作

```bash
gh api --paginate /repos/cli/cli/issues \
  --jq '.[] | select(.labels[].name=="stale") | .number' \
  | xargs -I{} gh issue close {} -c "stale, please reopen if still relevant"
```

把 stale label 的 issue 全关掉。换 octokit 写要 30 行；gh + jq + xargs 三行搞定。

## 踩过的坑

1. **token scope 不够静默失败**：`gh auth status` 显示 OK，但 `gh repo delete` 报 403——默认 OAuth scope 不含 `delete_repo`。解决：`gh auth refresh -s delete_repo`。已记入全局 reference。
2. **判断 fork 有没有真实贡献别看 ahead_by**：merge commit 也算 ahead。要拉 commits 列表看作者是否本人，已是踩过的坑。
3. **`gh pr create` 在 detached HEAD / 多 remote / 无上游时报怪错**：先 `git push -u origin <branch>` 把追踪关系建好，再 create。
4. **扩展仓库名忘记 `gh-` 前缀**：`gh extension install xxx/my-tool` 直接失败，必须改名 `gh-my-tool`。
5. **Enterprise Server 默认连 github.com**：公司私有 GitHub 要 `gh auth login --hostname github.your-corp.com`，否则一直 404。
6. **PowerShell 下 `--jq` 引号转义**：bash 写法直接搬到 Windows 会语法错——`'` 在 PowerShell 不是字符串边界。

## 适用 vs 不适用场景

**适用**：

- 终端为主的 GitHub 协作（PR、issue、release、Action 调试）
- GitHub Actions 工作流里调 GitHub API（比 octokit 短）
- bash 脚本批量管理仓库 / issue / release
- Codespaces 工作流（`gh codespace create / ssh / code`）

**不适用**：

- GitLab / Gitea / Bitbucket → 各家有自己 CLI（`glab` / `tea`）
- 想替代 `git` 本身 → gh 只管平台层，`git commit/push/rebase` 还是 git
- 高频并发 API 调用、复杂 webhook 处理 → 直接用 octokit SDK 更顺手
- 不会用终端的协作者 → 网页 UI 仍是 GitHub 主战场

## 学到什么

1. **CLI 设计的抽象层**：命令永远 `<topic> <command>`，记忆负担线性而不是发散——这就是 Cobra 的红利
2. **OAuth device flow 比 PAT 友好**：不用让用户进 settings 找 token 页面，是好工具的细节
3. **扩展机制是平台杠杆**：把 gh 变可拔插之后，社区贡献的命令多到 GitHub 自家不可能写完
4. **CLI + 管道 = 自动化原语**：`gh api` 出 JSON，`jq` 过滤，`xargs` 分发——这套组合把脚本能力推到极限

## 延伸阅读

- 官方文档：[cli.github.com/manual](https://cli.github.com/manual/)
- 仓库源码：[github.com/cli/cli](https://github.com/cli/cli)（学 Go CLI 设计的好样本）
- 扩展集合：[github.com/topics/gh-extension](https://github.com/topics/gh-extension)
- [[starlight]] —— 本笔记站点用的静态站点框架
- [[playwright]] —— 同样以 CLI 为入口的另一类工具

## 关联

- [[starlight]] —— 同样命令行驱动的开发工具，但属于内容渲染领域
- [[playwright]] —— CLI 入口、跨平台二进制的另一类参照
- [[biome]] —— Rust 写的 lint+format CLI，对照 gh 的 Go 实现可以看两种语言的 CLI 取舍

## 与 hub / glab 对比

| 维度 | hub (旧) | gh (现在) | glab (GitLab) |
| --- | --- | --- | --- |
| 维护方 | 第三方 (Tim Pope) | GitHub 官方 | GitLab 官方 |
| 语言 | Go | Go | Go |
| 命令结构 | 包裹 git，`hub pull-request` | 独立 `gh <topic> <cmd>` | `glab <topic> <cmd>` |
| 扩展机制 | 无 | `gh extension` 生态 | 类似但生态较小 |
| 现状 | 已停止维护 | 主流 | GitLab 用户主流 |

hub 当年的设计是"扩展 git"，所以子命令塞进 git 命名空间。gh 选择独立顶级命令——避免污染 git 子命令、也方便加 `auth/extension/codespace` 这些与 git 无关的功能。事后看是更可扩展的架构。

## 一句话总结

**gh 把 GitHub 网页能干的事压回终端**——OAuth device flow 解决登录、Cobra 解决命令结构、`gh api + jq` 解决 API 直通、扩展机制让社区接力。它不替代 git，而是补齐"GitHub 平台"这一层缺失的命令行接口。对每天和 PR / issue / Action 打交道的开发者，是一次性把 50 次窗口切换压回零的工具。

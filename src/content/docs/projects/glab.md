---
title: glab — GitLab 官方命令行
来源: https://gitlab.com/gitlab-org/cli
日期: 2026-05-31
分类: 开发工具
难度: 入门
---

## 是什么

**glab** 是 GitLab 官方的命令行工具，2022 年由 GitLab 接管社区项目转正，用 Go 写成单个静态二进制。一句话：**GitLab 网页能干的事，绝大多数能在终端用一条命令干完**。

日常类比：

- 没有 glab 的时候：写完代码 push，切到浏览器开 New merge request，填 title，等 CI 跑完，再切回终端 `git checkout` 别人的分支审，点 Approve，回到终端 merge……一次 MR 流程切 5-10 次窗口。
- 有 glab 之后：`glab mr create -f` → `glab ci status` → `glab mr checkout 123` → `glab mr approve` → `glab mr merge`，全在同一个终端窗口。

它不替代 `git`。`git` 管"代码版本"，`glab` 管"GitLab 这个平台之上的协作动作"——MR、issue、CI/CD pipeline、release、API 调用、Duo AI。

## 为什么重要

不理解 glab，下面这些事都说不清：

- **为什么 GitLab 用户终于不再羡慕 gh**：2018 到 2022 之间 GitHub 用户用 gh 已成标配，GitLab 这边只有第三方 lab/glab；2022 GitLab 把 Clement Sam（GitHub: profclems）受 [[gh]] 启发写出的 glab 收编为官方工具，补齐了平台层缺失。
- **为什么 GitLab CI/CD 命令比 gh 更深**：GitLab 是"Git + CI/CD 一体化"叙事的代表，所以 `glab ci` 子命令从 lint、view、status 一直深入到单个 job 的 `trace`——比 [[gh]] 的 `gh run` 多一层。
- **为什么自建 GitLab 用户也能用同一个工具**：`GITLAB_HOST` / `GL_HOST` 一个环境变量切实例，公网 gitlab.com 与自建 gitlab.example.com 共用一份配置。
- **为什么 glab 的扩展生态比 gh 弱**：glab 没有 `gh extension install` 那样的官方插件协议，社区贡献只能靠 alias + 脚本拼。是有意为之还是路径依赖待观察。

## 核心要点

glab 的设计可以拆成 **四层**：

### 命令结构（Cobra 框架）

底层和 [[gh]] 一样用 `spf13/cobra`，命令永远是 `glab <topic> <command>` 两段，40+ 顶层 topic：

- `glab auth login` / `glab auth status`
- `glab repo create` / `glab repo clone` / `glab repo view`
- `glab mr create` / `glab mr checkout` / `glab mr merge` / `glab mr approve`
- `glab issue list` / `glab release create` / `glab ci view`
- 还有 GitLab 独家：`glab snippet` / `glab cluster` / `glab runner` / `glab schedule` / `glab variable` / `glab duo`

每个 topic 都有 `--help`，新手记不住命令时 `glab mr --help` 就够。

### 认证（OAuth + PAT 双轨）

第一次用敲 `glab auth login`，可以选 OAuth（浏览器跳转授权）或 PAT（在 GitLab 网页生成 token 粘贴）。CI 场景设 `GITLAB_TOKEN` 环境变量；GitLab CI runner 内还可以开 `GLAB_ENABLE_CI_AUTOLOGIN=true`，glab 会自动用 runner 注入的 `CI_JOB_TOKEN` 登录，不用显式配 secret。

### CI/CD 直通（glab ci）

```bash
glab ci view              # 当前分支 pipeline 拓扑图
glab ci status --live     # 实时刷新 job 状态
glab ci trace <job-id>    # 流式打印某个 job 的日志
glab ci lint .gitlab-ci.yml  # 本地校验 yaml 语法
glab ci retry <pipeline>  # 重跑失败 pipeline
```

这一层是 glab 相对 [[gh]] 的最大差异——GitLab CI 是 GitLab 的核心叙事，命令也最厚。

### 自建实例支持

```bash
export GITLAB_HOST=gitlab.example.com
glab auth login
```

或在 `~/.config/glab-cli/config.yml` 里配多 host。这个能力对企业用户至关重要——大多数公司 GitLab 都是自建。

## 实践案例

### 案例 1：完整 MR 流程一气呵成

```bash
git checkout -b feat/login
git push -u origin feat/login
glab mr create --fill         # 自动用 commit message 填 title/description
glab ci status                # 看一眼当前 pipeline
glab mr merge --squash --remove-source-branch
```

`--fill` 与 [[gh]] 同名同义。`--remove-source-branch` 是 GitLab 风味命名，gh 里叫 `--delete-branch`。

### 案例 2：在 GitLab CI 里调 glab

```yaml
deploy:
  image: registry.gitlab.com/gitlab-org/cli:latest
  variables:
    GLAB_ENABLE_CI_AUTOLOGIN: 'true'
  script:
    - glab issue close $ISSUE_IID -m 'auto closed by deploy'
```

用官方镜像，开 autologin，job 里直接 `glab` 调 API——不用手配 PAT secret。

### 案例 3：脚本化批量操作

```bash
glab api projects/:id/issues?state=opened \
  --paginate \
  | jq '.[] | select(.labels[]=="stale") | .iid' \
  | xargs -I{} glab issue close {} -m 'stale, please reopen if needed'
```

`glab api` 自动加鉴权头、自动分页（`--paginate`）。和 [[gh]] 的 `gh api` 几乎完全镜像。

## 踩过的坑

1. **GITLAB_TOKEN 优先级高于 `glab auth login`**：环境里有 GITLAB_TOKEN 时 glab 会优先用它，导致你以为切了账号其实没切。`unset GITLAB_TOKEN` 再 `glab auth login` 才干净。
2. **自建 GitLab 用 OAuth 要先注册 application**：默认 `glab auth login` 走 gitlab.com 的 OAuth client；自建实例必须先在 Admin → Applications 注册 glab 并把 `GITLAB_CLIENT_ID` 设上，否则一直 invalid_client。
3. **mr 编号 vs MR IID 容易混**：`glab mr view 123` 默认按当前 project 的 IID 找；跨 project 引用要 `--project group/repo`。GitLab 全站没有"全局 MR 编号"。
4. **CI lint 只校验语法，不展开 include**：`glab ci lint` 检测不出 `include:` 远程模板的错误，要 `--server-side` 才会发到 GitLab 走完整校验。
5. **glab mr checkout 没有 `gh pr checkout` 的 fork 自动化**：跨 fork 的 MR checkout 需要手动加 fork remote，不像 gh 自动加 `pr/123` ref。
6. **Duo 命令 SaaS only**：`glab duo ask` 只在 gitlab.com（或买了 Duo 的实例）能用，自建社区版会 401。

## 适用 vs 不适用场景

**适用**：

- 终端为主的 GitLab 协作（MR、issue、release、CI 调试）
- GitLab CI/CD 工作流里调 GitLab API（比手写 curl + token 短）
- 自建 GitLab 多实例切换（环境变量切 host）
- bash 脚本批量管理 project / issue / release

**不适用**：

- GitHub / Gitea / Bitbucket → 各家有自己 CLI（[[gh]] / `tea`）
- 想替代 `git` 本身 → glab 只管平台层，`git commit/push/rebase` 还是 git
- 高频并发 API 调用、复杂 webhook 处理 → 直接用 python-gitlab SDK 更顺手
- 不会用终端的协作者 → GitLab 网页 UI 仍是主战场

## 历史小故事（可跳过）

- **2020 年 7 月**：Clement Sam（profclems）发布 glab，明确对标 [[gh]]，把 MR / issue / pipeline 拉回终端。
- **2020–2022**：社区贡献把命令树铺开；同时还有第三方 `lab` 等竞品，但 glab 的 `gh` 镜像风格更易迁移。
- **2022 年**：GitLab 官方接管，仓库迁到 `gitlab-org/cli`，补齐自建实例与 CI 深度；此后成为 GitLab 用户的事实标配。

## 学到什么

1. **CLI 设计可以跨平台借鉴**：glab 命令结构和 [[gh]] 一对一镜像（mr ≈ pr / ci ≈ run / api 同名），降低切平台成本。两家敌对厂商各做各的 CLI，但用户体验趋同——这是好事。
2. **同源 cobra 框架带来一致体感**：`<topic> <command> --flag` 的层级永远不变，记忆负担线性。
3. **官方接管社区项目的范式**：profclems 从 2020 写到 2022（约两年），GitLab 把人 + 项目一起收编，比"自己从零写"快得多。GitLab Pages、Container Registry 都是同样路径。
4. **CI/CD 一体化 vs 平台分层**：GitLab 把 CI 写进核心，所以 `glab ci` 命令厚；GitHub 把 Actions 当独立产品挂上来，所以 `gh run` 命令薄。架构选择直接落进 CLI 的命令树。

## 延伸阅读

- 官方文档：[docs.gitlab.com/cli](https://docs.gitlab.com/cli/)
- 仓库源码：[gitlab.com/gitlab-org/cli](https://gitlab.com/gitlab-org/cli)
- 收编历史：[GitLab 官方 blog 2022 announcement](https://about.gitlab.com/blog/2022/12/07/introducing-the-gitlab-cli/)
- [[gh]] —— 同根设计的另一半，建议对照看
- [[starlight]] —— 本笔记站点用的静态站点框架

## 关联

- [[gh]] —— 命令结构和命名几乎一对一镜像，是 glab 的设计参照
- [[playwright]] —— 同样以 CLI 为入口的另一类工具
- [[biome]] —— Rust 写的 lint+format CLI，对照 glab 的 Go 实现可以看两种语言的 CLI 取舍

## 与 gh / hub 对比

| 维度 | gh | glab | hub (旧) |
| --- | --- | --- | --- |
| 维护方 | GitHub 官方 | GitLab 官方（2022 接管） | 第三方 (Tim Pope) |
| 语言 | Go | Go | Go |
| 命令结构 | `gh <topic> <cmd>` | `glab <topic> <cmd>` | 包裹 git |
| CI 命令 | `gh run`（job 级别浅） | `glab ci`（深入 job trace） | 无 |
| 自建实例 | `gh auth login --hostname` | `GITLAB_HOST` 环境变量 | 无 |
| 扩展机制 | `gh extension` 生态 | 无官方扩展协议 | 无 |
| 现状 | 主流 | GitLab 用户主流 | 已停止维护 |

glab 比 [[gh]] 强在 CI 深度（GitLab CI 是核心叙事）和自建实例支持（企业用户主场景）；弱在扩展生态（无 plugin 协议，靠 alias 拼）。两家命令命名高度对齐，从 [[gh]] 切到 glab 的学习成本几乎为零。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

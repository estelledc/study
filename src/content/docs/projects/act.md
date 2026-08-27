---
title: act — 在本地用 Docker 跑 GitHub Actions
来源: https://github.com/nektos/act
日期: 2026-05-31
分类: DevOps / CI 基建
难度: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/nektos/act
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4f411281417e88660bea1c1a1749aa71ae0bd60f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.2.89
---

## 是什么

**act** 是一个 Go 写的命令行工具：它读仓库里的 `.github/workflows/`，按 `needs` 排成串行 stage，再用 Docker API 给每个 job 起容器，在本机把 step 跑完。日常类比：GitHub-hosted runner 是中央厨房；act 是把同一份菜谱拿到自己灶台试做——火候和酱料库存都不保证一致，但改 yaml 不必先 push。

```bash
act -l                 # 列出当前事件能跑的 job
act -j lint            # 只跑一个 job
act pull_request -n    # 用 pull_request 事件做 dry-run，不建容器
```

固定 `v0.2.89`（`VERSION` 文件与 annotated tag 一致，Go `1.25.0`，MIT）把默认事件写成 `push`：没传事件名时，若仓库只声明了一种事件就用那种，否则落回 `push`。默认 actor 是 `nektos/act`。

## 为什么重要

不理解 act 的平台映射和本地服务，下面这些事会对不上：

- 为什么第一次跑会问 Large / Medium / Micro，而源码里的硬编码回退其实是 `node:16-*-slim`
- 为什么 `runs-on: macos-latest` 常常被跳过，却不是“只支持 Linux”这一句话能概括
- 为什么 `actions/cache` 在本机不再是无声跳过——固定版本默认会起本地 cache server
- 为什么没写 `GITHUB_TOKEN` 时，它会去找本机的 `gh auth token`

## 核心要点

固定版本可以拆成四层：

1. **Planner 先排图**：`Plan` 是一串 `Stage`，同一 stage 里的 job 并行，stage 之间串行。`createStages` 按 `needs` 把依赖已经入图的 job 收进下一 stage；成环就报无法建图。

2. **平台映射决定要不要起容器**：`newPlatforms()` 的硬编码表把 `ubuntu-latest` / `20.04` / `18.04` 指到 `node:16-buster-slim`，`ubuntu-22.04` 指到 `node:16-bullseye-slim`。第一次若命令行没有 `-P`，会用 survey 把 Large（`catthehacker/ubuntu:full-*`）、Medium（`act-*`）或 Micro（上面那组 `node:16`）写进 XDG 配置 `act/actrc`。`runs-on` 对不上任何镜像时，job 被跳过并提示 `-P <platform>=...`。映射成 `-self-hosted` 且没有 job `container:` 时，走宿主机 `HostEnvironment`，不另起 Linux 容器。

3. **Step 按 action.yml 分派**：`run:` 进 `stepRun`；`uses:` 本地 / 远程 action 分别进 local/remote；`docker://` 进 `stepDocker`。远程 action 读 `action.yml` / `action.yaml`，`runs.using` 只接受 `node12` / `node16` / `node20` / `node24` / `docker` / `composite`。默认会跳过本仓库的 `actions/checkout`，因为工作区已经拷进容器；`--no-skip-checkout` 才真跑 checkout。

4. **本地附属服务默认开 cache**：除非 `--no-cache-server` 或环境里已有 `ACTIONS_CACHE_URL`，否则会在本机起 `artifactcache` handler，并把 `ACTIONS_CACHE_URL` 指过去。artifact server 只有给了 `--artifact-server-path` 才启动。`services:` 会按 job 定义拉镜像并清理。

## 实践示例

### 案例 1：列出并只跑一个 job

```bash
act -l
act -j lint
```

没传事件名时，过滤计划和真正执行都走上面的事件规则。`-n` / `--dryrun` 只校验 workflow，不建容器。

### 案例 2：第一次选镜像，或自己写 `-P`

```bash
# 无 -P 且还没有可解析的平台配置时，交互问卷写入 XDG act/actrc
# Medium 对应 catthehacker/ubuntu:act-*；Micro 才是 node:16-*-slim

act -P ubuntu-latest=catthehacker/ubuntu:act-latest -j ci
```

配置文件按顺序读：XDG `act/actrc`、`$HOME/.actrc`、当前目录 `.actrc`，再拼命令行参数。

### 案例 3：secrets 与 token

```bash
act -j publish --secret-file .secrets
# 或 -s GITHUB_TOKEN 从环境读；缺值时交互输入
```

默认 secret 文件是 `.secrets`。若 map 里还没有 `GITHUB_TOKEN`，会调用本机 `gh auth token`；找不到 `gh` 或命令失败就得到空串。

### 案例 4：Apple Silicon 上的架构提示

```bash
act -j ci --container-architecture linux/amd64
```

darwin/arm64 且未指定架构时，日志会警告“可能遇到问题，可试 `linux/amd64`”。默认仍用宿主机架构，不是强制 amd64。

## 踩过的坑

1. **把 Medium 问卷结果当成源码默认值**：没跑过 survey、也没写 `-P` 时，回退镜像是 `node:16-buster-slim`，不是 `catthehacker/ubuntu:act-latest`。`node:16-*-slim` 没有 Python。
2. **以为 `actions/cache` 本地一定被跳过**：固定版本默认起 cache server。要关掉用 `--no-cache-server`。命中率、和 GitHub 云端 cache 是否互通，本文未跑。
3. **macos / windows job 不是默认就能跑**：没有对应 `-P` 映射时直接 skip。Windows 测试里把 `windows-latest` 标成 `-self-hosted` 才会走宿主机路径。
4. **默认会 pull / rebuild**：`--pull` 与 `--rebuild` 默认都是 true；`--action-offline-mode` 会关掉强制 pull。
5. **默认网络是 `host`**：`--network` 默认 `host`，和 GitHub-hosted 的 bridge 拓扑不是同一份合同。
6. **`.secrets` 不要进 git**：明文 token 进历史就无法收回。

## 适用 vs 不适用场景

**适用**：

- 改 workflow 语法、`needs`、条件与 step 顺序，想先在本机看到解析/执行路径
- 把同一份 yaml 当本地 task runner（README 也这么写）
- 需要本机 cache / artifact 端点做联调，而不是假设它们不存在

**不适用**：

- 要证明 GitHub-hosted runner 上的真实结果——镜像、网络、权限都不是同一份
- 依赖 macos / Windows hosted runner，却没有对应 `-P` 或 `-self-hosted` 映射
- 把问卷文案里的 17GB / 500MB / 200MB 或任何未测耗时写成选型结论
- 需要 OIDC / deploy token 等云端身份，本机 `gh auth token` 填不上的场景

## 固定版本边界

- 本文绑定 `nektos/act@4f411281417e88660bea1c1a1749aa71ae0bd60f`，annotated tag `v0.2.89` 剥开后即此提交；`VERSION` 为 `0.2.89`。
- 模块 `github.com/nektos/act`，`go 1.25.0`，MIT。
- 硬编码平台表见 `cmd/platforms.go`；问卷写入见 `defaultImageSurvey`。
- 默认：事件 `push`、actor `nektos/act`、secret 文件 `.secrets`、网络 `host`、cache server 开启、checkout 可跳过。
- 本文未安装 Docker、未跑任何 workflow、未测镜像体积或耗时，状态保持 `UNVERIFIED`。

## 学到什么

1. **“本地 CI”首先是平台映射表**——没有镜像的 `runs-on` 会被跳过，不是被模拟成 GitHub 虚机。
2. **问卷默认和源码回退不是同一条合同**——Medium 写 `act-*`，硬编码回退是 `node:16-*-slim`。
3. **附属服务会跟着版本变**——cache server 从“没有”变成默认开启，旧教程会写反。
4. **token 有三条来源**：`--secret` / secret 文件 / `gh auth token`，都不是 GitHub 自动签发的 `GITHUB_TOKEN`。

## 应用型自测

1. 不传 `-P`、也不走问卷时，`ubuntu-latest` 会用哪张镜像？
2. 固定版本里，`actions/cache` 是不是只能无声跳过？
3. 没在 secret 文件里写 `GITHUB_TOKEN` 时，act 还会去哪找？

检查点：

1. `node:16-buster-slim`（`cmd/platforms.go` 硬编码表）。
2. 不是。默认会起本地 cache server，除非 `--no-cache-server` 或已有 `ACTIONS_CACHE_URL`。
3. 调用本机 `gh auth token`；失败则 token 为空串。

## 延伸阅读

- 官方文档：[nektosact.com](https://nektosact.com)
- 固定源码：[nektos/act](https://github.com/nektos/act) —— 本文绑定提交 `4f411281417e88660bea1c1a1749aa71ae0bd60f`
- 镜像清单：仓库 `IMAGES.md` 与 [catthehacker/docker_images](https://github.com/catthehacker/docker_images)
- [[actions-runner-controller]] —— 云上自托管 runner；act 是本机路径
- [[earthly]] —— 另一条“构建步骤容器化”路线

## 关联

- [[actions-runner-controller]] —— ARC 解决“云上自托管 runner”，act 解决“本地 runner”
- [[docker]] —— job 容器默认走 Docker API
- [[github-actions]] —— act 复现的是 Actions workflow 合同，不是 hosted runner 硬件

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

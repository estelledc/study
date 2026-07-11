---
title: act — 在本地用 Docker 跑 GitHub Actions
来源: https://github.com/nektos/act
日期: 2026-05-31
分类: DevOps / CI 基建
难度: 入门
---

## 是什么

**act** 是一个命令行工具：你在仓库里跑一句 `act`，它就把 `.github/workflows/` 下的 yml 解析出来，用 Docker 起容器把每个 job **在你本地电脑上跑一遍**。不需要 push，不需要开 PR，不消耗 GitHub Actions 配额。

日常类比：

- 平时改 workflow 像**改菜谱**——你只能把菜谱寄到中央厨房（GitHub），等他们做完发回照片告诉你哪一步翻车了。一次 5 分钟，改 10 次就是 50 分钟全在等。
- act 像**自己家厨房**——同一份菜谱，自己起锅，30 秒看到结果，还能边做边尝味道。
- 厨房和中央厨房不完全一样（缺某些品牌酱料、火候略有差异），但 80% 的食谱在家试就够。

截至 2026-05，act 在 GitHub 上约 7 万 star，Go 写的，最早由 Casey Lee 在 2019 年开源。

## 为什么重要

不用 act，下面这些场景就只能"push 一次等 5 分钟"：

- **改 workflow 语法**——少一个冒号、缩进错一格，必须 push 才知道。CI 跑红了再改一遍，commit 历史里塞满 `fix ci` `fix ci again` `please work`
- **本地通过 / CI 失败**——最难调的一类 bug。act 让你在和 CI 几乎一样的容器里复现，把锅甩给"环境差异"还是"代码差异"先分清楚
- **Actions 配额省钱**——开源仓免费但有总额上限；私有仓按分钟计费。act 把"试错"环节从云上挪到本地
- **当本地 task runner**——有人把 act 当 Makefile 替代：复杂构建任务写在 yml 里，本地用 act 跑，CI 也跑同一份 yml，**两边一致**

## 核心要点

act 的工作分 **三步**：

1. **解析 workflow**：读 `.github/workflows/*.yml`，把 job 之间的 `needs:` 依赖排成拓扑序，决定先跑谁
2. **起容器**：每个 job 启一个 Docker 容器，镜像默认是 `catthehacker/ubuntu:act-latest`（社区维护的"接近 GitHub-hosted"镜像）
3. **执行 step**：把 step 翻译成容器里的 shell 命令；actions/checkout、actions/setup-node 这类常见 action 会被 act 下载到容器内，再按各自的 JavaScript / composite / Docker 入口执行

镜像分三档（**装多大决定能跑多接近真实环境**）：

- **micro**（约 200 MB）：只有 NodeJS。装最快，但绝大多数 action 会因为缺 python/git/make 失败
- **medium**（约 500 MB）：默认推荐。NodeJS + 常用工具，覆盖 80% 场景
- **large**（约 17 GB）：含 Python / Ruby / Java / Go / .NET，最接近 GitHub-hosted runner，但下载半天

## 实践案例

### 案例 1：第一次跑（macOS）

```bash
# 装 act（前提已装 Docker Desktop 并运行）
brew install act

# 进入任意有 .github/workflows/ 的仓库
cd my-repo

# 列出能跑的 job
act -l

# 跑默认 push 事件下的所有 job
act
```

第一次跑会问你选 micro / medium / large——选 medium 即可，存到 `~/.actrc` 下次不再问。

### 案例 2：只跑某个 job（最常用）

```bash
# 只跑 lint job
act -j lint

# 只跑 lint，且不真的执行（dry-run，看会发生什么）
act -j lint -n

# 模拟 PR 事件而非 push
act pull_request -j ci
```

这是日常 80% 的用法——改了 lint 配置，本地一句 `act -j lint` 验完再 commit。

### 案例 3：处理 secrets 和 token

```bash
# 创建 .secrets 文件（不要 commit！加到 .gitignore）
cat > .secrets <<EOF
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxx
NPM_TOKEN=npm_xxxxxxxxxxxxxxxx
EOF

# 跑 job 时挂上
act -j publish --secret-file .secrets
```

`GITHUB_TOKEN` 本地默认是空字符串，凡是 step 调 GitHub API 都会 401。生成一个 PAT（Personal Access Token）填进去就解决。

### 案例 4：Apple Silicon 必踩的坑

```bash
# M 系列 Mac 上默认会 exec format error，因为 act 的镜像是 amd64
act -j ci --container-architecture linux/amd64

# 或者写到 ~/.actrc 里一劳永逸
echo "--container-architecture linux/amd64" >> ~/.actrc
```

QEMU 模拟会慢一点（50%-70% 原速），但能跑通。等 act 官方出 arm64 镜像（社区已有 PR）这事就不是事。

## 踩过的坑

1. **`actions/cache` 本地不工作**：GitHub 自家 cache 后端在云上才有，本地 act 跑到这一步会直接跳过（不是报错，是无声跳过）。如果你的 workflow 重度依赖 cache，本地跑的耗时不能直接对比 CI

2. **`act-latest` 不等于 `ubuntu-latest`**：catthehacker 镜像是社区按 GitHub 实际镜像反推维护的，工具版本经常**滞后一两周**。CI 上有但本地没有的工具，多半是这个原因

3. **macOS / Windows runner 跑不了**：act 只支持 Linux runner。workflow 里 `runs-on: macos-latest` 的 job 只能跳过或 mock

4. **服务容器（`services:`）有时行为偏离**：跑 PostgreSQL / Redis 这类边车的 step 大多数能用，但网络名称解析和 port mapping 偶尔和 GitHub-hosted 不一致，调出问题要去 act 的 issue 里查

5. **`.secrets` 千万别 commit**：明文 token 进 git 历史就完了。第一件事就是加 `.gitignore`

## 适用 vs 不适用场景

**适用**：

- 改 workflow yml 的语法、step 顺序、condition 逻辑
- 调试"CI 红 / 本地绿"的环境差异问题
- 不想消耗 Actions 配额（开源仓 minutes 见底 / 私有仓压成本）
- 把 GitHub Actions 当本地 task runner（一份 yml 双用）

**不适用**：

- 完全验证一个 workflow 在 GitHub-hosted 上的真实表现（环境永远有差异）
- 依赖 macOS / Windows runner 的工作流
- 重度依赖 `actions/cache` 想测命中率
- 涉及 GitHub API 高级权限（OIDC、deploy token 等）的 step

## 历史小故事（可跳过）

- **2019 年**：Casey Lee 开源 act，最初解决的就是"改 GitHub Actions workflow 必须 push 才能试"这个痛点。
- **2020-2021 年**：GitHub Actions 普及后，act 成为很多开源项目调试 CI yaml 的本地工具。
- **2022 年**：社区维护的 runner 镜像逐渐分出 micro / medium / large，解决"镜像太小跑不动、镜像太大下载慢"的取舍。
- **2024 年以后**：更多团队把 act 当成本地 task runner 的兜底校验：复杂任务写一份 workflow，本地和云上共用。

## 学到什么

1. **CI 调试的反馈循环可以从 5 分钟压到 30 秒**——只要愿意装个 Docker
2. **本地复现 ≠ 完全等价**——act 是高保真模拟，不是真机。把它当"先粗筛 80%"，最后一关还是 push 上去看
3. **CI yaml 也是代码**——值得本地跑、值得测试、值得 review。act 让这件事第一次成为可能
4. **Docker 是 CI 抽象的隐形地基**——GitHub-hosted runner、ARC、act，三套不同形态的"工人"，底下都是容器

## 延伸阅读

- 官方文档：[nektosact.com](https://nektosact.com)（installation / known issues / image variants 在这里）
- 镜像仓库：[catthehacker/docker_images](https://github.com/catthehacker/docker_images)（act 默认镜像怎么造的）
- [[actions-runner-controller]] —— 让 GitHub Actions 在你自己的 K8s 上跑（云上版自托管，act 是本地版）
- [[earthly]] —— Earthfile 把构建步骤容器化，思路相近但范围更大

## 关联

- [[actions-runner-controller]] —— ARC 解决"云上自托管 runner"，act 解决"本地 runner"，两条互补的"不用 GitHub-hosted"路径
- [[docker]] —— act 的全部魔法都建立在 Docker 之上
- [[github-actions]] —— act 是 Actions 生态的本地复现工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

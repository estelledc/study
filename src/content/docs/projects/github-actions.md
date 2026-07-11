---
title: GitHub Actions — 仓库自带的 CI/CD 流水线
来源: https://docs.github.com/en/actions
日期: 2026-05-31
分类: DevOps / CI-CD
难度: 入门
---

## 是什么

GitHub Actions 是 **GitHub 仓库内置的自动化流水线**——你在仓库里放一个 `.github/workflows/ci.yml`，每次 push、提 PR、定时、或手动点按钮，GitHub 就**起一台干净的虚拟机**，照着 yml 跑测试、打包、部署。

日常类比：

- **以前**写完代码要自己敲 `npm test`、本地打包、scp 到服务器——像每次做菜都要先洗锅、烧水、切菜。
- **Actions** 是"装在厨房里的机器人"：菜谱（yml）写好后，每次你把食材（commit）放进料理台，机器人自动洗锅、烧水、切菜、上桌。

它 2019 年正式发布，现在是 GitHub 上**默认 CI/CD 选择**——开源项目几乎清一色用它。

## 为什么重要

理解 Actions 是理解"现代代码协作"的入口：

- **零集成成本**：和 GitHub 仓库同源，不像 Jenkins 还要自己装服务器、配 webhook
- **Marketplace 生态最大**：`uses: actions/checkout@v4` 一行就能复用别人写好的 step
- **self-hosted runner 能接内网**：公司内部机器、ARM/GPU 等异构硬件、合规环境都能跑
- **同一套语法覆盖开源与企业**：hosted 给个人/公开仓，self-hosted 给内网与特殊硬件，不必学两套 CI

## 核心要点

Actions 的设计可以拆成 **四层概念**：

1. **三级层级 workflow > job > step**：一个 yml 文件 = 一个 workflow；workflow 含若干 job（默认并行）；每个 job 在一台 runner 上跑一串 step。
2. **事件驱动**：`on: push`、`on: pull_request`、`on: schedule`（cron）、`on: workflow_dispatch`（手动）——任何 GitHub 事件都能触发。
3. **两层 runner**：
   - hosted —— GitHub 提供 ubuntu/windows/macos VM，每次 job 一个干净环境，公开仓免费、私有按分钟计
   - self-hosted —— 自己机器跑 runner agent（一个常驻进程，向 GitHub 拉任务），企业内网/特殊硬件用
4. **Action = 复用单元**：三种打包方式（JavaScript / Docker container / Composite），从 Marketplace 用 `uses:` 引入。

## 实践案例

### 案例 1：5 行实现"每次 push 跑测试"

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm test
```

push 一次，GitHub 起一台 Ubuntu，checkout 你的代码，装 Node 20，跑 `npm test`。**全程不要你自己的服务器**。

### 案例 2：matrix 一次跑多组合

```yaml
jobs:
  test:
    strategy:
      matrix:
        node: [18, 20, 22]
        os: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

这一段会**并行起 6 台机器**（3 Node 版本 × 2 OS），同时跑测试。开源库验证兼容性的标准写法。

### 案例 3：jobs 之间串联 + 传文件

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with: { name: dist }
      - run: ./scripts/deploy.sh
```

`needs: build` 让 deploy 等 build 完；`upload-artifact` + `download-artifact` 跨 job 传文件（默认每个 job 是干净 VM，文件不互通）。

### 案例 4：self-hosted runner 接内网

```yaml
jobs:
  internal-deploy:
    runs-on: [self-hosted, linux, x64, gpu]
    steps:
      - run: nvidia-smi
      - run: ./train.sh
```

`runs-on` 写一组 label，GitHub 调度器找匹配的 self-hosted 机器跑。常见双层用法：hosted 跑公开测试，self-hosted 跑需要内网/GPU 的真实部署。

## 踩过的坑

1. **hosted runner 不是常驻**——每次 job 起一个全新 VM，跑完销毁。所以"上次装的依赖、生成的缓存文件"**默认全没了**。要复用就得 `actions/cache@v4`。

2. **secrets 在日志里被遮但不绝对安全**——`echo $SECRET` 会显示 `***`，但 `echo $SECRET | base64` 输出的 base64 串**不会**被遮，可能泄露。

3. **GITHUB_TOKEN 默认权限太宽**——`GITHUB_TOKEN` 是 Actions 自动注入每个 job 的临时凭证（job 跑完即失效）。很多老 workflow 没写 `permissions:` 字段，token 默认有写权限，供应链攻击常见入口。最佳实践：文件顶部写 `permissions: { contents: read }` 然后按需放宽。

4. **concurrency 漏配 = 同分支重复跑**——快速连推两次 commit，会同时起两个 workflow，浪费配额还可能 deploy race。要加 `concurrency: { group: ${{ github.ref }}, cancel-in-progress: true }`。

5. **uses 不锁版本会被供应链攻击**——`uses: someone/action@main` 任何时候都拉最新，对方仓库被劫持你就中招。锁 SHA 才稳：`uses: someone/action@a1b2c3d`。

## 适用 vs 不适用场景

**适用**：

- GitHub 上的开源/私有项目（零集成成本）
- 跨平台测试矩阵（hosted 直接给 ubuntu/win/mac）
- 接受 SaaS 调度的中小型团队
- 混合场景：公开 CI 用 hosted、内网部署用 self-hosted

**不适用**：

- 不在 GitHub 上的代码（用 GitLab CI / Bitbucket Pipelines）
- 需要 5h+ 单 job 任务（hosted 上限 6h，紧张时容易超）
- 极重的并发（hosted 配额按账户级别，free 20 路、pro 40 路，企业更多）
- 严格物理隔离/不允许任何外部 SaaS 调度的环境（即便 self-hosted runner，调度还是 GitHub）

## 历史小故事（可跳过）

- **2018**：GitHub 宣布 Actions，把 CI 直接嵌进仓库事件模型。
- **2019**：正式 GA；Marketplace 与官方 `actions/*` 成为默认复用入口。
- **之后**：self-hosted runner、Reusable Workflow、更细的 `permissions` 陆续补齐企业与安全需求。
- **今天**：开源仓几乎默认用它；安全讨论焦点转向 `pull_request_target`、未锁 SHA、过宽 token。

## 学到什么

1. **CI/CD 不是单独工具，而是仓库的延伸**——Actions 把"代码 + 流水线"绑到同一个 repo，PR 直接看绿勾红叉
2. **hosted + self-hosted 的双层是关键设计**——前者解决"懒得维护"，后者解决"必须自己控"，两者一套语法
3. **复用走 Action / Composite / Reusable Workflow 三条路**：单 step 抽成 Action，一组 step 抽成 Composite，整个 job 抽成 Reusable Workflow
4. **流水线即代码**——yml 进 Git，每次改流水线本身也走 PR review，避免"运维同学昨晚偷偷改了脚本谁也不知道"

## 延伸阅读

- 官方文档：[GitHub Actions Docs](https://docs.github.com/en/actions)（最权威，按事件/runner/secrets 三条主线读）
- 官方仓库：[actions/checkout](https://github.com/actions/checkout) / [actions/cache](https://github.com/actions/cache)（最常用两个 action，源码不长可读）
- Awesome Actions：[sdras/awesome-actions](https://github.com/sdras/awesome-actions)（社区精选 action 列表）
- 安全最佳实践：[GitHub Security Lab — Actions](https://securitylab.github.com/research/github-actions-untrusted-input/)（pwn-request 等典型攻击面）

## 关联

- [[argocd]] —— Actions 负责 build+test，ArgoCD 负责 deploy；GitOps 双流水线
- [[ansible]] —— Actions 经常调 Ansible 做配置管理 + 部署
- [[docker]] —— Actions 的 container action 和 hosted runner 都基于 docker
- [[gitlab]] —— 不在 GitHub 时的常见对照：GitLab CI
- [[jenkins]] —— 自建 CI 老路线；Actions 用仓库内 yml 换掉大部分服务器运维

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

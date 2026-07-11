---
title: Jenkins — 老牌开源 CI 服务器
来源: https://github.com/jenkinsci/jenkins
日期: 2026-05-31
分类: DevOps / CI/CD
难度: 中级
---

## 是什么

Jenkins 是一个**长期跑在服务器上、帮你自动跑构建/测试/部署任务**的工具。

日常类比：

- **没有 Jenkins**像自己烧饭：每次写完代码，自己手动 `mvn test` → 自己 `docker build` → 自己 `kubectl apply`。一步错全步错，回家加班。
- **有了 Jenkins**像点外卖：你只要把"菜单"（Jenkinsfile）放进 Git 仓库，Jenkins 看到代码改了，自己照菜单一道道做，做完把结果（成功/失败/日志）发到群里。

它由 Kohsuke Kawaguchi 在 Sun Microsystems 内部启动（前身 Hudson，2004 年），2011 年因 Oracle 商标争议社区 fork 出 Jenkins，从此 Hudson 凋零、Jenkins 成为开源 CI 的代名词。

## 为什么重要

不理解 Jenkins，下面这些事都不好解释：

- **CI/CD 的工程化雏形**——2004 年还没有 GitHub Actions / GitLab CI；同期虽有 CruiseControl 等，Hudson/Jenkins 很快成为早期开源 CI 的事实标准之一，今天很多 CI 概念是它带出来的
- **插件即生态**——1800+ 插件，不管你用什么构建工具/版本控制/部署目标，大多能找到一个插件粘上
- **Pipeline as Code**——把流水线写成 Jenkinsfile 进 Git，CI 流程也能 PR review，2016 年这个范式被 Jenkins 推上主流
- **企业仍然在跑**——新项目越来越选 GitHub Actions，但企业自托管 CI 里 Jenkins 仍很常见（银行、车厂等存量），懂它仍是 DevOps 硬通货

## 核心要点

Jenkins 的设计可以拆成 **三个层次**：

1. **调度器 + 执行器（master/agent 架构）**：master 节点管 UI、配置、调度；构建任务派给 agent 节点跑。类比：餐厅经理（master）接单 + 写菜单，后厨（agent）做菜。

2. **插件机制（一切皆插件）**：连"从 Git 拉代码"这种基本能力都是插件实现的。好处是扩展性极强；代价是插件互相依赖，升级一个能拖崩一片。

3. **Pipeline DSL（Jenkinsfile）**：用 Groovy 写一个文本文件描述 build → test → deploy 的所有 stage，这个文件进 Git 仓库。流水线本身被版本化，回滚、code review、对比都能做。

三者加起来：**调度 + 扩展 + 流水线即代码** = 企业 CI 事实标准。

## 实践案例

### 案例 1：最小 Jenkinsfile

```groovy
pipeline {
  agent any
  stages {
    stage('Build') { steps { sh 'mvn -B clean package' } }
    stage('Test')  { steps { sh 'mvn test' } }
    stage('Deploy'){ steps { sh './deploy.sh' } }
  }
}
```

**逐字段解读**：

- `agent any` → 随便挑一个 agent 跑，不挑机器
- `stages` → 流水线分阶段，每个 stage 单独显示在 UI 上
- `sh '...'` → 在 agent 上执 shell 命令，跟你在本地敲一样

把这个文件放进仓库根目录，Jenkins 配 multibranch job 指过去，每次 push 自动跑。

### 案例 2：多分支 Pipeline

配一个 multibranch pipeline job，Jenkins 自动发现 Git 仓库**所有分支和 PR**，每个分支独立跑自己的 Jenkinsfile：

- 主干 push → 跑完整 5 stage
- 功能分支 → 只跑 build + test
- PR → 必须绿才允许合并

不用为每个分支手配 job，新人开 feature 分支就自动有 CI 跑。

### 案例 3：跨环境部署门禁

declarative pipeline 的 `input` step 让流水线**停下来等人审批**：

```groovy
stage('Deploy to Prod') {
  when { branch 'main' }
  input {
    message "确认部署到 prod？"
    submitter "alice,bob"  // 只有这俩人能批
  }
  steps { sh './deploy-prod.sh' }
}
```

dev 自动部、staging 等一人审、prod 等双人审 + 工作时间窗口——declarative 的 `when / input / options` 三件套全能写。

## 踩过的坑

1. **Groovy sandbox 拦你**：Jenkinsfile 跑在 Groovy sandbox 里，很多 Java API 默认禁用。第一次写复杂逻辑常被 `RejectedAccessException` 挡下，要么管理员去 "Manage → In-process Script Approval" 批准，要么改用 shared library（推荐）。

2. **插件依赖地狱**：升级一个插件可能拖崩另一个；老插件年久失修但又被生产 Pipeline 依赖。建议固定 Jenkins LTS 版本 + 用 plugin manager 锁版本，不要随便点 "Update All"。

3. **master 单点 + 性能瓶颈**：所有调度、UI、配置、构建队列都压在 master JVM 上。scripted pipeline 里写复杂循环（如 1000 次 `sh`）会把 master CPU 打爆——因为每个 step 都是在 master 解析的。改 declarative + 用 `parallel` 放 agent。

4. **配置漂移**：job、credentials、global tools 默认存在 master 文件系统的 XML 里，**不进 Git**。多人手改 Web UI 容易丢历史。解法：装 JCasC（Configuration as Code）插件 + Job DSL，把所有配置声明式化进仓库。

## 适用 vs 不适用场景

**适用**：

- 已有大量遗留 Pipeline 的企业，迁移成本高于继续跑
- 需要跑在自己机房/内网（不能用 GitHub Actions 公有云 runner）
- 构建任务异构（Java + Python + iOS + 嵌入式 + Windows 都要跑）——Jenkins 多 agent 异构最强
- 团队有专职 CI 运维，能 hold 住插件升级和配置漂移

**不适用**：

- 全新小团队：直接 GitHub Actions / GitLab CI，省运维
- 全云原生 K8s：用 Tekton / Argo Workflows 更顺
- 没人愿意学 Groovy：Jenkinsfile 不是写 yaml，调试报错恶心

## 历史小故事（可跳过）

- **2004 年**：Kohsuke Kawaguchi 在 Sun 内部启动 Hudson，给自己团队跑 Java CI 用。
- **2008 年**：Hudson 开源，迅速成为 Java 圈 CI 默认选择。
- **2011 年**：Oracle 收购 Sun 后争 Hudson 商标，社区 fork 为 Jenkins，从此 Hudson 凋零。
- **2016 年**：Pipeline-as-Code（Jenkinsfile）引入，CI 流程进 Git 仓库变成主流范式。
- **2018 年**：Jenkins X 项目尝试转向 Kubernetes 原生，但反响一般，主线还是经典 Jenkins。
- **2024 年前后**：企业自托管 CI 里仍很常见，份额持续被 GitHub Actions 等蚕食，但插件生态规模仍难被追上。

## 学到什么

1. **插件机制是双刃剑**——扩展性赢了 20 年市场，依赖地狱也跟了 20 年
2. **Pipeline as Code 是范式胜利**——把流水线版本化进 Git，今天看是常识，2016 年是革命
3. **master/agent 架构的分布式权衡**——调度集中带来一致性，但 master 也是单点；后来的 K8s 原生 CI（Tekton）就是冲这个去的
4. **存量 vs 新选**——技术栈选择不是看谁最新，是看你的团队能 hold 多少运维负担

## 延伸阅读

- 官方文档：[jenkins.io/doc](https://www.jenkins.io/doc/)（Pipeline 语法 + 插件目录都在这）
- Pipeline 语法手册：[jenkins.io/doc/book/pipeline/syntax](https://www.jenkins.io/doc/book/pipeline/syntax/)
- JCasC 插件：[jenkinsci/configuration-as-code-plugin](https://github.com/jenkinsci/configuration-as-code-plugin)（声明式管理 Jenkins 配置）
- 对比综述：[Jenkins vs GitHub Actions vs GitLab CI](https://www.jenkins.io/blog/2023/02/14/jenkins-vs-github-actions/)
- 入门书：[Jenkins: The Definitive Guide](https://www.oreilly.com/library/view/jenkins-the-definitive/9781449311551/)（覆盖到 Pipeline 范式之前，但调度/插件/agent 概念依然适用）

## 关联

- [[github-actions]] —— 新一代 SaaS CI，仓库内嵌、yaml 写流水线，Jenkins 主要竞争者
- [[ansible]] —— 配置管理工具，常被 Jenkins 流水线调用做部署
- [[terraform]] —— 基础设施即代码，Jenkins 流水线触发 `terraform apply` 是常见模式
- [[helm]] —— Jenkins 部署到 K8s 时常调用 `helm upgrade` 推 chart
- [[kubernetes]] —— Jenkins 也可以让 agent 在 K8s 上动态起 Pod 跑构建（kubernetes-plugin）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[backstage]] —— Backstage — 把公司散在各处的开发工具拼成一个门户
- [[dagger]] —— Dagger — 用真正的编程语言写 CI pipeline
- [[github-actions]] —— GitHub Actions — 仓库自带的 CI/CD 流水线
- [[tekton]] —— Tekton — 把 CI/CD 流水线当成 K8s 资源来声明

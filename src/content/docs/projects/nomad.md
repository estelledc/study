---
title: Nomad — HashiCorp 出的"轻量版 K8s"工作负载调度器
来源: https://developer.hashicorp.com/nomad/docs
日期: 2026-05-31
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Nomad 是 HashiCorp 2015 年发布的**工作负载编排器**——简单说，就是"你给它一堆机器和一堆要跑的程序，它替你决定哪个程序跑在哪台机器上"。

日常类比：像高峰期的航班调度员。航班（job）要起飞，机位（节点）数量有限。调度员看每个航班需要的跑道长度（CPU/内存）、哪些机位空着，然后把航班分配下去。Nomad 就是这个调度员，只不过对象从飞机换成了你的服务进程。

最直观的特征是**一个二进制**：下载一个约 100MB 的可执行文件，加 `-server` 参数就是 server，加 `-client` 参数就是 worker 节点。对比 Kubernetes 要装 etcd / kube-apiserver / kubelet / kube-proxy / controller-manager 一堆组件，Nomad 的安装门槛低得多。

## 为什么重要

不了解 Nomad，就只看到 Kubernetes 一种调度思路。Nomad 代表了另一条路线：

- **不强制容器化**——你的老 Java jar、Python 脚本、甚至 C++ 二进制都能直接调度，不用先 Docker 化
- **配置极简**——一份 HCL 文件就能描述完整 job，没有 K8s 那种 Deployment + Service + Ingress + ConfigMap 一堆 YAML
- **多区域天然**——HashiCorp 把"跨数据中心 federation"做进了核心，K8s 多集群至今还在演进
- **思路对照**——K8s 来自 Google Borg 学院派，Nomad 来自 HashiCorp 工程派，知道两者差异才能选对工具

学完它你会理解：编排器不是只有 K8s 一种长相。

## 核心要点

Nomad 的世界观由三层嵌套构成：

1. **Job**：你想跑的"东西"的最外层描述。一份 HCL 文件 = 一个 job。
2. **Group**：job 里可以有多个 group，每个 group 是一组**永远在同一节点上**的 task 集合。类比一个 Pod。
3. **Task**：最小单位，对应一个真实进程。每个 task 选一个 **driver**（docker / exec / java / qemu / raw_exec）来决定怎么启动。

调度策略也分四种：

- **service**：长跑服务，挂了会重拉（最常见）
- **batch**：一次性任务，跑完就退（类比 cron job）
- **system**：每个 client 节点都跑一份（类比 K8s DaemonSet）
- **sysbatch**：每个节点跑一次性任务

底层用 **Raft** 做 server 之间的强一致（leader 选举 + 状态机复制），用 **Serf gossip** 做节点成员发现。调度器本身做的是 **bin packing**：把 job 塞进资源最匹配的节点，类似行李员往后备厢塞东西。

## 实践案例

### 案例 1：本机 30 秒起一个集群

```bash
nomad agent -dev
```

这一行命令就把 server + client 都起在本机，可以立刻提交 job。开发模式下数据存内存，关掉就没了，适合学习。

### 案例 2：一份最小 job 文件

```hcl
job "hello" {
  group "web" {
    count = 2
    task "server" {
      driver = "docker"
      config {
        image = "nginx:latest"
        ports = ["http"]
      }
      resources {
        cpu    = 100
        memory = 128
      }
    }
  }
}
```

提交：`nomad job run hello.nomad.hcl`。Nomad 会找两个节点各起一个 nginx，资源不够就报 placement failed。

### 案例 3：跑非容器化的旧 Java 服务

```hcl
task "legacy-app" {
  driver = "java"
  config {
    jar_path = "local/app.jar"
    args     = ["--port", "8080"]
  }
}
```

不用打 Docker 镜像，jar 包直接调度。这是 Nomad 在传统企业里的核心卖点。

## 踩过的坑

1. **HCL 不是 YAML**——缩进无意义但大括号必须成对，少一个右括号 parser 直接报 line 1 unexpected EOF，新人常被坑。
2. **默认没服务发现**——光有 Nomad 跑起来 nginx，但别的服务怎么找到它？要么起 Consul，要么用 1.3+ 的内置 `service` block。文档没强调这点，新人容易以为"装上就能用"。
3. **重启策略默认激进**——task fail 3 次就放弃，生产环境要在 group 里手动写 `restart` stanza 调宽。
4. **存储是后加的**——Nomad 自己不管 volume，要装 CSI 插件才能挂载，有状态服务的体验比 K8s StatefulSet 差。
5. **ACL 默认关闭**——任何人连上 server 都能 `nomad job run`，生产必须 `nomad acl bootstrap` 开权限，否则就是裸奔。

## 适用 vs 不适用场景

**适用**：

- 已有一堆**非容器化**的 binary / jar / 脚本要统一调度
- 团队小，不想为 K8s 维护一整套生态
- 多区域部署：Nomad 原生 federation 比 K8s 多集群方案成熟
- 混合负载：长跑服务 + 批处理 + 每节点 daemon 同时编排

**不适用**：

- 需要 K8s 生态（Helm / Operator / Istio / Prometheus Operator）
- 团队已熟 K8s，重学成本不划算
- 需要复杂的有状态编排（StatefulSet 那种序号保证）
- 你需要的工具只有 K8s 版本（很多 CNCF 项目是 K8s-only）

## 历史小故事（可跳过）

- **2015**：HashiCorp 在 HashiConf 发布 Nomad 0.1，定位为"K8s 之外的简化方案"
- **2017–2019**：长期被认为是小众，直到 Cloudflare 公开背书"我们用 Nomad 调度边缘节点"才受关注
- **2020**：Nomad 1.0 正式版，补上 namespace / quota / ACL 等企业必需特性
- **2023**：Nomad 1.6 引入 Workload Identity（原生 OIDC），弱化对 Vault 的强依赖
- **思路对照**：K8s 来自 Google Borg，论文派；Nomad 来自 HashiCorp，"工程师写给工程师用"派。两者并没有谁取代谁

## 学到什么

1. **编排器的本质是个调度器 + 一致性存储 + 节点代理**，K8s 把这三块拆得很细，Nomad 把它们捏成一个 binary。两种哲学都成立。
2. **HCL 这种"DSL 强配置语言"在 HashiCorp 全家桶里是统一的**——学一次，Terraform / Vault / Consul / Nomad 都能用。
3. **bin packing + Raft + gossip** 是分布式调度的三块基本积木，理解了 Nomad 再看 K8s 会发现思想很类似，差异主要在工程边界。
4. **轻量不等于功能少**——Nomad 能跑虚机、能跑容器、能跑裸进程，反而比只能跑容器的 K8s 更通用。
5. **选型前先想清楚边界**：要的是"调度能力"还是"K8s 生态的一切附加值"，答案不同选型就不同。

## 延伸阅读

- 官方教程：[Nomad Get Started](https://developer.hashicorp.com/nomad/tutorials/get-started)（半小时跑通本机 demo）
- 设计论文级别的对比：[Cloudflare 博客 — How we use Nomad](https://blog.cloudflare.com/how-we-use-hashicorp-nomad/)（生产规模实战）
- 与 K8s 横向对比：[Nomad vs Kubernetes 官方页](https://developer.hashicorp.com/nomad/docs/nomad-vs-kubernetes)（带偏向但事实清晰）
- [[kubernetes]] —— 主流编排器，Nomad 的对照面
- [[consul]] —— Nomad 默认搭配的服务发现组件
- [[terraform]] —— 同家公司同套 HCL 语法

## 关联

- [[kubernetes]] —— 学院派编排器，对照 Nomad 工程派
- [[consul]] —— HashiCorp 服务发现，与 Nomad 天然搭配
- [[vault]] —— HashiCorp 密钥管理，Nomad 1.6 之前重度依赖
- [[terraform]] —— 同公司基础设施即代码工具，HCL 语法同源
- [[raft]] —— Nomad server 之间的一致性算法
- [[serf]] —— Nomad 节点发现用的 gossip 协议库
- [[docker]] —— Nomad 最常用的 task driver

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[raft]] —— Raft — 易理解的共识算法
- [[vault]] —— Vault — HashiCorp 把"密码本"做成可编程基础设施
- [[woodpecker]] —— Woodpecker CI — Drone 闭源后社区接棒的轻量自托管 CI


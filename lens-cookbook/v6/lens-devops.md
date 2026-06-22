---
schema_version: 6
lens: devops
lens_id: devops
title: lens-devops
domain: lens
layer: app
status: active
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: PaaS 单团队 < $50/月；单云起步混 GPU/CPU；K8s 1.28+
ring_summary: { adopt: 13, trial: 4, assess: 0, hold: 0 }
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
wikilinks: [kubernetes, docker, prometheus, jaeger, terraform, argocd, opentelemetry, github-actions, nvidia-gpu-operator, grafana-tempo, sentry, datadog, nomad, aws-spot-best-practices]
out_of_corpus: [cloudflare-workers, fly-io, docker-compose, slurm, karpenter]
provider_coverage_checklist:
  - PaaS (Vercel/Workers/Fly)
  - Kubernetes (EKS/GKE)
  - Docker Compose (单机)
  - Nomad (HashiCorp)
  - Serverless (Lambda/Cloud Run)
sources:
  - kubernetes.io / NVIDIA GPU Operator
  - opentelemetry.io / prometheus.io
  - terraform.io
  - karpenter.sh / aws spot
  - vercel.com / fly.io / workers.cloudflare.com
open_questions:
  - PaaS 流量阶跃成本拐点缺数据
  - MIG vs time-slicing noisy neighbor 无定论
  - Spot 突变下 cost-aware HPA 决策窗口缺
  - Sentry vs OTel traces 模型未对齐
  - GitOps secret 三派各有死角
---

## 候选表

verified 2026-05-31。layer 全=app。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| Vercel | adopt | Vercel: 前端+API 单团队首选 | 月预算<$50 | app |
| Cloudflare Workers | trial | Cloudflare Workers: 边缘 KV+Durable | 边缘冷启 <50ms | app |
| Fly.io | trial | Fly.io: 全球 docker 跑 | 跨区低运维 | app |
| GH Actions | adopt | GH Actions: CI 主流 | GH 仓 | app |
| K8s | adopt | K8s: 多服务编排 | ≥5 服务 | app |
| Compose | adopt | Compose: 单机 <3 服务 | 单节点 | app |
| Nomad | trial | Nomad: 非容器混跑 | HashiCorp 栈 | app |
| Prom | adopt | Prom: metric 高频抓 | 自建监控 | app |
| OTel | adopt | OTel: 协议三件套 | 多后端 | app |
| Sentry | adopt | Sentry: error 前后端 | 用户错误 | app |
| Datadog | trial | Datadog: SaaS 不自建 | 团队 <10 | app |
| NVIDIA GPU Operator | adopt | GPU Operator: K8s GPU 暴露 | 推理+短训 | app |
| Slurm | adopt | Slurm: HPC MPI 长训 | 多节点>12h | app |
| AWS Spot | adopt | AWS Spot: 容错任务降本 | 可重入 | app |
| Karpenter | adopt | Karpenter: AWS 弹性 | EKS | app |
| Terraform | adopt | Terraform: IaC 默认 | provider 全 | app |
| ArgoCD | adopt | ArgoCD: GitOps 多集群 | 多 env | app |

## ADR 索引

**ADR-1 入口：先 PaaS 再容器化** (architecture)

### context
小项目早期上 K8s 等于自养基建团队。PaaS 抹平 CI+部署+TLS+弹性，月成本<$50 即可跑住单团队。

### decision
单团队+<100k req/天+预算<$50/月→Vercel/Fly/Workers。规模或预算破线再切 K8s。

### consequences
zero-ops 起步；vendor 绑定中度；冷启动多 50-200ms；超量后迁移成本一次性。

### rollback
月账单>$200 或日请求>500k 持续 2 周→迁 EKS+Karpenter，预留 1 sprint。

**ADR-2 观测分层** (architecture)

### context
全自建人力不够；全 SaaS 按 host 计费失控。OTel 协议层已统一。

### decision
OTel collector→Prom/Tempo/Sentry 三后端分层。

### consequences
metric 不被宰；error 复用告警；三后端运维分摊；collector 错全黑洞。

### rollback
collector P0>1h 或 Prom 维护>20h/月→切 Datadog 单后端，1-2 周。

**ADR-3 GPU 共享调参** (implementation-tuning)

### context
A100 40GB 跑多个 <8GB 推理。MIG 硬切 shape 限 vs time-slicing 无内存隔离。

### decision
mig_profile = 1g.5gb, time_slicing_replicas = 4, gpu_operator_version = 24.3。

### rationale
推理需内存隔离防 OOM；batch 容忍抖动；1g.5gb 覆盖 90% 模型。

### consequences
OOM 边界清；MIG 重配 drain ~5min；>5GB 模型进不了；nvidia-smi 失真需替换。

## 决策树

```
Q0 单团队+预算<$50/月+<100k 请求/天?
  Y→PaaS（Vercel/Fly/Workers，跳过下面）
  N→Q1
Q1 单/多机？ 单→Compose / 多→Q2
Q2 GPU？ Y→Q3 / N→Q4
Q3 长训多节点>12h？ Y→Slurm / N→K8s+GPU Op
Q4 团队<5 单云？ Y→托管 K8s+Karpenter / N→Q5
Q5 多云？ Y→TF+ArgoCD / N→单云原生
Q6 SLA<1%？ Y→on-demand+Datadog / N→spot
```

## 外迁 excludes

- sources/devops.md
- reading_list/devops.md
- getting_started/devops.md
- what_is_not/devops.md

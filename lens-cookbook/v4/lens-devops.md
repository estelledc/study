---
schema_version: 4
lens_id: devops
title: lens-devops
domain: lens
layer: app
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: 单云起步，混 GPU/CPU；K8s 1.28+
ring_summary: { adopt: 9, trial: 8, assess: 0, hold: 3 }
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
provider_coverage_checklist:
  - Kubernetes (EKS/GKE)
  - Docker Compose (单机)
  - Nomad (HashiCorp)
  - Serverless (Lambda/Cloud Run)
  - ECS/Fargate (AWS)
sources:
  - kubernetes.io / NVIDIA GPU Operator
  - opentelemetry.io / prometheus.io
  - terraform.io / pulumi.com
  - karpenter.sh / aws spot
  - argoproj.io / GH Actions ARC
open_questions:
  - OTel vs 厂商 agent cost-per-span 无 benchmark
  - MIG vs time-slicing noisy neighbor 无定论
  - Spot 突变下 cost-aware HPA 决策窗口缺
  - TF state 多团队 lock 粒度演进中
  - Sentry vs OTel traces 模型未对齐
  - GitOps secret 三派各有死角
  - K8s 跑有状态服务 operator 分裂
---

## 1. 选型铁律

1. 多机→托管 K8s；<3 服务→Compose
2. CI = GH Actions + ARC
3. 观测：Prom + Tempo + Sentry
4. GPU：推理 MIG，batch time-slicing
5. Spot：30min ckpt+3 AZ+30% on-demand
6. IaC 默认 TF；HCL 痛才 Pulumi
7. AWS 弹性 Karpenter；他云 CA

## 2. 候选表

verified 2026-05-31。layer 全 = app。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| GH Actions | adopt | CI | GH 仓 | app |
| Buildkite | trial | CI | 混部 | app |
| Jenkins | hold | 历史 | 既有 | app |
| K8s | adopt | 编排 | ≥5 服务 | app |
| Compose | adopt | 单机 | <3 服务 | app |
| Nomad | trial | 非容器 | HCorp | app |
| ECS | trial | AWS | 不上 K8s | app |
| Prom | adopt | metric | 高频 | app |
| OTel | adopt | 协议 | 三件套 | app |
| Sentry | adopt | error | 前后端 | app |
| Datadog | trial | SaaS | 不自建 | app |
| Loki | trial | 日志 | OTel | app |
| GPU Op | adopt | GPU | 推短训 | app |
| Slurm | adopt | HPC | MPI | app |
| Spot | adopt | 成本 | 容错 | app |
| Karpenter | adopt | 弹性 | AWS | app |
| CA | hold | 历史 | 非 AWS | app |
| Terraform | adopt | IaC | provider | app |
| OpenTofu | trial | fork | BSL | app |
| Pulumi | trial | 语言 | 拒 HCL | app |
| ArgoCD | adopt | GitOps | 多集群 | app |

## 3. 迷你 ADR

**ADR-1 CI GH+ARC** (vendor-selection)
## context
GH 仓，CI 跑 lint/test+GPU 推理。hosted 无 GPU；全自托要养 ops。
## decision
GH Actions 主；GPU job self-hosted+ARC。
## alternatives
Jenkins（拒：插件重）；Buildkite（拒：双控面）；CircleCI（拒：贵）。
## consequences
PR 链不断；fork PR 禁 self-hosted；回滚拆 GPU 到 Jenkins。

**ADR-2 IaC TF vs Pulumi** (vendor-selection)
## context
团队 TS/Py，HCL 意愿低。Pulumi 实 wrap TF。TF module 最厚。
## decision
TF + tflint + Atlantis；不上 Pulumi。
## alternatives
Pulumi（拒：provider 慢）；CDK（拒：仅 AWS）；CloudFormation（拒：差）。
## consequences
provider 第一波；module 开箱；HCL loop 弱；切 Pulumi 须重写 module。

**ADR-3 观测分层** (architecture)
## context
全自建人力不够；全 SaaS 按 host 计费失控。OTel 协议层已统一。
## decision
OTel→Prom/Tempo/Sentry 三后端。
## consequences
metric 不被宰；error 复用告警；三后端运维分摊；collector 错全黑洞。
## rollback
collector P0>1h 或 Prom 维护>20h/月→切 Datadog 单后端，1-2 周。

**ADR-4 GPU 何时上 K8s** (architecture)
## context
GPU 三选 SSH/Slurm/K8s。已有 K8s，长训 NCCL 调优坑多。
## decision
推理+短训→K8s+GPU Op；长训>12h 多节点→Slurm 独立。
## consequences
推理同 manifest；Slurm 不必学全；Op 与集群升级耦合。
## rollback
GPU P0>2/季 或利用率<30%→推理迁独立节点+Triton，2 周。

**ADR-5 GPU 共享调参** (implementation-tuning)
## context
A100 40GB 跑多个<8GB 推理。MIG 硬切 shape 限 vs time-slicing 无内存隔离。
## decision
mig_profile = 1g.5gb, time_slicing_replicas = 4, gpu_operator_version = 24.3。
## rationale
推理需内存隔离防 OOM；batch 容忍抖动；1g.5gb 覆盖 90%。
## consequences
OOM 边界清；MIG 重配 drain ~5min；>5GB 进不了；nvidia-smi 失真。

## 4. 决策树

```
Q1 单/多机？ 单→Compose / 多→Q2
Q2 GPU？ Y→Q3 / N→Q4
Q3 长训多节点？ Y→Slurm / N→K8s+GPU Op
Q4 团队<5 单云？ Y→托管 K8s+Karpenter / N→Q5
Q5 多云？ Y→TF+ArgoCD / N→单云原生
Q6 SLA<1%？ Y→on-demand+Datadog / N→spot
Q7 CI GPU？ Y→ADR-1 / N→hosted only
```

## 5. 缺口与待补

1. OTel vs 厂商 agent cost-per-span 无 bench
2. MIG vs time-slicing noisy neighbor 无定论
3. Spot 突变下 cost-aware HPA 缺模式
4. TF state 多团队 lock 粒度演进
5. Sentry vs OTel traces 模型未对齐
6. GitOps secret 三派各死角
7. K8s 有状态服务 operator 分裂

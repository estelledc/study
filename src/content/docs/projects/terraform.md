---
title: Terraform — 基础设施即代码
来源: https://github.com/hashicorp/terraform
日期: 2026-05-29
分类: DevOps / IaC
难度: 中级
---

## 是什么

Terraform 是 HashiCorp 2014 年用 Go 写的**「用代码描述云资源」**工具——你告诉它"我想要一台 EC2、一个 RDS、一个 VPC"，它去 AWS / GCP / Azure / 阿里云的 API 把这些资源**创建出来、改、删**。

日常类比：以前在 AWS 控制台**点 100 次按钮**才能搭一套环境（点"创建实例"→ 选 AMI → 选规格 → 选 VPC → 配安全组……）。Terraform 是把这 100 次点击改写成一份**清单**：

```hcl
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t2.micro"
}
```

然后 `terraform apply` 一键执行。下次想加 5 台？把 `count = 1` 改成 `count = 5`。想全删？`terraform destroy`。

这种"写代码描述基础设施"的方式叫 **IaC（Infrastructure as Code）**，Terraform 是它的事实标准。

## 为什么重要

不理解 Terraform，下面这些事说不清：

- 为什么大厂招人 JD 里 DevOps 岗位 80% 写"熟悉 Terraform / IaC"
- 为什么 Pulumi / OpenTofu / AWS CDK 都在**对标 Terraform**——它们的 API、文档、心智模型都源自 Terraform
- 为什么"State 文件"这个词在云原生圈出现频率极高——它是 Terraform 解决"当前状态 vs 期望状态"diff 的核心
- 为什么 2023 年 HashiCorp 改 BSL 协议会引发整个开源社区震动——Linux Foundation 直接 fork 出 [[opentofu]] 续命

## 核心要点

Terraform 的世界由 **三个核心概念** 撑起来：

1. **HCL（HashiCorp Configuration Language）**：声明式 DSL，比 JSON 易读、支持变量和表达式。你写的所有 `.tf` 文件都是 HCL。

2. **Provider（云厂商插件）**：每种云一个 provider 包，封装该云的 API。AWS provider、GCP provider、阿里云 provider……一份 HCL 通过切 provider 跨多云。

3. **State（状态文件 `terraform.tfstate`）**：JSON 格式，记录"我已经创建过哪些资源、它们的真实 ID 和属性是什么"。Terraform 每次 apply 都对比"期望状态（你的 .tf）vs 当前状态（state 文件）"，只改 diff。

记住一句话：**HCL 是输入，Provider 是手脚，State 是记忆**。

## 实践案例

### 案例 1：最小 Terraform 项目

```hcl
# main.tf
provider "aws" {
  region = "us-west-2"
}

resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t2.micro"

  tags = {
    Name = "HelloTerraform"
  }
}
```

**生命周期三步**：

- `terraform init` → 下 AWS provider 插件
- `terraform plan` → 看 diff（"我会创建 1 个 aws_instance"）
- `terraform apply` → 真去 AWS 创建实例，写入 state

### 案例 2：Module 化复用

把网络配置抽成可复用 module，三步跟做：

1. 在 `shared/network/main.tf` 写公共资源（变量 `cidr` 由调用方传入）：

```hcl
variable "cidr" { type = string }
resource "aws_vpc" "this" {
  cidr_block = var.cidr
}
```

2. 在项目 A 引用该 module：

```hcl
module "network" {
  source = "../shared/network"
  cidr   = "10.0.0.0/16"
}
```

3. `terraform init`（解析本地 module）→ `plan`/`apply`；项目 B 改 `cidr` 即可复用同一份定义。社区 module 也可在 registry.terraform.io 搜。

### 案例 3：Remote Backend（生产必备）

默认 state 存本地，多人协作会撞车。生产用 S3 + DynamoDB lock，三步启用：

1. 先建好 S3 bucket 与 DynamoDB 表（表需有 `LockID` 主键）
2. 在根模块写入 backend 块：

```hcl
terraform {
  backend "s3" {
    bucket         = "my-tf-state"
    key            = "prod/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "tf-lock"
  }
}
```

3. 跑 `terraform init -migrate-state`，把本地 state 迁到 S3；之后同一时刻只能一人 apply（DynamoDB 分布式锁）。

## 踩过的坑

1. **State 文件冲突**：多人同时 `terraform apply` → state 互相覆盖，资源记录丢失。**修法**：永远用 remote backend + lock；本地 state 只做学习用。

2. **误删生产数据**：改了 RDS 的某个属性，Terraform 判定要"销毁重建"——线上数据库被干掉。**修法**：关键资源加 `lifecycle { prevent_destroy = true }`；apply 前认真读 plan 输出，看到 `-/+` 标记（销毁重建）必须停下确认。

3. **Plan vs Apply 不一致**：plan 时显示"无变化"，apply 报错——中间云端被人手动改过。**修法**：禁止 console 改 Terraform 管的资源；定期跑 `terraform plan` 做漂移检测。

4. **版本漂移（drift）**：运维在 console 临时调了安全组，没回写 .tf。下次 apply Terraform 把它"修正"回去——人家的修复被回滚。**修法**：用 `terraform import` 把 console 改动反向同步进 .tf；或上 [Atlantis](https://www.runatlantis.io/) 强制所有改动走 PR。

5. **provider 版本锁不住**：升级 AWS provider 后某些资源属性默认值变了，无操作 plan 显示一堆 diff。**修法**：`required_providers` 块里**钉死小版本号**，升级前读 changelog。

## 历史小故事（可跳过）

- **2014**：HashiCorp 创立第三年，Mitchell Hashimoto 发布 Terraform 0.1，开源协议 MPL 2.0
- **2017**：Terraform 0.10 拆出 provider 独立仓库，生态开始爆发
- **2019**：Terraform 0.12 引入 HCL 2，支持 for/if 表达式，写起来更像编程语言
- **2021**：Terraform 1.0 stable
- **2023-08**：HashiCorp 把 Terraform 从 MPL 2.0 改成 BSL，不再算开源
- **2023-09**：Linux Foundation 等从 1.5.7 fork 出 [[opentofu]]，社区版续命
- **2024**：Terraform 1.10，原生 OCI registry + provider-defined functions

这场分叉把 IaC 圈撕成两半——大企业大多观望，社区与创业公司转 OpenTofu。

## 适用 vs 不适用场景

**适用**：

- 多人团队管云资源——所有变更走 PR + plan review，杜绝"谁手滑改了线上"
- 多云 / 多账号场景——一份 module 抽掉 provider 就能复用
- 长期运行的稳定基础设施（VPC / IAM / RDS）——state 和真实状态稳定漂移小
- 跨环境一致性（dev/staging/prod）——同一份代码走不同 tfvars

**不适用**：

- 临时 / 一次性资源——写 .tf 比开个 console 慢
- 频繁变化的应用层资源（k8s pod、lambda 代码）——交给 Helm / serverless framework 更顺
- 不能容忍偶发 drift 的强一致场景——Terraform 的 state ≠ 真相，需要监控补全

## 学到什么

1. **声明式 + state diff 是 IaC 的本质**——你写"想要的样子"，工具算"怎么变到那"
2. **state 是 Terraform 的阿喀琉斯之踵**——丢了 state 等于失忆；锁不住 state 等于互踩
3. **provider 隔离让"多云"成为可能**——上层 HCL 不变，下层换插件即可
4. **开源协议是商业护城河**——HashiCorp 改 BSL 是教科书级商业决策案例

## 延伸阅读

- 入门：[Terraform 官方 Tutorial](https://developer.hashicorp.com/terraform/tutorials)（HashiCorp Learn 平台，2-3 天能跑通基本流）
- 进阶：[Terraform: Up & Running](https://www.terraformupandrunning.com/)（Yevgeniy Brikman，Module + state + 团队协作三本最佳实践）
- 源码：`internal/terraform/` 看 graph 构建和 plan diff 算法，是 IaC 心脏
- 替代：[[opentofu]] —— 完全兼容的开源 fork

## 关联

- [[opentofu]] —— 2023 年 Terraform 改 BSL 后社区从 1.5.7 fork 出的开源版
- [[docker]] —— 容器是"应用打包"，Terraform 是"基础设施打包"，IaC 双壁
- [[kubernetes]] —— K8s 管容器编排，Terraform 管 K8s 集群本身的创建（EKS / GKE）
- [[grafana]] —— 监控也能用 Terraform 配——`grafana_dashboard` provider 把 dashboard 当资源管
- [[prometheus]] —— 同上，AWS Managed Prometheus 可以用 Terraform 拉起

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

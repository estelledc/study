---
title: OpenTofu — 社区接手的 Terraform
来源: https://github.com/opentofu/opentofu
日期: 2026-06-01
分类: DevOps / IaC
难度: 中级
---

## 是什么

OpenTofu 是 **Terraform 的开源 fork**——2023 年 8 月 HashiCorp 把 Terraform 协议从 MPL 2.0 改成 BSL（限制商业竞争者使用）后，依赖 Terraform 谋生的一批公司（Spacelift、Gruntwork、env0）联合发起，用最后一个 MPL 版本（1.5.7）作起点继续维护。

日常类比：**餐厅老板突然把『家传配方』收回去并要求加盟商再交一笔钱**，于是几个老厨师把还没改之前的配方版本拷出来，另开一家叫『同源』的店继续按老配方做菜——客人换店几乎无感。OpenTofu 就是这家『同源店』。

```bash
# 直接用 tofu 替换 terraform
brew install opentofu
cd my-terraform-project
tofu init && tofu plan
```

HCL 语法、state 文件、provider 全兼容；25k+ stars，已加入 **Linux Foundation** 治理。

## 为什么重要

不理解 OpenTofu，下面这些事都说不清：

- 为什么 2023 年下半年开源圈集体讨论『**license 突袭**』——OpenTofu 是社区翻盘的范本
- 为什么 Spacelift / env0 / Scalr 这些 Terraform 第三方平台**默认上 OpenTofu**
- 为什么 Redis fork（Valkey）、Elasticsearch fork（OpenSearch）的剧本和 OpenTofu 一模一样
- 为什么 DevOps 招聘 JD 开始写『熟悉 Terraform / OpenTofu』并列
- 为什么 Linux Foundation 这种『中立基金会』对开源治理有实际价值

## 核心要点

OpenTofu 和 [[terraform]] 关系可以一句话说清：**起点同源，独立演化，互相兼容**。

1. **完全继承 Terraform 三件套**：HCL（输入）+ Provider（手脚）+ State（记忆）。tofu CLI 命令名、参数、tfstate 格式都和 terraform 一一对应——已有项目改个二进制就能跑。

2. **HashiCorp Registry 屏蔽了 OpenTofu**：registry.terraform.io 对 tofu 客户端返 403，所以 OpenTofu 自建了 **registry.opentofu.org**，把绝大多数 provider 镜像过来。tofu init 默认走这里。

3. **OpenTofu 已反超 Terraform 的几个特性**：
   - **state 原生加密**（v1.7）：tfstate 直接 AES-GCM 加密落盘，不依赖 S3 + KMS
   - **early variable evaluation**（v1.8）：backend、module source 字段可以用变量
   - **provider for_each**（v1.9）：可以对 provider 块迭代（同一个 AWS provider 跑多 region）

4. **HashiCorp Cloud-only 功能不会有**：HCP Terraform、Sentinel 策略是闭源云产品，OpenTofu 永远不会复刻——这是 fork 的天花板。

## 实践案例

### 案例 1：从 Terraform 项目零成本迁移

```bash
# 1. 装 tofu
brew install opentofu

# 2. 进入已有 terraform 项目，无需改任何 .tf 文件
cd my-existing-tf-project

# 3. 直接 init（自动读已有的 .terraform.lock.hcl）
tofu init

# 4. plan 应该显示 0 changes
#    如果不是 0，说明 provider 版本和 lock 文件对不上
tofu plan
```

如果团队没用 HCP Terraform，迁移成本接近零。

### 案例 2：state 加密（OpenTofu 独占）

```hcl
terraform {
  encryption {
    key_provider "pbkdf2" "mykey" {
      passphrase = "a-strong-passphrase-here"
    }
    method "aes_gcm" "new_method" {
      keys = key_provider.pbkdf2.mykey
    }
    state {
      method = method.aes_gcm.new_method
    }
  }
}
```

加上这一段，tfstate 落盘前自动 AES-GCM 加密。Terraform 至 2026 年还没原生支持，得靠 S3 server-side encryption 之类的间接方案。

### 案例 3：provider for_each（OpenTofu 1.9+）

```hcl
# alias 必须是静态名；for_each 生成多个实例
provider "aws" {
  for_each = toset(["us-east-1", "eu-west-1"])
  alias    = "by_region"
  region   = each.key
}

resource "aws_s3_bucket" "logs" {
  for_each = toset(["us-east-1", "eu-west-1"])
  provider = aws.by_region[each.key]
  bucket   = "app-logs-${each.key}"
}
```

Terraform 里 provider 块通常要按 region 手写多份。OpenTofu 1.9 起可用 `for_each`；注意资源侧的 `for_each` 表达式最好与 provider 侧分开（官方推荐 `setsubtract` 做下线），否则删 region 时可能拆不掉资源。

## 踩过的坑

1. **state 加密是单向门**：用了 OpenTofu 加密的 state 文件，切回 Terraform 解不开——Terraform 不认这个加密格式。要切回必须先 `tofu apply` 把 encryption 块去掉。

2. **HashiCorp Registry 403**：tofu init 偶尔遇到 provider 在 OpenTofu registry 还没镜像（HashiCorp 新发的 provider 通常要等几天）。报错是 `Failed to query available provider packages`。

3. **Provider 协议版本对不齐**：少数 provider 升级了 gRPC plugin 协议，可能出现『terraform 跑得通、tofu 跑不通』。处理：锁 provider 版本到两边都支持的那个。

4. **不要在同一个 state 上交替用 tofu 和 terraform**：虽然 state 格式兼容，但版本号字段会被各自改写，长期混用容易出『state 文件被未知工具修改过』的告警。一个项目认准一个 CLI。

## 适用 vs 不适用场景

**适用**：

- 纯开源栈、对 license 风险敏感（金融、政府、合规场景）
- 需要 state 原生加密、provider for_each 这些 OpenTofu 独占特性
- Spacelift / env0 / Scalr 等第三方 Terraform 平台用户（这些产品默认上 OpenTofu）
- 想表达『支持开源社区』的政治信号

**不适用**：

- 重度用 HCP Terraform 云平台（远程 state、私有 module registry、Sentinel 策略）
- 公司已经买了 Terraform Enterprise license 并用上配套支持
- 需要 HashiCorp 官方 SLA 的关键业务

## 历史小故事（可跳过）

- **2014**：HashiCorp 发布 Terraform 0.1，MPL 2.0 协议
- **2023-08-10**：HashiCorp 把 Terraform、Vault、Consul 全改成 BSL，禁止商业竞争者使用
- **2023-08-25**：OpenTF Manifesto 发布，**4 天 100+ 公司签字**、36k+ GitHub 反应
- **2023-09-05**：项目启动，从 Terraform 1.5.7（最后 MPL 版本）fork 出来
- **2023-09-20**：加入 Linux Foundation，正式改名 **OpenTofu**
- **2024-01**：v1.6 首个稳定版发布
- **2024-05**：v1.7 上 state 加密，正式开始『反超』
- **2024-07**：v1.8 early variable evaluation（backend / module source 可用变量）
- **2025-01**：v1.9 provider for_each
- **之后**：持续迭代，已成为 Terraform 的真正替代品

整个抗议从『license 改了』到『社区 fork 落地基金会』只用了 **40 天**。

## 学到什么

1. **license 突袭并非不可逆**——足够大的社区 + 商业玩家联合，可以 fork 续命
2. **兼容性是 fork 成败关键**：HCL、tfstate、provider 协议一字不差，迁移成本接近零；这是 OpenTofu 能站住的最大底气
3. **基金会治理 > 单家公司**：Linux Foundation 接管让 OpenTofu 不会再被单方面改 license
4. **fork 不只是复制粘贴**：OpenTofu 在 state 加密、provider for_each 上**反超原作**——独立演化才有生命力

## 延伸阅读

- 官网：[OpenTofu Documentation](https://opentofu.org/)
- 抗议起点：[OpenTF Manifesto](https://github.com/opentofu/manifesto)（看『license 抗议』是怎么 4 天组织起来的）
- 官方对比：[What is new in OpenTofu](https://opentofu.org/docs/intro/whats-new/)
- [[terraform]] —— 直接前身，1.5.x 之前 100% 兼容
- [[pulumi]] —— 同样做 IaC，但用通用语言（TS / Python）写

## 关联

- [[terraform]] —— 起点同源；OpenTofu 是它在 BSL 之后的开源延续
- [[pulumi]] —— IaC 另一条路线：用通用语言而非 DSL
- [[crossplane]] —— 把 IaC 搬进 K8s CRD 的更激进思路
- [[ansible]] —— 配置管理工具，和 IaC 邻接但解决的是『装好软件之后怎么配』

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

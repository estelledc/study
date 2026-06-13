---
title: Pulumi — 用真正的编程语言写云资源清单
来源: https://github.com/pulumi/pulumi
日期: 2026-06-01
子分类: cloud-native
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Pulumi 是 2017 年 Joe Duffy（前微软 Midori OS 团队）做的 **基础设施即代码（IaC）工具**——你想要一台 EC2、一个 S3 桶、一套 Kubernetes 集群，**直接用 TypeScript / Python / Go / C# / Java 写一段代码**，Pulumi 帮你去云厂商 API 把它创建、修改、删除。

日常类比：Terraform 像 **填表格**——给你一种叫 HCL 的小语言，只能写 `resource "aws_instance" "x" { ... }`，想循环、想抽函数都得绕。Pulumi 像 **写程序**——你直接 `for` 循环建 10 台机器，直接 `if` 分环境，直接 `class MyDatabase extends ComponentResource`，**IDE 自动补全 / 类型检查 / 重构 / 单元测试** 全套继承编程语言原生能力。

```ts
import * as aws from "@pulumi/aws";

const bucket = new aws.s3.Bucket("my-bucket", {
  versioning: { enabled: true },
});

export const bucketName = bucket.id;
```

这段 TypeScript **就是** 你的基础设施清单。`pulumi up` 一下，AWS 上真的多了一个 S3 桶。

## 为什么重要

不理解 Pulumi 的设计，下面这些事讲不清：

- 为什么 2017 年 IaC 已经有 Terraform / CloudFormation / Ansible，还要再造一个轮子
- 为什么"用真正语言写 IaC"在过去试了好几次（Troposphere / AWS CDK 早期）都没大火，Pulumi 凭什么破局
- 为什么 AWS 自己 2019 年也推 CDK（CDK 跟 Pulumi 设计极像）
- 为什么有人坚持 Terraform 的 HCL，认为"通用语言写 IaC"反而是个坑

## 核心要点

Pulumi 的设计可以拆成 **三层**：

1. **语言 SDK**：你写的那段 TS / Python / Go 代码。SDK 提供 `Resource` / `Output` / `ComponentResource` 等原语，让你声明"我想要什么"。

2. **引擎（engine）**：Go 写的核心。读你的代码声明出来的 **资源图**，对比 **当前状态**（state），算出 diff，决定哪些要 create / update / delete。这一步叫 `pulumi preview`。

3. **Provider（gRPC 插件）**：AWS / Azure / GCP / Kubernetes 各家一个独立进程，引擎通过 gRPC 喊它们去调云 API。**95% 的 provider 是从 Terraform Provider 桥接生成** 的——所以 Pulumi 一上来就支持 100+ 云。

关键概念 **Stack**：同一份代码，可以建多套环境（dev / staging / prod），每套有自己的 state 和配置。`pulumi stack select prod` 切环境。

## 实践案例

### 案例 1：循环建 3 个相同的桶（Terraform 写起来别扭）

```ts
import * as aws from "@pulumi/aws";

for (const env of ["dev", "staging", "prod"]) {
  new aws.s3.Bucket(`logs-${env}`, {
    tags: { Environment: env },
  });
}
```

Terraform 等价代码要写 `count` 或 `for_each` + `var.environments`，绕一圈。Pulumi **就是 JavaScript 的 for**。

### 案例 2：抽出可复用组件（像写一个 class）

```ts
class WebApp extends pulumi.ComponentResource {
  constructor(name: string, args: { domain: string }, opts?) {
    super("my:app:WebApp", name, {}, opts);
    const bucket = new aws.s3.Bucket(`${name}-static`, {}, { parent: this });
    const cdn = new aws.cloudfront.Distribution(`${name}-cdn`, { /* ... */ }, { parent: this });
    this.url = cdn.domainName;
  }
  url: pulumi.Output<string>;
}

const app = new WebApp("blog", { domain: "blog.example.com" });
```

**WebApp 就是个普通 TypeScript class**，可以发到 npm，团队复用。Terraform 的 module 概念能做到类似事情，但抽象能力比 class 弱很多（没继承、没接口、没真正的封装）。

### 案例 3：state 和 Output 的"异步"陷阱

```ts
const bucket = new aws.s3.Bucket("my-bucket");
console.log(bucket.id);  // 错！这是 Output<string>，不是 string
console.log(`Bucket: ${bucket.id}`);  // 错！会打印 [object Object]

bucket.id.apply(id => console.log(`Bucket: ${id}`));  // 对
```

`bucket.id` 在你写代码的时候 **还不存在**——桶要 `pulumi up` 后才会被 AWS 分配。Pulumi 用 `Output<T>` 包住"未来才知道的值"，**强迫你用 `.apply()` 拆包**。这是新手第一个坑。

## 踩过的坑

1. **state 还是要管**：Pulumi 默认把 state 存到 Pulumi Cloud（免费档够用），也可以放 S3 / Azure Blob / 本地文件。**多人协作必须用远端 state + 锁**，否则两个人同时 `pulumi up` 会撕裂状态。

2. **Output 不能随便 `if` 判断**：`if (bucket.versioning.enabled) { ... }` 永远是真——因为 `enabled` 是个 Output 对象不是布尔。要用 `pulumi.all([...]).apply(...)` 把多个 Output 凑齐再判断。

3. **Provider 桥接的边角 bug**：因为大部分 provider 是从 Terraform Provider 自动转的，**TF 的某些 quirky 行为会泄漏到 Pulumi**——比如某些字段改了得 `replace` 整个资源，错误信息里冒出 HCL 风格的 schema。

4. **类型不是万能护身符**：你 TS 类型对了，**云 API 调用还是可能失败**——配额超了、IAM 权限不够、region 不支持某个服务。Pulumi 不会替你预测这些。

5. **测试基础设施很难**：虽然 Pulumi 支持单元测试（mock provider），但 **真正能验证"在 AWS 上跑得对"** 的只有 integration test，慢且贵。

## 适用 vs 不适用场景

**适用**：

- 团队已经熟悉 TypeScript / Python / Go，不想再学 HCL
- 需要复杂的循环、条件、抽象——比如"按客户租户动态生成 N 套资源"
- 想把基础设施代码和应用代码放一个 monorepo，**共享类型 / 工具 / lint**
- 需要 Policy as Code（CrossGuard）：写 TS 函数检查"不允许公开桶"

**不适用**：

- 团队就 1-2 个人、基础设施简单（几台 EC2 + 一个 RDS）—— Terraform 更轻
- 运维同事不写代码，只看得懂声明式配置 → HCL 比 TS 友好
- 已经在 Terraform 上重度投入（state / module / 流水线齐全），迁移成本 > 收益
- 公司只用 AWS 且强制 CloudFormation —— Pulumi 没原生 CFN 优势

## 历史小故事（可跳过）

- **2017 年**：Joe Duffy 离开微软（曾在 Midori OS、.NET 团队），创立 Pulumi 公司。第一版只支持 JavaScript。
- **2018 年**：拿到 Madrona / Tola 的 A 轮 1500 万美元，开源核心引擎。
- **2019 年**：AWS 发布 CDK——核心思想几乎一样（用 TS 生成 CloudFormation 模板）。Pulumi 团队公开评论：CDK 把生成出来的 CFN 模板交给 AWS 部署，Pulumi 自己跑引擎，后者控制力更强。
- **2022 年**：发布 Pulumi YAML —— 给不想写代码的人一条路。
- **2024-2025 年**：发力 AI / GenAI 基础设施场景，推出 Pulumi ESC（环境配置统一管理）。

## 学到什么

1. **DSL vs 通用语言** 的老问题在 IaC 重演：DSL 限制多但学习曲线低，通用语言能力强但容易过度工程化。Pulumi 选了后者。
2. **声明式底子 + 命令式表面**：Pulumi 代码 **看起来像** 命令式，**实际是** 声明——你的 `for` 循环只是用来构建资源图，真正部署是引擎根据 diff 干的。这点和 React 的 JSX 思路一样。
3. **桥接是务实选择**：用 Terraform Provider 生态省了几年时间，代价是继承一些历史包袱。
4. **state 是 IaC 的核心数据结构**：不管 Terraform 还是 Pulumi，state 文件丢了基础设施就"看不见"了。备份 state 比备份代码更重要。

## 延伸阅读

- 官方教程：[Pulumi Get Started](https://www.pulumi.com/docs/get-started/)（30 分钟跑通第一个 stack）
- 对比文章：[Pulumi vs Terraform](https://www.pulumi.com/docs/concepts/vs/terraform/)（官方写的，注意立场）
- Joe Duffy 博客：[Hello, Pulumi!](https://www.pulumi.com/blog/hello-pulumi/)（2018 年发布日博文，讲设计动机）
- [[terraform]] —— Pulumi 最直接的对手，HCL 派
- [[kubernetes]] —— Pulumi 的 Kubernetes provider 让你用 TS 写 Deployment / Service
- [[ansible]] —— 配置管理派，和 IaC 不是同一层抽象

## 关联

- [[terraform]] —— 同类工具，DSL（HCL）派代表
- [[kubernetes]] —— Pulumi 的重要部署目标之一
- [[ansible]] —— 配置管理工具，与 IaC 互补不是替代
- [[typescript]] —— Pulumi TS SDK 的宿主语言

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ansible]] —— Ansible — 无 agent 配置管理
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[opentofu]] —— OpenTofu — 社区接手的 Terraform


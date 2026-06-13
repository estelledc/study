---
title: LLRT — AWS Lambda 低延迟 JavaScript 运行时
来源: https://github.com/awslabs/llrt
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
provenance: pipeline-v3
---

## 是什么

**LLRT**（**L**ow **L**atency **R**un**t**ime）是 AWS Labs 开源的实验性 JavaScript 运行时，专为 **AWS Lambda** 上的 Serverless 函数设计。官方宣称相比 Node.js 20 等托管运行时，冷启动可快 **10 倍以上**，综合成本可低约 **2 倍**（尤其在 128–256 MB 内存档位）。

日常类比：

- **Node.js on Lambda** 像一辆**全尺寸 SUV**：V8 引擎、JIT 编译器、完整 Node API——功能全面，但每次「点火启动」都要热机，短程接送（几十毫秒就结束的 Lambda 调用）油耗不划算。
- **LLRT** 像**电动滑板车**：只为「从 A 点到 B 点、立刻走人」设计——用 Rust 写外壳、QuickJS 做 JS 引擎、**故意不做 JIT**，把体积和启动时间压到极低；内置常用 AWS SDK 客户端，像车筐里预装了快递 App，不用再现场下载。
- **它不是 Node 的替代品**，而是 Lambda 场景下的**专用跑车**：跑长途（CPU 密集、百万次循环）不如 SUV，但送外卖（鉴权、校验、调 DynamoDB、转 JSON）极快。

> ⚠️ 截至 2026 年，LLRT 仍标记为 **experimental（实验性）**，API 与 bundle 形态可能变化，生产环境需充分压测与回退方案。

## 为什么重要

不理解 LLRT，下面这些 Serverless 现象就说不清：

- **为什么 128 MB 的 Lambda 冷启动特别痛**——Init Duration 之外还有「把代码拷进沙箱」的时间；小内存 + 大 runtime 双重放大延迟
- **为什么有人愿意放弃官方 `nodejs20.x` 托管运行时**——自定义 runtime + LLRT 用体积换启动，对 API 网关后面的短函数 ROI 很高
- **为什么 bundler 要设 `--platform=browser`**——LLRT 的模块解析更接近浏览器/WinterTC，不是完整 Node 语义
- **为什么 `@aws-sdk/client-dynamodb` 可以标成 external**——std-sdk / full-sdk bundle 里已把常用 SDK 编进可执行文件，不必再打进 zip
- **为什么 middy、Powertools 可能跑不起来**——`node:stream`、`node:console` 等与 Node 仅部分兼容，生态 middleware 往往假设完整 Node

## 核心概念

### 1. Lambda 专用，而非通用 JS 运行时

Node.js、Bun、Deno 面向浏览器、CLI、长期进程；LLRT **只关心 Lambda 沙箱里那几秒**：加载 handler → 调 AWS API → 返回。因此可以砍掉 JIT、HTTP 服务器、`cluster` 等 Lambda 用不到的模块。

长期目标是 **WinterTC**（跨运行时 Web 标准 API 互操作），但明确 **不会** 实现全部 Node.js API。

### 2. Rust + QuickJS：轻壳 + 轻引擎

| 层次 | 技术 | 作用 |
|------|------|------|
| 宿主 / I/O | Rust + Tokio | 异步网络、TLS、与 Lambda Runtime API 通信 |
| JS 引擎 | QuickJS | 解释执行 ES2023，无 JIT，启动快、内存小 |
| Node 兼容层 | llrt_modules（Rust 实现） | 按需实现 `node:buffer`、`node:crypto`、`fetch` 等 |

类比：QuickJS 是「袖珍柴油机」，Rust 是「车身和传动系统」——车身按 Lambda 货厢尺寸定制，不追求公路巡航极速。

### 3. 无 JIT：用启动换吞吐

JIT（Just-In-Time）在长时间运行后会优化热点代码，但**首次编译占 CPU、占内存、拉长冷启动**。Lambda 实例常常只活几秒，JIT 往往来不及回本。

LLRT 选择**纯解释 + 原生扩展**（哈希、XML 等用 Rust 替代 JS 依赖），在短生命周期里更划算。副作用：大数组遍历、蒙特卡洛模拟等 **CPU 密集** 任务可能比 Node.js 慢。

### 4. 三种 SDK Bundle

发布物按是否内置 AWS SDK v3 客户端分档：

| Bundle | 文件名后缀 | 适用场景 |
|--------|------------|----------|
| no-sdk | `*-no-sdk` | 不调 AWS API，纯计算/转换 |
| std-sdk | 无后缀（默认） | DynamoDB、S3、SQS、STS、KMS 等常用客户端已内置 |
| full-sdk | `*-full-sdk` | 需要 Athena、Bedrock、EKS 等长尾客户端 |

内置 SDK 经过裁剪与原生加速（如 XML 解析、`llrt:xml`），`@aws-sdk/*` 在打包时应 **external**，避免重复打进 zip。

### 5. 部署方式

常见四种：

1. **Custom Runtime (AL2023)**：zip 里放 `bootstrap`（LLRT 二进制）+ 你的 `handler.mjs`
2. **Lambda Layer**：上传 `llrt-lambda-arm64.zip` 或 `llrt-lambda-x64.zip`
3. **容器镜像**：`FROM busybox` + 下载 `llrt-container-arm64`，`CMD ["llrt"]`
4. **IaC**：AWS SAM 示例、`cdk-lambda-llrt` Construct

环境变量 `LAMBDA_HANDLER` 指向入口，例如 `app.handler`。

### 6. 打包与依赖纪律

官方强烈建议：**bundle + minify + tree-shake**，不要把完整 `node_modules` 丢进部署包。

```bash
# esbuild 典型命令（摘自官方 README）
esbuild index.mjs \
  --platform=browser \
  --target=es2023 \
  --format=esm \
  --bundle \
  --minify \
  --external:@aws-sdk \
  --external:@smithy
```

TypeScript **必须在部署前** 编译成 ES2023 JS——LLRT **不会** 在 Lambda 里现场 transpile。

### 7. API 兼容矩阵（心智模型）

- ✔︎ 较完整：`buffer`、`crypto`（部分）、`fetch`、`fs`（部分）、`path`、`url`、`zlib`（部分）
- ✘ 或计划中：`http`/`https` 服务端、`cluster`、`worker_threads`、`node:test`
- LLRT 专有：`llrt:xml`（可 alias 替换 `fast-xml-parser`）、`llrt:hex`、`llrt:timezone`

迁移策略：先写单元测试 + `llrt test`，不通过再换回 Node 或改依赖。

### 8. 适用与不适用场景

**适合：**

- API 鉴权、JWT 校验、请求体 schema 校验
- EventBridge / SQS / SNS 事件的小型转换
- DynamoDB / S3 读写为主的集成函数
- 对冷启动敏感的同步 API（用户直接感到的首包延迟）

**不适合：**

- 大批量 JSON/CSV 解析、图像处理、复杂数值模拟
- 深度依赖 middy、完整 `node:stream`、Prisma 等 Node 生态的栈
- 需要 `node:http` 起监听端口的代码（Serverless 本也不该这么写）

## 代码示例

### 示例 1：DynamoDB 写入（std-sdk，ESM handler）

下面函数假设使用 **std-sdk** bundle（内置 `@aws-sdk/client-dynamodb`），部署包只需你的业务代码 + `bootstrap`。

```javascript
// app.mjs — Lambda handler
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME ?? "items";

export const handler = async (event) => {
  const body = typeof event.body === "string" ? JSON.parse(event.body) : event;
  const id = body.id ?? crypto.randomUUID();

  await client.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: marshall({
        id,
        payload: body,
        createdAt: new Date().toISOString(),
      }),
    })
  );

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, id }),
  };
};
```

构建与打包要点：

```bash
esbuild app.mjs --bundle --minify --platform=browser --target=es2023 \
  --format=esm --outfile=dist/app.mjs \
  --external:@aws-sdk --external:@smithy

# zip 结构（Custom Runtime）
# ├── bootstrap          # LLRT 可执行文件，chmod +x
# └── dist/app.mjs
export LAMBDA_HANDLER=dist/app.handler
```

`crypto.randomUUID()` 走 Web Crypto / `node:crypto` 子集；若需 JWT，用 `jose` 等**已验证兼容**的纯 JS 库并打进 bundle。

### 示例 2：S3 对象流式读取（内置 SDK + streaming）

LLRT 0.9+ 支持 SDK 响应体流式消费，适合略大的对象而不一次性读入内存：

```javascript
// s3-head.mjs
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

export const handler = async (event) => {
  const { bucket, key } = event;
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  // 方式 A：流式处理（适合行级 JSONL）
  let lineCount = 0;
  const decoder = new TextDecoder();
  for await (const chunk of response.Body) {
    const text = decoder.decode(chunk, { stream: true });
    lineCount += (text.match(/\n/g) ?? []).length;
  }

  // 方式 B：一次性字符串（小文件）
  // const text = await response.Body.transformToString();

  return { lineCount, contentLength: response.ContentLength };
};
```

若对象 XML 元数据解析是热点，可在 bundler 里 alias：

```javascript
// rollup.config.mjs 片段
export default {
  // ...
  plugins: [
    {
      resolveId(source) {
        if (source === "fast-xml-parser") return { id: "llrt:xml", external: true };
        return null;
      },
    },
  ],
};
```

## 与 Node.js 20 on Lambda 对比

| 维度 | Node.js 20 (托管) | LLRT |
|------|-------------------|------|
| 定位 | 通用 JS 运行时 | Lambda 专用 |
| 引擎 | V8 + JIT | QuickJS，无 JIT |
| 冷启动 | 较慢（尤其低内存） | 显著更快 |
| CPU 长任务 | 强 | 弱 |
| API 覆盖 | 完整 Node | 子集 + WinterTC 方向 |
| AWS SDK | npm 安装 | 多客户端预置在二进制内 |
| 运维 | AWS 维护版本 | 自行升级 layer/二进制 |
| 成熟度 | 生产默认 | 实验性，需自测 |

## 本地开发与测试

仓库自带 **Jest 风格** 测试运行器：

```bash
# 扫描 **/*.test.mjs
llrt test

# 只跑文件名含 crypto 的测试
llrt test crypto

# 指定目录
llrt test -d ./tests/unit
```

还可用 `make run` + `lambda-server.js` 模拟本地 Lambda 环境（需 AWS 凭证与 DynamoDB 表等资源）。

常用环境变量（节选）：

- `LLRT_GC_THRESHOLD_MB`：GC 触发阈值，默认 20 MB
- `LLRT_SDK_CONNECTION_WARMUP=1`：init 阶段并行预热 TLS，减轻冷启动（默认开启）
- `LLRT_NET_ALLOW` / `LLRT_NET_DENY`：网络访问白名单/黑名单

## 学习路径建议

1. **先会 Lambda + Node**：理解 handler、event/context、IAM、冷启动与 Init Duration 的区别
2. **读官方 [Compatibility matrix](https://github.com/awslabs/llrt/blob/main/README.md#compatibility-matrix)**：确认你的依赖是否触碰未实现 API
3. **用 esbuild 打一条最小 DynamoDB 函数**，128 MB ARM 与 Node 20 对比 P99 冷启动
4. **给现有函数加 `llrt test`**，再考虑切 runtime；保留一键回退 Node 的 IaC 开关
5. **关注 WinterTC 与 llrt_modules**：部分能力可脱离 LLRT 单独嵌入其他 QuickJS 项目

## 延伸阅读

- 官方仓库：[awslabs/llrt](https://github.com/awslabs/llrt)
- API 明细：[API.md](https://github.com/awslabs/llrt/blob/main/API.md)
- CDK 封装：[cdk-lambda-llrt](https://github.com/tmokmss/cdk-lambda-llrt)
- 社区实测：Yan Cui《First impressions of the fastest JavaScript runtime for Lambda》
- 同族轻量引擎笔记：本库 [QuickJS](./quickjs.md) —— LLRT 的 JS 引擎底座

## 小结

LLRT 把「Lambda 上跑 JavaScript」从通用运行时问题**收窄**成「短函数、快启动、多 AWS 调用」的专用问题：Rust 外壳、QuickJS 引擎、无 JIT、内置 SDK。它不是银弹，但在对的场景里能明显降低冷启动与账单；入门时记住三句话——**bundle 成 browser 目标、SDK 标 external、永远准备回退 Node**。

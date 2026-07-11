---
title: LLRT — AWS Lambda 场景下的低延迟 JS 运行时
来源: 'https://github.com/awslabs/llrt'
日期: 2026-07-08
分类: 开源工具
难度: 进阶
---

## 是什么

LLRT（Low Latency Runtime）是 AWS Labs 开源的**实验性**轻量 JavaScript 运行时，专为 Lambda 冷启动设计。日常类比：Node.js 像开一辆功能齐全的轿车（V8 + 完整标准库），每次点火都要等整套系统就绪；LLRT 更像一辆只装关键零件的卡丁车（QuickJS + 精简 API）——上赛道更快，但不能指望它跑长途越野。

它用 **Rust 实现运行时 API**，引擎是 **QuickJS**，刻意**不做 JIT**：短生命周期函数里，编译优化的收益常盖不过启动成本。官方宣称相对其他 JS 运行时，冷启动可到约 **10×**、成本约 **2×** 更低——数字以仓库 benchmark 为准，且项目仍标 experimental。

一句话定位：**不是新语言，也不是通用 Node 发行版**，而是"在 Lambda 沙箱里把 JS 跑起来的更瘦 bootstrap"。

## 为什么重要

若把所有 Lambda 都押在标准 Node.js 运行时，常见痛点是：

- 低频触发时，冷启动占用户感知延迟的大头（Node 常数百 ms init）
- 同样内存下实例更易被回收，抖动来自 runtime 而非业务代码
- 优化全花在应用层，却忽略"基础运行时体积与启动路径"

LLRT 把**运行时本身**当成优化对象：适合胶水函数、鉴权、轻路由——不是"全面替代 Node"。对事件驱动系统，**尾延迟（p95/p99）往往比平均值更重要**；LLRT 的卖点正是压冷启动抖动。

## 核心要点

1. **QuickJS + Rust，无 JIT**：体积小、启动快；CPU 密集长任务往往不如带 JIT 的 V8。
2. **三种接入**：自定义 runtime（bootstrap）、Lambda Layer、容器镜像。
3. **兼容是子集**：部分 Node 内置 API / npm 包不可用，上线前查[兼容矩阵](https://github.com/awslabs/llrt)。
4. **内置部分 AWS SDK v3 客户端**：减少冷启动时再拉依赖的体积。

```javascript
// handler.mjs — 最小 HTTP 风格返回
export const handler = async (event) => {
  const payload = JSON.parse(event.body || "{}");
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, route: payload.route || "default" }),
  };
};
```

部署时把上述文件当 handler 入口，运行时选自定义 runtime，并把 LLRT 的 `bootstrap` 放进 Layer 或镜像——业务代码几乎不用改签名。

## 实践案例

### 案例 1：冷启动敏感接口先改

场景：每分钟几次的 API，业务盯 p95/p99，不盯平均。

1. 把 handler 改成 ES module，只用 LLRT 已支持的 API（`fetch` / `JSON` / 部分 `fs`）
2. 函数运行时选 **Custom runtime on Amazon Linux 2023**
3. 挂上官方 `llrt-lambda-arm64.zip`（或 x64）Layer
4. 用冷启动压测对比：同一 handler 在 Node 20 vs LLRT 的 Init Duration（社区常见量级：LLRT 数十 ms，Node 数百 ms）

**逐部分解释**：步骤 1 保证"卡丁车零件都认识"；步骤 2–3 换引擎；步骤 4 用数字证明值不值得扩面。先改 2～3 个关键接口，再谈全量。

### 案例 2：Layer 复用 runtime

1. 构建时下载对应架构的 LLRT release zip
2. 作为 Layer 发布，多个函数共用同一层，避免每函数打一份 bootstrap
3. 升级时只发新 Layer 版本并改函数引用——版本要全环境对齐，否则出现"A 函数新、B 函数旧"

优点是升级集中；代价是 Layer 权限、架构（arm64/x64）与函数必须一致，混架构会直接启动失败。
SAM / CDK 里把 Layer ARN 提成参数，比手改控制台更不容易漏环境。

### 案例 3：容器镜像（示意）

```dockerfile
FROM --platform=linux/arm64 public.ecr.aws/lambda/provided:al2023
COPY bootstrap /var/runtime/bootstrap
COPY app.mjs /var/task/app.mjs
RUN chmod +x /var/runtime/bootstrap
CMD ["app.handler"]
```

`bootstrap` 来自 LLRT release；真实项目以官方 example / SAM 模板为准。容器形态便于锁版本，但仍受 Lambda 生命周期约束——镜像再漂亮，冷启动路径仍要自己量。

## 踩过的坑

1. **当成 Node 掉包替换**：依赖 `child_process`、完整 `http`、或重型 native addon 的库会直接挂——先查兼容表再迁。
2. **打进过多 node_modules**：体积一涨，冷启动优势被抹平；优先用 runtime 已带的 AWS SDK。
3. **只看平均延迟**：收益在冷启动尾部，应盯 p95/p99 与 Init Duration，而非温启动均值。
4. **experimental 预期**：API 与兼容面仍在变，生产需有一键切回 Node 的回滚。
5. **指标口径**：Lambda 控制台的 Init Duration 不含代码拷贝进沙箱的时间；端到端冷启动要用真实请求 round-trip 再确认。

## 适用 vs 不适用场景

**适用**：

- Lambda 冷启动明显伤体验（目标：Init 从数百 ms 降到数十 ms 量级）
- 短小胶水 / 鉴权 / 轻变换，触发不频繁但要稳
- 愿意为启动优势维护额外 runtime 与兼容扫描

**不适用**：

- 重度依赖未支持 Node API 或 native 模块
- CPU 密集、长运行（无 JIT，稳态吞吐常弱于 Node）
- 不想维护 Layer/自定义 runtime 与回滚路径
- 需要"和本地 Node 行为 100% 一致"的团队

## 历史小故事（可跳过）

- **2023**：AWS 内部打磨面向 Lambda 的轻量 JS 运行时；公开材料多称 beta / experimental
- **2024-02**：`awslabs/llrt` 开源，宣称约 10× 启动、约 2× 成本优势，技术选型定格为 Rust + QuickJS、无 JIT
- **之后**：补 Layer / 容器示例、兼容矩阵与 AWS SDK 内置；社区基准验证冷启动，同时强调非通用 Node 替代
- **当前**：仍宜按场景试点，而不是全量替换
- **对照**：Bun / Deno 也快，但不是为 Lambda 沙箱裁剪的；LLRT 的差异化在"无 JIT + 内置 SDK + 自定义 runtime 路径"

## 学到什么

1. Serverless 性能不只看函数体——**runtime 选型**直接打在冷启动尾延迟上
2. 轻量 = 更严的兼容与打包纪律；快不是免费的
3. 能否量化 p95/p99 与 Init Duration，决定值不值得切
4. 实验性运行时要自带回滚，不能把"快"当成盲目替代
5. 无 JIT 是刻意取舍：换启动速度，付稳态吞吐——选型前先画自己的负载曲线

落地前最小检查清单：

- 冷启动：首次调用 vs 第 N 次温启动，分别记 Init 与端到端
- 兼容：依赖树扫一遍 Node-only API，列回退路径
- 回滚：同一函数能否一键切回 `nodejs20.x`（或团队基线）

## 延伸阅读

- 仓库：[awslabs/llrt](https://github.com/awslabs/llrt)（README、兼容说明、release）
- Lambda 自定义运行时：[Custom runtimes](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-custom.html)
- 社区首印象：[theburningmonk on LLRT](https://theburningmonk.com/2024/02/first-impressions-of-the-fastest-javascript-runtime-for-lambda/)
- InfoQ 报道：[AWS LLRT experimental](https://www.infoq.com/news/2024/02/aws-llrt-lambda-experimental/)
- [[aws-lambda]] —— 无服务器函数生命周期
- [[quickjs]] —— LLRT 使用的 JS 引擎

## 关联

- [[lambda-layer]] —— Layer 共享 bootstrap 的部署方式
- [[aws-sam]] —— 无服务器模板与本地演练
- [[cdk]] —— IaC 管理多环境函数与 Layer
- [[quickjs]] —— 引擎层为何能轻
- [[nodejs]] —— 迁移时的兼容基线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[serverless]] —— 事件驱动系统基础范式
- [[edge-runtime]] —— 与边缘运行时的一种对照
- [[nodejs]] —— 迁移时的兼容参考基线

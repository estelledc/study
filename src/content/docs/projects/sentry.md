---
title: Sentry — 把崩溃和报错自动收集 + 分组 + 可查询的错误监控平台
来源: 'https://github.com/getsentry/sentry'
日期: 2026-05-30
分类: observability
难度: 中级
---

## 是什么

Sentry 是一个**专门给开发者用来『自动捕获线上报错』**的开源平台——你在自己应用里装一个小 SDK，应用一旦抛异常 / 崩溃 / 接口变慢，SDK 会自动把堆栈、用户信息、操作轨迹打包发回 Sentry 服务端，服务端帮你分组成可搜可筛的 issue 列表。

日常类比：像给你的应用装了一个『行车记录仪 + 4S 店故障编码读取器』——出事时自动录下事发前 30 秒所有动作，回到店里仪表自动归类成『2024 款车型刹车油液低』这种已知故障，不用每位车主单独打电话报修。

最小例子：3 行把 Sentry 接到一个 Python Flask 应用：

```python
import sentry_sdk
sentry_sdk.init(dsn='https://abc123@o1.ingest.sentry.io/42')

# 之后任何抛出的异常都会自动上报
1 / 0
```

跑一次，去 Sentry 网页后台就能看到这次 ZeroDivisionError，附带堆栈、Python 版本、操作系统、最近几次请求路径。

## 为什么重要

不理解 Sentry，下面这些事都没法解释：

- 为什么大公司线上 bug 修得比小公司快——不靠用户『报障描述』，靠 Sentry 自动堆栈 + 用户重现轨迹
- 为什么前端项目都要传 source maps——压缩后的 JS 堆栈是 `t.handleClick at a.min.js:1:9374`，看不懂
- 为什么开发者会说『同一个 bug』而不是『100 次报错』——Sentry 把指纹相同的 event 自动聚成一个 group
- 为什么 [[django]] / [[react]] / iOS 各自有 SDK——每个语言 / 框架的报错抓取方式都不同，Sentry 给每个生态都做了一份

## 核心要点

Sentry 的设计可以拆成 **三个核心**：

1. **Event 与 Issue 是两层**：每次报错产生一条 event（堆栈 + 上下文），多条相同指纹的 event 聚成一个 issue（你看到的那条）。类比：每次发烧就诊是 event，医生诊断的『流感 A』是 issue。

2. **DSN 是 SDK 和服务端的『地址 + 钥匙』**：DSN 长这样 `https://公钥@host/项目id`，SDK 拿它知道把数据发到哪个项目。类比：DSN 像快递寄件单，写明收件地址也写明发件人凭证。

3. **Breadcrumbs 是错误前的操作轨迹**：报错前用户点了什么按钮、发了什么网络请求、写了什么 console.log，SDK 都默默记下，错误时一起上报。类比：飞机黑匣子录最近 30 分钟驾驶舱对话，事故时拿来还原过程。

这三件加起来让 Sentry 不只是『错误日志收集器』，而是『错误现场还原器』。

## 实践案例

### 案例 1：Flask 后端 3 行接入

```python
# app.py
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
from flask import Flask

sentry_sdk.init(
    dsn='https://abc123@o1.ingest.sentry.io/42',
    integrations=[FlaskIntegration()],
    traces_sample_rate=0.1,  # 10% 请求采样性能数据
)

app = Flask(__name__)

@app.route('/')
def hello():
    1 / 0  # 故意抛错
    return 'hi'
```

**逐部分解释**：

- `sentry_sdk.init` 是入口，dsn 决定数据去哪
- `FlaskIntegration` 自动 hook Flask 的错误处理钩子，无需手动 try/except
- `traces_sample_rate=0.1` 表示对 10% 请求做完整 trace（性能数据），剩下 90% 只在出错时采集
- 跑起来访问 `/`，Sentry 网页 1 秒内就能看到这次 ZeroDivisionError

### 案例 2：React 前端自动上报 + source maps

```typescript
// main.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: 'https://公钥@o1.ingest.sentry.io/前端项目id',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.2,
  release: 'myapp@1.4.0',
});

// 上线时把 source map 上传给 Sentry
// npx @sentry/cli sourcemaps upload --release 'myapp@1.4.0' ./dist
```

**关键步骤**：

- SDK 自动 hook `window.onerror` 和 `unhandledrejection`，无需你包 try/catch
- `release` 字段把每次报错关联到具体版本号
- 上传 source map 后，Sentry 会把 `a.min.js:1:9374` 还原成 `Button.tsx:42:8`
- 没传 source map 的话堆栈不可读——是 Sentry 前端用户最常踩的第一个坑

### 案例 3：用 alert rule 在 Slack 推新错误

在 Sentry 网页后台的 Alerts 里，配一个『当出现新 issue 且影响用户数 > 10』的规则，绑定 Slack channel。

```
触发条件: A new issue is created
环境过滤: production
影响用户阈值: 10
执行动作: 发到 Slack #oncall-frontend
```

**总成本**：3 分钟点几个下拉菜单。**收益**：当晚发的版本如果引入新崩溃，10 分钟内值班同学就能在群里看到，不用等用户客服反馈第二天才知道。这种零成本就拿到的告警链路是 Sentry 区别于纯日志服务的关键。

## 踩过的坑

1. **PII 仍可能从业务侧漏进 event**：现行 SDK 默认 `send_default_pii` 关闭，不会主动塞邮箱/IP/cookie；但你自己 `set_user`、打日志、面包屑里仍可能带上。修法：保持默认关闭、勿盲目开 `True`，并用 `before_send` 过滤敏感字段。

2. **前端忘传 source maps**：上线后看到的堆栈是 `t.x at app.min.js:1:9374`，根本不知道哪行代码。原因：浏览器只有压缩后的 JS，源码到压缩的映射只在你打包机器上。修法：CI 加一步 `sentry-cli sourcemaps upload`。

3. **循环里抛异常烧光配额**：免费版每月 5k 个 event，有同学写了个定时任务每秒 try 失败 raise 一次——一晚 8 万条全砸进去，第二天 Sentry 直接停止接收。修法：`sample_rate` 降低 + 关键路径用 `before_send` 返回 None 丢掉重复 event。

4. **self-host 不是单 docker 一行**：官方 self-hosted 仓库要 Postgres + ClickHouse + Redis + Kafka + Symbolicator + Relay 七八个服务一起起，至少 8GB 内存。修法：小团队优先用 SaaS 免费版，事件量起来再考虑 self-host。

## 适用 vs 不适用场景

**适用**：
- 任何线上跑的 web / 移动 / 桌面应用——只要会出错就该装
- 前后端分离的产品——能用 trace_id 把同一个用户的前端报错串到后端报错
- 多语言混合栈（Python + Go + JS）——所有 SDK 用一套后台聚合
- 创业团队不想自己搭可观测性——SaaS 免费版每月 5k events 够 MVP 期

**不适用**：
- 纯静态站点 / 纯文档站——没 JS 没异常，装了也没数据
- 完全离线 / 内网零出口的应用——self-host 要部署 + 维护
- 极致性能敏感的高频路径——SDK 也有几百微秒开销，不能塞进每秒百万次的内核循环
- 只想看 logs 不想看 traces 的场景——用 [[loki]] / Datadog Logs 更轻

## 历史小故事（可跳过）

- **2008 年**：David Cramer 在 Disqus 内部把 Django 默认的『错误发邮件』改成『写入数据库 + 网页查看』，雏形叫 sentry
- **2012 年**：开源到 GitHub，名字取自『哨兵』，最初只支持 Python
- **2015 年**：Sentry 公司成立，开始 SaaS 商业化，SDK 扩到 JS / Ruby / PHP
- **2019 年**：加入 performance monitoring，从『纯错误监控』进化到『错误 + 慢请求』双轨
- **2023 年**：license 改为 FSL（Functional Source License），2 年后自动转 Apache 2.0；引发开源社区大讨论但保住了商业护城河

至今 38k+ stars，是错误监控领域事实标准。

## 学到什么

1. **错误监控的核心是『分组』不是『记录』**——10 万次同样的错误等于 1 个 issue，这个『指纹聚类』是 Sentry 区别于 logs 的命脉
2. **上下文比堆栈本身更重要**——breadcrumbs + 用户 ID + release 决定能不能在本地复现
3. **SDK 必须异步上报 + 失败静默**——出了错的应用本来就脆弱，监控工具不能再让它崩
4. **可观测性三件套（logs / metrics / traces）里『错误』维度最早被工具化**——因为价值最高、最不需要全采样

## 延伸阅读

- 官方文档：[Sentry Docs](https://docs.sentry.io)（按语言挑 SDK 章节即可）
- 自托管：[Self-Hosted Sentry](https://develop.sentry.dev/self-hosted/)（8GB 起步硬件要求清单在这里）
- 内部文章：[How Sentry Receives 20 Billion Events/Month](https://blog.sentry.io/)（架构演进）
- 同类对比：[[rollbar]] / Bugsnag / Datadog APM / New Relic / Honeybadger

## 关联

- [[django]] —— Sentry 后端就是 Django monolith，Sentry 的诞生也来自 Django 错误邮件
- [[react]] —— `@sentry/react` 是前端最大的 SDK 接入面
- [[postgresql]] —— Sentry self-host 默认存储，issue / user / project 元数据都在这
- [[clickhouse]] —— Sentry 用它存 event 列存数据，支持秒级聚合查询
- [[rollbar]] —— Sentry 最像的同位置竞品，闭源 SaaS 路线
- [[opentelemetry]] —— Sentry tracing 协议正在向它兼容

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/wandb]] —— Weights & Biases — 几行 init 把指标系统代码自动入库

---
title: opentelemetry-collector — OTel 官方核心仓库与组件模型
来源: https://github.com/open-telemetry/opentelemetry-collector
日期: 2026-06-01
分类: 基础设施 / 可观测性
难度: 中级
---

## 是什么

`open-telemetry/opentelemetry-collector` 是 OpenTelemetry Collector 的**核心源码仓库**（笔记时点约 5–7k star 量级），用 Go 写。

日常类比：它是手机的"主板"。主板本身只有 CPU / 内存 / 总线这些通用件，摄像头、麦克风、SIM 卡这些"具体外设"放在另一个仓库（`opentelemetry-collector-contrib`）里。需要哪些外设，自己拼一台。

技术定义：仓库提供三类东西——

1. **核心运行时**：service / pipeline / exporter 调度 / config 解析这些"必有"的代码
2. **核心组件**：OTLP receiver、OTLP exporter、batch / memory_limiter processor 等几个不可缺的标准件
3. **构建工具 OCB**（`ocb`，OpenTelemetry Collector Builder）：让你按 YAML 清单挑组件、生成自定义二进制

绝大多数生产部署用的不是 core 二进制，而是 **core + 若干 contrib 组件** 通过 OCB 拼出来的 distribution。

## 为什么重要

不读这个仓库，下面这些事都解释不了：

- 为什么 AWS Distro for OTel / Google Cloud Ops Agent / Splunk OTel Collector 都长得很像——它们都用 OCB 基于本仓拼出来
- 为什么 contrib 仓库有 100+ 组件却仍能跟核心同步迭代——核心定义接口，contrib 实现接口
- 为什么"我加一个自定义 exporter"在 OTel 比在 Prometheus / Fluentd 简单——它从一开始就把"组件可插拔"做进运行时
- 为什么 Collector 能同时跑 traces / metrics / logs 三条流水线还共用同一份配置解析

## 核心要点

仓库可以拆成 **四层**：

1. **配置层**（`confmap` / `service`）：把 YAML 解析成内存结构，校验组件名是否注册、依赖是否齐全。

2. **组件层**（`component`）：定义 `Factory` 接口——每个组件类型（receiver / processor / exporter / extension / connector）有一个 Factory，负责"造实例"。这是经典的工厂模式，把"配置"和"运行实例"解耦。

3. **管道层**（`service/pipelines`）：把 receiver -> processors -> exporter 串成一根管子。一个 service 可以有多条管子（traces / metrics / logs 各一条），可以有多 receiver / 多 exporter 扇入扇出。

4. **数据模型层**（`pdata`）：内部用一种紧凑的二进制结构（pdata，protobuf 包装）表示数据，组件之间传的就是 pdata 引用，零拷贝穿过整条管道。

## 实践案例

### 案例 1：用 OCB 拼一个最小 distribution

写一个 `builder-config.yaml`：

```yaml
dist:
  name: my-otelcol
  output_path: ./_build
receivers:
  - gomod: go.opentelemetry.io/collector/receiver/otlpreceiver v0.95.0
processors:
  - gomod: go.opentelemetry.io/collector/processor/batchprocessor v0.95.0
exporters:
  - gomod: go.opentelemetry.io/collector/exporter/debugexporter v0.95.0
```

跑 `ocb --config builder-config.yaml`，生成可执行二进制 `my-otelcol`。整个过程不写一行 Go——OCB 自己生成 main.go、组装 import、编译。

**逐部分解释**：

- `dist.name` / `output_path`：生成二进制叫什么、写到哪。
- `receivers` / `processors` / `exporters`：按 Go module 路径点名要编进二进制的组件。
- 版本号（如 `v0.95.0`）必须彼此对齐；混版是后面踩坑第 2 条的来源。

### 案例 2：读懂 Factory 接口

每个 receiver 长这样（简化）：

```go
type Factory interface {
  Type() Type                         // 配置里写的名字，如 'otlp'
  CreateDefaultConfig() Config        // 默认配置
  CreateTracesReceiver(...) Traces    // 造一个处理 traces 的实例
  CreateMetricsReceiver(...) Metrics  // 造一个处理 metrics 的实例
  CreateLogsReceiver(...) Logs        // 造一个处理 logs 的实例
}
```

这种设计的好处：要加一种新协议，只要再写一个 Factory 注册进来，运行时不需要改任何调度代码。

### 案例 3：core 不会收的 PR

仓库 `CONTRIBUTING.md` 明文：与具体厂商绑定的 exporter / receiver（如 Datadog / Splunk / Loki）一律去 contrib，core 只收"协议中立 + 通用基础设施"。这个分仓策略让核心代码量保持在数万行级别，contrib 才是几十万行的大头。

## 踩过的坑

1. **core 二进制只带 OTLP receiver / OTLP exporter / batch / memory_limiter / debug**——很多新手在 core 里找 Jaeger / Prometheus exporter 找不到，那些都在 contrib。

2. **OCB 版本必须与组件版本完全一致**——builder-config.yaml 里所有 gomod 版本要对齐，混版会编译失败或运行时 panic。

3. **pdata 是引用语义不是值语义**——自定义 processor 里直接改 pdata，会改到上游 receiver 已经发出的数据。要先 `Clone()` 再改。

4. **Factory 必须用 init 注册**——忘写 `factories.Receivers[typeStr] = factory` 一行，二进制启动时报 'unknown component'，但编译期不会报错。

5. **connector 类型 2023 年才加**——它能让一条 pipeline 的输出当另一条的输入（如 traces -> metrics 派生）。看老博客只讲 receiver / processor / exporter 的，已经过时。

6. **service.telemetry 是 Collector 自己监控自己**——这一节配置常被忽略，导致 Collector 自己挂了都没告警。

## 适用 vs 不适用场景

**适用**：

- 想自建 Collector distribution（公司内部统一收集器）
- 想给 OTel 贡献组件（先读 core 接口，再去 contrib 写实现）
- 想理解 trace / metric / log 三类信号的统一抽象怎么落地
- 想读一个工业级 Go pipeline 框架的源码（pipeline / fanout / consumer chain 写得很清晰）

**不适用**：

- 只想用 Collector 跑业务——直接拉 contrib 二进制即可，不必读 core 源码
- 想找具体厂商集成——去 contrib 仓
- 学 Go 入门——这个仓库的 generic / 接口抽象比较密集，零基础读会吃力

## 历史小故事（可跳过）

- **2019 年**：OpenTracing + OpenCensus 合并为 OpenTelemetry，Collector 项目立项，初始代码来自 OpenCensus Service
- **2020 年**：core 与 contrib 分仓，确立"协议中立进 core / 厂商绑定进 contrib"的分工
- **2021 年**：CNCF 孵化项目；component / pdata / service 三大包定型
- **2022 年**：traces 信号 GA，OTLP 协议成为生产可用的事实标准
- **2023 年**：metrics / logs 信号 GA；新增 connector 组件类型连接多条 pipeline
- **2024 年**：profiles 信号开始进 alpha，准备成为第四类信号

## 学到什么

1. **核心 + 扩展分仓** 是大型 OSS 项目控制复杂度的标准做法（类比 Linux kernel 与 out-of-tree drivers / VS Code 与扩展市场）
2. **Factory 模式 + 配置驱动** 让运行时不需要硬编码任何具体组件——这是云原生工具链的统一抽象
3. **统一数据模型 pdata** 让三类信号共用一条调度链路，代价是每类信号都要做一些妥协（比如 logs 要装进类似 trace 的结构）
4. **构建工具（OCB）和运行时分离** 是个好设计——不需要的组件不进二进制，体积可控、攻击面小
5. **协议层 / 组件层 / 数据层分离** 是读这种框架的入门钥匙——任何新功能落点必在这三层之一

## 延伸阅读

- 仓库主页：[opentelemetry-collector](https://github.com/open-telemetry/opentelemetry-collector)
- contrib 仓：[opentelemetry-collector-contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib)
- OCB 文档：[Collector Builder](https://github.com/open-telemetry/opentelemetry-collector/tree/main/cmd/builder)
- 源码导读建议：先读 `component/` 看接口，再读 `service/pipelines/` 看调度，最后读 `pdata/` 看数据模型
- [[otel-collector]] —— 同一项目的使用与配置视角（架构、pipeline 配置、踩坑）
- [[opentelemetry]] —— 上游标准（OTLP 协议 / SDK / 语义约定）

## 关联

- [[opentelemetry]] —— 标准侧，定义 OTLP / SDK / 语义；本仓是它的参考实现入口
- [[otel-collector]] —— 同主题的运维视角文档，本页偏源码与组件模型
- [[jaeger]] —— 经典 trace 后端，contrib 里有 jaeger receiver / exporter
- [[prometheus]] —— 指标系统，contrib 里有 prometheus receiver 与 prometheusremotewrite exporter
- [[grafana-tempo]] —— Tempo 后端可直接消费 OTLP exporter 输出
- [[envoy]] —— 同样"配置驱动 + 可插拔过滤器"的设计思路，用在网络层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[prometheus]] —— Prometheus — 时序监控系统


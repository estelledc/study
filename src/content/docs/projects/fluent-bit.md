---
title: Fluent Bit — C 写的轻量日志 forwarder，K8s DaemonSet 默认选
来源: https://github.com/fluent/fluent-bit
日期: 2026-06-01
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Fluent Bit 是一个用 **C 语言**写的轻量级日志和指标转发器（forwarder），CNCF 毕业项目，2024 年和 [[fluentd]] 一起从 incubating 升到 graduated。

一句话定位：**Fluentd 的"边缘版"**——一样的 tag-routing 思路，但内存占用差 40 倍，专门塞进每个 K8s 节点当 DaemonSet 用。

日常类比：
- **Fluentd（Ruby 写的）**像办公室里那种重型多功能打印机——功能巨全（1000+ 插件），但占地大、要预热
- **Fluent Bit（C 写的）**像便携式收据打印机——只做核心活：抓日志、贴标签、转发出去。重量轻到可以塞每张工位上

它不是 Fluentd 的替代品，而是**搭档**：Fluent Bit 在每个节点收集，Fluentd 在集群中心做复杂路由。

## 为什么重要

- **K8s 日志聚合事实标准**：每个云厂商的 K8s 默认日志方案（EKS / GKE / AKS）都内置 Fluent Bit DaemonSet
- **内存差出一个数量级**：idle 时 Fluent Bit 约 450KB - 1MB，Fluentd 约 40MB+。500 节点集群算下来差 20GB 内存
- **C 写的没运行时依赖**：静态二进制可直接跑，不用装 Ruby 解释器和一堆 gem
- **CNCF graduated**：和 [[prometheus]] / [[kubernetes]] / [[envoy]] 同级别毕业项目，生产就绪信号
- **OTel 替代选项**：原生支持 OpenTelemetry 协议，可以替代 OTel collector 做 logs/metrics 收集

## 核心要点

Fluent Bit pipeline 是固定的 **六阶段流水线**：

```
Input → Parser → Filter → Buffer → Router → Output
```

每阶段一个 plugin 槽位，配置文件就是把 plugin 串起来：

1. **Input**：从哪收。tail（文件）/ systemd / kubernetes / forward（接 Fluentd）/ http / kafka
2. **Parser**：怎么把一行字符串拆成结构化字段。regex / json / logfmt / ltsv
3. **Filter**：在中间动手脚。kubernetes filter 调 API server 加 pod 元数据；grep / modify / lua / wasm
4. **Buffer**：攒一批再发。可选内存或文件系统（filesystem-backed chunks，掉电不丢）
5. **Router**：tag-based routing。每条记录贴 tag，Output 用 tag pattern（`kube.*` / `app.web.*`）匹配
6. **Output**：发到哪。Elasticsearch / Loki / S3 / Kafka / Splunk / Datadog / OTel exporter

```ini
# 配置示例：抓 K8s 容器日志，富化元数据，推 Loki
[INPUT]
    Name              tail
    Path              /var/log/containers/*.log
    Tag               kube.*
    Parser            cri

[FILTER]
    Name              kubernetes
    Match             kube.*
    Merge_Log         On

[OUTPUT]
    Name              loki
    Match             kube.*
    host              loki.monitoring
```

读法：tail 抓文件贴 `kube.<filename>` tag，filter 用 tag 匹配后调 K8s API 加 namespace/pod/container 字段，最后按 tag 推到 Loki。

## 实践案例

### 案例 1：K8s DaemonSet 部署

Helm 一行起：

```bash
helm install fluent-bit fluent/fluent-bit -n logging
```

这会在每个节点起一个 pod，挂 `/var/log/containers`、`/var/lib/docker/containers`，自动按 cri 格式解析容器日志，用 kubernetes filter 富化后推给配置的下游。

### 案例 2：Hybrid 架构（Fluent Bit + Fluentd）

生产里常见组合：

```
节点 A: Fluent Bit DaemonSet ─┐
节点 B: Fluent Bit DaemonSet ─┼→ Fluentd Aggregator → ES / S3 / Kafka
节点 C: Fluent Bit DaemonSet ─┘   (复杂路由 / 大插件库)
```

边缘用 Fluent Bit（轻、快、稳），中心用 Fluentd（插件多、路由灵活）。两者都用 forward 协议互通。

### 案例 3：踩 cardinality 雷

新人配 [[loki]] 输出时容易写：

```ini
[OUTPUT]
    Name              loki
    labels            $kubernetes['pod_name'], $trace_id
```

把 `trace_id` 当 Loki label，每个请求一个新 stream，Loki 直接拒收。和 [[loki]] 那篇说的一样：**label 是粗筛、正文是细筛**。

## 踩过的坑

1. **Tail 插件 inode 复用**：日志轮转后新文件复用旧 inode，旧 pos 还指向新文件中间，导致丢日志或重读。**解法**：开 `Inotify_Watcher On` + `Refresh_Interval 5`，或用 `db.locking` 把 pos 持久化

2. **kubernetes filter watch 风暴**：每个节点的 Fluent Bit 都调 API server 拿 pod metadata。500 节点集群同时 watch 会把 API server 拖慢。**解法**：开 `Use_Kubelet On`，让 filter 直连本节点 kubelet 而不是中心 API server

3. **Mem buffer 默认无背压**：下游慢时数据在内存堆，最终 OOM。**解法**：用 `storage.type filesystem`，限制 `storage.max_chunks_up`

4. **Lua filter 性能陷阱**：写几行 Lua 脚本把每条日志都跑一遍，CPU 直接起飞——本来用 Fluent Bit 就为了低开销。**解法**：能用内置 filter（grep / modify / nest）就不写 Lua；非要写就用新出的 wasm filter（性能好一截）

5. **配置语法两套**：经典 `.conf`（INI 风格）+ 新的 YAML 格式。文档里两种混着用，复制 example 时要注意版本

## 适用 vs 不适用

**适用**：
- K8s / 容器日志收集（DaemonSet 模式标配）
- 边缘节点 / IoT 设备（资源受限）
- 替代 OpenTelemetry collector 的 logs/metrics 收集
- Fluentd hybrid 架构里的边缘 agent

**不适用**：
- 需要复杂路由 / 1000+ plugin 生态 → 用 [[fluentd]]
- 业务侧应用直接打日志（应用进程内做结构化）→ 不是 forwarder 的活
- 需要流式 SQL / 复杂 transform → 用 [[vector-tools]] / Logstash
- 跑在 Windows 上的复杂场景（Linux 优先级更高）

## 历史小故事

- **2014**：Eduardo Silva 在 Treasure Data 开项目，定位是 "Fluentd for embedded / edge"
- **2019**：和 Fluentd 一起加入 CNCF（同一个 sub-project）
- **2020 v1.5**：filesystem buffer + 原生 K8s filter，K8s 集群默认日志方案地位坐实
- **2023 v2.x**：原生 OpenTelemetry 协议（OTLP），可替代 OTel collector
- **2024**：CNCF graduated，和 Fluentd 同步毕业
- **2026 v3.x**：wasm filter（替代 Lua）/ multi-tenancy 改进

## 学到什么

1. **同一个生态里"重 + 全"和"轻 + 边缘"可以共存**：Fluentd / Fluent Bit 不是替代关系，是分工。生态里能容下两个 SoT 当且仅当它们的优化目标不重叠
2. **C 写的基础设施在云原生时代依然有位置**：Rust 抢了一些（[[vector-tools]]），但 Fluent Bit 用 C 写、生态成熟、稳定性久经考验，新项目想撼动不容易
3. **tag-based routing 是 Fluentd 系的精神核心**：和 [[loki]] 的 label / [[prometheus]] 的 label 是同一思路——元数据驱动、内容只过 grep
4. **DaemonSet + 节点本地数据 + 集中聚合**是 K8s 数据平面的通用模式：日志（Fluent Bit）/ 指标（node-exporter）/ trace（OTel agent）都是这个套路

## 延伸阅读

- 官方上手：[Fluent Bit Getting Started](https://docs.fluentbit.io/manual/installation/getting-started-with-fluent-bit)
- 架构详解：[Fluent Bit Architecture](https://docs.fluentbit.io/manual/concepts/data-pipeline)
- K8s 部署：[Fluent Bit on Kubernetes](https://docs.fluentbit.io/manual/installation/kubernetes)
- [[fluentd]] —— Fluent Bit 的"老大哥"，同 CNCF 项目
- [[loki]] —— Fluent Bit 最常见的下游之一
- [[prometheus]] —— DaemonSet + 节点本地数据的同款架构

## 关联

- [[fluentd]] —— 同 CNCF sub-project，hybrid 架构里 Fluent Bit 在边缘、Fluentd 在中心
- [[loki]] —— Fluent Bit 直推 Loki 是 K8s 日志的常见组合
- [[prometheus]] —— 都用 label 驱动；Fluent Bit 也能直接出 Prometheus 格式指标
- [[kubernetes]] —— K8s DaemonSet 的杀手级用例就是 Fluent Bit
- [[opentelemetry]] —— OTel logs signal 可以走 Fluent Bit 收集
- [[vector-tools]] —— Rust 写的对照组，定位类似但生态较新
- [[grafana]] —— Fluent Bit + Loki + Grafana 三件套

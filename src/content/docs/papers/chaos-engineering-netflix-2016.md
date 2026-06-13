---
title: Chaos Engineering — Netflix 如何把「故意搞破坏」变成可靠性学科
来源: https://arxiv.org/abs/1702.05843
日期: 2026-06-13
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

## 先想成什么事

想象你管理一栋**大型商场**（这就是 Netflix 那样的分布式在线服务）：

- 电梯、空调、收银、监控、消防喷淋各自是不同承包商（微服务）。
- 顾客以为自己在逛「一家店」，背后其实是几十套系统同时协作。
- 真正可怕的不是「某台收银机坏了」——而是**连锁反应**：电梯卡死 → 疏散通道堵死 → 监控误报 → 全场停业。

传统做法像**等火灾再练逃生**：上线前做单元测试、集成测试、预发压测，然后祈祷生产别出事。问题是：测试环境再像生产，也模拟不了「周三晚高峰 + 某个机房光缆被挖断 + 配置中心推了错误参数」这种组合。

Netflix 的做法像**定期消防演习**，而且演习发生在**营业中的商场**：

- 随机关掉几台收银机（Chaos Monkey 杀 EC2 实例），看顾客能不能换队伍结账。
- 偶尔模拟**整层停电**（Chaos Kong 区域级演练）。
- 让部分服务之间的「内部电话」故意占线（Failure Injection Testing，FIT），看推荐页能不能降级成静态列表。

这篇论文（Basiri、Hochstein 等，**IEEE Software** 2016 年 5–6 月，arXiv:1702.05843）把上述实践提炼成一门学科：**混沌工程（Chaos Engineering）**——在分布式系统上**做受控实验**，从而建立「生产环境能承受动荡」的信心。

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 标题 | Chaos Engineering |
| 作者 | Ali Basiri, Narayan Behnam, Rudolph de Rooij, Lorin Hochstein, Jon Kosewski, Jake Reynolds, Colin Rosenthal（Netflix） |
| 发表 | IEEE Software, vol. 33, no. 3, pp. 35–41, May–June 2016 |
| arXiv | [1702.05843](https://arxiv.org/abs/1702.05843)（2017-02 提交） |
| 延伸 | [Principles of Chaos Engineering](https://principlesofchaos.org/)（业界四原则与实验步骤的公开版） |

论文核心论断：

> **混沌工程是在分布式系统上进行实验的学科，目的是建立系统在生产动荡条件下仍能正常工作的信心。**

「动荡」可以是硬件宕机、流量突增、配置项写错、依赖服务超时——任何能让**可观测行为**偏离常态的事件。

## 为什么值得读（零基础也能建立图景）

现代服务几乎都是**分布式系统**：多实例、多机房、异步队列、缓存、CDN、第三方 API。组件单独测过「能跑」，组合起来会出现论文里说的 **emergent behavior（涌现行为）**——没人写过的那条失败路径，往往在第一次大促才现身。

混沌工程不是「运维发疯删库」，而是把可靠性验证变成**可重复的科学实验**：

- 有**假设**（steady state 不会被破坏）
- 有**对照**（实验组注入故障 vs 对照组）
- 有**度量**（错误率、延迟分位数、业务 KPI）
- 有**自动化**（否则一次手工演练的结论会随代码腐烂而过期）

它和 [[helland-2007]]「大规模下别迷信分布式事务」、[[spanner]] 多副本一致性、[[firecracker-microvm-2020]] 隔离边界是同一可靠性谱系的不同切面：前者讲架构取舍，混沌工程讲**如何在真实流量下验证这些取舍没骗人**。

## 核心概念

### 1. 稳态（Steady State）

不要盯着「CPU 是不是 37%」这种内部指标，而要找**能代表系统「正常工作」的可测量输出**：

- 吞吐量（如每秒成功播放次数）
- 错误率
- 延迟分位数（p50 / p95 / p99）
- 业务 KPI（注册转化率、订单完成率）

论文与 principlesofchaos.org 都强调：**稳态是一段时间内输出指标的集合**，是系统行为的「代理变量」。实验就是看注入故障后，这些输出是否仍落在正常带内。

Netflix 历史上用 **SPS（starts per second，每秒播放启动次数）** 作为关键稳态信号之一——观众点播放，系统就必须在可接受延迟内出画面。

### 2. 实验四步法（设计一次混沌实验）

论文给出的流程与科学实验模板一致：

1. **定义稳态**：选可观测输出，划定「正常」区间。
2. **建立假设**：对照组与实验组在注入前都应保持稳态；注入真实世界事件后，**稳态仍应成立**（或按设计优雅降级）。
3. **引入变量**：从「现实中可能发生的事件」采样——宕机、磁盘坏、网络断、依赖超时、流量尖峰、错误配置。
4. **试图证伪**：若实验组稳态与对照组显著偏离，假设被推翻——你发现了可靠性漏洞，而不是「实验失败」。

注意：证伪成功 = 工程上的胜利，因为你赶在用户之前找到了 bug。

### 3. 混沌工程的四大原则

| 原则 | 含义 | 直觉 |
|------|------|------|
| **围绕稳态建立假设** | 实验检验的是可观测行为，不是「某台机器灯还亮着」 | 顾客能看电影，比「Pod 还在」重要 |
| **变化真实世界事件** | 刺激应从历史故障、告警、变更记录里采样 | 专挑发生过的问题重演 |
| **在生产环境运行** | 真实流量路径与资源竞争无法被测试环境完全复制 | 演习要在营业中进行（有安全绳） |
| **持续自动化** | 手工演练会腐烂；系统每次发布都改变失败模式 | 消防演习要进 CI/CD，而不是年终一次 |

第三条最反直觉，也最有争议：**没有 blast radius 控制、没有自动熔断和回滚的生产实验是鲁莽，不是混沌工程。**

### 4. Netflix 工具谱系（论文语境）

| 工具 | 做什么 | 规模 |
|------|--------|------|
| **Chaos Monkey** | 在工作时间随机终止生产 EC2 实例 | 单机 / 单实例 |
| **Chaos Kong** | 模拟整个 AWS 区域不可用 | 区域级 |
| **FIT**（Failure Injection Testing） | 让服务间调用失败，验证降级路径 | 依赖 / RPC 级 |
| **ChAP**（Chaos Automation Platform，后续工作 arXiv:1702.05849） | 分流一小部分线上流量并注入故障，自动比对稳态 | 持续自动化 |

Chaos Monkey 故意只在**工作时间**运行，以便工程师能立刻响应——这本身就是 blast radius 设计。后来社区开源了 [Netflix/chaosmonkey](https://github.com/Netflix/chaosmonkey)（Go，与 Spinnaker 集成）。

## 代码示例一：用 Python 描述「稳态假设 + 实验」骨架

下面不是 Netflix 内部代码，而是把论文四步法翻译成可运行的**最小实验框架**：在注入故障前后拉 Prometheus 指标，判断稳态是否被破坏。

```python
from dataclasses import dataclass
from time import sleep
import random
import requests

PROM = "http://localhost:9090/api/v1/query"

@dataclass
class SteadyState:
    """稳态：错误率 < 1% 且 p99 延迟 < 500ms"""
    max_error_rate: float = 0.01
    max_p99_seconds: float = 0.5

    def observe(self) -> dict:
        err = float(requests.get(PROM, params={
            "query": 'rate(http_requests_total{status=~"5.."}[1m])'
                     '/ rate(http_requests_total[1m])'
        }).json()["data"]["result"][0]["value"][1])
        p99 = float(requests.get(PROM, params={
            "query": 'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[1m]))'
        }).json()["data"]["result"][0]["value"][1])
        return {"error_rate": err, "p99": p99}

    def is_healthy(self, m: dict) -> bool:
        return m["error_rate"] < self.max_error_rate and m["p99"] < self.max_p99_seconds

def kill_random_instance(asg_client, group_name: str) -> str:
    """混沌变量：终止一台实例（类比 Chaos Monkey）"""
    inst = random.choice(asg_client.describe_instances(group_name))
    asg_client.terminate_instance(inst)
    return inst

def run_experiment(asg_client, group_name: str) -> bool:
    steady = SteadyState()
    baseline = steady.observe()
    assert steady.is_healthy(baseline), "对照组尚未稳态，拒绝实验"

    victim = kill_random_instance(asg_client, group_name)
    print(f"injected: terminated {victim}")

    sleep(120)  # 等待流量重均衡
    after = steady.observe()
    hypothesis_holds = steady.is_healthy(after)
    print(f"baseline={baseline} after={after} hypothesis_holds={hypothesis_holds}")
    return hypothesis_holds

if __name__ == "__main__":
    ok = run_experiment(asg_client=..., group_name="api-prod")
    if not ok:
        raise SystemExit("稳态被破坏 — 需要修复冗余/超时/熔断，而非责怪实验")
```

要点：

- **先验证对照组健康**，否则实验没有基线。
- **注入后等待足够长**，让负载均衡、缓存预热、熔断器状态稳定下来再判定。
- 失败时默认是**系统设计问题**，不是「别做混沌」。

## 代码示例二：Kubernetes 上用 Litmus 做「依赖超时」实验

第二类常见变量不是杀 Pod，而是**让下游变慢或失败**（对应 FIT / 微服务降级验证）。LitmusChaos 是 CNCF 生态里常用的混沌框架；下面是一个 `NetworkChaos` 片段，对 `catalog` 服务的出站流量注入延迟：

```yaml
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: catalog-network-latency
  namespace: production
spec:
  appinfo:
    appns: production
    applabel: "app=catalog"
    appkind: deployment
  chaosServiceAccount: litmus-admin
  experiments:
    - name: pod-network-latency
      spec:
        components:
          env:
            - name: NETWORK_LATENCY
              value: "2000"          # 注入 2s 延迟
            - name: TARGET_CONTAINER
              value: "catalog"
            - name: DESTINATION_HOSTS
              value: "ratings.default.svc.cluster.local"
            - name: TOTAL_CHAOS_DURATION
              value: "300"           # 持续 5 分钟
        probe:
          - name: "checkout-success-rate"
            type: "promProbe"
            mode: "Continuous"
            promProbe/inputs:
              endpoint: "http://prometheus.monitoring:9090"
              query: |
                sum(rate(checkout_completed_total[1m]))
                / sum(rate(checkout_attempted_total[1m]))
              comparator:
                type: "float"
                criteria: ">="
                value: "0.995"         # 结账成功率仍须 ≥ 99.5%
```

这段配置体现了论文原则：

- **真实事件**：网络变慢是数据中心日常风险。
- **稳态探针**：用业务指标 `checkout_completed` 而非仅看 Pod Ready。
- **有界时长**：300 秒后自动停止，控制 blast radius。

若探针在实验期间失败，Litmus 会把实验标为失败——等价于**证伪了「ratings 慢 2 秒不影响结账」的假设**。

## 实验设计清单（上手时可打印）

1. **稳态指标是否与用户痛苦对齐？**（别只监控 CPU）
2. **爆炸半径**：能否限制在单个区域、单个集群、1% 流量（ChAP 思路）？
3. **能否一键中止？**（Kill switch、实验 TTL）
4. **是否在流量低谷先试？**（Chaos Monkey 的工作时间策略）
5. **事后有没有写 postmortem 并反哺下一批变量？**（论文强调用历史 outage 采样刺激）
6. **是否自动化到每次发布都跑？**（否则结论会腐烂）

## 与其他实践的关系

| 实践 | 与混沌工程的关系 |
|------|------------------|
| **单元 / 集成测试** | 验证「组件按 spec 工作」；混沌验证「组合在动荡下仍工作」 |
| **金丝雀发布** | 控制变更风险；混沌控制**基础设施与依赖**风险，二者互补 |
| **游戏日（Game Day）** | 常用手工、大规模演练；混沌工程强调**持续、自动化、可度量** |
| **故障注入（Fault Injection）** | 混沌工程是其上的**实验方法论 + 文化**（假设、稳态、生产、自动化） |

O'Reilly《Chaos Engineering》一书（Rosenthal、Jones 等）把 Netflix 经验推广为行业手册；Kubernetes 生态的 [Chaos Mesh](https://github.com/chaos-mesh/chaos-mesh)、[Litmus](https://litmuschaos.io/)、AWS [Fault Injection Simulator](https://aws.amazon.com/fis/) 都是同一思想的工程产品化。

## 常见误解

1. **「混沌 = 随机删生产」** — 没有假设、没有稳态度量、没有半径控制，那只是事故。
2. **「测试环境做就行」** — 测试环境缺少真实流量组合、缓存状态、租户隔离压力；论文明确偏向生产（在有保护措施的前提下）。
3. **「一次通过就永久安全」** — 代码、配置、流量模式一直在变；实验必须**持续自动化**重复。
4. **「只有大公司才需要」** — 三个微服务 + 一个 Redis 也会有级联超时；规模小反而更该用**小半径**实验养成习惯。

## 踩过的坑（Netflix 与社区共识）

1. **稳态选错**：监控 Pod 存活，却漏掉「播放启动成功率」下跌——用户已经受影响，实验却显示 green。
2. **对照组不存在**：全集群一起注入，无法区分是故障还是本来就有发布——论文四步法要求能比较实验组与对照组行为。
3. **没有超时上限**：2 秒网络延迟实验跑了 6 小时，把缓存打穿——`TOTAL_CHAOS_DURATION` 不是装饰。
4. **组织未就绪**：开发从未写过降级路径，第一次 Chaos Monkey 等于通知全公司「我们没做冗余」——文化上要先让「实例会死」成为默认假设（论文：工程师被迫把容错当日常设计）。
5. **与变更窗口打架**：在大促当天做区域级 Kong 演练 — 半径与业务日历冲突。

## 适用 vs 不适用

**适用**：

- 多实例、多依赖的在线服务（流媒体、电商、API 平台）
- 已有基本可观测性（metrics / tracing / 告警）
- 团队认同「实验可能发现 bug」而不是「实验不能失败」

**暂缓或缩小规模**：

- 尚无自动回滚、无 on-call 覆盖的单点系统
- 强监管场景下未经审批的生产实验
- 连单元测试都未绿的新服务 — 先修「确定性错误」，再探索「涌现错误」

## 延伸阅读

- 论文原文：[arXiv:1702.05843](https://arxiv.org/abs/1702.05843)
- 原则站：[principlesofchaos.org](https://principlesofchaos.org/)
- 自动化平台：[A Platform for Automating Chaos Experiments (ChAP)](https://arxiv.org/abs/1702.05849)
- 开源 Chaos Monkey：[github.com/Netflix/chaosmonkey](https://github.com/Netflix/chaosmonkey)
- 相关笔记：[[firecracker-microvm-2020]]（隔离与密度）、[[kubernetes]]（编排层承载混沌实验）、[[spanner]]（多副本一致性背景）

## 一句话总结

**混沌工程把可靠性从「祈祷生产别出事」变成「在生产中用真实流量做可证伪实验」；Netflix 用 Chaos Monkey 教会工程师「实例随时会死」，再用稳态度量与自动化把这门手艺变成持续学科。**

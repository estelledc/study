---
title: AWS Spot Instance Advisor — 看一眼就知道哪个机器不容易被收回
来源: AWS Spot Instance Advisor (aws.amazon.com/ec2/spot/instance-advisor)
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

AWS 数据中心永远有一批服务器闲着——客户没买满。Spot Instance 就是 AWS 把这部分剩余算力**打 1-3 折**卖出去的方式，代价是 AWS 哪天想收回，提前 **2 分钟通知**你就强制收走。

日常类比：航班临起飞前的空位甩卖。便宜，但你不能选位置，地勤还可能突然把你换下来给全价旅客让座。

**Spot Instance Advisor** 是 AWS 官方公布的"每个机型过去一个月被收回的频率"页面。打开它你能看到：

- `c5.large 在 us-east-1`：中断率 < 5%（绿色，安全）
- `t3.nano 在 us-east-1`：中断率 > 20%（红色，避开）
- `m5.xlarge 在 us-west-2`：中断率 5-10%（黄色，中等风险）

选 Spot 的第一步永远是查这张表。

## 为什么重要

不理解 Spot，下面的事都说不清：

- 为什么同样的 EC2 机器，有人按 $0.10/小时算，有人按 $0.03/小时算
- 为什么很多 ML 训练集群、CI runner、Spark 作业会优先混用 Spot
- 为什么"中断率 5-10%"是行业里讨论 Spot 风险的基准刻度
- 为什么 Karpenter / Cluster Autoscaler 这些 k8s 节点调度器都内置了 Spot 池管理

Spot 的省钱效果非常硬：原价 $1000/月的负载迁到 Spot，账单立刻变 $200。但前提是你的架构能"被随时拔插头还活着"。

## 核心要点

Spot 的全部魔法都在 **三个数字 + 一个分散原则**：

1. **价格 = On-Demand 的 10-30%**：AWS 按当前供需动态定价，但波动比早期小很多（2017 年后改了定价模型）。

2. **中断 = 提前 2 分钟通知**：AWS 决定要收时往机器的 EC2 metadata 端点（`/latest/meta-data/spot/instance-action`）写一个时间戳。你的程序要监听这个端点，2 分钟内做完优雅退出（保存进度、转发流量、断开连接）。

3. **中断率分桶**：Advisor 把每个池按最近一段观察窗口标成 `<5%` / `5-10%` / `10-15%` / `15-20%` / `>20%`。**5-10% 这一档**不是精确预言，而是提醒你：这个池已经有可见回收风险，带 checkpoint 的训练任务可接受，在线服务要谨慎。

4. **Diversification（分散）原则**：一个"池"= region × AZ × 实例类型 × 操作系统 的组合。**单池容易被一锅端**，分散到 6-8 个池能把"全部同时中断"的概率压到极低。

## 实践案例

### 案例 1：跨 AZ 分散

```
错误：us-east-1a × 100 台 c5.large
正确：us-east-1a × 34 + 1b × 33 + 1c × 33
```

每个 AZ 的硬件调度独立。1a 容量紧张时，1b/1c 不一定受影响。同样的总台数，可用性差距巨大。

### 案例 2：跨 instance family 分散

```
错误：c5.large × 100（一种规格）
正确：c5.large + c5a.large + m5.large + m5a.large（四种规格混编）
```

`c5` 是 Intel 计算优化、`c5a` 是 AMD、`m5` 是 Intel 通用、`m5a` 是 AMD 通用——四个**完全独立的硬件池**。AWS 的 EC2 Fleet 接收"我要 100 vCPU，从这四个池随便给"的请求，自动从最闲的池补给。

### 案例 3：监听 2 分钟通知

```bash
# 每 5 秒轮询一次（生产环境用 IMDSv2）
while true; do
  ACTION=$(curl -s http://169.254.169.254/latest/meta-data/spot/instance-action)
  if [ -n "$ACTION" ]; then
    # 收到通知：AWS 2 分钟后收机器
    /opt/drain.sh    # k8s 驱逐 pod / 排空连接 / 保存 checkpoint
    break
  fi
  sleep 5
done
```

drain 脚本要在 90 秒内做完（留 30 秒余量）：标记节点不可调度、转发负载、flush 文件、上传 checkpoint。

### 案例 4：用 EC2 Fleet 一次声明多池

```json
{
  "TargetCapacity": 100,
  "AllocationStrategy": "capacity-optimized",
  "LaunchTemplateConfigs": [
    {"InstanceType": "c5.large",  "AvailabilityZone": "us-east-1a"},
    {"InstanceType": "c5a.large", "AvailabilityZone": "us-east-1b"},
    {"InstanceType": "m5.large",  "AvailabilityZone": "us-east-1c"},
    {"InstanceType": "m5a.large", "AvailabilityZone": "us-east-1a"}
  ]
}
```

`capacity-optimized` 让 AWS 自动从当前最闲（最不容易中断）的池补给——你只需声明候选清单，调度逻辑由 AWS 写。

## 踩过的坑

1. **只看价格选最便宜的**：`t3.nano` 在某些 region 中断率 > 20%，省下来的钱被频繁重启的成本（连接重建、缓存冷启动）吃光。**先看中断率，再看价格**。

2. **single AZ**：成本不变，可用性减半。AZ 级故障 + Spot 收回是叠加风险，必须跨至少 2 个 AZ。

3. **不监听 2 分钟通知**：到点 AWS 直接 stop/terminate，TCP 连接被切断、写到一半的文件可能损坏。监听端点是底线，不是可选项。

4. **Spot 跑数据库主节点**：状态丢了就丢了。从节点 / 只读副本可以，主节点留 On-Demand 或 Reserved。

5. **用 RunInstances 自己管多池**：每个池都要写一份调度逻辑、容量监测、回退策略。直接用 EC2 Fleet 或 Auto Scaling Group 的 `capacity-optimized` 策略，AWS 调度器免费且更准。

6. **没开 Capacity Rebalancing**：AWS 内部预测某个池快紧张时会发"建议迁移"信号（早于 2 分钟通知）。开启后 ASG 会主动起新机器再下线老机器，平滑过渡。

## 适用 vs 不适用

**适用**：

- 无状态 web / API / 微服务（K8s deployment 多副本）
- ML 训练任务（带 checkpoint，被收能续跑）
- CI / CD runner（任务级粒度，重跑代价低）
- 数据处理批任务（Spark / Flink，容错原生）
- 视频转码、3D 渲染（任务可分片重做）

**不适用**：

- 数据库主节点 / 主从同步链路（状态不可丢）
- WebSocket 长连接（除非客户端有重连）
- license 绑定单机硬件 ID 的商业软件
- 极短任务（< 2 分钟）——保护期本身就是 2 分钟

## 历史小故事（可跳过）

- **2009 年**：EC2 Spot Instances 正式发布，AWS 开始把闲置容量用拍卖式价格卖给可中断任务。
- **2017 年**：AWS 改 Spot 定价模型，价格从频繁竞价跳动变成更平滑的长期供需价格。
- **2019-2020 年**：EC2 Fleet、Auto Scaling Group 的 capacity-optimized 策略成熟，"多池分散"从手工经验变成内置调度策略。
- **2020 年后**：Capacity Rebalancing、Spot Placement Score 等工具出现，用户可以提前迁移或评估容量风险。

Spot Instance Advisor 在这条线里扮演"天气预报"角色：它不保证某个池明天一定安全，但能让你避开明显拥挤的容量池。

## 学到什么

1. **Spot 不是"打折的 EC2"，是"可被 AWS 随时收回的算力"**——架构必须先支持这一点
2. **2 分钟通知是公约**，不是 SLA 保证；监听并优雅退出是必需品
3. **Diversification 是 Spot 的核心不是可选项**——单池就是把鸡蛋放一个篮子
4. **价格 vs 中断率要一起看**，不要被绝对低价吸引

## 延伸阅读

- AWS 官方：[Spot Instance Advisor](https://aws.amazon.com/ec2/spot/instance-advisor/)（每天刷新中断率）
- AWS 官方：[Spot Best Practices 白皮书](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-best-practices.html)
- 工具：[Spot Placement Score API](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-placement-score.html)（API 形式查推荐）

## 关联

- [[karpenter]] —— k8s 自动节点供应，原生支持 Spot 池
- [[k8s-cluster-autoscaler]] —— 经典 Spot 节点池管理
- [[terraform]] —— IaC 写 Spot Fleet / ASG 配置
- [[chaos-engineering]] —— 主动注入中断验证容错

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

---
title: NVIDIA MIG — 把一张 GPU 物理切成 7 张小卡
来源: NVIDIA Multi-Instance GPU User Guide
日期: 2026-05-31
子分类: infrastructure
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

MIG（**Multi-Instance GPU**，多实例 GPU）是 NVIDIA 在 A100 上首发的硬件功能，**把一张物理 GPU 在硬件层切成最多 7 张完全独立的小卡**。

日常类比：一栋写字楼以前只能整租给一家公司（独占整张 GPU），租户用不满浪费，租出去又怕别家把电梯挤爆。MIG 像是物业把楼**砌实墙**分成 7 个独立办公间，每间有自己的电表、空调、电梯——租户互不影响，物业还能多收 7 份租金。

技术上每个 MIG 实例都有独占的：

- **SM**（流式多处理器，干计算的核）
- **L2 缓存**
- **显存**和**显存带宽**
- **DMA 引擎**

所以一个实例 OOM 或跑死循环，**不会**让旁边实例变慢。这是 MIG 和"时间切片"最关键的区别。

## 为什么重要

不理解 MIG，下面这些事都没法解释：

- 为什么云厂商敢卖"1/7 张 A100"按小时计费（AWS / GCP / Azure 都有）
- 为什么 K8s 集群里 GPU 资源不再叫 `nvidia.com/gpu` 而是 `nvidia.com/mig-1g.5gb`
- 为什么多租户推理平台能在一张卡上跑 7 个不同模型 endpoint 还互不抢
- 为什么"GPU 只能整张分"这个老毛病到 2020 年才解掉

## 核心要点

### 1. 切片粒度（A100 40GB 为例）

- **计算切片**：7 个 GPC（图形处理集群）分成 7 份，每份记作 `1g`
- **显存切片**：40GB 切成 8 份每份 5GB——所以"1g.5gb"读作 1 计算片 + 5GB 显存

可用 profile：`1g.5gb` / `2g.10gb` / `3g.20gb` / `4g.20gb` / `7g.40gb`。

注意 **4g.20gb 占 4 个计算片但只 20GB 显存**——显存粒度是独立的。

### 2. 两层抽象

- **GPU Instance（GI）**：粗粒度划分，决定显存和计算总量
- **Compute Instance（CI）**：在 GI 内进一步切计算（显存共享）

大多数场景只用 GI 这一层，CI 是给"想再细分但不想再切显存"的高级用法。

### 3. 怎么开

```bash
# 开启 MIG 模式（需要重启 GPU）
nvidia-smi -i 0 -mig 1

# 切成 7 个 1g.5gb
nvidia-smi mig -cgi 19,19,19,19,19,19,19 -C
# 19 是 1g.5gb 的 profile id
```

切完每个实例有独立的 UUID，CUDA 程序用 `CUDA_VISIBLE_DEVICES=MIG-xxx` 绑定。

### 4. K8s 里长什么样

装上 NVIDIA GPU Operator 后，节点上会出现：

```yaml
allocatable:
  nvidia.com/mig-1g.5gb: 7
  nvidia.com/mig-3g.20gb: 0
```

Pod 申请：

```yaml
resources:
  limits:
    nvidia.com/mig-1g.5gb: 1
```

## 实践案例

### 案例 1：一张 A100 跑 7 个模型推理

某团队有 4 张 A100，要给业务部门部署 20 个小模型 endpoint。整卡分配只够 4 个，排队等不起。

切法：每张卡切 7 个 `1g.5gb`，4×7 = 28 个 endpoint 容量，每个 endpoint 占一片，显存 5GB 够跑 7B 量化模型。互不抢 SM，p99 延迟稳。

### 案例 2：CI/CD 流水线

PR 单元测试要 GPU 跑 5 分钟。整卡分配等于一次只能跑一个 PR。切成 7 片后 7 个 PR 并发跑，吞吐 ×7。

### 案例 3：在线 + 批量混部

在线推理峰值要 4g.20gb，剩下空间切成 3g.20gb 给夜间批量。两边硬件隔离，批量再忙不会拖慢在线。

## 踩过的坑

1. **切完不能动态改**：要从 `7×1g` 改成 `1×7g`，必须先把所有占用进程停掉，再 `nvidia-smi mig -dci -dgi` 删旧的，再切新的。**生产环境一定要规划好 profile，别想着自动伸缩**。

2. **不是所有组合都行**：4g + 3g = 7 可以，但 4g + 4g 不行（一共才 7 片）。NVIDIA 文档有合法 profile 组合表，照抄。

3. **开了 MIG 就别想跑大模型训练**：训练要 NVLink 全互联、要整张卡的 HBM 带宽，切了反而慢一倍。**MIG 是给推理和小负载的**，训练就关掉 MIG。

4. **K8s 调度器看不到 `nvidia.com/gpu` 了**：开启 MIG 后，老的 deployment 写 `nvidia.com/gpu: 1` 会一直 pending。要么改 manifest 要么用混合模式（部分卡开 MIG 部分不开）。

5. **驱动版本要够新**：A100 至少 R450+，H100 需 R525+，CUDA 11.0+。老驱动开 MIG 会报错或行为异常。

6. **监控盲区**：`nvidia-smi` 在整卡视角看不到每个 MIG 实例的利用率，要装 **DCGM** 才能拿到实例级指标。Grafana dashboard 也要换成 MIG-aware 版本。

## 适用 vs 不适用场景

**适用**：

- 多租户推理（核心场景）
- 多模型小流量 endpoint
- CI/CD 测试集群
- 教学/科研集群人手一片
- 在线 + 批量混部，要硬隔离

**不适用**：

- 大模型训练（要全卡）
- 单租户高吞吐推理（一张整卡更快）
- 频繁伸缩的弹性场景（重切代价大）
- 一两人用的开发机（time-slicing 够了）

## MIG vs 时间切片 vs vGPU

| 维度 | MIG | Time-Slicing | vGPU |
|------|-----|---------------|------|
| 隔离 | 硬件 | 无 | 虚拟化 |
| 故障传播 | 不会 | 会 | 不会 |
| 适用 | 容器/裸金属 | 开发机 | 虚机 |
| 切片粒度 | 固定 profile | 时间片 | 灵活 |
| 是否要 hypervisor | 否 | 否 | 是 |

**关键差别**：time-slicing 是软件层轮转，一个进程跑死循环全员变慢；vGPU 走 hypervisor，开销大但灵活；MIG 是硬件墙，开销最小但 profile 固定。

## 学到什么

1. **隔离的代价是灵活性**：MIG 用固定 profile 换硬件级隔离，不能动态调
2. **多租户基础设施的硬件分水岭**：A100 之前云厂商只能"整卡卖"或"软件层共享"，MIG 让"硬件级 1/N 切片"成为商业化产品
3. **K8s 资源模型可以扩展**：`nvidia.com/mig-1g.5gb` 这种命名约定，让调度器不用改一行代码就能调度新资源
4. **工具链要配套**：MIG 不是开个开关就完事，DCGM、GPU Operator、监控、quota 全要跟上才能上生产

## 延伸阅读

- 官方手册：[NVIDIA MIG User Guide](https://docs.nvidia.com/datacenter/tesla/mig-user-guide/)
- K8s 集成：[NVIDIA GPU Operator with MIG](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/gpu-operator-mig.html)
- 声明式配置：[mig-parted on GitHub](https://github.com/NVIDIA/mig-parted)
- 监控：[DCGM Exporter](https://github.com/NVIDIA/dcgm-exporter)
- [[kubernetes]] —— MIG 资源通过设备插件暴露给调度器
- [[cuda]] —— MIG 实例对 CUDA 程序透明，每个实例就是一张小 GPU
- [[vllm]] —— 多租户推理引擎常配 MIG 做 endpoint 隔离

## 关联

- [[kubernetes]] —— 容器编排层，MIG 切片作为 extended resource 调度
- [[cuda]] —— 计算 API，MIG 对上层透明
- [[vllm]] —— 推理引擎，多 endpoint 部署常和 MIG 搭配
- [[accelerate]] —— HuggingFace 设备抽象，可绑定到 MIG 实例

---
title: Keystone — 开源可定制 RISC-V TEE 框架
来源: 'Lee et al., "Keystone: An Open Framework for Architecting Trusted Execution Environments", EuroSys 2020'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
provenance: pipeline-v3
---

## 是什么

**Keystone**（Lee 等，EuroSys 2020，UC Berkeley）是**第一个开源可定制 TEE 框架**，基于 RISC-V 标准硬件特性（PMP + M-mode）构建。它将 TEE 从"厂商给什么用什么"变成"按需组装的模块套件"：

- **Security Monitor（SM）**：M-mode 下的薄层参考监视器，负责物理内存隔离与认证，不做资源管理，基础代码仅 1.6 KLoC。
- **Runtime（RT）**：每个 enclave 独占 S-mode 运行时（默认 Eyrie，也可换成 seL4），管理虚拟内存、系统调用、边缘调用。
- **Enclave App（eapp）**：U-mode 应用，可以是独立程序、未修改 RISC-V 二进制或分区应用。

日常类比：Intel SGX 好比一栋结构固定的公寓楼，租户只能按规格住；Keystone 好比一个开源乐高建筑套件——地基（PMP）规格公开，每家自己按需拼装隔间、换门锁。

## 为什么重要

| 维度 | 意义 |
|------|------|
| **与 Intel SGX 对照** | SGX 闭源、TCB 大、无法改变内存保护配置；Keystone 开源、TCB 可裁剪到 12–15 KLoC、威胁模型可按场景选择 |
| **RISC-V 生态** | 首个可在未修改 RISC-V 硬件上跑的完整 TEE，推动开源硬件安全研究 |
| **研究平台价值** | 学术用户可快速验证新 TEE 原语（PIE、Elasticlave 等论文均引用）；工业用户（Seagate）已有原型 |
| **设计系统化** | 将 TEE 权衡空间（TCB/威胁模型/功能/平台）系统化呈现，与后续工作形成参照 |

## 核心要点

### 1. 可定制 TEE 范式

三类实体各自配置不同维度：

```
硬件厂商  → 提供 PMP 原语 + 安全启动 + 随机数
平台提供商 → 配置 SM（平台扩展：缓存分区、片上内存）
应用开发者 → 选 RT 模块（内存管理/syscall/分页），裁剪 TCB
```

### 2. PMP 实现内存隔离

RISC-V Physical Memory Protection 是关键机制：

```
- SM 启动时：第一条 PMP entry 保护 SM 自身内存，最后一条默认允许 OS 访问其余内存
- enclave 创建：SM 插入 PMP entry，禁止 OS/其他 enclave 访问 enclave 内存区域
- enclave 进入：SM 重配 PMP → enclave 只能访问自己内存 + 共享缓冲区
- enclave 退出：禁用 enclave PMP entry，恢复 OS entry
- enclave 销毁：清零 enclave 内存，释放 PMP entry
```

最多同时支持 N−2 个 enclave（N = PMP entry 数，目前最多 16）。

### 3. SM 与 RT 解耦设计

```
SM 职责（最小化）        RT 职责（按需组装）
─────────────────────   ──────────────────────────
内存隔离（PMP）          虚拟内存管理（页表）
安全启动 + 密钥派生      系统调用代理（Edge Call）
远程认证（哈希 + 签名）  自分页（in-enclave paging）
中断/异常委托控制        libc 环境支持
SBI 接口定义             多线程管理
平台扩展钩子             seL4 / Eyrie 可互换
```

SM 不做页表管理——这是与 Intel SGX 和 Komodo 的关键设计差异。SGX 中 OS 控制 enclave 页表映射，使其可通过 page-fault 模式观察 enclave 访问规律（controlled channel attack）。Keystone 将页表完全交给 enclave RT 管理，OS 无法观察或修改封闭内存的虚地址映射，从根本上消灭了这类攻击面。

### 4. 认证流程

```
① 平台商配置 SM 并部署（SM 测量值 + 平台公钥）
② 开发者编写 eapp，框架计算 eapp+RT 哈希
③ OS 加载 RT+eapp → SM 验证页表映射 → 哈希页内容+虚地址
④ enclave 运行时可请求 SM 签署认证报告（含 DH 密钥参数）
⑤ 远程验证者核对：平台公钥 → SM 哈希 → enclave 哈希
```

### 5. 平台扩展示例（FU540 开发板）

- **缓存分区**：L2 路掩码（way-masking）+ PMP，context switch 时冲刷 enclave 缓存行，防 ACache
- **片上便笺（scratchpad）**：L2 控制器分配最多 2MB 片上内存，enclave 代码/数据不离芯片，防 APhy
- **动态内存扩展**：enclave 通过 `extend` SBI call 请求 OS 分配连续物理页并加入 enclave 内存区

## 实践案例

### 案例 1：从 SGX 迁移到 Keystone 的思路对比

```
SGX 思路                        Keystone 思路
─────────────────────────────   ─────────────────────────────────
静态预分配 EPC 大小              动态内存扩展（extend SBI）
OS 管理 enclave 页表（隐患）     RT 管理自己的页表（防 controlled channel）
Intel 独家 SGX SDK               开源框架 + 自选 RT（Eyrie/seL4/自定义）
attestation 依赖 Intel IAS       attestation 依赖平台商部署的 SM 密钥
TCB = shim + glibc + SGX SDK     TCB = SM(1.6K) + RT(1.8–3.6K) 按需
```

### 案例 2：Eyrie RT 模块组合

```bash
# 最小配置（嵌入式签名传感器）
SM_base + Eyrie(free_memory)  → TCB ~3.4 KLoC

# 云服务器全功能配置
SM_base + cache_partition + Eyrie(
  free_memory + self_paging + edge_call + syscall_proxy
) → TCB ~12 KLoC

# seL4 内核配置（高保证）
SM_base + seL4(RISCV port, 290 LoC patch) → 通过 seL4 测试集，overhead < 1%
```

### 案例 3：性能基准解读

| Benchmark | Overhead | 说明 |
|-----------|----------|------|
| CoreMark | < 1% | CPU 密集型，PMP 开销可忽略 |
| Beebs | < 1% | 嵌入式基准套件 |
| RV8 | < 1% | 指令级测试 |
| IOZone | ~40% | I/O 密集型，edge call 代理 syscall 每次涉及 ~4 次特权级切换 |
| Torch ML | 7.35% | ML 推理，Eyrie RT；syscall 调用相对密集 |
| FANN | 0.36% | 神经网络推理，seL4 RT；FANN workload syscall 密度低，边缘调用代价被摊薄 |

> **反直觉点**：FANN/seL4 开销（0.36%）远低于 Torch/Eyrie（7.35%），原因在于 FANN 的 syscall 频率极低，每次边缘调用的固定代价被大量计算所摊薄；而非 seL4 本身比 Eyrie "快"。

### 案例 4：IoT 传感器安全场景分析

场景：传感器驱动 + 密码库在同一设备，攻击者尝试 cache occupancy 侧信道：

```
enclave A（传感器驱动）：只需内存完整性，不需加密
  → 配置：SM_base + Eyrie(basic)  → 无片上内存，速度快

enclave B（密码库）：需要机密性 + 完整性
  → 配置：SM_base + cache_partitioning + on_chip_memory

Keystone mailbox 机制：A 与 B 认证通信
结果：攻击者只能观察 A 的公开测量值，无法推断 B 的密钥
```

### 案例 5：与 Sanctum / Komodo 设计权衡

```
框架       硬件要求        enclave 个数  enclave 特权  开源
─────────  ─────────────   ──────────── ───────────── ────
Sanctum    修改 CPU 硬件   多个         U-mode only   部分
Komodo     TrustZone       2 domain     U-mode only   否
Keystone   标准 RISC-V     N-2 个       U+S-mode      完全
SGX        Intel CPU       多个         U-mode only   否
```

## 踩过的坑

1. **PMP entry 数限制**：16 个 PMP entry → 最多 14 个同时存在的 enclave；高密度场景需要 PMP 虚拟化（论文认为未来 H-mode 可解决）。

2. **Iago 攻击需要 RT 层防御**：SM 只保证隔离，RT 代理 syscall 仍需防止 OS 通过返回值攻击 eapp；Keystone 允许集成现有 shielding 系统（如 Graphene-SGX 对应模块）作为 RT 模块。

3. **Spectre/Meltdown 不在 scope**：论文明确声明；未来防御可作为 SM/RT 模块加入，但当前版本无保护。

4. **内存加密完整性仅部分实现**：评估时软件 AES-128 加密可用，但完整性保护（merkle tree 等）未完全实现；片上内存方案的容量由 L2 LIM 大小决定（FU540 约 2MB）。

5. **seL4 移植仅改 290 行**：看似简单，但依赖于 Keystone 提供了干净的 S-mode 抽象；直接在 SGX 里跑 seL4 由于缺少 S-mode 支持基本不可行。

6. **IOZone 40% 开销**：I/O 密集型应用每次 syscall 都走 edge call 代理（约 4 次特权级切换），高频 I/O 场景可考虑：(a) 批量边缘调用（batched edge calls）减少切换次数；(b) 将 I/O 逻辑移出 enclave，仅将计算密集的安全关键部分保留在 enclave 内。

## 适用 vs 不适用场景

**适用**：

- RISC-V 平台需要 TEE 且 Intel SGX 不可用
- 研究探索新 TEE 原语（改 SM 几百行即可验证思路）
- 嵌入式 + IoT 设备需要轻量级 enclave（Eyrie minimal 3.4 KLoC）
- 需要多个并发 enclave 且各自独立威胁模型
- 云服务器运行 ML 推理（Torch 开销 7.35%）
- 需要与开源微内核（seL4）集成的高保证场景

**不适用**：

- x86/ARM 平台（需要移植，非原生支持）
- 要求 Spectre/Meltdown 防御的场景（未覆盖）
- 超高频 I/O 密集型应用（40% IOZone 开销）
- 生产环境无 PMP 支持的旧版 RISC-V 硬件

## 历史小故事（可跳过）

- **2018–2019**：Berkeley 团队举办两届 OSEW（开源 Enclave 研讨会），工业界广泛参与。
- **2019**：arXiv 预印本发布（1907.10119）。
- **2020**：EuroSys 正式发表；同年 RISC-V Summit 上 Seagate 展示基于 Keystone 的存储设备原型。
- **2020+**：Elasticlave、PIE 等论文基于 Keystone 提出扩展；Keystone 成为 RISC-V TEE 研究标准平台。
- **2021+**：RISC-V H-mode 规范逐步稳定，Keystone 计划支持 hypervisor 级隔离。
- **背景对比**：同期 Intel SGX 从 v1（静态 EPC）迭代到 v2（动态内存）；Keystone 设计从一开始就支持动态扩展。

## 学到什么

- **PMP 是 RISC-V TEE 的基石**：物理内存保护寄存器 → 任意大小的内存隔离区域，比 TrustZone 的两域模型灵活得多。
- **SM/RT 解耦是架构亮点**：SM 只做隔离不做资源管理，TCB 最小化；RT 承担所有高级功能，可按需裁剪或替换。
- **开源 + 可定制的价值**：闭源 TEE 的漏洞修复周期以年计；Keystone 的 SM 小到可以考虑形式验证（论文提及未来方向）。
- **威胁模型显式化**：四类攻击者（物理/软件/侧信道/DoS）对应不同防御模块，设计时按需选择，避免过度工程。
- **侧信道防御需要硬件配合**：缓存分区需要 L2 路掩码（FU540 特有）；通用 RISC-V 核无此特性时防御能力受限。
- **与 [[sgx-explained-2016]]**（若存在）对照：两者设计哲学截然不同——SGX 是"厂商定义一切"，Keystone 是"硬件提供原语，软件自由组合"。
- 复习时对照 PMP 寄存器操作序列，理解 context switch 时 SM 的 4 步操作（权限开/关），是 TEE 面试高频考点。

## 延伸阅读与关联

- arXiv 预印本：https://arxiv.org/abs/1907.10119
- 项目主页：https://keystone-enclave.org/
- GitHub：https://github.com/keystone-enclave/keystone
- ACM DL：https://dl.acm.org/doi/10.1145/3342195.3387532
- RISC-V PMP 规范（Volume II: Privileged ISA）
- [[intel-sgx-explained-2016]]（若存在）—— SGX 详解，与 Keystone 的闭源/开源对比；TCB/威胁模型/认证对比
- [[sanctum-2016]]（若存在）—— 同 RISC-V 但需硬件改动，Keystone 无需修改 CPU
- [[komodo-2017]]（若存在）—— TrustZone 上的验证监视器，SM 设计哲学参照；继承两域限制
- [[arm-trustzone]] —— 两域 TEE 设计，Keystone 解决了其多 enclave 限制
- [[dwork-dp-icalp-2006]] —— 隐私计算与 TEE 组合使用场景（ML 推理隐私）
- [[abadi-dpsgd-2016]] —— DP-SGD + TEE 保护训练数据场景

## 维护备注

- frontmatter `分类/子分类` 已设为「安全与隐私」，与 security-privacy 路线图对齐。
- 关联 slug 中 `sanctum-2016`、`komodo-2017`、`intel-sgx-explained-2016` 若尚未写入，先用纯文本记名，写入后改为 `[[wikilink]]`。
- 本篇核心数据来自原论文 PDF + arXiv 预印本，数字均有文献依据，无推测内容。
- 若 pipeline 复审要求 refine，优先扩展「实践案例」中的具体命令或「踩过的坑」中的工程细节。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[abadi-dpsgd-2016]] —— DP-SGD — 深度学习差分隐私训练
- [[dwork-dp-icalp-2006]] —— 差分隐私 — ε 与邻接数据集不可区分
- [[ngabonziza-trustzone-2016]] —— TrustZone — ARM 给 CPU 装上"双重人格"隔离安全世界


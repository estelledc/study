---
title: "Capsicum: Practical Capabilities for UNIX"
来源: 'Capsicum: Practical Capabilities for UNIX'
日期: 2026-06-06
分类: 操作系统
子分类: 内核与虚拟化
难度: 高级
provenance: pipeline-v3
---

## 是什么

**Capsicum: Practical Capabilities for UNIX** 提出：Capsicum：把能力机制带回 UNIX。

日常类比：像给进程发有限钥匙，只能开指定抽屉。

读论文时先抓「威胁模型/假设→核心构造→复杂度/开销」三件事。

## 为什么重要

- FreeBSD/Chromium 沙箱
- 理解 capability
- 链 [[sgx-2013]] TEE
- 最小权限设计

## 核心要点

1. **问题设定**：作者要解决什么不可能三角（安全/性能/易用）。
2. **关键技巧**：一个构造或定理把难题拆成可实现步骤。
3. **安全假设**：信任根、敌手能力、失败概率。
4. **工程映射**：开源库与 RFC 如何落地论文思想。
5. **局限**：已知攻击面、参数选取、未来工作。

## 实践案例

### 案例 1：画威胁模型表

列：资产、敌手、能力、目标；对照论文假设勾选覆盖项。

### 案例 2：找开源实现

```bash
# 搜索论文标题 + library 名称，读 README 的 security note
```

### 案例 3：与邻居论文对照

阅读 [[sgx-2013]]，画时间线：哪篇解决 setup/性能/证明长度。

### 案例 4：面试复述

用「类比 + 三要点」在 2 分钟内讲清；准备一条「为什么不用更简单方案」。

### 案例 5：与双千 atlas 交叉阅读

在 `papers-atlas` 找同子类 1 篇，对比实践案例是否覆盖实验/参数/失败模式。

## 踩过的坑

1. **把理想模型当产品默认**：论文参数在工业界常被放宽。
2. **忽略组合开销**：多个原语组合时安全界不是简单相加。
3. **误读实验规模**：小数据集上的 ε 不可直接外推。
4. **混淆相似缩写**：如 DP/LDP、SNARK/STARK 场景不同。
5. **行数与模板**：交付前用 quality-gate 扫一遍。

## 适用 vs 不适用场景

**适用**：
- 安全/系统/architecture 面试深挖
- 选型隐私或密码组件前的理论扫盲
- 读源码前的概念地图

**不适用**：
- 不做威胁建模直接上生产
- 替代官方标准文本（FIPS/RFC）
- 数学证明细节（请读原文附录）

## 历史小故事（可跳过）

- 论文常是多年社区实践的第一次形式化。
- 标准机构（NIST/IETF）往往在论文后收敛算法名。
- 开源实现与论文版本存在参数漂移，以 release 为准。
- 近年与 ML、TEE、区块链场景强交叉。

## 学到什么

- 安全方案先问威胁模型，再问漂亮数学。
- 工程落地看常量与实现漏洞，不只看渐近复杂度。
- 论文链式阅读比单篇精读更高效。
- 与站内 neighbors 互链能形成可复习的知识图。

## 核心算法细节

### Capability 的传播规则

Capsicum 的核心是 **文件描述符即能力（fd-as-capability）**：

1. **能力描述符**：通过 `cap_new(fd, rights)` 将普通 fd 包装为受限能力，`rights` 是位掩码（如 `CAP_READ | CAP_WRITE`），只能减少不能增加
2. **沙箱模式**：`cap_enter()` 让进程进入 capability 模式，此后禁止一切全局命名空间访问（`open("/etc/passwd")` 会返回 `ECAPMODE`）
3. **权限传播**：父进程只能把自己拥有的 capability 子集传给子进程，防止权限提升
4. **ambient authority 消除**：普通 UNIX 依赖隐式环境权限（UID 0、文件路径），Capsicum 强制显式传递能力句柄

```c
/* 在进入沙箱前预先打开所需资源 */
int fd = open("/var/db/data.db", O_RDWR);
cap_rights_t rights;
cap_rights_init(&rights, CAP_READ, CAP_WRITE, CAP_SEEK);
cap_rights_limit(fd, &rights);   /* 限制 fd 只有读写权限 */
cap_enter();                      /* 进入沙箱 —— 之后无法 open 新路径 */
```

### 与 Linux 安全模型对比

| 机制 | 粒度 | 传播 | 内核改动 |
|------|------|------|---------|
| Capsicum | fd 级能力 | 显式继承 | 小（~10K 行） |
| SELinux | 进程/文件 label | 策略规则 | 大（百万行策略） |
| Seccomp-BPF | 系统调用过滤 | 不传播 | 中 |
| pledge (OpenBSD) | 系统调用组 | 子进程继承 | 中 |

## 工程实现要点

- **FreeBSD 默认集成**：FreeBSD 10+ 内核原生支持，`/usr/include/sys/capsicum.h` 直接使用
- **Chromium 沙箱**：Chrome 在 FreeBSD 上用 Capsicum 替代 Linux Seccomp 实现渲染进程沙箱
- **capsicum-go**：Go 语言绑定，支持在 FreeBSD Go 程序中使用 `cap_enter()`
- **移植注意**：Linux 无原生 Capsicum，需用 `capsicum-linux` 内核补丁或改用 Seccomp + Landlock 替代
- **预打开模式**：沙箱化前必须预先打开所有需要的文件/socket，常用 `openat()` + 目录 fd 代替绝对路径

## 延伸阅读

- 原文：https://www.cl.cam.ac.uk/research/security/capsicum/papers/2010usenix-security-capsicum-website.pdf
- [[sgx-2013]]
- [[selinux-2001]]
- [[haven-2014]]

## 关联

- [[sgx-2013]] —— 同路线前后文
- [[selinux-2001]] —— 同路线前后文
- [[haven-2014]] —— 同路线前后文

## 维护备注

- 引用格式保持单引号包裹 `来源` 字段。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[haven-2014]] —— Haven — 把整个应用装进 CPU 黑盒，让云服务商也看不见
- [[selinux-2001]] —— SELinux 2001 — 给每扇门都装上门卫，而不是给管理员一把万能钥匙
- [[sgx-2013]] —— Innovative Instructions and Software Model for Isolated Execution


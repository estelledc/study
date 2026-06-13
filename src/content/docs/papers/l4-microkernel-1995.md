---
title: On Micro-Kernel Construction (L4) — 微内核该怎么「造」
来源: https://os.itec.kit.edu/downloads/sosp95-mkernel-construction.pdf
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
provenance: pipeline-v3
---

## 先想成什么事

想象一栋**大型联合办公楼**：

- **宏内核**（传统 Linux、早期 UNIX）像一家什么都自己干的物业总控：保安、保洁、快递、会议室预订、网络运维、门禁发卡全挤在一间值班室。楼里任何小事都要敲总控室的门；门一开一关本身就很贵，值班室人越多，互相挡路越严重。
- **微内核**的思路是：值班室只保留**绝对少不了**的几件事——谁能在哪块区域活动、怎么把纸条递给隔壁工位、CPU 时间怎么轮转。文件系统、网络栈、设备驱动全部交给楼里的**独立服务商**（用户态 server），各管各的，崩了一个不至于拖垮整栋楼。

到 1995 年，微内核已经折腾了二十多年（Brinch Hansen、HYDRA、CMU Mach……），但口碑很差。大家普遍相信：

1. 微内核**天生慢**——用户态和内核态来回切、地址空间来回换，IPC 开销大。
2. 微内核**不够灵活**——接口太瘦，复杂系统还是得把功能塞回内核。

Jochen Liedtke 在 SOSP '95 发表的 *On Micro-Kernel Construction*，正是对着这两句「常识」下刀。论文不只是一份 L4 说明书，更是一份**微内核概念清单 + 性能辩护书 + 可移植性反论**：慢不是微内核思想的罪，而是 Mach 等实现**内核塞太满、写太糙**的罪。

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 作者 | Jochen Liedtke（GMD，德国国家信息技术研究中心） |
| 场合 | SOSP '95，Copper Mountain Resort, Colorado |
| 页码 | 237–250 |
| DOI | [10.1145/224056.224075](https://doi.org/10.1145/224056.224075) |
| 前身 | L3 微内核（1993 年已展示比 Mach 快一个数量级的 IPC） |
| 核心论点 | 低效与僵化来自**过载的内核**和**不当实现**，而非微内核范式本身 |

论文结构：

1. **§2 概念**：从功能需求推导最小原语（地址空间、线程、IPC、唯一 ID）
2. **§3 灵活性**：分页、驱动、Unix 仿真、多媒体分配都可用户态堆叠
3. **§4 性能**：拆解 kernel-user 切换、地址空间切换、IPC 的周期账
4. **§5 可移植性**：微内核**本身不该**无脑跨 CPU 移植，但整系统因 server 可移植而更易迁移

## 为什么值得读

| 今天的现象 | 与这篇论文的关系 |
|------------|------------------|
| seL4 形式化验证 | 最小 TCB 来自本文的最小性原则 |
| Tanenbaum vs Linus 论战 | Liedtke 用 L4 数据反驳「微内核必然慢」 |
| macOS XNU 的 `mach_msg` | Mach 消息遗产；L4 是「Mach 太慢」后的极简矫正 |
| Fuchsia Zircon、QNX | 同谱系：消息 + 能力 + 用户态驱动 |
| L4Linux ~5% 性能损失 vs MkLinux 数倍惩罚 | 根子在 µ-kernel 路径是否够短 |

## 核心概念一：最小性原则

> 一个概念只有在其**移出内核、允许竞争实现**会导致**无法实现系统必需功能**时，才允许留在 µ-kernel 里。

系统假设：页式虚存 + 需要保护（不可信/交互式应用）。由此推出两条安全原则：

- **独立性**：子系统 S 能给保证，不被其它子系统 S' 干扰或破坏
- **完整性**：S₁ 能与 S₂ 建立**不被 S' 窃听或篡改**的通信通道

**必须留在内核的**（论文 §2）：

| 机制 | 理由 |
|------|------|
| Grant / Map / Flush | 在保护边界内递归构造地址空间 |
| 线程 | 换地址空间必须由内核仲裁 |
| 同步 IPC | 跨空间通信 + Grant/Map 的「对方同意」 |
| 唯一 UID | 本地通信指定目标并验证来源 |

**刻意移出的**：通用分页策略、文件系统、调度细节、设备驱动逻辑、Unix 系统调用表。

## 核心概念二：地址空间三原语

启动时存在特殊地址空间 **σ₀**（近似物理内存），由 S₀ 控制；其它空间起初为空，靠三原语「长出来」：

| 原语 | 行为 | 日常类比 |
|------|------|----------|
| **Grant** | 页从授予方**移除**，进入接收方（双方同意） | 把办公室钥匙交给下家，自己不再能进 |
| **Map** | 页同时出现在双方（双方同意） | 同一房间加一把锁，两家都能用 |
| **Flush** | 页在发起方仍可见，撤销所有经自己转手的下游映射 | 房东收回转租副本，自己房间不动 |

约束：Grant/Map 只能操作**自己已能访问**的页；Flush 不需逐家同意，因接收时已隐含接受「可能被 flush」。

I/O 端口也可视作特殊「页」——**设备权限**交给用户态 memory manager，而非写死在特权驱动路径。

### 代码示例 1：地址空间原语（教学伪代码）

```c
typedef struct {
    PageDesc table[VIRTUAL_PAGES];
} AddressSpace;

int map_page(AddressSpace *mapper, vpage_t v_src,
             AddressSpace *recipient, vpage_t v_dst,
             AccessRights rights) {
    if (!page_accessible(mapper, v_src)) return -EPERM;
    if (!recipient_accepts(recipient, v_dst, rights)) return -EAGAIN;
    return install_mapping(recipient, v_dst, resolve(mapper, v_src), rights);
}

int grant_page(AddressSpace *granter, vpage_t v_src,
               AddressSpace *grantee, vpage_t v_dst) {
    if (!page_accessible(granter, v_src)) return -EPERM;
    if (!grantee_accepts(grantee, v_dst)) return -EAGAIN;
    PageFrame pf = detach(granter, v_src);
    return attach(grantee, v_dst, pf);
}

int flush_page(AddressSpace *owner, vpage_t v) {
    if (!page_owned(owner, v)) return -EPERM;
    return revoke_downstream_mappings(owner, v);
}
```

论文 Figure 1 的**堆叠 pager**：统一文件系统 F 把 f₁ 的一页 grant 给用户 A，F 不长期占页——若用 Map，F 要复制全部簿记且地址空间可能被撑爆。

## 核心概念三：线程与同步 IPC

**线程** = 在某地址空间里跑的活动（PC、栈、状态、当前地址空间 ID）。**IPC** 采用**同步会合式**消息：

- 发送方决定发什么；接收方决定是否收、如何解释
- 内核**不必维护消息队列**（短消息常走寄存器）

L3 在 486/50MHz 上短 IPC 约 **10µs（~250 cycles）**；同期 Mach 同场景约 **190µs**。L3 进内核额外开销可低至 **15 cycles**；Mach `get_self_thread` 类调用约 **900 cycles**，其中 x86 进/出内核硬下限仅 **~107 cycles**，其余是 Mach 自身路径。

### 代码示例 2：中断当作「硬件线程发来的空 IPC」

```c
void nic_driver_thread(void) {
    for (;;) {
        ThreadId sender;
        Message msg = wait_ipc(&sender);

        if (sender == MY_NIC_IRQ_THREAD) {
            dma_ring_refill();
            mmio_write(NIC_REG_ACK, 1);
        } else if (sender == CLIENT_PORT) {
            handle_client_request(&msg);
        }
    }
}
```

内核只把硬件中断**翻译成** IPC；清中断、读端口的**语义**全在驱动里。若 CPU 清中断需特权操作，可在驱动下一次 IPC 时由内核隐式完成。

### 代码示例 3：Unix server 式系统调用

```c
void client_read(int fd, void *buf, size_t n) {
    Message req = { .tag = MSG_UNIX_READ, .words = { fd, n } };
    Message reply;
    ipc_call(unix_server_tid, &req, &reply);
    memcpy(buf, reply.payload, reply.words[0]);
}

void unix_server_loop(void) {
    for (;;) {
        Message req, reply;
        ThreadId client = ipc_receive(&req);
        if (req.tag == MSG_UNIX_READ) {
            reply.words[0] = vfs_read(req.words[0], reply.payload, req.words[1]);
            ipc_reply(client, &reply);
        }
    }
}
```

宏内核里 `read()` 是一条内核路径；微内核里是**会合式 IPC**——当内核路径从 900 cycles 压到百 cycle 级，这条账算得过。

## 灵活性速写（§3）

| 组件 | 实现方式 |
|------|----------|
| 物理内存管理 | 管理 σ₀ 的用户态 memory manager，可多层堆叠 |
| 分页 / 文件映射 | Pager：grant/map/flush + IPC |
| 设备驱动 | 普通进程 + MMIO 映射 + 中断 IPC |
| Unix 兼容 | Unix server，syscall = IPC |
| 远程通信 | 通信 server + 网卡驱动 |

## 性能：拆解「微内核原罪」（§4）

**Kernel-user 切换**：Ousterhout 测 `getpid` 约 20–30µs；Mach 486/50MHz 约 18µs ≈ 900 cycles，其中 ~107 cycles 是 x86 陷阱硬下限，**800+ cycles 是 Mach 纯开销**。L3 完整调用 123–180 cycles。

**地址空间切换**：无标签 TLB 的 CPU 换页表可能很贵；Liedtke 在 Pentium 上用**段寄存器 multiplex** 把切换压到约 **15 cycles**。

**IPC**：Table 2 一字节 echo RPC——L3 ~10µs，Mach 486 ~230µs。差距主要来自内核体量与会合式设计，非范式必然。

**MCPI**：Chen & Bershad 曾指 Mach+Unix server 比 Ultrix MCPI 高；Liedtke 重读：差异多来自 **Mach 内核自身 cache miss**，非用户/系统冲突特有。瘦内核（L3 短 IPC <1KB）可缓解。

## 可移植性悖论（§5）

微内核**不应追求**一份源码跑遍所有 CPU——它像**手写优化的微码层**，换芯片要换算法（486→Pentium 地址空间实现大改）。但**上层 server** 用稳定 IPC 接口，整系统反而更易迁移。这是有意为之的诚实。

## 与 Mach 1986 对照

| 维度 | Mach | L4（本篇） |
|------|------|------------|
| 目标 | UNIX 兼容研究平台 | 证明微内核可又快又灵活 |
| IPC | Port + 内核缓冲 | 同步会合，极简 trap |
| 内存 | Memory object | Grant/Map/Flush 递归构造 |
| 驱动 | 常进内核 | 一律用户态 + 中断 IPC |

## 后世演化

| 年代 | 里程碑 |
|------|--------|
| 1993 | L3：IPC 比 Mach 快数量级 |
| 1995 | 本篇：概念最小集 + 性能辩护 |
| 1997 | L4Linux：Linux personality 低开销 |
| 2009+ | seL4：能力模型 + 形式化验证 |
| 2016+ | Fuchsia Zircon 等商业化探索 |

## 读完后应带走的五句话

1. **微内核 = 最小可信计算基座**，每个原语都要能辩护「移出去会不会做不成系统」。
2. **Grant/Map/Flush + 同步 IPC + UID** 足以搭出完整 OS。
3. **慢**先查 cycle 账，别急着怪范式。
4. **灵活**来自原语少且通用，而非内核预置一切策略。
5. **内核不可移植是特性**；server 生态才可移植。

## 延伸阅读

- Liedtke (1993), *Improving IPC by Kernel Design*
- Hartig et al., *The Performance of µ-Kernel-Based Systems*, SOSP 1997
- Elphinstone & Heiser, *From L3 to seL4*, SOSP 2013
- 本库：[Mach 1986](mach-rashid-1986.md)、[KVM 2007](kvm-2007.md)

## 参考链接

- 论文 PDF：https://os.itec.kit.edu/downloads/sosp95-mkernel-construction.pdf
- ACM DOI：https://doi.org/10.1145/224056.224075
- L4 家族文档：https://os.inf.tu-dresden.de/L4/doc.html

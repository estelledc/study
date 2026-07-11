---
title: HYDRA — 用 capability 把整个内核重做成对象 + 票据
来源: 'Wulf, Cohen, Corwin, Jones, Levin, Pierson, Pollack, "HYDRA: The Kernel of a Multiprocessor Operating System", CACM 17(6): 337-345, June 1974'
日期: 2026-05-31
分类: 操作系统
难度: 中级
---

## 是什么

HYDRA 是 1974 年 CMU 给自家多处理器 C.mmp（最多 16 颗 PDP-11）写的一个内核。它把"整个 OS"重新想了一遍：所有东西——进程、文件、信号量、过程——都是**带类型的对象**；想访问对象，必须先持有一张**capability**（能力票据），票据上写明可以做什么（读 / 写 / 调用 / ...）。

日常类比：像一个**门禁极严的图书馆**。每本书是一个"对象"。进门时管理员给你一张卡（capability），卡上写着"你可以借这本但只能读不能写"。卡是不可伪造的——你想做的事必须卡上写过，没写就做不了。卡可以转手，但不能涂改。

这是历史上第一个把"capability"和"policy / mechanism separation"两件事**同时讲清楚**的系统级论文。

## 为什么重要

不理解 HYDRA，下面这些事都没法解释：

- 为什么 macOS / iOS 内核的祖宗叫 Mach，Mach 内核就是 HYDRA 思路的直系延续
- 为什么 seL4 / Fuchsia Zircon / KeyKOS / EROS 这些"形式化或安全内核"全都用 capability，而不用 Unix 的 uid + 权限位
- 为什么浏览器沙箱、Linux container、iOS 应用授权弹窗都是"给你一张卡只能做这件事"——这都是 capability 模型的弱化版
- 为什么 FreeBSD Capsicum、Cap’n Proto RPC 都把"显式传递权限"当成核心特性——它们不约而同回到了 1974 年的设计
- 为什么操作系统教科书一定要讲"机制 vs 策略"——HYDRA 是最早在完整内核里把两者同时讲清楚的系统之一

## 核心要点

HYDRA 的设计可以拆成 **三块**：

1. **typed object（带类型的对象）**：内核里所有东西都是对象，每个对象有"类型"（process / file / semaphore / procedure / ...），类型决定了它支持哪些操作。类比：图书馆里有书、CD、座位三种"对象"，不同对象能做的事不一样。

2. **capability（能力票据）**：每个进程持有一张 **C-list**（capability 列表）。要访问对象 O 上的操作 op，必须 C-list 里有一张 capability 写着"O + 允许 op"。capability 由内核维护，用户**只能传递、不能伪造**。类比：你能把图书馆卡借给朋友，但你不能自己印一张。

3. **policy / mechanism separation（机制与策略分离）**：内核只做**机制**——对象创建、capability 检查、过程调用切换。**策略**——调度算法、分页置换、文件系统怎么组织——由上层 subsystem 自己写。类比：图书馆的**门禁规则**（机制）和**借阅时长怎么定**（策略）是两件事，门禁系统不该写死借多久。

三块加起来叫"capability-based kernel"或"object-capability OS"，这个名字 1974 年还没流行，但 HYDRA 是它最早的完整实现。

## 实践案例

### 案例 1：内核怎么查一张 capability

```python
def check(process, obj_id, op):
    for cap in process.c_list:          # 进程手里的票据列表
        if cap.obj == obj_id and op in cap.rights:
            return True                 # 卡上写了这个操作
    raise PermissionError(op, obj_id)   # 没卡就拒绝
```

**逐部分解释**：

- `c_list` 是进程持有的 capability 列表，用户空间改不了内容，只能请求内核传递
- `cap.rights` 是权限位集合（读 / 写 / 调用…），缺哪一位就不能做哪件事
- 类比：进库房前刷卡，门禁只认卡上印过的门，不认"我是管理员朋友"

### 案例 2：一次性授权与 revoke

```python
cap = mint(file_F, rights={"read"})  # 只读票据
send(process_P, cap)                 # 显式传给 P
# P 读完后：
revoke(file_F)                       # 清空对象槽，所有指向 F 的 cap 失效
```

**逐部分解释**：

- `mint` 由内核签发，用户不能自己印一张同款卡
- `send` 把卡转手给 P；Unix 里常靠 chmod/setuid 拼权限，容易有竞态
- `revoke` 通过间接对象表把槽置空，下次 `check` 直接失败——精细到"用完即收回"

### 案例 3：防 confused deputy

经典安全问题：进程 A 调用进程 B，B 却拿着 A 的权限去碰别的资源。

```python
# A 调 B 时必须显式塞所需票据；B 没收到就不能 deref
call(B, procedure="copy_page", caps={"src": cap_read_F})
# B 内部：check(B, file_F, "read")  OK
# B 若想碰 file_G：check(B, file_G, "read")  → PermissionError
```

**逐部分解释**：

- `caps={...}` 是调用时附带的 capability 包，权限不会"顺着调用栈自动泄漏"
- 这是后来 seL4 / EROS 强调的 capability confinement，源头就在 HYDRA
- 日常类比：你把图书馆卡借给同学复印一页，不等于把你的校园卡也借出去了

同一内核上还能跑两套不同策略的 subsystem（学生 OS / 教授 OS）：内核只管 capability 检查与对象切换，**不管谁先跑**——这就是机制与策略分离的工程后果。

## 踩过的坑

1. **把 capability 等同于 Unix 文件描述符**——错。fd 只是个整数索引，没有权限粒度，进程拿到 fd 可以做这个 fd 关联的所有操作。capability 是"对象引用 + 权限位 + 不可伪造"三位一体，由内核保证完整性。

2. **误以为 HYDRA = 微内核**——HYDRA 更准确叫"capability kernel"。"微内核"（microkernel）这个术语是 [[smalltalk-80]] 同时代的 Mach（1985）才标准化的，HYDRA 是它的祖先而非同义词。

3. **以为 policy/mechanism separation = 内核什么都不做**——不是。内核做的是"**不可被绕过的强制机制**"（capability 检查、对象类型分发、过程切换），策略是"**可被替换的决策**"（调度算法、置换算法、文件布局）。两者都必须存在，分层但不能省。

4. **以为 capability 模型已经过时**——恰恰相反。2010s 之后 seL4、CHERI（硬件 capability）、Fuchsia Zircon、Cap’n Proto RPC、浏览器沙箱、iOS 应用权限模型，全都是 HYDRA 思路的延续或弱化版。

5. **以为 capability 不能 revoke**——常见误解。HYDRA 通过"间接对象表"实现 revoke：把整个对象槽置空，所有指向它的 capability 同时失效。代价是每次 deref 多一层间接。后续 KeyKOS / EROS 优化为"代际编号"机制，进一步降低开销。

## 适用 vs 不适用场景

**适用**：

- 需要**强隔离 + 灵活策略**的安全敏感系统（航空、医疗、银行内核）
- 想做形式化验证的内核（seL4 的 capability 模型直接继承这条线；同脉络还可看 [[certikos-2016]]、[[hyperkernel-2017]]）
- 沙箱、容器、浏览器进程隔离——按 capability 思路设计权限边界
- 想在同一内核上换调度 / 文件 personality，而不改 capability 检查机制本身

**不适用**：

- 性能极致敏感的高频路径（每次调用都要 capability 检查；硬件 CHERI 才能贴近 native 速度）
- 对兼容性要求强的场景——POSIX 是 uid + mode，capability 不能"原地兼容"
- 极简嵌入式（< 32KB RAM）——capability 表本身有空间开销
- 跨主机分布式（网络上传 capability 如何防伪造是另一题，Cap’n Proto 等是后来的工程化解法）

## 历史小故事（可跳过）

- **1971 年**：William Wulf 在 CMU 启动 C.mmp——把最多 16 颗 PDP-11 用 crossbar 连成共享内存机。
- **1974 年**：HYDRA 论文发在 CACM，把 capability + typed object + policy/mechanism separation 打包讲清；实现语言 BLISS-11。
- **1975-1977 年**：HYDRA 跑在 C.mmp 上，宕机常因处理器累计故障（约 2–6 小时量级），不全是软件 bug。
- **1985 年**：Mach 在 CMU 诞生，继承 capability 思路（Mach port ≈ capability handle）。
- **1980s–90s**：KeyKOS / EROS 把纯 capability 推到极致，并改进 revoke 开销。
- **2009 年**：seL4 给 capability 微内核做完全形式化证明；同脉络还有 [[certikos-2016]] 等。
- **现在**：XNU 里仍有 Mach port 影子；Zircon、CHERI、浏览器站点隔离都能溯源到 HYDRA。

## 学到什么

1. **资源 = 对象，访问 = 票据**——比 uid+mode 精细得多，但内核要负担更多检查
2. **机制和策略要分层**——内核写死调度策略是早期 OS 常犯的错；HYDRA 把两件事拆开
3. **capability 不可伪造**靠"内核维护、用户只能传递"——对象引用、Cap’n Proto 等工具的共同祖先
4. **思想原型不必赢工程战**——HYDRA 硬件退役后，思想仍被三代后继者吸收；一句话记：**谁可以做什么 = 手里有没有那张卡**

## 延伸阅读

- 论文 PDF：[Wulf et al. 1974, HYDRA](https://dl.acm.org/doi/10.1145/355616.364017)（CACM，约 9 页）
- Levy 书：[Capability-Based Computer Systems (1984)](https://homes.cs.washington.edu/~levy/capabook/)
- [seL4 Microkernel](https://sel4.systems/)——形式化验证的现代 capability 微内核
- 视频：[Mark Miller — Object-Capability Security](https://www.youtube.com/watch?v=oBqeDYETXME)
- 动手：[seL4 Tutorials](https://docs.sel4.systems/Tutorials/)；FreeBSD Capsicum（`sys_capability.c`）

## 关联

- [[lampson-hints]] —— Lampson 1983 把"机制/策略分离"列为正式 hint，HYDRA 是其实证
- [[hyperkernel-2017]] —— 现代 push-button 内核验证；建模对象不同，但同属安全内核脉络
- [[certikos-2016]] —— Coq 证过的并发内核，capability 思路的延续
- [[simula-67]] —— object 概念源头，HYDRA 把 object 提升到内核级
- [[smalltalk-80]] —— 同时代 object-capability 在用户空间的探索
- [[amdahl-law-1967]] —— 多处理器扩展性极限，C.mmp 时代就在踩
- [[dash-numa-1992]] —— 多处理器后续：从 UMA 走到 NUMA

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dash-numa-1992]] —— Stanford DASH — 第一台真跑起来的目录式 CC-NUMA 多处理器
- [[ffs-1984]] —— FFS — 把磁盘几何写进文件系统

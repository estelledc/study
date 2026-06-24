---
title: Haven — 在不信任的云里给程序造一间安全屋
来源: 'Baumann et al., "Shielding Applications from an Untrusted Cloud with Haven", OSDI 2014'
日期: 2026-06-24
分类: 操作系统
难度: 中级
---

## 是什么

Haven 是微软研究院在 2014 年提出的一个系统，它能让**未经修改的完整应用程序**（比如 SQL Server、Apache）在一个完全不信任的云环境里安全运行——即使云厂商的操作系统、管理员、甚至执法部门都被视为潜在敌人。它是第一个把 LibOS（库操作系统）装进 Intel SGX enclave 的完整系统设计，也是"机密计算"这个领域从概念走向可运行原型的关键一步。

日常类比：你要在别人家的厨房做一道独家秘方菜。房东有厨房的钥匙，能随时进来看你的配方、偷换你的食材。Haven 的做法是：在厨房里搭一个全封闭的玻璃操作间（Intel SGX enclave），再把你自己的全套厨具和食谱一起搬进去（LibOS）。房东只能看到操作间外面那一小块你允许他看的东西，里面发生什么他完全无法干预。

技术上，Haven 把一个精简的操作系统库（LibOS，来自微软的 Drawbridge 沙箱框架）和应用程序一起打包进 SGX enclave。应用程序以为自己在和正常操作系统对话，其实只和 enclave 内的 LibOS 交互。LibOS 再通过一层防御模块（shield module）小心翼翼地和外部不可信的宿主 OS 打交道。

回到厨房类比：LibOS 就是你自带的厨具和调料；shield module 是操作间的传菜窗口——外面递进来的任何东西（原材料 = OS 返回值）都要经过检测才能用；SGX enclave 是那面物理上无法穿透的玻璃墙。三者缺一不可：没有 LibOS 应用跑不起来，没有 shield module 恶意 OS 能注入假数据，没有 SGX 硬件隔离前两者就是空中楼阁。

## 为什么重要

不理解 Haven，下面这些事都没法解释：

- 为什么后来的 Graphene-SGX、Gramine、Occlum 都走了同一条路（LibOS + enclave）——Haven 是这条路线的开创者
- 为什么"机密计算"能宣称保护整个应用而不只是一小段密码学代码——Haven 证明了 enclave 里可以跑完整二进制
- 为什么 [[sgx-2013]] 发布一年后学术界就从"保护小段代码"跳到了"保护整个数据库"——Haven 补上了 SGX 与真实应用之间缺失的系统层
- 为什么即便有 SGX 硬件保护，系统设计者仍然需要对抗 Iago 攻击（恶意 OS 返回假数据诱骗应用）——Haven 第一个系统性解决这个问题
- 为什么 Azure Confidential Computing 和 Google Confidential VMs 能把"零信任云"当卖点——Haven 开创的 LibOS-in-enclave 架构是这些产品的学术原型
- 为什么 2014 年之后 OS 研究社区重新关注 LibOS——Haven 证明了 LibOS 不只是学术玩具，而是解决真实安全需求的关键架构组件

## 核心要点

Haven 的设计解决两个核心矛盾：

**矛盾一：应用信任 OS，但 OS 不可信**

正常应用调用 `read()` 拿文件内容、调用 `mmap()` 要内存，默认相信 OS 返回的结果是正确的。如果 OS 是恶意的（Iago 攻击），它可以返回伪造数据——比如你请求随机数，OS 故意返回全零，密钥就不安全了；又比如你请求分配内存得到地址 A，OS 故意把 A 映射到另一个进程的空间，造成信息泄露。

Haven 的解法：在 enclave 内放一个完整的 LibOS（Drawbridge），应用的系统调用不出 enclave，全由 LibOS 在内部处理。LibOS 只在必须和外界交互时（如读磁盘）才通过 shield module 与宿主 OS 通信，且每次都验证返回值的合理性。

shield module 对返回值做的验证包括：

- 内存地址必须在 enclave 允许的范围内
- 时间戳必须单调递增，不允许回退
- 文件内容必须与先前记录的哈希一致
- 网络数据包通过 TLS 在 enclave 内解密，外部无法注入伪造流量

**矛盾二：SGX 不支持真实应用的需求**

2013 年版 SGX 设计时只考虑了简单场景：固定大小的代码、不动态加载、不自己管虚拟地址。真实应用要动态分配内存、加载 DLL、创建线程——SQL Server 启动时就要加载几十个 DLL，运行时还会动态申请 GB 级内存池。

Haven 的解法有两个：

- 在 enclave 内模拟：LibOS 自己维护虚拟地址空间分配器，自己做 DLL 加载和重定位，不依赖宿主 OS 的 mmap 或 LoadLibrary
- 推动硬件改进：论文明确提到 Haven 团队的反馈促使 Intel 在 SGX v2 中加入了动态内存管理指令（EAUG/EMODT），让 enclave 运行时可以按需添加内存页

**整体架构三层**：最底层是 SGX 硬件提供隔离 → 中间是 shield module 防御 Iago 攻击 → 最上层是 LibOS + 应用，在 enclave 内形成一个自给自足的小世界。

**信任模型**：Haven 假设的敌人极强——拥有宿主机全部软件访问权（root、hypervisor）和大部分硬件访问权（内存总线探测、DRAM 冷启动攻击）。唯一被信任的只有 CPU 芯片本身和其上运行的 SGX 微码。换句话说，只要 CPU 没被物理开盖替换芯片，Haven 的保护就成立。这个威胁模型比传统虚拟机隔离（信任 hypervisor）和容器隔离（信任内核）都强得多。

## 实践案例

**案例 1：在不信任的 Azure 上跑 SQL Server**

Haven 的原型直接把 Windows 版 SQL Server（未修改的二进制）装进 enclave。数据库引擎以为自己在和 Windows 内核对话（文件读写、网络收发、内存管理），实际上是和 enclave 里的 Drawbridge LibOS 对话。云厂商的 hypervisor 和宿主 OS 全程被排除在信任边界之外。

论文的性能测试表明，SQL Server 在 Haven 里的吞吐量开销约为原生运行的 31-54%，主要瓶颈来自两个地方：一是 enclave 进出的上下文切换成本（每次 EENTER/EEXIT 约数千时钟周期），二是 EPC 容量不足时触发的加密换页。对于中等负载的 OLTP 查询，这个开销被认为在可接受范围内。

**案例 2：Apache 反向代理的端到端保护**

Haven 还跑了 Apache HTTP Server。用户连接通过 TLS 打到 enclave 内的 Apache，TLS 终结点在 enclave 里完成，私钥从不离开 enclave。即使云管理员能抓取宿主机的全部网络流量和内存，他们看到的只是密文。这意味着 HTTPS 的信任从"信任服务器操作系统不泄露私钥"变成了"信任 CPU 硬件不泄露私钥"——信任基大幅缩小。

**案例 3：加密文件系统抵抗回滚**

Haven 在 enclave 内实现了一个加密文件系统——只有根节点和叶节点的密文写到宿主存储。文件内容在 enclave 外是密文，完整性靠 Merkle 树保护。如果宿主 OS 试图悄悄把旧版本的文件喂回给应用（回滚攻击/replay attack），Merkle 树的哈希就对不上，shield module 会拒绝。不过论文坦承这个文件系统在原型阶段未完全实现——特别是跨重启的持久化防回滚还有缺口，后续工作（如 ROTE 2017）才彻底补上。

## 踩过的坑

1. **性能开销不容忽视**：整个 LibOS + 应用都在 enclave 里运行，每次和外界交互都要经过 shield module 的验证逻辑，加上 SGX 的 EPC paging 开销，SQL Server 基准测试慢了 31-54%。这个开销让 Haven 更适合安全要求极高的场景，而非通用部署。优化方向后续由 SCONE（异步 syscall 批处理）和 Occlum（用户态多进程 LibOS）分别探索。

2. **不防侧信道**：Haven 明确声明不抵抗侧信道攻击。恶意 OS 仍然能观察 enclave 的内存访问模式、执行时间、页表缺页顺序。2015 年后陆续出现的 controlled-channel attack 证实了这个威胁是真实的——攻击者可以通过操控页表，精确到 4KB 粒度地追踪 enclave 内部的代码执行路径。对于需要抗侧信道的场景（如密码学操作），应用自身还得额外做 constant-time 编程或 ORAM 混淆。

3. **可用性不保证**：Haven 保护的是机密性和完整性，不保护可用性。恶意宿主可以随时杀掉 enclave 进程、切断网络、拒绝提供 CPU 时间。所以 Haven 不能替代高可用方案，只能保证"要么正确运行，要么干脆停止"（fail-stop 语义）。如果你的场景需要"即便遭到攻击也必须保持服务"，Haven 帮不了你。

4. **Iago 攻击面比想象中大**：shield module 必须对宿主 OS 返回的每一个值做安全检查——时间、文件偏移、内存地址、信号编号、线程调度顺序。遗漏一个检查点就可能被恶意 OS 利用。论文坦承当时并未完整实现所有防护，比如 replay attack 的完整防御在原型中未彻底完成。这也说明了为什么后续工作不断在加固 shield 层。

5. **TCB 膨胀**：把整个 LibOS 和应用一起塞进 enclave，可信计算基（TCB）变得很大——几十万行代码都在信任边界内。LibOS 本身如果有 bug，enclave 内部一样会被攻破。这和 SGX 原始设计理念"enclave 代码应该小而精"是有张力的。后续的 SCONE 选择了折中路线：只把容器运行时的薄 shim 层放进 enclave，应用通过异步 syscall 接口与之交互，TCB 缩小了一个数量级。

## 适用 vs 不适用场景

**适用**：

- 云上运行含敏感数据的遗留应用（数据库、Web 服务）且不想改代码——Haven 路线的核心卖点就是"不改应用"
- 多方不互信场景下需要一个可验证的执行环境——结合 SGX attestation 可以向各方证明 enclave 里跑的是约定代码
- 对云厂商内部威胁（恶意运维、执法调取）有合规要求——GDPR、HIPAA 等法规下的数据处理
- 私钥和证书管理——TLS 私钥永不出 enclave，比传统 HSM 部署更灵活且成本更低

**不适用**：

- 需要抗侧信道攻击——Haven 明确不防，恶意 OS 能通过页表缺页模式推断 enclave 内部行为
- 工作集远超 SGX EPC 容量——大规模 ML 训练、大内存 JVM 应用会因 paging 暴跌
- 需要高可用性保障——恶意宿主可以杀进程，Haven 无法阻止
- 要求完全去信任硬件厂商——信任根仍在 Intel CPU 和其签名密钥
- 追求极致性能——LibOS 中间层 + shield module 验证 + EPC 限制，三重开销叠加

总结：Haven 的甜蜜点是"中等规模、高敏感度、改不动代码"的应用。如果你的数据不敏感、应用能改、或者内存需求巨大，传统隔离方案（VM、容器）性价比更高。

## 历史小故事（可跳过）

Haven 来自微软研究院的 Andrew Baumann 团队。Baumann 此前在做 Barrelfish 多核操作系统研究，积累了对 OS 抽象层的深刻理解。2013 年 Intel 刚公开 SGX 指令集设计，Baumann 团队几乎立刻意识到："光有硬件隔离不够，必须在里面放一个 OS 才能跑真实应用。"

他们选择了微软内部的 Drawbridge 项目——一个把 Windows API 实现为用户态库的沙箱框架——作为 LibOS。Drawbridge 原本是为应用虚拟化设计的，被 Haven 复用来解决一个完全不同的问题：把信任边界从 OS 推到硬件。这种"旧工具解新问题"的思路在系统研究中很常见。

值得一提的是，Haven 和同期的另一个方向——Intel 自己推的 SDK 式编程模型——形成了鲜明对比。Intel 官方思路是：开发者手动把敏感逻辑抽出来写成 enclave 代码，其余部分照旧在 OS 上跑。Haven 反其道行之：把整个应用扔进 enclave，不要求开发者做任何拆分。学术界最终两条路都有人走，但"整体装入"这条路因为对开发者更友好，在工程实践中占了主流。

Haven 论文获得了 OSDI 2014 的 Jay Lepreau 最佳论文奖。它直接启发了后续的 Graphene-SGX（2017）、SGX-LKL（2019）、Gramine（Graphene 改名）、Occlum（2020，蚂蚁集团开源）等系统，形成了机密计算领域的主流架构范式。今天当你在 Azure 上选择"Confidential VM"或在阿里云上开"安全增强型实例"，底层跑的都是 Haven 首先验证的这套 LibOS-in-enclave 架构的工业化版本。

## 学到什么

1. **LibOS 是适配层的万能胶水**：应用不想改、硬件有限制，中间插一个库 OS 就能把两者粘起来。这个思路从 Exokernel（1995）到 Unikernel 到 Haven 反复出现——当执行环境和应用假设不匹配时，LibOS 是标准解法。关键洞察是：OS 的大部分功能不需要特权级，完全可以在用户态实现。

2. **威胁模型决定设计边界**：Haven 选择"不防侧信道、不保可用性"不是偷懒，而是刻意收窄问题让系统可实现。声明不做什么和声明做什么同样重要——这是 [[capsicum-2010]] 和 [[selinux-2001]] 等安全系统共有的设计哲学。

3. **Iago 攻击是信任反转的必然产物**：传统安全假设 OS 可信，一旦翻转这个假设，所有依赖 OS 正确行为的代码都变成了攻击面。系统化地列举并封堵这些假设点，是这类系统最难也最有价值的工程工作。

4. **"不改应用"是工程可行性的分水岭**：要求开发者重写应用来适配安全硬件，采用率会极低。Haven 证明了"放一个兼容层进去就能跑旧代码"这条路可行，直接决定了后续十年机密计算生态的演化方向。

5. **安全属性要分开声明**：Haven 精确地声明自己保护机密性和完整性，但不保护可用性，也不防侧信道。这种清晰的属性拆分比含糊的"安全"二字有用得多。读任何安全论文时，第一件事就应该问：它保的是 CIA 三角的哪条边？不保哪条？代价是什么？

## 延伸阅读

- 论文 PDF：[Haven OSDI 2014](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-baumann.pdf)（原文 14 页，架构图清晰，值得看 Figure 1 和 Section 4）
- Drawbridge 原始论文：[Drawbridge: A New Form of Virtualization for Application Sandboxing](https://www.microsoft.com/en-us/research/publication/drawbridge/)（理解 LibOS 层从哪来）
- 后续开源实现：[Gramine (formerly Graphene-SGX)](https://gramineproject.io/)（Haven 思路的 Linux 版本，可以动手跑）
- Iago 攻击原始论文：[Iago Attacks: Why the System Call API is a Bad Untrusted RPC Interface](https://hovav.net/ucsd/dist/iago.pdf)（Checkoway & Shacham 2013，理解 Haven 为什么需要 shield module）
- SCONE 论文：[SCONE: Secure Linux Containers with Intel SGX](https://www.usenix.org/conference/osdi16/technical-sessions/presentation/arnautov)（OSDI 2016，Haven 之后另一个重要的 container-in-enclave 系统）
- [[sgx-2013]] —— Haven 的硬件基础，先读这篇再读 Haven 效果最好

## 关联

- [[sgx-2013]] —— Haven 的全部安全保证建立在 SGX enclave 的硬件隔离之上；SGX 提供原语，Haven 提供系统层
- [[capsicum-2010]] —— Capsicum 用 capability 在用户态做沙箱，Haven 用 LibOS+SGX 在硬件层做沙箱；都是把"应用能碰什么"的决定权从 OS 夺回来
- [[selinux-2001]] —— SELinux 假设内核可信并由内核做强制访问控制，Haven 直接不信任内核；两者代表安全设计中"信不信 OS"的两极
- [[sel4-2009]] —— seL4 用形式化验证缩小信任基（证明内核代码无 bug），Haven 用硬件加密缩小信任基（绕过内核）；殊途同归
- [[exokernel-1995]] —— Exokernel 把 OS 功能上移到用户态 LibOS，Haven 把同样的 LibOS 思想搬进了 SGX enclave；LibOS 架构跨越了 20 年
- [[saltzer-schroeder-1975]] —— Haven 的 shield module 设计体现了"完全仲裁"和"最小权限"原则——每次跨越信任边界的交互都必须被检查
- [[firecracker-2020]] —— Firecracker 用轻量 VMM 隔离租户，Haven 用 SGX enclave 隔离租户；两者都是云多租户安全的不同层次实现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

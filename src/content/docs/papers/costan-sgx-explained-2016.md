---
title: Intel SGX 详解 — 在不可信云里圈一块硬件保险箱
来源: 'Victor Costan & Srinivas Devadas, "Intel SGX Explained", IACR ePrint 2016/086, 2016'
日期: 2026-05-30
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

**Intel SGX Explained** 不是 Intel 官方手册，而是 MIT 研究者把 SGX 散落文档「拼成一本可读地图」的技术报告。日常类比：云主机像合租房——房东（操作系统）能进任何房间；SGX 像在 CPU 芯片里装一个**带独立门锁的保险箱**，只有放进保险箱里的代码和数据，才在硬件层面对房东不可见。

SGX 的核心对象是 **enclave（飞地）**：一段代码 + 它处理的私密数据，跑在 CPU 划出的 **Enclave Page Cache (EPC)** 加密内存里。远程用户不靠「相信云厂商」，而靠 **attestation（远程证明）**：CPU 用密钥签名 enclave 的测量值 **MRENCLAVE**，证明「此刻跑的就是我期望的那份程序」。

最小心智模型：

```c
// 伪代码：应用进程里只有 EENTER 能跳进 enclave
sgx_status_t ecall_process_secret(sgx_enclave_id_t id, uint8_t *in, size_t len) {
    // 编译器生成的 ECALL 桩 → CPU 指令 EENTER → enclave 内 trusted 函数
    return sgx_ecall(id, ECALL_PROCESS, in, len);
}
```

你写的普通 C 代码在 ring 3；**EENTER** 像过安检门——只有通过这道门的执行流，才在 EPC 里跑。

## 为什么重要

不理解这篇报告，下面这些事都没法解释：

- 为什么 Open Enclave / Gramine / Intel SDK 文档里到处是 **ECALL/OCALL、MRENCLAVE、EPC 换页**
- 为什么「用了 SGX」仍可能被 **缓存侧信道、页表攻击** 打穿——Costan 第 2–3 章专门铺 x86 背景就是为这些攻击面服务
- 为什么云机密计算宣传「硬件隔离」时，安全工程师总要问 **attestation 链、launch policy、SGX 版本**
- 为什么 2016 年这篇 100+ 页 ePrint 至今仍是 SGX 入门**事实基线**——它把手册、教程、专利里的空白都标出来了

## 核心要点

SGX 1 可以拆成 **三步**（对应论文 §1.1 Lightning Tour）：

1. **圈地 + 装货**：CPU 保留 **PRM** 内存区，里面是 **EPC** 页。不可信 OS 用 **ECREATE/EADD/EEXTEND** 把 enclave 二进制拷进 EPC，同时 CPU 用 SHA-256 累积测量。类比：集装箱码头——码头工人（OS）搬箱子，但海关封条（CPU 测量）只认封条上的总哈希 **MRENCLAVE**。

2. **封箱 + 证明**：**EINIT** _finalize 测量值，enclave 才能 **EENTER** 执行。远程方发起 attestation：CPU 用平台 **attestation key** 签名 `(MRENCLAVE, nonce, enclave_report)`，客户端对照 Intel 背书证书验证。类比：快递签收——签名覆盖「箱内清单哈希 + 随机挑战号」，防重放。

3. **运行 + 换页**：enclave 在 ring 3 跑，但中断/缺页先 **AEX（异步退出）** 清寄存器再交给 OS。EPC 不够时 OS 可把页 **换出**到普通 DRAM，硬件用 **MEK** 等密钥保证密文新鲜度。类比：保险箱抽屉可被管理员搬到仓库，但抽屉自带锁，管理员拿不到明文。

## 实践案例

### 案例 1：机密医疗影像流水线

场景：医院把 CT 影像加密上传到云，希望「解密 + 滤波 + 再加密」只在 enclave 内发生。

```c
// enclave 内 trusted 函数（简化）
sgx_status_t ecall_filter(uint8_t *cipher_in, size_t n, uint8_t *cipher_out) {
    uint8_t plain[BUF];
    aes_gcm_decrypt(cipher_in, n, plain);   // 密钥只在 EPC
    run_filter_kernel(plain, n);
    aes_gcm_encrypt(plain, n, cipher_out);
    return SGX_SUCCESS;
}
```

**逐部分解释**：

- `aes_gcm_decrypt` 用的密钥通过 ECALL 参数或 sealing 导入，**从不以明文出现在 enclave 外**
- 上传通道、对象存储 API 留在 untrusted 侧——Costan 强调 TCB 只含 enclave 内代码，比 TPM/TXT 整台机 attestation 小得多
- 上线前对 enclave 签名得到 **MRSIGNER**，远程 attestation 同时验证「谁签的 + 测到的 MRENCLAVE」

### 案例 2：Sealing 把状态存回磁盘

同一 ISV 签名的 enclave 重启后，希望读回上次密封的数据：

```c
sgx_status_t seal_state(const uint8_t *blob, size_t len, sgx_sealed_data_t *out) {
    // CPU 用 MRSIGNER + 策略派生 sealing key，仅本 enclave 家族可解
    return sgx_seal_data(0, NULL, len, blob, out_size, out);
}
```

**逐部分解释**：

- **Sealing** 不是普通 AES 文件加密——密钥与 **MRSIGNER/MRENCLAVE/属性** 绑定，换签名或改代码即解不开
- OS 仍能看到 sealed blob 的 ciphertext，但缺 CPU 派生密钥
- 论文提醒：sealing **不**防侧信道；只防「磁盘被拷走」类离线攻击

### 案例 3：Attestation + TLS 会话密钥

客户端先验证 enclave，再发业务密钥：

```
Client                          Enclave (EPC)
  |-- GET /attestation nonce -->|
  |<-- Quote(MRENCLAVE,nonce)---|  CPU 私钥签名
  | verify Intel cert chain     |
  |-- TLS key material ECALL -->|
```

**逐部分解释**：

- **Quote** 类似 [[tls-1.3]] 证书链，但根信任锚是 Intel **PCK/DCAP** 而非公共 CA
- nonce 防重放：没有 challenge，攻击者可回放旧 quote
- attestation 通过后仍要审计 **ECALL 边界**——OCALL 把数据带出 enclave 就前功尽弃

## 踩过的坑

1. **「上了 SGX 云就绝对安全」**：Costan 安全分析明确 SGX 1 保证有缺口；缓存/分支预测/页表侧信道在 §2–3 铺垫，不能当营销话术。

2. **测量遗漏导致 MRENCLAVE 不可信**：EADD 测虚拟地址与权限，EEXTEND 测 256B 块内容；漏测 **SSAFRAMESIZE** 等字段会留下地址翻译攻击面——论文 §5.6 专门讨论。

3. **把 attestation 当完整威胁模型**：证明只覆盖**初始** enclave 镜像；运行时 OCALL、供应链、enclave 内逻辑 bug 都不在 quote 里。

4. **忽略 launch control / 版本差异**：SGX 1 需 **EINITTOKEN**（Intel 可 gate 哪些 enclave 能启动）；读 2016 报告时必须标注 **SGX 1**，SGX 2 在加载/动态内存上有增量改进。

## 适用 vs 不适用场景

**适用**：
- 需要在**不可信 OS/虚拟机监控程序**上保护小段高价值逻辑（密钥、脱敏算法）
- 远程证明「跑的就是这份二进制」——配合 [[rsa]] / [[tls-1.3]] 做密钥投递
- 学习机密计算栈（Open Enclave、Gramine）前的**架构地图**

**不适用**：
- 需要抗**微架构侧信道**的高威胁模型 → 需额外缓解（constant-time、分核隔离）或换 TDX/SEV 等方案
- 整个应用都要保密且 I/O 频繁 → enclave 边界 OCALL 开销与攻击面大
- 期望**完全开源可验证**的 TCB → SGX 微码/部分行为未完全公开，Costan 也标注「需 Intel 补充信息才能下结论」

## 历史小故事（可跳过）

- **2013–2014**：Intel 在 ISCA/HASP 发布 SGX 雏形，提出 enclave + EPC 编程模型。
- **2015**：ISCA 教程公开 ECREATE/EADD/EINIT 指令级流程，开发者仍缺系统级背景。
- **2016-01**：Costan & Devadas 发布 ePrint **2016/086**，把 SDM + 教程 + 专利合成 100+ 页报告。
- **2017-02**：修订 typo；此后 Foreshadow、SGX-Step 等攻击引用本文的 x86 背景章节。
- **今天**：SGX 2 已扩展动态 enclave 内存，但「先读 Costan 再读 SDK」仍是社区惯例。

## 学到什么

1. **可信执行 ≠ 可信云**：硬件隔离的是 EPC 内明文；OS 仍管调度、换页、计时——威胁模型必须写清楚。
2. **Attestation 量的是代码哈希，不是业务正确性**——MRENCLAVE 告诉你「跑了哪份程序」，不告诉你程序没 bug。
3. **读 SGX 要先补 x86 虚拟化/缓存/页表课**——论文 §2 很长，因为侧信道攻击都寄生在这些机制上。
4. **技术报告的价值在「标空白」**——Costan 列出 Intel 未文档化的猜测与 launch licensing 争议，比复述手册更有长期参考价值。

## 延伸阅读

- 论文 PDF：[IACR ePrint 2016/086](https://eprint.iacr.org/2016/086.pdf)（100+ 页，当手册读）
- Intel 官方：[Enclave Life Cycle Overview](https://www.intel.com/content/www/us/en/developer/articles/technical/overview-of-an-intel-software-guard-extensions-enclave-life-cycle.html)
- 视频：ISCA 2015 SGX Tutorial（搜索 "Intel SGX tutorial ISCA 2015"）
- [[sgx-2013]] —— Intel 最初介绍 SGX 的会议论文，Costan 引用的三篇之一
- [[aes]] —— EPC 换页与 sealing 底层对称加密原语

## 关联

- [[sgx-2013]] —— SGX 概念源头，Costan 把它展开成可操作的指令级叙事
- [[aes]] —— enclave 内存加密与 sealed blob 的常用块密码构件
- [[rsa]] —— attestation 证书链与签名验证，远程证明的数学外壳
- [[tls-1.3]] —— 与 attestation 正交的传输层安全；常见模式是「先 quote 再 TLS」
- [[libsignal]] —— 端到端加密协议栈；SGX 可用于保护密钥派生节点但替代不了协议设计
- [[hoare-logic]] —— 形式化验证 enclave 内逻辑的另一条路，与硬件 TEE 互补
- [[zk-snark]] —— 另一种「在不泄露输入下证明计算」的路径，与 TEE 威胁模型不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

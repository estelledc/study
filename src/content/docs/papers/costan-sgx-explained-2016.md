---
title: Intel SGX Explained — 把云主机里的一小块程序锁进硬件保险箱
来源: 'Victor Costan and Srinivas Devadas, "Intel SGX Explained", IACR Cryptology ePrint Archive 2016/086, 2016'
日期: 2026-05-29
分类: security-privacy
难度: 高级
---

## 是什么

Intel SGX Explained 是一篇把 **Intel SGX 这个硬件安全功能从说明书、论文和专利里拆开讲清楚**的长文。日常类比：你把一份病历交给陌生人家的电脑处理，但要求电脑里必须有一个打不开、不能偷看、处理完还能证明自己没被换掉的小保险箱。

SGX 里的这个“小保险箱”叫 **enclave**。代码和敏感数据放进 enclave 后，普通程序、操作系统、虚拟机管理器，甚至一部分固件都不应该直接读写它。

这篇论文的重点不是提出一个新算法，而是回答：“SGX 到底承诺保护什么？它靠哪些硬件和微码做到？它又在哪些攻击面上说得不够完整？”

如果只记一句话：SGX 是把“不信任操作系统”这件事推进到硬件层，但它没有把“所有能被观察的痕迹”一起抹掉。

## 为什么重要

不理解这篇，下面这些事会很难解释：

- 为什么 SGX 说可以在“不信任云厂商操作系统”的情况下做机密计算
- 为什么 enclave 仍然要依赖操作系统分配内存、处理缺页和调度线程
- 为什么“内存被加密”不等于“所有侧信道都没了”
- 为什么后来的 Gramine、Open Enclave、Haven、VC3、Foreshadow 等工作都绕不开 SGX 的威胁模型
- 为什么安全硬件论文经常要同时读架构、微架构、密码协议和系统软件

## 核心要点

1. **SGX 保护的是一小块运行中代码，不是整台机器**。类比：不是把整栋楼变成金库，而是在办公室里放一个可验证的小保险箱。这样 TCB 变小，但保险箱外面的通道、调度和输入输出仍然要小心。

2. **它靠测量和认证让远端敢发秘密**。类比：快递员先看封条编号，确认盒子是自己认识的型号，再把钥匙塞进去。SGX 用 MRENCLAVE 记录初始内容，用 attestation 让远端验证“我正在和这个 enclave 说话”。

3. **它挡住直接读写，但挡不住很多观察行为**。类比：保安不让你打开保险箱，但你还能记录谁什么时候进出、脚步声从哪边传来。论文特别强调页表、缺页、缓存、超线程和性能计数器这类侧信道。

## 实践案例

### 案例 1：一个 enclave 是怎么出生的

```txt
ECREATE  -> 建 SECS，记录 enclave 的范围和属性
EADD     -> 把代码页、数据页、TCS 页放进 EPC
EEXTEND  -> 把关键页面内容计入 MRENCLAVE
EINIT    -> 固化测量值，之后才能进入 enclave
```

**逐部分解释**：

- `SECS` 是 enclave 的身份证和档案袋，软件不能直接读写
- `EPC` 是受保护的 4KB 页面池，操作系统负责分配，CPU 负责检查
- `EEXTEND` 把页面内容加入哈希；漏测关键代码页会让证明失去意义
- `EINIT` 像盖章封箱，盖完之后不能再随便追加初始页面

### 案例 2：远端为什么敢把秘密发给 enclave

```txt
enclave  -> EREPORT: 我是这个 MRENCLAVE
QE       -> quote: 用平台证明给报告签名
server   -> verify_quote(expected_hash)
server   -> send_secret_over_secure_channel()
```

**逐部分解释**：

- `MRENCLAVE` 是初始代码和数据的测量值，不是源码名字
- `QE` 是 Quoting Enclave，负责把本地报告变成远端可验证的 quote
- 远端只在 quote 匹配预期时发送密钥或敏感数据
- 这套流程把“相信云主机”改成“相信 CPU、Intel 证书链和指定 enclave”

### 案例 3：为什么页表侧信道仍然危险

```txt
for page in enclave_pages:
  page.present = false

on_page_fault(addr):
  log(page_number(addr))
  make_only_this_page_present(addr)
```

**逐部分解释**：

- 操作系统不能读 EPC 里的明文，但它仍然管理页表
- 恶意系统软件可以故意让每次访问都触发缺页
- 缺页地址会暴露 enclave 访问了哪个 4KB 页面
- 如果算法的访问模式依赖秘密，页面轨迹就可能泄露秘密

## 踩过的坑

1. **把 SGX 当成“云上万能安全屋”**：SGX 保护 enclave 内存，不自动保护 I/O、网络协议、业务逻辑和侧信道。

2. **以为操作系统完全被拿掉了**：操作系统仍然调度线程、维护页表、处理异常和搬运 EPC 页面，所以它能制造观察机会。

3. **只看内存加密引擎 MEE**：MEE 主要保护离开 CPU 后的 EPC 内容，挡不住缓存、TLB、页表这类软件可观察路径。

4. **忘记 DEBUG 属性和测量细节**：调试 enclave 会失去生产安全保证；如果关键页面没被 EEXTEND，attestation 看到的就不是完整承诺。

## 适用 vs 不适用场景

**适用**：

- 想理解 SGX 1 的内存组织、生命周期、attestation 和 key derivation
- 想给机密计算框架建立威胁模型，而不是只会调用 SDK
- 想追踪 SGX 后续攻击论文为什么总盯着页表、缓存和 speculative execution

**不适用**：

- 想快速写一个 SGX demo；读 SDK 文档更直接
- 想找某个 Intel CPU 具体型号的最新支持状态；这篇是 2016 年分析
- 想得到形式化证明；论文很多地方是基于公开材料和专利做合理推断

## 历史小故事（可跳过）

- **2013 年**：Intel 公开 SGX 的早期论文，描述隔离执行的新指令和软件模型。
- **2014 年**：Haven 展示把未修改应用放进 SGX 的愿景，让“云上机密计算”更像真实系统问题。
- **2015 年**：Intel 手册、教程和早期 SGX 资料逐渐公开，但很多微架构细节仍然分散。
- **2016 年**：Costan 和 Devadas 把公开论文、SDM、教程、专利拼成一份 100 多页的结构化解释。
- **2018 年以后**：Foreshadow、SgxPectre、Plundervolt 等攻击说明，SGX 的“直接读写隔离”不能替代完整侧信道防护。

## 学到什么

1. **安全承诺要拆到攻击面**：SGX 能防直接读写 EPC，不代表能防页表轨迹、缓存计时和超线程观察。
2. **小 TCB 不是零 TCB**：CPU 微码、MEE、Launch Enclave、Quoting Enclave、Intel 证书链都进入了信任边界。
3. **兼容性会带来复杂性**：SGX 保留操作系统管理页面的能力，所以工程上容易落地，安全上也留下被观察的入口。
4. **读安全论文要问“材料是什么”**：这篇的材料不是实验数据集，而是 Intel 公开论文、SDM、教程、专利和作者的推理。
5. **公开文档的沉默也是信号**：当手册不解释 MEE、Launch Enclave 或性能计数器细节时，安全分析必须把“不知道”当成风险。

## 延伸阅读

- 论文入口：[Intel SGX Explained, IACR ePrint 2016/086](https://eprint.iacr.org/2016/086)
- [[sgx-2013]] —— Intel 早期介绍 SGX 指令和软件模型的论文
- [[haven-2014]] —— 把应用搬进 enclave 的系统化尝试
- [[sanctum-2016]] —— Costan 团队针对 SGX 侧信道缺口提出的替代安全处理器设计
- [[controlled-channel-attacks-2015]] —— 页表和缺页为什么能变成确定性侧信道
- [[foreshadow-sgx-2018]] —— 后来直接打穿 SGX attestation 根基的代表性攻击

## 关联

- [[sgx-2013]] —— 这篇解释的核心对象就是 SGX 指令集和 enclave 模型
- [[haven-2014]] —— Haven 代表“把现有应用放进 SGX”的系统方向
- [[lipp-meltdown-2018]] —— 同样利用 CPU 微架构行为和特权边界之间的缝隙
- [[kocher-spectre-2019]] —— speculative execution 让 SGX 侧信道问题进一步放大
- [[controlled-channel-attacks-2015]] —— 直接对应论文讨论的 passive address translation attack
- [[sanctum-2016]] —— 作者读懂 SGX 缺口后提出的更强隔离方案

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[controlled-channel-attacks-2015]] —— Controlled-Channel Attacks 2015 — 不可信操作系统也能用缺页记录偷看程序
- [[foreshadow-2018]] —— Foreshadow 2018 — SGX 保险箱也挡不住瞬态执行脚印
- [[lee-keystone-2020]] —— Keystone — 用开源 RISC-V 拼一套可定制 TEE
- [[ngabonziza-trustzone-2016]] —— TrustZone Explained — 把手机 CPU 分成普通区和保密区
- [[sanctum-2016]] —— Sanctum 2016 — 用少量硬件改动做强隔离 enclave

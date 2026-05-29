---
title: 论文候选 — 安全 / 隐私 / 差分隐私 / 同态加密
description: 50 篇候选，按 13 个子主题分组，避开 study/papers 现有 diffie-hellman / rsa / aes / bitcoin / zk-snark，以及 papers-operating-systems 的 sgx-2013 / haven-2014、papers-network-protocols 的 tor-2004 / chaum-1981-mix / lucky13-2013、papers-formal-methods 的 proverif-2001 / tamarin-2012 / easycrypt-2011 / cryptoverif-2008 / hacl-star-2017
日期: 2026-05-29
---

# 安全 / 隐私 / 差分隐私 / 同态加密主题候选

候选 50 篇，按 13 个子主题分组。覆盖 1981—2020，与 study 站既有的 diffie-hellman / rsa / aes / bitcoin / zk-snark 五篇密码学奠基形成"传统公钥/对称/区块链 → 隐私计算 + 后量子 + 形式化安全"的自然延展。已与 papers-operating-systems（sgx-2013 / haven-2014）、papers-network-protocols（tor-2004 / chaum-1981-mix / lucky13-2013）、papers-formal-methods（proverif-2001 / tamarin-2012 / easycrypt-2011 / cryptoverif-2008 / hacl-star-2017）三大相邻候选池交叉去重。

## 差分隐私（7 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `dwork-dp-icalp-2006` | Differential Privacy | 2006 | Dwork ICALP 论文；DP 形式化定义首次提出（ε 参数 + 邻接数据集不可区分性）；后续所有差分隐私论文的概念入口 | https://www.microsoft.com/en-us/research/publication/differential-privacy/ |
| `dwork-calibrating-noise-2006` | Calibrating Noise to Sensitivity in Private Data Analysis | 2006 | Dwork-McSherry-Nissim-Smith TCC 论文；Laplace 机制和敏感度概念奠基；DP-SGD / RAPPOR / Apple LDP 全部基于此校准噪声 | https://link.springer.com/chapter/10.1007/11681878_14 |
| `dwork-our-data-ourselves-2006` | Our Data, Ourselves: Privacy via Distributed Noise Generation | 2006 | Dwork-Kenthapadi-McSherry-Mironov-Naor Eurocrypt 论文；Gaussian 机制 + 分布式噪声生成；高斯派系隐私会计的起点 | https://www.iacr.org/archive/eurocrypt2006/40040485/40040485.pdf |
| `mironov-renyi-dp-2017` | Rényi Differential Privacy | 2017 | Mironov 用 Rényi 散度统一隐私会计；TensorFlow Privacy / Opacus / Google DP-SGD 部署默认用 RDP 计算 ε 边界 | https://arxiv.org/abs/1702.07476 |
| `duchi-local-dp-2013` | Local Privacy and Statistical Minimax Rates | 2013 | Duchi-Jordan-Wainwright FOCS 论文；本地差分隐私（LDP）理论基础；Apple / Google 所有"客户端先加噪"系统的统计极限 | https://arxiv.org/abs/1302.3203 |
| `erlingsson-rappor-2014` | RAPPOR: Randomized Aggregatable Privacy-Preserving Ordinal Response | 2014 | Erlingsson-Pihur-Korolova CCS 论文；Google Chrome 收集统计的 LDP 协议；Apple iOS 表情/QuickType 隐私收集思想同源 | https://research.google/pubs/rappor-randomized-aggregatable-privacy-preserving-ordinal-response/ |
| `abadi-dpsgd-2016` | Deep Learning with Differential Privacy | 2016 | Abadi-Chu-Goodfellow-McMahan 等 CCS 论文；DP-SGD 算法 + Moments Accountant；现代私有 ML 训练（TensorFlow Privacy / Opacus / 私有 LLM）实操起点 | https://arxiv.org/abs/1607.00133 |

## 联邦学习（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `mcmahan-fedavg-2017` | Communication-Efficient Learning of Deep Networks from Decentralized Data | 2017 | McMahan 等 AISTATS 论文；FedAvg 算法 + Federated Learning 概念首次提出；Google Gboard 输入法预测的部署论文 | https://arxiv.org/abs/1602.05629 |
| `kairouz-advances-fl-2019` | Advances and Open Problems in Federated Learning | 2019 | Kairouz 等 60+ 作者综述（FnT in ML）；cross-silo / cross-device 概念首次系统化，58 个开放问题路线图 | https://arxiv.org/abs/1912.04977 |
| `bonawitz-fl-system-2019` | Towards Federated Learning at Scale: System Design | 2019 | Bonawitz 等 MLSys 论文；Google FL 工业级 Android 系统设计；理解参与者选择 / 安全聚合 / 设备失联恢复的工程权衡 | https://arxiv.org/abs/1902.01046 |

## 同态加密（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `gentry-fhe-2009` | A Fully Homomorphic Encryption Scheme | 2009 | Gentry Stanford PhD 论文；首次构造 FHE（基于理想格 + 重加密）；2009 后所有 FHE 方案的母本 | https://crypto.stanford.edu/craig/craig-thesis.pdf |
| `brakerski-bgv-2012` | Fully Homomorphic Encryption without Bootstrapping | 2012 | Brakerski-Gentry-Vaikuntanathan ITCS 论文；BGV 方案 + 模数切换技术消除昂贵 bootstrapping；HElib 默认实现 | https://eprint.iacr.org/2011/277 |
| `fan-vercauteren-bfv-2012` | Somewhat Practical Fully Homomorphic Encryption | 2012 | Fan-Vercauteren BFV 方案；批量打包 + RNS 表示让 FHE 整数运算切实可用；Microsoft SEAL / OpenFHE 默认 BFV | https://eprint.iacr.org/2012/144 |
| `cheon-ckks-2017` | Homomorphic Encryption for Arithmetic of Approximate Numbers | 2017 | Cheon-Kim-Kim-Song Asiacrypt 论文；CKKS 把 FHE 扩展到浮点近似算术；隐私 ML 推理（私有逻辑回归 / 神经网络）的工业默认方案 | https://eprint.iacr.org/2016/421 |
| `chillotti-tfhe-2016` | Faster Fully Homomorphic Encryption: Bootstrapping in Less Than 0.1 Seconds | 2016 | Chillotti-Gama-Georgieva-Izabachène Asiacrypt 论文；TFHE 把 bootstrapping 时间从分钟级降到 0.1s；Concrete / TFHE-rs 现代加密 ML 库基础 | https://eprint.iacr.org/2016/870 |

## 可验证计算 / 现代 ZK 证明（4 篇，避开 zk-snark）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `ben-sasson-stark-2018` | Scalable, Transparent, and Post-Quantum Secure Computational Integrity | 2018 | Ben-Sasson-Bentov-Horesh-Riabzev STARK 论文；无 trusted setup + 抗量子的 succinct argument；StarkNet / RISC Zero / Polygon zkEVM 全部基于此 | https://eprint.iacr.org/2018/046 |
| `bunz-bulletproofs-2018` | Bulletproofs: Short Proofs for Confidential Transactions and More | 2018 | Bünz-Bootle-Boneh-Poelstra-Wuille-Maxwell IEEE S&P 论文；无 trusted setup 的 range proof；Monero 隐私交易 / Mimblewimble 默认 ZK | https://eprint.iacr.org/2017/1066 |
| `gabizon-plonk-2019` | PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge | 2019 | Gabizon-Williamson-Ciobotaru AZTEC PLONK 论文；通用 trusted setup + 多项式承诺；Aztec / Mina / zkSync / Polygon zkEVM 主流 SNARK 方案 | https://eprint.iacr.org/2019/953 |
| `bowe-halo-2019` | Halo: Recursive Proof Composition without a Trusted Setup | 2019 | Bowe-Grigg-Hopwood Electric Coin（Zcash）论文；递归 SNARK + 无 trusted setup；Halo 2 已是 Zcash Orchard 共识层核心 | https://eprint.iacr.org/2019/1021 |

## 形式化安全 / 程序分析（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `cadar-klee-2008` | KLEE: Unassisted and Automatic Generation of High-Coverage Tests for Complex Systems Programs | 2008 | Cadar-Dunbar-Engler OSDI 论文；KLEE 符号执行 + 约束求解器自动生成测试；GNU Coreutils 56 处 bug 验证、安全研究主力工具 | https://www.usenix.org/legacy/event/osdi08/tech/full_papers/cadar/cadar.pdf |
| `bohme-aflfast-2016` | Coverage-based Greybox Fuzzing as Markov Chain | 2016 | Böhme-Pham-Roychoudhury CCS 论文；AFL 基于 Markov 链的智能种子调度；今天 AFL++ / libFuzzer / honggfuzz 调度器都源于此 | https://mboehme.github.io/paper/CCS16.pdf |
| `newsome-taintcheck-2005` | Dynamic Taint Analysis for Automatic Detection, Analysis, and Signature Generation of Exploits on Commodity Software | 2005 | Newsome-Song NDSS 论文；TaintCheck 把"敏感数据流追踪"形式化；DECAF / Triton / Pin / Frida 污点引擎奠基 | https://valgrind.org/docs/newsome2005.pdf |
| `avgustinov-codeql-2016` | QL: Object-Oriented Queries on Relational Data | 2016 | Avgustinov-de Moor-Jones ECOOP 论文；CodeQL 查询语言形式化基础；GitHub Advanced Security / 全球安全研究人员审计大型代码库的标准工具 | https://drops.dagstuhl.de/opus/volltexte/2016/6121/pdf/LIPIcs-ECOOP-2016-2.pdf |

## 后量子密码（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `regev-lwe-2005` | On Lattices, Learning with Errors, Random Linear Codes, and Cryptography | 2005 | Regev STOC 论文；LWE 问题的 worst-case 到 average-case 归约；Kyber / Dilithium / FHE 全系格密码方案的安全性根基 | https://cims.nyu.edu/~regev/papers/qcrypto.pdf |
| `bos-kyber-2018` | CRYSTALS-Kyber: A CCA-Secure Module-Lattice-Based KEM | 2018 | Bos-Ducas-Kiltz 等 EuroS&P 论文；NIST PQC 标准 ML-KEM（FIPS 203）的算法描述；Cloudflare / OpenSSL 后量子 TLS 默认 KEM | https://eprint.iacr.org/2017/634 |
| `ducas-dilithium-2018` | CRYSTALS-Dilithium: A Lattice-Based Digital Signature Scheme | 2018 | Ducas-Kiltz-Lepoint 等论文；NIST PQC 标准 ML-DSA（FIPS 204）的算法描述；HSM / 卡片 / TLS 服务器证书后量子化的主力签名 | https://eprint.iacr.org/2017/633 |
| `bernstein-sphincs-2015` | SPHINCS: Practical Stateless Hash-Based Signatures | 2015 | Bernstein-Hopwood-Hülsing-Lange Eurocrypt 论文；纯 hash 签名 + 无状态；NIST PQC 标准 SLH-DSA（FIPS 205）的前身，作为格密码的"保险" | https://sphincs.cr.yp.to/sphincs-20141001.pdf |

## 多方安全计算 / 隐私计算（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `yao-garbled-circuits-1986` | How to Generate and Exchange Secrets | 1986 | Yao FOCS 论文；garbled circuits 协议奠基；安全两方计算（2PC）的算法基础；Yao 因此获 2000 年图灵奖 | https://research.cs.wisc.edu/areas/sec/yao1982-ocr.pdf |
| `gmw-mental-game-1987` | How to Play any Mental Game or A Completeness Theorem for Protocols with Honest Majority | 1987 | Goldreich-Micali-Wigderson STOC 论文；任意函数都可由秘密分享 + OT 安全计算；多方安全计算（MPC）通用性证明 | https://dl.acm.org/doi/10.1145/28395.28420 |
| `rabin-ot-1981` | How to Exchange Secrets with Oblivious Transfer | 1981 | Rabin Aiken Lab 技术报告；oblivious transfer 概念诞生；MPC / Garbled Circuits / PSI 所有协议不可或缺的底层原语 | https://eprint.iacr.org/2005/187 |
| `freedman-psi-2004` | Efficient Private Matching and Set Intersection | 2004 | Freedman-Nissim-Pinkas Eurocrypt 论文；首次给出 polynomial-encoding 的 PSI 协议；Apple Find My / Google Password Checkup / WhatsApp Contact Discovery 全部源于此族 | https://eprint.iacr.org/2004/044 |

## 匿名通信（4 篇，避开 papers-network-protocols 已收录的 chaum-1981-mix / tor-2004）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `reed-onion-routing-1998` | Anonymous Connections and Onion Routing | 1998 | Reed-Syverson-Goldschlag JSAC 论文；洋葱路由概念 + 第一代 NRL Onion Router；Tor 设计的直接前身，与 papers-network-protocols 候选 tor-2004 配对阅读 | https://www.onion-router.net/Publications/JSAC-1998.pdf |
| `dingledine-mixminion-2003` | Mixminion: Design of a Type III Anonymous Remailer Protocol | 2003 | Dingledine-Mathewson-Syverson IEEE S&P 论文；现代匿名 email 系统设计 + 重放保护；与 papers-network-protocols 候选 chaum-1981-mix 形成 mixnet 22 年演进 | https://www.mixminion.net/minion-design.pdf |
| `danezis-sphinx-2009` | Sphinx: A Compact and Provably Secure Mix Format | 2009 | Danezis-Goldberg IEEE S&P 论文；mix 网络消息格式的紧凑可证明安全设计；Loopix / Nym / Lightning Network onion encryption 全部使用 Sphinx 格式 | https://www.cypherpunks.ca/~iang/pubs/Sphinx_Oakland09.pdf |
| `piotrowska-loopix-2017` | The Loopix Anonymity System | 2017 | Piotrowska-Hayes-Elahi-Meiser-Danezis USENIX Security 论文；现代低延迟 mix 网络（Poisson mix + cover traffic）；Nym 项目的设计基础 | https://www.usenix.org/system/files/conference/usenixsecurity17/sec17-piotrowska.pdf |

## 数据脱敏 / 关系数据匿名化（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `sweeney-k-anonymity-2002` | k-Anonymity: A Model for Protecting Privacy | 2002 | Sweeney IJUFKS 论文；k-anonymity 概念诞生 + 用美国人口普查 + 选民登记联表演示再识别攻击；GDPR 时代仍是个人数据匿名化基线 | https://dataprivacylab.org/dataprivacy/projects/kanonymity/kanonymity.pdf |
| `machanavajjhala-l-diversity-2007` | l-Diversity: Privacy Beyond k-Anonymity | 2007 | Machanavajjhala-Gehrke-Kifer-Venkitasubramaniam ICDE 论文；指出 k-anonymity 同质性攻击 → l-diversity 修补；解释"匿名化为何永远抓不到差分隐私的水位" | https://www.cs.cornell.edu/~vmuthu/research/ldiversity.pdf |
| `li-t-closeness-2007` | t-Closeness: Privacy Beyond k-Anonymity and l-Diversity | 2007 | Li-Li-Venkatasubramanian ICDE 论文；EMD 距离度量敏感属性分布 → 进一步修补 l-diversity 偏度攻击；k/l/t 三阶段递进式匿名化最终方案 | https://www.cs.purdue.edu/homes/ninghui/papers/t_closeness_icde07.pdf |

## AI 安全 / 对抗机器学习（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `szegedy-adversarial-2013` | Intriguing Properties of Neural Networks | 2013 | Szegedy-Zaremba-Sutskever-Bruna-Erhan-Goodfellow-Fergus ICLR 2014；首次发现"小扰动 → 任意误分类"对抗样本现象；整个对抗机器学习领域的开篇 | https://arxiv.org/abs/1312.6199 |
| `goodfellow-fgsm-2014` | Explaining and Harnessing Adversarial Examples | 2014 | Goodfellow-Shlens-Szegedy ICLR 2015；FGSM 算法 + 线性假设解释对抗样本根源；最被 cite 的对抗攻防论文 | https://arxiv.org/abs/1412.6572 |
| `madry-pgd-2017` | Towards Deep Learning Models Resistant to Adversarial Attacks | 2017 | Madry-Makelov-Schmidt-Tsipras-Vladu ICLR 2018；PGD 攻击 + min-max 鲁棒训练框架；当前对抗鲁棒性 benchmark（RobustBench）默认评估方法 | https://arxiv.org/abs/1706.06083 |
| `shokri-mia-2017` | Membership Inference Attacks Against Machine Learning Models | 2017 | Shokri-Stronati-Song-Shmatikov IEEE S&P 论文；首次系统化"模型泄漏训练数据成员"攻击；引出 ML 隐私 = DP-SGD 必要性的实证依据 | https://arxiv.org/abs/1610.05820 |

## 侧信道攻击（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `kocher-spectre-2019` | Spectre Attacks: Exploiting Speculative Execution | 2019 | Kocher 等 IEEE S&P 论文；推测执行 + 缓存侧信道穿越进程隔离；Intel/AMD/ARM 全 CPU 微架构紧急补丁，软件 KAISER 隔离的起因 | https://spectreattack.com/spectre.pdf |
| `lipp-meltdown-2018` | Meltdown: Reading Kernel Memory from User Space | 2018 | Lipp 等 USENIX Security 论文；越权读内核内存；Linux KPTI / macOS DKE / Windows KVA Shadow 等 OS 重大改造的导火索 | https://meltdownattack.com/meltdown.pdf |
| `kim-rowhammer-2014` | Flipping Bits in Memory Without Accessing Them | 2014 | Kim 等 ISCA 论文；DRAM 物理层 bit flip → 软件越权；今天云厂商 ECC 强制 / target row refresh 硬件方案的源头 | https://users.ece.cmu.edu/~yoonguk/papers/kim-isca14.pdf |

## 可信执行环境（3 篇，避开 papers-operating-systems 已收录的 sgx-2013 / haven-2014）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `costan-sgx-explained-2016` | Intel SGX Explained | 2016 | Costan-Devadas IACR ePrint 全长技术分析；首次完整公开 SGX 内部机制 + 攻击面（cache / memory / 页表）；今天所有 SGX 安全研究 / Gramine / Open Enclave 入门必读 | https://eprint.iacr.org/2016/086 |
| `ngabonziza-trustzone-2016` | TrustZone Explained: Architectural Features and Use Cases | 2016 | Ngabonziza 等 IEEE CIC 论文；ARM TrustZone 完整体系结构介绍；Android Keystore / iOS Secure Enclave / Pixel Titan M / 智能卡 / 车机系统的硬件基础 | https://ieeexplore.ieee.org/document/7809124 |
| `lee-keystone-2020` | Keystone: An Open Framework for Architecting Trusted Execution Environments | 2020 | Lee-Kohlbrenner-Shinde-Asanović-Song EuroSys 论文；首个开源 RISC-V TEE 框架；与 Intel SGX 闭源对照，TEE 设计取舍系统化讨论 | https://keystone-enclave.org/files/keystone-eurosys20.pdf |

## DeFi 安全 / 智能合约攻击（2 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `atzei-eth-attacks-2017` | A Survey of Attacks on Ethereum Smart Contracts | 2017 | Atzei-Bartoletti-Cimoli POST 论文；reentrancy / DAO / King of Ether / Parity 多重签名钱包等 9 类智能合约漏洞分类系统化；Solidity 安全编码规范的源头 | https://eprint.iacr.org/2016/1007 |
| `daian-flash-boys-2020` | Flash Boys 2.0: Frontrunning, Transaction Reordering, and Consensus Instability in Decentralized Exchanges | 2020 | Daian-Goldfeder-Kell-Li-Zhao-Bentov-Breidenbach-Juels IEEE S&P 论文；首次系统化定义 MEV（矿工/搜索者可提取价值）；引发 Flashbots / MEV-Boost / PBS 行业格局变革 | https://arxiv.org/abs/1904.05234 |

---

## 备注

- 全 50 篇均有公开 PDF / DOI / 论文页面
- 时间跨度 1981（rabin-ot）— 2020（lee-keystone / daian-flash-boys），覆盖 13 个子主题
- 已与 study/papers/ 现有 diffie-hellman / rsa / aes / bitcoin / zk-snark 五篇密码学奠基交叉去重
- 已与 papers-operating-systems 候选池去重：sgx-2013（Innovative Instructions）/ haven-2014 不重复 — 因此 TEE 板块用 costan-sgx-explained-2016（更深的二次解读）+ ngabonziza-trustzone-2016 + lee-keystone-2020
- 已与 papers-network-protocols 候选池去重：tor-2004 / chaum-1981-mix / lucky13-2013 不重复 — 因此匿名通信板块用 reed-onion-routing-1998（Tor 前身）+ dingledine-mixminion-2003（Chaum 后继）+ danezis-sphinx-2009 + piotrowska-loopix-2017
- 已与 papers-formal-methods 候选池去重：proverif-2001 / tamarin-2012 / easycrypt-2011 / cryptoverif-2008 / hacl-star-2017 不重复 — 形式化安全板块刻意选程序分析方向（KLEE / AFL / TaintCheck / CodeQL）而非协议验证
- Apple 的 "Learning with Privacy at Scale" 报告未单列：DP 板块的 erlingsson-rappor-2014 + duchi-local-dp-2013 已覆盖工业 LDP 部署，可在阅读时把 Apple 报告作为补充读物
- Microsoft SEAL 论文未单列：HE 板块的 fan-vercauteren-bfv-2012 + cheon-ckks-2017 即 SEAL 实现的两大核心方案；阅读时直接把 SEAL 当工程参考
- 推荐阅读路径：
  - 现有 diffie-hellman + rsa + 候选 regev-lwe-2005 / bos-kyber-2018 / ducas-dilithium-2018 / bernstein-sphincs-2015 → 公钥密码"经典群论 → 后量子格密码 + 哈希签名"完整迁移
  - 现有 aes + 候选 gentry-fhe-2009 / brakerski-bgv-2012 / fan-vercauteren-bfv-2012 / cheon-ckks-2017 / chillotti-tfhe-2016 → 对称加密"明文加密 → 密文上算术"FHE 50 年史
  - 现有 zk-snark + 候选 ben-sasson-stark-2018 / bunz-bulletproofs-2018 / gabizon-plonk-2019 / bowe-halo-2019 → ZK 证明"trusted setup → 透明 → 递归"演化树
  - 现有 bitcoin + 候选 atzei-eth-attacks-2017 / daian-flash-boys-2020 → 区块链"账本设计 → 智能合约攻击面 → MEV 经济层"三层叠
  - 候选 dwork-dp-icalp-2006 / dwork-calibrating-noise-2006 / dwork-our-data-ourselves-2006 → DP 三联：定义 → Laplace 机制 → Gaussian 机制
  - 候选 mironov-renyi-dp-2017 / duchi-local-dp-2013 / erlingsson-rappor-2014 / abadi-dpsgd-2016 → DP 工业部署四篇：会计学 → LDP → Google Chrome → Deep Learning
  - 候选 mcmahan-fedavg-2017 / kairouz-advances-fl-2019 / bonawitz-fl-system-2019 → 联邦学习从论文到 Google Gboard 部署 + cross-silo / cross-device 系统化
  - 候选 yao-garbled-circuits-1986 / gmw-mental-game-1987 / rabin-ot-1981 / freedman-psi-2004 → MPC 80 年代奠基 → PSI 工程化（Apple Find My / Google Password Checkup 同根）
  - 候选 reed-onion-routing-1998 / dingledine-mixminion-2003 / danezis-sphinx-2009 / piotrowska-loopix-2017 配合 papers-network-protocols 的 chaum-1981-mix / tor-2004 → 匿名通信 36 年完整谱系
  - 候选 sweeney-k-anonymity-2002 / machanavajjhala-l-diversity-2007 / li-t-closeness-2007 → k/l/t 关系数据匿名化迭代史（与 DP 板块对比"为何匿名化最终输给加噪"）
  - 候选 szegedy-adversarial-2013 / goodfellow-fgsm-2014 / madry-pgd-2017 / shokri-mia-2017 → AI 安全四大攻击面：对抗样本发现 → FGSM → PGD min-max → 训练数据泄漏
  - 候选 kocher-spectre-2019 / lipp-meltdown-2018 / kim-rowhammer-2014 → CPU 微架构 + DRAM 物理层"硬件可信边界何时崩塌"三篇
  - 候选 costan-sgx-explained-2016 / ngabonziza-trustzone-2016 / lee-keystone-2020 配合 papers-operating-systems 的 sgx-2013 / haven-2014 → TEE 五篇生态：原始白皮书 → 深度解读 → ARM 对照 → RISC-V 开源 → LibOS 应用
  - 候选 cadar-klee-2008 / bohme-aflfast-2016 / newsome-taintcheck-2005 / avgustinov-codeql-2016 → 程序安全分析四件套：符号执行 / 模糊测试 / 污点跟踪 / 查询式静态分析

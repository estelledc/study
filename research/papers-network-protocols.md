---
title: 论文候选 — 网络 / 通信协议
description: 60 篇候选，由 research subagent 整理，待主 CC 排期写入正式 papers/
日期: 2026-05-29
---

# 网络 / 通信协议主题候选

候选 60 篇，按 12 个子主题分组。覆盖 1974-2020，避开当前 study 站已有的 tcp / tls-1.3 / quic / http-2 / dns。

## 互联网基石（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `cerf-kahn-1974` | A Protocol for Packet Network Intercommunication | 1974 | TCP/IP 诞生论文，互联网协议栈的圣经；Cerf 与 Kahn 凭此获图灵奖；理解"为什么是 IP 而不是别的"的唯一入口 | https://www.cs.princeton.edu/courses/archive/fall06/cos561/papers/cerf74.pdf |
| `metcalfe-boggs-1976` | Ethernet: Distributed Packet Switching for Local Computer Networks | 1976 | 局域网协议的原点，CSMA/CD 机制；几乎所有现代以太网都流自这条血脉，Wi-Fi 也是它的精神后裔 | https://dl.acm.org/doi/10.1145/360248.360253 |
| `saltzer-1984-e2e` | End-to-End Arguments in System Design | 1984 | "尽量把功能往端上推"——互联网设计哲学的核心论文；理解为何 IP 是 dumb pipe、为何应用层要自己做 reliability | https://web.mit.edu/Saltzer/www/publications/endtoend/endtoend.pdf |
| `clark-1988` | The Design Philosophy of the DARPA Internet Protocols | 1988 | Clark 反思 TCP/IP 设计的 7 大目标排序；解释为何"鲁棒性"压过"安全"和"会计"，今天讨论协议演进的元论文 | https://www.cs.princeton.edu/courses/archive/fall06/cos561/papers/clark88.pdf |
| `mills-ntp-1991` | Internet Time Synchronization: The Network Time Protocol | 1991 | NTP 的奠基论文；全球时钟同步范式（分层、漂移补偿）；理解 Spanner TrueTime 之前的精确版 | https://ieeexplore.ieee.org/document/103043 |

## 拥塞控制与 TCP 演进（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `jacobson-1988` | Congestion Avoidance and Control | 1988 | TCP Tahoe 拥塞控制（slow start、AIMD、快速重传）的原始论文；1986 互联网拥塞崩溃后救场之作，每个 socket 还在跑这套思想 | https://ee.lbl.gov/papers/congavoid.pdf |
| `red-1993` | Random Early Detection Gateways for Congestion Avoidance | 1993 | RED AQM 队列管理算法奠基；现代 CoDel/PIE/FQ-CoDel 的祖先，路由器队列管理必读 | https://www.icir.org/floyd/papers/red/red.pdf |
| `tcp-vegas-1995` | TCP Vegas: New Techniques for Congestion Detection and Avoidance | 1995 | 用 RTT 而非丢包做拥塞信号的早期尝试；BBR 的精神先驱，对比 Reno/CUBIC 看清"丢包派 vs 时延派"分叉 | https://www.cs.cornell.edu/people/egs/615/vegas.pdf |
| `cubic-2008` | CUBIC: A New TCP-Friendly High-Speed TCP Variant | 2008 | Linux 默认拥塞算法（2008 起）；高 BDP 链路下用三次曲线探测带宽，理解为何家用宽带跑得动 1Gbps | https://www.cs.princeton.edu/courses/archive/fall16/cos561/papers/Cubic08.pdf |
| `bbr-2017` | BBR: Congestion-Based Congestion Control | 2017 | Google 的下一代拥塞控制；用瓶颈带宽 × 最小 RTT 替代丢包信号，YouTube/GCP 默认；2017 后所有 CC 论文都在跟它对比 | https://research.google/pubs/pub45646/ |

## 路由 / BGP / 网络测量（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `gao-2001-as-relations` | On Inferring Autonomous System Relationships in the Internet | 2001 | 推断 AS 之间 customer/peer/provider 关系的经典算法；CAIDA 路由数据集的底层假设，BGP 测量的入门必读 | https://people.cs.umass.edu/~lgao/ton_relation.pdf |
| `caesar-rexford-2005` | BGP Routing Policies in ISP Networks | 2005 | ISP 内部如何用 local pref / MED / community 做策略路由；理解"为什么我的包绕了大半个地球"的运营视角 | https://www.cs.princeton.edu/~jrex/papers/policies05.pdf |
| `mahajan-2002-bgp-misconfig` | Understanding BGP Misconfiguration | 2002 | 三周观测发现 1% 的路由更新源于配置错误；解释为何 BGP 劫持 / 路由泄漏反复发生 | https://homes.cs.washington.edu/~ratul/papers/sigcomm2002-bgp.pdf |
| `subramanian-2002-internet-hierarchy` | Characterizing the Internet Hierarchy from Multiple Vantage Points | 2002 | 把 AS 拓扑分层（Tier-1 → Tier-2 → 末端）的奠基性测量论文；理解 Internet 层级结构 | https://nms.csail.mit.edu/papers/internet-infocom02.pdf |
| `r-bgp-2007` | R-BGP: Staying Connected in a Connected World | 2007 | 利用故障备份路径让 BGP 收敛期保持连通；理解为何"路由收敛要十几秒"以及怎么修 | https://nms.csail.mit.edu/papers/Kushman07RBGP.pdf |

## HTTP / Web 架构（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `fielding-rest-2000` | Architectural Styles and the Design of Network-based Software Architectures | 2000 | Fielding 博士论文；REST 架构风格的源头，所有 Web API 设计讨论的元论文，HTTP/1.1 RFC 主作者 | https://ics.uci.edu/~fielding/pubs/dissertation/fielding_dissertation.pdf |
| `mogul-1995-persistent-http` | The Case for Persistent-Connection HTTP | 1995 | 论证为何要把 HTTP/1.0 的"一请求一连接"改成 keep-alive；HTTP/1.1 持久连接的论据 | https://gnatto.com/files/the-case-for-persistent-connection-http.pdf |
| `padmanabhan-1995-http-latency` | Improving HTTP Latency | 1995 | HTTP 早期延迟优化（pipelining / persistent / TCP fast open）的实证分析；今天 HTTP/2/3 的优化方向都从这里发芽 | https://www2.eecs.berkeley.edu/Pubs/TechRpts/1995/CSD-95-859.pdf |
| `krishnamurthy-1999-http11` | Key Differences between HTTP/1.0 and HTTP/1.1 | 1999 | 详尽对比两版协议变更（cache 控制、host header、chunked）；理解 HTTP 演进史的入门 | https://www.cs.cornell.edu/people/egs/615/http11.pdf |
| `wang-2014-spdy` | How Speedy is SPDY? | 2014 | NSDI 实证 SPDY（HTTP/2 前身）真实加速效果有限；揭示协议优化要看完整 stack 而非单点 benchmark | https://www.usenix.org/system/files/conference/nsdi14/nsdi14-paper-wang_xiao_sophia.pdf |

## TLS / 加密传输（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `diffie-hellman-1976` | New Directions in Cryptography | 1976 | 公钥密码学奠基论文；Diffie-Hellman 密钥交换 + 数字签名概念诞生，TLS 握手的数学基础 | https://ee.stanford.edu/~hellman/publications/24.pdf |
| `heartbleed-2014` | The Matter of Heartbleed | 2014 | 2014 OpenSSL 心脏出血漏洞的全网测量；理解大规模协议漏洞如何披露、修复、影响多年 | https://jhalderm.com/pub/papers/heartbleed-imc14.pdf |
| `lucky13-2013` | Lucky Thirteen: Breaking the TLS and DTLS Record Protocols | 2013 | TLS CBC mode 的 timing attack；推动 TLS 1.3 抛弃 CBC 改用 AEAD 的关键论文 | https://www.isg.rhul.ac.uk/tls/TLStiming.pdf |
| `logjam-2015` | Imperfect Forward Secrecy: How Diffie-Hellman Fails in Practice | 2015 | Logjam 攻击 + DH 参数共享导致的国家级解密风险；TLS 1.3 强制椭圆曲线的导火索 | https://weakdh.org/imperfect-forward-secrecy-ccs15.pdf |
| `mitls-2014-triple-handshake` | Triple Handshakes and Cookie Cutters: Breaking and Fixing Authentication over TLS | 2014 | miTLS 团队发现的握手身份混淆攻击；TLS 1.3 显式绑定握手哈希的依据 | https://mitls.org/downloads/triple-handshakes.pdf |

## DNS / 命名服务（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `mockapetris-1988-dns` | Development of the Domain Name System | 1988 | DNS 设计者 Mockapetris 的回顾论文；分层命名 + 缓存 + 委派的设计思路完整呈现 | https://dl.acm.org/doi/10.1145/52324.52338 |
| `rfc-3833-dns-threats` | Threat Analysis of the Domain Name System | 2004 | IETF 官方 DNS 威胁模型（缓存污染、答案伪造、隐私泄漏）；DNSSEC 的设计动因 | https://datatracker.ietf.org/doc/html/rfc3833 |
| `amplification-hell-2014` | Amplification Hell: Revisiting Network Protocols for DDoS Abuse | 2014 | DNS / NTP / SSDP 等放大攻击系统综述；理解 2010s DDoS 流量为何动辄几百 Gbps | https://christian-rossow.de/publications/amplification-ndss2014.pdf |
| `dot-doh-perf-2020` | Comparing the Effects of DNS, DoT, and DoH on Web Performance | 2020 | 实证 DNS over TLS / HTTPS 对网页加载的影响；理解隐私 vs 性能的真实权衡 | https://arxiv.org/abs/1907.08089 |
| `codons-2004` | The Design and Implementation of a Next Generation Name Service for the Internet | 2004 | 用 Pastry DHT 替代分层 DNS 的实验性提案；理解去中心化 DNS 的可能性与代价 | https://www.cs.cornell.edu/people/egs/papers/codons-sigcomm.pdf |

## 数据中心网络（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `fat-tree-2008` | A Scalable, Commodity Data Center Network Architecture | 2008 | Al-Fares 的 Fat-Tree 拓扑；用商用交换机搭无阻塞数据中心网络的范式，几乎所有云厂商都在用 | https://ccr.sigcomm.org/online/files/p63-alfares.pdf |
| `vl2-2009` | VL2: A Scalable and Flexible Data Center Network | 2009 | Microsoft 数据中心架构；Valiant 负载均衡 + 二层语义跨三层网络，Azure 网络底座 | https://www.microsoft.com/en-us/research/wp-content/uploads/2009/08/vl2-sigcomm09-final.pdf |
| `jupiter-2015` | Jupiter Rising: A Decade of Clos Topologies and Centralized Control in Google's Datacenter Network | 2015 | Google 数据中心网络十年演进（从 Firehose 到 Jupiter）；揭示带宽十万倍增长怎么实现 | https://research.google/pubs/jupiter-rising-a-decade-of-clos-topologies-and-centralized-control-in-googles-datacenter-network/ |
| `b4-2013` | B4: Experience with a Globally-Deployed Software Defined WAN | 2013 | Google 跨数据中心 WAN 用 SDN 集中控制；流量工程把链路利用率拉到 95%+，SDN 工业落地代表作 | https://research.google/pubs/pub41761/ |
| `andromeda-2018` | Andromeda: Performance, Isolation, and Velocity at Scale in Cloud Network Virtualization | 2018 | GCP 网络虚拟化数据面；如何在虚拟交换机上做到 32 Gbps 吞吐 + 微秒级延迟 | https://www.usenix.org/system/files/conference/nsdi18/nsdi18-dalton.pdf |

## SDN / 可编程网络（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `openflow-2008` | OpenFlow: Enabling Innovation in Campus Networks | 2008 | OpenFlow 协议宣言论文；控制面/数据面分离思想的工业起点，SDN 一切讨论的源头 | https://archive.openflow.org/documents/openflow-wp-latest.pdf |
| `ethane-2007` | Ethane: Taking Control of the Enterprise | 2007 | OpenFlow 的精神前身；以策略为中心管理企业网络，控制器 + 哑交换机的范式雏形 | https://yuba.stanford.edu/~casado/ethane-sigcomm07.pdf |
| `p4-2014` | P4: Programming Protocol-Independent Packet Processors | 2014 | 数据面可编程语言；从"OpenFlow 固定 match-action"进化到"用户定义包格式"，可编程交换机的事实标准 | https://arxiv.org/abs/1312.1719 |
| `frenetic-2011` | Frenetic: A Network Programming Language | 2011 | 用函数式语言写 SDN 控制面；引入 query/update 语义，编译到 OpenFlow 规则的开创性工作 | https://www.cs.cornell.edu/~jnfoster/papers/frenetic-icfp.pdf |
| `netkat-2014` | NetKAT: Semantic Foundations for Networks | 2014 | 网络的代数语义（基于 Kleene 代数 with tests）；可形式化验证转发行为，安全性证明的理论基石 | https://www.cs.cornell.edu/~jnfoster/papers/frenetic-netkat.pdf |

## P2P / 去中心化（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `chord-2001` | Chord: A Scalable Peer-to-peer Lookup Service for Internet Applications | 2001 | DHT 的奠基论文；一致性哈希 + 指针表 + O(log N) 查找，所有 P2P 系统都从这套抽象出发 | https://pdos.csail.mit.edu/papers/chord:sigcomm01/chord_sigcomm.pdf |
| `pastry-2001` | Pastry: Scalable, Decentralized Object Location and Routing for Large-Scale Peer-to-Peer Systems | 2001 | 与 Chord 平行的 DHT 设计；前缀路由 + 邻近性感知，FreePastry 实现影响深远 | https://www.cs.rice.edu/~druschel/publications/Pastry.pdf |
| `kademlia-2002` | Kademlia: A Peer-to-peer Information System Based on the XOR Metric | 2002 | XOR 距离 + k-bucket 路由表；BitTorrent DHT、以太坊节点发现都用它，工业最广 DHT | https://pdos.csail.mit.edu/~petar/papers/maymounkov-kademlia-lncs.pdf |
| `bittorrent-2003` | Incentives Build Robustness in BitTorrent | 2003 | tit-for-tat 激励机制论文；解释为何 BitTorrent 比早期 P2P 抗自私节点，博弈论与协议设计的范例 | https://www.bittorrent.org/bittorrentecon.pdf |
| `ipfs-2014` | IPFS - Content Addressed, Versioned, P2P File System | 2014 | 内容寻址文件系统；CID + Merkle DAG + libp2p 的范式集合，Web3 时代去中心化存储的入口 | https://github.com/ipfs/papers/raw/master/ipfs-cap2pfs/ipfs-p2p-file-system.pdf |

## CDN / Anycast / 覆盖网络（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `karger-1997-consistent-hashing` | Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web | 1997 | 一致性哈希诞生论文（Akamai 创始人 Karger 是作者）；今天所有分布式缓存 / 负载均衡 / DHT 的数学基础 | https://www.akamai.com/site/en/documents/research-paper/consistent-hashing-and-random-trees-distributed-caching-protocols-for-relieving-hot-spots-on-the-world-wide-web.pdf |
| `akamai-2010` | The Akamai Network: A Platform for High-Performance Internet Applications | 2010 | Akamai 工业 CDN 全景；DNS 调度 + 边缘缓存 + 中转层的完整架构，至今仍是 CDN 教科书 | https://www.akamai.com/site/en/documents/research-paper/the-akamai-network-a-platform-for-high-performance-internet-applications-technical-publication.pdf |
| `ron-2001` | Resilient Overlay Networks | 2001 | RON 用应用层覆盖网络绕过 BGP 故障；理解 overlay routing 与 underlay 协同的开创性工作 | https://nms.csail.mit.edu/papers/ron-sosp2001.pdf |
| `calder-2015-anycast-cdn` | Analyzing the Performance of an Anycast CDN | 2015 | Microsoft Bing Anycast CDN 的实测分析；揭示 BGP-based anycast 在 90% 用户上够用、10% 病态 | https://www.cs.princeton.edu/courses/archive/fall17/cos561/papers/Anycast15.pdf |
| `donar-2010` | DONAR: Decentralized Server Selection for Cloud Services | 2010 | 给云服务做 DNS-based 全球负载均衡的优化框架；CDN 调度算法的学术参考 | https://www.cs.princeton.edu/~jrex/papers/donar10.pdf |

## 实时通信 / NAT 穿透（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `rtp-rfc-1889` | RTP: A Transport Protocol for Real-Time Applications | 1996 | RTP/RTCP 协议奠基；所有视频会议、流媒体、WebRTC 的传输层基础 | https://datatracker.ietf.org/doc/html/rfc1889 |
| `sctp-multipath-2006` | Concurrent Multipath Transfer Using SCTP Multihoming Over Independent End-to-End Paths | 2006 | SCTP 多路径传输的奠基论文；MPTCP 之前的多宿主探索，理解多链路传输设计取舍 | https://ieeexplore.ieee.org/document/4079085 |
| `ice-rfc-5245` | Interactive Connectivity Establishment (ICE): A Protocol for Network Address Translator (NAT) Traversal | 2010 | ICE 协议规范；STUN + TURN 编排策略，WebRTC P2P 连接建立的核心 | https://datatracker.ietf.org/doc/html/rfc5245 |
| `gcc-webrtc-2016` | Analysis and Design of the Google Congestion Control for Web Real-time Communication (WebRTC) | 2016 | GCC 拥塞控制论文；WebRTC 默认算法，时延敏感场景下的 TCP-friendly 设计 | https://dl.acm.org/doi/10.1145/2910017.2910605 |
| `salsify-2018` | Salsify: Low-Latency Network Video Through Tighter Integration Between a Video Codec and a Transport Protocol | 2018 | NSDI'18，把视频编码器与传输层联合优化；实时视频时延降到 100ms 以下的关键论文 | https://www.usenix.org/system/files/conference/nsdi18/nsdi18-fouladi.pdf |

## 隐私 / VPN / 移动 / IoT（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `wireguard-2017` | WireGuard: Next Generation Kernel Network Tunnel | 2017 | WireGuard 协议论文；4000 行内核代码替代 OpenVPN/IPsec，现代 VPN 设计极简范式 | https://www.wireguard.com/papers/wireguard.pdf |
| `tor-2004` | Tor: The Second-Generation Onion Router | 2004 | 洋葱路由的工业实现论文；理解匿名网络的威胁模型 / 电路构建 / 流量混淆 | https://svn.torproject.org/svn/projects/design-paper/tor-design.pdf |
| `chaum-1981-mix` | Untraceable Electronic Mail, Return Addresses, and Digital Pseudonyms | 1981 | Chaum 提出 mix network 的奠基论文；所有匿名通信（Tor / Mixminion / Loopix）的源头 | https://www.freehaven.net/anonbib/cache/chaum-mix.pdf |
| `mptcp-2012` | How Hard Can It Be? Designing and Implementing a Deployable Multipath TCP | 2012 | NSDI'12，MPTCP 工业落地论文；iPhone Siri 用它做 Wi-Fi/4G 切换，多路径传输事实标准 | https://www.usenix.org/system/files/conference/nsdi12/nsdi12-final125.pdf |
| `mqtt-s-2008` | MQTT-S: A Publish/Subscribe Protocol for Wireless Sensor Networks | 2008 | MQTT 协议在传感网的扩展版；IoT 通信协议的代表，理解发布/订阅范式在受限网络的应用 | https://ieeexplore.ieee.org/document/4554519 |

---

## 备注

- 全部 60 篇均有公开 PDF 或 IETF/DOI 编号
- 时间跨度 1974-2020，涵盖 12 个子主题
- 已验证未与 study 站现有 5 篇网络主题重复（避开 tcp / tls-1.3 / quic / http-2 / dns）
- 个别协议规范（RTP/ICE）以 IETF RFC 形式存在，未单独成 SIGCOMM/NSDI 论文，按惯例引用 RFC
- DNS over HTTPS 性能（Hounsel 2020）提交时为 arXiv preprint，后发表于 PAM 2020

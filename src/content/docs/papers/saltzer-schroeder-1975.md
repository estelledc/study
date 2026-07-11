---
title: Saltzer-Schroeder 1975 — 8 条至今教科书还在引的安全设计原则
来源: Saltzer & Schroeder, "The Protection of Information in Computer Systems", Proceedings of the IEEE, Sept 1975
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

这是 1975 年发表在 IEEE Proceedings 上的一篇综述性论文，把"信息保护"这件事从零散技巧升级成一门工程学。

日常类比：在这篇之前，每个操作系统的安全设计就像各家小餐馆——师傅祖传"少放盐多放糖"，凭经验。这篇论文相当于第一次把厨艺写成《烹饪原理》：先定义"什么是盐、什么是糖、什么是调味"，再总结"哪些原则放进哪种菜都不会出错"。

具体它做了三件事：

1. **统一术语**：principal（谁）/ object（保护什么）/ permission（能做什么）/ protection domain（一组权限的边界）
2. **梳理机制**：访问矩阵、capability、ACL、保护环（rings），把当时所有方案排到一张地图上
3. **提炼原则**：从血泪经验里萃出 **8 条设计原则**——这才是它穿越 50 年还被每本安全教材抄录的原因

## 为什么重要

不理解这 8 条原则，下面这些事都讲不通：

- 为什么 AWS IAM 的 policy 默认是 **deny**，必须显式 allow？
- 为什么现代密码学公开算法、只藏密钥（Kerckhoffs 原则）？
- 为什么 Linux 把 root 拆成几十个 capability，sudo 越用越窄？
- 为什么银行转账要短信 + 密码（两把钥匙），登邮箱也越来越多走 2FA？
- 为什么 Docker 现在主推 rootless，K8s 推零信任？

每一条背后都能追到这篇 1975 的某条原则。它是后来所有"安全工程"语言的字根。

## 核心要点

最值得记的就是 8 条原则（按论文顺序）：

1. **机制经济性（Economy of mechanism）**：保护机制要尽可能小、尽可能简单，因为只有简单的东西才审得过来。复杂的安全机制本身就是漏洞。
2. **默认拒绝（Fail-safe defaults）**：默认状态是"不许"，要给出明确许可才放行。出 bug 时倾向"挡住"而不是"放过"。
3. **完全仲裁（Complete mediation）**：每一次访问都要查权限，不能因为"刚才查过了"就跳过。否则缓存会变成绕过点。
4. **公开设计（Open design）**：安全不能靠"机制保密"，必须靠少量易换的秘密（密钥）。算法、协议都要公开经得起审。
5. **特权分离（Separation of privilege）**：关键操作要"多把钥匙"。一把钥匙被盗整套垮，两把就难得多。
6. **最小特权（Least privilege）**：每个 principal 只拿恰好够用的权限，多一分都别给。
7. **最小公共机制（Least common mechanism）**：尽量减少多个用户共享的机制；共享越多，互相影响和侧信道越多。
8. **心理可接受性（Psychological acceptability）**：用户心里的模型要对得上权限的样子，否则人会想办法绕开（贴密码、共享账号）。

记忆口诀：**简单 / 默认拒 / 每次查 / 公开算 / 多把钥 / 给最少 / 共享少 / 用户懂**。

## 实践案例

### 案例 1：AWS IAM 是 fail-safe defaults 的活化石

```json
{
  "Effect": "Deny",
  "NotAction": "s3:GetObject",
  "Resource": "*"
}
```

新建一个 IAM role 默认什么都不能做。要让它能读 S3，必须**显式**写 allow。任何写错的 policy，最坏结果是"用不了"，不是"全开放"。这就是原则 2：**出错时挡住，而不是放过**。

### 案例 2：Linux capabilities 是 least privilege 的工程实现

历史上 Unix 只有"是不是 root"两档。Linux 2.2 之后把 root 拆成几十个 capability：`CAP_NET_BIND_SERVICE`（绑 1024 以下端口）、`CAP_SYS_TIME`（改系统时间）……

```bash
setcap 'cap_net_bind_service=+ep' /usr/bin/myserver
```

这样 myserver 只能绑端口，其他 root 能干的它都不能。一个进程被攻破，损失被框在"它真的需要的那一小格"——原则 6 的字面落地。

### 案例 3：HTTPS 之外还要 E2EE，是 complete mediation + open design 一起说话

TLS 让浏览器到服务器之间这一段加密。但服务器自己**能看见明文**——服务商被入侵或被传唤，对话就泄了。

Signal / WhatsApp 在应用层再做一遍端到端加密，每条消息都用对方公钥包一层（每次都"仲裁"一次），算法全部公开（Double Ratchet 协议），秘密只有两端的私钥。这同时打满了原则 3（每次都查 / 加密）和原则 4（公开算法、藏密钥）。

### 案例 4：DNS-over-HTTPS 是 psychological acceptability 的反向教训

DNS-over-HTTPS 把查询走 HTTPS 通道。技术上更安全，但配置项藏在浏览器深处。
原则 8 提醒我们：**用户看不见、改不动的安全特性容易被绕过**——
Cloudflare 后来必须做 1.1.1.1 客户端 + 系统级开关，让普通人也能感知到"已开/已关"。
机制再正确，用户心智不接受，落地就打折扣。

## 踩过的坑

1. **把"开源"和"open design"混为一谈**：open design 是"机制经得起公开审视"，不是"代码必须开源"。闭源软件也可以满足，只要别把"算法保密"当作安全栏杆。Kerckhoffs 1883 年就提过同一思想，这篇 1975 把它正式列为原则。
2. **least privilege 给得太碎**：Linux capabilities 拆了 40+ 个，过度拆会让运维写 policy 时望而却步，最后一刀切回 root——违反原则 8（心理可接受性）。Kubernetes RBAC 也是类似教训。
3. **把"complete mediation"理解成"每次都打数据库查权限"**：实际工程里要在缓存与"每次查"之间妥协。重点是**任何修改权限后旧缓存要立即失效**——不是真的字面"每次查"。
4. **把 8 条原则当 checklist**：原则之间会冲突。比如 economy of mechanism（简单）和 separation of privilege（多把钥匙、复杂）在 2FA 场景里就互相拉扯。原则是**判断框架**，不是打勾表。
5. **忘了 least common mechanism 在云时代的回潮**：多租户共享同一台物理机的 cache、同一条 PCIe 总线，就给 Spectre / Rowhammer 这类侧信道开了后门。共享越多，攻击面越大——原则 7 在 2018 年才被业界真正补课。

## 适用 vs 不适用场景

**适用**：

- 设计需要权限模型的系统（OS 内核、数据库、云平台 IAM、消息队列）
- 写代码评审清单（默认拒绝 / 最小特权 / 输入处都要仲裁）
- 设计 API 的访问控制（rate limit、scope、token 权限粒度）
- 评估第三方安全方案：把 8 条对一遍，缺哪条心里有数

**不适用**：

- 加密算法本身的设计（这篇不讲数学，只讲机制）
- 高级威胁建模（侧信道、Spectre 类硬件漏洞 1975 年还没人想到）
- 隐私 / 数据合规（GDPR / CCPA 是后来的话题，与"机制保护"是两个圈）
- 形式化验证（这篇是工程经验，不是数学证明）

## 历史小故事（可跳过）

- **1965 年**：Multics 项目启动，Saltzer 和 Schroeder 都在 MIT。Multics 第一次把"保护"当核心需求设计——保护环、ACL、按段保护一起上。
- **1969 年**：Ken Thompson / Dennis Ritchie 从 Multics 项目"逃出来"，做了简化版 Unix。Unix 的权限模型简陋得多（只有 user/group/other 三档），但够用就赢了。
- **1975 年**：Saltzer 和 Schroeder 写下这篇 IEEE 综述，把 Multics 十年血泪 + 当时所有方案 + 提炼原则一锅端。这是"安全工程"作为一门学科的奠基文献之一。
- **1985 年**：美国国防部出 TCSEC（橙皮书），里面"least privilege"等术语直接抄自这篇。
- **2003 年**：NIST SP 800-27 "Engineering Principles for IT Security"，33 条原则里至少 12 条是这 8 条的直系。

50 年里，每次出大事故（log4j、SolarWinds、Heartbleed）回头看，几乎都能在这 8 条里找到至少一条没守住。

## 学到什么

1. **原则比技术活得长**：这篇里讲的 capability、access matrix 等具体机制大多被新东西替代了，但 8 条原则没变。技术过时，思维框架不过时。
2. **"默认怎么样"决定一个系统的安全上限**：能否从"默认拒绝"开始，决定后续每一行 policy 是补窟窿还是开通道。
3. **公开 vs 保密**：保密的是密钥，不是算法。这条颠覆了大量人的直觉（"代码不能让人看到")，但是现代安全的根基。
4. **人是最弱一环**：原则 8（心理可接受性）是 1975 年就写明的——再好的机制，用户绕过去就归零。Phishing / 共享密码 / 关掉 2FA 全是这一条的反面教材。
5. **综述论文的价值**：这篇本身没有发明新机制，它只是把当时业界做过的方案排版 + 抽原则。但正是这种"梳理 + 命名"的工作，让后人有了共同语言。给我们写笔记的提示：把读过的东西归类、命名，比追新论文更有复利。

## 用作 review checklist

设计一个新系统的访问控制时，可以照单走一遍：

- [ ] 默认是 deny 还是 allow？（原则 2）
- [ ] 每条权限边界有没有"出 bug 时挡住"的兜底？（原则 2）
- [ ] 关键路径上有没有可能被缓存绕过权限？（原则 3）
- [ ] 所谓"安全"是不是依赖某段代码不被人看见？（原则 4）
- [ ] 有没有可能两把钥匙才能动的地方现在只有一把？（原则 5）
- [ ] 默认下发的权限是不是远多于必要？（原则 6）
- [ ] 多租户共享了哪些机制？这些机制能不能成为侧信道？（原则 7）
- [ ] 用户能不能用大白话讲出"我现在有什么权限"？（原则 8）

走完一遍不一定要全满足——有些条会冲突——但每个"否"都要写下"为什么暂时不上"。这就把 1975 年的 8 条原则变成了今天 PR 模板里的一段。

## 延伸阅读

- 论文原文：[The Protection of Information in Computer Systems](https://www.cs.virginia.edu/~evans/cs551/saltzer/)（HTML 版，逐节都有锚点，强烈推荐直接读）
- Bruce Schneier 写的现代复盘：[Schneier on Security — Saltzer & Schroeder Reconsidered](https://www.schneier.com/)（搜博客）
- NIST SP 800-27（橙皮书续篇）—— 把 8 条扩成 33 条工程指南
- [[multics-1965]] —— 这 8 条原则的活体实验场
- [[saltzer-1984-e2e]] —— 同一作者九年后的姊妹篇，把"端到端"原则也写进了教科书

## 关联

- [[multics-1965]] —— 这篇的经验来自 Multics 十年项目
- [[saltzer-1984-e2e]] —— 同一作者后续的端到端论点，也是设计哲学型论文
- [[unix-philosophy]] —— Unix 的权限模型是这 8 条的极简版本
- [[zero-trust]] —— 现代零信任架构本质是把 complete mediation 做到极致

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bohme-aflfast-2016]] —— AFLFast — 把 fuzzing 的力气花在更少人走的路径上
- [[capsicum-2010]] —— Capsicum — 给 UNIX 进程发"通行证"而不是"万能钥匙"
- [[driller-2016]] —— Driller 2016 — 用符号执行给 fuzzing 打穿深分支
- [[dwork-calibrating-noise-2006]] —— 校准噪声 — 往统计结果里加多少噪音才能保护隐私
- [[dwork-dp-icalp-2006]] —— 差分隐私 — 让统计结果有用但查不到任何一个人
- [[dwork-our-data-ourselves-2006]] —— 分布式噪声 — 大家一起加噪音比一个人加更安全
- [[foreshadow-2018]] —— Foreshadow 2018 — SGX 保险箱也挡不住瞬态执行脚印
- [[haven-2014]] —— Haven — 在不信任的云里给程序造一间安全屋
- [[lampson-hints-1983]] —— Lampson Hints 1983 — 系统设计思维起点
- [[ngabonziza-trustzone-2016]] —— TrustZone Explained — 把手机 CPU 分成普通区和保密区
- [[sanctum-2016]] —— Sanctum 2016 — 用少量硬件改动做强隔离 enclave
- [[selinux-2001]] —— SELinux — 给 Linux 装上不可绕过的安检门
- [[sgx-2013]] —— Intel SGX — 在 CPU 里建一间谁都偷看不了的密室
- [[sweeney-k-anonymity-2002]] —— Sweeney k-Anonymity 2002 — 删除姓名还不够的匿名化基线

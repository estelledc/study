---
title: Controlled-Channel Attacks 2015 — 不可信操作系统也能用缺页记录偷看程序
来源: 'Xu, Cui & Peinado, "Controlled-Channel Attacks: Deterministic Side Channels for Untrusted Operating Systems", IEEE S&P 2015'
日期: 2026-07-09
分类: security-privacy
难度: 高级
---

## 是什么

Controlled-Channel Attacks 是一种针对 shielding system 的侧信道攻击：操作系统虽然不能直接读受保护程序的内存，但可以故意制造缺页，记录程序访问了哪些 4KB 页面，再从这些页面轨迹里还原秘密。

日常类比：你看不到房间里的人在写什么字，但你能控制房间里每盏灯的开关。每当他走到某块地板，你就关灯让他喊你来开；久而久之，只凭“哪盏灯被请求打开”的顺序，你也能猜出他在房间里做什么。

这篇论文研究的对象不是普通恶意软件，而是更极端的场景：应用运行在 Haven、InkTag 这类系统里，目标是“不信任操作系统”。硬件或 hypervisor 挡住了 OS 直接读写内存，但 OS 仍然负责分页、调度和资源管理。

论文的核心结论是：只保护“内存内容”还不够；如果访问模式依赖秘密，恶意 OS 可以把分页机制变成一个稳定、低噪声的观察通道。

最小直觉可以写成这样：

```txt
if secret == "A":
  visit(page_10)
else:
  visit(page_27)

os_forces_page_faults()
os_logs([page_10])  # 猜到 secret 更可能是 A
```

这不是直接读 secret，而是读 secret 留下的脚印。

## 为什么重要

不理解 controlled-channel attacks，下面这些事会很难解释：

- 为什么 [[haven-2014]] 这种“把程序锁进 enclave”的方案，仍然可能泄露文本和图片轮廓
- 为什么 [[costan-sgx-explained-2016]] 会强调 SGX 挡住直接读写，但挡不住页表和缺页侧信道
- 为什么安全系统不能只问“谁能读内存”，还要问“谁能观察访问顺序”
- 为什么传统 cache side-channel 的 constant-time 思想，也会迁移到 enclave 和 shielding system
- 为什么论文能从 FreeType、Hunspell、libjpeg 这类普通库里拿到丰富信息，而不是只攻击密码学代码

## 核心要点

Controlled-channel attack 可以拆成三件事：

1. **攻击者是操作系统**。类比：不是隔壁邻居偷听，而是物业管理员控制电梯、门禁和电闸。OS 不能读受保护内存，但它能撤销某些页面映射，让程序访问时触发 page fault。

2. **信号来自“访问了哪个页面”**。类比：看不到书页内容，但看到读者每次翻到哪一页。论文假设硬件只把缺页地址暴露到 4KB 页面粒度，攻击仍然可以用短序列区分函数调用或数据访问。

3. **先离线建字典，再在线匹配轨迹**。类比：先在空教室里听每个学生走路声，记住脚步模式；考试时只听脚步就能认人。攻击者先分析公开程序版本，找到“页面序列 → 秘密事件”的对应关系，再对真实运行做匹配。

这篇论文的关键贡献不是发现“侧信道存在”，而是证明在不可信 OS 模型下，缺页通道可以很确定、很细粒度，而且足够恢复真实应用数据。

## 实践案例

### 案例 1：FreeType 怎么泄露文本字符

FreeType 渲染 TrueType 字体时，不同字符会走不同的 glyph 处理路径。攻击者不用读字符，只要追踪 `TT_Load_Glyph` 每次调用期间访问了哪些代码页、访问了多少次。

```txt
offline:
  render("A") -> code_page_count = {p1: 3, p8: 7}
  render("B") -> code_page_count = {p1: 5, p8: 2}

online:
  observe_one_glyph()
  match_count_to_character()
```

逐部分解释：

- `offline` 是攻击准备阶段，输入每个可能字符，记录页面访问计数
- `online` 是真实攻击阶段，OS 只记录缺页轨迹
- 如果某个计数组合只对应一个字符，就能确定该字符
- 实验里用《绿野仙踪》ASCII 文本测试，FreeType 攻击 10 次都完整恢复原文

### 案例 2：Hunspell 怎么泄露拼写检查的单词

Hunspell 把词典放进哈希表。查某个词时，会访问哈希桶和链表节点；不同单词通常对应不同的数据页序列。攻击者把“查词时的数据页轨迹”当成指纹。

```txt
dictionary_load:
  word -> hash_bucket -> linked_list_pages

spell_check("yellow"):
  observe(data_pages)
  candidates = lookup_trace_dictionary(data_pages)
  choose_with_language_model(candidates)
```

逐部分解释：

- 哈希表访问顺序依赖正在检查的单词
- 多个单词可能撞到同一组页面，所以会有候选集合
- 论文用语言模型在候选中选更像上下文的词
- 结果从 63% 以上直接恢复，加入语言模型后超过 88% 精确恢复，算上词缀缺失可到 96%

### 案例 3：libjpeg 怎么泄露图片轮廓

libjpeg 的 IDCT 解码会对 8×8 块做计算。如果某行或某列的 AC 系数全是 0，代码会走简化路径；否则走复杂路径。这个分支会改变数据页缺页数量，泄露每个图像块的大致结构。

```txt
for block in jpeg_blocks:
  for row_or_col in block:
    if ac_terms_all_zero:
      simple_idct()
    else:
      full_idct()

attacker_counts_data_faults()
attacker_rebuilds_rough_bitmap()
```

逐部分解释：

- JPEG 图像被分成很多 8×8 小块
- 每个小块的系数稀疏程度会影响 IDCT 的访问模式
- 攻击者把缺页计数映射回块级图像特征
- 实验能恢复多张测试图片的重要轮廓，虽然不是像素级原图

## 踩过的坑

1. **以为“OS 读不到内存”就安全**：错在只看内容机密性，没看访问模式；页表、缺页和调度仍然可能泄露行为。

2. **以为 4KB 粒度太粗，不够攻击**：错在忽略了序列信息；单个页面很粗，但两三个页面组成的短序列常常足够唯一定位事件。

3. **以为只要加噪声就能解决**：错在这个通道由 page fault 主动触发，噪声比 cache timing 小很多；盲目加噪还会带来高开销。

4. **以为只影响密码学代码**：错在普通库也有 secret-dependent memory access；字体、拼写检查、图片解码都能泄露用户内容。

## 适用 vs 不适用场景

**适用**：

- 分析 SGX、Haven、InkTag、Gramine 这类“不信任 OS”的机密计算系统
- 判断应用是否存在 secret-dependent control flow 或 data access
- 设计系统级缓解方案，例如禁止 OS 分页关键代码页
- 给初学者解释“侧信道不是偷内容，而是偷痕迹”

**不适用**：

- 普通 Web 漏洞扫描；它不是 SQL 注入或 XSS 这类输入验证问题
- 没有分页控制权的低权限攻击者；论文攻击者假设控制 OS
- 需要远程一次请求就拿秘密的场景；它通常要离线分析和在线 trace
- 证明某个具体实现已经被攻破；论文展示可行性，但每个应用仍要单独分析

## 历史小故事（可跳过）

- **2008 年前后**：Overshadow 等系统提出“让应用不再信任 commodity OS”，希望用 hypervisor 保护应用内存。
- **2013 年**：InkTag 继续这条路线，用 hypervisor 支持不可信 OS 上的安全应用。
- **2014 年**：Haven 把完整 legacy application 放进 SGX + LibOS，机密计算看起来离真实部署更近。
- **2015 年**：Xu、Cui 和 Peinado 证明：这些系统没有考虑 OS 主动制造缺页所形成的确定性侧信道。
- **之后**：SGX 研究开始系统讨论 page-fault side channel、ORAM、constant-time、self-paging 和 TEE threat model 的边界。

## 学到什么

- 安全边界不能只写“OS 不可信”，还要列出不可信 OS 仍然能控制哪些资源。
- 保护内存内容和保护内存访问模式是两件事，后者通常更难。
- 侧信道的危险常来自“业务代码很普通”，因为普通库不会像密码学库那样刻意隐藏访问模式。
- 一个系统功能越想兼容 legacy application，就越容易继承 legacy application 的访问模式泄露。

## 延伸阅读

- 论文页面：[Microsoft Research — Controlled-Channel Attacks](https://www.microsoft.com/en-us/research/publication/controlled-channel-attacks-deterministic-side-channels-for-untrusted-operating-systems/)
- 论文 PDF：[ctrlchannels-oakland-2015.pdf](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ctrlchannels-oakland-2015.pdf)
- [[haven-2014]] —— 被这篇论文实测攻击的 SGX + LibOS shielding system
- [[costan-sgx-explained-2016]] —— 系统解释 SGX 承诺与页表侧信道边界
- [[flush-reload-high-resolution-low-noise-l3-2013]] —— cache 侧信道代表作，可对比“cache miss”与“page fault”两种观察通道

## 关联

- [[haven-2014]] —— 论文在 Haven 上实现攻击，证明 enclave 里的完整应用仍会泄露访问模式
- [[costan-sgx-explained-2016]] —— 解释 SGX 为什么挡住直接读写，却仍暴露页表和缺页信息
- [[sgx-2013]] —— controlled-channel 的硬件背景，SGX 把敌人模型推向“不信任 OS”
- [[atzei-eth-attacks-2017]] —— 同样提醒智能合约或可信环境里，威胁模型没写清就会出错
- [[flush-reload-high-resolution-low-noise-l3-2013]] —— cache 侧信道依赖共享缓存，controlled-channel 依赖 OS 控制分页
- [[address-obfuscation-efficient-approach-combat-board-range-2003]] —— 论文还展示了用前两个代码页识别模块、绕过 ASLR 的思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[costan-sgx-explained-2016]] —— Intel SGX Explained — 把云主机里的一小块程序锁进硬件保险箱

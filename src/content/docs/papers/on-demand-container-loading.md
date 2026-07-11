---
title: On-demand Container Loading — Lambda 把大镜像按需搬上车
来源: 'Brooker et al., "On-demand Container Loading in AWS Lambda", USENIX ATC 2023'
日期: 2026-07-08
分类: 分布式系统
难度: 中级
---

## 是什么

On-demand Container Loading 是 AWS Lambda 为了支持最大 10GiB 容器镜像而做的一套**按需加载、去重、缓存、加密的镜像启动系统**。

日常类比：你搬家时不把整屋家具一次搬到新房，而是先把睡觉、洗漱、做饭马上要用的箱子送到门口；其他箱子等真的要用时再送。Lambda 的问题也是这样：函数冷启动时，程序通常只碰镜像里很小一部分文件，没必要先把整包下载、解压、挂载完。

这篇论文的结论很直接：大镜像不是一定慢，关键是别把“大文件”当成一个必须整体搬运的包。Lambda 把容器镜像先展平成一个块设备，再切成 512KiB 小块；MicroVM 运行时缺哪块取哪块，同时用多级缓存和去重减少重复搬运。

## 为什么重要

不理解这篇，下面这些事会很难解释：

- 为什么 Lambda 能接受 GB 级容器镜像，却仍然追求 50ms 到 1s 级冷启动体验
- 为什么云平台的性能瓶颈常常不是 CPU，而是“启动时要移动多少数据”
- 为什么去重、缓存、加密会互相打架：越想省空间，越容易扩大故障影响面；越想加密，越难看出两块数据相同
- 为什么 Firecracker 这种 microVM 只是隔离底座，真正的冷启动还要解决磁盘镜像怎么来的问题

## 核心要点

1. **先展平，再切块**：容器镜像原本是一层层 tar 包。Lambda 在低频的创建阶段把它们确定性地叠成一个 ext4 块设备，再切成 512KiB 块。类比：先把多层文件夹压成一本按页编号的书，后面查页就容易了。

2. **运行时缺哪块拿哪块**：MicroVM 里仍然通过 virtio-blk 看到一个普通磁盘；读不到的数据由本机 agent 从本机缓存、可用区缓存或 S3 取回。类比：厨房里没有某个调料，先看柜子，再问同楼层仓库，最后去总仓。

3. **相同内容只存一份，但不要过度信任**：确定性展平让相同基础镜像生成相同块，适合去重；convergent encryption 让相同明文生成相同密文，仍能缓存共享；salt 和分代 GC 用来限制“一个热门块坏了影响所有人”的爆炸半径。

## 实践案例

### 案例 1：为什么不能直接下载整个镜像

```js
const imageGiB = 10
const startsPerSecond = 15_000
const bandwidthGiBPerSecond = imageGiB * startsPerSecond
console.log(`${bandwidthGiBPerSecond} GiB/s`) // ≈ 1.46e5 GiB/s ≈ 146 TiB/s
```

**逐部分解释**：

- `imageGiB` 是 Lambda 支持的最大镜像大小，不是每个镜像都这么大，但上限必须能承受
- `startsPerSecond` 是单个客户可能被允许扩出的容器启动速率（论文写到 15,000/s）
- 结果约 `1.5×10⁵ GiB/s`（≈146 TiB/s）；论文原文用 **150Pb/s** 作数量级示意（Pb=petabit）。单位怎么写都指向同一结论：“先搬完整镜像”在架构上不可行

### 案例 2：一次按需读块

```ts
async function readBlock(offset: number) {
  const chunkId = Math.floor(offset / (512 * 1024))
  return localCache.get(chunkId)
    ?? await azCache.get(chunkId)
    ?? await s3Origin.get(chunkId)
}
```

**逐部分解释**：

- `chunkId` 把任意文件读请求映射到固定大小的数据块
- `localCache` 是 worker 本机缓存，命中最快
- `azCache` 是可用区级共享缓存，论文测到命中时中位延迟约 550 微秒
- `s3Origin` 是最终来源，可靠但更慢，论文里从 worker 视角中位约 36 毫秒

### 案例 3：同一块怎么既加密又去重

```ts
function sealChunk(plain: Uint8Array, salt: Uint8Array) {
  const key = sha256(concat(plain, salt))
  const cipher = aesCtrEncrypt(plain, key, zeroIv)
  return { name: sha256(cipher), cipher }
}
```

**逐部分解释**：

- `plain` 相同且 `salt` 相同时，`key` 相同，密文也相同，所以能去重
- `name` 来自密文哈希，不需要中心目录就能判断“这块是否已存在”
- `salt` 可以按时间、区域或根命名空间轮换，牺牲一点去重率，换来更小故障影响面

## 踩过的坑

1. **把容器层级当运行时结构**：层级适合构建和发布，但 Lambda 选择展平为块设备，因为把 overlayfs 放到共享宿主侧会扩大攻击面。

2. **以为去重只省磁盘**：这篇的去重同时省存储、省网络、提高缓存命中率；大多数非平凡上传平均只有 4.3% 新块。

3. **以为加密必然破坏去重**：普通随机加密确实会破坏去重，但 convergent encryption 用内容派生密钥，让相同内容仍能得到相同密文。

4. **只看平均延迟**：缓存命中会产生多个延迟“峰”，本机命中、可用区命中、S3 回源完全不是同一种慢；平均值会掩盖尾部问题。

## 适用 vs 不适用场景

**适用**：

- 大量短生命周期函数，需要在秒级甚至亚秒级扩容
- 容器镜像有共同基础层，重复上传和重复依赖很多
- 多租户环境要求强隔离，不能把复杂文件系统逻辑放到不可信边界外
- 缓存命中率高，且能接受为尾延迟做 erasure coding、冗余请求这类工程复杂度

**不适用**：

- 镜像每次启动都会顺序读完整内容，按需加载就只是在推迟总成本
- 单租户、小规模、低并发平台，直接拉取镜像更便宜
- 需要频繁写入共享镜像内容的场景；这套设计把缓存块当不可变数据来共享
- 没有强运维能力的系统，因为分代 GC、salt 轮换、缓存空仓恢复都需要长期演练

## 历史小故事（可跳过）

- **2015 年**：AWS Lambda 早期只支持较小的 zip 包，启动时下载并解包，模型简单但上限明显。
- **2020 年**：Lambda 支持最大 10GiB 容器镜像，客户能带更完整的依赖闭包，但冷启动不能退化。
- **2023 年**：USENIX ATC 论文公开这套生产系统，重点不是发明一个新算法，而是把块加载、缓存、去重、加密拼成可运营系统。
- **后续方向**：团队开始从 FUSE 迁到 userfaultfd + mmap，减少 guest kernel、Firecracker、host FUSE、agent 之间的调度抖动。

## 学到什么

1. **冷启动的本质是数据移动问题**：函数代码还没跑，平台已经在为“镜像从哪里来”付账。
2. **确定性是去重的前提**：同一份内容必须生成同一块，缓存和内容寻址才有意义。
3. **云系统很少只有一个正确指标**：延迟、成本、安全、故障影响面同时拉扯，任何单点优化都会带来副作用。
4. **工程论文的价值在取舍**：这篇不是说 FUSE、缓存、加密都完美，而是展示在生产规模下怎么逐层补洞。

再换成初学者能记住的一句话：这篇教你把“启动一个程序”拆成三张账单：

- 要搬多少数据
- 哪些数据可以复用
- 哪些慢尾巴会在规模放大后变成事故

## 延伸阅读

- 论文 PDF：[On-demand Container Loading in AWS Lambda](https://www.usenix.org/system/files/atc23-brooker.pdf)（USENIX ATC 2023，生产系统经验很足）
- arXiv 版本：[2305.13162](https://arxiv.org/abs/2305.13162)（方便看元数据和版本）
- [[firecracker-2020]] —— Lambda 的 microVM 隔离底座，本篇的块设备就接在它下面
- [[farsite-2002]] —— convergent encryption 的重要来源，解释“内容派生密钥”为什么能去重
- [[consistent-hashing-1997]] —— 可用区缓存分片的基础思想之一
- [[belady-1966]] —— 缓存替换问题的祖师爷，理解 LRU-k 前先懂缓存预测

## 关联

- [[firecracker-2020]] —— 本篇默认每个函数跑在 microVM 中，镜像块通过 virtio-blk 进入 guest
- [[farsite-2002]] —— convergent encryption 让“加密”和“去重”能在同一系统里共存
- [[consistent-hashing-1997]] —— 可用区缓存需要把块分散到很多节点，同时避免热点
- [[belady-1966]] —— LRU-k 是缓存替换策略的一种现实版本，目标是别让扫描流量冲掉热点
- [[denali-2002]] —— 同样关心大量隔离环境快速启动，只是时代从轻量 VM 走到 serverless
- [[borg]] —— 都是把用户工作负载藏在大规模调度和资源管理系统背后

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

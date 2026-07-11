---
title: Immich — 把家庭照片从别人的云里救回自己机器
来源: 'Alex Tran 等. "immich-app/immich". GitHub 2022 至今, AGPL-3.0'
日期: 2026-05-29
分类: 自托管应用
难度: 中级
---

## 是什么

Immich 是一个**装在你自己机器上的"Google 相册"**。日常类比：你不再把家庭相册寄存到照片冲印店，而是在家里搭一个带 AI 的小书房，照片放进来后**自动整理、自动按人脸分组、自动按"日落""小狗"这种关键词搜得到**。

它由 Flutter 写的手机 app + 浏览器端 + 一个 NestJS 写的服务端 + 一个 Python 写的 ML 推理服务组成，所有照片留在你的硬盘 / NAS / 私有云里，不上传到任何第三方。

## 为什么重要

不理解 Immich 这一类项目，下面这些事都没法讨论：

- 为什么 2022 年起越来越多人**愿意花一个周末搭服务器**，只为把照片从 iCloud / Google Photos 搬出来
- 一个号称"自托管"的应用，**怎么同时活成 Google Photos 的体感 + Apple Photos 的隐私**
- 一个开源项目怎么把 TS、Python、Dart、Svelte 四个生态**塞进一个 docker compose 里和平共处**
- "AI 模型跑在你自己机器上"在 2026 年的家用硬件下到底现实不现实

## 核心要点

Immich 的工程设计可以拆成 **三个判断**：

1. **多 runtime 拆分**：事务和 CRUD 走 NestJS，AI 推理走 Python FastAPI，异步任务走 Redis 队列。类比：开餐厅，前台收银、厨房做菜、洗碗工三班分开干，互相只递纸条。任意一个挂了别的还能跑。

2. **CLIP + pgvector 做语义搜索**：照片进来时，跑 CLIP 模型抽出一个 768 维向量存进 Postgres。用户搜"日落"时把文字也跑成向量，做最近邻查询。类比：图书馆给每本书打一组"气味标签"，找书时按气味相似度排序，不靠目录。

3. **乐观写 + 数据库唯一约束做去重**：上传时不先查"这张图是不是已经有了"，而是直接写，撞到 UNIQUE(checksum) 报错再返回"重复"。类比：寄快递不每次都翻账本，直接塞柜子，柜子满了再处理。

## 实践案例

### 案例 1：手机拍一张照片，到搜索可见，中间发生了什么

```
[手机相册]
   │  WiFi 检测到，后台 upload
   ▼
[NestJS API]  ──写入 Postgres──> Asset 行有了
   │  入队 ExtractMetadata job
   ▼
[BullMQ 队列] → ExtractMetadata（EXIF/GPS）
                → GenerateThumbnails（缩略图）
                → SmartSearch（调 CLIP 拿向量）→ 写 pgvector
                → DetectFaces（人脸框）→ 人脸聚类
```

整条链是**异步**的：用户在 app 上看到的"打勾完成"只代表上传成功，真正的 AI 处理在用户看不见的地方继续跑。这套模式让"上传体感快"和"AI 标注重"不再冲突。

### 案例 2：搜"sunset"为什么能找到日落照

服务端拿到 query 后做三件事：

```typescript
// 简化版
async function searchSmart(query: string) {
  // 1. 走 LRU 缓存（最近 100 条 query → embedding）
  let embedding = cache.get(query);
  if (!embedding) {
    // 2. 调 Python ML 服务，把文字编成 768 维向量
    embedding = await mlClient.encodeText(query);
    cache.set(query, embedding);
  }
  // 3. pgvector 做最近邻：SQL 里用 `<=>` 操作符
  return db.query(`
    SELECT asset_id FROM smart_search
    ORDER BY embedding <=> $1 LIMIT 50
  `, [embedding]);
}
```

CLIP 模型的关键能力是：训练时让"日落的照片"和"sunset"这个词学到**互相靠近**的向量。所以用文字向量去查图片向量也能命中。

### 案例 3：换 CLIP 模型时为什么要把所有照片重跑一遍

旧模型 ViT-B-32 输出 512 维向量，新模型 ViT-L-14 输出 768 维。两种向量**不能比较**——维度都对不上，更别说语义空间不同。

Immich 在管理面板换模型时会拿到一把数据库锁，把 `smart_search` 表的列定义改成 768，然后**所有旧 embedding 失效**，必须点"Re-run Smart Search"重跑全库。50 万张照片可能跑一晚上。这是自托管的运维成本，云服务商把它藏起来了。

## 踩过的坑

1. **sha1 不是密码学安全的去重**：Immich 用 sha1 比 sha256 快两倍，但 sha1 已被攻击者人工碰撞过；如果你做版权审核 / 禁图库这种对抗场景，必须 sha256 或感知哈希，别照抄。

2. **iOS 后台备份窗口很小**：Apple 给后台任务每次只有几分钟。第一次安装积压几千张照片时跑不完，必须前台开着 app；这是 iOS 系统的约束，不是 Immich 的工程债，但用户会吐槽。

3. **server 进程内 LRU 在多副本下没用**：当前的 100 条 query 缓存写在 NestJS 进程里，不共享。家庭场景跑 1-2 副本没事，跑 SaaS 上百副本时命中率几乎为零，得换成 Redis。

4. **HNSW 向量索引常驻内存**：1000 万张 × 768 维 × 4 字节 ≈ 30GB。家庭几万张照片完全 OK；想给一个公司用，pgvector 默认配置不够，得换 Milvus / Qdrant。

5. **ML 服务的冷启动会卡几秒到十几秒**：首次访问某个模型时 ONNX session 要从磁盘加载到显存，期间 `/predict` 请求阻塞。生产部署最好预热常用模型，否则用户首次搜索体验差。

## 适用 vs 不适用

**适用**：

- 极客 / 工程师 + 家用 server / NAS / 旧 PC，想要 Google Photos 的体感但数据完全自己管
- 有 1-3 个家庭成员共享的"全家相册"场景，AI 搜索 + 人脸聚类是甜点
- 已经在跑 Postgres 的人，加 pgvector 比单独装 Milvus / Pinecone 省一个服务

**不适用**：

- 不会 docker / Postgres / Redis 也不想学的纯小白用户 → 老老实实用 iCloud / Google Photos
- 公司要做闭源 SaaS 二次分发 → AGPL-3.0 会传染，法务会拦
- 摄影后期专业用户（要 RAW 处理 / 色彩管理）→ PhotoPrism 更合身
- 千人级共享租户云 → 默认架构（pgvector + 进程内 LRU）撑不住

## 历史小故事（可跳过）

- **2022 年初**：Alex Tran 因为不想交 iCloud 月费、又不放心 Google，在家给自己写了一个照片备份服务，开源到 GitHub
- **2022-2023 年**：Reddit 自托管社区把它推到 r/selfhosted 头条；同时期 PhotoPrism 是主要竞争者，Immich 用更"消费级"的 mobile app 体验差异化
- **2024 年**：合并 face recognition / OCR / memories 等 Google Photos 的招牌功能；star 数从 1 万快速冲到 5 万
- **2025 年**：项目从"个人作品"过渡到"小团队 + 商业化探索"（开源核心 + 托管 cloud 模式）；star 数冲过数万并向十万级迈进
- **2026 年**：主线进入 **v3.x**；模型目录扩到 SigLIP / SigLIP2 与多语 CLIP（MCLIP）等更轻选项，树莓派 / 老 Mac mini 也能跑智能搜索；仓库 star 跨过 **100k**

## 学到什么

1. **多 runtime 不是缺点是优势**：AI 推理用 Python（生态好）、事务用 TypeScript（类型好）、队列用 Redis（成熟）。前提是它们之间用 HTTP / 队列这种**易调试**的协议解耦。

2. **乐观写 + 唯一约束** 是个被低估的去重模式：一次往返、避免 race，比"先 SELECT 再 INSERT"省一个 round trip 还更安全。

3. **数据主权可以做产品**：当云服务商把"AI 越强 = 数据交给我"绑定时，"AI 跑你家里"是一个真实存在的差异化卖点，2022-2026 这四年验证了这个市场。

4. **AGPL 不只是协议是商业策略**：让任何想做闭源克隆的人法律上做不到，把"商业托管 cloud"这条路留给原作者。

## 延伸阅读

- 官方文档：[immich.app](https://immich.app/docs/overview/introduction)（架构图 + 部署指南）
- 视频：[Self-Hosted Show — Immich Deep Dive](https://www.youtube.com/results?search_query=immich+self+hosted)（社区频道，演示完整搭建）
- 对比文章：[Immich vs PhotoPrism](https://www.reddit.com/r/selfhosted/search?q=immich+photoprism)（r/selfhosted 长期讨论帖）
- 仓库主页：[github.com/immich-app/immich](https://github.com/immich-app/immich)（README + Releases）
- [[clip]] —— Immich 智能搜索的底层模型
- [[pgvector]] —— Immich 向量检索用的 Postgres 扩展

## 关联

- [[clip]] —— Immich 用 CLIP 做"文字搜图"的语义对齐
- [[pgvector]] —— Immich 把 768 维向量存进 Postgres + HNSW 索引的具体实现
- [[nestjs]] —— Immich 服务端框架，DI + decorator 让 service / repo / controller 三层清晰
- [[fastapi]] —— Immich ML 服务用 FastAPI 暴露 `/predict`，TS 通过 multipart 调用
- [[redis]] —— Immich 异步任务队列 BullMQ 跑在 Redis 上
- [[svelte]] —— Immich web 前端用 Svelte 5 + SvelteKit
- [[sqlite]] —— mobile 端本地 cache 用 SQLite，server 端用 Postgres，分工对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

---
title: Immich — 把家庭照片从别人的云里救出来 · NestJS + FastAPI + pgvector 三栈混编的 self-hosted 照片基建
description: 大型应用范例——102k stars 的 Google Photos 替代品，TS 后端 + Python ML 服务 + Postgres + Redis + Object Storage 五件套同核运行
sidebar:
  order: 35
  label: immich-app/immich
---

> 状元篇 v1.1 分支 A（大型应用 / multi-runtime / self-hosted product）。
> 基于 commit `aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521` 的源码精读 + 浅克隆 + 一次"读 docker-compose + 上传 5 张照片看完整 job 链"hands-on。
> Immich 的有趣之处不是某个算法或心脏抽象——是**"事务/CRUD 走 NestJS、推理走 FastAPI、协调走 BullMQ + Postgres + Redis 三件套"这种 multi-runtime 在一个 self-hosted 仓库里的工程范式**。
> 笔记的目标不是讲完每个 service，而是讲清楚**"为什么这种栈拆得开却又能在 docker compose up 5 分钟拉起来"**。

## 核心信息

| 字段 | 值 |
|---|---|
| Repo | [immich-app/immich](https://github.com/immich-app/immich) |
| Star / Fork | 102,000+ / 5,400+（2026-05-28 拉取） |
| 最近活跃 | `pushed_at` daily 推送（main 分支为开发主线，release 节奏快） |
| 主分支 commit | `aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521`（2026-05-28，HEAD） |
| 最新 release | `v2.7.5`（2026-04-13） |
| 主语言 | TypeScript 52.5% + Dart 28.4% + Svelte 13.7% + Python ~3% |
| 维护方 | Immich 社区核心（alextran1502 创始人 / jrasm91 / mertalev / etnoy 推主线） |
| License | AGPL-3.0（self-host 友好，二次商业化要小心） |
| 类似项目 | Google Photos（闭源 SaaS）/ Apple Photos / iCloud / PhotoPrism / Synology Moments / Nextcloud Photos / Lychee |
| 哲学不同竞品 | Google Photos（"把照片交给 Google，AI 给你随时找回"） vs Immich（"AI 在你的机器里跑，云在你的 NAS 里"） |
| 技术栈 | NestJS（TS）+ FastAPI（Python）+ Postgres + pgvector + Redis + BullMQ + ONNX Runtime + Flutter（mobile）+ Svelte 5（web） |

## 一句话定位

**Immich 不是"再做一个 Google Photos"——
它是"**家庭照片 + AI 智能搜索 + 人脸识别 + OCR + 自动备份**五件事**怎么用一套自托管栈交付，且 ML 推理跑在你自己机器（甚至自己 GPU）上**"的工程答案。**

它的真正价值不在某个算法（CLIP / face embedding 都是开源模型），而在**"如何让 NestJS 守事务、FastAPI 守推理、BullMQ 守异步任务、pgvector 守向量检索、Flutter 守 mobile，五个生态的 best-of-breed 在一个 docker compose 里和平共处"**。
读 Immich 的目的不是抄一段代码，是**看一个真实在线产品怎么在多 runtime + 多语言下保持工程纪律**。

## Why（为什么是它而不是 Google Photos / Apple Photos / PhotoPrism / Synology Moments / Nextcloud Photos）

Immich 解决的不是"照片管理"问题——是"**照片管理 + AI 不能交给云厂商 + mobile 自动备份不能丢 + 多人共享不能上传到陌生服务器**"四件事**怎么用一个开源仓库统一交付**的问题。

[README 顶部宣传语](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/README.md)（commit hash 锚定）：

> Self-hosted backup solution for photos and videos on mobile device.
> The goal of this project is to provide a backup solution for photos and videos similar to Google Photos but completely self-hosted.

注意"completely self-hosted"——这不是营销废话，是 Immich 全部产品决策的底牌：

1. **"backup solution"**——不是"画廊"或"相册"，是**主动 backup**。这意味着 mobile 端必须做后台 upload，必须做断点续传，必须做去重（不能 backup 同一张照片两次）。
   去重的硬约束直接决定了 server 端要有 `checksum UNIQUE` 数据库约束 + 上传时先 `getUploadAssetIdByChecksum` 查表（见 Layer 3.a）。
2. **"similar to Google Photos"**——Google Photos 的杀手级体验有三件事：自动按人脸分组、按内容关键词搜（"sunset" "dog"）、自动生成"一年前的今天"。
   Immich 把这三件事全实现了，但**全跑在你自己机器上**——face embedding（ONNX 上的 InsightFace 系列）、CLIP（OpenCLIP 系列）、Memories 生成（cron job）都是本地推理。
3. **"completely self-hosted"**——AGPL-3.0 强制 SaaS 二次分发的人也开源自己的修改。
   这句话在企业法务那里会被读成"小心引入"，但对个人 / 家庭 / NAS 用户来说意味着**"你自己跑就完全合法、零月费、零供应商风险，连 Google 都看不到你给孩子拍的照片"**。

但如果只看产品宣传，会错过**架构层的真正价值**——

Immich 的真正特点不是"开源"或"AI 跑本地"，而是**"它必须同时活成 Google Photos 的体感 + Apple Photos 的隐私 + 工程师可改可审"**——
这三件事中的任意一件，单独做都很难；同时做的人极少。
读 Immich 的源码不是去看"它怎么做了一个 Asset 模型"，而是去看**"为什么这套架构能同时承担三件事而不崩"**：

- **Google Photos 的体感** ⇐ 上传到入库 < 200ms（asset-media.service.ts 同步落库 + checksum），缩略图 / embedding / face / OCR 全部走 BullMQ 异步队列在用户看不见的地方补全
- **Apple Photos 的隐私** ⇐ ML 推理服务（machine-learning/）是独立 FastAPI 容器，照片 byte 进去、向量出来，不连任何外部网络，可关停可换 GPU 节点
- **工程师可改可审** ⇐ NestJS 的 DI + decorator 让 service / repository / controller 三层清晰，每加一个 job 类型只要在 `JobName` enum + `@OnJob` 注解 + handler function 三处改

如果你做任何带"用户上传 + AI 推理 + 异步处理 + 自托管"的 web 应用（医疗影像 / 内部文档库 / 视频审核 / 监控录像），
**第一性问题应该是**："事务/CRUD、推理、异步任务、向量检索这四件事能不能拆成四个独立的运行时，靠同一份 Postgres + Redis 协调"——这就是 Immich 的答案。

![Immich 整体架构 — Clients (Flutter/Svelte) → API server (NestJS) → Postgres + pgvector / Redis / Object Storage / ML service (FastAPI)](/projects/immich/01-architecture.webp)

*图 1：Immich v2.7.5 / commit `aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521` 的整体架构。
左侧三类 client（[`mobile/`](https://github.com/immich-app/immich/tree/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/mobile) Flutter 移动端 / [`web/`](https://github.com/immich-app/immich/tree/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/web) Svelte 5 浏览器端 / [`packages/cli`](https://github.com/immich-app/immich/tree/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/packages/cli) + [`packages/sdk`](https://github.com/immich-app/immich/tree/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/packages/sdk) CLI/SDK）走 HTTPS 到中间的 NestJS API server。
中间的 [`server/`](https://github.com/immich-app/immich/tree/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server) 进程**同时承担 web API + BullMQ worker 两个角色**——Microservices worker 是独立 process（同代码不同入口）。
所有异步任务走 BullMQ（Redis-backed）：thumbnail / metadata / smart-search / face-detect / face-recog / OCR / video-encode / cleanup / database-backup。
右侧 Postgres = 事务真相 + pgvector 索引（`smart_search` 表存 CLIP 向量，HNSW index 做 ANN）/ Redis = BullMQ 队列 + pub/sub / Object storage = 本地 fs 或 S3-compat。
底部 [`machine-learning/`](https://github.com/immich-app/immich/tree/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/machine-learning) 是独立 Python 容器（FastAPI + ONNX Runtime），server 通过 HTTP `POST /predict` 把 image bytes 或 text 送过去。
**关键判断**：ML 服务无状态 + 任意时刻可水平扩 + 可单独 GPU 化，事务不进 Python，推理不进 NestJS——这一道闸门避免了"GPU 节点宕机拖垮 web 请求"的灾难。
sketchnote 风。*

## 仓库地形

### 顶层目录注释表

```
immich/                                          ← AGPL-3.0 monorepo（pnpm workspace 协调）
├── server/                                      ← ★★★ NestJS API server（TypeScript）
│   ├── src/
│   │   ├── services/                            ← ★ 业务 service 层（按子系统切文件）
│   │   │   ├── asset-media.service.ts           ← ★ 上传 / 去重 / 缩略图分发（355 行）
│   │   │   ├── job.service.ts                   ← ★ BullMQ 任务编排 + onDone() fan-out（226 行）
│   │   │   ├── smart-info.service.ts            ← ★ CLIP embedding 生成（128 行）
│   │   │   ├── search.service.ts                ← ★ smart search + LRU 缓存（230 行）
│   │   │   ├── person.service.ts                ← face detection / recognition / clustering（707 行）
│   │   │   ├── media.service.ts                 ← thumbnail / video encode 生成
│   │   │   ├── metadata.service.ts              ← exiftool 提取 EXIF / GPS / make / model
│   │   │   ├── library.service.ts               ← external library（filesystem 监控）
│   │   │   ├── memory.service.ts                ← "一年前的今天"等 memory 生成
│   │   │   └── ...                              ← 共 ~50 个 service
│   │   ├── repositories/                        ← ★ 数据访问层（kysely SQL builder）
│   │   │   ├── asset.repository.ts              ← asset 表读写
│   │   │   ├── search.repository.ts             ← pgvector ANN 查询入口
│   │   │   ├── machine-learning.repository.ts   ← 调 Python ML 服务的 HTTP client（~280 行）
│   │   │   ├── job.repository.ts                ← BullMQ queue 抽象
│   │   │   └── ...
│   │   ├── controllers/                         ← REST endpoints（按资源切目录）
│   │   ├── workers/                             ← Microservices worker 入口（独立 process）
│   │   ├── enum.ts                              ← ★ JobName / QueueName 中央 enum
│   │   ├── decorators.ts                        ← @OnJob / @OnEvent 自定义注解
│   │   └── main.ts                              ← API server 入口（NestFactory.create）
│   ├── test/                                    ← 单元 + 集成测试
│   └── package.json                             ← NestJS 10 + kysely + bullmq + pg
├── machine-learning/                            ← ★★ Python ML 服务（独立运行时）
│   ├── immich_ml/
│   │   ├── main.py                              ← ★ FastAPI app + /predict endpoint（262 行）
│   │   ├── config.py                            ← settings + log（pydantic-settings）
│   │   ├── schemas.py                           ← InferenceEntry / ModelTask / ModelType 定义
│   │   ├── models/
│   │   │   ├── base.py                          ← InferenceModel ABC
│   │   │   ├── cache.py                         ← ModelCache（LRU + TTL idle unload）
│   │   │   ├── clip/                            ← OpenCLIP / MobileCLIP 包装
│   │   │   ├── facial_recognition/              ← InsightFace (detection + recognition)
│   │   │   ├── ocr/                             ← PaddleOCR detection + recognition
│   │   │   └── transforms.py                    ← decode_pil / resize / normalize
│   │   └── sessions/
│   │       └── ort.py                           ← ONNX Runtime session 包装（CUDA/CoreML/OpenVINO）
│   ├── ann/                                     ← ARM NN 加速器（树莓派 / Jetson）
│   ├── locustfile.py                            ← 性能压测
│   └── pyproject.toml                           ← FastAPI + onnxruntime + pillow + transformers
├── web/                                         ← ★ Svelte 5 浏览器前端
│   ├── src/lib/                                 ← UI 组件 + store
│   ├── src/routes/                              ← SvelteKit 路由
│   └── vite.config.ts                           ← Vite 5 构建
├── mobile/                                      ← ★ Flutter 移动端（auto-backup 主战场）
│   ├── lib/
│   │   ├── services/backup.service.dart         ← ★ 后台 upload 队列 + 断点续传
│   │   ├── pages/                               ← 页面（timeline / search / albums）
│   │   └── providers/                           ← Riverpod state
│   ├── android/
│   ├── ios/
│   └── pubspec.yaml
├── packages/                                    ← 共享 library
│   ├── cli/                                     ← `immich-cli` upload 工具
│   ├── sdk/                                     ← OpenAPI 生成的 TS client
│   └── plugin-sdk/                              ← 第三方插件接口
├── e2e/                                         ← end-to-end 测试（Playwright）
├── docker/                                      ← 镜像 Dockerfile
│   └── docker-compose.yml                       ← ★ 一键拉起完整栈（API + ML + Postgres + Redis）
├── deployment/                                  ← Helm chart / k8s manifest
├── docs/                                        ← Docusaurus 文档站
├── i18n/                                        ← 30+ 语言翻译
├── open-api/                                    ← OpenAPI spec（驱动 SDK 生成）
└── design/                                      ← Figma export
```

### 心脏文件清单（≥ 3 个，按 subsystem 分布）

大型应用的"心脏"分布在 multiple subsystem，**不能像工具库那样只指 1 个文件**。Immich 至少 5 个：

| Subsystem | 心脏文件 | 行数 | commit hash 锚定 |
|---|---|---|---|
| **上传 / 去重** | `server/src/services/asset-media.service.ts` | 355 | [`aecf8ec8`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/asset-media.service.ts) |
| **任务编排** | `server/src/services/job.service.ts` | 226 | [`aecf8ec8`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/job.service.ts) |
| **CLIP embedding 生成** | `server/src/services/smart-info.service.ts` | 128 | [`aecf8ec8`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/smart-info.service.ts) |
| **smart search 入口** | `server/src/services/search.service.ts` | 230 | [`aecf8ec8`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/search.service.ts) |
| **ML 推理服务** | `machine-learning/immich_ml/main.py` | 262 | [`aecf8ec8`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/machine-learning/immich_ml/main.py) |
| **ML HTTP client** | `server/src/repositories/machine-learning.repository.ts` | ~280 | [`aecf8ec8`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/repositories/machine-learning.repository.ts) |

按 subsystem 分组的 commit 热点（不是一个总榜——大型应用分布式开发的特点）：

- **server/**：`asset.service.ts` / `job.service.ts` / `metadata.service.ts` / `person.service.ts` 改动最频繁（face / search / metadata 是最常做体验优化的方向）
- **machine-learning/**：`main.py` / `config.py` / `models/clip/` 改动主要跟随新模型上线（OpenCLIP / MobileCLIP / SigLIP 等）
- **mobile/**：`backup.service.dart` / `timeline_page.dart` / iOS background fetch 适配
- **web/**：路由和组件，迭代速度最快但单 commit 体积小

## 核心机制（≥ 3 段独立 subsystem 精读）

### (a) Asset upload pipeline + sha1 dedup —— `asset-media.service.ts`

**为什么这段重要**：上传是 Immich 的"入口闸门"——所有照片都在这里**第一次进入系统**，去重也在这里完成。如果这一步漏一张照片或者重复入库，整个 timeline / search / face album 都会跟着出错。

[`server/src/services/asset-media.service.ts:127-223`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/asset-media.service.ts#L127-L223) 的 `uploadAsset` 方法：

```typescript
async uploadAsset(
  auth: AuthDto,
  dto: AssetMediaCreateDto,
  file: UploadFile,
  sidecarFile?: UploadFile,
): Promise<AssetMediaResponseDto> {
  try {
    await this.requireAccess({
      auth,
      permission: Permission.AssetUpload,
      ids: [auth.user.id],
    });

    this.requireQuota(auth, file.size);

    if (dto.livePhotoVideoId) {
      await onBeforeLink(
        { asset: this.assetRepository, event: this.eventRepository },
        { userId: auth.user.id, livePhotoVideoId: dto.livePhotoVideoId },
      );
    }

    const asset = await this.assetRepository.create({
      ownerId: auth.user.id,
      libraryId: null,
      checksum: file.checksum,                              // ← sha1 已在 multer middleware 里算好
      checksumAlgorithm: ChecksumAlgorithm.sha1File,
      originalPath: file.originalPath,
      fileCreatedAt: dto.fileCreatedAt,
      fileModifiedAt: dto.fileModifiedAt,
      localDateTime: dto.fileCreatedAt,
      type: mimeTypes.assetType(file.originalPath),
      isFavorite: dto.isFavorite,
      duration: dto.duration || null,
      visibility: dto.visibility ?? AssetVisibility.Timeline,
      livePhotoVideoId: dto.livePhotoVideoId,
      originalFileName: dto.filename || file.originalName,
    });

    // ...metadata + sidecar 落库...

    await this.jobRepository.queue({ name: JobName.AssetExtractMetadata, data: { id: asset.id, source: 'upload' } });

    if (auth.sharedLink) {
      await this.addToSharedLink(auth.sharedLink, asset.id);
    }

    await this.eventRepository.emit('AssetCreate', { asset, file });

    return { id: asset.id, status: AssetMediaStatus.CREATED };
  } catch (error: any) {
    await this.jobRepository.queue({
      name: JobName.FileDelete,
      data: { files: [file.originalPath, sidecarFile?.originalPath] },
    });

    if (isAssetChecksumConstraint(error)) {
      const duplicateId = await this.assetRepository.getUploadAssetIdByChecksum(auth.user.id, file.checksum);
      if (!duplicateId) {
        this.logger.error(`Error locating duplicate for checksum constraint`);
        throw new InternalServerErrorException();
      }
      // ...
      this.logger.debug(`Duplicate asset upload rejected: existing asset ${duplicateId}`);
      return { status: AssetMediaStatus.DUPLICATE, id: duplicateId };
    }

    this.logger.error(`Error uploading file ${error}`, error?.stack);
    throw error;
  }
}
```

旁注（≥ 5）：

- **去重的真相是数据库 UNIQUE 约束 + try/catch**——不是先查再写。Immich 直接 `assetRepository.create()`，如果 `(ownerId, checksum)` 撞已有记录，Postgres 抛 unique violation，`isAssetChecksumConstraint(error)` catch 住后再去查 duplicateId 返回。这是 **"乐观写 + 失败转查"模式**，比 "先 SELECT 再 INSERT" 少一次往返、避免了 TOCTOU race（两个并发上传同一张照片不会都进 INSERT）。
- **`checksum` 是 sha1 不是 sha256**——见 `ChecksumAlgorithm.sha1File`。sha1 抗碰撞性已被破坏（SHAttered 攻击 2017），但**"用户上传自己照片"的威胁模型不需要密码学级抗碰撞**——sha1 比 sha256 快 ~2x，对家庭照片场景够用。这是有意识的 trade-off，不是疏漏。
- **配额检查 `requireQuota(auth, file.size)` 在写库之前**——但配额累计（`quotaUsageInBytes`）的更新是异步的（在 `AssetCreate` event 后），意味着**用户可能在配额满时还能上传几张**（race window 几百 ms），这是有意为之以避免事务长锁。
- **批量预检 `bulkUploadCheck`（[同文件 L314-L342](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/asset-media.service.ts#L314-L342)）允许 mobile 先发一批 checksum，server 一次性返回 `ACCEPT/REJECT`**——mobile 据此跳过已上传的本地文件，**节省移动数据**。这是 mobile-first 设计的关键 ergonomics。
- **错误路径主动清理**——`catch` 分支里第一件事是 `queue({ name: JobName.FileDelete, ... })`，把 multer 已写入磁盘的临时文件删掉。**没有这一步，失败上传会无限堆积磁盘**。
- **AssetExtractMetadata job 在事务提交后 enqueue**——只有数据库 commit 成功后才入队。如果反过来（先入队再写库），worker 可能在事务还没提交时就来读 asset，撞 NotFound。**enqueue 的相对位置就是异步系统的正确性边界**。

**怀疑 1**：sha1 + ownerId 的 UNIQUE 是 `(ownerId, checksum)` 复合索引还是只 `checksum`？如果是后者，A 用户和 B 用户上传同一张公开图（比如同一张 meme），第二个会被错误判为 duplicate。
应该追到 `server/src/schema/migrations/` 里建表 SQL（仓库改 schema 走 typed migration，不是 raw SQL hand-write）确认实际定义——直觉是 `(ownerId, checksum) UNIQUE`，否则 SaaS 多租户会立即崩。

### (b) Job queue + onDone() fan-out —— `job.service.ts`

**为什么这段重要**：Immich 的"用户体感到位"靠的不是上传同步——而是 **job 链**。一张照片上传后要：抽 EXIF → 生成缩略图 → 跑 CLIP 拿 embedding → 跑人脸检测 → 跑人脸识别 → 跑 OCR → 视频还要转码。这 6-7 步如果一次性同步跑要 10-30 秒，用户上传体验崩盘。Immich 的解法是 **job 链 + 事件驱动 fan-out**，每一步完成后触发下一步。

[`server/src/services/job.service.ts:65-225`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/job.service.ts#L65-L225) 的 `onDone` fan-out：

```typescript
@OnEvent({ name: 'JobRun' })
async onJobRun(...[queueName, job]: ArgsOf<'JobRun'>) {
  try {
    await this.eventRepository.emit('JobStart', queueName, job);
    const response = await this.jobRepository.run(job);
    await this.eventRepository.emit('JobSuccess', { job, response });
    if (response && typeof response === 'string' && [JobStatus.Success, JobStatus.Skipped].includes(response)) {
      await this.onDone(job);
    }
  } catch (error: Error | any) {
    await this.eventRepository.emit('JobError', { job, error });
  } finally {
    await this.eventRepository.emit('JobComplete', queueName, job);
  }
}

/** Queue follow up jobs */
private async onDone(item: JobItem) {
  switch (item.name) {
    case JobName.SidecarCheck: {
      await this.jobRepository.queue({ name: JobName.AssetExtractMetadata, data: item.data });
      break;
    }
    case JobName.SidecarWrite: {
      await this.jobRepository.queue({
        name: JobName.AssetExtractMetadata,
        data: { id: item.data.id, source: 'sidecar-write' },
      });
      break;
    }
    case JobName.StorageTemplateMigrationSingle: {
      if (item.data.source === 'upload' || item.data.source === 'copy') {
        await this.jobRepository.queue({ name: JobName.AssetGenerateThumbnails, data: item.data });
      }
      break;
    }
    case JobName.AssetGenerateThumbnails: {
      // ...获取 asset...
      const jobs: JobItem[] = [
        { name: JobName.SmartSearch, data: item.data },         // ← CLIP embedding
        { name: JobName.AssetDetectFaces, data: item.data },    // ← 人脸检测
        { name: JobName.Ocr, data: item.data },                 // ← OCR
      ];
      if (asset.type === AssetType.Video) {
        jobs.push({ name: JobName.AssetEncodeVideo, data: item.data });
      }
      await this.jobRepository.queueAll(jobs);
      // ...通过 websocket 推到前端：on_upload_success 事件...
      break;
    }
    case JobName.SmartSearch: {
      if (item.data.source === 'upload') {
        await this.jobRepository.queue({ name: JobName.AssetDetectDuplicates, data: item.data });
      }
      break;
    }
  }
}
```

旁注（≥ 5）：

- **整个文件没有一行业务逻辑——它只做 routing**。每个 case 的 body 都是"上一步成功 → 下一步入队"。这是经典的 **state machine in switch 模式**——把 job DAG 用最朴素的 switch 表达，新人 5 分钟能读完整张图，比 BPMN / temporal SDK 那种 framework 重的方案上手快得多。
- **`AssetGenerateThumbnails` 完成后 fan-out 三个 ML job**——`SmartSearch / DetectFaces / Ocr` 是**并行入队的**（`queueAll` 一次性 push 三个），意味着 CLIP / 人脸 / OCR 同时跑，如果 ML 服务有多副本就能水平扩。这一刀**避免了串行 ML 等待**，让一张照片从上传到全部信息齐备的总时间约等于"最慢的那个 job"，而不是三者之和。
- **`source === 'upload'` 才触发 DetectDuplicates**——批量 reindex（用户在管理面板按"全部重新跑 CLIP"）不会触发"近似重复检测"。这是**意图区分**：upload 时关心是否和老照片重复，reindex 时只想刷新 embedding。
- **websocket 通知 `on_upload_success` 在 thumbnail job 后发，不在 upload 同步链里发**——意味着用户在 mobile 上的"打勾完成"图标**等到缩略图生成才出现**，不是 HTTP 200 时就出现。这是设计选择：UI 一致性优先（看到 ✓ 就有缩略图可看）vs 延迟优先（看到 ✓ 就够了）。Immich 选了一致性。
- **`@OnEvent({ name: 'JobRun' })` 是自家 decorator，不是 NestJS 原生**——见 [`server/src/decorators.ts`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/decorators.ts)。这套 decorator 把 BullMQ 的 worker / event 机制包装成"看起来像 NestJS service method"的样子，**降低了 BullMQ 的心智负担**。代价是新人不知道 magic 在哪，得先读 decorators.ts。

**怀疑 2**：`onDone` 是顺序触发（一个 job 完了才入队下一个）还是有 fan-out 并行？看代码是顺序，但 `queueAll` 内部对 BullMQ 是 batched insert——如果 Redis 抖一下，**会不会有部分 job 入队成功部分失败的"半态"**？这种半态没有补偿事务（没有 outbox pattern），意味着照片可能"有 thumbnail 但永远没 embedding"。
要看 `job.repository.ts` 的 `queueAll` 实现是不是 BullMQ pipeline + atomic，以及有没有定期 reconcile job（"找所有有 thumb 没 embedding 的 asset 重跑 SmartSearch"）。这是 **多 runtime 系统最易藏 bug 的地方**。

### (c) Smart search via CLIP embedding —— `smart-info.service.ts` + `search.service.ts` + `main.py`

**为什么这段重要**：智能搜索（"sunset" "dog playing in park"）是 Immich 区别于 Synology / Nextcloud 的杀手锏。它跨越**两个语言、三个进程**（NestJS web + NestJS worker + Python ML），是这个仓库里最能体现 multi-runtime 协同的功能。

入口（用户输入文本搜索）—— [`server/src/services/search.service.ts:121-162`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/search.service.ts#L121-L162)：

```typescript
async searchSmart(auth: AuthDto, dto: SmartSearchDto): Promise<SearchResponseDto> {
  if (dto.visibility === AssetVisibility.Locked) {
    requireElevatedPermission(auth);
  }

  const { machineLearning } = await this.getConfig({ withCache: false });
  if (!isSmartSearchEnabled(machineLearning)) {
    throw new BadRequestException('Smart search is not enabled');
  }

  const userIds = this.getUserIdsToSearch(auth, dto.visibility);
  let embedding;
  if (dto.query) {
    const key = machineLearning.clip.modelName + dto.query + dto.language;
    embedding = this.embeddingCache.get(key);                  // ← LRU(100) 缓存最近查询
    if (!embedding) {
      embedding = await this.machineLearningRepository.encodeText(dto.query, {
        modelName: machineLearning.clip.modelName,
        language: dto.language,
      });
      this.embeddingCache.set(key, embedding);
    }
  } else if (dto.queryAssetId) {
    // 反向：以图搜图
    await this.requireAccess({ auth, permission: Permission.AssetRead, ids: [dto.queryAssetId] });
    const getEmbeddingResponse = await this.searchRepository.getEmbedding(dto.queryAssetId);
    const assetEmbedding = getEmbeddingResponse?.embedding;
    if (!assetEmbedding) {
      throw new BadRequestException(`Asset ${dto.queryAssetId} has no embedding`);
    }
    embedding = assetEmbedding;
  }

  const { hasNextPage, items } = await this.searchRepository.searchSmart(
    { page, size },
    { ...dto, userIds: await userIds, embedding },             // ← pgvector ANN 查询
  );

  return this.mapResponse(items, hasNextPage ? (page + 1).toString() : null, { auth });
}
```

写入侧（上传时生成 embedding）—— [`server/src/services/smart-info.service.ts:95-127`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/smart-info.service.ts#L95-L127)：

```typescript
@OnJob({ name: JobName.SmartSearch, queue: QueueName.SmartSearch })
async handleEncodeClip({ id }: JobOf<JobName.SmartSearch>): Promise<JobStatus> {
  const { machineLearning } = await this.getConfig({ withCache: true });
  if (!isSmartSearchEnabled(machineLearning)) {
    return JobStatus.Skipped;
  }

  const asset = await this.assetJobRepository.getForClipEncoding(id);
  if (!asset || asset.files.length !== 1) {
    return JobStatus.Failed;
  }
  if (asset.visibility === AssetVisibility.Hidden) {
    return JobStatus.Skipped;
  }

  const embedding = await this.machineLearningRepository.encodeImage(asset.files[0].path, machineLearning.clip);

  if (this.databaseRepository.isBusy(DatabaseLock.CLIPDimSize)) {
    this.logger.verbose(`Waiting for CLIP dimension size to be updated`);
    await this.databaseRepository.wait(DatabaseLock.CLIPDimSize);
  }

  const newConfig = await this.getConfig({ withCache: true });
  if (machineLearning.clip.modelName !== newConfig.machineLearning.clip.modelName) {
    return JobStatus.Skipped;
  }

  await this.searchRepository.upsert(asset.id, embedding);
  return JobStatus.Success;
}
```

ML 服务侧 —— [`machine-learning/immich_ml/main.py:165-211`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/machine-learning/immich_ml/main.py#L165-L211)：

```python
@app.post("/predict", dependencies=[Depends(update_state)])
async def predict(
    entries: InferenceEntries = Depends(get_entries),
    image: bytes | None = File(default=None),
    text: str | None = Form(default=None),
) -> Any:
    if image is not None:
        decoded = await run(lambda: decode_pil(image))
        if decoded.width == 0 or decoded.height == 0:
            raise HTTPException(400, "Image has zero width or height")
        inputs: Image | str = decoded
    elif text is not None:
        inputs = text
    else:
        raise HTTPException(400, "Either image or text must be provided")
    response = await run_inference(inputs, entries)
    return ORJSONResponse(response)


async def run_inference(payload: Image | str, entries: InferenceEntries) -> InferenceResponse:
    outputs: dict[ModelIdentity, Any] = {}
    response: InferenceResponse = {}

    async def _run_inference(entry: InferenceEntry) -> None:
        model = await model_cache.get(
            entry["name"], entry["type"], entry["task"], ttl=settings.model_ttl, **entry["options"]
        )
        inputs = [payload]
        for dep in model.depends:                              # ← 依赖图：face recog 依赖 face detect
            try:
                inputs.append(outputs[dep])
            except KeyError:
                message = f"Task {entry['task']} of type {entry['type']} depends on output of {dep}"
                raise HTTPException(400, message)
        model = await load(model)                              # ← 懒加载（已加载则直接返回）
        output = await run(model.predict, *inputs, **entry["options"])
        outputs[model.identity] = output
        response[entry["task"]] = output

    without_deps, with_deps = entries
    await asyncio.gather(*[_run_inference(entry) for entry in without_deps])
    if with_deps:
        await asyncio.gather(*[_run_inference(entry) for entry in with_deps])
    if isinstance(payload, Image):
        response["imageHeight"], response["imageWidth"] = payload.height, payload.width

    return response
```

旁注（≥ 5）：

- **server 端 LRU(100) 缓存最近的文本→embedding**——`embeddingCache` 在 service 实例上，不是 Redis（[search.service.ts:29](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/search.service.ts#L29)）。这意味着多 web 副本各有自己的 100 项 cache，不共享。**对低频查询无所谓，对"全家最近都在搜 'dog'"这种 hot key 可以省 100ms RTT**。100 这个数字小到不会撑爆内存大到能扛住单用户连续翻页。
- **CLIP 维度变化要 lock**——`DatabaseLock.CLIPDimSize` 是个 advisory lock。当用户在管理面板换模型（比如从 ViT-B-32 768 维换到 ViT-L-14 512 维），所有 in-flight 的 `handleEncodeClip` 必须等到迁移完成。如果不 lock，可能写入旧模型 embedding 到新模型表里，导致 ANN 查询返回乱序结果。**这个 lock 是 multi-runtime 的"模型版本一致性闸门"**。
- **ML 服务的 `model_cache` 是进程内的，不共享**——每个 Python worker 单独 load 模型。idle 时通过 `idle_shutdown_task` SIGINT 自杀（[main.py:250-261](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/machine-learning/immich_ml/main.py#L250-L261)）让 docker restart 重新拉起释放显存。**这是 GPU 显存有限场景的必备策略**——树莓派 / 老 GPU 跑不了多模型常驻。
- **`run_inference` 用 `asyncio.gather` 并行无依赖任务**——一张照片同时跑 face detect + OCR detect，节省单图总时间。有依赖的（face detect → face recog）才串行。这是**任务粒度的 DAG 调度**，比"按 model 串行"快 1.5-2x。
- **embedding 走 HTTP `multipart/form-data`，不是 gRPC / protobuf**——这是有意识选择：HTTP 调试方便（curl 就能打），任何 reverse proxy 都能透传，多租户部署时给 ML 服务套 oauth gateway 也容易。**代价**是 multipart parse 比二进制慢一点，但相比 ONNX 推理本身的几十毫秒可忽略。

**怀疑 3**：`embeddingCache` 是用 `LRUMap`（[mnemonist](https://github.com/Yomguithereal/mnemonist)）实现的，**没有过期时间**——key 是 `modelName + query + language`。如果用户切换模型后，旧模型的 query embedding 还在 cache 里，会不会被误用？
看 key 设计应该是不会（modelName 包含在 key 里），但 cache 不会主动清理，等于占着内存（每个 embedding ~3KB × 100 = 300KB / process，也不多）。**真正的问题**是：如果 server 灰度部署 + 新版本默认换了 CLIP language（如从 `eng` 默认变 `auto`），cache 命中率会突降但不报错——监控应该看 cache hit rate，但仓库里没看到这个 metric。

## Hands-on（含改一处实验）

### 30 分钟跑通命令清单

```bash
# 1. 浅克隆
git clone --depth 1 https://github.com/immich-app/immich.git
cd immich
git rev-parse HEAD                    # → aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521

# 2. 起完整 stack（推荐用 docker；Immich 不建议 host 模式跑 ML 服务）
cd docker
cp .env.example .env
# 编辑 .env：
#   UPLOAD_LOCATION=/path/to/your/test/photos
#   DB_PASSWORD=change-me-pls
#   IMMICH_VERSION=release            # 或 main
docker compose up -d

# 3. 等待 health check（约 30-60 秒）
docker compose ps                     # 全部 (healthy)
curl http://localhost:2283/api/server/ping   # → {"res":"pong"}

# 4. 浏览器 http://localhost:2283 注册第一个用户（自动成 admin）

# 5. mobile 端：装 Immich app（iOS/Android），扫 QR 配置 server URL
# 或 web 端拖 5 张测试照片上传

# 6. 看 job 链
docker compose logs -f immich-server | grep -E "Job|Smart|Face"
# 会看到：
#   AssetExtractMetadata → AssetGenerateThumbnails → SmartSearch + AssetDetectFaces + Ocr
#   FacialRecognitionRunCluster（人脸聚类，定期跑）

# 7. 测试 smart search
# Web UI 顶部搜索栏输入 "sunset"，看是否返回相关照片
# 或 curl：
curl -X POST http://localhost:2283/api/search/smart \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"query":"sunset","language":"en"}'
```

### 一处改一行实验：把 `embeddingCache` 容量从 100 调到 5，观察 cache miss 行为

[`server/src/services/search.service.ts:29`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/search.service.ts#L29)：

```typescript
private embeddingCache = new LRUMap<string, string>(100);   // 改成 5
```

实验步骤：
1. 改完后 `docker compose build immich-server` 重新构建。
2. 在 Web UI 连续搜 6 个不同关键词（"sunset" "dog" "car" "beach" "tree" "snow"），第 7 个搜 "sunset"。
3. 看 ML 服务日志：`docker compose logs immich-machine-learning | grep encode_text`。
4. **预期**：原始 100 容量下，第 7 个 "sunset" 命中 cache，ML 服务无新日志。改成 5 后，第 7 个 "sunset" 已被驱逐，会重新调 ML 服务，多一条 `encode_text` 日志。

**实验意义**：直观体感"server 端的小 cache 在 mobile 用户连续翻页时帮多大忙"。如果你做的是企业内部图库，搜索 query 集合很集中（"合同""发票""logo"），把容量从 100 调到 1000 + 加 Redis 替代进程内 LRU 是优化方向。

### 第二个实验：临时替换 CLIP 模型看维度切换流程

在管理面板 `/admin/settings/machine-learning` 把 `CLIP model name` 从 `ViT-B-32__openai`（512 维）换成 `ViT-L-14__openai`（768 维）。
观察日志会看到：

```
Dimension size of model ViT-L-14__openai is 768, but database expects 512.
Updating database CLIP dimension size to 768.
Successfully updated database CLIP dimension size from 512 to 768.
```

[`smart-info.service.ts:51-58`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/smart-info.service.ts#L51-L58) 这段。
此时**所有现有 embedding 失效**——你需要在管理面板点 "Re-Run All Smart Search Jobs" 才能让旧照片重新生成 768 维 embedding。
**实验意义**：感受"模型升级 = 重跑全库"的代价。一个 50 万照片的实例，换模型可能花一个晚上。这是 self-host 的运维成本，云厂商藏起来了。

## 横向对比（≥ 5 维）

| 维度 | Immich（本笔记主角） | Google Photos | Apple Photos / iCloud | PhotoPrism | Synology Moments | Nextcloud Photos |
|---|---|---|---|---|---|---|
| **价格（10k 照片）** | $0（self-host，需要电费 + 硬盘） | 2GB 免费 / $1.99/月 100GB | 5GB 免费 / $0.99/月 50GB | $0（self-host） | 绑 NAS 硬件费 ~$300 起 | $0（绑 Nextcloud 已有部署） |
| **数据所有权** | 你的硬盘 / NAS / 云盘 | Google 服务器 | Apple 服务器 | 你的硬盘 | 你的 Synology 盒子 | 你的 Nextcloud server |
| **AI 能力** | CLIP smart search + face + OCR + memories | 业界天花板（搜任何东西） | face + things 较弱 | TensorFlow + 自家 face | 仅 face（Synology 自家）| 仅 face（社区插件）|
| **Mobile auto-backup** | ★★★★ Flutter 双端原生（iOS/Android）| ★★★★★ 系统级（Android 默认）| ★★★★★ iCloud 系统级（iOS 默认）| ★★ 第三方 sync 工具凑 | ★★★ Synology Photos app 较老 | ★★ Nextcloud client 凑 |
| **多人共享** | 共享 album + 共享链接 + partner | 共享 album + Google Plus 之耻 | iCloud 家庭共享 | 共享链接 | NAS 用户隔离 | Nextcloud 群组 |
| **协议 / 开放性** | AGPL-3.0 + OpenAPI / SDK / CLI | 闭源 | 闭源 | AGPL-3.0 + REST API | 闭源 | AGPL-3.0 |
| **ML 模型可换** | ✓ 任意 ONNX CLIP / 任意 InsightFace 模型 | ✗ | ✗ | 部分（TF 模型） | ✗ | ✗ |
| **video 转码** | ffmpeg + nvenc / qsv / vaapi 硬件加速 | 服务端做 | 服务端做 | 第三方 ffmpeg | 硬件 NAS 转码 | 第三方 |
| **mobile 端复杂度** | Flutter 单 codebase 双端 | 各家 native | 各家 native | 没有 mobile | 各家 native | mobile web | 
| **学习曲线（新人）** | 中（要懂 docker compose + Postgres + Redis） | 零（注册即用） | 零（绑 Apple ID） | 中（类似但 ML 设置更杂）| 低（绑 NAS 自带 UI）| 中（已熟悉 Nextcloud 才低）|
| **隐私保证** | 默认全部本地，可断网跑 | 全部上 Google | 端到端可选（Advanced Data Protection）| 默认全本地 | 局域网默认 | 看 Nextcloud 部署 |

### 选型建议（场景 → 选谁）

- **不在乎隐私、要最强 AI、不想配置** → Google Photos
- **iOS 用户 + 已交税给 Apple 全家桶** → Apple Photos / iCloud
- **极客 + 有家用 server / NAS + 想要 Google Photos 体感 + 数据完全自己掌控** → Immich（这是 Immich 的甜点场景）
- **已有 Synology / 黑群晖** → Synology Moments（开箱即用）但 AI 弱
- **已经在跑 Nextcloud + 不想加新栈** → Nextcloud Photos（功能弱但零额外运维）
- **极客 + 喜欢自己调 TensorFlow 模型 + 不需要好看 UI** → PhotoPrism

### 哲学对比

Google Photos 的哲学是 **"AI 越强越好，把照片交给我们，我们搞定一切"**——它在 AI 上没有上限，但代价是你的家庭照片全部在 Google 数据中心、被用作模型训练样本。
Immich 的哲学是 **"AI 在你的机器上跑，照片一辈子在你的硬盘"**——它接受 AI 不如 Google 强的现实（CLIP 不如 Google 自家专有模型），但拒绝把数据交给云厂商。**两者不是同一类产品的同一流派**——Google 是"做加法"（更多 AI），Immich 是"做底线"（数据主权）。

Apple Photos 的哲学是 **"在 Apple 设备上一切顺滑，离开 Apple 就丢一半功能"**——iCloud 加密、设备端推理、生态封闭。
Immich 选择**"我跨平台、你的数据在你这里、模型可换、API 完全开放"**——这是开源软件的典型反苹果选择。

PhotoPrism 是 Immich 最直接的竞品——同 AGPL、同 self-host、同 ML。区别在于：PhotoPrism 偏向"高端摄影爱好者"（RAW 处理、色彩管理），Immich 偏向"全家庭照片备份"（mobile-first、自动备份、人脸识别）。
**两个项目互相 follow，技术决策互相影响**——选哪个看你的核心场景是"摄影后期"（PhotoPrism）还是"全家备份"（Immich）。

## 与你当前工作的连接

### 今天就能用的部分（≥ 4 子弹）

- **"乐观写 + UNIQUE constraint catch" 的去重模式**——任何"用户上传的内容要去重"的场景（视频审核、文档库、上传图床、用户头像），抄 [`asset-media.service.ts:150-218`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/asset-media.service.ts#L150-L218) 的 `try { create() } catch(constraint) { return duplicate }` 模式。比"先 SELECT 再 INSERT" 少一次往返、避免 race。
- **"job 链 + onDone fan-out" 的状态机模式**——任何"用户提交 → 多步异步处理"的工作流（订单、审核、ETL pipeline），抄 [`job.service.ts:65-225`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/job.service.ts#L65-L225) 的 `switch(item.name)` 路由模式。比 BPMN / temporal SDK 学习曲线低 10x。
- **进程内 LRU 缓存"最近 N 个查询的 ML embedding"**——任何要调 ML 服务的搜索场景，抄 [`search.service.ts:29-141`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/search.service.ts#L29-L141) 的 `LRUMap<string, string>(100)` 模式。3KB × 100 = 300KB 内存换最高 100ms RTT 节省。
- **"事务/CRUD 进 NestJS、推理进 FastAPI、HTTP multipart 桥接" 的多 runtime 拆分**——任何"web 后端是 TS/Java、ML 团队用 Python"的项目，把 ML 服务做成无状态 FastAPI + ONNX Runtime + ModelCache（[main.py:41-74](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/machine-learning/immich_ml/main.py#L41-L74)），可单独 GPU 化、可下线、可水平扩。

### 下个月能用的部分（≥ 4 子弹）

- **pgvector + HNSW 替代独立 vector DB**——如果你已经在跑 Postgres，加个 `CREATE EXTENSION pgvector` 就能做语义搜索，比起单独跑 Milvus / Weaviate / Pinecone 省一个 service。Immich 把这一步走通了，迁移路径有迹可循。
- **AGPL 协议下的 self-host 商业模式**——你想做"开源核心 + cloud 托管"的二层商业（Immich 团队是这种模式：开源 + 提供托管 cloud），研究 Immich 的 [LICENSE](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/LICENSE) + 商业服务条款是怎么切的。
- **Flutter 单 codebase 做 mobile auto-backup**——iOS background fetch + Android WorkManager 是两个完全不同的 API，Flutter 抹平这层。如果你团队不养 iOS + Android 两套 native，Flutter + 抄 Immich 的 [`mobile/lib/services/backup.service.dart`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/mobile/lib/services/backup.service.dart) 起步。
- **OpenAPI 驱动的 SDK 生成**——Immich 的 [`open-api/`](https://github.com/immich-app/immich/tree/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/open-api) 目录是单一真相，从 NestJS controller 自动生成 spec，再 codegen TS SDK + Dart SDK。如果你的项目要给前端 + mobile + 第三方插件供 API，抄这个流水线避免手维护多份 client。

### 不要用的部分（≥ 4 子弹）

- **不要把所有 ML 任务都塞进同一个 Python 服务**——Immich 的 `main.py` 一锅炖了 CLIP + face + OCR，因为家庭照片这三件事推理量级接近。**如果你的场景里某个模型 10x 大于其他**（比如一个大 LLM + 一个小 classifier），分两个 service 部署，不要硬凑。
- **不要照搬 sha1 做去重**——Immich 选 sha1 是基于"家庭照片威胁模型"。**如果你做对抗场景**（比如禁图库、版权过滤），sha1 会被对手轻易碰撞绕过——必须 sha256 或感知哈希（pHash）+ 多个独立维度。
- **不要照搬"server 进程内 LRU"做 query cache**——Immich 的多副本部署量级小（家庭/小团队 1-3 副本），cache miss 不致命。**如果你做 SaaS 1000 副本**，进程内 LRU 命中率低到没用，必须 Redis。
- **不要照搬"job DAG 用 switch 表达"**——Immich 的 `onDone` switch 现在 ~10 个 case 还能管，**如果你的工作流变 50+ 节点 + 有人工审核步骤 + 需要可视化 / 重放**，老老实实上 Temporal / Airflow / Prefect。switch 只在小图时简洁。

## 自检问题 + 延伸阅读

### 自检问题（≥ 3 个，追到行号级别）

1. **`assetRepository.create()` 的 UNIQUE 约束究竟是 `(ownerId, checksum)` 还是只 `checksum`？在哪个 migration 文件定义？**
   要追 `server/src/schema/migrations/` 下最早建 `asset` 表的那个文件 + `CREATE UNIQUE INDEX` 语句的具体列。
   如果是只 `checksum`，那么 multi-tenant SaaS 模式下 A 用户和 B 用户都不能上传同一张图（比如同一张公共 meme），**这个判断决定了 Immich 是否能做共享租户云**。

2. **`onDone` 的 `queueAll` 是 BullMQ pipeline atomic 还是 N 次单独 push？**
   要看 [`server/src/repositories/job.repository.ts`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/repositories/job.repository.ts) 里 `queueAll` 的实现行号 + 是否用 `Queue.addBulk`。
   如果不是 atomic，那么 Redis 抖一下会出现"thumb 入队成功但 SmartSearch 失败"的半态——**这种半态没有 outbox / reconcile job 兜底，照片会永远没 embedding**。

3. **`embeddingCache` 在 server 多副本部署下，跨副本不一致会怎么影响用户体感？**
   假设两个 web pod，pod-A 缓存了 "sunset" 的 embedding，用户下一次请求 hash 到 pod-B，pod-B 重新调 ML——**多 100ms**。
   如果 SaaS 部署 50 副本，cache 命中率 < 2%，**等于完全没用**。要看仓库里有没有 Redis 替代 LRUMap 的讨论 issue（grep `embeddingCache redis`）。

4. **`DatabaseLock.CLIPDimSize` 在迁移中途服务挂了会怎样？**
   假设管理员点 "Switch CLIP model"，server 拿到 advisory lock，开始 `setDimensionSize(768)`，写到一半进程被 kill。下次重启时 lock 自动释放（advisory lock 绑 session），但 `smart_search` 表的列定义 vs 配置里的 modelName 已不一致——**如何 reconcile**？要看 `databaseRepository.setDimensionSize` 是不是 `ALTER COLUMN` + 是不是事务内执行。

5. **mobile 端 auto-backup 在 iOS background fetch 受限下怎么保证不丢照片？**
   要追 `mobile/lib/services/backup.service.dart` 里 iOS 的 `BGTaskScheduler` 注册逻辑 + 当用户长期不打开 app 时是否有 prompt 弹窗。
   iOS 给 background fetch 的窗口很小（几分钟），**Immich 怎么处理几千张积压照片的场景**？

### 延伸阅读（按顺序读）

| 顺序 | 文件 / 资源 | 回答什么 |
|---|---|---|
| 1 | [`server/src/services/person.service.ts`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/services/person.service.ts) 完整通读 | 人脸聚类完整链：detection → embedding → DBSCAN clustering → 用户 confirm |
| 2 | [`server/src/repositories/search.repository.ts`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/repositories/search.repository.ts) | pgvector ANN 查询的具体 SQL：`<=>` 操作符 + HNSW index hint |
| 3 | [`machine-learning/immich_ml/models/cache.py`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/machine-learning/immich_ml/models/cache.py) | ModelCache 的 LRU + TTL idle unload 实现 |
| 4 | [`machine-learning/immich_ml/sessions/ort.py`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/machine-learning/immich_ml/sessions/ort.py) | ONNX Runtime session 怎么选 CUDA / CoreML / OpenVINO provider |
| 5 | [`mobile/lib/services/backup.service.dart`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/mobile/lib/services/backup.service.dart) | mobile auto-backup 的断点续传 + iOS/Android 差异 |
| 6 | [`docker/docker-compose.yml`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/docker/docker-compose.yml) | 完整栈的 5 个容器（server / ml / postgres / redis）依赖图 |
| 7 | [`server/src/decorators.ts`](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/server/src/decorators.ts) | `@OnJob` / `@OnEvent` 自家 decorator 怎么 wire 到 BullMQ |
| 8 | [`open-api/`](https://github.com/immich-app/immich/tree/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/open-api) | OpenAPI spec 驱动 SDK 生成的流水线 |

## 限制（≥ 4 条）

1. **AGPL-3.0 的 viral 性质**——任何把 Immich 源码集成进闭源 SaaS 的做法都违法。如果你的公司法务对 GPL-likely 过敏，**Immich 不是你的选项**——选 PhotoPrism 商业版或自研。

2. **ML 服务的 cold start 延迟**——首次访问某个模型时 ONNX session 初始化 + 模型加载 ~3-15 秒，期间 `/predict` 请求会卡住。生产部署需要在 deploy 后预热（命中所有常用模型），否则用户首次搜索体验差。`preload_models` 配置（[main.py:77-118](https://github.com/immich-app/immich/blob/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521/machine-learning/immich_ml/main.py#L77-L118)）就是为这个，但默认空。

3. **mobile 端 iOS background backup 的窗口限制**——iOS 给 BGTask 的运行窗口最短 5 分钟，**几千张积压照片一次跑不完**。Immich 文档里建议用户偶尔打开 app（前台 backup 才畅快），这是 iOS 系统约束、不是 Immich 的工程债，但是终端用户的真实痛点。

4. **pgvector + HNSW 在 1000 万 + embedding 规模下性能**——HNSW 内存常驻，1000 万 × 768 维 × 4 byte ≈ 30GB 内存。家庭场景几万张没问题；如果你想做千人级共享实例，pgvector 要替换成 Milvus / Qdrant，**Immich 默认架构没准备好这个量级**。

5. **`embeddingCache` 进程内 LRU 在多副本下命中率差**——已在"不要用"段说过；这是 Immich 故意做的"够小用"决策，但用 SaaS 部署需要替换成 Redis。

6. **video 处理依赖 ffmpeg + 硬件加速 driver**——如果宿主机没装 nvidia container toolkit / vaapi 驱动，video 转码会 fallback CPU，1080p 视频转码可能要分钟级，老 NAS 直接堆积大量 job。

## 附录：宣传 vs 现实清单（≥ 3 行）

| 宣传 | 现实 |
|---|---|
| "Self-hosted backup solution" | self-host 仍要懂 docker / postgres / redis / s3-compat 存储；运维成本不为零 |
| "Similar to Google Photos" | UI / 自动备份 / smart search 接近，但 AI 模型能力 < Google（Google 自家 multimodal 模型不开源） |
| "Mobile auto-backup" | iOS background backup 受系统限制，长期不开 app 会积压；Android 略好但被各厂商电池策略阻碍 |
| "AI runs locally" | 没错，但"locally" = 你的 server，不是 mobile 设备；mobile 端不直接跑模型（除了少量 thumbhash 等） |
| "AGPL-3.0" | 不是 MIT；二次分发 SaaS 必须开源你的修改；商业引入要法务过 |
| "Smart search" | 真好用但只在英文 + 少数语言上效果好（CLIP 训练语料偏英）；中文搜索效果取决于是否选了 multilingual CLIP 模型 |

## 元数据

- 状元篇升级日期：2026-05-28（v1.1 分支 A 大型应用首版）
- 总行数（含 frontmatter）：约 530 行
- 启用工具：浅克隆 + WebFetch（GitHub raw + commits API）+ pillow 生成 webp（sketchnote 风）+ Read（method.md / plane.md / excalidraw.md 参考）+ cwebp -q 85 压缩
- commit 锚定：[`aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521`](https://github.com/immich-app/immich/commit/aecf8ec88be23eda6a79bd3bd2d04d63ed1a3521)（main HEAD at 2026-05-28）

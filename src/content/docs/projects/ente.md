---
title: Ente — 端到端加密云相册与零知识备份
来源: https://github.com/ente-io/ente
日期: 2026-06-13
子分类: 安全与隐私
分类: 安全与隐私
provenance: pipeline-v3
---

## 是什么

**Ente**（[ente.io](https://ente.com)）是一套完全开源、端到端加密（E2EE）的个人云存储平台。你在手机上拍的照片、2FA 令牌、重要文档，在离开设备之前就被加密成密文；服务器（代号 **Museum**）只负责搬运和计费，**读不懂**里面是什么。

日常类比：

- **Google Photos / iCloud** = 把相册交给**带监控的托管仓库**：服务商技术上能看你的原图，用来做人脸识别、广告画像
- **Ente** = 把已经**上锁的保险箱**寄到仓库：仓库只知道「有一个 4.2MB 的箱子」，不知道里面是婚礼照还是工资条
- **Museum 服务器** = **收发室**：登记箱子编号、分配格子、开发票，但**没有保险箱钥匙**
- **masterKey（主密钥）** = 只有你自己持有的**万能钥匙**；密码只是用来再包一层锁，保护这把钥匙

同一套加密底座上，Ente 团队已经做了三款应用：

| 产品 | 定位 | 收费 |
|------|------|------|
| **Ente Photos** | Google Photos / iCloud Photos 替代品 | 免费 10GB；付费扩容 |
| **Ente Auth** | 开源 2FA 验证器（Authy 替代） | 免费 |
| **Ente Locker** | 证件、笔记、凭证保险箱 | 免费 100 条；Photos 订阅用户 1000 条 |

代码在 GitHub 单体仓库 [ente-io/ente](https://github.com/ente-io/ente)（AGPL-3.0），客户端以 **Flutter/Dart** 为主，服务端 **Museum** 是 **Go** 单二进制 + PostgreSQL + S3 兼容对象存储。官方托管在 ente.com；你也可以用 Docker 自建，客户端连自己的域名。

## 为什么重要

照片和 2FA 是最敏感的两类个人数据，却长期被「方便」绑在少数大厂生态里。Ente 的价值在于把 **隐私** 和 **体验** 放在同一层架构里解决，而不是事后打补丁：

- **零知识（Zero-Knowledge）**：密钥派生、文件分块加密全在客户端；服务端被拖库也只能拿到密文
- **跨平台一致**：iOS / Android / Web / macOS / Windows / Linux 共用同一套加密协议，不是「某端有 E2EE、某端没有」
- **可审计**：Cure53、Symbolic Software 等第三方做过密码学审计；源码 AGPL，可 fork、可自建
- **存储与算力解耦**：Museum 只管元数据和预签名 URL；大文件直传 [[minio]] / R2 / B2，服务器不当中转瓶颈
- **一条账户多种数据**：Photos、Auth、Locker 共用 Museum，未来新应用无需重新注册

对工程师来说，Ente 是学 **libsodium 实战、密钥层级设计、S3 预签名直传、Flutter 多端同步** 的完整样本；对普通用户，它是「我仍要云备份，但不想把人生交给广告商」的可执行答案。

## 核心概念

### 1. 密钥层级（Key Encryption）

注册时客户端生成随机 **masterKey**（256-bit），**永不以明文上传**。你设置的密码经 **Argon2id**（`crypto_pwhash`）派生出 **keyEncryptionKey**，只用来加密 masterKey：

```
密码 + salt
  └─> keyEncryptionKey (Argon2id)
      └─> 加密 masterKey → encryptedMasterKey（存服务器）

masterKey
  └─> 加密 collectionKey（相册/文件夹）
      └─> 加密 fileKey（单张照片）
          └─> 加密文件内容与元数据（EXIF、文件名等）
```

登录时流程反过来：服务器下发 `encryptedMasterKey`，你用密码派生的 key 解密；密码错了解密失败，客户端立刻知道，**无需**把密码发到服务器比对明文。

此外还有：

- **recoveryKey**：与 masterKey 互相加密备份，用于忘记密码时恢复
- **publicKey / privateKey**：Curve25519 密钥对；`publicKey` 明文存服务器，用于相册分享和加密下发的 `authToken`
- **Verification ID**：`publicKey` 的 SHA-256 转成 BIP39 助记词，两人在分享前对照，防中间人冒充

### 2. 数据模型：Collection 与 File

- **Collection**：文件夹或相册（如「相机胶卷」「旅行 2025」），各有随机 **collectionKey**
- **File**：每张照片/视频有独立 **fileKey**；元数据也用同一 fileKey 加密
- 上传时：文件用 **XChaCha20-Poly1305 流式 API**（`crypto_secretstream_*`）分块加密，适合大视频；小密钥用 **XSalsa20-Poly1305**（`crypto_secretbox`）

下载时按层级逐级解密，任何一层密钥缺失都无法恢复内容——这就是「零知识」的工程实现。

### 3. Museum：数据无关的 API 服务器

Museum 故意对业务数据**保持盲态**：

1. 客户端请求上传 → Museum 生成 **S3 预签名 URL** 并返回
2. 客户端**直传**密文到对象存储（默认 bundled MinIO，也可接 Cloudflare R2、Wasabi 等）
3. 上传完成后客户端通知 Museum；Museum 用 `HeadObject` 校验对象存在，更新数据库里的加密元数据

因此架构上是 **三跳**：Client ↔ Museum ↔ PostgreSQL（加密元数据）+ S3（密文 blob）。官方托管还把数据复制到 **3 个不同云厂商** 的区域，自建通常单副本，需自己备份 `museum.yaml` 和卷。

### 4. 分享与协作

分享相册时，发送方用接收方的 **publicKey**（`crypto_box_seal`）加密 `collectionKey`，服务器只转发密文。接收方用自己的 **privateKey** 解开，再按 File 层级解密照片。双方可在 UI 对照 **Verification ID**，确认端到端路径没有被换公钥。

### 5. Ente Auth 的平行结构

2FA 令牌不走 fileKey，而使用 **tokenKey** + **authKey**（再由 masterKey 保护），逻辑与 Photos 同构，所以 Museum 无需为 Auth 单独写一套存储后端。

### 6. 技术栈一览

| 层 | 技术 |
|----|------|
| 密码学 | [libsodium](https://libsodium.gitbook.io/doc/)（XChaCha20、Argon2id、X25519） |
| 客户端 | Flutter（移动/桌面）、TypeScript（Web） |
| 服务端 | Go（Museum 单二进制） |
| 数据库 | PostgreSQL |
| 对象存储 | S3 兼容（MinIO / R2 / B2 / AWS） |
| 部署 | Docker Compose、`quickstart.sh` 一键脚本 |
| 许可 | AGPL-3.0 |

## 代码示例

### 示例 1：本地启动自建 Museum 集群

在 `ente/server` 目录克隆仓库后，一条命令拉起 API、Web、Postgres、MinIO：

```bash
git clone https://github.com/ente-io/ente.git
cd ente/server
docker compose up --build
```

健康检查：

```bash
curl http://localhost:8080/ping
# 期望返回 pong（改过 healthcheck.go 可能是 kong）
```

服务端口（默认 quickstart / compose）：

| 服务 | 端口 | 用途 |
|------|------|------|
| Museum | `:8080` | REST API |
| Web | `:3000` | Ente Photos 网页端 |
| Albums | `:3002` | 公开相册链接 |
| MinIO | `:3200` | S3 兼容存储 |

浏览器打开 `http://localhost:3000` 注册账号；邮件验证码在 `docker compose logs` 里查看（自建无真实 SMTP 时）。这与 [[docker]]、[[minio]] 的组合是自建 Ente 最常见的入门路径。

更省事的一键脚本（无需 clone，用预构建镜像）：

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ente-io/ente/main/server/quickstart.sh)"
# 在当前目录生成 my-ente/，含 compose.yaml 与自动生成的 museum.yaml
cd my-ente && docker compose up -d
```

### 示例 2：自建时配置 Museum 的 S3 端点（`museum.yaml` 节选）

手机/另一台电脑上传失败，**最常见原因**是 MinIO 的 `endpoint` 写成了 `localhost`——Museum 会把该地址写进预签名 URL，手机上的 `localhost` 指向手机自己，上传静默失败。应改成局域网 IP 或公网域名：

```yaml
# my-ente/museum.yaml（节选）
db:
  host: postgres
  port: 5432
  name: ente_db
  user: pguser
  password: pgpass

s3:
  are_local_buckets: true
  use_path_style_urls: true   # MinIO 需要 path-style
  b2-eu-cen:
    key: minioadmin
    secret: minioadmin
    endpoint: 192.168.1.100:3200   # 勿用 localhost，除非客户端与服务器同机
    region: eu-central-2
    bucket: b2-eu-cen
```

改完后 `docker compose up -d` 重启。若前面有 [[nginx]] 反代 HTTPS，将 `are_local_buckets` 设为 `false` 并配置外部 `endpoint`（如 `s3.example.com`）。

### 示例 3：自托管环境的 Ente CLI

CLI 不能注册新用户，但可登录已有账号、导出明文备份、管理订阅配额：

```yaml
# ~/.ente/config.yaml
endpoint:
  api: https://photos.example.com   # 你的 Museum 地址
```

```bash
ente account add
# 按提示登录；导出目录用于解密后的本地备份

# 自托管管理员给某用户「无限容量」（须在 museum.yaml 白名单 admin 邮箱）
ente admin update-subscription \
  -a admin@example.com \
  -u user@example.com \
  --no-limit
```

### 示例 4：用 libsodium 理解「上传前加密」伪代码

Ente 真实实现分布在 Flutter/TS 客户端，但层级与官方 [architecture/README.md](https://github.com/ente-io/ente/blob/main/architecture/README.md) 一致。下面用 Node [`libsodium-wrappers`](https://www.npmjs.com/package/libsodium-wrappers) 演示**核心思想**（教学用，非生产代码）：

```javascript
import _sodium from 'libsodium-wrappers'

await _sodium.ready
const sodium = _sodium

// 注册时：生成 masterKey，用密码派生的 key 加密后上传服务器
const masterKey = sodium.crypto_secretbox_keygen()
const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
const keyEncryptionKey = sodium.crypto_pwhash(
  32,
  'user-password',
  salt,
  sodium.crypto_pwhash_OPSLIMIT_SENSITIVE,
  sodium.crypto_pwhash_MEMLIMIT_SENSITIVE,
  sodium.crypto_pwhash_ALG_ARGON2ID13,
)
const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
const encryptedMasterKey = sodium.crypto_secretbox_easy(
  masterKey,
  nonce,
  keyEncryptionKey,
)

// 上传照片：fileKey 加密明文，再用 collectionKey 包 fileKey
const fileKey = sodium.crypto_secretbox_keygen()
const collectionKey = sodium.crypto_secretbox_keygen()
const photoBytes = new TextEncoder().encode('JPEG bytes…')
const fileNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
const ciphertext = sodium.crypto_secretbox_easy(photoBytes, fileNonce, fileKey)
const wrappedFileKey = sodium.crypto_secretbox_easy(fileKey, fileNonce, collectionKey)

// 只有 ciphertext + wrappedFileKey + 加密元数据 上传 Museum/S3
// 服务器无法从 ciphertext 反推 photoBytes
```

要点：**明文 photoBytes 与 masterKey 从不离开受信客户端**；服务器只见 `ciphertext` 和一堆被包装的密钥材料。

## 实践案例

### 案例 1：从 Google Photos 迁到 Ente Photos

1. 在 [Google Takeout](https://takeout.google.com) 导出相册（可选 ZIP）
2. 安装 Ente 桌面端或打开 Web，登录 ente.com 或自建实例
3. 设置 → Import → 选择 Google Takeout / Apple Photos / Amazon Photos 等向导
4. 开启「备份所选相册」：新照片后台自动上传，原画质保留 EXIF、Live Photo

迁移期间 Ente 在本地加密后再传，Google 侧导出的是明文，注意导出链接的有效期和磁盘空间。

### 案例 2：家庭相册协作

创建相册 → 邀请家人邮箱 → 对方接受后可用 Ente 查看/往相册加图。协作权限在加密层通过分享 `collectionKey` 实现，不是服务器侧「开文件夹权限」。见面前可对照双方 App 里的 **Verification ID**，确认公钥未被替换。

### 案例 3：2FA 从 Authy 迁到 Ente Auth

Authy 停服或闭源后，Ente Auth 提供带云备份的开源 2FA。扫码添加令牌后，`tokenKey` 层级加密同步；换机时同 Photos 一样用邮箱 + 密码恢复 **masterKey**，再解密令牌库。

## 踩过的坑

**自建 `localhost` 端点**：上文已述，手机上传失败优先查 `museum.yaml` 的 S3 `endpoint` 和 CORS。

**删掉 `my-ente` 文件夹不等于删数据**：Docker volume 仍在；要彻底重来用 `docker compose down --volumes`，**会永久删除照片**。

**丢失 `museum.yaml` 与 recoveryKey**：加密数据在卷里但无法解密元数据路由；务必备份自动生成的凭证和注册时保存的 **recoveryKey**。

**AGPL 自建分发**：修改 Museum 并提供网络服务时，需按 AGPL 开源修改；内部自用风险较低，商用需读许可证。

**自托管支持优先级**：官方文档写明工程带宽有限，Issue 里纯自建问题可能不被优先处理；社区 [Discussions](https://github.com/ente-io/ente/discussions) / Discord 互助更现实。

**语义搜索 / ML**：部分智能功能在设备端或受 E2EE 约束的方式实现，与 Google Photos 全知全能的云端 ML 不同，预期要调整。

## 与同类方案对比

| 维度 | Ente Photos | Immich | Google Photos |
|------|-------------|--------|---------------|
| E2EE / 零知识 | ✅ 默认 | ❌ 服务器可读 | ❌ |
| 开源 | ✅ AGPL | ✅ AGPL | ❌ |
| 自建 | ✅ Museum | ✅ | ❌ |
| 云端 ML 人脸/物体 | 设备端/受限 | ✅ 服务端 | ✅ |
| 最低自建 RAM | ~1GB 级 | 常需 2GB+ | N/A |

若你最在意**服务商看不到原图**，Ente 几乎是主流相册里唯一把 E2EE 当一等公民的；若最在意**自建上的 AI 相册管理**，[[immich]] 更合适。二者可并存：敏感相册 Ente，实验性图库 Immich。

## 历史小故事

- **2022-11**：`ente-io/ente` 单体仓库公开，以 Photos 为主打
- **2023-2024**：Ente Auth 随 Authy 动荡而增长；密码学架构文档与 Cure53 审计公开
- **2025-2026**：Ente Locker、公开相册独立端口、quickstart 脚本降低自建门槛；GitHub star 逾 2.7 万
- 团队把 API 服务器命名为 **Museum**——「个人照片比任何艺术品都珍贵」，却只需一个 Go 二进制就能运行

## 学到什么

- **密钥层级**比「整库一个密码」更安全：单文件 fileKey 泄露不拖垮整个账户；轮换 collectionKey 时可细粒度重加密
- **预签名直传**是零知识云的标配：Museum 不碰密文 bytes，才能证明「服务器没看到内容」
- **libsodium 高级 API** 比手写 AES 模式靠谱：`crypto_secretstream` 处理大文件，`crypto_box_seal` 处理分享
- **协议兼容对象存储**（S3）让 Ente 自建成本与 [[minio]] / R2 绑定，不必锁定某一家云
- **一个盲态 API 多种产品**：Auth、Locker、Photos 共用 Museum，是平台型 E2EE 的正确切法

## 延伸阅读

- 官方架构说明：[ente.com/architecture](https://ente.com/architecture) / [GitHub architecture/README.md](https://github.com/ente-io/ente/blob/main/architecture/README.md)
- 自建指南：[ente.com/help/self-hosting](https://ente.com/help/self-hosting)
- Museum 运行文档：[server/RUNNING.md](https://github.com/ente-io/ente/blob/main/server/RUNNING.md)
- 密码学审计博文：[ente.com/blog/cryptography-audit](https://ente.com/blog/cryptography-audit/)
- 可靠性（三云复制）：[ente.com/reliability](https://ente.com/reliability)

## 关联

- [[minio]] —— Ente 自建默认 bundled MinIO；生产可换任意 S3 兼容后端
- [[bitwarden-server]] —— 同为「客户端加密 + 服务端盲存」范式，可对比密钥派生与微服务拆分
- [[nextcloud-server]] —— 传统自建网盘路线；默认非 E2EE，与 Ente 定位互补
- [[docker]] —— Museum 官方推荐 Docker Compose 部署路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

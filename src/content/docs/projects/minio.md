---
title: MinIO — S3 兼容对象存储
来源: https://github.com/minio/minio
日期: 2026-05-29
分类: 数据库 / 存储
难度: 中级
---

## 是什么

MinIO 是 2014 年用 Go 写的"自己部署的 S3"——API 兼容 AWS S3，几行配置就能在自家服务器跑起对象存储。

日常类比：

- AWS S3 = **公共仓库**，按存储 / 流量付费，钥匙在亚马逊手里
- MinIO = **自家车库**，跑在你的服务器上，免费但要自己运维

对外的"递包裹 / 取包裹"接口（PutObject / GetObject / ListBucket）和 S3 一模一样，所以**任何 S3 SDK 都能直接连 MinIO**——这就是它最核心的卖点。

## 为什么重要

S3 协议是过去十年云存储的事实标准。MinIO 把这层标准搬下云，影响面非常广：

- **协议兼容**：boto3 / aws-sdk / s3cmd 一行 endpoint 改成 `localhost:9000`，剩下不用动
- **部署简单**：单个 Go 二进制起 cluster，不像 Ceph 要装一整套组件
- **AI / ML 默认存储**：训练数据集、模型权重、特征库——大量 ML 团队默认 MinIO
- **数据 Lake 与备份**：Iceberg / Delta Lake / Velero 都把 MinIO 当后端
- 与 [[kubernetes]] 深度集成：官方 Operator + Helm Chart，K8s 里跑 MinIO 是 first-class 用法

不理解 MinIO，就不理解为什么"自建对象存储"这件事在 2020 年之后突然变得简单了。

## 核心要点

MinIO 能撑起"自建 S3"，靠的是三件事拼在一起：

**S3 API 兼容**：PutObject / GetObject / ListBucket / Multipart Upload / 预签名 URL / IAM 策略基础部分——SDK 视角看不出区别。Webhook、对象锁、版本控制、生命周期规则也都有。

**分布式 + Erasure Coding**：把一个对象切成 N 份数据片 + M 份校验片，散到不同节点。坏掉 ≤ M 块盘还能恢复——常见配比下比传统 3 副本更省空间（具体省多少看 N+M）。类比：把一本书拆成 12 张纸 + 4 张校对纸，丢 4 张以内还能拼回原书。

**单 binary 部署**：`minio server /data` 一行起服务，没有外部依赖（不需要 ZooKeeper / etcd / 数据库）。集群模式只是多写几个节点地址，启动方式不变。

## 实践案例

### 案例 1：本地起一个 MinIO

跑一个能用的对象存储，三行命令：

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=admin12345 \
  minio/minio server /data --console-address :9001
```

- `9000` 是 S3 API 端口（SDK 连这个）
- `9001` 是 Web 控制台（浏览器看 bucket / 对象）
- `--console-address` 把控制台单独拆出来，避免和 API 抢端口

打开 `http://localhost:9001`，登录后能创建 bucket、上传文件，跟 AWS S3 控制台体验几乎一致。底层依赖 [[docker]] 跑容器。

### 案例 2：用 aws-sdk 写代码连 MinIO

代码一字不用改，**只改 endpoint**：

```js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',          // MinIO 不关心，但 SDK 要求填
  credentials: { accessKeyId: 'admin', secretAccessKey: 'admin12345' },
  forcePathStyle: true,         // MinIO 要求路径风格 URL
})

await s3.send(new PutObjectCommand({
  Bucket: 'photos',
  Key: 'avatar.png',
  Body: fileBuffer,
}))
```

`forcePathStyle: true` 是关键——AWS S3 默认用 `bucket.s3.amazonaws.com` 子域，MinIO 用 `localhost:9000/bucket/key` 路径。

### 案例 3：MC（MinIO Client）做日常操作

`mc` 是官方命令行，比 `aws s3` 更顺手：

```bash
mc alias set local http://localhost:9000 admin admin12345
mc mb local/backup                          # make bucket
mc cp ./report.pdf local/backup/2026-05/    # upload
mc ls local/backup/2026-05/                 # list
mc mirror ./photos local/photos             # 持续同步整个目录
```

`mc mirror` 这种"目录持续镜像"在 AWS CLI 里要拼 `s3 sync` + 脚本，MinIO 直接给一条命令。

## 踩过的坑

**单节点不抗 disk fail**：单机模式只是文件系统包一层，磁盘坏了对象就丢。要数据冗余必须 ≥ 4 节点 Erasure Coding 模式。本地玩可以单节点，生产环境绝不行。

**默认密码必须改**：`minioadmin / minioadmin` 是出厂默认。生产里没改的服务器被扫到就直接拿走所有数据——这是 MinIO 安全事件最常见原因。

**大对象走 multipart**：超过 100MB 的对象一次性上传又慢又容易超时。SDK 的 `Upload` 类（aws-sdk）/ `mc` 默认会切成 5MB 块并发上传，但自己拼 PutObject 的人经常忘。

**与官方 S3 边角差异**：常用 API 兼容度极高，但 IAM 策略、Object Lock、Lifecycle Rule 的边角语义可能略有不同。生产从 AWS S3 迁过来前要先用真实策略跑一遍兼容测试。

**版本控制 + 删除标记**：开了版本控制后 `DELETE` 不是真删，是加一条删除标记。误以为"删掉了"占的空间没释放，结果磁盘月底爆。要配 Lifecycle Rule 真正清掉历史版本。

## 适用 vs 不适用

**适用**：

- 本地 / CI 里替代真 S3 做开发联调（改 endpoint 即可跑通 SDK）
- 私有云或机房自建对象存储，数据不想出公网
- AI/ML 数据集、模型权重、特征库等大对象吞吐场景
- K8s 上用 Operator / Helm 起一套中小规模对象存储（常见从 4 盘 EC 起步）

**不适用**：

- 单节点当生产主存储——没有 EC 冗余，盘坏即丢数据
- 要完全对齐 AWS IAM / Object Lock 边角语义——先做兼容性回归
- 超大规模多租户公有云级 SLA——那是云厂商的活，MinIO 更偏自建可控
- 需要 POSIX 文件语义（随机写、锁、mmap）——对象存储不是文件系统

## 历史小故事

- **2014**：MinIO Inc. 创立。最早叫 Minio，目标就是"S3 协议 + 开源 + 自建"
- **早期**：以 Apache-2.0 开源上 GitHub；后续许可证有调整，部署前先核对当前 LICENSE
- **2020**：Erasure Coding 模式 GA，从"单机存储"升级到"真正的分布式对象存储"
- **2022**：Kubernetes Operator 成熟，K8s 部署 MinIO 变成主流姿势
- **2024**：RELEASE.2024-12 加入 SSE-KMS（服务端加密 + 外部 KMS 集成），向企业级合规靠拢

十年间从"个人玩具"长成"大厂自建存储默认选项"，赶上的两波风口是 K8s 普及和 AI 训练数据爆炸。

## 学到什么

- **协议兼容是最强护城河**：MinIO 没发明新东西，只是把 S3 协议搬到自家服务器，结果撬动了整个生态——SDK 不用改是真有粘性
- **Erasure Coding 比 3 副本更省**：N+M 切片在大集群里普遍取代了"3 份完全副本"，Ceph / HDFS 也走这条路
- **单 binary 是基础设施好品味**：[[caddy]]、[[redis]]、MinIO 都走"一个二进制 + 配置文件"路线——部署 / 升级 / 排错都简单一截
- **对象存储 ≠ 文件系统**：API 是 Put / Get / List 而不是 read / write / seek。理解这一点才能解释为什么 S3 / MinIO 适合存大文件、不适合存数据库 WAL

## 延伸阅读

- 官方文档：[MinIO Docs](https://min.io/docs/minio/linux/index.html)
- Erasure Coding 入门：[MinIO Erasure Code Quickstart](https://min.io/docs/minio/linux/operations/concepts/erasure-coding.html)
- Kubernetes Operator：[github.com/minio/operator](https://github.com/minio/operator)
- 与 AWS S3 兼容性对照：[S3 API Compatibility](https://min.io/docs/minio/linux/reference/s3-api-compatibility.html)

## 关联

- [[kubernetes]] —— K8s 是 MinIO 生产部署的主流宿主，官方 Operator 一键起集群
- [[docker]] —— 本地起 MinIO 最快路径，单条 docker run 命令
- [[caddy]] —— 同样"单 binary + 配置文件"的基础设施好品味样板
- [[redis]] —— 同为"自建替代云服务"路线，Redis 替代 ElastiCache，MinIO 替代 S3
- [[unstorage]] —— Node 生态的统一存储抽象层，可以把 MinIO 当后端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cvat]] —— CVAT — 视频帧标注与半自动追踪的开源王者
- [[label-studio]] —— Label Studio — 文本图像音视频时序通吃的标注王者

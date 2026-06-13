---
title: On-demand Container Loading — Lambda 如何在 10GiB 镜像下保持冷启动
来源: https://www.usenix.org/conference/atc23/presentation/brooker
日期: 2026-06-13
子分类: 共识与复制
分类: 分布式系统
provenance: pipeline-v3
---

## 是什么

**On-demand Container Loading in AWS Lambda** 是 AWS 团队在 USENIX ATC 2023 发表的论文（Best Paper），作者包括 Marc Brooker、Mike Danilov、Chris Greenwood、Phil Piwonka。它解决的是一个听起来矛盾的问题：**把 Lambda 函数部署包从 250MB zip 扩到 10GiB 容器镜像，却不让冷启动变慢**。

日常类比：想象你开了一家**连锁快餐店**（Lambda 平台），顾客点单后必须在 50 毫秒内拿到餐（冷启动 SLA）。早期你只卖「便当盒」——一个小 zip 包，打开就能吃。后来顾客想带整台**移动厨房**（Docker 镜像）来：10GB 的锅碗瓢盆、调料、半成品全塞在一个集装箱里。

 naive 做法：每来一个订单，就把 10GB 集装箱从仓库搬到柜台、全部拆箱摆好，再开始做菜。高峰时每秒 15,000 个新订单——光搬数据就要 **150 Pb/s** 带宽，物理上不可能。

论文的做法是**按需取货**：

1. 大家用的都是同一批「基础酱料包」（Alpine、Ubuntu 基础层）——仓库只存一份，到处复用（**块级去重**）。
2. 做菜时只从集装箱里拿**当前这一步需要的工具**（平均只有约 6.4% 的镜像字节在启动时被读取）——其余等到真的 `open()` / `read()` 再拉（**稀疏按需加载**）。
3. 酱料包按「离灶台远近」分层摆放：灶台边抽屉 → 店内冷库 → 区域中央仓 → S3 权威存储（**三级缓存**）。

这套系统已支撑**数万亿次** Lambda 调用、百万级客户，且在故障与流量尖峰下保持弹性。

## 为什么重要

不理解这篇论文，下面几件事都解释不清：

- 为什么 Lambda 2020 年后能跑 **10GiB 容器镜像**，而冷启动仍可到 **~50ms** 量级
- 为什么 Serverless 厂商都在卷「镜像加速」——根因是 **FaaS 的瓶颈从 CPU 变成数据搬运**
- 为什么云原生镜像优化从「层缓存」走向「块缓存 + 按需读」——层去重对 CI/CD 重复上传不够细
- 为什么多租户场景下「去重」和「加密」天然打架——需要 **收敛加密（Convergent Encryption）** 这种折中
- 为什么 Firecracker + virtio-blk + FUSE 是 Lambda 的安全边界选择——把复杂文件系统逻辑关在客户机内核里

**核心地位**：这是**第一个在超大规模 FaaS 上把容器镜像做成块设备、按需加载、且可安全去重**的生产级设计，直接影响今天 Lambda、Fargate 等产品的镜像路径。

## 核心要点

论文架构可以拆成 **五层机制**：

### 1. 确定性展平（Deterministic Flatten）

OCI 镜像是多层 tarball 叠出来的。Lambda 在**控制面**（客户改代码/配置时，低频）把各层**确定性** overlay 成单个 **ext4** 块设备镜像：

- 文件系统操作**串行、无并发随机性**（连 `mtime` 都固定），保证相同内容产出相同块
- 再切成固定 **512 KiB** 的 chunk——在去重粒度、元数据大小、顺序读预取之间取平衡

块级去重比「按层 / 按文件」更细：论文数据称约 **75%** 镜像独特字节 < 5%；**80%** 新上传函数甚至 **0 个独特 chunk**（纯 CI/CD 重传）。

### 2. 按需块加载（Block-Level Demand Loading）

执行面（每秒百万次 invoke）不再「下载完整 zip 再解压」。每个 MicroVM 通过 **FUSE** 暴露一块虚拟磁盘：

```
客户代码 read() → Guest Linux page cache miss
  → virtio-blk → Firecracker → Local Agent (FUSE)
    → Worker L1 缓存命中？否则 → AZ L2 缓存 → S3 L3
```

只拉**被读到的 chunk**。Harter 等人的 Slacker 工作表明容器平均仅 **~6.4%** 数据在启动阶段被访问——论文借此拿到约 **15×** 加速空间。

写操作走**页级 copy-on-write 覆盖层**（加密存 worker 本地），底层 chunk 在各级缓存中保持**不可变**，可跨 MicroVM 共享。

### 3. 不信任环境下的去重（Convergent Encryption）

明文去重很简单：hash 内容当 ID。但客户数据要加密，同一明文用不同密钥会变成不同密文，去重失效。

Lambda 采用 **收敛加密**（源自 Farsite）：

1. 对 chunk 算 **SHA-256**，用摘要**确定性派生 AES 密钥**
2. **AES-CTR** 加密 chunk（确定性 IV），相同明文 → 相同密文 → 可去重
3. **Manifest** 里每个 chunk 的密钥表用**客户专属 KMS 密钥**做 **AES-GCM** 加密
4. Chunk 以**密文 hash** 命名写入 S3；已存在则跳过上传

这样：**存储层可跨客户共享相同密文块**，但单个 worker 只能解密自己被分配到的函数 manifest。

额外技巧：内容寻址名里掺入 **salt**，故意多缓存几份热门 chunk，用略低的命中率换**坏块爆炸半径**缩小（不会一颗坏块拖垮几乎所有函数）。

### 4. 三级缓存 + 纠删码

| 层级 | 位置 | 角色 |
|------|------|------|
| L1 | Worker 本地内存/盘 | 最热 chunk，约 **67%** 命中 |
| L2 | 可用区（AZ）分布式缓存 | 次热，约 **32%** 命中 |
| L3 | S3 | 权威存储，**<0.1%** 访问 |

AZ 缓存用一致性哈希分片。为扛节点故障、压**尾延迟**，对 chunk 做 **纠删码（Erasure Coding）**：分成 M 份，任意 k 份可重建——坏一台缓存机**命中率不跌崖**（经典 20 节点哈希环丢 5% 数据会导致 miss 暴增 5×）。

### 5. 与现有 Lambda 架构的最小侵入集成

Invoke 路径不变：Frontend → Worker Manager → Worker → Firecracker MicroVM。新增的是：

- **Container Registry** + 确定性展平流水线
- **Chunk Origin (S3)** + **AZ Distributed Cache**
- Worker 上 **Per-function Local Agent** + **Per-worker Local Cache**

客户侧无感知：照常 `docker push` 到 ECR，Lambda 从镜像 URI 拉元数据即可。

## 实践案例

### 案例 1：为 Lambda 构建并推送容器镜像

下面是一个最小可运行的容器化 Lambda 函数——展示「客户上传的到底是什么」：

```dockerfile
# Dockerfile — 基于 AWS 官方 Python 基础镜像（高去重收益）
FROM public.ecr.aws/lambda/python:3.12

# 依赖层：多数团队共用相似 requirements，块级去重会吃掉重复部分
COPY requirements.txt .
RUN pip install -r requirements.txt --target "${LAMBDA_TASK_ROOT}"

# 业务代码层：通常只占镜像一小部分独特字节
COPY app.py ${LAMBDA_TASK_ROOT}

CMD ["app.handler"]
```

```python
# app.py — 处理函数；冷启动时 Python 运行时 + 部分标准库被读取
import json

def handler(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({"msg": "hello from container image"}),
    }
```

```bash
# 构建、推送到 ECR、创建 Lambda（控制面触发「展平 + 切 chunk + 上传」）
AWS_ACCOUNT=123456789012
REGION=us-east-1
REPO=my-lambda-fn

aws ecr create-repository --repository-name "$REPO" --region "$REGION"
docker build -t "$REPO" .
docker tag "$REPO:latest" \
  "$AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:latest"
aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin \
  "$AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
docker push "$AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:latest"

aws lambda create-function \
  --function-name MyContainerFn \
  --package-type Image \
  --code ImageUri="$AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:latest" \
  --role arn:aws:iam::$AWS_ACCOUNT:role/lambda-exec \
  --timeout 30 --memory-size 512
```

**解读**：

- `create-function` / 镜像更新走**控制面**，触发一次确定性展平——频率是「发版次数」，不是「调用次数」
- 真正 invoke 时，Worker **不会**等 10GiB 全下完；Guest 里 Python 解释器 `exec()` 你的 `app.py` 时，FUSE 层按 ext4 块偏移去拉 chunk
- 若你用和邻居相同的 `public.ecr.aws/lambda/python:3.12`，展平后大量 512KiB 块与全球其他函数**密文相同**，S3 里早已存在，上传几乎只传「差异块」

### 案例 2：模拟 Local Agent 的按需读路径

论文 Local Agent 的核心逻辑可抽象为（教学用伪代码，非 AWS 源码）：

```python
CHUNK_SIZE = 512 * 1024  # 512 KiB

class OnDemandBlockDevice:
    """FUSE 后端：把容器镜像 manifest 映射成稀疏块设备"""

    def __init__(self, manifest, l1_cache, remote_cache, overlay):
        # manifest: [(byte_offset, chunk_id, chunk_key), ...]
        self.manifest = manifest
        self.l1 = l1_cache
        self.remote = remote_cache
        self.overlay = overlay  # 写时复制，页粒度 bitmap

    def read(self, offset: int, length: int) -> bytes:
        buf = bytearray()
        pos = offset
        while len(buf) < length:
            if self.overlay.has_page(pos):
                buf += self.overlay.read(pos, length - len(buf))
                break
            chunk_id = pos // CHUNK_SIZE
            chunk_off = pos % CHUNK_SIZE
            data = self.l1.get(chunk_id)
            if data is None:
                ciphertext = self.remote.fetch(chunk_id)  # L2 → S3
                key = self.manifest.key_for(chunk_id)
                data = aes_ctr_decrypt(ciphertext, key)
                self.l1.put(chunk_id, data)
            take = min(CHUNK_SIZE - chunk_off, length - len(buf))
            buf += data[chunk_off : chunk_off + take]
            pos += take
        return bytes(buf)

    def write(self, offset: int, data: bytes) -> None:
        # 只写 overlay；底层 chunk 永不变更 → 多 MicroVM 共享只读缓存
        self.overlay.write_copy_on_write(offset, data)
```

**逐步对应论文 Figure 4**：

1. Guest 发起 `read(0, 4096)` 读 ELF / Python 解释器头
2. Miss page cache → virtio-blk → `OnDemandBlockDevice.read`
3. 计算 chunk_id，先查 **Worker L1**（论文测得 **67%** 在此结束）
4. Miss 则 **AZ L2**（再 **32%**），极少数 **S3 L3**
5. 密文 chunk 用 manifest 中的派生密钥解密，填入 Guest page cache
6. 后续读同 chunk 的其他页不再触网

写路径永远不进共享缓存，避免多租户写污染。

### 案例 3：冷启动时间账——数据搬运 vs 计算

粗算为何「全量下载」不可行（论文 Introduction 的数字）：

```
峰值: 15,000 新 MicroVM/s（单客户）
镜像: 10 GiB = 80 Gb
所需带宽: 15,000 × 80 Gb/s = 1,200 Tb/s ≈ 150 PB/s（论文写法）

按需 + 去重 + 缓存后:
  有效读取 ≈ 10 GiB × 6.4% ≈ 640 MB（Slacker 经验）
  再 × (1 - 67% L1) × (1 - 32% L2) ... 绝大多数字节一生不被拉取
```

这就是为什么优化方向是 **少搬字节**，而不是 **换更快的网卡**。

## 架构一图流

```
客户 docker push → ECR
        ↓ (控制面，低频)
  Deterministic Flatten → ext4 → 512KiB chunks
        ↓ 收敛加密 + 内容寻址名
      S3 (L3 权威)  ←──  AZ Erasure-Coded Cache (L2)
                              ↑
Invoke → Worker Manager → Worker
                              ↓
                    Per-function FUSE Local Agent
                              ↓ virtio-blk
                    Firecracker MicroVM (Guest ext4)
                              ↓
                    客户 runtime + handler 执行
```

## 与相关工作的关系

| 方案 | 粒度 | 特点 | Lambda 论文的取舍 |
|------|------|------|-------------------|
| **Slacker** (Harter et al.) | 文件系统 / 懒加载 | 证明「大部分镜像字节不被读」 | 借鉴稀疏性；但 Lambda 选 **块级** 以缩小宿主机攻击面 |
| **Starlight** | 文件级按需 | 科学计算镜像 | 同上，避免在 worker 上叠 overlayfs |
| **Venti** | 块 hash 去重 | 经典块存储去重 | 借鉴内容寻址；加 **收敛加密** 满足多租户 |
| **传统层缓存** (registry / dragonfly) | 层 / 文件 | 实现简单 | 对「同基础镜像、微小差异」去重不够细 |

论文获 **Best Paper**，部分原因是它在**真实极限规模**（15k VM/s、百万工作负载）下把缓存、去重、加密、纠删码、懒加载焊成一条完整生产路径，而不是实验室原型。

## 设计启示

1. **先量「搬了多少字节」，再谈算法**：FaaS 冷启动本质是数据搬运问题；6.4% 启动读取率意味着 94% 全量下载是浪费。
2. **控制面 / 数据面分离频率**：展平、切 chunk 放低频路径；invoke 热路径只做 O(1) manifest 查找 + 按需 fetch。
3. **安全边界决定技术选型**：Firecracker 只信 virtio-blk → 必须在块层做稀疏加载，不能把 overlayfs 堆在宿主机。
4. **去重与加密要一起设计**：收敛加密是多租户块去重的标准答案；KMS 只保护「密钥表」，不保护「chunk 列表」以便 GC。
5. **为故障多做一点工作**：纠删码、salt 多副本——用少量冗余换尾延迟和爆炸半径，是大规模系统的常态交易。

## 局限与开放问题

- **512 KiB chunk 大小**是经验常数；随机读多的工作负载可能受益于更小块，顺序读可能想要更大块 + 预取。
- **写密集**函数依赖 overlay 本地盘，长时间 / 大写入会占 worker 资源——论文聚焦读路径。
- **跨区冷启动**：L2 是 AZ 级；镜像首次在新 AZ 峰值扩容仍可能打 S3，需要靠预热与全局流量调度（论文略提，非重点）。
- 客户若把 10GiB 塞满独特数据、几乎无共享基础层，去重收益下降——属于尾部 **20%** 函数（median 独特 chunk 仅 2.5%，但长尾存在）。

## 总结

On-demand Container Loading 回答了一个产品级问题：**Serverless 的承诺是「按调用付费、毫秒扩缩」，那当部署单元变成 10GiB 容器时，如何把「搬镜像」从冷启动关键路径上拿掉？**

答案不是单一技巧，而是组合拳：

- **确定性展平 + 512KiB 块去重** → 少存、少传
- **FUSE + virtio 按需读** → 少读
- **L1/L2/L3 缓存** → 少打远存储
- **收敛加密** → 在多租户下仍然敢去重
- **纠删码 AZ 缓存** → 机器坏了也不拖垮尾延迟

用 Marc Brooker 博客里的总结：**性能来自尽可能少做事；韧性来自稍微多做一点事。** 这篇论文是这句话在 AWS Lambda 镜像路径上的工程证明。

## 延伸阅读

- 论文 PDF：[USENIX ATC 2023 Proceedings](https://www.usenix.org/system/files/atc23-brooker.pdf)
- 作者解读：[Container Loading in AWS Lambda（Marc's Blog）](https://brooker.co.za/blog/2023/05/23/snapshot-loading.html)
- 虚拟化基础：[[xen-2003]]（半虚拟化思路的史前参考）；Lambda 实际跑在 **Firecracker** MicroVM 上
- 懒加载先例：Slacker (OSDI 2016) — «容器镜像大部分字节从未被读取»
- 相关 AWS 能力：Lambda **SnapStart**（JVM 快照恢复，解决另一类冷启动问题，与本文「镜像块加载」正交）

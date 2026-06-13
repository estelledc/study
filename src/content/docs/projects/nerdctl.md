---
title: nerdctl — containerd 官方的 Docker 兼容 CLI
来源: https://github.com/containerd/nerdctl
日期: 2026-05-31
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

nerdctl 是 [[containerd]] 官方维护的命令行客户端，**命令一比一对齐 docker**，但底层不走 dockerd，而是直接调 containerd 的 gRPC。

日常类比：

- docker 像「自带前台 + 自带后厨」的连锁餐厅——前台（CLI）和后厨（dockerd）必须一起开
- nerdctl 像「换了前台、共用社区中央厨房」——前台菜单（命令）和 docker 一样，但后厨是 K8s 节点同款的 containerd

把 docker 命令前缀换成 nerdctl，绝大多数情况能直接跑：

```bash
docker run -d -p 8080:80 nginx
nerdctl run -d -p 8080:80 nginx     # 完全等价
```

## 为什么重要

不理解 nerdctl 这条路线，下面这些事都没法解释：

- 为什么 K8s 集群节点上**只装 containerd 不装 docker**，运维仍然需要一个 docker-like 工具
- 为什么 [[lima]] / colima / Rancher Desktop 默认前端用 nerdctl 而不是 docker
- 为什么 `nerdctl build` 不需要单独装 BuildKit——BuildKit 已经被它内置
- 为什么大模型镜像几个 GB 也能秒启动——nerdctl 是 lazy-pull（stargz/Nydus）的主要消费者

四个关键定位：

1. **官方背书**：containerd 自己的子项目，不是第三方包装
2. **K8s 同栈**：节点上的 containerd 和你本地的 containerd 是同一份代码，调试时心智零跳转
3. **新功能首发地**：BuildKit / lazy-pull / 镜像加密 / IPFS 分发都先在 nerdctl 落地，再回流到生态
4. **rootless 一等公民**：靠 RootlessKit，普通用户不用 sudo 就能跑

## 核心要点

### 1. 与 containerd 的关系

```
nerdctl CLI
   ↓ gRPC
containerd 守护进程
   ↓
containerd-shim → runc → 容器
```

对比 docker：CLI → dockerd → containerd → shim → runc。**nerdctl 砍掉了 dockerd 这一层**，因此节点上不需要再跑一份 docker daemon。

### 2. BuildKit 内置

```bash
nerdctl build -t myapp .
```

不需要单独装 buildx 或 buildkitd——nerdctl 启动时自动拉起 BuildKit 后端。多平台构建、缓存挂载、SSH/secret 转发都直接可用。

### 3. Lazy-pull（stargz / eStargz / Nydus）

传统镜像 pull 必须把所有层下完才能 run；lazy-pull 让容器**启动时只下首层元数据**，运行中再按需取剩余文件。

```bash
nerdctl --snapshotter=stargz run -d ghcr.io/stargz-containers/nginx:1.21.6-esgz
```

大模型 / 数据科学镜像几个 GB，启动从分钟级降到秒级。需要镜像仓库以 eStargz 或 Nydus 格式存。

### 4. 镜像加密 / IPFS 分发

```bash
nerdctl image encrypt --recipient jwe:my-pubkey nginx:latest nginx:enc
nerdctl ipfs registry up
nerdctl push ipfs://nginx:latest
```

加密走 containerd/imgcrypt 子项目；IPFS 让镜像不再依赖中心化 registry。

## 实践案例

### 案例 1：Mac 上起步（靠 lima）

```bash
brew install lima nerdctl
limactl start template://default
lima nerdctl run -d -p 8080:80 nginx
curl http://localhost:8080
```

或者用 colima 一键封装：

```bash
brew install colima
colima start
nerdctl ps     # 直接用，不用 lima 前缀
```

### 案例 2：从 docker 迁移 compose

```yaml
services:
  web:
    image: nginx
    ports: ["8080:80"]
```

```bash
nerdctl compose up -d
nerdctl compose logs -f
```

绝大部分 docker-compose.yaml 直接复用。注意 profiles / extends 等高阶语法 nerdctl compose 仍在补齐。

### 案例 3：K8s 节点排查

K8s 1.24+ 节点只装 containerd 不装 docker。登上节点：

```bash
sudo nerdctl --namespace k8s.io ps -a
sudo nerdctl --namespace k8s.io logs <container-id>
```

`--namespace k8s.io` 是 K8s 默认放容器的 containerd 命名空间。比 `crictl` 更顺手，因为命令是 docker 风格。

## 踩过的坑

1. **命名空间隔离**：`ctr` 默认命名空间是 `default`，K8s 在 `k8s.io`，nerdctl 默认也是 `default`——加 `--namespace k8s.io` 才能看到 K8s 容器
2. **Mac 性能**：靠 lima/colima 跑 Linux VM，文件挂载比原生 OrbStack 慢
3. **lazy-pull 需要特殊镜像**：普通 `docker push` 不会变成 eStargz；要 `nerdctl image convert` 转换或仓库本身支持
4. **rootless 端口限制**：< 1024 端口默认禁，靠 RootlessKit port-forward 兜底
5. **compose 子集**：高阶 profiles / depends_on healthcheck / extends 部分缺；CI 重度依赖时先确认
6. **和 ctr 不互通**：`ctr` 和 `nerdctl` 共享 containerd 数据，但默认命名空间不同——`ctr -n default ps` 才能看到 nerdctl 跑的容器

## 适用 vs 不适用场景

**适用**：

- K8s 节点上做容器排查（命令熟，无需学 crictl）
- Linux 服务器替代 docker，少一个 daemon
- 需要 lazy-pull / 镜像加密 / IPFS 这些 docker 没有的新特性
- 学 containerd 但又懒得用底层的 ctr

**不适用**：

- Mac 桌面密集开发（VM 损耗）→ OrbStack 更顺
- 重度依赖 docker compose v2 高阶特性 → 暂时回 docker
- Windows 桌面开发 → Docker Desktop 更成熟
- 团队工具链已锁定 docker-cli + buildx → 迁移成本不一定值

## 历史小故事

- **2020**：NTT 工程师 Akihiro Suda 在 containerd 主仓库开 `cmd/nerdctl`，对标 docker CLI
- **2021**：BuildKit / stargz / 镜像加密陆续接入
- **2022**：K8s 1.24 移除 dockershim，节点 containerd 化，nerdctl 成为节点排查首选
- **2023**：从 containerd 主仓库迁出，独立为 containerd/nerdctl
- **2024**：v2.0 GA，compose 兼容大幅完善，IPFS 分发稳定

## 学到什么

1. **接口兼容是迁移的最大杠杆**：CLI 和 docker 一样，运维心智零迁移成本
2. **官方 CLI 比第三方包装更安心**：nerdctl 在 containerd 组织下，新特性首发地
3. **lazy-pull 改变镜像观**：镜像不再是「先下完再跑」，而是「跑起来再按需下」
4. **K8s 节点工具链统一**：containerd + nerdctl 让本地与节点用同一套底层

## 延伸阅读

- 官方仓库：[containerd/nerdctl](https://github.com/containerd/nerdctl)
- Akihiro Suda 的 KubeCon 分享：[Lazy pulling container images with stargz](https://github.com/containerd/stargz-snapshotter)
- [[containerd]] —— nerdctl 调用的底层运行时
- [[docker]] —— 命令对照参照系
- [[podman]] —— 另一种 "无 docker" 路线，对比 daemon vs no-daemon
- [[kubernetes]] —— 节点上 containerd 的最大消费者

## 关联

- [[containerd]] —— nerdctl 是它的官方 CLI 前端
- [[docker]] —— 命令一比一兼容；最大区别是后端
- [[podman]] —— 走无 daemon 路线；nerdctl 反过来抱紧 daemon
- [[kubernetes]] —— K8s 1.24 后节点跑 containerd，nerdctl 是排查首选工具

---
title: Sealed Secrets — 把加密后的 Secret 安全提交到 Git
来源: https://github.com/bitnami-labs/sealed-secrets
日期: 2026-06-01
分类: DevOps / Kubernetes
难度: 中级
---

## 是什么

Sealed Secrets 是 Bitnami 2017 年开源的一个 Kubernetes 控制器，专门解决一件事：**让你能把数据库密码、API key 这类敏感配置，用加密形式安全地提交进 Git 仓库**。

日常类比：

- **K8s 原生 Secret** 像把存折写在明信片上——它只是 base64 编码，不是加密，谁拿到 yaml 都能 base64 -d 看明文。
- **Sealed Secrets** 像给明信片套一个**只能在你家信箱里打开的保险盒**。你（开发者）有保险盒和盒外公钥，加密后随便丢；只有家里那把私钥（在集群里）能打开。

GitHub 约 7.7k stars（Bitnami Labs 维护）。是 GitOps 工作流（ArgoCD / Flux）里**常见的**集群内 Secret 加密方案之一（另两条常见路线是 SOPS、External Secrets）。

## 为什么重要

不理解 Sealed Secrets，下面这些事都没法解释：

- **为什么 GitOps 一直绕不开 Secret 这道坎**——把 Deployment / Service / ConfigMap 全提进 Git 没问题，唯独 Secret 不能，否则等于公开密码
- **为什么 K8s 的 Secret 不算"加密"**——它只是 base64，etcd 默认还是明文存。审计常踩这个坑
- **为什么 ArgoCD 文档里反复提 sealed-secrets / SOPS / External Secrets 三选一**——这是 GitOps 三种应对路线
- **为什么"备份私钥"这件事在生产环境是高危项**——丢了私钥，整个集群历史上所有 SealedSecret 都解不开

## 核心要点

Sealed Secrets 的设计可以拆成 **一对密钥 + 一个 CRD + 一个 CLI**：

1. **非对称密钥对**：controller 启动时在集群里自动生成 RSA-4096 密钥对。**私钥**作为一个普通 Secret 存在 controller 所在 namespace（默认 kube-system），打了 `sealedsecrets.bitnami.com/sealing-key=active` 标签。**公钥**可以随便给所有人。

2. **SealedSecret CRD**：加密后的 Secret 长成这样的自定义资源。yaml 里只剩密文，谁都能看，但只有持有私钥的 controller 能解开。

3. **kubeseal CLI**：开发者本地装的命令行工具，输入一份普通 Secret yaml + 公钥，输出一份 SealedSecret yaml。这份输出可以直接 git commit。

核心循环：开发者 `kubeseal < secret.yaml > sealed.yaml` → 提交 Git → ArgoCD/Flux apply 到集群 → controller watch 到新 SealedSecret → 用私钥解密 → 创建对应的普通 Secret → 业务 Pod 正常挂载。

## 实践案例

### 案例 1：装 controller + 拿公钥

```bash
# 装 controller（一条命令）
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.27.0/controller.yaml

# 装 kubeseal CLI（macOS）
brew install kubeseal

# 把公钥导出来（之后每次加密都用它）
kubeseal --fetch-cert > pub-cert.pem
```

公钥 `pub-cert.pem` 可以**提交进 Git**，不是机密。团队成员拿这一份公钥就能各自加密。

### 案例 2：把一个 Secret 封起来提交

普通 Secret（**绝不能进 Git**）：

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-password
  namespace: prod
type: Opaque
stringData:
  password: hunter2
```

封起来：

```bash
kubeseal --cert pub-cert.pem -o yaml < secret.yaml > sealed.yaml
```

输出 `sealed.yaml`（**可以**进 Git）：

```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: db-password
  namespace: prod
spec:
  encryptedData:
    password: AgB7vQk...（一长串密文）
  template:
    metadata:
      name: db-password
      namespace: prod
    type: Opaque
```

集群里 controller 看到这个 SealedSecret，会自动解密生成同名的普通 Secret，业务 Pod 引用普通 Secret 即可。

### 案例 3：三种 scope 怎么选

`kubeseal --scope` 控制密文绑定到什么粒度：

- **strict**（默认）：密文绑定 `namespace + name`，改名或换 ns 都解不开
- **namespace-wide**：密文绑定 namespace，可在该 ns 内随便改名
- **cluster-wide**：任意 ns 任意 name 都能解（**安全风险最大**）

默认 strict 挡住一类攻击：攻击者偷到 SealedSecret yaml 后想"copy 到自己 ns 解密查看"——解不开。

## 踩过的坑

1. **私钥丢了=全部历史 Secret 解不开**：controller 私钥在 kube-system 里只是个普通 Secret，集群重建后没了就全废。**必须**用 `kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealing-key=active -o yaml > master.yaml` 备份到离线保险柜。

2. **K8s 原生 Secret 不是加密**：很多新人以为提交 Secret 进 Git 没事——base64 -d 一眼就看明文。这是 sealed-secrets 存在的根本理由。

3. **私钥每 30 天自动轮换**：controller 默认每月生成新密钥对，旧的保留只用于解密历史 SealedSecret。这意味着**旧密文的解密能力随时间累积**——不能说"轮换 = 旧密文失效"。

4. **kubeseal 必须连得上集群**（或拿到公钥）：CI/CD 流水线里加密时，要么把公钥 commit 进仓库、要么给流水线开 `--fetch-cert` 权限，否则跑不动。

## 适用 vs 不适用场景

**适用**：

- GitOps 工作流（ArgoCD / Flux）——密文进 Git，是最自然的补丁之一
- 中小团队、没有专职安全运维——比自建 Vault 轻一个数量级
- 内网集群、Secret 数量 < 几百条——私钥可按集群重建节奏离线备份（建议每次轮换后立刻备份）
- 开发/测试集群——快速起一套带密码的环境

**不适用**：

- **极高安全场景**（金融核心 / 政府）——私钥泄露=全部泄露，建议上 HSM / Vault
- 跨集群共享同一份 Secret——SealedSecret 绑定单集群私钥，跨集群要重新加密
- 需要细粒度审计"谁取了哪个 Secret"——不记访问日志，要 External Secrets + Vault
- Secret 频繁轮换（每天换）——每次都要重新 `kubeseal` + 提 PR，流程重

## 与同类方案对比

| 方案 | 密钥存哪 | GitOps 友好 | 复杂度 |
|------|---------|------------|--------|
| **Sealed Secrets** | 集群里私钥 | 是（密文进 Git） | 低 |
| **SOPS + age/PGP** | 本地 / KMS | 是 | 中 |
| **External Secrets Operator** | 外部 Vault / AWS SM | 部分（只存引用） | 中 |
| **HashiCorp Vault** | 独立服务 | 否（Vault 自管） | 高 |

经验法则：**没有现成 Vault 的团队，从 Sealed Secrets 起步**；规模上来再考虑 External Secrets + Vault。

## 学到什么

1. **base64 不是加密**——这条在 K8s 圈被反复强调，sealed-secrets 是最直接的回应
2. **GitOps 的核心矛盾**：一切声明式进 Git vs Secret 不能进 Git——sealed-secrets 用"非对称加密"四两拨千斤
3. **公钥可以公开、私钥决定一切**——非对称加密这个 1976 年的数学发明，到 2017 年才在 K8s 里以这种最朴素的形式落地
4. **运维责任的转移**：以前是"运维手填 kubectl create secret"，现在是"开发者本地 kubeseal 提 PR"——Secret 终于和代码同生命周期

## 延伸阅读

- 官方仓库：[bitnami-labs/sealed-secrets](https://github.com/bitnami-labs/sealed-secrets)
- ArgoCD 集成实践：[ArgoCD Secret Management 对比文档](https://argo-cd.readthedocs.io/en/stable/operator-manual/secret-management/)
- [[kubernetes]] —— sealed-secrets 是 K8s controller 的典型样板
- [[argocd]] —— GitOps 主流落地，常和 sealed-secrets 配套
- [[cert-manager]] —— 同类"K8s 自动化机器人"模式

## 关联

- [[kubernetes]] —— sealed-secrets 是 K8s 上的 controller，离不开 K8s 编程模型
- [[argocd]] —— GitOps 流水线把 Git 当真理之源，sealed-secrets 解决其中 Secret 子问题
- [[cert-manager]] —— 同样是 controller + CRD 模式，一个管证书、一个管密钥
- [[kubebuilder]] —— sealed-secrets 这类自定义 controller 的脚手架工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[cert-manager]] —— cert-manager — K8s 自动签发与续期 TLS 证书
- [[kubebuilder]] —— Kubebuilder — 写 K8s Operator 的官方脚手架
- [[kubernetes]] —— Kubernetes — 容器编排平台


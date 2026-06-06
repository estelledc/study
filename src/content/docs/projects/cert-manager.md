---
title: cert-manager — K8s 自动签发与续期 TLS 证书
来源: https://github.com/cert-manager/cert-manager
日期: 2026-06-01
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

cert-manager 是 Kubernetes 上的一个**证书签发与续期机器人**——你写一份 yaml 说"我要一张 example.com 的 TLS 证书"，它自己去 Let's Encrypt（或 Vault / 自建 CA）申请、验证域名、把证书塞进 Secret、过期前自动续。

日常类比：

- **以前管证书**像每年手动去车管所续车牌：到期前一周邮件提醒，没人盯就过期，网站突然挂。
- **cert-manager** 像装了 ETC 自动续：你只声明"我要一张 example.com 的牌"，到期它自己去办，办完贴回车上。

由 Jetstack（被 Venafi 收购，后归 CyberArk）2017 年开源，2020 年捐给 CNCF，2024 年毕业。是 Kubernetes 生态里**事实标准**的证书自动化方案。

## 为什么重要

不理解 cert-manager，下面这些事都不好解释：

- **HTTPS 证书续期为什么不用人管**——Ingress / Gateway 上挂的证书，集群里没人去申请、没人去续，但浏览器一直绿锁
- **Let's Encrypt 90 天有效期怎么活下来**——LE 故意把有效期压到 90 天逼大家自动化，cert-manager 是 K8s 这边的答案
- **零信任网络里 mTLS 怎么落地**——服务网格（Istio / Linkerd）每个 Pod 一张证书，靠 cert-manager + 内部 CA 批量签
- **多 issuer 怎么统一抽象**——公网用 ACME、内网用 Vault、测试用 self-signed，cert-manager 用同一套 CRD 屏蔽差异

## 核心要点

cert-manager 的设计可以拆成 **四个 CRD + 一个核心循环**：

1. **Issuer / ClusterIssuer**：定义"证书从哪儿来"。Issuer 是命名空间级，ClusterIssuer 是集群级。同一个 ClusterIssuer 可以给所有 namespace 共用。

2. **Certificate**：定义"我要一张什么证书"——域名列表、有效期、密钥算法、放在哪个 Secret。这是用户主要写的对象。

3. **CertificateRequest**：低层对象，代表"一次具体的签发请求"。一般用户不直接写，由 Certificate 控制器自动产生。

4. **Order / Challenge**（仅 ACME）：ACME 协议特有——Order 是"一次申请单"，Challenge 是"域名验证挑战"（HTTP-01 / DNS-01 / TLS-ALPN-01）。

核心循环：用户写 Certificate → 控制器创建 CertificateRequest → 找到对应 Issuer → 走签发协议 → 拿回证书 → 写入 Secret → 到期前 1/3 时间自动重跑。

## 实践案例

### 案例 1：30 秒装 cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.0/cert-manager.yaml
```

一条命令装好三个 Pod：

- `cert-manager-controller`：核心调谐器，watch Certificate / Issuer
- `cert-manager-webhook`：admission webhook，校验 yaml 合法性
- `cert-manager-cainjector`：往别的 webhook 配置里注入 CA 证书的辅助进程

### 案例 2：用 Let's Encrypt 给一个域名签证书

先建 ClusterIssuer：

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: you@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

再在 Ingress 上加一行 annotation：

```yaml
metadata:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts: [example.com]
      secretName: example-com-tls
```

cert-manager 看到 annotation，自动建 Certificate → 找 ClusterIssuer → 走 HTTP-01 验证（在 ingress-nginx 上临时挂一个 `/.well-known/acme-challenge/...` 路径）→ 验证通过拿证书 → 写到 Secret `example-com-tls`。

### 案例 3：续期是怎么发生的

证书有效期 90 天时，cert-manager 默认在还剩 1/3 时间（也就是 60 天到期前 30 天）触发续期。续期时不删旧 Secret，是**原地更新**——挂在 Ingress / Gateway 上的引用不用改，TLS 终端进程下次握手时就拿到新证书。

如果续期失败（DNS 改了、ACME 限流），cert-manager 会指数退避重试，并把状态写到 Certificate 的 `status.conditions`，搭配 Prometheus 指标 `certmanager_certificate_expiration_timestamp_seconds` 接告警。

## 踩过的坑

1. **HTTP-01 验证要求公网能访问 80 端口**——内网集群（VPC 私网、企业内部）用不了 HTTP-01，必须改 DNS-01（在 DNS 服务商加 TXT 记录验证）。新人常在第一步就卡住。

2. **DNS-01 验证需要 DNS 服务商凭证**——cert-manager 支持 Cloudflare / Route53 / GCP DNS 等十几家。需要提前建 ServiceAccount 或 API Token Secret，并在 ClusterIssuer 的 `solvers.dns01` 段引用，配置错就一直 pending。

3. **ACME 限流容易踩**——Let's Encrypt 对每个注册域名每周 50 张证书。staging 环境频繁重建集群、反复签同一个域名，很快撞上限。先用 `acme-staging-v02.api.letsencrypt.org` 调通再切 prod。

4. **ClusterIssuer 不能跨 namespace 引用 Secret**——给 ClusterIssuer 配 DNS-01 的 API Token 时，Secret 必须放在 cert-manager 自己所在的 namespace（默认 `cert-manager`），写在别的 namespace 找不到。

5. **CRD 升级要小心**——v1alpha → v1 的迁移踩过用户。升级前必须读 release notes 的 "Upgrading" 段，主版本跨多个之间可能要先升中间版本。

## 适用 vs 不适用场景

**适用**：

- Kubernetes 集群里所有 TLS 证书自动化（Ingress / Gateway / mTLS / webhook）
- 服务网格 mTLS 大批量签发（Istio 早期就用 cert-manager，后来内置了，但很多配置仍可对接）
- 多 issuer 混合（公网 ACME + 内网 Vault + 自签 CA）
- 证书审计——每张证书在 etcd 里有完整 yaml，谁在什么时候为哪个域名要的有记录

**不适用**：

- 非 Kubernetes 环境（裸机服务器、VM）→ 用 certbot / acme.sh
- 客户端证书 / 短期访问令牌（< 1 小时）→ 用 SPIFFE / SPIRE 更合适
- 商业 EV / OV 证书（需要人工身份验证）→ cert-manager 只能拿自动签发的 DV

## 历史小故事（可跳过）

- **2017 年**：Jetstack 工程师 James Munnelly 写了 cert-manager 的前身 kube-lego，专门接 Let's Encrypt
- **2018 年**：重写为 cert-manager，抽象出 Issuer / Certificate CRD，支持 ACME 之外的多种来源
- **2020 年**：捐给 CNCF 进入 sandbox
- **2024 年**：CNCF 毕业（graduated），与 Argo CD / Envoy 同级
- 之间 Jetstack 被 Venafi 收购，Venafi 又被 CyberArk 收购，但项目独立运营，治理在 CNCF 框架下

## 学到什么

1. **声明式 + 控制器 = 自动化的标准范式**——cert-manager 是把"年度续证"这件事用 K8s 控制器模式重新写一遍的样本
2. **CRD 分层很关键**——用户写 Certificate（高层），系统内部用 CertificateRequest / Order / Challenge（低层），分层让用户体验和实现解耦
3. **多 issuer 抽象 = 屏蔽协议差异**——ACME / Vault / 自签 CA 协议完全不同，cert-manager 用 Issuer interface 统一
4. **续期半衰点设计**——剩 1/3 有效期触发续期是经验值，太早浪费请求，太晚一旦失败没回旋余地

## 延伸阅读

- 官方文档：[cert-manager.io](https://cert-manager.io/docs/)（结构清晰，从 install 到 troubleshooting 一站式）
- 源码：[github.com/cert-manager/cert-manager](https://github.com/cert-manager/cert-manager)（Go 写的控制器，看 `pkg/controller/certificates` 是入口）
- ACME 协议本身：[RFC 8555](https://www.rfc-editor.org/rfc/rfc8555)（90 页，但读 §7 就够理解 cert-manager 在做什么）
- [[argocd]] —— 同样 CNCF 毕业的 K8s 工具，搭配 cert-manager 完成"GitOps + 证书自动化"
- [[ansible]] —— 早期裸机时代的"自动化"代表，对照看会更理解 K8s 控制器范式的优势

## 关联

- [[argocd]] —— 一起组成 K8s 平台层"声明式 + 自动化"两件套
- [[ansible]] —— 命令式自动化的代表，与 cert-manager 的声明式形成对照
- [[hindley-milner]] —— 都体现"声明意图，让系统自己推导细节"的设计哲学（一个推类型、一个推证书状态）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[chaos-mesh]] —— Chaos Mesh — K8s 原生混沌工程平台
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[sealed-secrets]] —— Sealed Secrets — 把加密后的 Secret 安全提交到 Git
- [[velero]] —— Velero — Kubernetes 集群备份与迁移


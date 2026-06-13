---
title: Sigstore — 让每个人都能给软件「盖公证章」
来源: https://www.usenix.org/conference/usenixsecurity22/presentation/newman
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
难度: 入门
provenance: pipeline-v3
---

## 是什么

**Sigstore** 是一套开源的**软件供应链签名与验签**基础设施。论文 *Sigstore: Software Signing for Everybody*（Zachary Newman、John Speed Meyers、Santiago Torres-Arias，2022）提出：把「给软件盖数字公章」从少数大厂的特权，变成**任何开源维护者都能用、任何下载者都能查**的公共服务。论文同期亦发表于 ACM CCS 2022（[DOI 10.1145/3548606.3560596](https://dl.acm.org/doi/10.1145/3548606.3560596)）；本笔记以 USENIX Security 22 公开材料为入口。

官方入口：[USENIX Security 22 演讲页](https://www.usenix.org/conference/usenixsecurity22/presentation/newman)；项目由 **Linux Foundation / OpenSSF** 托管，工具链见 [Sigstore 文档](https://docs.sigstore.dev/about/overview/)。

日常类比：

> 传统软件签名像**自己刻一枚钢印**：你要买刻章机（生成 RSA 私钥）、租保险柜（HSM / 密钥保管）、担心印章被偷（密钥泄露）、还要告诉所有人「换新章了请认准」（密钥轮换与吊销）。很多开源作者干脆不盖章——结果下载者只能赌「这个 tarball 没被换过」。  
> **Sigstore** 像**公证处 + 公共账本**：你刷 GitHub / Google 身份证（OIDC）证明「我是 @alice」；公证处（Fulcio）当场发一张**只活 10 分钟的临时证书**，绑到你的临时公钥；你用这张证给 Docker 镜像盖一次章；账本（Rekor）把「谁、何时、给哪个文件哈希盖了章」**永久记一笔**；临时私钥立刻销毁。  
> 买家验货时不用认识 alice 的钢印长什么样，只要查账本：「这条记录存在、证书当时有效、哈希对得上」——就知道镜像确实来自 alice，且下载后没被篡改。

一句话：**Sigstore = 身份（OIDC）+ 短期证书（Fulcio）+ 透明日志（Rekor）+ 客户端（Cosign 等）**，把传统代码签名的密钥管理难题换成「用现有账号签名、用公开日志验签」。

## 为什么重要

不理解 Sigstore，下面这些事都讲不清：

- 为什么 [[log4shell-cve-2021-44228]] 之后业界猛推 **SBOM + 签名**——你甚至不知道依赖里藏了 Log4j，更不知道谁编译了这份 JAR
- 为什么 **Kubernetes、Distroless、GitHub Actions** 生态默认开始 `cosign sign`——论文发表时已有 **220 万+** 条签名记录
- 为什么容器镜像可以 **`cosign verify --certificate-identity=...`** 而不分发长期公钥
- 为什么 **SLSA、in-toto、Guac** 等供应链框架常把 Sigstore 当作「签名层」
- 为什么「keyless signing」不是不要密钥，而是**密钥只活一次、身份绑在 OIDC 上**

传统签名的三座大山（论文原文强调）：

| 痛点 | 传统做法 | Sigstore 思路 |
|------|----------|---------------|
| **身份** | 证书里 CN=公司名，难映射到 GitHub 账号 | OIDC token 把 `alice@github` 写进短期证书 |
| **密钥管理** | 长期私钥进 HSM、轮换、备份 | **临时密钥**：内存生成，签完即弃 |
| **吊销 / 信任** | CRL、OCSP、用户手动更新根证书 | **Rekor 透明日志** + **TUF 根信任**；身份主人可监控日志是否被盗用 |

## 核心概念

### 1. 软件供应链与「签名在防什么」

**软件供应链攻击**：攻击者不直接打你的服务器，而是污染**上游**——构建系统、发布站点、包名 typosquat、CI 密钥泄露（SolarWinds、XCodeGhost 等）。**数字签名**回答两个问题：

1. **谁**发布了这份比特流？（authenticity / 身份）
2. 从签名到现在，内容有没有被改？（integrity / 完整性）

Sigstore 针对的是：**开源与中小企业**里签名 adoption 极低——不是不懂 RSA，而是**管不起密钥**。

### 2. 三大机制（论文核心贡献）

论文把 Sigstore 拆成三条可独立理解的设计：

**（1）OIDC 身份绑定（类似 ACME 思路）**

- 签名前，客户端（如 Cosign）打开浏览器或 CI 工作流，向 **OpenID Connect** 身份提供商（GitHub、Google、Microsoft、GitLab Actions 等）证明「我是这个账号」。
- **Fulcio**（Sigstore 的 CA）验证 OIDC token，在**短期 X.509 证书**里写入身份声明（如 `https://github.com/alice`）。
- 含义：**签名关联的是你已经 daily 使用的账号**，不必再维护一套 PKI。

**（2）临时密钥（Ephemeral keys）**

- 每次签名在内存生成一对 RSA/EC 密钥；私钥**不落盘**，Sigstore 服务也**永远看不到私钥**。
- Fulcio 只把**公钥**绑进证书；证书有效期通常 **~10 分钟**。
- 签完 artifact 后私钥丢弃——**没有长期密钥可偷**，也没有「丢 U 盘丢签名能力」的问题。

**（3）透明日志 Rekor**

- 签名事件（artifact 摘要、公钥/证书、签名、时间戳）写入 **Rekor**——**只追加、不可改**的 Merkle 树日志（Certificate Transparency 思路在软件签名上的应用）。
- 任何人可审计；**身份主人**应定期查日志：「有没有人用我的 GitHub 身份签了我不认识的包？」
- 验签时对比 Rekor 条目，确认签名发生在证书有效期内。

### 3. 组件地图

```text
开发者 / CI
    │
    ▼
 Cosign（或 Gitsign、policy-controller）
    │  ① 生成临时密钥对
    │  ② OIDC 登录 ──────────────► GitHub / Google / …
    │  ③ CSR + OIDC token ───────► Fulcio（发短期证书）
    │  ④ 对 artifact 签名
    │  ⑤ 上传签名元数据 ─────────► Rekor（透明日志）
    │  ⑥ 签名存 OCI registry / Git / blob
    ▼
消费者
    cosign verify（查 TUF 根、验证书、验 Rekor、比 digest）
```

| 组件 | 角色 |
|------|------|
| **Cosign** | 签/验容器镜像、二进制、SBOM、普通 blob；签名可存 OCI 注解 |
| **Fulcio** | 免费根 CA，把 OIDC 身份绑到临时公钥 |
| **Rekor** | 签名事件透明日志，可搜索、可密码学验证整棵 Merkle 树 |
| **Gitsign** | 用 Sigstore 流程签 Git commit（替代 GPG 长期密钥） |
| **policy-controller** | Kubernetes 准入：只允许验签通过的镜像运行 |
| **TUF** | 分发 Sigstore **信任根**（Fulcio 根证书等），防根被掉包 |

### 4. Keyless 签名的完整时序

```text
1. cosign sign ghcr.io/org/app:v1
2. 浏览器 OAuth → 拿到 OIDC id_token（含 sub / email / issuer）
3. 客户端生成 ephemeral keypair
4. Fulcio: 验证 token → 签发 cert（SAN 含 identity）
5. 计算镜像 digest → 用 ephemeral 私钥签名
6. 将 {digest, sig, cert, timestamp} 写入 Rekor
7. 私钥销毁；cert 过期；验签靠 Rekor + 当时有效的 cert 链
```

**「Keyless」** 指的是**用户不管理长期 signing key**；验签侧用的是**日志里见证过的证书 + 签名**，不是事先交换的 PGP 公钥环。

### 5. 验证时在验什么

Cosign 验证（简化）会做：

1. 用 **Sigstore TUF 根** 验证 Fulcio 证书链合法；
2. 检查证书中的 **identity / issuer** 是否匹配策略（如必须是 `https://github.com/myorg/*`）；
3. 验证签名与 artifact **digest** 一致；
4. 查 **Rekor** 证明该签名事件被日志「见证」，且时间戳在 cert 有效期内。

任一步失败都应拒绝部署——**默认拒绝未签名或身份不符的镜像** 是供应链 hardening 的终点。

### 6. 与 SLSA / in-toto 的关系

- **Sigstore** 解决「**谁签了这份文件**」与「**签名可审计**」。
- **in-toto** 描述多步构建的**布局与 link 元数据**；Cosign 可签 in-toto attestation。
- **SLSA** 定义构建完整性级别（L1–L3）；GitHub Actions + Sigstore 是常见 L2/L3 组合。

三者叠在一起：**SLSA 规定构建怎么可信，in-toto 记录步骤，Sigstore 给最终 artifact 绑身份**。

## 代码示例

### 示例 1：本地 keyless 签容器并验签

安装 [Cosign](https://docs.sigstore.dev/cosign/system_config/install/) 后：

```bash
# 假设已 docker push ghcr.io/myorg/api:v1.0.0

# 签名：会打开浏览器用 GitHub/Google 登录（OIDC）
export COSIGN_EXPERIMENTAL=1   # 早期 keyless 需此变量；新版 cosign 2.x 已默认可 keyless
cosign sign ghcr.io/myorg/api:v1.0.0

# 查看挂在镜像上的签名（存在 OCI registry 的 cosign 层）
cosign tree ghcr.io/myorg/api:v1.0.0
```

验签（消费者侧）——**只信任特定 GitHub org 下的 workflow 或用户**：

```bash
# 验证：证书 identity 必须是该 repo 的 GitHub Actions
cosign verify ghcr.io/myorg/api:v1.0.0 \
  --certificate-identity-regexp='https://github.com/myorg/api/.*' \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com

# 或验证人类维护者
cosign verify ghcr.io/myorg/api:v1.0.0 \
  --certificate-identity=https://github.com/alice \
  --certificate-oidc-issuer=https://github.com/login/oauth
```

输出应包含 `Verified OK` 与 Rekor 日志索引；失败时**不要** `--insecure-ignore-tlog` 上生产。

### 示例 2：GitHub Actions CI 里自动签名（无浏览器）

CI 用 **OIDC federation**，无需长期密钥进 GitHub Secrets：

```yaml
# .github/workflows/release.yml（节选）
permissions:
  id-token: write   # 允许向 GitHub OIDC 换 token
  contents: read
  packages: write

jobs:
  sign-image:
    runs-on: ubuntu-latest
    steps:
      - uses: sigstore/cosign-installer@v3

      - name: Build and push
        run: |
          docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Sign with Sigstore keyless
        env:
          DIGEST: ${{ steps.build.outputs.digest }}
        run: |
          cosign sign --yes "ghcr.io/${{ github.repository }}@${DIGEST}"
          # GitHub Actions 的 OIDC identity 会自动写入 Fulcio 证书
```

集群侧用 **policy-controller**（或 Kyverno cosign 规则）拒绝未验签镜像：

```yaml
# 概念：ClusterImagePolicy 片段（Sigstore Policy Controller）
apiVersion: policy.sigstore.dev/v1beta1
kind: ClusterImagePolicy
metadata:
  name: require-signed-from-myorg
spec:
  images:
    - glob: "ghcr.io/myorg/**"
  authorities:
    - keyless:
        url: https://fulcio.sigstore.dev
        identities:
          - issuer: https://token.actions.githubusercontent.com
            subject: "https://github.com/myorg/*"
```

### 示例 3：签普通文件 / SBOM（blob）

容器之外，同一套流程可签 release tarball 或 SPDX：

```bash
# 对本地文件签名（keyless）
cosign sign-blob --yes release.tar.gz --output-signature release.sig \
  --output-certificate release.crt

# 验 blob
cosign verify-blob release.tar.gz \
  --signature release.sig \
  --certificate release.crt \
  --certificate-identity=https://github.com/alice \
  --certificate-oidc-issuer=https://github.com/login/oauth
```

## 实践案例

### 案例 1：Distroless 与 Kubernetes 生态

Google **Distroless** 基础镜像、**Kubernetes** 发布工件等已广泛采用 Sigstore 签名。运维在拉镜像前跑 `cosign verify`，比「只信 docker hub 官方标」多一层**密码学 + 公开日志**保障。

### 案例 2：对比传统 GPG 签 Git tag

维护者过去：`gpg --detach-sign` + 把公钥贴网站；用户：`gpg --verify` + 手动导入 keyring。**Gitsign** 把 commit/tag 签名接到 Fulcio/Rekor，身份即 GitHub 账号，降低「我信的是 key 还是人」的混淆。

### 案例 3：发现身份盗用

alice 订阅 Rekor 监控或定期：

```bash
rekor-cli search --email alice@users.noreply.github.com
# 或按 identity URL 搜索
```

若出现从未发布的 `ghcr.io/evil/alice-backdoor` 签名，说明 OIDC 或 CI 配置泄露——**透明日志的价值在「可发现滥用」**，而不只是验真。

## 踩过的坑

1. **把 keyless 理解成「无 crypto」**：仍有临时密钥，只是生命周期极短。
2. **验签不写 identity 约束**：只验「有人签过」不验「对的人签过」——等于没验。
3. **生产环境忽略 Rekor（tlog）**：离线攻击或重放可能绕过；应用默认查 tlog。
4. **OIDC issuer 填错**：GitHub 用户 vs GitHub Actions 的 issuer URL **不同**，策略写错会全拒或全过。
5. **私有 registry 未配 cosign attach**：签名在 OCI 注解层；换 tag 要记得验 **digest** 而非仅 tag 名。

## 适用 vs 不适用

**适用**：

- 容器 / Helm / OCI artifact 发布流水线
- 开源项目希望用户能**独立验证** release 而非只信 HTTPS
- 与 SBOM、SLSA 合规一并建设

**不适用**：

- 需要**法律级**长期证书与硬件 token 的场景（仍用传统 PKI / EV 代码签名）
- 完全 air-gap、无法访问 Fulcio/Rekor 的环境（需自建 Sigstore [stack](https://docs.sigstore.dev/about/overview/) 或回退长期密钥）
- 只签「内部二进制、从不对外分发」且已有成熟 HSM 流程的企业——迁移成本需单独评估

## 学到什么

- **供应链安全**：攻击面在「构建与分发」，签名让篡改可检测。
- **身份 > 密钥**：Sigstore 把「谁签的」绑到 OIDC，比分发 PGP 公钥环更贴近现代开发。
- **透明日志**：CT 思想用于软件签名，使**事后审计与盗用发现**成为可能。
- 读论文可抓三句话：**OIDC 证明人、临时密钥减负担、Rekor 让签名可审计**。

## 延伸阅读

- 论文：Newman et al., *Sigstore: Software Signing for Everybody*, USENIX Security 2022
- [Sigstore 安全模型](https://docs.sigstore.dev/about/security/)
- [Cosign 签名概览](https://docs.sigstore.dev/cosign/signing/overview/)
- [[log4shell-cve-2021-44228]] —— 供应链危机如何推动签名普及
- [[rsa]] —— 传统公钥签名数学基础

## 关联

- [[log4shell-cve-2021-44228]] —— 软件供应链漏洞与 SBOM/签名动机
- [[rsa]] —— 数字签名密码学基础
- [[sgx-2013]] —— 另一条「可信计算 / 证明来源」路线（TEE vs 透明日志）

## 维护备注

- 分类脚本：`node scripts/classify-notes.mjs --apply --area=papers`
- Sigstore 工具与 TUF 根会版本迭代；生产以 [官方安装文档](https://docs.sigstore.dev/) 为准。

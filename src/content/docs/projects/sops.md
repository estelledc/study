---
title: SOPS — 让密码也能放心进 Git
来源: https://github.com/getsops/sops
日期: 2026-06-01
分类: DevOps / 配置加密
难度: 中级
---

## 是什么

SOPS（Secrets OPerationS）是一把**专门给配置文件里"敏感字段"上锁的工具**。Mozilla 安全团队 2015 年启动并开源，2023 年 5 月进 CNCF Sandbox。

日常类比：你有一份 YAML 配置，里面 90% 是端口号、超时时间这种"全公司随便看"的字段，10% 是数据库密码、API key 这种"看一眼都不行"的字段。直接丢进 Git 不安全，整文件加密又看不到改了什么。SOPS 的答案是——**把每一个敏感 value 单独锁起来，key 明文留着**。这样：

- `database_password: hunter2` 进 Git 之前变成 `database_password: ENC[AES256_GCM,data:xxx...]`
- `git diff` 还能告诉你"今天改了 database_password 这一行"
- 只有部署机器用对应 KMS 解密权限才能拿到 `hunter2`

最小体验：

```bash
sops -e secrets.yaml > secrets.enc.yaml   # 加密一次
sops secrets.enc.yaml                     # 编辑：自动解密 → $EDITOR → 重新加密
sops -d secrets.enc.yaml                  # 部署时一次性解密到 stdout
```

## 为什么重要

不用 SOPS，团队管密钥通常陷入两条死路：

1. **`.env` 文件不进 Git**：靠 Slack / 飞书 / 1Password 互发，新人入职第一天总有人忘传，漂移到处都是
2. **跑一个 Vault server**：HashiCorp Vault 强是强，但你要为它额外维护一台 HA 服务、做备份、做权限审计——小团队扛不动

SOPS 走第三条路：**加密文件就是 Git 一等公民**。文件躺在仓库里，配置漂移这件事被 Git 历史天然消除；部署机器只要有一把 KMS key 就能解。Kubernetes 生态里 [[helm]] Secrets、kustomize-sops、Flux 的 SOPS controller，全都基于这个思路。

## 核心要点

SOPS 的内部设计可以拆三层：

1. **数据密钥 DEK**：每个文件生成一把全新的对称密钥（AES-256-GCM）。所有敏感 value 用这把 DEK 加密。

2. **密钥包装**：DEK 自己再被每个 recipient（KMS key / age 公钥 / PGP 公钥）各加密一次，结果存在文件末尾的 `sops` 段里。一个文件可以同时被多人多机器解——只要其中任意一个 recipient 的私钥到位。

3. **路径规则 `.sops.yaml`**：仓库根的配置文件告诉 SOPS"哪类路径加密哪些字段、用哪些 recipient"。例如：

```yaml
creation_rules:
  - path_regex: secrets/prod/.*\.yaml$
    encrypted_regex: ^(password|secret|key|token)$
    kms: arn:aws:kms:us-east-1:123:key/abc
  - path_regex: secrets/dev/.*\.yaml$
    age: age1xxx...
```

`encrypted_regex` 决定**只加密 key 名匹配的字段**——这就是为什么 git diff 还能用。

支持的 backend：AWS KMS（最早最完整）/ GCP KMS / Azure Key Vault / HashiCorp Vault transit / age / PGP。

## 实践案例

### 案例 1：用 age 在小团队里起步

age（X25519 + ChaCha20-Poly1305）是现代 PGP 替代品，比 GnuPG 好用百倍。最小流程：

```bash
age-keygen -o key.txt                    # 生成私钥；公钥打印在 stdout
# .sops.yaml：
# creation_rules:
#   - path_regex: secrets/.*\.yaml$
#     age: age1xxxxxxxx                  # 填上一步公钥
sops -e -i secrets.yaml                  # 按规则原地加密
git add secrets.yaml && git commit       # 大胆提交
SOPS_AGE_KEY_FILE=key.txt sops -d secrets.yaml   # 部署机解密
```

零服务、零运维：私钥只放部署机 / CI secret，仓库里只有密文。

### 案例 2：和 Kubernetes 配合（Flux GitOps）

1. 本地：`sops -e -i k8s/secret.yaml`，确认 value 已是 `ENC[AES256_GCM,...]`
2. `git push`；Flux 拉到集群，识别 SOPS 格式
3. controller 用预先注入的 age 私钥或 KMS 权限解密
4. 明文 Secret 写入 etcd，Pod 用 `secretKeyRef` 挂载

密钥材料不进 Git；仓库里仍是完整、可 diff 的声明式清单。

### 案例 3：和 Terraform / Helm 串起来

```hcl
# Terraform：plan/apply 时自动解密（carlpett/terraform-provider-sops）
data "sops_file" "secrets" { source_file = "secrets.enc.yaml" }
# 取值：data.sops_file.secrets.data["db_password"]
```

Helm 侧用 `jkroepke/helm-secrets`：`helm secrets install ... -f secrets.enc.yaml`，插件内部调 `sops -d` 再注入 values。整条链路不用手敲解密。

## 踩过的坑

1. **YAML key 重排导致 diff 噪声大**：SOPS 加密会按字母序重排 key，第一次加密可能让整个文件 diff 看起来"全改了"。用 `--mac-only-encrypted` 等 flag 可缓解。

2. **`.sops.yaml` 路径正则写错 = 静默不加密**：如果 `path_regex` 没匹配到，SOPS 不报错只是不加密，密文文件里其实是明文。每次新加路径**都要 `sops -e` 后人工 grep 一遍密文**确认 ENC 前缀。

3. **撤权救不了已泄露的 git 历史**：从 KMS 撤掉某人权限只防"未来读取"，那个人 fork 出去的旧仓库 + 旧 KMS 缓存依然能解。真泄露要走"轮换数据库密码本身"，不是只撤 KMS。

4. **age 私钥丢了 = 文件作废**：和 PGP 一样，私钥没备份等于密文成砖头。第一天就要把 age key 离线备份到至少两个介质。

5. **二进制大文件支持弱**：SOPS 二进制模式本质是 base64 包一层，几 MB 以上的二进制别用 SOPS，用 [[git-lfs]] + 单独 KMS 加密更合适。

## 适用 vs 不适用场景

**适用**：

- 配置文件里的密码 / API key / TLS 私钥需要进 Git
- GitOps 工作流（Flux / Argo CD）需要"密文也声明式"
- 小到中型团队不想运维 Vault server
- 多 cloud / 多 backend 混用——SOPS 一把工具覆盖 AWS / GCP / Azure

**不适用**：

- 动态密钥分发（短期 token、轮换 DB 凭证）→ 用 Vault dynamic secrets
- 大量二进制文件加密 → 走 git-lfs + 文件级加密
- 严格合规（FIPS 140-2 / 国密）场景 → 看 KMS 本身合规性，SOPS 只是壳
- 完全离线、无云 KMS、无 PGP 习惯 → age 可以，但要解决私钥分发

## 历史小故事（可跳过）

- **2015 年**：Mozilla 安全团队（Julien Vehent、Adrian Utrilla）启动 SOPS，服务内部 Firefox 相关密钥管理；早期代码量很小。
- **2019-2021 年**：陆续加 GCP / Azure / Vault / age 后端，DevOps 圈口口相传，事实上成了"配置加密"常见选项。
- **2023 年**：社区迁到 `getsops/sops` 接管维护；同年 5 月 17 日进入 CNCF Sandbox，治理正式社区化。

近十年从一个安全团队的内部工具走到 CNCF——典型的"小工具解决大问题"路径。

## 学到什么

1. **粒度选对，工具寿命长十倍**：value 级加密保留 key 明文这个选择，让 SOPS 同时满足"安全"和"可审计"两个看似矛盾的需求。
2. **DEK + 包装是密钥管理的通用模式**：从 LUKS 全盘加密到 AWS S3 server-side encryption，都是"一把短期对称 key 加密数据，再用长期非对称 key 包住短期 key"。SOPS 把这个模式用到了文件级。
3. **配置 = 代码 = 密钥**：GitOps 的下一步是"密钥也声明式"，SOPS 是这个理念的关键拼图。
4. **不维护 server 是小团队的胜利**：选工具时多问一句"它要不要常驻进程"，能省下大量未来运维债。

## 延伸阅读

- 官方文档：[getsops.io](https://getsops.io/)
- age 加密：[age-encryption.org](https://age-encryption.org/)（Filippo Valsorda 设计的现代 PGP 替代）
- Flux SOPS：[fluxcd.io/flux/guides/mozilla-sops/](https://fluxcd.io/flux/guides/mozilla-sops/)
- 实战教学：[Mozilla SOPS - End-to-End encrypted secrets](https://www.youtube.com/results?search_query=mozilla+sops)
- [[ansible]] —— Ansible Vault 是另一种思路（整文件加密、单一 backend）
- [[helm]] —— Helm Secrets 插件背后就是 SOPS

## 关联

- [[ansible]] —— Ansible Vault 解决相似问题，但不支持 KMS / 多 recipient
- [[terraform]] —— terraform-provider-sops 让 plan 时自动解密
- [[kubernetes]] —— Flux / Argo CD 的 GitOps 密钥方案首选
- [[helm]] —— helm-secrets 插件直接调 SOPS
- [[aes]] —— SOPS value 加密用 AES-256-GCM
- [[git-lfs]] —— 大二进制场景的互补方案

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[age]] —— age — 把"用 GPG 加密一个文件"重新做对
- [[joplin]] —— Joplin — 开源 Evernote 替代

---
schema_version: 6
lens: security
lens_id: security
title: lens-security
domain: lens
version: 6
layer: app
status: active
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: 1-3 人小团队 SaaS / 工具站；1k-50k MAU；混合个人 0 预算 + 创业 ≤$200/月；威胁面=凭证泄露+依赖供应链+鉴权绕过+证书过期+bot；不含 HSM/FIPS
ring_summary: { adopt: 18, trial: 11, assess: 2, hold: 5 }
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
wikilinks: [jwt, oauth-2-1, vault, sops, age, lets-encrypt, cloudflare-waf, trivy, dependabot, argon2id, libsodium, webauthn, owasp-asvs, kms]
out_of_corpus: [doppler, 1password-connect, git-crypt, mkcert, step-ca, fail2ban, snyk, socket-dev, osv-scanner, renovate, cyclonedx, syft, vanta, drata, immudb, paseto, crowdsec]
provider_coverage_checklist:
  - SOPS+age（secret 入 git / 0 成本）
  - Vault（动态凭证+审计 / ≥10 人）
  - Doppler（SaaS / ≤5 用户免费）
  - LE + acme.sh（90 天续 + DNS-01）
  - CF WAF Free + Origin CA（边缘 TLS+DDoS）
  - Trivy + Dependabot + OSV-Scanner
  - argon2id（t=3 m=64MB p=4 OWASP 2024）
  - libsodium / age / KMS+信封
sources:
  - Vault / Doppler / SOPS+age / 1Password Connect
  - LE+ACME-v2 / acme.sh / mkcert / step-ca / CF Origin CA
  - CF WAF / AWS WAF / fail2ban / Turnstile
  - Trivy / Snyk / Dependabot / OSV / Socket.dev / Renovate
  - CycloneDX / Syft / OWASP ASVS / OWASP Password 2024
  - RFC 9106 argon2 / libsodium / AWS KMS / WebAuthn
open_questions:
  - PQ 加密 production-ready + TLS 1.3 hybrid X25519+ML-KEM-768 边缘兼容
  - WebAuthn/passkey 在中国大陆 Safari + 微信 WebView conditional UI
  - argon2id (t=3 m=64MB p=4) 在 Lambda/Workers CPU 预算缺基准
  - Snyk 替代 OSS 在私有库+License+auto-fix 三项是否补齐
---

## 候选表

verified 2026-05-31。layer 主=app；CF/AWS WAF+边缘 TLS=serving。

| 候选 | ring | 立场 | 触发 |
|---|---|---|---|
| SOPS+age | adopt | 入 git / 0 成本 | ≤3 人单仓 |
| Vault | adopt | 动态凭证+审计 | ≥10 人 |
| Doppler | trial | SaaS 一键 | 不愿运维 |
| .env | hold | 规模化崩 | 仅首发 |
| session+Redis | adopt | 撤销强 | 同源 web |
| JWT RS256 | trial | 跨服务+短 TTL | 移动+微服务 |
| OAuth 2.1+PKCE | adopt | Auth0/Clerk | 委托 |
| WebAuthn/passkey | trial | 二要素 | 高价值 |
| JWT HS256 | hold | 单密钥=全军 | 全栈同进程 |
| LE+acme.sh | adopt | 90 天续 | 自管 VPS |
| CF Origin CA | adopt | 零运维+15 年 | CF 代理 |
| AWS ACM | adopt | ALB 直挂 | AWS 锁 |
| 商业证书 | hold | 仅 EV | 客户要 |
| CF WAF Free | adopt | OWASP CRS | 默认 |
| AWS WAF | adopt | ALB 集成 | AWS 锁 |
| fail2ban | adopt | VPS 防爆破 | 单机 |
| nginx limit_req | adopt | 入口 rate-limit | 应用层 |
| Trivy | adopt | 容器+IaC+secret | OSS 默认 |
| Dependabot | adopt | GHSA+auto PR | 0 成本 |
| OSV-Scanner | adopt | 多语言 lockfile | 交叉验证 |
| Snyk | trial | 私有+License | 合规 |
| Socket.dev | trial | 恶意包检测 | 投毒 |
| Renovate | adopt | 分组+调度 | 升级 |
| SOC2-lite | adopt | ASVS L1 | ≤20 人 |
| Vanta | trial | $400/月 | ≥20 B2B |
| CloudTrail | adopt | S3 不可删 | AWS 锁 |
| immudb | assess | write-once | 用例窄 |
| libsodium | adopt | 高层 API | 默认 |
| age | adopt | SOPS 后端 | 比 PGP 易 |
| argon2id | adopt | t=3 m=64MB p=4 | 密码 hash |
| bcrypt | trial | cost=12 兜底 | a2 不可用 |
| KMS+信封 | adopt | DEK 缓存 5min | DB 字段 |

assess: PASETO。trial 余: CrowdSec / step-ca。hold: OpenSSL / scrypt / ModSecurity。

## ADR 索引

**ADR-1 SOPS+age vs Vault vs Doppler** (vendor-selection)

context: SOPS+age 加密 yaml 入 git+0 成本。Vault 中心+动态 DB 凭证+STS+审计；自托 ~1 人月。Doppler SaaS+免费 ≤5 用户、超 $7/user/月。

decision: 默认 SOPS+age（≤3 人+单仓+secret≤50）；≥10 人+动态凭证→Vault；2-10 人+不愿运维→Doppler；锁云→原厂 SM。

alternatives: 1Password Connect（仅团队已用）；git-crypt（被 SOPS 替代）。

consequences: SOPS review 走 PR+CI 5 行解密；rotation 手动。Vault HA+Raft+unseal。Doppler 出境合规需自审。回滚：SOPS→Vault 批量 import 半天。

**ADR-2 Trivy+Dependabot+OSV vs Snyk** (vendor-selection)

context: Trivy OSS+容器/依赖/IaC/secret/SBOM+CI<30s。Snyk 商业+私有+auto-fix；$25/dev/月+免费 200/月。Dependabot GHSA。OSV-Scanner Google 多语言。

decision: 默认 Trivy+Dependabot+OSV 三件套；客户要 SOC2 Type2+License+私有库→Snyk；加 Socket.dev。

alternatives: npm audit（信噪比差）；Grype+Syft（trial）。

consequences: 三件套 0 商业风险；License 需手动+无 auto-fix。Snyk fix-PR 自动+License 卡 GPL。监控：每周高危+修复中位<7 天。

**ADR-3 argon2id 时间成本参数化** (implementation-tuning)

context: OWASP 2024 三组：(t=2,m=19MB,p=1) 移动、(t=3,m=64MB,p=4) 桌面、(t=4,m=128MB,p=4) 高安全。RFC 9106 m≥64MB。

decision: time_cost=3, memory_cost=65536, parallelism=4, hash_length=32, salt_length=16, type=argon2id, version=0x13. serverless 调 (t=2,m=19MB,p=1)。

rationale: M2 Pro ~250ms / 云 vCPU ~500ms；登录 QPS 上限 ~2/vCPU；GPU 暴破 ~$50k/百万弱密码。

consequences: serverless 冷启 +500ms 触发 timeout：调小或拆专用 hash 服务。监控：登录 P95<800ms+CPU<70%。回滚：参数立即生效+lazy rehash on next login。坑：salt 不复用；pepper 存 KMS 不入 git。

**ADR-4 KMS 集中加解密路线** (architecture)

context: DB 字段三路：(A) KMS 集中：每次走 API。(B) 信封：KMS 签 DEK+本地 AES-GCM+缓存 5min。(C) Sidecar：Vault Agent。

decision: 默认信封 (B)（DEK LRU 1k+TTL 5min+AES-256-GCM）；高敏感（医疗/金融）→纯 KMS (A)；K8s 多服务→(C)。

consequences: (B) 月费 $1k→$10；DEK 内存 5min 风险，mlock+进程隔离。(A) RTT ~30ms+1M/天=$90/月。(C) 0 改代码+sidecar 50MB/pod。

rollback: 触发：DEK dump 风险升级 / KMS 月费过线。(A)↔(B) 改封装一处。

**ADR-5 TLS 证书 LE vs CF 边缘 vs ACM vs 商业** (vendor-selection)

context: LE+acme.sh 免费+90 天+wildcard DNS-01。CF 边缘+Origin CA 15 年 零运维+含 WAF/DDoS+中国不可达。ACM ALB 直挂+不可导出。商业 DigiCert EV+$200-2000/年。

decision: 默认 CF 边缘 TLS（用 CF 代理）；自管 VPS→LE+acme.sh+DNS-01；锁 AWS→ACM；客户写 EV→商业；中国大陆备案→国内云厂商免费 DV。

alternatives: certbot（Apache 老栈）；step-ca（内网 mTLS）。

consequences: CF 5min 接入+免费+自带 WAF/DDoS；流量过 CF 出境+origin 必锁 CF IP。LE 续签失败=站挂→监控 30/7/1 三档+DNS-01 token 最小权限到 _acme-challenge。监控：剩余天数+续签 cron+OCSP。

## 决策树

```
Q0 cost-gate：个人 + 0 预算 + 单仓 + ≤3 人？
  Y → 极简栈（SOPS+age + CF 边缘 TLS + CF WAF Free + Dependabot + Trivy + libsodium + argon2id + SOC2-lite）；Vault/Doppler/Snyk/Vanta 跳
  N → Q1
Q1 secret？≤50+git→SOPS+age（ADR-1）；动态→Vault；不愿运维→Doppler；云锁→原厂 SM
Q2 鉴权？同源→session+Redis；跨服务→JWT RS256（短 TTL+refresh+黑名单）；委托→OAuth 2.1+PKCE（Auth0/Clerk）；高价值→passkey
Q3 TLS？CF 代理→CF 边缘+Origin CA（ADR-5）；自管→LE+acme.sh；AWS→ACM；EV→商业
Q4 WAF？小团队→CF WAF Free+Turnstile+nginx limit_req；AWS→AWS WAF；VPS→fail2ban
Q5 漏洞？默认→Trivy+Dependabot+OSV（ADR-2）；SOC2 Type2→Snyk；加 Socket.dev
Q6 合规？≤20 人→SOC2-lite+ASVS L1；≥20 B2B→Vanta/Drata；AWS 必开 CloudTrail
Q7 hash？长驻→argon2id (t=3,m=64MB,p=4)（ADR-3）；serverless→(t=2,m=19MB,p=1)；a2 不可用→bcrypt cost=12
Q8 加密？默认→信封 KMS+DEK（ADR-4）；高敏感→纯 KMS；多服务→Vault Agent
```

## 外迁 excludes

- sources/security.md
- reading_list/security.md
- getting_started/security.md
- what_is_not/security.md

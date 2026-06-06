---
title: age — 把"用 GPG 加密一个文件"重新做对
来源: https://github.com/FiloSottile/age
日期: 2026-06-01
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

age 是一个**只做"加密一个文件"这一件事**的命令行工具。Filippo Valsorda（前 Google Go 安全负责人）2019 年开始写，2021 年发 v1.0。名字读作"啊给"（意大利语），全称 Actually Good Encryption。

日常类比：GPG 像一把瑞士军刀——能加密、能签名、能管钥匙环、能验邮件，配置选项几百个，新人三天看不完文档。age 像一把**只会切菜**的菜刀，刀面就一个尺寸：

```bash
age-keygen -o key.txt                          # 生成一对密钥
age -r age1ql3z7... -o secret.age secret.txt   # 用对方公钥加密
age -d -i key.txt secret.age > secret.txt      # 用自己私钥解密
```

整个工具的命令行只有三个动作：**生成密钥 / 加密 / 解密**。没有密钥环，没有信任网，没有撤销列表，没有签名子命令。仓库 17k star，MIT 许可，单二进制 5MB 出头。

## 为什么重要

不理解 age，下面这些事都没法解释：

- 为什么 SOPS（Mozilla 出的密钥管理工具）2021 年之后默认推荐 age 而不是 GPG
- 为什么 [[chezmoi]]（dotfiles 管理）把 GPG 列为"legacy"，把 age 列为推荐
- 为什么 Filippo 这种顶级密码学工程师宁愿从零写一个新格式，也不愿在 GPG 上修补
- 为什么"加密一个文件"这种 1991 年就被解决的问题，30 年后还能做出新东西

## 核心要点

age 的设计可以拆成 **三层**：

1. **格式极小**：文件头不到 1KB，纯文本，结构是 `age-encryption.org/v1` + recipients 列表 + payload。整个规范一页讲完，任何语言都能再写一份兼容实现（已经有 Rust 的 rage、Java 的 jage）。

2. **密码学选定**：身份对用 X25519（椭圆曲线 Diffie-Hellman），密钥包装用 ChaCha20-Poly1305 AEAD，密码模式用 scrypt。**没有算法选项**——你不能挑曲线、挑模式、挑哈希。这是有意的：每多一个选项就多一种用错的姿势。

3. **流式加密**：内部把大文件切成 64KB 块，每块独立 AEAD 标签，从 stdin 读、stdout 写就能加密 100GB 的备份，不需要先全装进内存。GPG 也能流式但默认不开。

三层加起来：**最小可读规范 + 最少可选项 + 最大可流式**。

文件头长这样（解过密就能直接 `cat` 看到）：

```
age-encryption.org/v1
-> X25519 SVrzdFZkenU4cXJ8rjbBy9wSxjoyB4XxXUz3M3dTjAY
TEControlBytes...
-> X25519 (第二个 recipient 的包装)
...
--- WrappedKeyAuthTag
[加密 payload 二进制]
```

每一个 `-> X25519 ...` 行就是一个 recipient——同一个 DEK 被 N 个公钥分别加密了 N 次。任何一个对应私钥都能解。

## 实践案例

### 案例 1：自己跟自己加密一个文件（备份场景）

```bash
$ age-keygen -o ~/.age/key.txt
Public key: age1lggyhqrw2nlhcxprm67z43rta597azn8gknawjehu9d9dl0jq3yqqvfafg

$ tar c ~/photos | age -r age1lggy... > photos.tar.age
$ age -d -i ~/.age/key.txt photos.tar.age | tar x
```

公钥放进 dotfiles 里也无所谓——它本来就是公开的。私钥 `key.txt` 是一行 ASCII，直接抄进密码管理器即可。

### 案例 2：直接用 SSH 公钥加密

age 支持把 SSH 公钥（Ed25519、RSA）当成 recipient：

```bash
$ age -R ~/.ssh/authorized_keys -o team.age plan.txt
```

意思是"凡是 authorized_keys 里列出的同事，谁都能用自己的 SSH 私钥解开这份文件"。**你不需要再单独建一套 PKI**——SSH 钥匙团队已经在用了。

### 案例 3：被 SOPS 当后端

```yaml
# .sops.yaml
creation_rules:
  - path_regex: secrets/.*\.yaml$
    age: age1lggy...,age1xy...    # 多收件人
```

SOPS 自己负责"YAML 里只加密 value、保留 key 明文"的逻辑，age 只负责"把 DEK 安全送给 N 个 recipient"。这种分工让 [[sops]] 的 GPG 后端 + 钥匙环复杂度全部消失。

## 踩过的坑

1. **私钥就一行文本，丢了无法找回**。age 没有 GPG 那种"撤销证书"机制——丢私钥 = 丢数据。第一次跑完 `age-keygen` 必须立刻把那一行 `AGE-SECRET-KEY-1...` 放进密码管理器或离线存储。

2. **age 不签名，只加密**。如果你需要"证明这份文件来自我"，age 不解决。Filippo 的态度是"签名是另一个工具的事"——他另写了 [minisign](https://jedisct1.github.io/minisign/) / signify 那一类。

3. **不兼容 GPG 任何东西**。`.gpg` 文件 age 读不了，反过来也一样。迁移就是"老文件用 gpg 解 → 用 age 重加密"，没有桥。

4. **passphrase 模式慢**。`age -p` 用 scrypt 拉伸密码，CPU 上要 1-2 秒。这是有意的（抗暴力破解），但脚本里循环加密大量文件会很难受——优先用公钥模式。

5. **macOS Keychain 集成靠插件**。社区有 age-plugin-yubikey（硬件钥匙）、age-plugin-tpm（TPM 2.0），但这些都是独立二进制，需要单独装。

## 适用 vs 不适用场景

**适用**：

- 备份家目录 / 照片 / 数据库 dump 到 S3 / 移动硬盘
- 团队配置仓库里的 secrets（搭配 [[sops]] / [[chezmoi]]）
- CI/CD 里给部署机器单独发密钥
- 需要"几行代码就能集成加密"的 Go 项目（直接 import filippo.io/age）

**不适用**：

- 邮件加密（age 没签名 / 没邮件地址绑定，仍然是 GPG 的地盘）
- 需要算法可调的合规场景（FIPS 限定 AES-GCM 时 age 用不上 ChaCha20）
- 已经全套 GPG 流程的老团队（迁移成本不一定值）

## 历史小故事（可跳过）

- **2015 年前后**：GPG 用户体验问题在密码学社区已经讨论了十年。Matthew Green、Filippo 等人多次在博客里说"为什么 PGP 还活着"。
- **2019 年**：Filippo 开始原型，定下三条原则：单二进制 / 单格式 / 不兼容 GPG。
- **2021 年 7 月**：v1.0 发布，规范冻结在 `age-encryption.org/v1`。同一时间 rage（Rust 实现）跟进发布。
- **2022 年**：[[sops]] 加 age 后端，FluxCD / [[chezmoi]] 跟进。两年内 age 成为云原生 secrets 工具链的事实选项。

## 学到什么

1. **少即是多在密码学里更绝对**——GPG 三十年的算法菜单里大半选项今天看是负债。age 把"选什么算法"这件事**完全从用户手里拿走**。
2. **格式可读 = 多实现可能**。age 的规范一页 PDF 读完，三年内出现了 5+ 个独立实现。GPG 几乎没人愿意再写一份。
3. **工具拆解比工具集成更现代**。"加密 + 签名 + 钥匙环 + 邮件"分开做，每个都做透；不是"一个工具搞定一切"。
4. **公钥可以放仓库**——这是新人最难接受的一点。所有 age recipient 公钥都可以进 Git，安全完全靠"私钥不离机"。

## 延伸阅读

- 官方主页：[age-encryption.org](https://age-encryption.org/) — 规范 + 实现列表
- Filippo 自述：[The age-encryption.org/v1 spec](https://words.filippo.io/dispatches/age-authentication/) — 为什么不签名
- Rust 实现 rage：[github.com/str4d/rage](https://github.com/str4d/rage) — 同格式、补足插件生态
- Soatok 评测：[The Limitations of Age](https://soatok.blog/2025/02/18/reviewing-the-cryptography-used-by-age/) — 学者视角的批评，列出 age 的妥协面

## 关联

- [[sops]] —— 把 age 当默认后端的 secrets 管理器
- [[chezmoi]] —— dotfiles 管理工具，用 age 加密含敏感信息的 dotfile
- [[aes]] —— age 的对称加密底层之一不是 AES，而是 ChaCha20-Poly1305；对照可见两条流派
- [[libsignal]] —— 同样 Filippo / Trevor Perrin 风格的"少选项 + 强默认"密码学库
- [[helm]] —— Kubernetes 生态里靠 sops + age 管 chart secrets

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[helm]] —— Helm — Kubernetes 包管理器
- [[libsignal]] —— libsignal — 端到端加密的 Rust 内核
- [[sops]] —— SOPS — 让密码也能放心进 Git


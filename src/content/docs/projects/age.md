---
title: age — 把"用 GPG 加密一个文件"重新做对
来源: https://github.com/FiloSottile/age
日期: 2026-06-01
分类: DevOps / 文件加密
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/FiloSottile/age
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b8564adb6d58329b8a3e267360ca2b0abc4efe1d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.3.1
---

## 是什么

age 是一份**文件加密格式、Go 库和命令行工具**。Filippo Valsorda 与 Ben Cartwright-Cox 设计，规范停在 `age-encryption.org/v1`。作者把名字读成带硬 g 的 `[aɡe̞]`，并且永远小写。日常类比：GPG 是瑞士军刀；age 只承诺一件事——把 stdin 里的字节变成只有列出的 recipient 能解开的密文。

```bash
age-keygen -o key.txt
age -r age1ql3z7... -o secret.age secret.txt
age --decrypt -i key.txt -o secret.txt secret.age
```

固定 `v1.3.1` 的模块是 `filippo.io/age`（`go 1.24.0`，release toolchain `go1.25.5`），许可证是 **BSD-3-Clause**，不是 MIT。库注释把 `HybridRecipient` 写成“标准公钥”，但 **`age-keygen` 默认仍生成 X25519**；后量子混合密钥要显式 `-pq`。

## 为什么重要

不理解 v1.3.1 的双轨密钥，下面这些事会对不上：

- 为什么 `age-keygen` 打印的还是 `age1...` / `AGE-SECRET-KEY-1...`，README 却在讲 `age1pq1...`
- 为什么 hybrid 文件不能和普通 X25519 recipient 混在同一份密文里
- 为什么 SOPS / chezmoi 能把 age 当后端，而邮件签名仍然不是它的工作
- 为什么“加密一个文件”这种旧问题，规范还能再加一种 stanza 而不拆 v1 文件头

## 核心要点

固定版本可以拆成四层：

1. **文件头极小**：`age-encryption.org/v1\n`，然后每个 recipient 一行 `-> TYPE args` 加 body，最后 `--- <MAC>`。同一份 file key（16 字节）被包给 N 个 recipient；任一对应 identity 都能解。

2. **两种原生身份，外加口令与 SSH**：
   - X25519：Bech32 `age1` / `AGE-SECRET-KEY-1`，stanza 类型 `X25519`，包装用 ChaCha20-Poly1305。
   - Hybrid：`age1pq1` / `AGE-SECRET-KEY-PQ-1`，HPKE `MLKEM768-X25519`，stanza 类型 `mlkem768x25519`，并带 `postquantum` label——不能和会破坏后量子性质的 recipient 混用。
   - scrypt：`age -p`，默认 work factor `2^18`，而且**必须是唯一 recipient**。
   - SSH：只认 `ssh-ed25519` 与 `ssh-rsa`；**不支持 ssh-agent**。`github:` recipient 已从设计里删掉。

3. **流式 payload**：file key 派生 stream key 后，明文按 **64 KiB** 分块做 STREAM + ChaCha20-Poly1305。从 stdin 读、stdout 写，不必先装进内存。Armor 是 PEM，类型 `AGE ENCRYPTED FILE`，每行 64 列。

4. **CLI 是薄壳**：`age` 负责 `-r` / `-R` / `-i` / `-p` / `-a`；`age-keygen` 负责生成或 `-y` 从 identity 抽出 recipient；`age-inspect` 不解密，只报 recipient 类型、是否后量子、以及头/开销/payload 尺寸。插件二进制约定名为 `age-plugin-<name>`。

## 实践示例

### 案例 1：默认 X25519 密钥

```bash
age-keygen -o ~/.age/key.txt
# stderr: Public key: age1...
# 文件里: # created: ... / # public key: ... / AGE-SECRET-KEY-1...

tar c ~/photos | age -r age1... > photos.tar.age
age --decrypt -i ~/.age/key.txt photos.tar.age | tar x
```

输出文件权限若对所有人可读，`age-keygen` 会警告。没有“撤销证书”：私钥丢了就解不开。

### 案例 2：后量子混合密钥（opt-in）

```bash
age-keygen -pq -o key.txt
age-keygen -y key.txt > recipient.txt   # 写出 age1pq1...
age -R recipient.txt example.jpg > example.jpg.age
age -d -i key.txt example.jpg.age > example.jpg
```

usage 写明 `-pq`“以后可能变成默认”，固定 1.3.1 还不是。hybrid recipient 大约两千字符，不能和普通 `age1...` 写进同一份加密。

### 案例 3：SSH 公钥当 recipient

```bash
age -R ~/.ssh/id_ed25519.pub -o team.age plan.txt
age -d -i ~/.ssh/id_ed25519 team.age
```

这是便利功能：密文会带公钥标签，能看出加密给了哪把 SSH 钥。`authorized_keys` 里不支持的 SSH 类型会被跳过并警告。

### 案例 4：口令与 inspect

```bash
age -p secrets.txt > secrets.txt.age
age-inspect secrets.txt.age
```

`-p` 空回车会自动生成口令。`age-inspect` 只读头，不解密；脚本用 `--json`。

## 踩过的坑

1. **把库注释里的“standard public key”当成 CLI 默认**：`age-keygen` 无 `-pq` 仍走 `GenerateX25519Identity`。旧教程只写 `age1...` 在 1.3.1 仍然成立。
2. **hybrid 和 X25519 混用**：`WrapWithLabels` 返回 `postquantum`；label 不一致则 `Encrypt` 失败。
3. **age 不签名**：没有“证明来自我”的子命令。签名是另一类工具。
4. **不兼容 OpenPGP**：`.gpg` 读不了，也没有桥。迁移就是解旧文件再 age 重加密。
5. **`github:` recipient 已删除**：想加密给 GitHub 用户，要自己 `curl` 其 `.keys` 再 `-R -`。
6. **口令模式不能和公钥并列**：scrypt 必须单独使用。work factor 默认 18；具体要跑多久取决于机器，本文未测。

## 适用 vs 不适用场景

**适用**：

- 备份、dotfiles、配置仓库里的文件级密文
- 需要一份一页就能再实现的 v1 规范，以及 Go / Rust（rage）/ TypeScript（typage）多实现
- 想在同一格式上 opt-in 后量子混合密钥，又不拆 `age-encryption.org/v1` 文件头

**不适用**：

- 邮件加密或需要签名/信任网的流程
- 必须把 hybrid 和经典 X25519 收件人写进同一文件
- 合规点名 FIPS AES-GCM、却要把 ChaCha20-Poly1305 包装层说成 AES
- 把未测的二进制体积、star 或“比 GPG 快多少”写成结论

## 固定版本边界

- 本文绑定 `FiloSottile/age@b8564adb6d58329b8a3e267360ca2b0abc4efe1d`，lightweight tag `v1.3.1`。
- 模块 `filippo.io/age`，BSD-3-Clause；README 写 v1.3.0 起内建后量子支持。
- CLI 默认身份仍是 X25519；`-pq` 生成 ML-KEM-768 + X25519。
- 流式分块 `ChunkSize = 64 * 1024`；scrypt 默认 `workFactor = 18`。
- 本文未编译安装、未做加密往返、未测 scrypt 耗时或密文体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **“少选项”可以长出第二条默认**——payload 算法仍然只有一套；变的是 recipient stanza，靠 label 防止混用。
2. **格式稳定不等于密钥类型冻结**——v1 文件头没变，1.3.x 加了 `mlkem768x25519`。
3. **CLI 默认和库文档用词会分叉**——读 `age-keygen` 的 `generate()`，不要只读 `HybridRecipient` 的 godoc。
4. **插件和 SSH 是兼容层**——原生集成应优先 X25519 / hybrid，SSH 带可追踪标签。

## 应用型自测

1. 固定 1.3.1 里，`age-keygen` 不带旗标生成哪种密钥？
2. hybrid recipient 的 Bech32 前缀和 stanza 类型分别是什么？
3. `age -p` 能不能同时再写一个 `-r age1...`？

检查点：

1. X25519：`age1` / `AGE-SECRET-KEY-1`。`-pq` 才是 hybrid。
2. 前缀 `age1pq1`（HRP `age1pq`）；stanza 类型 `mlkem768x25519`。
3. 不能。`ScryptRecipient` 必须是该文件唯一 recipient。

## 延伸阅读

- 规范：[age-encryption.org/v1](https://age-encryption.org/v1)
- 固定源码：[FiloSottile/age](https://github.com/FiloSottile/age) —— 本文绑定提交 `b8564adb6d58329b8a3e267360ca2b0abc4efe1d`
- Rust 实现：[str4d/rage](https://github.com/str4d/rage)
- 实现与插件列表：[awesome-age](https://github.com/FiloSottile/awesome-age)
- [[sops]] —— 常把 age 当 secrets 后端
- [[chezmoi]] —— dotfiles 里用 age 加密敏感文件

## 关联

- [[sops]] —— YAML/JSON 只加密 value，DEK 交给 age
- [[chezmoi]] —— 把 age 列为推荐，而不是“再包一层 GPG”
- [[aes]] —— age 的包装/流式层是 ChaCha20-Poly1305，不是 AES
- [[libsignal]] —— 同样少选项、强默认的密码学风格对照
- [[helm]] —— 集群 secrets 常经 sops + age

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

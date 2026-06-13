---
title: step-ca 零基础入门：自己搭建一个私有证书颁发机构
来源: https://github.com/smallstep/certificates
date: 2026-06-13
category: 网络安全
subCategory: PKI / TLS
provenance: pipeline-v3
分类: 安全与隐私
子分类: 安全与隐私
---

# step-ca 零基础入门：自己搭建一个私有证书颁发机构

## 一、从"公章"说起：什么是证书颁发机构（CA）？

想象一下你在一家公司上班。每次你要进入大楼，门卫会检查你的工牌——上面有你的名字、照片和公司公章。如果公章是真的，门卫就放行。

在互联网世界里，"工牌"就是 **TLS 证书**，"公司公章"就是 **证书颁发机构（Certificate Authority, CA）**。

当你访问 `https://google.com` 时，你的浏览器会检查 Google 服务器出示的证书，确认证书是由一个受信任的机构签发的。如果没有这个信任链，浏览器就会弹出"不安全"的警告。

通常大公司花钱向 Let's Encrypt、DigiCert 等公共 CA 申请证书。但如果你有一组内部服务（比如微服务之间的通信、内部 API），用公共 CA 就显得大材小用了。**step-ca 让你能在自己的机器上搭建一个私有 CA，自己给自己签发证书。**

## 二、step-ca 是什么？

step-ca 是 Smallstep Labs 开源的一个在线证书颁发机构服务器，用 Go 编写。它是 `step` CLI 工具的服务器端搭档。

它的核心能力有三块：

1. **X.509 证书颁发**：为 HTTPS 服务器、客户端、容器、Kubernetes Pod 等签发 TLS 证书
2. **SSH 证书颁发**：替代传统的 `authorized_keys` 文件，用短期 SSH 证书管理登录权限
3. **ACME 协议支持**：可以当作一个私有的 Let's Encrypt 来用，自动化签发和管理证书

关键特性：签发的证书都是**短期的**（比如几小时到几天），过期自动失效——这叫"被动撤销"，不需要维护复杂的撤销列表。

## 三、核心概念

### 3.1 PKI 两层架构

step-ca 采用**两层 PKI 架构**：

- **根 CA（Root CA）**：离线运行，不直接签发任何证书。就像公司的总公章，锁在保险柜里。
- **中间 CA（Intermediate CA）**：在线运行，负责实际签发证书。根 CA 的私钥签名确认了中间 CA 的身份。

这种设计的好处是：即使在线的中间 CA 私钥泄露了，根 CA 依然安全，只需吊销中间 CA 并重新生成一个新的就行。

### 3.2 Provisioner（供应者）

Provisioner 是 step-ca 最核心的概念之一。你可以把它理解为**"获取证书的资格证明方式"**。

不同的 Provisioner 对应不同的身份验证方法：

| Provisioner 类型 | 验证什么 | 适合场景 |
|---|---|---|
| JWK | 持有加密私钥的人 | 自定义集成、脚本自动化 |
| OAuth/OIDC | 来自身份提供商的登录令牌 | 员工用公司账号登录获取证书 |
| ACME | 通过域名控制权验证 | 自动化 HTTPS 证书管理 |
| X5C | 已有的 X.509 证书 | 跨 PKI 信任传递 |
| Cloud | 云厂商的身份文档 | AWS/GCP/Azure 虚拟机 |

每个 Provisioner 可以配置不同的证书有效期上限、是否允许 SSH 证书等策略。

### 3.3 短期证书与被动撤销

传统 CA 签发的证书通常有效期 1-2 年，如果要提前作废，需要维护 CRL（证书撤销列表）或使用 OCSP 协议——这些机制复杂且容易被绕过。

step-ca 的做法更简单：**证书本身就很短命**（默认 24 小时）。证书过期即失效，不需要任何撤销操作。这就是"被动撤销"（Passive Revocation）。

## 四、动手实践

### 4.1 初始化 CA

首先安装 `step` CLI 和 `step-ca`（参考官方安装文档）。然后运行初始化命令：

```bash
step ca init \
  --name="Example Inc" \
  --dns="localhost" \
  --address="127.0.0.1:8443" \
  --provisioner="bob@example.com" \
  --password="abc123"
```

这条命令会做几件事：

1. 生成根 CA 的密钥和证书（存到 `~/.step/secrets/` 和 `~/.step/certs/`）
2. 生成中间 CA 的密钥和证书（由根 CA 签名）
3. 创建配置文件 `~/.step/config/ca.json`
4. 创建一个默认的 JWK Provisioner（名字是 `bob@example.com`）

输出中会显示根证书的指纹（fingerprint），记下来后面要用。

### 4.2 启动 CA 服务器

```bash
step-ca $(step path)/config/ca.json
```

输入解密中间 CA 私钥的密码后，CA 就会在 `127.0.0.1:8443` 上监听 HTTPS 请求。

### 4.3 签发第一个证书

让 CA 为一个叫 `localhost` 的服务签发 TLS 证书：

```bash
step ca certificate localhost srv.crt srv.key
```

你会看到交互提示，输入 provisioner 密码后，CA 就会签发证书和私钥。签好的证书默认有效期 24 小时。

可以用 `step certificate inspect srv.crt` 查看证书的详细信息：

```
X.509v3 TLS Certificate (ECDSA P-256)
  Serial: 4a:3b:...
  Subject: localhost
  Issuer:  Example Inc Intermediate CA
  Valid from: 2026-06-13T10:00:00Z
           to: 2026-06-14T10:00:00Z
```

### 4.4 用签发的证书启动 HTTPS 服务

假设有一个简单的 Go 程序 `srv.go`：

```go
package main

import (
    "log"
    "net/http"
)

func handler(w http.ResponseWriter, req *http.Request) {
    w.Write([]byte("Hello from step-ca!"))
}

func main() {
    http.HandleFunc("/", handler)
    log.Fatal(http.ListenAndServeTLS(":9443", "srv.crt", "srv.key", nil))
}
```

启动后，用 curl 访问（需要先导入根证书到信任库）：

```bash
curl --cacert $(step path)/certs/root_ca.crt https://localhost:9443
# 输出: Hello from step-ca!
```

### 4.5 添加 ACME Provisioner（让 certbot 也能用）

如果你想让 certbot 或其他标准 ACME 客户端也使用这个 CA：

```bash
# 添加 ACME provisioner
step ca provisioner add acme --type ACME

# 重启 step-ca 使配置生效
kill -HUP $(pgrep step-ca)
```

现在你的 ACME 目录 URL 就是 `https://127.0.0.1:8443/acme/acme/directory`。

用 certbot 获取证书：

```bash
certbot certonly \
  --server https://127.0.0.1:8443/acme/acme/directory \
  --cert-name mysite \
  -d mysite.local \
  --http-01-port 8080 \
  --manual \
  --preferred-challenges http-01
```

### 4.6 管理 Provisioner

常用操作：

```bash
# 列出所有 provisioner
step ca provisioner list

# 添加一个 OIDC provisioner（对接 Google/Okta 等）
step ca provisioner add Google --type oidc \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --configuration-endpoint https://accounts.google.com/.well-known/openid-configuration

# 修改某个 provisioner 的证书有效期上限
step ca provisioner update acme \
  --x509-max-dur=72h \
  --x509-default-dur=36h

# 删除一个 provisioner
step ca provisioner remove acme
```

## 五、step-ca 的典型应用场景

1. **开发环境**：本地微服务之间用 mTLS 通信，不再用自签证书的丑陋警告
2. **CI/CD 流水线**：在构建容器中自动获取短期证书，构建完自动过期
3. **Kubernetes**：配合 cert-manager 实现集群内证书自动化
4. **SSH 统一管理**：用 OIDC 对接公司 SSO，员工离职自动失去 SSH 访问权限
5. **私有 ACME 服务器**：内网服务需要 HTTPS 但不想依赖公共 CA

## 六、局限性

step-ca 开源版有一些设计上的取舍需要注意：

- 只支持单层中间 CA（不能有多级中间 CA）
- 根 CA 必须离线（不支持单 Tier 部署）
- 几乎没有主动撤销能力（CRL/OCSP）
- 没有 Certificate Transparency（CT）日志集成
- 不支持 ACME External Account Binding（EAB）

如果需要上述功能，Smallstep 有商业版产品。但对于大多数中小团队的 DevOps 场景，开源版完全够用。

## 七、总结

step-ca 的核心价值在于**把证书管理变成了代码可以交互的 API**。你不再需要手动生成 CSR、等待审批、粘贴证书——一切都可以自动化。加上短期证书的设计理念，安全性比传统 CA 模式更好。

对于想理解 PKI 和 TLS 证书工作原理的学习者来说，自己搭一个 step-ca 是最好的入门方式。从 `step ca init` 到签发第一个证书，整个过程不到 10 分钟，但能帮你建立起对证书信任链的直观理解。

## 参考资料

- GitHub 仓库: https://github.com/smallstep/certificates
- 官方文档: https://smallstep.com/docs/step-ca
- 入门教程: https://smallstep.com/docs/step-ca/getting-started
- Provisioner 文档: https://smallstep.com/docs/step-ca/provisioners
- ACME 基础: https://smallstep.com/docs/step-ca/acme-basics

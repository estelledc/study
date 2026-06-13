---
title: Trivy 零基础学习笔记
来源: https://github.com/aquasecurity/trivy
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# Trivy 零基础学习笔记

## 什么是 Trivy？

想象一下，你买了一栋房子（你的软件项目），里面有很多房间（不同的组件和依赖库）。Trivy 就像一个专业的房屋安全检查员，它会一间一间地检查：墙壁有没有裂缝（漏洞）、电线有没有乱拉（配置错误）、有没有陌生人留下的钥匙（泄露的密钥）、还有房子里到底有哪些家具（软件清单）。

Trivy 是由 Aqua Security 开发的开源安全扫描工具，用 Go 语言编写。它的名字读音是 "tri-vy"（tri 像 trigger，vy 像 envy）。

核心一句话：**Trivy 在一个工具里帮你发现漏洞、配置错误、泄露密钥和生成软件清单。**

## 核心概念

### 两个维度：Target（扫描目标）和 Scanner（扫描器）

这是理解 Trivy 最关键的概念。你可以把它想象成两件事：

1. **你在哪里找问题？**（Target）—— 容器镜像、文件系统、Kubernetes 集群、Git 仓库、虚拟机镜像
2. **你找什么问题？**（Scanner）—— 已知漏洞（CVE）、配置错误、泄露密钥、许可证合规

用公式表达就是：

```
trivy <target> [--scanners <scanner1,scanner2>] <subject>
```

### 支持的扫描目标（Target）

- **Container Image**：Docker 容器镜像
- **Filesystem**：本地文件系统目录
- **Repository**：远程 Git 仓库
- **Virtual Machine Image**：虚拟机镜像
- **Kubernetes**：K8s 集群

### 支持的扫描器（Scanner）

- **Vuln**：检测操作系统包和编程语言依赖中的已知漏洞（CVE）
- **Misconfiguration**：检测 IaC（基础设施即代码）的配置错误，比如 Terraform、Dockerfile、Kubernetes YAML
- **Secret**：检测代码中意外提交的密钥、密码、API Token
- **License**：检测软件许可证合规问题
- **SBOM**：生成软件物料清单（就是告诉你"你这个项目里到底用了哪些东西"）

### 漏洞数据来源

Trivy 不会凭空猜漏洞，它连接多个权威数据库：

- **操作系统层面**：Debian OVAL、Ubuntu CVE Tracker、Red Hat OVAL、Alpine secdb 等
- **编程语言层面**：GitHub Advisory Database（npm、pip、RubyGems、Maven 等）、Go Vulnerability Database
- **严重级别**：优先采用厂商评分（比如 Red Hat 的评分比 NVD 更准确），因为厂商知道自己怎么打包和修补了软件

### 精确模式 vs 全面模式

Trivy 提供两种检测优先级：

- **`precise`（精确）**：优先减少误报，可能漏掉一些潜在漏洞
- **`comprehensive`（全面）**：优先减少漏报，可能产生一些误报

默认是 `precise`。

## 安装

```bash
# macOS
brew install trivy

# 或者用 Docker
docker run aquasec/trivy --version
```

## 代码示例

### 示例 1：扫描 Docker 镜像中的漏洞

这是最常见的用法。假设你要发布一个 Python 应用，先用 Trivy 看看基础镜像安不安全：

```bash
# 扫描一个 Docker 镜像，自动检测操作系统包和语言依赖的漏洞
trivy image python:3.4-alpine

# 输出示例：
# python:3.4-alpine (debian 8.7)
# ===============================
# Total: 7 (UNKNOWN: 0, LOW: 1, MEDIUM: 1, HIGH: 3, CRITICAL: 2)
#
# +---------+------------------+----------+-------------------+---------------+----------------------------------+
# | LIBRARY | VULNERABILITY ID | SEVERITY | INSTALLED VERSION | FIXED VERSION |              TITLE               |
# +---------+------------------+----------+-------------------+---------------+----------------------------------+
# | curl    | CVE-2018-14618   | CRITICAL | 7.61.0-r0         | 7.61.1-r0     | curl: NTLM password overflow     |
# | git     | CVE-2018-17456   | HIGH     | 2.15.2-r0         | 2.15.3-r0     | git: arbitrary code execution    |
# | libssh2 | CVE-2019-3855    | CRITICAL | 1.8.0-r2          | 1.8.1-r0      | libssh2: Integer overflow        |
# +---------+------------------+----------+-------------------+---------------+----------------------------------+
```

可以看到，Trivy 自动识别出这是一个基于 Debian 8.7 的 Alpine 镜像，列出了每个漏洞的库名、CVE 编号、严重程度、当前版本和修复版本。

如果想只看高危和严重级别的漏洞：

```bash
trivy image --severity HIGH,CRITICAL python:3.4-alpine
```

### 示例 2：扫描本地项目目录（漏洞 + 密钥 + 配置错误）

假设你有一个项目文件夹，想一次性检查三件事：代码里有没有泄露密钥、配置文件有没有写错、依赖有没有漏洞：

```bash
# 同时扫描漏洞、密钥泄露和配置错误
trivy fs --scanners vuln,secret,misconfig myproject/
```

### 示例 3：只扫描操作系统层面的漏洞，忽略语言依赖

有些时候你只想看操作系统的包安不安全，不想看 npm 或 pip 的依赖：

```bash
# 只扫描 OS 包
trivy image --pkg-types os ruby:2.4.0
```

### 示例 4：生成 SBOM（软件物料清单）

SBOM 就是告诉你"你这个软件里到底包含了哪些组件"，就像汽车出厂时的零件清单。这在企业合规中越来越重要：

```bash
# 为 Docker 镜像生成 SBOM，输出为 JSON 格式
trivy image --format sbom --output sbom.json python:3.4-alpine

# 也可以输出为 CycloneDX 格式（工业标准）
trivy image --format cyclonedx --output sbom.json python:3.4-alpine
```

### 示例 5：扫描 Kubernetes 集群

在 K8s 环境中，Trivy 可以扫描整个集群的安全状况：

```bash
# 扫描整个 Kubernetes 集群的镜像漏洞
trivy k8s --report summary cluster

# 输出类似：
# TARGET                TYPE  VULNS  MISCONFIG  SECRET
# nginx-deployment      image  3
# redis-statefulset     image  1
# postgres-deployment   image  0
```

### 示例 6：将结果导出为 JSON 报告

把扫描结果保存下来，方便后续处理或集成到 CI/CD 流水线中：

```bash
# 扫描并输出 JSON 格式的报告
trivy image --format json --output result.json node:18-alpine

# 只输出严重级别为 HIGH 及以上的结果
trivy image --format json --severity HIGH,CRITICAL --output result.json node:18-alpine
```

## 关键特性总结

1. **一个工具，多种扫描**——不需要分别装漏洞扫描器、密钥扫描器、配置检查器
2. **支持几乎所有主流平台**——操作系统（Debian、Ubuntu、RHEL、Alpine 等）和编程语言（Python、Node.js、Go、Rust、Java 等）
3. **自动更新漏洞数据库**——首次运行会自动下载最新的 CVE 数据库，之后每次运行也会检查更新
4. **CI/CD 友好**——可以输出 JSON 格式结果，轻松集成到 GitHub Actions、GitLab CI、CircleCI 等流水线
5. **GitHub Actions 集成**——官方提供了 `aquasecurity/trivy-action`，一行就能在 CI 中加入安全扫描
6. **Kubernetes Operator**——通过 `trivy-operator` 可以在 K8s 中持续监控镜像安全
7. **支持离线扫描**——可以手动下载数据库放到内网环境使用（Air-Gap）

## 常见使用场景

| 场景 | 命令 |
|------|------|
| 检查 Docker 镜像漏洞 | `trivy image <image>` |
| 检查本地项目 | `trivy fs --scanners vuln,secret <dir>` |
| 检查 Git 仓库 | `trivy repo <repo-url>` |
| 检查 K8s 集群 | `trivy k8s --report summary cluster` |
| 生成软件清单 | `trivy image --format sbom --output sbom.json <image>` |
| 检查 Terraform 配置 | `trivy fs --scanners misconfig terraform-dir/` |
| 检查 VM 镜像 | `trivy vm --format json <image-file>` |

## 下一步

Trivy 还有很多高级功能，比如自定义 Rego 策略检查、VEX（漏洞交换格式）、供应链签名等。这些概念有一定门槛，建议先把上面这些基础用法用熟练了，再逐步深入。

---
title: Trivy 学习笔记
来源: https://github.com/aquasecurity/trivy
日期: 2026-06-13
分类: 安全与隐私
子分类: security-tools
provenance: pipeline-v3
---

# Trivy 学习笔记

## 0. 一句话概括

Trivy 是一个开源的安全扫描器，能自动发现系统里有哪些漏洞、泄露的密钥、配置错误。它由 Aqua Security 开发，是 GitHub 上最火的容器安全工具之一（Star 数 20000+）。

## 1. 日常类比

想象一下你要住进一个公寓（你的程序或服务器）。入住前，物业应该检查什么？

- 门窗有没有损坏？（系统包有没有已知漏洞）
- 电路有没有老化？（依赖库有没有安全缺陷）
- 窗户有没有没关？（配置文件有没有暴露敏感信息）
- 有没有陌生人留下的纸条？（代码里有没有硬编码的密码）

Trivy 就是那个"物业安检员"。它帮你自动跑一遍上面的检查，然后给你一份体检报告，告诉你哪些地方需要修。

## 2. 核心概念

Trivy 的工作方式围绕两个核心概念：**扫描目标（Target）** 和 **扫描器（Scanner）**。

### 2.1 扫描目标（Target）

目标就是你想要检查的东西，也就是"查哪里"。Trivy 支持多种目标：

- **容器镜像**（Container Image）—— 比如 `docker.io/python:3.4-alpine`
- **文件系统**（Filesystem）—— 比如你本地的 `myproject/` 目录
- **Git 仓库**（Git Repository）—— 直接扫描远程代码仓库
- **虚拟机镜像**（Virtual Machine Image）
- **Kubernetes 集群**（Kubernetes Cluster）—— 检查整个集群的安全状况

### 2.2 扫描器（Scanner）

扫描器就是"检查什么"，Trivy 内置了多种扫描器：

- **Vulnerability（漏洞扫描）** —— 检查 OS 包和软件依赖是否存在已知 CVE 漏洞
- **SBOM（软件物料清单）** —— 生成一份清单，列出你用了哪些组件
- **Secret（密钥扫描）** —— 查找代码或配置中硬编码的密码、API 密钥
- **Misconfiguration（配置扫描）** —— 检查 IaC（基础设施即代码）文件有没有安全配置错误
- **License（许可证扫描）** —— 检查使用的开源组件是否符合许可协议

### 2.3 工作流程

```
输入（目标）→ Trivy 解析 → 匹配扫描器 → 输出报告
```

你可以理解为：
1. 你告诉 Trivy"去查这个镜像"
2. Trivy 打开镜像，把里面的东西拆解开
3. 把拆解出来的每个组件拿去漏洞数据库比对
4. 把结果整理成一份报告给你

## 3. 安装

Trivy 安装非常简单，有多种方式：

```bash
# macOS (brew)
brew install trivy

# Docker（不需要安装二进制）
docker run aquasec/trivy --version

# 下载二进制文件
# 从 https://github.com/aquasecurity/trivy/releases 下载对应系统的版本
```

## 4. 代码示例

### 示例 1：扫描容器镜像的漏洞

这是最常用的场景。假设你有一个 Python 镜像，想知道它安不安全：

```bash
# 扫描一个 Alpine Linux 镜像，只检查漏洞
trivy image python:3.4-alpine
```

输出示例（简化）：

```
python:3.4-alpine (alpine 3.18.4)
===================================
Total: 5 (UNKNOWN: 0, LOW: 1, MEDIUM: 2, HIGH: 1, CRITICAL: 1)

┌──────────┬────────────────┬──────────┬────────┬───────────────┬────────────────┐
│  Library │   Vulnerability │ Severity │ Status │ Installed V.  │   Fixed Version │
├──────────┼────────────────┼──────────┼────────┼───────────────┼────────────────┤
│  musl    │   CVE-2024-41110 │  CRITICAL│ fixed  │  1.2.4-r3     │   1.2.5-r1     │
│  busybox │   CVE-2023-50467 │   MEDIUM │ fixed  │  1.36.1-r9    │   1.36.1-r13   │
│  zlib    │   CVE-2023-45853 │   LOW    │ fixed  │  1.3-r0       │   1.3-r3       │
└──────────┴────────────────┴──────────┴────────┴───────────────┴────────────────┘
```

解读：
- 第一行显示这个镜像用的是 Alpine 3.18.4，总共有 5 个漏洞
- 严重程度分为：未知、低、中、高、严重（Critical）
- 表格里每个漏洞都告诉你"当前安装了哪个版本"和"升级到哪个版本可以修复"
- 这个例子里有一个严重漏洞（musl 库），建议升级到 1.2.5-r1

如果你想过滤只查看高危漏洞，可以用 `--severity` 参数：

```bash
# 只显示高危和严重漏洞
trivy image --severity HIGH,CRITICAL python:3.4-alpine
```

### 示例 2：扫描本地项目的多种问题

假设你有一个项目目录，既想查漏洞，也想查有没有泄露密钥，还想检查配置文件：

```bash
# 同时启用漏洞扫描 + 密钥扫描 + 配置扫描
trivy fs --scanners vuln,secret,misconfig myproject/
```

这个命令会做三件事：
1. **vuln** —— 检查项目依赖（package.json、requirements.txt 等）的漏洞
2. **secret** —— 查找代码里有没有写死的密码或 API Key
3. **misconfig** —— 检查 Dockerfile、Kubernetes YAML 等配置文件的错误

输出示例（简化）：

```
myproject/
==========
vuln
====
Total: 3 (HIGH: 2, CRITICAL: 1)

┌──────────────────┬────────────────┬──────────┬───────────────┬────────────────┐
│      Library     │   Vulnerability │ Severity │ Installed V.  │  Fixed Version │
├──────────────────┼────────────────┼──────────┼───────────────┼────────────────┤
│  lodash          │   CVE-2021-23337 │  HIGH    │  4.17.15      │   4.17.21      │
│  express         │   CVE-2022-24999 │  HIGH    │  4.17.1       │   4.17.3       │
│  minimatch       │   CVE-2023-31069 │ CRITICAL │  6.0.1        │   6.1.2        │
└──────────────────┴────────────────┴──────────┴───────────────┴────────────────┘

secret
======
Total: 1

┌──────────┬────────────────────┬──────────┐
│   Type   │       Key          │  Line    │
├──────────┼────────────────────┼──────────┤
│ AWS Key  │   AWS_ACCESS_KEY   │  config.js:12 │
└──────────┴────────────────────┴──────────┘

misconfig
=========
Total: 1

┌──────────────┬──────────────────────────────────────┬──────────┐
│    Name      │              Message                 │ Severity │
├──────────────┼──────────────────────────────────────┼──────────┤
│ Dockerfile:1 │  Container running as root user      │   HIGH   │
└──────────────┴──────────────────────────────────────┴──────────┘
```

可以看到，一次扫描同时发现了：
- 3 个依赖漏洞（其中 minimatch 是严重级别）
- 1 个硬编码的 AWS 密钥（在 config.js 第 12 行）
- 1 个 Dockerfile 配置错误（容器以 root 用户运行，不安全）

### 示例 3：生成 JSON 报告（用于 CI/CD 集成）

Trivy 可以把扫描结果输出为 JSON 格式，方便集成到自动化流程中：

```bash
# 扫描镜像并输出 JSON 报告到文件
trivy image --format json --output report.json python:3.4-alpine
```

## 5. 使用场景总结

| 场景 | 命令模式 |
|------|---------|
| 扫描 Docker 镜像漏洞 | `trivy image <镜像名>` |
| 扫描本地项目 | `trivy fs --scanners vuln <目录>` |
| 扫描整个 K8s 集群 | `trivy k8s --report summary cluster` |
| 扫描远程 Git 仓库 | `trivy repo <仓库URL>` |
| 生成 SBOM 清单 | `trivy image --format spdx-json -o sbom.json <镜像名>` |

## 6. 为什么选 Trivy？

- **全能**：一个工具搞定漏洞、密钥、配置、许可证四类扫描
- **快**：底层用 Go 编写，扫描速度比同类工具快很多
- **简单**：一条命令就能跑，不需要复杂配置
- **免费**：Apache 2.0 协议，完全开源
- **生态丰富**：有 GitHub Actions、Kubernetes Operator、VS Code 插件等集成

## 7. 下一步学习方向

1. 安装 Trivy 后试着扫一下自己常用的 Docker 镜像
2. 学习 `--severity` 参数，按严重程度过滤结果
3. 了解 SBOM（软件物料清单）的生成和用途
4. 尝试把 Trivy 集成到 GitHub Actions 的 CI/CD 流程中
5. 阅读 Trivy 官方文档的 Scanning Coverage 页面，了解支持的语言和平台列表

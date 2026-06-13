---
title: Nuclei 漏洞扫描器学习笔记
来源: https://github.com/projectdiscovery/nuclei
日期: 2026-06-13
分类_原始: 网络安全
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# Nuclei 漏洞扫描器学习笔记

## 一、什么是 Nuclei：用"体检模板"来理解

想象一下，医院给每位患者做体检时，医生手上都有一套"检查项目清单"：量血压、验血、拍 X 光……每一项检查都有明确的"正常范围"，超出范围就标记异常。

Nuclei 做的是一样的事，只不过对象变成了网站和服务。它的核心思路可以用一句话概括：

> 用 YAML 格式的"检查模板"，对目标网站发送精心构造的请求，然后根据返回结果判断是否存在漏洞。

每个模板相当于一份体检清单，社区里已经有上万份模板，覆盖 CVE 漏洞、错误配置、敏感文件泄露等各种场景。

关键特点：
- **模板驱动**：一切以 YAML 模板为中心，写一个模板 = 定义一种检查方法
- **社区驱动**：全球安全研究人员共同维护模板库，新漏洞披露后数小时内就有对应模板
- **低误报**：模板可以模拟真实攻击步骤来验证，不只是简单匹配关键词

## 二、核心概念拆解

### 2.1 模板（Template）

模板是 Nuclei 的最小单位，一个 YAML 文件就是一种检查方法。完整模板包含三个核心部分：

1. **info 区块**：元信息，包括名称、作者、严重程度（severity）、描述、标签等
2. **requests 区块**：实际发送的网络请求，协议可以是 HTTP、DNS、TCP、SSL 等
3. **matchers 区块**：匹配规则，用来判断请求返回的结果是否说明存在漏洞

### 2.2 变量（Variables）

模板中用 `{{变量名}}` 的语法来表示动态替换。比如 `{{BaseURL}}` 会在运行时被替换为目标网址。常见的变量有：

| 变量 | 含义 | 示例（目标为 https://example.com:443/foo/bar.php） |
|---|---|---|
| `{{BaseURL}}` | 完整的目标 URL | https://example.com:443/foo/bar.php |
| `{{RootURL}}` | 根 URL（不含路径） | https://example.com:443 |
| `{{Host}}` | 主机名 | example.com |
| `{{Port}}` | 端口号 | 443 |
| `{{Hostname}}` | 主机名加端口 | example.com:443 |

### 2.3 匹配器（Matchers）

匹配器决定"什么算找到漏洞"。最常用的是 `word` 类型，即在响应中查找特定文本。还有其他类型如 `status_code`（状态码匹配）、`dsl`（用表达式判断）等。

### 2.4 提取器（Extractors）

提取器从响应中提取有用的数据，比如 API 密钥、文件名等，方便后续使用。

## 三、代码示例

### 示例 1：检测 .git/config 文件泄露

这是一个经典的敏感文件泄露检查。很多开发者会把 `.git` 目录留在服务器上，攻击者可以直接拿到代码仓库的配置信息。

```yaml
id: git-config-detection

info:
  name: Git Config File Detection
  author: Jason
  severity: medium
  description: |
    检测目标网站是否暴露了 .git/config 文件。
    该文件包含仓库远程地址、分支信息等敏感数据。
  reference:
    - https://www.acunetix.com/vulnerabilities/web/git-repository-found/
  tags: git,config,sensitive

http:
  - method: GET
    path:
      - "{{BaseURL}}/.git/config"
    matchers:
      - type: word
        words:
          - "[core]"
          - "repositoryformatversion"
        condition: and
```

**逐行解释：**

- `id`：模板唯一标识，不能有空格
- `severity: medium`：中等严重程度。Nuclei 支持 info / low / medium / high / critical 五个级别
- `path` 是一个列表，可以一次性检测多个路径
- `condition: and` 表示两个词都必须出现在响应中才算匹配成功，降低误报
- 当目标为 https://example.com 时，`{{BaseURL}}/.git/config` 会被替换为 https://example.com/.git/config

**运行方式：**

```sh
nuclei -target https://example.com -t git-config-detection.yaml
```

### 示例 2：检测 SQL 注入漏洞（使用 DSL 匹配器）

这个模板演示了更高级的用法：用 HTTP 错误信息来探测 SQL 注入。它发两条请求——先探测目标是否返回 MySQL 相关的错误信息，再确认返回状态码。

```yaml
id: sqli-error-based-detection

info:
  name: SQL Injection Error-Based Detection
  author: Jason
  severity: high
  description: |
    通过注入 SQL 错误载荷，检测目标是否存在基于错误的 SQL 注入漏洞。
    当数据库返回错误信息时，响应中会包含 MySQL 版本或错误代码。
  reference:
    - https://owasp.org/www-community/vulnerabilities/SQL_Injection
  tags: sqli,injection,dangerous

http:
  - raw:
      - |
        GET /search?q=test' OR '1'='1 HTTP/1.1
        Host: {{Hostname}}
        User-Agent: Mozilla/5.0
      - |
        GET /search?q=test' UNION SELECT NULL-- HTTP/1.1
        Host: {{Hostname}}
        User-Agent: Mozilla/5.0
    stop-at-first-match: true
    matchers-condition: or
    matchers:
      - type: word
        part: body
        words:
          - "You have an error in your SQL syntax"
          - "MySQLSyntaxErrorException"
          - "Warning: mysql_fetch"
          - "pg_query()"
        condition: or
      - type: word
        part: body
        words:
          - "SQLSTATE["
          - "ORA-0"
          - "Microsoft OLE DB"
        condition: or
```

**关键新语法：**

- `raw`：直接用原始 HTTP 格式写请求，可以自定义方法、路径、headers
- `stop-at-first-match: true`：找到一个匹配就停止，节省扫描时间
- `matchers-condition: or`：两个 matcher 块只要有一个命中就算成功
- `part: body`：指定在响应的 body 中查找匹配词
- 多段 `raw` 请求之间可以共享 session（cookie 会保留）
- 更复杂的场景还可以用 `dsl` 类型匹配器做条件判断，比如 `"status_code == 200 && contains(body, 'error')"`

**运行方式：**

```sh
nuclei -target https://example.com -t sqli-error-based-detection.yaml -v
```

`-v` 参数显示详细输出，包括每个请求和响应的详情。

## 四、常用命令行选项

```sh
# 扫描单个目标
nuclei -target https://example.com

# 从文件读取多个目标
nuclei -list targets.txt

# 只运行特定严重程度的模板
nuclei -target https://example.com -severity high,critical

# 只运行特定标签的模板
nuclei -target https://example.com -tags cve,rce

# 输出 JSON 格式结果
nuclei -target https://example.com -json-export results.json

# 指定自定义模板
nuclei -target https://example.com -t ./my-templates/

# 更新模板库
nuclei -update-templates
```

## 五、模板的工作流程

整个扫描过程可以概括为以下循环：

```
读取模板 → 替换变量 → 发送请求 → 接收响应 → 匹配规则 → 输出结果
```

1. Nuclei 加载一个 YAML 模板
2. 把模板中的 `{{变量}}` 替换为实际值
3. 按照模板定义的协议和请求方式发送网络请求
4. 收到目标返回的响应后，交给匹配器判断
5. 如果匹配成功，把结果写入输出文件或终端

多个模板可以同时并行执行（默认并发数 25），多个目标也可以在单个模板下并行扫描，这就是 Nuclei 速度快的原因。

## 六、学习建议

- 先去 https://github.com/projectdiscovery/nuclei-templates 浏览真实模板，这是最好的教材
- 用 https://cloud.projectdiscovery.io/templates/editor 在线编写和测试模板，不需要本地配置
- 从简单的 HTTP GET 请求模板开始写起，逐步掌握 matchers 和 extractors
- 每个漏洞类型学一个模板，理解"请求 + 匹配"的设计思路

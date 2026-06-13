---
title: Semgrep 零基础学习笔记
来源: https://github.com/semgrep/semgrep
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# Semgrep 零基础学习笔记

## 一、什么是 Semgrep？—— 用日常类比来理解

想象一下你是一名图书管理员，每天要检查成千上万本图书。现在你想找出所有"封面是红色且书名包含'Python'"的书。

用传统工具 grep 来做这件事，就像你**拿着放大镜一页一页地翻书**，只在页面上找"Python"这两个字。如果某本书把书名写在封底，grep 就找不到。

用 Semgrep 来做这件事，就像你**直接看了书的目录和元数据**——你知道书的结构，知道"书名"是什么、"封面颜色"是什么。于是你能说出"第 42 页的那本红色 Python 书"，即使书名是斜着写的、分在两行上、或者用了同义词。

这就是 Semgrep 的核心区别：

- **grep** 做的是"字符串匹配" —— 只看字面，不懂结构
- **Semgrep** 做的是"语义匹配" —— 理解代码的结构和含义

Semgrep 官网的一句话概括非常精辟：**"Semgrep is semantic grep for code"**（语义化的代码搜索工具）。

## 二、核心概念

### 2.1 模式匹配 (Pattern Matching)

Semgrep 的规则长得很像你要搜索的代码本身。它不需要你学习复杂的正则表达式，也不需要你理解抽象语法树 (AST)。你看到什么代码，就写什么代码作为规则。

### 2.2 省略号运算符 (Ellipsis `...`)

这是 Semgrep 最强大的概念之一。`...` 表示"这里有任意数量的内容，我不关心具体是什么"。

类比：就像你在填空题里写"小明今年 ___ 岁" —— 无论空格里填 5、18 还是 80，这个填空题都能成立。

### 2.3 元变量 (Metavariables)

元变量是 `$大写字母` 形式的占位符，用来匹配你"不知道具体值"的部分。

类比：就像数学里的 `x + y` —— 不管 x 和 y 是 1 和 2，还是 100 和 200，这个表达式结构不变。

在 Semgrep 中，`$X` 可以匹配任意代码片段，并且同一个 `$X` 在规则中多次出现时，必须匹配相同的代码。

### 2.4 规则结构

每条 Semgrep 规则是一个 YAML 文件，包含：

- `id`：规则的身份证号
- `languages`：目标语言（python、javascript、go 等 30+ 种）
- `pattern`：要匹配的代码模式
- `message`：找到匹配时输出的提示信息
- `severity`：严重程度（INFO / LOW / MEDIUM / HIGH / ERROR）

## 三、代码示例

### 示例 1：搜索 Python 中硬编码的密码

**日常场景**：你发现团队代码里有人直接把密码写在了源文件里，就像把保险柜密码贴在显示器上一样危险。

不安全的代码：

```python
def connect_to_db():
    password = "my_secret_password123"
    db = Database.connect(password=password)
```

Semgrep 规则 `hardcoded-password.yaml`：

```yaml
rules:
  - id: hardcoded-password
    patterns:
      - pattern: '$VAR = "$PASSWORD"'
      - metavariable-regex:
          metavariable: '$PASSWORD'
          regex: '(.*)password(.*)'
    message: 发现硬编码密码：$VAR = "$PASSWORD"
    severity: ERROR
    languages:
      - python
```

运行方式：

```bash
semgrep --config hardcoded-password.yaml your_project/
```

这条规则的意思是：

1. 找到一个变量赋值，右边是字符串
2. 把这个字符串的内容交给正则表达式检查，看是否包含 "password"
3. 如果匹配，就报告发现，并告诉你是哪个变量

### 示例 2：搜索 JavaScript 中不安全的请求验证

**日常场景**：一个发 HTTP 请求的函数，开发者忘了关闭 SSL 证书验证。这就像寄挂号信的时候，让快递员随便找个投递点，不确认收件人身份。

不安全的代码：

```javascript
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  verify: false
});
```

Semgrep 规则 `insecure-fetch.yaml`：

```yaml
rules:
  - id: insecure-fetch-verify-false
    patterns:
      - pattern: 'fetch(..., { ..., verify: false, ... })'
    message: 发现 fetch 请求关闭了 SSL 验证，存在中间人攻击风险
    severity: HIGH
    languages:
      - javascript
```

规则解读：

- `fetch(...)` 表示匹配任意参数的 fetch 调用
- `{ ..., verify: false, ... }` 表示在对象参数中，找到 `verify: false` 这一项即可，前后还有其他字段也没关系

### 示例 3：搜索 Go 中未检查的函数返回值

**日常场景**：函数调用后不检查返回值，就像收到快递后不看包裹直接扔一旁 —— 万一送错货呢？

不安全的代码：

```go
func handleRequest(w http.ResponseWriter, r *http.Request) {
    user := getUser(r)
    db.Save(user)  // 没有检查 err！
}
```

Semgrep 规则 `unhandled-error.yaml`：

```yaml
rules:
  - id: unhandled-db-save-error
    patterns:
      - pattern: 'db.Save(...)'
    message: db.Save() 的返回值没有被处理，可能掩盖数据库错误
    severity: MEDIUM
    languages:
      - go
```

配合 `...` 的更强写法：

```yaml
rules:
  - id: unhandled-error-any
    patterns:
      - pattern: '$CALL(...)'
      - pattern-not-inside: 'if $ERR := $CALL(...); $ERR != nil { ... }'
    message: '$CALL 的返回值未做错误处理'
    severity: MEDIUM
    languages:
      - go
```

这里用到了 `pattern-not-inside`：意思是"匹配 `$CALL(...)`，但前提是它不在一个已经处理了错误的 `if` 语句里面"。

## 四、Semgrep 的工作流程

```
你的代码 ──→ Semgrep 引擎 ──→ 匹配结果
                │
        ┌───────┴───────┐
        ↓               ↓
   模式匹配      数据流分析
  (单文件)     (跨函数追踪)
```

1. **安装**：`pipx install semgrep` 或 `brew install semgrep`
2. **登录**（可选）：`semgrep login`，获取 Pro 规则库的访问权限
3. **扫描**：`semgrep ci` 或 `semgrep --config=p/ci .`
4. **查看结果**：CLI 输出或 Semgrep 平台界面

## 五、为什么 Semgrep 适合初学者？

1. **规则像代码**：不需要学 AST、不需要学正则表达式
2. **即时反馈**：用 `-e` 参数可以命令行直接写规则测试
3. **支持 30+ 语言**：Python、JavaScript、Go、Java、Rust 等都行
4. **免费规则库**：Registry 里有 2000+ 条现成规则
5. **IDE 集成**：VS Code、IntelliJ 都有插件
6. **CI/CD 集成**：GitHub Actions、GitLab CI、CircleCI 都能跑

## 六、进阶概念（了解即可）

- **数据流分析 (Taint Analysis)**：追踪用户输入是否"有毒"地流入了危险函数
- **Typed Metavariables**：给元变量加类型约束，比如 `(Logger $X).log(...)` 只匹配 Logger 类型
- **Deep Expression**：`<... pattern ...>` 可以匹配深层嵌套的代码
- **Auto-fix**：某些规则可以直接提供自动修复的代码

## 七、一句话总结

Semgrep = 用代码写规则，来找代码里的 bug 和安全问题。规则长得就像你要搜索的代码本身，加上 `...`（省略号）和 `$大写字母`（元变量）作为通配符。

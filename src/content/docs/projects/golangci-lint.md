---
title: golangci-lint：Go 语言的「超级 lint 聚合器」
来源: https://github.com/golangci/golangci-lint
日期: 2026-06-13
分类: 其他
子分类: 代码质量工具
provenance: pipeline-v3
---

## 什么是 golangci-lint

golangci-lint 是 Go 语言世界里最流行的代码检查工具。它的官方描述只有一句话：

> Fast linters runner for Go

但这句话背后藏着一个很实际的痛点：Go 生态里有**一百多个 lint 工具**，每个工具只管自己那一小块事——`golint` 管命名，`go vet` 管内存安全，`gosec` 管安全漏洞，`misspell` 管拼写……一个个单独运行，慢得要命，配置起来还各自有各自的命令参数。

golangci-lint 做的事情很简单：**把一百多个 lint 工具打包成一个工具，一次命令全部跑完**。

### 日常类比：餐厅质检

想象你在运营一家大型餐厅：

- `go vet` 是食品安全检查员，只看食材有没有变质
- `golint` 是服务规范检查员，只看服务员站姿对不对
- `gosec` 是安保检查员，只看后门有没有锁好
- `misspell` 是菜单校对员，只看菜单有没有错别字

如果每个检查员单独来一次，餐厅要关门五次，顾客全跑了。

golangci-lint 就像请了一个**质检主管**，他手里有所有检查员的清单，一次性带着所有人一起巡检，还顺便把结果汇总成一份报告。

---

## 核心概念

### 1. Linter（检查器）

Linter 就是"代码规则检查器"。每个 linter 负责检查一种特定的代码问题。golangci-lint 内置了 100+ 个 linter，比如：

| 名字 | 检查什么 |
|------|----------|
| `govet` | Go 官方 vet，检查可疑代码 |
| `gofmt` | 代码格式是否符合 go fmt 标准 |
| `golint` | 命名规范、代码风格 |
| `gosec` | 安全相关的问题（硬编码密码、不安全的随机数） |
| `misspell` | 英文拼写错误 |
| `ineffassign` | 赋值了但没有使用的变量 |
| `errcheck` | 有没有忘记检查 error |

### 2. 并行执行

golangci-lint 的核心卖点之一是**速度**。它把不同的 linter 分配到不同的 goroutine 里并行运行，同时复用 Go 的 build cache。对于一个中型项目，原本需要几分钟的检查现在通常几秒就跑完了。

### 3. 缓存

第一次运行时，golangci-lint 会把每个文件的检查结果缓存到磁盘。第二次运行时，只有改过的文件会被重新检查。

### 4. YAML 配置

golangci-lint 的配置文件是 `.golangci.yml`（或 `.golangci.yaml`），用 YAML 格式编写，可读性很好。你可以：

- 启用或禁用某个 linter
- 调整某个 linter 的参数
- 排除某些文件不检查
- 设置输出格式

---

## 安装

最简单的安装方式（macOS）：

```bash
brew install golangci/tap/golangci-lint
```

其他系统详见官方文档：https://golangci-lint.run/docs/welcome/install/

安装完成后验证：

```bash
golangci-lint --version
# 输出类似：golangci-lint has version v2.x.x built from xxx on xxx
```

---

## 快速上手

### 第一步：检查代码

进入项目根目录，直接运行：

```bash
golangci-lint run
```

它会递归检查项目中的所有 `.go` 文件，发现问题时输出类似这样的信息：

```
pkg/main.go:15:3: Error return value is not checked (errcheck)
    resp.Body.Close()
    ^
```

### 第二步：生成配置文件

项目里还没有配置文件时，golangci-lint 会使用默认规则。如果你想自定义，可以先生成一份参考配置：

```bash
golangci-lint config generate
```

这会生成一个 `.golangci.yml` 文件，里面注释了所有可配置项。

### 第三步：只看报错

默认情况下 golangci-lint 只报告 error 级别的问题，不会报告 warning。如果想看到所有级别：

```bash
golangci-lint run --issues-exit-code=0
```

---

## 代码示例

### 示例一：基本配置

假设你有一个 Go 项目 `.golangci.yml` 配置长这样：

```yaml
# .golangci.yml
run:
  timeout: 5m
  modules-download-mode: readonly

linters:
  # 启用所有默认 linter
  enable:
    - govet
    - gofmt
    - gosimple
    - unused
    - errcheck
    - staticcheck
    - ineffassign
    - misspell

  # 额外启用一些有用的 linter
  enable:
    - gosec       # 安全检查
    - gas         # 额外的安全检查

linters-settings:
  gofmt:
    simplify: true       # 进一步简化代码
  misspell:
    locale: US           # 美式英语拼写

issues:
  # 排除 vendor 目录和测试文件中的某些 linter
  exclude-rules:
    - path: _test\.go
      linters:
        - govet
        - gocyclo

  # 最大问题数量，0 表示无限制
  max-issues-per-linter: 0
  max-same-issues: 0
```

逐段解释：

- **`run.timeout`**：给整个检查过程设个超时，防止某个 linter 卡死。
- **`run.modules-download-mode`**：告诉 golangci-lint 怎么用 Go modules，`readonly` 表示不下载依赖，复用已有的。
- **`linters.enable`**：这里列出了要启用的 linter。不列出来的默认不会启用（v2 的行为）。
- **`linters-settings`**：给每个 linter 传参数。比如 `misspell` 设置成美式英语，`gofmt` 开启简化模式。
- **`issues.exclude-rules`**：排除规则。比如 `_test.go` 文件里不检查 `govet` 和 `gocyclo`。

### 示例二：实际检查输出

下面是一个有问题的 Go 文件 `example.go`：

```go
package main

import (
    "fmt"
    "crypto/rand"
)

func main() {
    var x = 10
    fmt.Println(x)
    secret, _ := rand.Int(rand.Reader, nil)
    _ = x
}
```

运行 `golangci-lint run` 后会得到：

```
example.go:8:6: `main` is unused (unused)
example.go:11:8: Error return value of `rand.Int` is checked but the error is discarded (errcheck)
example.go:6:5: "crypto/rand" is unused (unused)
example.go:9:6: `x` is unused (ineffassign)
example.go:4:5: "fmt" could be imported by github.com/golangci/test (importas / goimports)
```

逐条解读：

1. **`main` is unused** — 函数定义了但没有被调用。
2. **`rand.Int` error discarded** — `rand.Int` 会返回 error，你用 `_` 丢弃了它（虽然 `errcheck` 的描述写的是"checked but discarded"，意思是返回了但没处理）。
3. **`crypto/rand` unused** — 导入了但没有使用。
4. **`x` unused** — 给 `x` 赋值了但之后没用到（`ineffassign` 专门抓这种）。
5. **import 问题** — 导入了 `fmt` 但可能是误导入（goimports 检测到的）。

修复后的文件：

```go
package main

import (
    "crypto/rand"
    "fmt"
)

func main() {
    x := 10
    secret, err := rand.Int(rand.Reader, nil)
    if err != nil {
        panic(err)
    }
    fmt.Println("x =", x, "secret =", secret)
}
```

再次运行 `golangci-lint run`，没有输出了，说明代码通过了所有检查。

---

## 常用命令速查

| 命令 | 作用 |
|------|------|
| `golangci-lint run` | 检查整个项目 |
| `golangci-lint run ./pkg/main.go` | 只检查指定文件 |
| `golangci-lint run --fix` | 自动修复能自动修复的问题（比如格式问题） |
| `golangci-lint linters` | 列出所有可用的 linter 及其状态 |
| `golangci-lint config path` | 显示当前使用的配置文件路径 |
| `golangci-lint version` | 显示版本信息 |
| `golangci-lint cache clean` | 清空缓存 |

---

## CI/CD 集成

golangci-lint 在 CI 中非常常用。以 GitHub Actions 为例：

```yaml
name: golangci-lint
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  golangci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: stable
      - name: golangci-lint
        uses: golangci/golangci-lint-action@v8
        with:
          version: latest
```

这个 workflow 的作用：每次推送到 main 分支或创建 PR 时，自动运行 golangci-lint 检查。如果有问题，PR 上会直接显示报错信息。

---

## golangci-lint v1 和 v2 的区别

v2 是一个重大版本更新，主要变化：

- **默认 linter 列表变了**：v1 默认启用大部分 linter；v2 默认只启用少量核心 linter，需要在配置中显式 `enable` 你要用的。
- **配置文件格式更严格**：v2 的 YAML schema 更清晰，错误的配置会被拒绝。
- **更快的启动速度**：重新设计了内部架构。

升级建议：新项目直接用 v2，老项目先运行 `golangci-lint migrate` 把 v1 配置转成 v2 格式。

---

## 总结

golangci-lint 解决的核心问题：**不要自己一个个装 lint 工具**。

它的设计哲学可以总结为三点：

1. **聚合** — 一个工具代替一百个工具
2. **并行** — 充分利用多核 CPU，速度飞快
3. **可配置** — YAML 文件控制一切，CI 和本地行为一致

对于 Go 项目来说，装上 golangci-lint 并配上 `.golangci.yml`，几乎是每个项目的标配。

---

*参考资料：https://github.com/golangci/golangci-lint · https://golangci-lint.run*

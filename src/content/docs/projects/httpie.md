---
title: "HTTPie — curl 的人话版本"
来源: https://github.com/httpie/cli
日期: 2026-05-30
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

HTTPie 是 Jakub Roztocil 在 2012 年用 Python 写的**命令行 HTTP 客户端**。日常类比：

- **curl**：1997 年的瑞士军刀，什么协议都能发，但默认像哑终端——不彩色、不缩进、得自己写 `-H 'Content-Type: application/json'`
- **HTTPie**：把 curl 的"裸金属"换成"人话默认值"——彩色、自动缩进 JSON、自动加 JSON header，命令读起来像一句英文

最小例子，发一个带 JSON body 的 POST：

```bash
http POST https://api.example.com/users name=Alice age:=30 admin:=true
```

对比同样的 curl：

```bash
curl -X POST https://api.example.com/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","age":30,"admin":true}'
```

HTTPie 的命令短了一半，而且 `name=Alice`（字符串）、`age:=30`（数字）、`admin:=true`（布尔）这种 DSL 一眼能看懂。

## 为什么重要

HTTPie 在 CLI 工具链里**站住了"调 API 时给人看的那一面"**：

- **35k+ stars**——比 curl 当然小，但作为"二选一替代品"已经是事实标准
- **每个公司的 API 文档示例几乎都同时给 curl + HTTPie 两版**（Stripe、Cloudflare、Algolia 都有）
- **本地调试场景把 curl 几乎完全替换**：开发自家 REST API 时谁也不想每次手写 header，HTTPie 默认就把 JSON 那一套配好
- **作者 14 年持续维护**——2012 首发到 2026，从 v0.x 一路到 v3.x，没有死过

如果说 [[jq]] 是"shell 里看 JSON"的护城河，HTTPie 就是"shell 里发请求"的护城河。两者经常成对出现：HTTPie 取数据，jq 拆数据。

## 核心要点

HTTPie 的心智模型可以拆成 **三层**：

1. **命令格式**：`http [METHOD] URL [item ...]`——method 可省（默认 GET，**有 body 时自动变 POST**），URL 必填，后面跟任意多个"请求项"。

2. **请求项 DSL**：靠不同分隔符区分语义。

   | 分隔符 | 意义 | 例子 |
   |--------|------|------|
   | `=` | JSON 字段（字符串） | `name=Alice` |
   | `:=` | JSON 字段（**非字符串**：数字/布尔/数组/对象） | `age:=30` / `tags:='["a","b"]'` |
   | `==` | URL query string | `page==2` |
   | `:` | HTTP header | `Authorization:Bearer xxx` |
   | `@` | 文件上传（multipart） | `avatar@./pic.png` |
   | `=@` | 从文件读 JSON 字符串值 | `bio=@./bio.txt` |

3. **默认值的态度**：HTTPie 假设你**在调 JSON API**——自动设 `Content-Type: application/json`、自动 `Accept: application/json`、彩色 + 缩进输出。如果你要表单 POST，加 `--form` / `-f` 切回去。

三条加起来就是它的全部——比 curl 的 50+ 个 flag 友好太多。

## 实践案例

### 案例 1：调一个 GitHub API 看星数

```bash
http https://api.github.com/repos/httpie/cli
# 自动彩色 + JSON 缩进，星数一眼能找到
```

只想看一个字段？接 [[jq]]：

```bash
http https://api.github.com/repos/httpie/cli | jq '.stargazers_count'
```

### 案例 2：带认证 + 自定义 header + JSON body

```bash
http POST https://api.example.com/posts \
  Authorization:'Bearer xyz' \
  X-Trace-Id:abc123 \
  title=Hello \
  views:=0 \
  tags:='["news","tech"]'
```

`Authorization:` 是 header（冒号），`title=` 是字符串字段，`views:=0` 是数字字段，`tags:='[...]'` 是数组字段。

### 案例 3：用 session 复用登录态

```bash
# 第一次登录，把 cookie 存起来
http --session=work POST api.example.com/login user=me pass=123

# 后续命令自动带上 cookie
http --session=work GET api.example.com/me
```

session 文件存在 `~/.config/httpie/sessions/<host>/<name>.json`——跨终端、跨重启都还在。

### 案例 4：下载文件

```bash
http --download https://example.com/big.zip
# 自动从 Content-Disposition 取文件名，显示进度条
```

## 踩过的坑

1. **`=` 和 `:=` 混淆**：`age=30` 会被当成字符串 `"30"`，要写 `age:=30` 才是数字。新手第一周一定会踩。

2. **Python 启动开销**：HTTPie 是 Python 写的，冷启动 50-100ms。在 CI 循环里发几百个请求会感觉到——这种场景换 [[xh]]（Rust 重写、兼容 HTTPie 语法）。

3. **POST 表单不是默认**：HTTPie 假设你发 JSON。要 `application/x-www-form-urlencoded` 必须加 `--form` / `-f`，否则后端收到 JSON body 直接 400。

4. **`--verbose` 对 binary 响应乱码**：默认会打印响应 body。如果是图片/PDF，终端会被一堆乱码刷屏。用 `--print=Hh`（只打 header）或 `--download` 接管。

5. **`http` 名字和系统命令冲突**：某些发行版有 `http` 工具（GNU httpd 控制等）。冲突时用全名 `httpie` 或 alias。

6. **Session 不自动 merge**：同一域名两个 session 互不影响——cookie 不会自动跨 session 复用，要手动导出导入。

## 适用 vs 不适用场景

**适用**：
- 本地调试 REST / GraphQL API（最高频场景）
- 写 API 文档示例（比 curl 易读太多）
- 临时给 API 发请求确认行为
- shell 脚本里发少量请求 + 配 [[jq]] 解析

**不适用**：
- CI 高频请求 / 性能敏感场景 → 用 xh 或 curl（C 写的，零启动开销）
- 需要 HTTP/3、QUIC、奇怪协议 → curl 更全
- 离线 / 只能装一个 HTTP 工具的容器 → curl 几乎所有 base image 都自带
- 复杂 multipart + 流式上传 → curl 的 `-T` 更灵活

## 历史小故事（可跳过）

- **2012**：Jakub Roztocil（捷克程序员）在 Twitter 发首版 0.1，标语 "a CLI HTTP client that will make you smile"。
- **2013-2017**：从命令行小项目长成默认依赖；GitHub / DigitalOcean / Heroku 等大厂把它写进文档。
- **2019**：Jakub 成立 httpie.io 公司，把 CLI 商业化为 web 桌面客户端（类 Postman），CLI 仍 BSD 开源。
- **2022**：v3.0 把代码库从 `httpie/httpie` 拆成 `httpie/cli`，同时发布 desktop app。
- **2023-2026**：xh（Rust）/ curlie（Go）等兼容版本流行，但官方 HTTPie 仍是事实标准——因为 Python 生态广、扩展插件多。

## 学到什么

1. **默认值是工具的灵魂**——curl 和 HTTPie 功能 80% 重叠，体验差距全在默认行为：HTTPie 默认彩色、默认 JSON、默认友好。后来者打不过老前辈的"覆盖率"，但能在"默认体验"上完全重写。

2. **DSL 越短越好用**——`name=Alice age:=30` 这种语法只用了 4 个分隔符，但能表达 95% 的 HTTP 请求。jq 用 `.foo | .bar`，HTTPie 用 `=` `:=` `==` `:` `@`，都是"小语言赢大场景"的同款思路。

3. **CLI 工具的护城河是"文档示例进入大厂"**——一旦 Stripe / GitHub 把你写进官方文档，新人学 API 时第一次看见的就是你。这种"教科书地位"是任何重写都抢不走的。

4. **同一个生态可以容下多代实现**——HTTPie（Python）/ xh（Rust）/ curlie（Go）共用一套语法，各自占不同性能段位。这种"协议层共享、实现层竞争"是 Unix 工具链的健康形态。

## 延伸阅读

- 入门：[HTTPie 官方文档](https://httpie.io/docs/cli)（结构清晰，30 分钟看完上手）
- 在线 playground：[httpie.io/app](https://httpie.io/app)（粘 URL 直接发，看请求/响应）
- 速查：[HTTPie cheat sheet](https://devhints.io/httpie)（一页常用命令）
- 设计：[Jakub 的原始博客](https://jakubroztocil.com/)（HTTPie 起源故事）

## 关联

- [[jq]] —— `http ... | jq '...'` 是调 JSON API 的标配组合
- [[yq]] —— 调 YAML API（k8s manifest 之类）时配 yq
- [[dasel]] —— 多格式选择器，HTTPie 输出格式不固定时用它一把切
- [[fx]] —— HTTPie 拿到大 JSON 后丢进 fx TUI 浏览
- [[curl]] —— 老前辈、对手、CI 里的备份方案
- [[xh]] —— Rust 重写版，兼容 HTTPie 语法但启动快 10×

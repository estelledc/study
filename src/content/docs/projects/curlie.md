---
title: 'curlie — curl 的能力 + HTTPie 的语法'
来源: https://github.com/rs/curlie
日期: 2026-05-30
分类: CLI
难度: 入门
---

## 是什么

curlie 是 Olivier Poitrey（GitHub `rs`）在 2018 年用 Go 写的**命令行 HTTP 客户端**，目标只有一句话："curl 的能力 + HTTPie 的易用"。日常类比：

- **curl**：1997 年的瑞士军刀，协议最全、flag 最多，但默认输出像哑终端
- **[[httpie]]**（Python）：把 curl 写成人话——彩色、JSON 缩进、`name=Alice` 短 DSL，但功能是 curl 的子集
- **curlie**：不重写 HTTP 栈，**直接 wrap 系统 curl 二进制**——HTTPie DSL 在前端解析后翻译成 curl 参数交出去，所以 curl 能干的它全能干

最小例子，与 HTTPie 几乎一字不差：

```bash
curlie POST https://api.example.com/users name=Alice age:=30 admin:=true
```

curlie 在内部把它翻成大致这样的 curl 命令再执行：

```bash
curl -X POST https://api.example.com/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","age":30,"admin":true}'
```

加 `--curl` flag 就能把翻译后的 curl 命令直接打印出来——贴进文档、工单、CI log 都现成。

## 为什么重要

curlie 在 CLI 工具链里**站住了"想要 HTTPie 语法 + curl 全功能"这个细分位**：

- **3.7k stars**——比 [[httpie]] 小一个量级，也比 [[xh]] 略小，但活了 6 年没死
- **零 HTTP 兼容性风险**：HTTP/3、SOCKS5、HTTP/2 server push、客户端证书、`--resolve` 这些 curl 独占的 flag 全都自动支持，因为底层就是 curl
- **header 走 stderr，body 走 stdout**：这点和 [[httpie]] 不一样。`curlie ... | jq '.x'` 直接拿干净 body，不用 `-s` 抑制元数据
- **作者 6 年持续维护**：rs 也是 graphql-go、rest-layer 作者，社群信誉高；最新 v1.8.2（2025-03）

如果说 [[httpie]] 是"curl 的人话版"，[[xh]] 是"HTTPie 的 Rust 版"，curlie 就是"HTTPie 的 curl-passthrough 版"。三者刚好覆盖三种使用偏好。

## 核心要点

curlie 的心智模型可以拆成 **三层**：

1. **命令格式与 HTTPie 一致**：`curlie [CURL_OPTIONS] [METHOD] URL [item ...]`——method 可省（默认 GET，**有 body 时自动 POST**），中间还能塞 curl 原生 flag（`-k`、`--http3`、`--resolve` 等）。

2. **请求项 DSL 完全继承 HTTPie**：

   | 分隔符 | 意义 | 例子 |
   |--------|------|------|
   | `=` | JSON 字段（字符串） | `name=Alice` |
   | `:=` | JSON 字段（**非字符串**） | `age:=30` |
   | `==` | URL query string | `page==2` |
   | `:` | HTTP header | `Authorization:Bearer xxx` |
   | `@` | 文件上传（multipart） | `avatar@./pic.png` |
   | `=@` | 从文件读 JSON 字符串值 | `bio=@./bio.txt` |

3. **输出哲学不同于 HTTPie**：header → stderr，body → stdout，不缓冲（流式响应实时显示）。再加 `--pretty` 强制彩色 + 缩进、`--curl` 反向打印等价 curl 命令。

三条加起来——**学过 HTTPie 不用重学 DSL，学过 curl 不丢任何 flag**。

## 实践案例

### 案例 1：用 HTTPie 语法触发 curl 独占的 HTTP/3

```bash
curlie --http3 GET https://cloudflare-quic.com
# HTTPie / xh 都不支持 HTTP/3；curlie 因为底层是 curl，加 flag 即可
```

如果要看 curlie 实际生成的 curl 命令：

```bash
curlie --curl --http3 GET https://cloudflare-quic.com
# 打印出完整 curl 命令，复制即能在没装 curlie 的机器上跑
```

### 案例 2：header 走 stderr 让管道直接对接 [[jq]]

```bash
curlie https://api.github.com/repos/rs/curlie | jq '.stargazers_count'
# 不需要 -s / --silent，header 自动走 stderr 不混进 jq
```

对比 HTTPie 同样写法：

```bash
http https://api.github.com/repos/httpie/cli | jq '.stargazers_count'
# 默认会把彩色 header 也打到 stdout，必须加 --print=b 才干净
```

### 案例 3：客户端证书 + HTTPie DSL 一起上

```bash
curlie --cert client.pem --key client-key.pem \
  POST https://internal.example.com/secure \
  Authorization:'Bearer xxx' name=Alice age:=30
```

`--cert` / `--key` 是 curl 原生 flag，`Authorization:` / `name=` / `age:=` 是 HTTPie DSL，curlie 把它们一起处理，没有 HTTPie 插件那种"自己重写一份"的负担。

### 案例 4：流式输出实时看 SSE

```bash
curlie -N https://api.example.com/events
# 不缓冲，event-stream 一行行实时打出来；HTTPie 默认会等 body 收完再格式化
```

## 踩过的坑

1. **必须有 curl 在 PATH**：curlie 不内置 HTTP 栈，**spawn 系统 curl 子进程**。`docker run alpine curlie` 会直接报错——要么先 `apk add curl`，要么换 [[xh]]（Rust 单二进制，内置 HTTP 栈）。

2. **header 走 stderr 偶尔反而不方便**：脚本里 `curlie ... > /tmp/out.txt` 只拿到 body，想存完整请求/响应得 `curlie ... > out.txt 2>&1`，且这样输出顺序可能错乱（异步 flush）。

3. **启动开销 = curlie + curl 两段**：实测约 15-30ms（curl 5-10ms + curlie 解析 10-20ms），比 [[xh]] 的 5ms 慢，比 [[httpie]] 的 100ms 快。CI 几百次循环时差距能感知，但比 HTTPie 已经好很多。

4. **复杂 JSON DSL 翻译可能不完美**：嵌套 `:=` 数组、流式上传等高级用法，curlie 翻成 curl 时行为偶有偏差。建议先 `--curl` 打印出来确认。

5. **更新跟随系统 curl**：HTTPS / HTTP2 / HTTP3 是否可用，**取决于系统 curl 的编译选项**。macOS 自带 curl 不带 HTTP/3，得 `brew install curl` 装新版并替换 PATH。

6. **HTTPie 插件生态完全无法用**：`httpie-oauth`、`httpie-aws-auth` 这类插件 curlie / [[xh]] 都不支持，需要时只能退回 [[httpie]]。

## 适用 vs 不适用场景

**适用**：

- 想用 HTTPie 风格 DSL，但任务需要 curl 独占功能（HTTP/3、SOCKS、`--resolve`、客户端证书）
- 在 shell 管道里频繁 `curlie | jq` 取字段，希望 header 自动分流不污染 stdout
- 写文档时想同时给 HTTPie 风格命令 + 等价 curl 命令（`--curl` 一键导出）
- 已经熟悉 curl 大量 flag，不想为了好看的输出去学一套新工具

**不适用**：

- CI / scratch 镜像里**没装 curl**——curlie 没法独立运行，换 [[xh]]
- 极度追求启动速度（千次循环）——[[xh]] 5ms 还是更快
- 需要 HTTPie 插件生态（OAuth、AWS sigv4）→ 退 [[httpie]]
- 团队完全不熟 HTTPie / curl 任意一边——直接学 curl，通用性最强

## 历史小故事（可跳过）

- **2018**：Olivier Poitrey（rs）在 GitHub 发首版。他在 Algolia 做 SRE，每天大量调内部 API，HTTPie 缺 curl 的 flag，curl 输出又难读，索性自己写一层薄包装。
- **2019-2020**：从几百 stars 涨到 2k，社区贡献者补全 `--curl` 反向打印、彩色、流式输出。
- **2021-2024**：稳定在 3k+ stars，跟 [[xh]] 形成"功能优先 vs 速度优先"双子星。
- **2025-03**：v1.8.2 发布，主要修小 bug + 跟进新版 curl 的几个 flag 解析。仍是 6 年同一作者维护，没有"半路弃坑"风险。

## 学到什么

1. **不重写底层是合法选择**——[[xh]] 选了"换 Rust 重写整个 HTTP 栈"，curlie 选了"复用系统 curl 二进制"。后者代码量小一个量级，但拿到 curl 全部协议支持。这是 Unix 哲学"组合 > 重写"的现代示例。

2. **stderr / stdout 分流是 CLI 设计的隐藏维度**——HTTPie 把 header 也打到 stdout，让 `| jq` 老踩坑；curlie 默认 header → stderr，让管道天然干净。一个细节差距，决定脚本里好不好用。

3. **同一 DSL 可以有多种实现并存**——HTTPie 语法被 [[xh]]（Rust 重写）和 curlie（curl wrapper）同时复用，三个实现各占性能 / 兼容性 / 易用性的不同极点。这种"协议层共享、实现层竞争"在 [[httpie]] 笔记里也强调过。

4. **3k stars 的工具不必跟 30k 工具比影响力**——细分位（HTTPie 语法 + curl 兼容）够稳定就够当默认推荐。CLI 工具链不是赢家通吃市场。

## 延伸阅读

- 仓库 README：[rs/curlie](https://github.com/rs/curlie)（一页，5 分钟读完）
- 与 HTTPie 差异：README "Differences with HTTPie" 章节（4 条核心区别）
- 安装：`brew install curlie` / `go install github.com/rs/curlie@latest` / GitHub release
- 反向理解：先读 [curl manpage](https://curl.se/docs/manpage.html)，再看 curlie 怎么把它"短"了一半

## 关联

- [[httpie]] —— DSL 的源头；curlie 把 HTTPie 语法接到 curl 上
- [[xh]] —— 同样兼容 HTTPie 语法，但是 Rust 重写整个 HTTP 栈，curlie 选了相反的"复用 curl"路线
- [[jq]] —— `curlie ... | jq '...'` 是调 JSON API 的标配；curlie 的 stderr 分流让这条管道天然干净
- [[yq]] —— 调 YAML / k8s API 时配 yq
- [[dasel]] —— 多格式选择器，curlie 输出格式不固定时一把切
- [[fx]] —— curlie 拿到大 JSON 后丢进 fx TUI 浏览

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

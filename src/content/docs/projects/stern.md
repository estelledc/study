---
title: stern — 多 pod 多 container 日志聚合 tail
来源: https://github.com/stern/stern
日期: 2026-05-31
分类: DevOps / Kubernetes
难度: 入门
---

## 是什么

stern 是一个**专门替你同时 tail 一堆 Kubernetes pod 日志的命令行工具**。一句话：你给个正则 `myapp`，它把所有名字命中的 pod、所有 container 的实时日志，染上颜色，按行混到同一个屏幕。

日常类比：

- 用裸 `kubectl logs` 像**只能听一个频道的收音机**——一次只能盯一个 pod 一个 container；replica 有 5 份就要开 5 个终端。
- 用 stern 像**多频道扫描仪**——所有命中的频道一起播，每个频道带自己的颜色标签，肉眼一扫就知道这条日志来自哪台机器。

它最早由 Wercker 团队开源，后来社区在 `stern/stern` 继续维护（原仓库已停更），Go 写成单个二进制，GitHub 近 5k 星。Kubernetes 运维和后端开发日常工具链里，它常和 kubectl、k9s、kubectx 一起出现。

## 为什么重要

不用 stern，下面这些事每天都很折磨：

- **多副本服务排错**：deployment 跑 3 个 replica，bug 只在其中一个 pod 上复现。`kubectl logs` 要逐个挨着看；stern 一条命令全开，染色后哪一个 pod 在报错一眼定位。
- **multi-container pod**：sidecar 模式（应用 + envoy + log-agent）一个 pod 三个 container，`kubectl logs pod -c envoy` 切来切去；stern 默认一起拉，按 container 颜色区分。
- **滚动发布观察**：deploy 时新 pod 不断起、旧 pod 不断关。stern 的 watch 循环自动加入新 pod、自动断流被删的 pod，全程不用重连。
- **跨服务追因**：`stern .` 加 `-n staging` 直接把整个 namespace 的日志混到一屏，配合 `--include 'trace_id=abc'` 二级过滤，分布式追踪现场感很强。

## 核心要点

stern 干的事可以拆成 **四件**：

1. **正则匹配 pod 名**
   - `stern myapp` → 匹配 `myapp-7d9f-abc`、`myapp-canary-xyz` 等所有名字含 `myapp` 的 pod
   - 正则不锚定，`api` 会匹配 `capi`、`mapi` —— 想精确写 `^api-` 或 `'api-.*'`

2. **watch loop + tail goroutine**
   - 用 Kubernetes 的 watch API 持续监听 pod 列表变化
   - 每命中一个 pod / container 就开一个 goroutine 去 stream 它的日志
   - pod 被删则 goroutine 退出；新 pod 加入则启动新的 goroutine

3. **每个 pod 染色**
   - 用 `hash(podname + container)` 选一种 ANSI 颜色，稳定但偶尔撞色
   - 输出格式：`pod-name container-name | 日志行`，颜色标在前缀
   - 关掉颜色用 `--no-color`，方便 grep 或重定向到文件

4. **二级筛选与时间窗**
   - `--since 5m` 只看最近 5 分钟，`--tail 10` 每个 pod 起步只回拉 10 行
   - `--include 'pattern'` 行内正则保留，`--exclude 'health'` 把噪音剔掉
   - `-o json` 把每行包成 JSON，方便接 jq 或日志管道

## 实践案例

### 案例 1：调试一个出错的 deployment

```sh
stern myapp -n staging --since 10m --tail 5
```

含义：staging namespace 里所有名字含 `myapp` 的 pod，每个回拉最近 10 分钟、最多每 pod 起步 5 行，然后实时跟着新日志。

界面长这样（颜色不同但这里只能用文字示意）：

```
myapp-7d9f-abc app   | 2026-05-31T10:23:01 INFO  request id=req-1
myapp-7d9f-xyz app   | 2026-05-31T10:23:01 ERROR connection refused
myapp-7d9f-abc nginx | 10.0.0.5 GET /api/v1/users 200
```

三种颜色一眼分清三股流。

### 案例 2：用 selector 而不是名字正则

```sh
stern --selector app=web -c nginx -n prod
```

`--selector` 走 Kubernetes label，比正则名字稳：deployment 改名不影响。`-c nginx` 限定只看 nginx container，跳过 sidecar。

### 案例 3：抓含特定 trace 的日志

```sh
stern . -n api --include 'trace_id=abc-123' -o json
```

`.` 匹配所有 pod；`--include` 行内正则；`-o json` 把每行包成带 `message` 等字段的 JSON，方便管道：

```sh
stern . -n api --include 'trace_id=abc-123' -o json | jq -r .message
```

若只要纯日志正文、自己再 grep，用 `-o raw`（不再包 JSON，也就不能对 stern 字段做 `jq .message`）。

## 内部结构（简化版）

源码不大，主流程集中在几个文件：

- `main.go` + `cmd/cmd.go`：入口与 Cobra root，把 CLI flag 解析成 config
- `stern/config.go`：运行时配置结构 + 默认值
- `stern/stern.go`：主 watch loop —— 调 client-go 的 Pod watch，事件驱动开关 tail
- `stern/tail.go`：单 pod 单 container 的 log stream goroutine —— 染色、行格式、断流重连

读这份代码能直接学到三件事：怎么用 client-go 的 watch、怎么用 goroutine 管理动态资源、怎么把 ANSI 颜色封装成可关闭的 writer。

## 踩过的坑

1. **默认 namespace 是 default**：跨 ns 必须 `-n <ns>` 或 `-A`（all namespaces），不然永远空屏。
2. **正则不锚定**：`stern api` 匹配所有含 `api` 的 pod，包括 `capi-controller`、`mapi-test`。要精确写 `'^api-'`。
3. **断流重连有空窗**：如果 pod OOM 重启，stream 会断 → 重连，中间几秒日志可能丢。重要日志靠中心化日志系统，不要靠 stern 兜底。
4. **kubeconfig context 切换要重启**：stern 启动时读一次 kubeconfig，运行中你 `kubectx` 切了 cluster，stern 还在跟旧 cluster。
5. **颜色撞车**：6+ 个 pod 时哈希算法可能给两个 pod 分到相近颜色，肉眼难分。可以加 `-t`（含时间戳）+ `--no-color` 后用 awk 重染。

## 适用 vs 不适用场景

**适用**：

- 临时排错 / 滚动发布观察 / 多副本同时观察
- 学习 client-go watch + goroutine 模式的范例代码（近 5k 星的 Go 小工具里少有这么好读的）
- 替代 `kubectl logs -f` 加 `&` 后台拼接的土法

**不适用**：

- **生产长期日志归档**：stern 是 tail 工具，不是采集器。生产应该上 Fluent Bit / Loki / ELK。
- **大规模 pod**（500+ 同时命中）：每个 pod 一个 goroutine + 一个 HTTP stream，会把 API server 拉爆，应该上服务端聚合方案。
- **跨 cluster 聚合**：stern 一次只能跟一个 kubeconfig context；多 cluster 得开多个终端或自己写 wrapper。

## 学到什么

1. **CLI 工具的颗粒度**：一个工具只做一件事，但把这件事做到极致。stern 不做日志归档、不做指标、不做查询，只做 tail —— 但 tail 的体验远超 kubectl 原生。
2. **watch + goroutine 是 K8s 客户端的标配**：动态资源（pod 起起落落）天然适合事件驱动 + 协程池。这套结构看懂一次，写自己的 K8s 工具就有模板。
3. **染色让多源信息可读**：终端是单线性流，但人脑能并行追多个颜色通道。在多源混流的 CLI 工具里，染色是几乎零成本的体验提升。

## 安装与配置小贴士

macOS：`brew install stern` 一行；Linux 直接下 release 二进制丢 `/usr/local/bin`。装完打 `stern --completion=zsh > ~/.stern.zsh` 加入 rc，可以补全 namespace、context、container 名。

常配的 alias（写到 zshrc）：

```sh
alias slog='stern --tail 5 --since 5m'
alias slogp='stern --tail 5 --since 5m -n prod'
```

`stern --completion=fish` 也支持，bash 同理。

## 与同类工具的对比

| 工具 | 定位 | 优势 | 劣势 |
| --- | --- | --- | --- |
| `kubectl logs` | 单 pod 单 container | K8s 自带，零依赖 | 不能聚合，不能 watch 新 pod |
| `kail` | 多 pod 聚合 tail | 比 stern 更早 | 维护停滞，染色弱 |
| `kubetail` | bash 版聚合 | 极简 | 性能差，pod 多时卡 |
| stern | 多 pod 聚合 tail（Go） | 染色 + watch + 二级筛选 | 不做归档 |
| `k9s` | TUI 整体管理 | 覆盖广，可点击 | 体量大，tail 体验不如 stern |

写自己的 CLI 工具时，stern 是一份好范例：保持范围窄、把核心做到极致。

## 延伸阅读

- 仓库：[stern/stern](https://github.com/stern/stern)（Go，近 5k 星）
- 入门视频教程：搜 YouTube `stern kubernetes logs` 有多个 5 分钟入门
- 想读源码可以从 `stern/tail.go` 的 `Start` 函数入手，全文几百行
- client-go watch 模式官方文档：[client-go/tools/watch](https://pkg.go.dev/k8s.io/client-go/tools/watch)

## 关联

- [[kubectx]] —— 同作者风格的 K8s 小工具，切 context 与 ns
- [[k9s]] —— TUI 视图整体管理，覆盖更广但更重
- [[helm]] —— K8s 包管理，stern 常用来观察 helm install 后的 rollout
- [[kubernetes]] —— 上游本体，stern 是它的 watch API 的标准消费者

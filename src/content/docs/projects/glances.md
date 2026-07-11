---
title: Glances — Python 写的全栈系统监控（终端 + Web + REST + 远程）
来源: 'https://github.com/nicolargo/glances'
日期: 2026-05-30
分类: cli
难度: 初级
---

## 是什么

Glances 是一个**用 Python 写的跨平台系统监控工具**，一份代码同时支持五种姿势：终端 / Web 浏览器 / REST API / 客户端-服务器远程 / 导出到 Prometheus 等监控栈。日常类比：像一个**身兼数职的体检医生**——同样是给系统做全面体检（CPU、内存、磁盘、网络、进程、容器），htop 只能在终端看，Grafana 只能看历史曲线，Glances 是一个人把这些活全干了。

你在终端敲：

```bash
glances
```

就出来一屏：CPU 使用率、内存、磁盘 IO、网卡流量、Top 进程、Docker 容器、传感器温度——**一屏全在**。换 `-w` 参数同一份代码就变成 Web 服务器，浏览器打开 `http://host:61208` 一样的视图。换 `--export prometheus` 同一份代码就变成 Prometheus exporter。

## 为什么重要

不理解 Glances 这种工具，下面这些事都没法解释：

- 为什么运维有 htop 还要装 Glances——htop 没 Web、没 REST、没远程、没容器视图
- 为什么 Prometheus + Grafana 那么强还有人用 Glances——监控栈搭起来要半天，Glances 一行命令就出图
- 为什么"小公司监控选型"经常推 Glances——开发/运维/SRE 共用一份工具，学习成本最低
- 为什么 Glances v4 要加 MCP server——AI agent 直接查指标，不用先装 Prometheus 再写 PromQL

## 核心要点

Glances 的设计可以拆成 **三层**：

1. **采集层（plugins）**：每个指标是一个 plugin，比如 `cpu` / `mem` / `docker` / `gpu`。底层用 `psutil` 拿 OS 指标，扩展用 `nvidia-ml-py`、`docker SDK` 等。类比：一栋楼里每个房间装一个传感器，互不影响——加新房间不影响老房间。
2. **展示层（multi-frontend）**：同一份采集结果，curses 渲染成终端 UI，Bottle/FastAPI 渲染成 Web HTML，FastAPI 暴露成 JSON REST。一组数据，三套皮肤，**写一份数据采集逻辑就能服务三种用户**。
3. **导出层（exporters）**：CSV / JSON / InfluxDB / Prometheus / Elasticsearch / Kafka 都是一个个独立 exporter。类比：体检报告可以打印纸质、发邮件、传到云端，看你想怎么用。

三层都是**插件化解耦**的，加新指标或新后端只需要写一个文件，不用改主流程。这是 Glances 能十几年持续扩展的原因。

## 实践案例

### 案例 1：终端单机看一眼

最简单的姿势——服务器异常了，SSH 上去看一眼：

```bash
$ glances
```

**逐部分解释**：

- 顶部一行：CPU / 内存 / 负载 / 温度，颜色标红=超阈值
- 左侧：网络（每个网卡 RX/TX）+ 磁盘 IO + 文件系统使用率
- 右侧：Top 进程按 CPU 排序，按 `m` 切换按内存排
- 底部：Docker 容器列表（如果装了 `glances[docker]`）

按 `q` 退出，按 `h` 看快捷键。比 htop 多了**网络/磁盘/容器/温度**四类。

### 案例 2：Web 模式给团队分享

只有自己 SSH 进得去的服务器，想让前端同事也看一眼实时状态：

```bash
$ glances -w
Glances Web User Interface started on http://0.0.0.0:61208/
```

浏览器打开 `http://<server-ip>:61208`，**不用装客户端**，看到的视图和终端版完全一样。如果想暴露 REST：

```bash
$ curl http://localhost:61208/api/4/cpu | jq .total
3.2
```

可以接到任何脚本里。注意：**生产暴露公网必须前面套一层 nginx + Basic Auth**，Glances 自身没鉴权。

### 案例 3：对接 Prometheus + Grafana

正经监控栈，要长期存指标画曲线：

```bash
$ pip install glances[prometheus]
# glances.conf 里写：
# [prometheus]
# host=0.0.0.0
# port=9091
$ glances --export prometheus
```

Glances 按配置在 `host:port`（默认 `localhost:9091`）暴露 `/metrics`，Prometheus scrape 它就能存进去，Grafana 里建 dashboard。比写自己的 exporter 省一周。**坑**：默认端口 9091 跟 Pushgateway 撞，多实例要改 conf 里的 `port=`，没有 `--export-prometheus-port` 这种 CLI。

## 踩过的坑

1. **Python 版本**：v4 要 Python 3.10+，老服务器（CentOS 7 自带 3.6）装包前先 `python --version`，否则 pip 装完跑不起来报 SyntaxError
2. **可选依赖陷阱**：基础包 `pip install glances` 不含 web/docker/prometheus，开 `-w` 报"missing fastapi"，需要 `pip install glances[web]` 或 `glances[all]`
3. **Docker 视图看不到容器**：跑在容器里时忘了挂 `/var/run/docker.sock`，启动命令要加 `-v /var/run/docker.sock:/var/run/docker.sock`，否则 docker plugin 永远空
4. **Prometheus 端口冲突**：9091 跟 Pushgateway 撞；多实例同机要在 `glances.conf` 的 `[prometheus] port=` 改掉，第二个实例起不来时先查端口占用

## 适用 vs 不适用场景

**适用**：

- 个人开发机/小团队服务器实时监控（一行命令出图）
- 临时排查 + 给非运维同事看一眼（Web 模式）
- 给 ChatOps / AI agent 提供系统指标接口（REST + MCP server）
- 简单的指标导出到 Prometheus（省写自己 exporter 的活）

**不适用**：

- 大规模集群（>50 台）—— node_exporter + Prometheus 才是正统选型
- 长期历史趋势分析（Glances 自己不存历史，要靠外部 exporter）
- 极致性能开销敏感场景（Python 比 node_exporter 这种 Go 写的吃资源）
- 严格鉴权审计场景（Glances Web 自身没鉴权，要靠 nginx/前置网关补）

## 历史小故事（可跳过）

- **2012 年**：Nicolas Hennion 想做一个跨平台、Python 写的 htop 替代，目标是"Linux/macOS/BSD 都能用一份代码"
- **2014 年**：v2 加客户端-服务器模式（XML-RPC），不用 SSH 也能远程监控
- **2017 年**：v3 加 Docker 容器视图，跟上容器化运维的潮流
- **2019 年**：加 Web UI（Bottle 框架），从纯 CLI 工具变成"小型监控系统"
- **2022 年**：插件生态扩到 GPU / 传感器 / RAID / 云原生 K8s，从"系统监控"变成"基础设施可观测"
- **2024 年**：v4 切到 FastAPI，加 MCP server 让 AI agent（如 Claude）能直接查系统指标，星标突破 27k

12 年从"htop 替代品"演化成"监控生态网关"，是开源工具长期演进的典型案例。

## 学到什么

1. **插件化架构** 是同一份代码服务多场景的关键——采集/展示/导出三层解耦后，加新指标或新后端只是加一个文件，主流程不用动
2. **够用 + 易上手** 比"功能最全"更重要——Glances 不如 Grafana 强大，但 5 秒能跑起来，这就是它在小团队的护城河
3. **同一份数据多种渲染** 是好工具的共同模式——终端 UI / Web / REST 共用采集层，复用率最大化
4. **工具的演进路径**：单机 CLI → 加 Web → 加 REST → 加 AI 接口，每一步都跟着真实用户场景走，而不是盲目堆功能

## 延伸阅读

- 官方文档：[glances.readthedocs.io](https://glances.readthedocs.io/)（部署 / 配置 / 全部插件参数）
- psutil 源（Glances 的底层采集库）：[github.com/giampaolo/psutil](https://github.com/giampaolo/psutil)
- 视频教程：YouTube 搜 "Glances Python system monitor"，5 分钟入门
- 作者博客 nicolargo.com：作者 Nicolas Hennion 的设计笔记和发版说明
- [[htop]] —— 经典终端进程监控，Glances 的精神前辈
- [[btop]] —— Rust 写的现代 htop，UI 更花哨但没 Web/REST
- [[prometheus]] —— Glances 可以作为 exporter 接入的监控后端

## 关联

- [[htop]] —— 同样是终端系统监控，Glances 多了 Web/REST/远程/容器/温度等扩展能力
- [[btop]] —— 现代化的终端监控，UI 比 Glances 漂亮但没 Web/REST，场景更窄
- [[prometheus]] —— Glances 可以用 `--export prometheus` 把指标接入 Prometheus
- [[grafana]] —— Prometheus + Grafana 是 Glances 长期存储/画图的标准搭档
- [[clickhouse]] —— Glances 也支持导出到 ClickHouse 做大数据分析和 SQL 查询

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bandwhich]] —— bandwhich — 按进程实时显示带宽占用的跨平台 TUI
- [[duf]] —— duf — df 的彩色表格替代，按设备分组自动忽略伪文件系统
- [[lazygit]] —— lazygit — Go 写的全功能 git TUI，键盘驱动 stage / rebase / cherry-pick
- [[ncdu]] —— ncdu — du 的交互式 TUI，扫一次就能在终端里上下键钻目录删大文件
- [[procs]] —— procs — ps 的现代替代，彩色 + 树视图 + 多列搜索

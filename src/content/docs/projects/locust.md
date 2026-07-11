---
title: Locust — 用 Python 写压测脚本的分布式负载工具
来源: https://github.com/locustio/locust
日期: 2026-06-01
分类: DevOps
难度: 入门
---

## 是什么

Locust（蝗虫）是一个**用 Python 写测试脚本的负载/压测工具**：你描述"一个用户会做什么"，它就拿这个剧本派出几千只虚拟用户同时打你的服务，然后给你一个网页实时看延迟和错误率。

日常类比：开店前请一群人来排队走流程。Locust 就是那"一群人"——你写好每个人按什么顺序点餐、付款、退款，它负责复制几千份并掐表。

跑起来长这样：

```bash
pip install locust
locust -f locustfile.py
# 浏览器打开 http://localhost:8089，填用户数和孵化速率，点 Start
```

## 为什么重要

线上接口写完后，**单个请求测正确性容易**（curl / 单元测试就够），**1000 个并发下还正确并且不慢**完全是另一件事——连接池满、数据库锁、缓存击穿都只在并发下出现。压测工具就是把这种"只在压力下才暴露的 bug"提前在测试环境抓出来。

为什么选 Locust：

- **脚本就是 Python**——不像 JMeter 要在 GUI 里点 XML 树，也不像 k6 要学 JavaScript runtime
- **分布式开箱即用**——一台机器打不动就加机器，master/worker 用 TCP 自动协调
- **基于 gevent**——一个 Python 进程靠协程能伪装成上千用户，单机吞吐高
- **MIT 协议、一万行代码量级**——读代码学"分布式调度怎么写"很合适

## 核心要点

Locust 的核心抽象只有 **三个**：

1. **User 类**：描述"一种用户"。继承 `HttpUser` 就自带 HTTP client，每个虚拟用户是它的一个实例。
2. **@task**：标在方法上，告诉 Locust"这是用户会做的一个动作"。多个 task 之间按权重随机选。
3. **wait_time**：用户做完一个动作后等多久再做下一个，模拟真人思考时间。

跑模式有两种：

- **本地单进程**：`locust -f file.py`，开 web UI
- **分布式**：一台 `--master`（不发请求，只调度 + 收数据），N 台 `--worker --master-host=<ip>`（实际发请求）

底层引擎是 **gevent**——把同步代码的 `socket.recv` 自动切换成协程让出，所以一份"看起来阻塞"的 Python 代码能并发上千连接而不开上千线程。

## 实践案例

### 案例 1：30 行写一个登录 + 浏览的压测

```python
from locust import HttpUser, task, between

class WebsiteUser(HttpUser):
    wait_time = between(1, 3)  # 每个动作后等 1-3 秒

    def on_start(self):  # 每个虚拟用户一开始跑一次
        self.client.post("/login", json={"user": "alice", "pwd": "x"})

    @task(3)  # 权重 3，被选中的概率是另一个 task 的 3 倍
    def view_home(self):
        self.client.get("/")

    @task(1)
    def view_item(self):
        self.client.get("/item/42")
```

`locust -f locustfile.py` 启动后，浏览器开 8089 端口，填"用户数 100、孵化速率 10/秒"，点 Start。Locust 每秒孵化 10 个虚拟用户，到 100 后稳态运行，实时显示 RPS / p50 / p95 / 错误率。

### 案例 2：分布式打满一个微服务

单机 Python 受 GIL 限制，CPU 满了就上不去 RPS。Locust 的解法是开多进程：

```bash
# 调度机
locust -f file.py --master

# 每台 worker 机
locust -f file.py --worker --master-host=10.0.0.1
```

worker 通过 TCP 把每秒的请求统计推给 master，master 在 web UI 汇总。这样 10 台机器能造出 50k+ RPS。

### 案例 3：CI 里跑、不开 UI、阈值卡红线

```bash
locust -f file.py --headless -u 200 -r 20 -t 5m \
  --html report.html --csv stats \
  --exit-code-on-error 1
```

`--headless` 不开 web UI、`-t 5m` 跑 5 分钟、`--exit-code-on-error 1` 任何 HTTP 5xx 让进程返回非零——CI 直接当成测试失败处理，可挡发布。

## 踩过的坑

1. **wait_time 不是请求间隔，是 task 间隔**：一个 task 内连发 3 个请求是 0 延迟串起来，第 3 个完成后才进入 wait。新人常误以为"100 用户 + wait 1 秒 = 100 RPS"，其实 RPS 只跟 task 时长和 wait 都有关。

2. **HttpUser 默认 Cookie 跨用户共享是个错觉**：每个虚拟用户实例有自己的 session，**不会**互相串。但你如果不小心用了模块级 `requests.Session`，那就真串了。

3. **gevent 不能和 thread/asyncio 混**：要在 task 里调用 `boto3` 或某些原生 C 扩展，可能因为没被 monkey-patch 而真阻塞，整个进程的协程都卡住。Locust 启动时会自动 `gevent.monkey.patch_all()`，但第三方库不一定兼容。

4. **本机打本机会假阳性**：被压测服务和 Locust 同机时，CPU 互抢、loopback 网络栈也被搅乱，p99 数字不可信。把 Locust 放另一台机器再看。

5. **孵化太快会自伤**：`-r 1000` 每秒生成 1000 个虚拟用户，前几秒 Locust 自己 CPU 就 100%，看到的延迟是它自己排队的延迟不是被测服务的。常见做法是孵化速率 = 目标 RPS 的十分之一以下。

6. **报告里的 RPS 是平均值**：UI 顶部的"RPS"是采样窗内平均，瞬时尖峰看不出来。要看波动得开 Charts 标签或导 CSV 自己画。

## 适用 vs 不适用场景

**适用**：

- HTTP / WebSocket 接口压测（GraphQL、REST、gRPC-Web 都行）
- 测试本身写起来要灵活——比如登录拿 token、随机挑商品、读 CSV 喂数据
- 团队都是 Python 背景，不想为压测专门学一门语言
- 中等规模（单机几千到分布式几万 RPS）

**不适用**：

- 极端高 RPS（10w+ 单机）→ 用 Go 写的 [k6](https://k6.io/) 或 wrk2 更省机器
- 协议怪异（自定义 TCP / 二进制游戏协议）→ 自己写 Go/C 客户端
- 需要复杂浏览器行为（点 JS、等渲染）→ Selenium / Playwright，不是压测工具的活

## 历史小故事（可跳过）

- **2011 年**：Jonatan Heyman 在 ESN 公司压测 WebSocket 服务时，受不了 JMeter 在 GUI 里拖来拖去，写了 Locust 把脚本搬回 Python 代码。
- **2012 年**：开源到 GitHub，名字"蝗虫群"暗示"很多虚拟用户一起扑上来"。
- **2017–2020**：从 gevent 1.x 升级到原生支持 Python 3，并把 Web UI 从 jQuery 重写成 React（项目里 `webui/` 目录可见）。
- **2024+**：插件生态（locust-plugins、boomer Go worker）让它能压 gRPC、Kafka、MQTT 等非 HTTP 协议。

## 学到什么

1. **压测工具的本质**：把"一个用户的剧本"复制 N 份并发送出去 + 收集统计。各家工具的差异主要在"剧本怎么写"和"怎么复制"
2. **协程 vs 线程**：Locust 用 gevent 协程能在单进程模拟上千用户，是 IO 密集场景的标准解
3. **分布式调度模板**：master 不干活只调度 + 收统计、worker 真跑——这是很多分布式系统的常见骨架
4. **GUI 不一定省事**：JMeter 的 GUI 看起来友好，但脚本难 diff、难 review、难版本化；代码即剧本反而更可维护

## 延伸阅读

- 官方文档：[docs.locust.io](https://docs.locust.io)（含 Quick start 和分布式部署）
- 源码导读：从 `locust/runners.py` 开始读，看 master/worker 怎么用 ZeroMQ 通信、怎么同步统计
- [k6 vs Locust 对比](https://k6.io/blog/comparing-best-open-source-load-testing-tools/)（有偏向但数据有用）
- [[playwright]] —— 也是测试工具，但目标是浏览器端到端而非压力
- [[ann-benchmarks]] —— 同样属于"评测工具"家族，但场景是向量检索

## 关联

- [[playwright]] —— 测试同盟：Playwright 测正确、Locust 测压力
- [[ann-benchmarks]] —— 都是"工具去打另一个工具"的设计
- [[fastapi]] —— Locust 是 FastAPI 服务发布前最常用的压测工具之一
- [[airflow]] —— 同样是 Python 写的、单 master + 多 worker 的分布式调度结构

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[k6]] —— k6 — 用 JS 写脚本的现代负载测试器

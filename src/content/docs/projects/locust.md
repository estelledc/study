---
title: Locust — 用 Python User/task 描述虚拟用户的分布式负载工具
description: 介绍 Locust 2.46.4 如何用 User、加权 task 和 gevent runner 复制虚拟用户，并用 ZeroMQ 做 master/worker。
来源: https://github.com/locustio/locust
日期: 2026-08-27
分类: 可观测 / 性能
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/locustio/locust
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 407343d0f5ab84a32f41f6f9a7c991188d10a55a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.46.4
---

## 是什么

Locust 是用 Python 写“一个用户会做什么”的负载工具：类描述用户，方法描述动作，runner 再把这个类复制成许多协程。日常类比：先写一份点餐剧本，再复印给一群人同时走。

```python
from locust import HttpUser, task, between

class WebsiteUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        self.client.post("/login", json={"user": "alice", "pwd": "x"})

    @task(3)
    def view_home(self):
        self.client.get("/")

    @task(1)
    def view_item(self):
        self.client.get("/item/42")
```

`locust -f locustfile.py` 默认开 Web UI（端口 8089）。导入 `locust` 时，除非设置 `LOCUST_SKIP_MONKEY_PATCH`，会先 `gevent.monkey.patch_all()`。

## 为什么重要

不理解固定 2.46.4 的 User 元类、task 权重和 runner 类型，就解释不了下面几件事：

- 为什么 `@task(3)` 比 `@task(1)` 更容易被抽到
- 为什么默认 `wait_time = constant(0)`，不写 `between` 就会连打
- 为什么 `HttpUser.client` 不会在用户之间共享 Cookie
- 为什么单机不够时，既可以 `--master`/`--worker`，也可以 `--processes`

## 核心要点

固定 2.46.4 的主链可以拆成五步：

1. **导入即打补丁**：`locust/__init__.py` 在未跳过时调用 `monkey.patch_all()`，并把 urllib3 连接池换成 gevent 的 `LifoQueue`。公开符号包括 `User`、`HttpUser`、`FastHttpUser`、`task`、`between` / `constant` / `constant_pacing` / `constant_throughput`，以及 `LoadTestShape`。

2. **元类收集任务**：`UserMeta` 调用 `get_tasks_from_base_classes`。`@task(n)` 把 `locust_task_weight = n` 写到函数上，收集时把该函数重复追加 n 次。`get_next_task` 对这张列表做 `random.choice`。

3. **每个用户一份会话**：`HttpUser` 在 `__init__` 里新建 `HttpSession`（`requests.Session` 子类），`trust_env = False`。Cookie 跟实例走。缺 `host` 会 `StopTest`。更高吞吐的 HTTP 路径是 `FastHttpUser`（`geventhttpclient`），不是默认 `HttpUser`。

4. **跑完一个 task 再 wait**：`User.run()` 先 `on_start()`，再把控制交给 `DefaultTaskSet.run()`。循环是：取任务 → 执行 → 除非 `RescheduleTaskImmediately`，否则 `wait()`。`wait_time` 量的是 **task 间隔**，不是 task 内部两次 `client.get` 的间隔。基类默认 `wait_time = constant(0)`。

5. **三种 runner + 一种本机分叉**：`Environment` 可建 `LocalRunner`、`MasterRunner`、`WorkerRunner`。分布式默认走 `locust/rpc/zmqrpc.py`：master 是 ZMQ ROUTER，worker 是 DEALER。`--processes N` 会 `gevent.fork()` 出 worker，父进程升为 master。

## 实践示例

### 案例 1：加权 task 与思考时间

```python
from locust import HttpUser, task, between

class WebsiteUser(HttpUser):
    wait_time = between(1, 3)

    @task(3)
    def view_home(self):
        self.client.get("/")

    @task(1)
    def view_item(self):
        self.client.get("/item/42")
```

`view_home` 在 `tasks` 列表里出现三次，被抽中的机会是 `view_item` 的三倍。`between(1, 3)` 返回 `min + random() * (max-min)` 秒。

### 案例 2：本机多进程，不必先拆两台机器

```bash
locust -f locustfile.py --processes 4 --headless -u 200 -r 20 -t 5m
```

`main.py` 在未同时给 `--master` 时，fork 出 4 个 worker，父进程设 `master=True` 且 `expect_workers=4`。这是单机绕开 GIL 的路径，不是跨机器 RPC 的替代文档。

### 案例 3：跨机器 master/worker，CI 用退出码

```bash
locust -f locustfile.py --master --expect-workers 2 --headless -u 200 -r 20 -t 5m
locust -f locustfile.py --worker --master-host=10.0.0.1
```

`--exit-code-on-error` 默认是 1：统计里出现失败样本就用这个码退出，除非脚本改了 `environment.process_exit_code`。它不是“只有 HTTP 5xx 才失败”。

## 踩过的坑

1. **把 wait_time 当成请求间隔**：一个 task 里连发三个请求中间没有 wait；wait 发生在整个 task 返回之后。

2. **以为默认会“像真人一样停一下”**：`User.wait_time` 默认 `constant(0)`。不写 `between` / `constant` 就会立即下一轮。

3. **用模块级 `requests.Session`**：`HttpUser` 的会话是实例属性。模块级 Session 会让虚拟用户串 Cookie。

4. **和 thread / 未打补丁的 C 扩展混用**：导入时默认 `patch_all()`。第三方库若绕过 monkey patch，会堵住整个 gevent 循环。需要时可设 `LOCUST_SKIP_MONKEY_PATCH`。

5. **把 `--exit-code-on-error 1` 理解成“只抓 5xx”**：默认值已经是 1，触发条件是“测试结果里有失败或错误”，包括断言和请求异常。

6. **把 50k RPS、单机上限或 star 数写进结论**：本轮未跑负载，也未测吞吐。

## 适用 vs 不适用场景

**适用**：

- 剧本要用 Python 写：登录、读 CSV、按权重选任务
- 团队已经在 Python 里，并接受 gevent 协程模型
- 需要 master/worker 或 `--processes` 把负载摊到多个进程

**不适用**：

- 必须把脚本收成单二进制、用 JS threshold 做 CI 硬门——看 [[k6]]
- 协议完全自定义、不想走 User/task 抽象
- 需要真实浏览器渲染与定位——看 [[playwright]]
- 不能接受 Python `>=3.11`（`pyproject.toml` 的 `requires-python`）

## 固定版本边界

- 本文绑定 `locustio/locust@407343d0f5ab84a32f41f6f9a7c991188d10a55a`，轻量 tag `2.46.4` 直接指向此提交。
- 版本由 hatch-vcs 从 Git tag 生成，`version-file` 为构建产物 `locust/_version.py`，源码树里不提交该文件。
- `requires-python = ">=3.11"`；运行时依赖包括 `gevent>=24.10.1`、`pyzmq>=25.0.0`、`geventhttpclient>=2.3.1`、`requests>=2.32.2`。
- 可选 extra 有 `mqtt`、`dns`、`otel`、`milvus`、`qdrant`，本轮未安装。
- 本文未安装依赖、未启动 Web UI、未发真实负载，状态保持 `UNVERIFIED`。

## 学到什么

1. **权重是列表重复，不是运行时再算概率**——`@task(3)` 把同一个函数放进 `tasks` 三次。
2. **wait 在 task 之后**——task 内部的连续请求是 0 间隔。
3. **会话按 User 实例隔离**——`HttpUser` 每只虚拟用户一份 `HttpSession`。
4. **分布式和本机多进程是两条入口**——跨机器走 ZeroMQ；`--processes` 先 fork 再复用 master/worker。

## 应用型自测

1. 不写 `wait_time` 时，两个 task 之间默认隔多久？
2. `@task(3)` 和 `@task(1)` 在 `tasks` 列表里各会出现几次？
3. `HttpUser` 的 Cookie 会不会在两个虚拟用户之间共享？

检查点：

1. 0 秒。基类 `wait_time = constant(0)`。
2. 三次和一次。`get_tasks_from_base_classes` 按 `locust_task_weight` 追加。
3. 不会。每个 `HttpUser` 实例构造自己的 `HttpSession`。

## 延伸阅读

- 文档：[docs.locust.io](https://docs.locust.io)
- 固定源码：[locustio/locust](https://github.com/locustio/locust) —— 本文绑定提交 `407343d0f5ab84a32f41f6f9a7c991188d10a55a`
- [[k6]] —— JS + Go executor 的对照
- [[playwright]] —— 浏览器正确性，不是压力复制

## 关联

- [[k6]] —— 同一负载问题，脚本语言和调度模型不同
- [[playwright]] —— 测页面行为；Locust 测并发压力
- [[fastapi]] —— 常见的被压 HTTP 服务
- JMeter —— GUI 计划文件的对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

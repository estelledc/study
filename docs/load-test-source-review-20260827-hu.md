# Load-test source review (writer HU)

> 用途：记录 k6、Locust 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HU
- evidence：GitHub metadata、PyPI package metadata、固定提交静态源码阅读
- not executed：未编译 k6，未安装 Locust 依赖，未运行上游 test，未发真实负载，未测吞吐或 bundle
- worktrees：本机 `research-worktrees/`，不进入 Git

## k6

- canonical source：`https://github.com/grafana/k6`
- revision：`00a9a1b7f552d6bb4337278b10ae25aac0f4e666`
- package / version：`internal/build.Version = 2.2.0`（annotated tag `v2.2.0`）
- inspected：
  - `go.mod`
  - `main.go`
  - `cmd/execute.go`
  - `internal/build/version.go`
  - `internal/js/jsmodules.go`
  - `internal/js/modules/k6/k6.go`
  - `internal/cmd/builtin_output_gen.go`
  - `js/modules/k6/http/http.go`
  - `lib/executors.go`
  - `lib/executor/execution_config_shortcuts.go`
  - `lib/executor/constant_vus.go`
  - `lib/executor/ramping_vus.go`
  - `metrics/thresholds.go`
  - `metrics/thresholds_parser.go`
  - `release notes/v2.0.0.md`
- observed：
  - module path is `go.k6.io/k6/v2`; JS VM is `github.com/grafana/sobek`, not goja;
  - `cmd.Execute()` builds `GlobalState` and hands off to `internal/cmd`;
  - stable JS modules include `k6`, `k6/http`, `k6/browser`, `k6/net/grpc`, `k6/ws`; `k6/experimental/browser` is a removed module;
  - `k6` named exports are `check`, `fail`, `group`, `randomSeed`, `sleep`; there is no `k6/check` module;
  - `DeriveScenariosFromShortcuts` maps `duration` → `constant-vus`, `stages` → `ramping-vus`, `iterations` → `shared-iterations`;
  - registered executors are `constant-vus`, `ramping-vus`, `shared-iterations`, `per-vu-iterations`, `constant-arrival-rate`, `ramping-arrival-rate`;
  - `externally-controlled` was removed in v2.0.0;
  - threshold expressions must parse as `method operator value`; percentiles are `p(float)` in `[0, 100]`;
  - `experimental-prometheus-rw` remains a builtin output name.
- provenance：
  - GitHub tag `v2.2.0` is annotated (`9b7cf93462a32ef2dc74c388f58435cba327c931`) and peels to `00a9a1b7f552d6bb4337278b10ae25aac0f4e666`;
  - this review binds the peeled commit.

## Locust

- canonical source：`https://github.com/locustio/locust`
- revision：`407343d0f5ab84a32f41f6f9a7c991188d10a55a`
- package：PyPI `locust==2.46.4`（Git tag `2.46.4`）
- inspected：
  - `pyproject.toml`
  - `locust/__init__.py`
  - `locust/user/users.py`
  - `locust/user/task.py`
  - `locust/user/wait_time.py`
  - `locust/clients.py`
  - `locust/runners.py`
  - `locust/main.py`
  - `locust/argument_parser.py`
  - `locust/rpc/__init__.py`
  - `locust/rpc/zmqrpc.py`
  - `locust/contrib/fasthttp.py`（class header only）
- observed：
  - import applies `gevent.monkey.patch_all()` unless `LOCUST_SKIP_MONKEY_PATCH`;
  - `UserMeta` collects `@task(weight)` by repeating the callable `weight` times; `get_next_task` uses `random.choice`;
  - default `User.wait_time` is `constant(0)`; `between` / `constant_pacing` / `constant_throughput` are helpers;
  - `TaskSet.run` waits after each task unless `RescheduleTaskImmediately`;
  - `HttpUser` constructs a per-instance `HttpSession` and requires `host`;
  - runners are Local / Master / Worker; RPC default is ZeroMQ ROUTER/DEALER;
  - `--processes` forks workers with `gevent.fork()` and promotes the parent to master;
  - `--exit-code-on-error` defaults to 1 when the result contains any failure or error;
  - `requires-python = ">=3.11"`; version is hatch-vcs from the Git tag, written to generated `locust/_version.py`.
- provenance：
  - Git tag `2.46.4` is a lightweight tag on `407343d0f5ab84a32f41f6f9a7c991188d10a55a`;
  - PyPI `locust==2.46.4` is not yanked; project URLs point at `https://github.com/locustio/locust`;
  - this review binds the tag commit.

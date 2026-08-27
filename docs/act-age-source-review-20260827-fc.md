# act + age source review (writer FC)

> 用途：记录 `act` 与 `age` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fc` 标记 2026-08-27 平行 writer FC，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FC
- assigned pair：act + age（nektos/act, FiloSottile/age）
- evidence：GitHub metadata、固定提交静态源码与 README / 问卷文案阅读
- not executed：未安装 Docker，未跑任何 GitHub Actions workflow，未编译 age，未做加解密往返，未测镜像体积、scrypt 耗时或吞吐
- worktrees：本机 `research-worktrees/`（gitignored），blob-filtered / 单 tag clone，不进入 Git
- slugs：仓库笔记 slug 仍为 `act` 与 `age`；没有发明新页面

## act

- canonical source：`https://github.com/nektos/act`
- tag：`v0.2.89`（annotated）
- tag object：`434d69682c7a8db2ac913e5dc3e80ba68055d50d`
- revision（peeled）：`4f411281417e88660bea1c1a1749aa71ae0bd60f`
- version file：`VERSION` = `0.2.89`
- module：`github.com/nektos/act`，`go 1.25.0`，MIT
- also observed：GitHub latest release 同为 `v0.2.89`（2026-06-01）；仓库 GitHub `size` 约 17748 KiB，clone 后工作树约 130MB，仍在可检范围内
- inspected：
  - `VERSION`、`go.mod`、`LICENSE`、`README.md`、`IMAGES.md`
  - `cmd/root.go`
  - `cmd/platforms.go`
  - `cmd/secrets.go`
  - `pkg/model/planner.go`
  - `pkg/model/action.go`
  - `pkg/runner/runner.go`
  - `pkg/runner/run_context.go`
  - `pkg/runner/step_factory.go`
  - `pkg/runner/action.go`
  - `pkg/runner/step_action_remote.go`
  - `pkg/artifactcache/doc.go`
  - `pkg/gh/gh.go`
- observed：
  - CLI 默认事件：无参数且 workflows 声明超过一种事件时用 `push`；只有一种事件则用那种；`--detect-event` 用检测到的第一种。默认 actor `nektos/act`，默认 secret 文件 `.secrets`，默认网络 `host`，`--pull` / `--rebuild` 默认 true。
  - 配置文件顺序：XDG `act/actrc`、`$HOME/.actrc`、`./.actrc`，再拼 `os.Args`。
  - `newPlatforms()` 硬编码：`ubuntu-latest`/`ubuntu-20.04`/`ubuntu-18.04` → `node:16-buster-slim`，`ubuntu-22.04` → `node:16-bullseye-slim`。
  - 无 `-P` 时跑 `defaultImageSurvey`，把 Large=`catthehacker/ubuntu:full-*`、Medium=`act-*`、Micro=`node:16-*-slim` 写入 XDG actrc。问卷文案含 17GB / ~500MB / <200MB，那是提示字符串，不是本轮测量。
  - `createStages` 按 `needs` 建串行 stage、stage 内并行；成环失败。
  - `runs-on` 无镜像映射则 skip，并提示 `-P`。`image == "" && platform == "-self-hosted"` 走 `HostEnvironment`。
  - step 类型：`run` / local action / remote action / `docker://`。`runs.using` 接受 node12/16/20/24、docker、composite。
  - 本仓库 `actions/checkout` 默认跳过（工作区已拷贝）；`--no-skip-checkout` 关闭。
  - 默认启动 `artifactcache` 并设置 `ACTIONS_CACHE_URL`，除非 `--no-cache-server` 或环境已有该变量。artifact server 需 `--artifact-server-path`。
  - 缺 `GITHUB_TOKEN` 时调用 `gh auth token`。
  - darwin/arm64 且未设 `--container-architecture` 时警告可试 `linux/amd64`，并不改默认架构。
- provenance note：
  - annotated tag `v0.2.89` 剥开到 `4f411281...`；本文绑定 peeled commit，不绑定 tag object。
- old-page corrections：
  - 删除未绑定 star 数。
  - 默认镜像不是 `catthehacker/ubuntu:act-latest`（那是 Medium 问卷结果）。
  - `actions/cache` 不再写成“本地无声跳过”。
  - 不再把问卷体积或 QEMU 减速比写成事实。

## age

- canonical source：`https://github.com/FiloSottile/age`
- tag：`v1.3.1`（lightweight）
- revision：`b8564adb6d58329b8a3e267360ca2b0abc4efe1d`
- module：`filippo.io/age`，`go 1.24.0`，toolchain `go1.25.5`
- license：BSD-3-Clause（`LICENSE` 与 GitHub SPDX 一致；旧页写成 MIT 不成立）
- also observed：GitHub latest release 同为 `v1.3.1`（2025-12-28）；仓库 `size` 约 1623 KiB
- inspected：
  - `README.md`、`LICENSE`、`go.mod`
  - `age.go`
  - `x25519.go`
  - `pq.go`
  - `scrypt.go`
  - `parse.go`
  - `primitives.go`
  - `internal/format/format.go`
  - `internal/stream/stream.go`
  - `cmd/age/age.go`
  - `cmd/age/parse.go`
  - `cmd/age-keygen/keygen.go`
  - `cmd/age-inspect/inspect.go`
  - `plugin/plugin.go`
  - `armor/armor.go`
- observed：
  - 文件头 `age-encryption.org/v1`，stanza 以 `->` 开头，MAC 行以 `---` 开头。
  - file key 16 字节；payload 用 STREAM，`ChunkSize = 64 * 1024`，AEAD 为 ChaCha20-Poly1305。
  - `age-keygen` 默认 `GenerateX25519Identity`；`-pq` 才 `GenerateHybridIdentity`。usage 写 `-pq` 以后可能成为默认。
  - X25519：HRP `age` / `AGE-SECRET-KEY-`，stanza `X25519`。
  - Hybrid：HRP `age1pq` / `AGE-SECRET-KEY-PQ-`，HPKE MLKEM768-X25519，stanza `mlkem768x25519`，label `postquantum`。
  - scrypt 默认 `workFactor = 18`，必须是唯一 recipient。
  - CLI recipient：`age1tag1`/`age1tagpq1`、`age1pq1`、插件（`age1` 且多于一个 `1`）、`age1` X25519、`ssh-`；`github:` 返回“已从设计删除”。
  - SSH 只支持 ed25519 / rsa，不支持 ssh-agent。
  - 另有 `age-inspect`（不解密）与插件协议 `age-plugin-<name>`。
- provenance note：
  - lightweight tag `v1.3.1` 直接指向绑定提交；README 称后量子支持自 v1.3.0 内建。
- old-page corrections：
  - 许可从 MIT 改为 BSD-3-Clause。
  - 删除 star / “5MB 二进制”等未绑定数字。
  - 补上 1.3.x 的 hybrid 路径，并写明 CLI 默认仍是 X25519。
  - 不再把 scrypt “1–2 秒”写成实测。

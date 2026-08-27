# Container image build source review (writer FR)

> 用途：记录 `buildah` 与 `buildkit` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fr` 标记 2026-08-27 平行 writer FR，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、annotated tag peel、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未编译上游，未运行 `buildah` / `buildkitd` / `buildctl`，未构建镜像，未测 cache hit、并行耗时或 bundle
- worktrees：本机 `research-worktrees/`（gitignored），blob-filter + depth-1 浅克隆，不进入 Git
- slugs：`buildah`、`buildkit`

## Buildah

- canonical source：`https://github.com/containers/buildah`（HTTP 301 到 `https://github.com/podman-container-tools/buildah`；同一仓库，created_at 仍是 2017-01-26）
- tag：`v1.45.0`（annotated，tag object `9215db61c5219f28c26fa7fc7ce002bfd90f52f4`，tagger Tom Sweeney 2026-07-30）
- revision：`7ae7d5a4021b24d02a5c281badca8c4d8ebbf442`（"Bump to Buildah v1.45.0"）
- module：`go.podman.io/buildah`，`define.Version = "1.45.0"`，Go `1.25.9`，Apache-2.0
- also observed：仓库仍有更旧的维护标签（如 `v1.44.1`）；未绑定
- inspected：
  - `define/types.go`
  - `define/isolation.go`
  - `define/build.go`
  - `go.mod`
  - `buildah.go`
  - `new.go`
  - `config.go`
  - `cmd/buildah/main.go`
  - `cmd/buildah/build.go`
  - `cmd/buildah/from.go`
  - `cmd/buildah/run.go`
  - `cmd/buildah/config.go`
  - `pkg/cli/common.go`
  - `pkg/cli/build.go`
  - `imagebuildah/build.go`
  - `imagebuildah/executor.go`
  - `internal/volumes/volumes.go`
  - `run_common.go`
  - `CHANGELOG.md`
- observed：
  - CLI 主命令是 `buildah build`，aliases 为 `build-using-dockerfile` 与 `bud`；无参数时用当前目录当 context，并寻找 Containerfile，两者皆无才失败；
  - Containerfile 路径走 `imagebuildah.BuildDockerfiles`，脚本路径走 `NewBuilder` → `Run` / `Add` / `Copy` / `config` → `Commit`；
  - 默认 manifest 格式是 OCI（`define.OCI` / `OCIv1ImageManifest`），可用 `--format` 或 `BUILDAH_FORMAT` 改成 docker；
  - isolation 默认：`BUILDAH_ISOLATION` 优先，否则 rootless 用户用 `rootless`，其余用 `oci`；另有 `chroot`；默认 runtime 名是 `runc`；
  - CLI `--jobs` 默认 1；`Jobs == nil` 且未传入 semaphore 时，executor 才按 stage 数建加权信号量；
  - scratch：`FromImage` 空或 `"scratch"` 表示无基础镜像；默认配置会写 `WorkingDir: "/"`，只有 `CompatScratchConfig == OptionalBoolTrue` 才保持完全空 config；rootfs 仍无 `/bin/sh`；
  - `Builder` 的 RUN `--mount` 分发 `secret` / `ssh` / bind / cache / tmpfs；`internal/volumes.getMounts` 只接受 bind/cache/tmpfs；
  - 直接依赖 `github.com/moby/buildkit v0.31.2`，用途是 Dockerfile parser / heredoc / shell lex（经 `openshift/imagebuilder`），不是把 BuildKit solver 当执行引擎；
  - 每个 CLI 调用是独立进程；隐藏子命令 `rpc` 只在单次命令期间起临时 gRPC socket，不是 dockerd 式常驻守护进程。
- provenance note：
  - GitHub tags API 的 `v1.45.0` commit SHA 与 annotated tag peel、浅克隆 `HEAD` 三者同为 `7ae7d5a4...`；
  - 本审查绑定该 tag 提交，不绑定 main 头 `ba4dcd9f...`。

## BuildKit

- canonical source：`https://github.com/moby/buildkit`
- tag：`v0.32.2`（annotated + PGP，tag object `f7f7da10d7cb53feec15d36fe4516c269b7ba9d8`，tagger CrazyMax 2026-08-04）
- revision：`991535e0973488b6a429096d21fa13f81f2d89d8`（"[v0.32 backport] exporter: revert attestation manifest push order"）
- module：`github.com/moby/buildkit`，Go `1.26.3`，Apache-2.0
- dockerfile frontend const：`frontend/dockerfile/version.version = "1.26"`
- also observed：`v0.33.0-rc1`（2026-08-27，prerelease）与 `dockerfile/1.27.0-rc1`；未绑定
- inspected：
  - `README.md`
  - `PROJECT.md`
  - `go.mod`
  - `version/version.go`
  - `solver/pb/ops.proto`
  - `solver/types.go`
  - `cmd/buildkitd/main.go`
  - `frontend/dockerfile/version/version.go`
  - `frontend/dockerfile/instructions/commands_runmount.go`
  - `frontend/dockerfile/dockerfile2llb/convert_runmount.go`
  - `frontend/dockerfile/dockerfile2llb/convert_secrets.go`
  - `control/control.go`
  - `docs/images-readme.md`
- observed：
  - 组成是 `buildkitd` 守护进程 + `buildctl` 客户端；daemon 默认监听 `/run/buildkit/buildkitd.sock`；worker 默认 OCI/runc，可切 containerd；
  - LLB 是 protobuf DAG：`Op` 的 oneof 为 Exec / Source / File / Build / Merge / Diff / Passthrough；README 把它比作 Dockerfile 的 LLVM IR；
  - Dockerfile 只是 frontend；另有内置 `gateway.v0`，允许任意镜像当 frontend；本仓 frontend const 为 1.26；
  - `RUN --mount` 允许 bind / cache / tmpfs / secret / ssh；secret 可 `env=` 注入且默认不落 `/run/secrets`，`PROJECT.md` 写明 secret 值不得进磁盘或 cache checksum；
  - cache export `mode`：`min`（默认，顶层可传输层及其依赖）、`max`（所有非 root vertex）、未知值回落 `min`；后端含 inline / registry / local，以及 README 标 experimental 的 GHA / S3 / Azure Blob；
  - README 写 Docker Engine 23.0 起 `docker build` 默认走 Buildx + BuildKit；standalone `buildkitd` 仍是长跑进程；所谓 daemonless 是 `buildctl-daemonless.sh` 拉起一次性 daemon；
  - `buildkitd` 支持 Linux 与 Windows；macOS 公式不含 daemon；secret 权限参数在 Windows 未实现。
- provenance note：
  - annotated tag peel 与浅克隆 `HEAD` 同为 `991535e0...`；
  - 本审查绑定 v0.32.2 稳定标签，不绑定 `v0.33.0-rc1`。

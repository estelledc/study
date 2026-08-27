# Caddy + Centrifugo source review (writer FN)

> 用途：记录 `caddy` 与 `centrifugo` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fn` 标记 2026-08-27 平行 writer FN，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FN
- assigned pair：caddy + centrifugo
- evidence：GitHub metadata、`git ls-remote` 解引用、blob-filtered / sparse 固定提交静态源码阅读
- not executed：未 `go build` / `go test`，未启动 Caddy 或 Centrifugo，未申请 ACME 证书，未建立 WebSocket，未测吞吐 / 延迟 / star / 镜像拉取量
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- fallback：未使用。两页均存在于 `origin/main`，且为 `needs-evidence`，canonical 为真实 GitHub 仓库。

## 选题

- `data/project-standard-audit.json` 中 `caddy` → `https://github.com/caddyserver/caddy`，`centrifugo` → `https://github.com/centrifugal/centrifugo`
- 两页均缺 `pinned_revision` / `evidence_boundary` / `self_test`
- 未改写本波其他 writer 已占用 slug，也未改写已有 `docs/*-source-review-20260827-*.md` 或 benchmark-aligned 页面

## Caddy

- canonical source：`https://github.com/caddyserver/caddy`
- tag：`v2.11.4`（annotated）
- tag object：`8ec11a4b7e39a5fd00da2fc5cb9b543e31fd7926`
- revision（peeled）：`e2eee6a7fce366321294c9c2a79f3146891dcbdf`
- module：`github.com/caddyserver/caddy/v2`，`go 1.25.1`
- license：Apache-2.0
- deps observed：`github.com/caddyserver/certmagic v0.25.3`、`github.com/caddyserver/zerossl v0.1.5`、`github.com/quic-go/quic-go v0.59.1`
- GitHub size metadata：约 21791 KB；本地 blob-filtered sparse checkout 约 8.7M
- inspected：
  - `go.mod`、`LICENSE`、`README.md`
  - `caddy.go`（`Version()`）
  - `admin.go`（`DefaultAdminListen`）
  - `storage.go`（`AppDataDir()`）
  - `cmd/main.go`（`LoadConfig` / 相邻 `Caddyfile`）
  - `cmd/commandfuncs.go`（`cmdRun` / `cmdReload` → `POST /load`）
  - `caddyconfig/load.go`（`admin.api.load`）
  - `caddyconfig/httpcaddyfile/httptype.go`、`directives.go`、`builtins.go`
  - `modules/caddytls/automation.go`（`DefaultIssuers`）
  - `modules/caddytls/acmeissuer.go`
  - `modules/caddyhttp/autohttps.go`、`server.go`、`caddyhttp.go`
  - `modules/caddyhttp/reverseproxy/reverseproxy.go`、`caddyfile.go`
  - `modules/caddyhttp/fileserver/staticfiles.go`、`caddyfile.go`
  - `modules/standard/imports.go`
- observed：
  - 运行时真相是 JSON `caddy.Config`；`caddyfile` adapter 把站点块编成 apps
  - `caddy run` 无 `--config` 时尝试相邻 `Caddyfile`；文件名以 `Caddyfile` 开头或 `.caddyfile` 结尾且未指定 adapter 时按 Caddyfile 处理
  - Auto HTTPS 在 provisioning 阶段扫 host matcher；默认 issuer 是空 `ACMEIssuer`（CA 默认 Let's Encrypt production）；只有 `userEmail` 非空才追加 ZeroSSL ACME issuer
  - ACME HTTP-01 与 TLS-ALPN-01 默认启用；DNS-01 需配置 DNS provider 模块（stock 不含 Cloudflare 插件）
  - 不合格公网名 / 默认 issuer 下的 IP 走 internal issuer；`localhost` 也走 internal
  - HTTP→HTTPS 重定向默认开，可用 `disable_redirects` 关
  - 默认协议 `[h1 h2 h3]`
  - 续期窗口是 `RenewalWindowRatio`（注释写约剩余寿命 1/3），不是写死「60 天」
  - Admin 默认 `localhost:2019`（或 `CADDY_ADMIN`）；`caddy reload` 把适配后的 JSON `POST` 到 `/load`
  - `cmdRun` 在有源配置文件时登记 last-config，供 SIGUSR1 从同一文件重载
  - Linux 数据目录：`$XDG_DATA_HOME/caddy`，否则 `$HOME/.local/share/caddy`
  - `reverse_proxy` / `file_server` 是一等模块；`caddy-l4` / `caddy-docker-proxy` / `caddy-dns/*` 不在 `modules/standard`

## Centrifugo

- canonical source：`https://github.com/centrifugal/centrifugo`
- tag：`v6.9.3`（lightweight）
- revision：`e108c4e8f3b9f78d21663f985e754ef4d6908ed1`
- module：`github.com/centrifugal/centrifugo/v6`，`go 1.26`
- license：Apache-2.0
- deps observed：`github.com/centrifugal/centrifuge v0.38.1-0.20260822075818-1d8f99f1d0d4`
- `internal/build.Version` 源码占位 `0.0.0`；对外版本以 release tag 为准
- GitHub size metadata：约 164362 KB；本地 blob-filtered sparse（`internal/`）约 24M
- inspected：
  - `go.mod`、`LICENSE`、`README.md`、`main.go`
  - `internal/build/build.go`
  - `internal/config/config.go`（flags / engine / broker / transports）
  - `internal/configtypes/types.go`、`namespace.go`
  - `internal/app/mux.go`、`engine.go`、`run.go`、`log.go`
  - `internal/api/handler.go`
  - `internal/middleware/auth.go`
  - `internal/client/handler.go`（connect / subscribe ACL）
- observed：
  - 入口是 `app.Centrifugo()` cobra root，再挂 version / checkconfig / gentoken 等 CLI
  - HTTP 默认端口 `8000`；WebSocket 默认 `/connection/websocket` 且默认启用
  - SSE / HTTP-stream / WebTransport / uni_* / gRPC API 默认关闭；WebTransport 标注 experimental
  - HTTP API 默认 `/api`，另有 `/api/publish`、`/api/broadcast` 等拆分路由；legacy `OldRoute()` 仍挂在 `/api`
  - API 鉴权优先 `X-API-Key`，否则 `Authorization: apikey <KEY>`，再否则 `?api_key=`
  - `client.insecure` / `http_api.insecure` / `admin.insecure` 均为 opt-in；空 API key 在非 insecure 时直接 401
  - 默认 engine `memory`；分开配置时可 `broker.type` = memory / redis / nats / postgres / redisnats。无 Tarantool
  - namespace 边界默认 `:`；`history_size` 默认 0（关 history）；recovery 依赖合理 history
  - 默认不允许匿名/客户端随意 subscribe；需 token.Subs、proxy、`allow_subscribe_for_*` 或 `client.insecure`
  - 订阅上限默认 128 channel；恢复/history 客户端拉取上限默认 300

## 未执行

- 未编译或运行任一上游
- 未联系 Let's Encrypt / ZeroSSL
- 未连 Redis / NATS / Postgres
- 未测 QPS、连接数、延迟或镜像拉取量

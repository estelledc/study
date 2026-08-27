# Agent stack source review

> 用途：记录 MCP TypeScript SDK、Ollama 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行 MCP server/client、Ollama 服务或任何模型推理，未做协议一致性、量化质量或性能测量
- worktrees：本机 `research-worktrees/`，不进入 Git

## MCP TypeScript SDK

- canonical source：`https://github.com/modelcontextprotocol/typescript-sdk`
- revision：`2d889f2b329e46680ec9bdd565de4616c497825a`
- package：`@modelcontextprotocol/sdk@1.30.0`
- inspected：
  - `package.json`
  - `src/types.ts`
  - `src/server/mcp.ts`
  - `src/server/stdio.ts`
  - `src/server/streamableHttp.ts`
  - `src/server/sse.ts`
  - `src/client/sse.ts`
  - `docs/server.md`
  - `docs/capabilities.md`
  - `README.md`
- observed：
  - `LATEST_PROTOCOL_VERSION` is `2025-11-25`, with support back through `2025-06-18`、`2025-03-26`、`2024-11-05`、`2024-10-07`;
  - the high-level `McpServer` API registers capabilities with `registerTool`、`registerResource`（含 `ResourceTemplate`）、`registerPrompt`, each taking a config object（`title`/`description`/`inputSchema`/`outputSchema`/`annotations`）; the older positional `tool()`/`resource()`/`prompt()` overloads are all marked `@deprecated`;
  - tool input/output schemas are authored with zod（peer `^3.25 || ^4.0`，经 `zod-compat` 与 `zod-to-json-schema` 转为 JSON Schema 下发），`outputSchema` 与返回值中的 `structuredContent` 配对；
  - transports at this revision: stdio for locally spawned child processes and Streamable HTTP for remote servers（另有 web-standard 变体与测试用 in-memory transport）；`SSEClientTransport` is explicitly deprecated in favor of Streamable HTTP, with a migration-period note;
  - validation backends ship as `./validation/ajv`（依赖 ajv/ajv-formats）与 `./validation/cfworker`（peer `@cfworker/json-schema`）两个导出；
  - an `experimental` namespace carries task management（`registerToolTask`、`taskSupport`，普通 `registerTool` 固定 `taskSupport: 'forbidden'`）；
  - server-side helpers include an Express adapter and middleware such as `hostHeaderValidation`, which replaces the deprecated SSE-transport host validation options;
  - package `engines` requires Node `>=18`。
- provenance note：
  - npm reports `@modelcontextprotocol/sdk@1.30.0` with `gitHead=2d889f2b329e46680ec9bdd565de4616c497825a`;
  - GitHub lightweight tag `1.30.0` points to the same commit, whose `package.json` reports `1.30.0`——tag、package 与 npm gitHead 三方一致。

## Ollama

- canonical source：`https://github.com/ollama/ollama`
- revision：`13f2fb8c99278469b954429d5541019f4d83a4d0`
- release：`v0.33.1`
- inspected：
  - `envconfig/config.go`
  - `server/routes.go`
  - `llm/server.go`
  - `llm/llama_server.go`
  - `runner/runner.go`
  - `manifest/paths.go`
  - `manifest/layer.go`
  - `parser/parser.go`
  - `LLAMA_CPP_VERSION`、`MLX_VERSION`
- observed：
  - the server defaults to `127.0.0.1:11434`（`OLLAMA_HOST`）；`OLLAMA_NUM_PARALLEL` defaults to `1`，`OLLAMA_KEEP_ALIVE` defaults to 5 minutes;
  - native endpoints include `/api/generate`、`/api/chat`、`/api/embed`、`/api/pull`、`/api/push`、`/api/create`、`/api/blobs/:digest`、`/api/tags`、`/api/show`、`/api/ps`，plus experimental `web_search`/`web_fetch`/`model-recommendations`;
  - two compatibility layers are mounted on the same server: OpenAI-style `/v1/chat/completions`、`/v1/completions`、`/v1/embeddings`、`/v1/models`、`/v1/responses`，and an Anthropic Messages-style `/v1/messages`（`AnthropicMessagesMiddleware`）；cloud passthrough middleware can forward cloud models to ollama.com;
  - inference engines: `llm/server.go` states "All GGML models are served via the upstream llama-server subprocess"，`llm/llama_server.go` wraps that binary and repo root pins `LLAMA_CPP_VERSION` at `b10630`；`runner.Execute` only dispatches `--mlx-engine`（`x/mlxrunner`，`MLX_VERSION c793734e...`）for the MLX path;
  - model storage is content-addressed：`<models>/manifests/<registry path>` plus `<models>/blobs/sha256-<64hex>`（`manifest/paths.go` 校验 digest 格式），layer 写入用 `sha256-` 临时文件——`ollama create` 复用既有 blob 而不复制权重;
  - the Modelfile parser accepts `FROM`、`PARAMETER`、`TEMPLATE`、`SYSTEM`、`ADAPTER`、`LICENSE`、`MESSAGE`、`RENDERER` 等指令，message 角色限 `system`/`user`/`assistant`。
- provenance note：
  - GitHub release `v0.33.1`（2026-08-26）的 lightweight tag 指向 `13f2fb8c99278469b954429d5541019f4d83a4d0`；Ollama 不发 npm 包，以 release tag 为溯源锚点;
  - 旧正文的 "默认 numParallel=4"、量化质量百分比、加载秒数、star 数与 "llama.cpp 子进程包装" 的旧引擎叙述在该 revision 均不成立或不可绑定，已由上述观察替换。

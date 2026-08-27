# Terminal LLM CLI source review

> 用途：记录 AIChat、shell-gpt 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、PyPI/crates 版本元数据、固定提交静态源码与 README 阅读
- not executed：未安装两工具、未调用任何 LLM API、未运行 shell 集成或 server 模式、未测启动时间或响应速度
- worktrees：本机 `research-worktrees/`，不进入 Git

## AIChat

- canonical source：`https://github.com/sigoden/aichat`
- revision：`430416d914896c3534c04b84c0226910c64e3e66`
- release：`v0.30.0`（Cargo.toml `version = "0.30.0"`）
- inspected：
  - `Cargo.toml`
  - `src/cli.rs`
  - `src/client/mod.rs`
  - `src/serve.rs`
  - `src/config/mod.rs`
  - `scripts/shell-integration/`
  - `config.example.yaml`
  - `README.md`
- observed：
  - CLI 一等能力：`-m/--model`、`-r/--role`、`-s/--session`、`-a/--agent`（含 `--agent-variable`）、`--rag`/`--rebuild-rag`、`--macro`、`--serve [ADDRESS]`、`-e/--execute`、`-c/--code`、`-f/--file`（文件/目录/URL）、`-S/--no-stream`、`--dry-run` 与一组 `--list-*`；
  - client 注册表包含 8 种原生类型：`openai`、`openai-compatible`、`gemini`、`claude`、`cohere`、`azure-openai`、`vertexai`、`bedrock`；另内置 18 个 OpenAI 兼容预设 provider（groq、deepseek、openrouter、mistral、xai、zhipuai、jina、voyageai 等），Ollama 在 `config.example.yaml` 中作为 `openai-compatible` client 示例接入；
  - `--serve` 同时暴露 `/v1/chat/completions`、`/v1/embeddings`、`/v1/rerank` 与两个内嵌 Web 页面（`/playground`、`/arena`）；
  - roles 以 `<roles_dir>/<name>.md` 单文件存储（`Config::role_file` 拼 `{name}.md`）；
  - RAG 依赖 `hnsw_rs 0.3.0`（向量近邻）与 `bm25 2.0.1`（关键词，parallelism feature）构成混合检索；
  - function calling 依赖外部仓库 `sigoden/llm-functions`（README 与 config.example.yaml 均指向）；
  - shell 集成脚本覆盖 bash/zsh/fish/nushell/PowerShell，zsh 绑定 `'\ee'`（Alt+E）把当前命令行送入 aichat 后原位替换。
- provenance note：
  - GitHub release `v0.30.0`（2025-07-06）的 lightweight tag 指向 `430416d9...`，其 `Cargo.toml` 版本一致；主分支在该 release 后仍有提交，本文只绑定 tag 提交。

## shell-gpt

- canonical source：`https://github.com/TheR1D/shell_gpt`
- revision：`dee88ff87bb93899971a3ca1361ad74678e4a94f`
- release：`1.5.1`（`sgpt/__version__.py` 与 PyPI `shell-gpt` 最新版一致）
- inspected：
  - `pyproject.toml`
  - `sgpt/app.py`
  - `sgpt/config.py`
  - `sgpt/role.py`
  - `sgpt/integration.py`
  - `sgpt/handlers/`
  - `README.md`
- observed：
  - `--shell` 生成命令后的确认交互为 `[E]xecute, [M]odify, [D]escribe, [A]bort`（另接受兼容旧版的 `y`）；未显式确认时默认 Abort，除非配置 `DEFAULT_EXECUTE_SHELL_CMD=true`；`[M]odify` 在 PromptSession 中就地编辑命令；
  - 默认配置：`DEFAULT_MODEL` 为 `gpt-5.4-mini`，`CHAT_CACHE_PATH` 为 `<系统临时目录>/chat_cache`（非 `/tmp/shell_gpt/...`），`ROLE_STORAGE_PATH` 为 `<config>/roles`，`USE_LITELLM` 默认 `false`，`API_BASE_URL` 默认 `default`；
  - roles 以 JSON 文件存储于 roles 目录（`SystemRole` 读写 `{name}.json`），内置 DefaultRoles 覆盖 default/shell/describe_shell/code 四种；
  - shell 集成（`--install-integration`）在 bash 用 `bind -x '"\C-l"'`、在 zsh 用 `bindkey ^l` 把当前命令行经 `sgpt --shell --no-interaction` 补全后原位替换——绑定的是 Ctrl+L，会覆盖 shell 默认的 clear-screen 行为；
  - function calling 由 `--install-functions` 安装默认函数，路径由 `OPENAI_FUNCTIONS_PATH` 配置；
  - README 明确标注 "ShellGPT is not optimized for local models and may not work as expected"，本地模型经 Ollama 指南 + LiteLLM 路径接入。
- provenance note：
  - GitHub release `1.5.1`（2026-05-06）的 lightweight tag 指向 `dee88ff8...`；PyPI `shell-gpt` 最新版本同为 `1.5.1`，版本三方一致；
  - 旧正文的 `[E]xecute/[D]escribe/[A]bort` 三选项、`/tmp/shell_gpt/chat_cache` 缓存路径与 “tmux 拦截 Ctrl+L” 归因在该 revision 均不成立，已由上述观察替换。

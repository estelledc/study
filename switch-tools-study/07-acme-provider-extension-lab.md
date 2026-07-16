# 07. Acme Provider 扩展实验：新增名称，还是新增策略

假设要支持一个虚构的 Acme provider：

- OpenAI Responses 兼容端点；
-支持普通 function tool；
-不支持 `web_search`；
-需要 Bearer 鉴权；
-模型名为 `acme-code-1`。

本实验不实现代码，而是用它检查两个项目的扩展成本。

## 1. 先拆清鉴权需求

“自定义 Bearer header”有两种完全不同的含义：

- **H1：标准头**
  `Authorization: Bearer <key>`
- **H2：非标准头名**
  `X-Acme-Auth: Bearer <key>`

H1 通常可复用现有 adapter。H2 需要把“header 名称、值模板、敏感值来源”建模成新的 auth policy，不能靠静态 header override 复制一份 key。

## 2. CSSwitch 最小 change map

### 2.1 Template 与 UI

新增 `acme` 模板：

- `api_format=openai_responses`
- `adapter=openai-responses`
-默认 base URL
-默认模型 `acme-code-1`
-工具提示为 translated/partial

入口：

- [`templates.rs:5-20`](../repos/csswitch/desktop/src-tauri/src/templates.rs#L5-L20)
- [`templates.rs:198-228`](../repos/csswitch/desktop/src-tauri/src/templates.rs#L198-L228)

真实 App 会从 backend DTO 动态读取模板；浏览器 preview 仍有手写模板副本，需要同步：
[`main.js:20-31`](../repos/csswitch/desktop/src/main.js#L20-L31)。

### 2.2 DTO 与持久化

H1 且用 `template_id` 识别 Acme 时，现有 profile 已能保存：

- endpoint；
-key；
-model；
-template id；
-api format。

不需要 schema bump：

- [`config.rs:53-79`](../repos/csswitch/desktop/src-tauri/src/config.rs#L53-L79)
- [`runtime/profile.rs:91-135`](../repos/csswitch/desktop/src-tauri/src/runtime/profile.rs#L91-L135)

如果新增 `auth_header_name` 或 `supports_web_search` 字段，就必须扩展 Rust template/profile DTO 和前端投影。

### 2.3 Gateway

H1 可复用：

- `openai-responses` provider kind；
-Responses 请求/响应转换；
-model discovery；
-scratch 验证；
-标准 `Authorization: Bearer`。

入口：

- [`runtime/provider.rs:11-53`](../repos/csswitch/desktop/src-tauri/src/runtime/provider.rs#L11-L53)
- [`gateway/config.rs:64-204`](../repos/csswitch/desktop/gateway/src/config.rs#L64-L204)
- [`gateway/messages.rs:75-125`](../repos/csswitch/desktop/gateway/src/messages.rs#L75-L125)

H2 不能复用当前硬编码 Authorization，需要：

1. `AuthPolicy`；
2. header 名称校验；
3.环境变量/配置传递；
4. fingerprint 纳入 auth policy；
5.模型发现和推理共享同一注入逻辑；
6.日志继续禁止 key 回显。

### 2.4 `web_search` 过滤

当前 Responses 逻辑主要对精确 DashScope host 做特例：

- [`openai_responses.rs:117-135`](../repos/csswitch/desktop/gateway/src/openai_responses.rs#L117-L135)
- [`server.rs:633-638`](../repos/csswitch/desktop/gateway/src/server.rs#L633-L638)

如果直接加 `is_acme`，第三个 provider 特例出现后，boolean 分支会快速失控。

更稳的模型：

```text
ProviderPolicy
  protocol = responses
  auth = standard_bearer
  tools.function = supported
  tools.web_search = drop
  tools.forced_choice = degrade_to_auto
```

### 2.5 Capability catalog

需要增加 Acme 规则，但必须理解：

- catalog 的 match/status/action/reason/evidence/tests 用于诊断和审计；
- gateway 不会解释 catalog 的 `action`；
-真正过滤仍要写入执行 policy。

证据：

- [`capability_catalog.rs:141-204`](../repos/csswitch/desktop/src-tauri/src/runtime/capability_catalog.rs#L141-L204)
- [`capabilities.v1.json:73-98`](../repos/csswitch/catalog/capabilities.v1.json#L73-L98)

## 3. CC Switch 最小 change map

### 3.1 Preset

Claude surface：

- Anthropic-facing base URL；
-auth token；
-模型映射；
- `apiFormat=openai_responses`。

Codex surface：

-原生 Responses endpoint；
-auth/config；
-model catalog；
- `web_search` 禁用。

入口：

- [`claudeProviderPresets.ts:25-74`](../repos/ccswitch/src/config/claudeProviderPresets.ts#L25-L74)
- [`codexProviderPresets.ts:13-72`](../repos/ccswitch/src/config/codexProviderPresets.ts#L13-L72)

现有 form selector 和 Responses 选项可以复用，不需要 Acme 专用组件。

### 3.2 DTO 与持久化

H1 不需要新增字段。Provider/meta 作为 JSON 文本存入 SQLite，不需要数据库 migration：

- [`types.ts:166-229`](../repos/ccswitch/src/types.ts#L166-L229)
- [`provider.rs:388-498`](../repos/ccswitch/src-tauri/src/provider.rs#L388-L498)
- [`schema.rs:25-43`](../repos/ccswitch/src-tauri/src/database/schema.rs#L25-L43)

H2 或显式 capability 字段会同时修改 TS 和 Rust 手写 DTO。

漂移风险：

-字段名和默认值复制两份；
- `apiFormat` enum 复制两份；
- `apiKeyField` 在 Rust 比 TS 更宽；
-protected header 列表在前后端复制；
-某些声明字段存在但运行时并未消费。

### 3.3 Adapter 与 Responses

H1 可复用 `ProviderAdapter` 和 Claude Responses bridge：

- [`adapter.rs:16-57`](../repos/ccswitch/src-tauri/src/proxy/providers/adapter.rs#L16-L57)
- [`claude.rs:668-828`](../repos/ccswitch/src-tauri/src/proxy/providers/claude.rs#L668-L828)
- [`transform_responses.rs:171-268`](../repos/ccswitch/src-tauri/src/proxy/providers/transform_responses.rs#L171-L268)

H2 需要真正的 auth strategy。静态 request override 不适合安全引用 provider key，也不能绕过受保护 Authorization 规则。

### 3.4 `web_search`

Codex 当前可通过 host/model blacklist 写入 `web_search = "disabled"`：

- [`codex_config.rs:24-101`](../repos/ccswitch/src-tauri/src/codex_config.rs#L24-L101)
- [`codex_config.rs:954-1019`](../repos/ccswitch/src-tauri/src/codex_config.rs#L954-L1019)

把 Acme host 加进去是最小改动，但继续用 host 名推导能力会让能力事实散落。

更稳的方向是 `supportsWebSearch=false` 进入统一 provider definition，再派生：

- Codex live sentinel；
-proxy tool filter；
-UI 提示；
-测试向量；
-发布说明。

## 4. 最小测试矩阵

| 维度 | 必测场景 |
|---|---|
| Preset/DTO | 创建、编辑、序列化、重启读取、旧字段缺失 |
| 凭证 | key 不回显；model discovery 与 inference 使用同一头 |
| H2 安全 | 精确头名、无标准 auth 泄漏、CRLF 拒绝 |
| Function tool | auto、forced、tool result、多轮 call id |
| Web search | 仅 web search、web search + function、无 tool |
| 协议 | Responses JSON、SSE、4xx/5xx、2xx failure envelope、截断流 |
| 状态 | 新建不生效、普通切换、hot switch、重启、失败回滚 |
| 清理 | 切离 Acme 后恢复 web search 哨兵和 auth policy |
| 日志 | 不包含 key、Authorization、完整 body |

测试层级：

```text
unit/golden
  -> loopback
  -> built artifact
  -> installed copy
  -> real Acme endpoint/tool loop
  -> release artifact
```

前一层不能替代后一层。

## 5. 什么情况下说明抽象开始失控

### CSSwitch

出现任一信号就应把 boolean 特例重构为 `ProviderPolicy`：

-第三个 provider host 特例；
-第二种 auth header；
-同一 Responses adapter 需要不同 tool 子能力；
- catalog 与 gateway rule id 反复人工同步；
-新增 provider 要改多个不相干的 if/else。

### CC Switch

出现任一信号就应统一 provider definition：

-新增 provider 要改五个以上策略文件；
-host/model 字符串决定能力；
-同一 enum 在 TS/Rust 各维护一份；
-direct 和 proxy 对同一能力结论不同；
-preset、catalog、UI、测试和 release notes 重复描述同一事实。

共同目标：

```text
ProviderDefinition
  = endpoint
  + protocol
  + auth
  + tool capabilities
  + model capabilities
  + evidence
```

UI DTO、运行 policy、catalog 和测试向量都从它派生。

## 6. 思考点

1. Acme 只新增一个 preset 时，为什么不需要新的 adapter？
2. H2 为什么不能用“自定义 header”文本框直接保存一份 key？
3. `supports_tools=true` 为什么不足以表达 Acme 能力？
4. Capability catalog 如果不驱动运行时，还有什么工程价值？
5. 何时应该接受一个 provider 特例，何时必须先重构 policy？

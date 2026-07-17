# 06. 协议闭环：文本能显示，不代表 Agent 能继续

协议转换最容易产生一种假成功：第一段文本显示正常，但 tool call、tool result、thinking 签名或 SSE 终态被破坏，Agent 无法进入下一轮。

本章只用一个案例贯穿两个项目：

```text
thinking
  -> tool call
  -> tool result
  -> continuation
  -> final answer
```

## 1. 最小 Anthropic 会话

模型第一次回复：

```json
{
  "role": "assistant",
  "content": [
    {"type":"thinking","thinking":"需要查询","signature":"sig_A"},
    {"type":"tool_use","id":"call_1","name":"lookup","input":{"q":"x"}}
  ],
  "stop_reason": "tool_use"
}
```

工具执行后继续：

```json
[
  {"role":"assistant","content":[
    {"type":"tool_use","id":"call_1","name":"lookup","input":{"q":"x"}}
  ]},
  {"role":"user","content":[
    {"type":"tool_result","tool_use_id":"call_1","content":"found"}
  ]}
]
```

这里至少有五个必须闭环的不变量：

1. `call_1` 不能改变。
2. `lookup` 名称不能和别的 call 串线。
3. `{"q":"x"}` 不能在字符串/对象转换时损坏。
4. 终态必须说明“等工具”，不能伪装成普通结束。
5. continuation 如果依赖签名 reasoning，必须能验证并回放。

## 2. OpenAI Chat 中间态

```json
[
  {"role":"assistant","content":null,
   "tool_calls":[{"id":"call_1","type":"function",
     "function":{"name":"lookup","arguments":"{\"q\":\"x\"}"}}]},
  {"role":"tool","tool_call_id":"call_1","content":"found"}
]
```

变化：

- Anthropic `tool_use.input` 是对象；
- OpenAI `function.arguments` 是 JSON 字符串；
- Anthropic `tool_result` 是 user content block；
- OpenAI tool result 是 `role=tool`；
- thinking/signature 没有标准等价位置。

CSSwitch 的 OpenAI Chat 转换见：

- [`openai_chat.rs:152-204`](../repos/csswitch/desktop/gateway/src/openai_chat.rs#L152-L204)
- [`openai_chat.rs:259-312`](../repos/csswitch/desktop/gateway/src/openai_chat.rs#L259-L312)

## 3. OpenAI Responses / Codex 中间态

```json
[
  {"type":"reasoning","id":"rs_1",
   "summary":[{"type":"summary_text","text":"需要查询"}],
   "encrypted_content":"ccswitch-..."},
  {"type":"function_call","call_id":"call_1",
   "name":"lookup","arguments":"{\"q\":\"x\"}"},
  {"type":"function_call_output","call_id":"call_1","output":"found"}
]
```

Responses 把消息拆成 item。reasoning、function call 和 output 都可能拥有独立 id，流式时还会交错到达。

CC Switch 的 reasoning envelope 用版本化前缀保存可回放信息：

- [`reasoning_bridge.rs:30-93`](../repos/ccswitch/src-tauri/src/proxy/providers/reasoning_bridge.rs#L30-L93)
- [`transform_responses.rs:1441-1477`](../repos/ccswitch/src-tauri/src/proxy/providers/transform_responses.rs#L1441-L1477)

## 4. 字段保持表

| 字段 | CSSwitch OpenAI 路径 | CC Switch Chat 路径 | CC Switch Responses/Codex 路径 |
|---|---|---|---|
| role | 保留；tool result 转 tool role | 保留，system 可前移/合并 | 消息 role 保留，工具成为顶层 item |
| tool id | 原样映射 id/call_id | 原样映射 | 跨 item 保持 call_id |
| tool name | 原样映射 | 原样映射 | namespace/custom tool 可恢复 |
| arguments | 对象转 JSON 字符串；失败降级 `{}` | 规范为 JSON 字符串 | 对象/字符串双向转换；完成态非法 JSON 可报错 |
| thinking | OpenAI 路径丢弃 | 可降级为非标准 `reasoning_content` | summary 保留，可合成回放 envelope |
| signature | OpenAI 路径丢弃；原生 relay 可透传 | 丢弃 | 编码进 `encrypted_content` |
| stop reason | tool 映射 `tool_use`，长度映射 `max_tokens` | 相似，未知值降级 | 双向映射 completed/incomplete/tool/content filter |
| usage | input/output | input/output/cache | fresh + cache-read + cache-write 守恒 |
| cache | OpenAI 路径丢弃 | 可读嵌套/直接字段 | details 双向转换，可合成 cache routing key |

结论：

- CSSwitch 的目标是让 Science 的 Anthropic 请求适配少量上游，协议面较窄。
- CC Switch 同时做 Claude→Chat/Responses 和 Codex Responses→Chat/Anthropic，必须保存更多 continuation 状态。

## 5. 八条协议不变量

### I1：Tool ID 闭环

`tool_use.id`、`tool_call.id`、`function_call.call_id` 和 result 引用必须是同一个逻辑 id。

证据：

- CSSwitch [`openai_chat.rs:168-184`](../repos/csswitch/desktop/gateway/src/openai_chat.rs#L168-L184)
- CC Switch [`transform_responses.rs:625-669`](../repos/ccswitch/src-tauri/src/proxy/providers/transform_responses.rs#L625-L669)

### I2：Arguments 形状闭环

Anthropic 内部是对象，OpenAI 线上常是字符串。空参数应规范为 `{}`，而不是空字符串或 `null`。

- CSSwitch [`openai_chat.rs:272-289`](../repos/csswitch/desktop/gateway/src/openai_chat.rs#L272-L289)
- CC Switch [`json_canonical.rs:62-87`](../repos/ccswitch/src-tauri/src/proxy/json_canonical.rs#L62-L87)

### I3：Reasoning continuation

如果下一轮需要验证上轮 reasoning，适配器必须保存可验证 envelope。CSSwitch 的 OpenAI 路径不满足这一强合同；CC Switch Responses bridge 会保存版本化 envelope。

### I4：Tool stop 不能变成普通完成

有 tool call 的结束原因必须告诉客户端继续工具循环：

- [`CSSwitch openai_chat.rs:294-307`](../repos/csswitch/desktop/gateway/src/openai_chat.rs#L294-L307)
- [`CC Switch transform_responses.rs:358-375`](../repos/ccswitch/src-tauri/src/proxy/providers/transform_responses.rs#L358-L375)

### I5：Usage 三桶守恒

输入 token、cache read、cache write 不能互相重复计数。CSSwitch 当前 OpenAI 路径只覆盖 input/output；CC Switch 有更完整的三桶转换。

### I6：每个流式块必须成对

```text
content_block_start
  -> 0..n content_block_delta
  -> content_block_stop
```

block index、item id、tool call id 不能在交错流中串线。

### I7：Thinking 签名顺序

签名必须晚于 thinking delta、早于对应 block stop。过早签名无法覆盖完整内容，过晚则客户端已经关闭块。

### I8：截断不能伪装成功

工具参数只到一半、reasoning 未闭合、上游流读取失败时，必须产生明确错误或 incomplete 终态，不能发送正常 `message_stop`。

## 6. 非流式不代表没有状态机

CSSwitch 非流式路径：

```text
Anthropic request
  -> OpenAI request(stream=false)
  -> 完整 upstream JSON
  -> Anthropic message
```

即使输入输出都是完整 JSON，也要维护：

- tool id；
-arguments 解析；
-stop reason；
-usage；
-forced tool choice 降级。

入口：[`server.rs:624-695`](../repos/csswitch/desktop/gateway/src/server.rs#L624-L695)。

## 7. CSSwitch 的 SSE 是“合成流”

当前 OpenAI 路径会等待完整非流式上游响应，再重放为 Anthropic SSE：

```text
message_start
  -> ping
  -> block_start
  -> block_delta
  -> block_stop
  -> message_delta
  -> message_stop
```

证据：[`openai_chat.rs:315-391`](../repos/csswitch/desktop/gateway/src/openai_chat.rs#L315-L391)。

它满足事件形状，但不提供真正的首 token 增量延迟。这是兼容性与实现复杂度之间的取舍。

## 8. CC Switch 的 SSE 是真正的增量状态机

Responses → Anthropic：

```text
response.created
  -> item.added(reasoning/tool/text)
  -> delta...
  -> item.done
  -> close open blocks
  -> message_delta
  -> message_stop
```

证据：

- [`streaming_responses.rs:648-853`](../repos/ccswitch/src-tauri/src/proxy/providers/streaming_responses.rs#L648-L853)
- [`streaming_responses.rs:1358-1533`](../repos/ccswitch/src-tauri/src/proxy/providers/streaming_responses.rs#L1358-L1533)

Anthropic → Codex：

```text
message_start
  -> response.created / in_progress
  -> output item events
  -> 保存 message_delta 终态
  -> message_stop
  -> response.completed
```

证据：[`streaming_codex_anthropic.rs:30-240`](../repos/ccswitch/src-tauri/src/proxy/providers/streaming_codex_anthropic.rs#L30-L240)。

## 9. Golden 应冻结什么

### 适合冻结完整报文

- 单一 tool call 的非流式双向转换；
-reasoning envelope 的编码/解码；
-确定的 stop reason 映射；
-usage 三桶样例；
-CSSwitch 的小型 Chat/Responses 转换样例。

原因：输入输出确定、字段规模有限，结构漂移通常就是回归。

### 只应冻结不变量

-多工具交错 SSE；
-动态 item id；
-chunk 切分边界；
-provider 可选 usage 字段集合；
-截断和兼容网关缺事件场景。

应断言：

- id 到 index 的关联；
-每块 start/stop 配对；
-终态唯一；
-thinking → signature → stop 的顺序；
-usage 守恒；
-失败不伪装成功。

完整字节 golden 会把 JSON key 顺序、随机 id 和 chunk 粒度误当成协议合同。

## 10. 一条可执行的人工验收链

只跑“模型回复文本”不够。真正的工具闭环验收至少包含：

1. 发送一个必定触发 `lookup` 的请求。
2. 检查上游拿到的 tool schema 和 arguments。
3. 检查返回 call id。
4. 用相同 id 发送 tool result。
5. 检查 continuation 没有丢 reasoning 或角色。
6. 检查最终 stop reason 是普通结束。
7. stream 模式再检查事件顺序和终态唯一性。
8. 截断一次 arguments，确认返回错误而非成功。

本轮没有执行这条验收链；它是后续真机或 loopback 验证计划。

## 11. 思考点

1. 为什么 tool id 正确但 stop reason 错误，Agent 仍可能卡住？
2. CSSwitch 合成 SSE 和真正上游 SSE 在用户体验与故障边界上有什么区别？
3. 为什么 thinking 文本可见，不代表 thinking 可以跨轮 continuation？
4. Golden 过细和过粗分别会漏掉或制造什么问题？
5. 一条协议路径“支持 tools”时，至少应明确哪五个子能力？

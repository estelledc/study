# 最终综合：先用这一篇建立完整模型

## 1. 一句话结论

CSSwitch 和 CC Switch 都能“切模型”，但控制的对象不同：

- **CSSwitch**深入管理 Claude Science 的第三方 gateway、隔离 HOME 和外部 runtime。
- **CC Switch**横向管理七类 AI 编程客户端的 provider 配置、live 投影和本地 proxy。

因此：

```text
CSSwitch 的主问题：这个进程是谁，我有没有资格控制它？
CC Switch 的主问题：数据库、设备选择和客户端文件是否仍指向同一状态？
```

## 2. 统一术语

| 术语 | 本材料中的含义 | 不等于 |
|---|---|---|
| Provider | endpoint、credential、model 和能力策略的组合 | 只有一个 API URL |
| Control plane / 控制面 | 保存选择、策略、健康和恢复状态 | 真正搬运每次模型请求 |
| Data plane / 数据面 | gateway 或客户端实际发送请求的链路 | 配置管理 UI |
| SSOT / Source of Truth | 某类状态的权威来源 | 所有状态只能有一个文件 |
| Live config / live 文件 | 目标客户端当前读取的 JSON/TOML/YAML/`.env` | 内部数据库的绝对副本 |
| Projection / 投影 | 把内部 provider 写成客户端格式 | 双向自动同步 |
| Backfill / 回填 | 从 live 文件读取允许的用户修改并保存回来 | 无条件以 live 覆盖数据库 |
| Reconcile / 对账 | 比较多份状态并按规则恢复一致 | 猜测哪一份更新 |
| Health / 健康 | 服务可以回答请求 | 服务身份已证明 |
| Identity / 身份 | executable、data-dir、PID、launch ID 等一致 | 程序有权终止它 |
| Ownership / 所有权 | 程序有足够证据复用、替换或停止对象 | 端口或进程名看起来相同 |
| Atomic write / 原子文件写 | 单文件不出现半写内容 | 跨数据库和多文件整体事务 |
| Journal / 事务日志 | 持久记录目标与阶段，供崩溃后继续 | 只在内存中的 generation |
| Generation | 进程内作废旧异步结果的版本号 | 跨重启恢复记录 |
| Protocol invariant / 协议不变量 | 转换前后必须保持的 ID、顺序和终态 | JSON 字段名称完全相同 |

## 3. 两项目的核心控制流

### 3.1 CSSwitch

```text
候选 profile
  -> scratch gateway 验证
  -> 正式 gateway
  -> 提交 active_id
  -> Science runtime preflight
  -> 隔离登录
  -> executable/data-dir/PID/health 身份校验
  -> 启动或复用 Science
```

关键设计：

1. **Validate before persist**：坏 key 或坏 endpoint 不应先成为 active。
2. **健康、身份、所有权分层**：未知端口即使返回 200，也不能接管或误杀。
3. **Owner-aware SSOT**：CSSwitch 管 profile 和 gateway；Science data-dir 仍归 Science。
4. **核心 fail-closed，可选功能降级**：runtime 身份不明必须失败，外部 Skill route 失败只能 warning。

### 3.2 CC Switch

```text
React 只提交 app + provider id
  -> Rust 从 SQLite 重新加载 provider
  -> 回填旧 provider 的允许字段
  -> 更新 device current
  -> 更新 SQLite current
  -> 合并 shared config
  -> 写客户端 live 文件
```

关键设计：

1. **Backend reload by id**：IPC 不携带一份可能过期的完整配置。
2. **Projection + backfill**：数据库是 provider 正文，live 是客户端投影，但部分用户修改可回填。
3. **Per-app lock**：独立客户端可以分别串行，不需要全局阻塞。
4. **普通投影与 proxy 接管分开**：前者直连 provider，后者固定走本地数据面并支持热切换。

## 4. 最重要的失败结论

### 4.1 CSSwitch 的非对称恢复

CSSwitch 被强杀后：

- Science 可以通过持久 data-dir、候选 executable、CLI status、监听 PID 和 health 重建身份。
- Rust Gateway 的 ownership 依赖内存 `Child` 和 launch ID，重启后不能自动 reclaim。

持久 secret 只能认证请求，不能证明端口上的进程属于当前 CSSwitch。

正确行为是 fail closed，不是 `pkill` 或按端口杀进程。

### 4.2 CC Switch 的部分提交

普通 A → B 切换可能停在：

```text
Device current = B
SQLite current = B
Live config = A
```

此时：

-控制面倾向显示 B；
-客户端真实请求仍去 A；
-普通应用重启不会自动修复；
-必须再次明确选择 B，或执行显式 `sync_current_to_live`。

### 4.3 Proxy ownership 不是一个布尔值

CC Switch 至少需要联合观察：

- `E`：proxy enabled；
- `B`：恢复 backup；
- `L`：live 文件中的 proxy route/placeholder。

单看 E 会漏掉崩溃窗口和 stale 状态。完整八态见[失败恢复状态机](05-failure-recovery-state-machines.md#9-proxy-ownership-的三个证据)。

### 4.4 Failover 数据面成功，不代表控制面已收敛

请求由 fallback B 成功处理后，响应可以先返回，持久 hot switch 在后台执行。后台失败或并发 B/C 竞争时，最终 current 不一定等于刚才处理请求的 provider。

所以必须分开观测：

-请求成功；
-当前路由目标；
-current 持久化完成。

## 5. 协议转换的最小验收

只看到文本回复不能证明 gateway 正确。一次工具闭环至少保持：

1. tool call ID 与 tool result ID 相同；
2.工具名不串线；
3.参数在 object/string 之间可逆；
4.有工具调用时 stop reason 表示等待工具；
5. continuation 所需 reasoning/signature 可验证；
6. usage/cache 不重复计数；
7. SSE block 的 start/delta/stop 成对；
8.截断或流读取失败不能伪装正常完成。

CSSwitch 的 OpenAI 路径会把完整上游 JSON重放为合成 SSE；CC Switch 的 Responses/Codex 路径维护真正的增量状态机。两者都“支持 SSE”，延迟和失败语义却不同。

## 6. 新增 Provider 时怎样判断改造规模

以 Acme 为例：

-如果只是 OpenAI Responses + 标准 Bearer，两个项目都能大量复用现有 adapter。
-如果增加非标准 header、部分 tool 能力或特殊 `web_search` 规则，就不再是“多一个 preset”，而是新增 auth/capability policy。

重构信号：

-能力由 host/model 字符串推断；
-同一事实散落在 UI、TS、Rust、adapter、catalog 和文档；
-新增 provider 要修改五个以上策略文件；
-direct 与 proxy 对同一能力结论不同；
-不断增加 `is_xxx` boolean。

共同目标应是：

```text
ProviderDefinition
  = endpoint
  + protocol
  + auth
  + tool capabilities
  + model capabilities
  + evidence
```

UI、运行 policy、diagnostics 和测试向量都从它派生。

## 7. 两项目最值得复用的模式

### CSSwitch

1. 候选验证后再提交 active。
2. health、identity、ownership 三分。
3. 外部 runtime 的强身份与未知状态 fail-closed。
4. source/unit、artifact、installed、live、release 证据分层。
5. 核心链路和可选 bridge 的失败隔离。

### CC Switch

1. 多客户端统一领域模型。
2. IPC 只传 id，backend 从 SSOT 重取。
3. provider 正文、设备 current、live projection 分层。
4. adapter 抽离 endpoint/auth/transform。
5.按 app 串行和跨平台 CI。

## 8. 不能机械照搬

- CC Switch 读取真实客户端 OAuth/Keychain 的能力不能进入 CSSwitch 第三方隔离边界。
- CSSwitch 的全局生命周期锁不能原样套到七类独立客户端。
- CSSwitch path secret 不能替代非 loopback 服务的标准认证。
- CC Switch 的 warning 后继续不能用于进程身份、路径所有权和真实账号边界。
-任何项目都不能把单元测试、loopback、安装包和真实 provider 写成同一层“通过”。

## 9. 三条阅读路线

### 20 分钟：建立判断框架

1. 本文。
2. [零基础验证实验](09-beginner-verification-lab.md) 第 0、4 节。
3. [案例卡与答案检查](08-case-cards-and-answer-guide.md) 的案例 2、4、7。
4. 回答本文第 11 节前三题。

### 90 分钟：掌握切换与恢复

1. [CSSwitch 深潜](02-csswitch-v060-deep-dive.md) 第 2-5 节。
2. [CC Switch 深潜](03-ccswitch-v317-deep-dive.md) 第 2-6 节。
3. [失败恢复状态机](05-failure-recovery-state-machines.md)。
4. 完成[零基础验证实验](09-beginner-verification-lab.md)。
5. 独立画出两个状态矩阵。

### 半天：研究 gateway 与扩展

1. [协议与工具闭环](06-protocol-tool-loop-invariants.md)。
2. [Acme Provider 扩展实验](07-acme-provider-extension-lab.md)。
3. 按源码链接精读一条 SSE 路径。
4. 写一份新的 provider capability/test matrix。

## 10. 证据边界

本研究已经证明：

- **E1 静态源码**：固定提交中的控制流、类型、测试定义、正常/失败状态机、协议不变量和扩展改造面；
- **E2 本地验证**：2026-07-17 在固定提交上运行 CSSwitch Responses 6 个测试和 CC Switch `web_search` 投影 3 个测试，均通过；
- **E3 外部证据**：CC Switch 同一提交的前端、Ubuntu、Windows、macOS CI job 成功；CSSwitch v0.6.0 的公开 DMG 身份和负面签名事实可复核。

本研究没有证明：

-当前安装 App 与固定提交一致；
-真实 Science、OAuth、Keychain 或任一 provider 可用；
-真实 tool loop、SSE 首 token 或跨重启体验；
-公开 release 的所有平台 artifact 都可接受；
-本文提出的 journal、RecoveredGateway 或统一 ProviderDefinition 已实现。

## 11. 收尾自测

1. 为什么 health 通过后仍可能没有 ownership？
2. 为什么 `Device=B, DB=B, Live=A` 不能在启动时无条件用 B 覆盖 A？
3. 为什么 tool ID 正确但 stop reason 错误，Agent 仍会卡住？
4. `generation` 和 durable journal 分别覆盖什么故障？
5. 新增 provider 时，怎样判断是在加模板还是在加策略？

回答格式：

```text
结论：
关键不变量：
源码或章节证据：
反例：
仍需运行验证：
```

## 12. 停止条件

本轮源码研究到此停止。以下情况之一出现时才恢复：

1. 用户阅读后提出具体不理解的问题；
2. 上游版本变化，需要重新核对已引用机制；
3. 要为任一项目贡献具体 issue/PR；
4. 要在隔离护栏下验证真实 runtime/provider；
5. 要把某个模式提炼进长期 `learnings/`。

在此之前不继续新增同领域材料，避免用文档数量代替学习或外部进展。

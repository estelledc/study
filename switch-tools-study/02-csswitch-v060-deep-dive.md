# 02. CSSwitch v0.6 深潜：先证明身份，再启动 Science

固定版本：`0897e78f201e9e463be6a13e3d11888bde31f3b0`。

## 1. 核心直觉

CSSwitch 像一个负责危险设备的值班员。它不能看到“指示灯亮了”就接管设备，而要依次确认：

1. 当前 profile 本身有效；
2. gateway 是自己刚启动的那一个；
3. Science binary、data-dir、端口和监听 PID 属于同一实例；
4. 所有实验状态都在隔离 HOME；
5. 失败时没有碰真实账号，也没有误杀陌生进程。

因此它的主线不是简单的“保存配置”，而是：

```text
候选 profile
  -> scratch gateway 验证
  -> 正式 gateway
  -> runtime preflight
  -> 隔离登录
  -> Science 身份证明
  -> 启动或复用
  -> 打开 UI
```

## 2. 两个不同按钮，两段不同事务

### 2.1 “设为当前”

目标是安全切换 provider profile，不启动 Science。

```text
UI activate
  -> set_active_profile
  -> lifecycle 串行器
  -> 校验 profile 字段
  -> 启动 scratch gateway
  -> 探测 /v1/models 或 /v1/messages
  -> 启动正式 gateway
  -> 最后才提交 active_id
```

关键证据：

- 前端入口：[`desktop/src/main.js:1007-1033`](../repos/csswitch/desktop/src/main.js#L1007-L1033)
- Tauri command：[`commands/profiles.rs:229-252`](../repos/csswitch/desktop/src-tauri/src/commands/profiles.rs#L229-L252)
- profile transaction：[`runtime/profile_switch.rs:51-217`](../repos/csswitch/desktop/src-tauri/src/runtime/profile_switch.rs#L51-L217)
- scratch probe：[`scratch.rs:190-370`](../repos/csswitch/desktop/src-tauri/src/scratch.rs#L190-L370)

设计要点：

- scratch 使用动态端口、独立 secret 和 `launch_id`；
- `ScratchGuard` 离开作用域会清理临时进程；
- 正式 gateway 健康后才写 `active_id`；
- 正式 gateway 或配置提交失败时恢复旧 gateway/profile；
- Science 不参与这次回滚，因为它还没有启动。

这就是 **validate before persist**：先用候选执行最小真实合同，再改变持久状态。

### 2.2 “一键开始”

目标是让正确的 gateway 和正确的隔离 Science 形成一条可证明的链路。

前端先调用 runtime preflight：

- 已安装 App 可用：继续；
- 只有历史 cache：必须用户明确“仅本次使用”；
- 显式 binary override 无效：直接失败，不静默换另一个 binary。

证据：

- 前端一键入口：[`desktop/src/main.js:1041-1114`](../repos/csswitch/desktop/src/main.js#L1041-L1114)
- runtime 选择：[`runtime/science.rs:274-447`](../repos/csswitch/desktop/src-tauri/src/runtime/science.rs#L274-L447)
- one-click command：[`commands/runtime.rs:311-350`](../repos/csswitch/desktop/src-tauri/src/commands/runtime.rs#L311-L350)

## 3. 一键启动的 13 步控制流

### Step 1：前端检查 active profile

第三方模式没有 `active_id` 就拒绝继续，避免启动一个没有明确上游的 runtime。

### Step 2：选择 Science executable

没有可复用或已确认的 runtime、需要冷选择时，顺序是：

1. 安全且显式的 `SCIENCE_BIN`；
2. 当前安装的 Claude Science App；
3. 版本可确认、用户仅本次授权的 cache。

已经证明健康或刚确认停止的 runtime 会优先复用，不重新走上述选择。cache 选择不持久化，下一次需要冷选择时仍重新判断当前安装 App。

### Step 3：进入全局生命周期串行器

启动、停止、profile 激活等修改 AppState 的操作不能交叠。实现见
[`lifecycle.rs:1-47`](../repos/csswitch/desktop/src-tauri/src/lifecycle.rs#L1-L47)。

### Step 4：判断已有 Science 状态

状态不是简单的 running/stopped，而是：

- `RunningHealthy`：身份和健康都能证明；
- `Stopped`：可以冷启动；
- `Unknown`：端口或进程存在，但无法证明所有权，拒绝接管。

判断代码：

- [`sandbox_session.rs:229-350`](../repos/csswitch/desktop/src-tauri/src/runtime/sandbox_session.rs#L229-L350)
- [`science.rs:534-615`](../repos/csswitch/desktop/src-tauri/src/runtime/science.rs#L534-L615)

### Step 5：健康实例走复用

只有 daemon 健康且隔离登录完整时，才不重写登录、不重启 Science，只确保 gateway 正确并重新打开 UI。

### Step 6：损坏登录走受控修复

如果实例身份可证明，但隔离登录损坏，先按强身份停止，再沿原 data-dir 修复。未知实例不会因为“看起来像 Science”就被终止。

### Step 7：准备隔离登录

`ensure_virtual_login` 的策略：

- 完整状态原样复用；
- 损坏但可恢复时保留组织；
- 首次才创建；
- 多个历史组织无法确定 active org 时中止。

证据：[`oauth_forge.rs:528-655`](../repos/csswitch/desktop/src-tauri/src/oauth_forge.rs#L528-L655)。

### Step 8：把 profile 派生为 gateway launch

profile 不是直接交给 server。`adapter_for_profile` 把它转换为：

- `deepseek`
- `qwen`
- `openai-custom`
- `openai-responses`
- `relay`

证据：[`runtime/provider.rs:11-85`](../repos/csswitch/desktop/src-tauri/src/runtime/provider.rs#L11-L85)。

### Step 9：证明 gateway 是否可复用

复用同时要求：

- 受管 `Child` 仍存活；
- 端口相同；
- provider/gateway kind/shim 相同；
- profile fingerprint 相同；
- Science host context 相同；
- `/health` 的 `launch_id` 相同。

否则停止旧受管 child 并启动 bundled Rust sidecar。实现见
[`proxy_lifecycle.rs:332-480`](../repos/csswitch/desktop/src-tauri/src/runtime/proxy_lifecycle.rs#L332-L480)。

### Step 10：gateway 绑定与认证

gateway 强制绑定 `127.0.0.1`，path secret 不匹配返回 403：

- [`gateway/src/server.rs:1347-1369`](../repos/csswitch/desktop/gateway/src/server.rs#L1347-L1369)
- [`gateway/src/auth.rs:1-19`](../repos/csswitch/desktop/gateway/src/auth.rs#L1-L19)

### Step 11：按 provider 进入协议分支

[`gateway/src/server.rs:604-771`](../repos/csswitch/desktop/gateway/src/server.rs#L604-L771) 负责消息入口：

- Qwen / OpenAI Chat / Responses：Anthropic 与 OpenAI 协议转换；
- relay：保留 Anthropic 协议，修正模型和 thinking；
- DeepSeek：Anthropic 路径，并按 shim 处理 DSML。

### Step 12：启动隔离 Science

脚本接收：

- 选定 binary；
- 隔离 HOME；
- 独立 data-dir；
- 含 path secret 的 gateway URL；
- 独立 Science/preview 端口。

脚本拒绝真实 `8765`、端口冲突、symlink data-dir 和不安全 binary，并执行：

```text
serve
  --data-dir <isolated>
  --host 127.0.0.1
  --port <science-port>
  --sandbox-port <preview-port>
  --no-browser
  --no-auto-update
  --detached
```

证据：[`scripts/launch-virtual-sandbox.sh:65-203`](../repos/csswitch/scripts/launch-virtual-sandbox.sh#L65-L203)。

### Step 13：重新证明身份并打开 UI

启动后先轮询 HTTP health，再验证监听 executable。身份不匹配就停止本轮刚启动实例。外部 Skill route 失败只产生 warning，不阻断主线。

前端之后每 2.5 秒查询轻量状态。注意：高频绿灯只代表当前可观测 health 和内存 metadata，不是完整 PID/executable 身份证明。

## 4. Profile 切换为什么像两阶段提交

它不是数据库意义上的标准 2PC，但思路相似：

| 阶段 | CSSwitch 动作 | 防止的问题 |
|---|---|---|
| Prepare | 校验字段，scratch gateway 探测候选 | 把坏 key、坏 URL、坏协议写成 active |
| Commit | 正式 gateway 健康后写 active_id | 配置已切换但数据面未就绪 |
| Compensate | 正式启动或保存失败时恢复旧 gateway/profile | 半提交状态 |

需要注意：这仍是进程内补偿事务，不是崩溃恢复日志。进程在特定时刻被强制终止时，仍要依赖下次启动的状态探测和对账。

## 5. “健康”和“身份”为什么必须分开

错误认知：

> 端口返回 `/health = 200`，所以它就是我们的进程。

正确理解：

```text
health = 服务能回答
identity = 服务属于这次受管启动
ownership = 程序有权复用、停止或替换它
```

Science 的强身份组合包括：

- canonical executable；
- data-dir CLI 状态；
- 唯一监听 PID；
- 端口；
- HTTP health。

gateway 额外使用 `launch_id`、profile fingerprint 和 Science context。这样能防止：

- 陌生程序恰好占同一端口；
- 上一轮残留进程被误当成本轮；
- profile 已变但旧 gateway 仍健康；
- Science binary 更新后复用旧缓存；
- 仅凭端口执行误杀。

## 6. v0.3.0 到 v0.6.0 的架构跃迁

| v0.3.0 | v0.6.0 | 变化意义 |
|---|---|---|
| Python `csswitch_proxy.py` | bundled Rust gateway，无 Python fallback | 打包、身份和协议模块统一 |
| port + adapter + key fingerprint + 普通 health | `Child` + launch ID + profile/Science context | 从“服务像对的”升级为“实例可证明” |
| 可用 `pkill -f` 清孤儿 | 只处理精确归属 child/legacy binary | 降低误杀风险 |
| 固定 App binary，复制真实 HOME runtime 资产 | executable 与持久 data-dir 解耦 | 不读取真实 Science runtime 资产 |
| CLI 状态失败时可退化到裸 health | Unknown 状态拒绝接管 | 核心边界 fail-closed |
| 单体 Tauri 进程管家 | profile、gateway、Science、session、diagnostics 分层 | 可独立测试与推理 |
| Anthropic/OpenAI 基本路径 | 增加 Responses、能力 catalog、Skill/SSH bridge | 产品从代理原型扩到受限控制面 |

旧版证据可通过 `git show v0.3.0:<path>` 复核；当前实现不应继续按旧 Python 目录理解。

## 7. 失败分层

### 必须阻断一键启动

- profile 无效；
- gateway 不能启动或身份不匹配；
- runtime preflight 失败；
- 端口所有权不明；
- Science launch/identity 失败；
- 用户启用 SSH bridge 后，安全校验失败。

### 只能降级，不应阻断主线

- legacy Skill store 内容异常；
-外部 Skill connector 配置失败；
- Anthropic catalog 不可用；
- 外部 Skill bridge 单次失败。

这体现了 **failure containment**：可选扩展失败不能污染核心推理链，显式授权的安全边界失败又不能被 warning 吞掉。

## 8. 最值得精读的六个文件

1. [`runtime/sandbox_session.rs`](../repos/csswitch/desktop/src-tauri/src/runtime/sandbox_session.rs)
   一键启动的组合根。
2. [`runtime/science.rs`](../repos/csswitch/desktop/src-tauri/src/runtime/science.rs)
   runtime 选择与强身份。
3. [`runtime/proxy_lifecycle.rs`](../repos/csswitch/desktop/src-tauri/src/runtime/proxy_lifecycle.rs)
   gateway 生命周期和所有权。
4. [`runtime/profile_switch.rs`](../repos/csswitch/desktop/src-tauri/src/runtime/profile_switch.rs)
   profile 验证、提交与补偿。
5. [`gateway/src/server.rs`](../repos/csswitch/desktop/gateway/src/server.rs)
   数据面和协议分支。
6. [`desktop/src/main.js`](../repos/csswitch/desktop/src/main.js)
   用户动作、preflight 和状态投影。

## 9. 本轮没有证明什么

- 当前已安装 CSSwitch.app 与此提交一致；
- 真实 Claude Science 版本兼容；
- 任意真实 provider 的 key、模型和工具调用可用；
- 外部 Skill 能在真实对话中被自然触发；
- v0.6.0 已通过 Developer ID 签名、公证或 Gatekeeper。

仓库发布证据反而明确记录：v0.6.0 是 ad-hoc 签名、未 notarize，Gatekeeper assessment 被拒绝。源码测试通过不能覆盖这些结论。

## 10. 思考点

1. 如果当前 tracked Child 的 `/health` 正常但 `launch_id` 不同，为什么可以停止自己持有的 Child 后重启？如果没有 tracked Child，为什么必须拒绝接管？
2. 为什么 cache binary 的选择必须是“仅本次”，而不应自动写入长期设置？
3. profile 激活和 one-click 为什么要共用生命周期串行器？
4. 外部 Skill bridge 失败为什么可以 warning，SSH wrapper 校验失败却必须阻断？
5. 从 v0.3.0 到 v0.6.0，最大的升级是“换成 Rust”还是“建立所有权合同”？请用三个证据说明。

# 08. 案例卡与答案检查：把抽象概念变成状态变化

本章用于主动回忆。建议先遮住“答案检查”，独立写出状态和证据，再回来比对。

## 案例 1：CSSwitch 激活候选 profile

候选：

```text
template = acme
endpoint = https://api.acme.example/v1
model = acme-code-1
key = ***
old active = deepseek
```

### 问题

候选 key 无效时，哪些状态允许改变？

### 答案检查

允许改变：

-临时 scratch 端口；
-临时 launch ID；
-scratch Child；
-临时探测日志。

不应改变：

-持久 `active_id`；
-正式 Gateway；
-Science runtime；
-旧 profile；
-真实 Claude 状态。

原因：先验证候选，再提交正式 gateway 和 active id。详见[第 2 章](02-csswitch-v060-deep-dive.md#2-两个不同按钮两段不同事务)。

## 案例 2：Gateway 身份判定

| Tracked Child | Health | Launch ID | Executable | 结论 |
|---|---|---|---|---|
| 当前 Child alive | 正常 | 相同 | 相同 | 可复用 |
| 当前 Child alive | 正常 | 不同 | 相同 | 本轮身份不符，停止自己持有的 Child 后重启 |
| 无 Child | 正常 | 未知 | 看似相同 | 拒绝接管 |
| 无 Child | 正常 | 相同 secret | 看似相同 | 仍拒绝；secret 不是 ownership |
| Child exited | 无 | 旧值 | 相同 | 清旧句柄，启动新实例 |

关键区分：

```text
可以停止自己持有且身份不符的 Child
  != 可以停止端口上的任意未知 listener
```

## 案例 3：Science cache 为什么只能本次授权

### 风险链

```text
installed App 缺失
  -> 找到历史 cache
  -> 用户本次明确接受
  -> 使用持久 data-dir

如果把 cache 持久设为默认：
  -> 下次不再重新检查 installed App
  -> 可能长期运行旧 binary
  -> 新 binary 已接触 data-dir 后还可能错误降级
```

因此 cache 不是“第二安装源”，只是 App 缺失时的单次恢复选择。

## 案例 4：CC Switch A → B 状态快照

初始：

```text
Device current = A
SQLite current = A
Live config = endpoint_A
```

执行到 SQLite 成功、live 写失败：

```text
Device current = B
SQLite current = B
Live config = endpoint_A
```

### 问题

此时 UI 显示谁？真实请求发给谁？

### 答案检查

-有效 current 优先读取 device，因此控制面倾向显示 B；
-客户端仍读取 live 文件，因此真实请求仍发给 A；
-应用普通重启不会自动修复；
-再次明确选择 B 或显式 `sync_current_to_live` 才能安全重投影；
-直接切到 C 可能先把 A 的 live 内容回填进 B 快照。

这就是“控制面事实”和“数据面事实”分裂。

## 案例 5：普通投影和 proxy 接管

### 普通投影

```text
Claude Code
  -> https://provider-b.example
  -> Provider B
```

- live 文件保存 B 的 endpoint/key；
-CC Switch 退出后请求仍可直连；
-客户端何时重读配置决定是否需要重启；
-不能做请求级 failover。

### Proxy 接管

```text
Claude Code
  -> http://127.0.0.1:15721
  -> CC Switch proxy
  -> Provider B
```

- live 文件保持本地 endpoint；
-provider 在 proxy 内热切换；
-可以记录 usage、熔断和 failover；
-proxy 停止后数据面不可用，必须恢复 live 或重启 proxy；
-原始 live 配置需要 backup。

## 案例 6：Shared config 合并

Provider B：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://b.example",
    "ANTHROPIC_AUTH_TOKEN": "secret-b"
  },
  "theme": "dark"
}
```

Shared：

```json
{
  "theme": "light",
  "hooks": {"afterTool": "notify"}
}
```

投影结果：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://b.example",
    "ANTHROPIC_AUTH_TOKEN": "secret-b"
  },
  "theme": "light",
  "hooks": {"afterTool": "notify"}
}
```

规则：

-shared 冲突叶子覆盖 provider；
-key、endpoint、model 等敏感或 provider 专属字段不能从 live 提取进 shared；
-自动反向提取当前只覆盖满足条件的 Claude/Codex provider，不是所有客户端；
-用户显式清空 shared 后，不应被旧 live 内容偷偷复活。

## 案例 7：事务术语只用一个失败点理解

目标：把 A 切到 B，live 写失败。

| 术语 | 在这个案例里是什么 |
|---|---|
| 原子文件写 | 单个 live 文件要么旧内容，要么新内容，不出现半个 JSON |
| SQLite transaction | 数据库内清 A current、设 B current 一起成功 |
| 业务事务 | device、SQLite、多个 live 文件整体一起成功或失败 |
| 补偿 | 后续步骤失败后，把已改 device/DB 写回 A |
| Journal | 操作前记录 `from=A,to=B,phase=...`，崩溃后知道继续哪一步 |
| Reconcile | 比较 device/DB/live，按规则让它们重新一致 |
| 2PC | 多参与者先 prepare，再统一 commit；两个项目都不是标准分布式 2PC |

为什么只靠原子文件写不够：

```text
每个文件都完整
  + SQLite 内部也完整
  != 所有组件指向同一个 provider
```

## 案例 8：Capability catalog 哪些字段执行

CSSwitch 当前有两类能力描述：

### 会影响 UI/输入门禁

- `base_url_required`
- `model_required`
- `model_discovery`

这些来自 template/profile DTO。

### 主要用于诊断与证据

- `status`
- `action`
- `reason`
- `evidence`
- `tests`

Gateway 不会读取 catalog 的 `action` 执行过滤。真正行为仍硬编码在 gateway policy/transform 中。

因此 catalog 的价值是：

-让限制有统一名字；
-把原因和测试绑定；
-向诊断输出 rule id；
-审查代码与文档是否漂移。

它当前不是策略引擎。

## 案例 9：Golden 冻结边界

### 完整报文适合

输入确定、输出短小的：

-单 tool call；
-stop reason 映射；
-reasoning envelope 编解码；
-usage 三桶；
-小型非流式转换。

### 只冻结不变量适合

动态和交错的：

-多工具 SSE；
-随机 item id；
-chunk 边界；
-provider 可选字段；
-异常截断。

否则一次无害的 chunk 划分变化会造成大量假回归。

## README 八题答案骨架

### 1. 四类 Switch 产品为什么不同

按控制层回答：

```text
一次启动参数
  -> 客户端配置投影
  -> 运行时 gateway 路由
  -> 宿主进程生命周期
```

同样“换模型”，控制的状态和失败成本不同。

### 2. CSSwitch 为什么不能只凭 `/health`

health 只证明服务能回答；停止权限还需要 executable、data-dir、PID、port、launch identity 等 ownership 证据。

### 3. 为什么先 scratch 再保存

把 key、endpoint、protocol 的失败留在候选阶段，避免 active id 已提交但数据面不可用。

### 4. CC Switch 为什么要三层存储

- SQLite：provider 正文；
-device settings：本机当前选择；
-live 文件：目标客户端真正消费的投影。

三者服务不同所有者，不能合成一份。

### 5. 单文件原子为什么仍会整体分裂

每个参与者内部完整，不等于参与者之间共同提交。需要业务 journal、补偿或 reconcile。

### 6. Loopback 为什么不替代认证

loopback 限制远端机器；认证限制本机调用者。它们回答不同问题。

### 7. CI 强和证据可审计为什么不是一回事

CI 提高自动回归覆盖；证据分层说明每个结果到底证明到源码、artifact、安装还是发布层。

### 8. 两项目扩展后谁先失控

- CSSwitch：gateway provider policy 和 host 特例先膨胀；
-CC Switch：跨 TS/Rust/preset/adapter/catalog 的 capability/auth 事实先分散；
-CC Switch 若管理外部进程，首先缺强身份和跨重启 ownership。

## 开放设计题怎样回答

以下问题没有唯一实现答案：

-选 journal、补偿还是 reconcile；
-怎样生成 TS/Rust 共享 DTO；
-catalog 是否升级为策略引擎；
-何时把 provider 特例抽成 policy。

回答时使用：

```text
目标损失：
必须保持的不变量：
可观察状态：
崩溃窗口：
最小改动：
新增验证：
仍未解决的风险：
```

只写“我会加一个抽象”或“用事务解决”不算完整答案。

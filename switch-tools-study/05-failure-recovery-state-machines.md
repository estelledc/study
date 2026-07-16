# 05. 失败恢复状态机：系统崩了以后，谁有资格修

本章来自两轮审计中最重要的缺口：初版材料讲清了正常切换，却没有把“部分成功、应用崩溃、重启恢复”追到底。

## 1. 先建立恢复直觉

恢复系统像处理一间停电后的机房：

- **配置**告诉你本来想启动什么；
- **健康检查**告诉你现在有东西在运行；
- **身份记录**告诉你运行的是不是原来的设备；
- **所有权证明**决定你有没有资格复用或关闭它；
- **事务日志**告诉你上次做到第几步。

缺少任何一项都不能靠猜。

```text
能看见进程
  != 能证明身份
  != 能证明所有权
  != 知道上次事务做到哪里
```

## 2. CSSwitch：正常退出和崩溃是两套世界

### 2.1 正常启动

简化时序：

```text
one_click_login 获取生命周期锁
  -> 恢复或选择 Science runtime
  -> 读取持久 path secret
  -> 捕获 generation
  -> spawn Gateway
  -> 校验 health + launch_id
  -> generation + secret + Child 存活复检
  -> 发布 Gateway Child 到 AppState
  -> detached 启动 Science
  -> 校验 Science executable/data-dir/PID/health
  -> 保存 runtime identity 和 URL
```

证据：

- [`commands/runtime.rs:323-337`](../repos/csswitch/desktop/src-tauri/src/commands/runtime.rs#L323-L337)
- [`proxy_lifecycle.rs:407-616`](../repos/csswitch/desktop/src-tauri/src/runtime/proxy_lifecycle.rs#L407-L616)
- [`sandbox_session.rs:238-502`](../repos/csswitch/desktop/src-tauri/src/runtime/sandbox_session.rs#L238-L502)

这里有一个容易忽略的拓扑差异：

- Gateway 是 CSSwitch 的受管 `Child`。
- Science 用 `--detached` 启动，不靠父进程 `Child` 长期管理。

所以两者崩溃后的恢复能力不同。

### 2.2 关闭窗口

窗口关闭事件被拦截，窗口只隐藏：

```text
CloseRequested
  -> prevent_close
  -> hide
```

Gateway、Science、generation、secret 和 runtime identity 都不变。证据：
[`lib.rs:318-326`](../repos/csswitch/desktop/src-tauri/src/lib.rs#L318-L326)。

### 2.3 `stop_all`

```text
获取生命周期锁
  -> bump generation，作废在途 Gateway 启动
  -> 用已知 binary + data-dir 停止 Science
  -> kill/wait tracked Gateway Child
  -> 清 secret、launch_id、provider、fingerprint 等内存状态
```

证据：

- [`commands/runtime.rs:286-308`](../repos/csswitch/desktop/src-tauri/src/commands/runtime.rs#L286-L308)
- [`science.rs:757-824`](../repos/csswitch/desktop/src-tauri/src/runtime/science.rs#L757-L824)
- [`lib.rs:101-124`](../repos/csswitch/desktop/src-tauri/src/lib.rs#L101-L124)

Science stop 失败时，Gateway 仍会被停止，但程序不能宣称 Science 已停；runtime identity 会保留，用于后续强校验。

### 2.4 `SIGKILL`

`SIGKILL` 不会执行：

- UI 退出命令；
- Tauri exit callback；
- `AppState::drop`；
- Gateway `kill/wait`；
- Science stop。

结果是 Gateway 和 detached Science 都可能遗留。

## 3. CSSwitch 恢复矩阵

| 场景 | 内存中的 Gateway Child | generation / launch_id | Science identity | 实际进程 | 下一步 |
|---|---|---|---|---|---|
| 稳态运行 | `Some(alive)` | 当前 / 已知 | 已知 | G、S 都活 | 完整身份一致时复用 |
| 关闭窗口 | 不变 | 不变 | 不变 | G、S 都活 | 重新显示窗口 |
| 启动中执行 `stop_all` | 生命周期锁后排队 | 启动完成后 bump | 先完成再停止 | 先起后停 | 最终收敛到全停 |
| 启动中清 active key | 锁后排队 | bump，清 Gateway 身份 | 保留 | S 活、G 停 | 补 key 后重启 G |
| 启动中切 profile | 锁后排队 | bump，新 launch_id | 保留 | S 不重启，G 替换 | 新 G 服务原 S |
| `stop_all` 成功 | `None` | bump / 清空 | confirmed stopped | G、S 都停 | 下次冷启动 |
| Science stop 失败 | `None` | bump / 清空 | 保留 | G 停，S 可能活 | 报错，重新强探测 |
| CSSwitch 被 `SIGKILL` | 内存丢失 | 重启后重置 / 丢失 | 内存丢失 | G、S 可能都活 | S 可重建，G 不可自动认领 |
| 仅 Gateway 死亡 | `Some(exited)` 可检测 | 旧 launch_id 失效 | 保留 | G 死、S 活 | 清旧 Child，启动新 G |
| 仅 Science 死亡 | G 仍 tracked | 不变 | 暂留旧值 | G 活、S 死 | 判 Stopped，重启 S |
| 重启后仅 Science 遗留 | `None` | 新 generation / 无 launch_id | 可从外部重建 | S 活 | 启动新 G，复用 S |
| 重启后 Rust Gateway 遗留 | `None` | 新 generation / 旧 launch_id 不知 | 可有可无 | G 活 | 端口视为未知，fail closed |

## 4. `generation + secret` 到底解决什么

### 4.1 Generation

generation 是进程内“这次启动结果还有没有发布资格”的版本号。

```text
启动任务捕获 generation=7
  -> 外部操作让状态进入 generation=8
  -> 旧任务健康检查完成
  -> 回锁发现 7 != 8
  -> 杀掉自己的局部 Child，不发布
```

它防止旧配置、旧 key 或旧启动结果晚到后重新写回。

### 4.2 Secret

即使 generation 相同，secret 变化也表示当前身份槽已经属于另一轮配置。发布前还要比较 secret，避免旧启动占用新状态。

### 4.3 Launch ID

launch ID 是网络侧的实例身份：

- 同端口；
-同 provider；
-同 secret；
-但 launch ID 不同；

仍不能当成同一实例。

### 4.4 它们没有解决什么

- `SIGKILL`；
-跨重启 ownership；
- PID 复用；
- Science 的持久身份；
-尚未发布到 AppState 的局部 Child 在进程退出瞬间成为 orphan；
-持久事务恢复。

实现与测试：

- [`lifecycle.rs:1-47`](../repos/csswitch/desktop/src-tauri/src/lifecycle.rs#L1-L47)
- [`runtime/proxy.rs:17-61`](../repos/csswitch/desktop/src-tauri/src/runtime/proxy.rs#L17-L61)
- [`proc.rs:351-460`](../repos/csswitch/desktop/src-tauri/src/proc.rs#L351-L460)

## 5. 为什么 Science 可重建，Gateway 不可 reclaim

### Science 有持久外部锚点

CSSwitch 可以重新取得：

- 固定 data-dir；
-候选 executable；
- `status --data-dir`；
- HTTP health；
-监听 PID；
- PID 的 canonical executable。

这些信息一致时，Science 可以被重新判为 `RunningHealthy`：
[`science.rs:574-723`](../repos/csswitch/desktop/src-tauri/src/runtime/science.rs#L574-L723)。

### Gateway 的所有权在内存

Gateway 复用依赖：

- `std::process::Child`；
- launch ID；
- provider/shim；
- key/profile fingerprint；
- Science context。

重启后只剩持久 secret，不剩 `Child` 和 launch ID。secret 本身不能证明进程归属，因为它跨重启持久存在。

因此当前正确行为是：未知 Rust listener 占端口时拒绝认领，也拒绝按端口杀进程。

## 6. CSSwitch 可以怎样安全改进

以下是设计建议，不是当前实现：

1. spawn 前持久化 `0600`、拒绝 symlink 的 launch intent。
2. intent 记录 launch ID、port、provider、shim、配置 fingerprint、预期 binary fingerprint，不记录 API key。
3. bind 成功后补充 PID 和不可复用的进程出生身份。
4. 重启时同时验证 UID、PID 出生身份、canonical executable、fingerprint、port、authenticated health 和 launch ID。
5. 验证成功后使用 `RecoveredGateway` 状态，不伪造无法恢复的 `Child`。
6. 停止优先走 authenticated shutdown；必要时再次核验 PID 身份后定点 `SIGTERM`。
7. exit cleanup 进入同一 lifecycle 串行器，并先 bump generation。

不能做：

- `pkill csswitch-gateway`；
- `lsof -ti:<port> | kill`；
-只凭进程名、端口、PID、binary path 或 secret 认领。

## 7. CC Switch 普通切换的失败时间线

普通 A → B 的顺序：

```text
回填 A
  -> device current = B
  -> SQLite current = B
  -> live files = B
  -> MCP projection
```

逐步状态：

| 失败点 | Device current | SQLite current | Live | 对用户的真实含义 |
|---|---|---|---|---|
| 初始 | A | A | A | 完全收敛 |
| 回填 A 失败 | A | A | A | A 的数据库快照可能过期，但切换继续 |
| 写 device 失败 | A | A | A | 切换中止 |
| device 已写 | B | A | A | 有效 current 已是 B，因为 device 优先 |
| SQLite 失败 | B | A | A | 返回失败，但逻辑 current 仍偏向 B |
| SQLite 已写 | B | B | A | 控制面是 B，客户端仍请求 A |
| live 写失败 | B | B | A 或部分新文件 | 最危险的普通状态分裂 |
| live 成功 | B | B | B | provider 切换完成 |
| MCP 失败 | B | B | B | 只 warning，不回滚 provider |

证据：

- [`provider/mod.rs:2624-2678`](../repos/ccswitch/src-tauri/src/services/provider/mod.rs#L2624-L2678)
- [`settings.rs:966-998`](../repos/ccswitch/src-tauri/src/settings.rs#L966-L998)
- [`providers.rs:290-309`](../repos/ccswitch/src-tauri/src/database/dao/providers.rs#L290-L309)

## 8. 普通应用启动不会自动修复分裂

初版材料曾把“启动对账”列为可能恢复路径，第一轮事实审计确认这不成立。

启动时：

- app 完全没有 provider 时，才把当前 live 导入为 default；
-已经存在 provider 行时，跳过导入；
-自动恢复路径只处理 proxy takeover backup/placeholder；
-不会调用普通 `sync_current_to_live`。

证据：

- [`lib.rs:550-597`](../repos/ccswitch/src-tauri/src/lib.rs#L550-L597)
- [`live.rs:1539-1553`](../repos/ccswitch/src-tauri/src/services/provider/live.rs#L1539-L1553)
- [`lib.rs:1029-1057`](../repos/ccswitch/src-tauri/src/lib.rs#L1029-L1057)

真实可用的收敛入口：

1. 再次明确切换到 B；
2. 显式 `sync_current_providers_live`；
3. 导入/同步后的 post-sync；
4. 修改相关 common config 触发定向重投影。

注意：直接切到 C 可能先把仍是 A 的 live 内容错误回填进逻辑 current B，因此“随便再切一次”不一定无损。

## 9. Proxy ownership 的三个证据

定义：

- `E`：`proxy_config.enabled`
- `B`：`proxy_live_backup` 存在
- `L`：live 文件含 proxy route/placeholder

| EBL | 含义 | 启动方向 | Provider switch |
|---|---|---|---|
| 000 | 正常直连 | 保持直连 | 普通切换 |
| 001 | 孤立 proxy live | 启动恢复清理到 000 | 按 hot switch 处理 |
| 010 | 孤立 backup | 启动恢复到 000 | 按 hot switch 处理 |
| 011 | backup + live，但 flag 关 | 启动恢复到 000 | hot switch，E 仍关 |
| 100 | flag 开，无 ownership 证据 | 重新建立接管到 111 | 普通切换 |
| 101 | flag + live，backup 丢失 | 尝试重建到 111 | hot switch 可补 backup |
| 110 | flag + backup，live 已恢复 | 重新接管到 111 | hot switch，客户端有差异 |
| 111 | 完整接管 | 恢复后继续 111 | hot switch |

关键点：

- provider switch 用 `B || L` 判断 ownership，不只看 E；
- UI/status 主要读取 E；
- disable 在 E=0 时直接返回，不能单独修复 001/010/011；
-启动先按 B/L 恢复，再按 E 决定是否重新接管。

证据：

- [`provider/mod.rs:2539-2551`](../repos/ccswitch/src-tauri/src/services/provider/mod.rs#L2539-L2551)
- [`services/proxy.rs:586-753`](../repos/ccswitch/src-tauri/src/services/proxy.rs#L586-L753)
- [`services/proxy.rs:1565-1621`](../repos/ccswitch/src-tauri/src/services/proxy.rs#L1565-L1621)

## 10. Hot switch 仍不是整体事务

顺序：

```text
SQLite current
  -> device current
  -> restore backup
  -> managed live
  -> in-memory active target
```

| 失败点 | Device | SQLite | Backup | Live | 后果 |
|---|---|---|---|---|---|
| SQLite | A | A | A | A | 没有变化 |
| Device | A | B | A | A | device 优先掩盖 SQLite B |
| Backup | B | B | A | A | 路由可到 B，但 disable 会恢复 A |
| Managed live | B | B | B | A 标签 | 路由 B，UI/客户端字段可能仍显示 A |
| Active target | B | B | B | B | 持久态完成，内存可能短暂旧 |

实现：[`services/proxy.rs:2133-2198`](../repos/ccswitch/src-tauri/src/services/proxy.rs#L2133-L2198)。

per-app lock 只保证操作不交叠，不提供 rollback。

## 11. Failover 成功不等于 current 已持久化

请求级 failover：

```text
请求由 B 成功处理
  -> 立即返回响应
  -> 更新内存 current_providers
  -> 后台 tokio::spawn hot switch(B)
```

如果后台持久切换失败：

-本次响应仍然成功；
- device/SQLite/backup/live 可能仍指向 A；
-错误不会撤销响应；
-并发请求分别 fallback 到 B、C 时，最终 current 由锁获取顺序决定，不一定是最新业务请求。

证据：

- [`forwarder.rs:492-526`](../repos/ccswitch/src-tauri/src/proxy/forwarder.rs#L492-L526)
- [`failover_switch.rs:41-133`](../repos/ccswitch/src-tauri/src/proxy/failover_switch.rs#L41-L133)

这说明数据面成功和控制面收敛是两个独立结论。

## 12. 三类恢复方案怎样选

| 方案 | 适合 | 不足 |
|---|---|---|
| 补偿事务 | 同一调用内立即失败 | 无法覆盖 kill/断电；回滚可能覆盖用户并发修改 |
| Durable journal | 跨 settings/SQLite/backup/live 的多步切换 | 需要 intent schema 和恢复状态机 |
| 显式 reconcile | 诊断和人工修复 | 没有 intent 时无法判断差异来自失败还是用户手改 |

对 CC Switch 的最小建议：

1. 每 app 持久化 `switch_intent(from,to,mode,phase,generation)`。
2. 每完成一阶段更新 phase。
3. 全部收敛后删除 intent。
4. 启动只 replay 未完成 intent，不无条件覆盖所有 live 文件。
5. failover intent 使用单调 generation/CAS，避免旧请求覆盖新结果。
6. doctor 展示 device、DB、backup、live、enabled 五元组。

## 13. 本章思考点

1. CSSwitch 重启后，为什么持久 secret 足以认证请求，却不足以证明遗留 Gateway 的所有权？
2. `generation` 和 durable journal 都叫“版本/阶段”，它们分别存在于哪一层，能覆盖什么故障？
3. CC Switch 的 `device=B, DB=B, live=A` 为什么不应在每次启动时盲目让 B 覆盖 A？
4. Proxy ownership 为什么不能只用一个 `enabled` 布尔值？
5. Failover 成功后，为什么需要把“响应成功”和“当前 provider 已切换”作为两个指标？

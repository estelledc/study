# OPERATIONS.md — Study 仓库运维手册

## 概览

这个文件是 **auto-push v3 批量流水线**和 **8 worktree 并行架构**的运维参考。

---

## Worktree 拓扑

```
$HOME/study                    ← main 仓库（git origin）
$HOME/study-refactor-papers    ← 论文线 worktree 1
$HOME/study-refactor-papers-2  ← 论文线 worktree 2
$HOME/study-refactor-papers-3  ← 论文线 worktree 3
$HOME/study-refactor-papers-4  ← 论文线 worktree 4
$HOME/study-refactor-projects  ← 项目线 worktree 1
$HOME/study-refactor-projects-2
$HOME/study-refactor-projects-3
$HOME/study-refactor-projects-4
```

并行度默认 `PARALLEL_WORKTREES=4`（可环境变量覆盖）。

同步所有 worktree：

```bash
node scripts/worktree-sync.mjs
# 或干跑查看操作
node scripts/worktree-sync.mjs --dry-run
```

> ⚠ `http.sslVerify=false` 已移除（2026-06 治理）。如遇 SSL 错误请检查证书配置。

---

## Round-Lock 机制

`data/round.lock.json` 防止多个 round 并发跑。

- **取锁**：`node scripts/round-lock.mjs --acquire <round_n> <workflow_id>`
- **查询**：`node scripts/round-lock.mjs --check`
- **释放**：`node scripts/round-lock.mjs --release`

如果上一个 round 卡死（stale），lock 文件超过 30 分钟会被自动视为 stale。

---

## Finalize-Round 流程

每个 round 末尾由 `scripts/finalize-round.sh` 处理：

1. `classify-notes --apply` → 补齐 frontmatter 分类
2. `regen-atlas` → 重新生成 atlas
3. `regen-backlinks` → 更新反向链接
4. `fix-frontmatter` → 修复 YAML 引号
5. `npm run build` → 验证构建
6. `git amend` → 将 regen 产物并入最后一个 commit
7. `git push origin main`
8. sync 8 worktree

**两段式回退**：build 失败先丢 regen commits（`git reset HEAD^`），再 `git reset --hard PREV_HEAD`。

---

## 治理期暂停与恢复

治理期（2026-06 起）`data/STOP_SIGNAL` 存在时 auto-push 不启动。

恢复前必须满足：

1. `npm run verify` 全绿（1522/1522 gate pass）
2. `data/l4-backfill-queue.jsonl` 条目 < 50（或人工确认接受当前状态）
3. round_size ≤ 20
4. 人工手动删除 `data/STOP_SIGNAL`

```bash
# 恢复步骤
npm run verify             # 确认全绿
node scripts/audit-l4.mjs --check  # 确认 L4 状况
rm data/STOP_SIGNAL         # 人工操作，不可脚本化
```

---

## checkpoint 字段说明

`data/checkpoint.json` 记录每个 round 的状态：

| 字段 | 说明 |
|------|------|
| `round_n` | 当前 round 序号 |
| `total.papers` / `total.projects` | 累计写入笔记数 |
| `queue.papers` / `queue.projects` | 队列剩余 |
| `build_streak` | `ok` / `fail-1` / `fail-2` |
| `last_round_stats.gate_fail_rate` | 上一 round gate 失败率（质量退出判定） |
| `gate_pass_rate` | 全库最近一次 gate 通过率（由 report-quality.mjs 更新） |

---

## 常见故障排查

### Build 连续失败
1. 查看 `.claude/sessions/` 最新会话日志
2. `node scripts/quality-gate-all.mjs --json > /tmp/gate.json` 找失败原因
3. 确认 `data/checkpoint.json` 里 `build_streak` 字段
4. 手动 `npm run build 2>&1 | tail -50` 查构建错误

### Lock 卡死
```bash
node scripts/round-lock.mjs --check
# 如确认 stale：
node scripts/round-lock.mjs --force-release
```

### Worktree 脏状态
```bash
node scripts/worktree-sync.mjs
# 或指定单个
git -C ~/study-refactor-papers fetch origin main
git -C ~/study-refactor-papers reset --hard origin/main
git -C ~/study-refactor-papers clean -fd
```

---

## 性能基准

| 操作 | 预期耗时 |
|------|---------|
| `npm run build` | < 30s（本地）/ < 180s（CI ubuntu）|
| `quality-gate-all` 全库 | < 10s（本地）|
| Worktree sync（4 并行） | < 60s |

如 build 持续超过 180s，参考 `docs/adr/0001-content-scale.md` 评估分仓方案。

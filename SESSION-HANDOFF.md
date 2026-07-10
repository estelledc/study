# Study 操作交接入口

> 状态：当前入口。旧的批量生产 session 快照已失效，不得用于恢复自动循环。

## 当前政策

- 不以内容总数作为本轮目标。
- `/auto-push` 已停用；不自动派发、提交或推送 `main`。
- 只允许显式授权、有限数量、先 dry-run 后人工确认的小轮次。
- 既有笔记正文不可批量重写；历史 failure events 不得删除。
- 发布、队列和 worktree 的实时状态必须由命令重新读取，不在 handoff 中复制易过期数字。

## 重新获取事实

```bash
npm run status:pipeline
node scripts/audit-runtime-state.mjs --json
npm run round:preflight
```

操作顺序、停止条件和外部权限边界见：

- `docs/operations-index.md`
- `docs/operations-policy.md`
- `data/operations-policy.json`

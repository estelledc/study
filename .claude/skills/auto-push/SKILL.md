---
name: auto-push
description: Legacy bulk-production entrypoint is disabled. When invoked, explain the safe small-round policy and do not dispatch content, push main, or resume an unattended loop.
---

# `/auto-push`（已停用）

这个旧入口已停止执行。它曾把批量生产、自动发布和跨轮循环绑在一起，安全边界与当前仓库政策不一致。

收到 `/auto-push` 时必须：

1. 不派发写作任务，不修改队列，不创建或同步 worktree。
2. 不提交、不推送远端，尤其不直接写入 `main`。
3. 告知操作者读取 `docs/operations-index.md` 与 `data/operations-policy.json`。
4. 只有用户另行明确授权一个有上限的小轮次时，才使用 `npm run round:preflight` 和 `npm run round:dispatch -- --rewrite 0 --new 4 --dry-run` 生成可审查计划；dry-run 不等于授权 apply。

旧设计的脱敏历史摘要位于 `docs/archive/auto-push-v3.md`，不能作为可执行说明。

# Study 操作索引

这是仓库唯一的活动操作入口。关联任务：STUDY-T019。

## 1. 只读了解状态

```bash
npm run status:pipeline
node scripts/audit-runtime-state.mjs --json
npm run round:preflight
node scripts/benchmark-site.mjs --compare data/performance-baseline.json
```

这些命令不授权内容生产或远端发布。

## 2. 小轮次计划

当前默认禁止 bulk production。只有操作者明确授权一个有限小轮次时，才先运行：

```bash
npm run round:dispatch -- --rewrite 0 --new 4 --dry-run
```

检查确定性 plan、任务范围和停止条件后，另行确认是否 apply。不得用旧 `/auto-push` skill 绕过确认。

## 3. 合并与发布

- worker 合并必须通过单目标 commit scope 与质量门。
- `npm run verify:ci` 是 PR/Pages 的可移植门禁。
- `npm run verify:pipeline` 只用于具备本机 worktree/runtime 的桌面环境。
- 默认不推远端；草稿 PR、合并和生产部署是不同授权步骤。

详细政策见 `operations-policy.md`；机器可读版本见 `../data/operations-policy.json`。

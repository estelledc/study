# 发布与回滚

本文描述 `main` 发布接口的安全边界。当前机器政策禁止直接推送 `main`；正常改动先走 PR 和 CI。`finalize-round.sh` 已退役，只保留无副作用 dry-run 兼容检查，不再具有聚合、发布或同步能力。

## 四个独立状态

1. **本地构建通过**：`npm run build` 成功，只证明当前机器的产物可构建。
2. **push 已发送**：Git 接受一次 push；失败立即停止，不自动 rebase 或重试。
3. **远端 HEAD 已确认**：`origin/main` 的 40 位 SHA 与本地 HEAD 完全相同，才记录 `round-publish-success`。
4. **Pages deploy 成功**：必须在 GitHub Actions 的 Pages workflow 单独确认；脚本固定报告 `not-verified`，不会把远端 SHA 验证冒充部署成功。

任何 fetch、TLS、认证、网络、非快进、push rejection 或远端 SHA 不一致都会非零退出。发布前后都会证明 fetch URL 与 push URL 指向 allowlist 中同一个 canonical repository，并禁用 HTTP redirect；`GIT_SSL_NO_VERIFY` 或 repo/global 中关闭证书校验的配置也会在联网前被拒绝。失败后保留本地 commit，且不 reset/clean 其他 worktree。

## 发布前接口验证（不发布）

发布前确认工作树干净、当前分支为 `main`，并记录完整 SHA：

```bash
git status --short
git rev-parse HEAD
npm run round:final-gate
```

上述命令只验证本地状态，不发送 push。当前交付方式是功能分支 + 草稿 PR；merge 和生产部署分别确认。未来即使显式变更机器 policy，也必须使用经审查的 PR/分支保护流程；随后仍须在 GitHub Actions 单独确认对应 SHA 的 Pages workflow。不要通过空提交或改写历史来“触发”部署。

## 已知良好版本

首份跨端审查的已知良好基线是：

```text
acbf24baf4641c0f80a2a6c624abfb37f4cadefc
```

它只能作为当前回退候选。每次发布后，应把“完整 commit SHA + 成功的 Pages workflow URL + 验证时间”写入 PR/发布记录；下一次回滚以前重新核对记录，不使用可移动 tag 或短 SHA。

## Pages 回滚

回滚采用“新提交恢复旧内容”，不 force-push、不 rewrite `main`：

1. 从受保护分支基于当前 `main` 创建回滚分支。
2. 用 `git revert` 撤销有问题的提交；若跨多个提交，明确列出范围并人工审查 diff。
3. 运行完整 CI，通过 PR 合入 `main`。
4. 等待新 SHA 的 Pages workflow；必要时在 Actions 页面 rerun 该次 workflow。
5. 验证 `/study` 首页、开始页、搜索、Atlas 与受影响链接，并记录新 SHA 和 workflow URL。

如果只是 GitHub Pages job 的暂时性失败，而 `main` 内容确认无误，优先 rerun 同一 workflow；不要因此生成无内容提交。

## 停止条件

出现以下任一情况，停止自动操作并人工处理：

- 本地 HEAD 与计划发布 SHA 不一致；
- `origin` 的 fetch/push URL 不是 allowlist 中同一个仓库，或发布期间发生重定向/HEAD 漂移；
- 聚合、构建和 amend 后工作树仍有未提交差异；
- fetch 出现 TLS、认证或网络错误；
- `origin/main` 不是本地 HEAD 的祖先（非快进）；
- push 被拒绝；
- push 后无法证明远端完整 SHA；
- Pages workflow 对应 SHA 不明确、artifact 不可验证或环境需要额外审批；
- 回滚范围会影响候选队列、历史失败记录或已有学习笔记正文。

停止后保留本地 commit 与日志，不同步 worktree，不自动 rebase，不重复 push。先定位失败阶段，再由维护者决定修复、重跑 workflow 或创建回滚 PR。

# Research 标杆整合记录

## 范围

2026-07-17 将父仓 `explorations/research` 的 Research Refresh Program 整合到：

```text
src/content/docs/research/
```

导入内容包括：

- 14 类正式研究学习包；
- 147 份类别 Markdown；
- 10 组便携 lab 测试与 1 组固定 LangGraph 源码实验；
- manifest、覆盖矩阵、零基础学习地图；
- `repos/README.md` 中的 201 个 canonical upstream 恢复信息。

明确排除：

- 7.1 GB 的第三方 clone；
- 父仓 `_meta` 项目卡；
- 标记为仅本机或不属于 14 类正式计划的零散报告。

## 历史保留

导入不是文件复制。步骤为：

1. 从父仓 `main` 临时克隆。
2. 用 `--subdirectory-filter explorations/research` 提取研究提交链。
3. 从提取历史中删除排除文件。
4. 用 `git subtree add --prefix=src/content/docs/research` 合入 Study。

subtree merge 提交的第二父节点连回筛选后的 36 个 Research 提交。可用下面的命令复查：

```bash
git rev-list --parents -n 1 5a2cb6df
git log --oneline -- src/content/docs/research
git log --oneline 5a2cb6df^2
```

后续若同步父仓研究，应继续使用 subtree 或等价的历史保留流程，不用覆盖式复制。

## Study 适配

导入正文只做可移植适配：

- 增加 Starlight frontmatter，页面默认不展开进侧栏；
- lab 命令改为 Study 仓内路径；
- 第三方源码路径统一为被忽略的 `research-worktrees/`；
- 删除只在父仓存在的 `_meta` 相对链接；
- 入口页明确静态证据和运行证据边界。

适配脚本：

```bash
node scripts/prepare-research-benchmark.mjs
```

脚本必须幂等，第二次运行应显示 `changed=0`。

## 验收

```bash
npm run audit:research
npm run test:research-labs
npm run test:research-labs:full
npm run audit:project-standard
npm run verify:ci
git diff --check
```

`audit:research` 检查 14 类结构、152 份 Markdown、11 个 lab 测试模块和旧路径残留。便携门禁运行 10 个不需要额外源码的模块，并明确报告 LangGraph 模块未恢复；完整命令要求 `research-worktrees/langgraph` 位于固定提交。`audit:project-standard` 对 961 个项目页输出逐项差距，不自动改写正文。

## 已知边界

- `research-worktrees/` 默认不存在；本机为完整验收恢复了固定 LangGraph 工作树，其他源码按项目清单恢复。
- MinerU lab 在未安装 MarkItDown/OpenParse 时显式跳过 2 个真实解析器比较；其纯函数合同仍运行。
- GPU、模型 API、设备和线上服务没有因本次整合变成已验证。
- 原 Study 的 8 个历史 worktree 在父目录迁移后仍指向旧路径；本次没有修改其拓扑。
- 本地 `main` 原本领先 `origin/main` 一个提交；本次从该本地提交建立独立分支，没有推送远端。

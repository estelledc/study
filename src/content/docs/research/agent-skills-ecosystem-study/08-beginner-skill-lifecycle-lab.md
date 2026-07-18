---
title: "08. 零基础实验：从“格式合法”走到“结果有效”"
sidebar:
  hidden: true
---
# 08. 零基础实验：从“格式合法”走到“结果有效”

> 目标：用 60 分钟看懂 Skill 的三层加载和四层质量门，不安装真实宿主、不调用模型 API。

## 1. 三层加载

把 Skill 想成一本放在工具柜里的操作手册：

```text
L1 metadata
  name + description
  -> 柜门标签，决定要不要拿出来

L2 instructions
  SKILL.md body
  -> 打开后看到的主流程

L3 resources
  scripts / references / assets
  -> 做到具体步骤时再拿工具和附录
```

类比的边界：宿主是否扫描、何时激活、允许哪些工具，仍由 runtime 决定。Skill 文件不能自行获得宿主没有的权限。

## 2. 四个质量问题

| 层 | 问题 | 本实验怎样验证 |
|---|---|---|
| Parse | 文件格式合法吗？ | `skills-ref validate` |
| Route | 该触发时触发吗？ | 阅读 description，设计正负 prompt |
| Act | 激活后步骤能正确执行吗？ | 检查指令、脚本和失败分支 |
| Outcome | 使用后结果真的更好吗？ | 需要 baseline / with-skill 对照，本实验不伪造 |

安全横跨四层。格式合法的 Skill 仍可能误触发、执行危险脚本或产生更差结果。

## 3. 运行规范参考库测试

从 `intern-journal` 根目录运行：

```bash
cd research-worktrees/agent-skills-spec
UV_PROJECT_ENVIRONMENT=/tmp/agent-skills-ref-venv-20260717 \
  uv run --project skills-ref pytest -q
```

2026-07-17 实测：

```text
40 passed in 0.66s
```

环境隔离到 `/tmp`，不会在第三方仓创建 `.venv`。

这些测试覆盖 parser、validator 和 prompt XML 生成。它们不执行 Garden Skill 的业务工作流。

## 4. 验证一个真实 Garden Skill

继续在 `agent-skills-spec` 根目录：

```bash
UV_PROJECT_ENVIRONMENT=/tmp/agent-skills-ref-venv-20260717 \
  uv run --project skills-ref \
  skills-ref validate \
  ../garden-skills/skills/kb-retriever
```

实测输出：

```text
Valid skill: ../garden-skills/skills/kb-retriever
```

这证明：

- 目录名与 `name` 符合规范。
- frontmatter 能解析。
- 必填字段和约束通过 reference validator。

这不证明：

- 用户问知识库问题时一定会触发。
- 检索结果准确。
- 脚本安全。
- 使用 Skill 后优于 baseline。

## 5. 运行 Garden 自身结构检查

```bash
cd ../garden-skills
node scripts/release/list-skills.mjs --json
```

2026-07-17 实测列出 5 个 Skill，全部：

```text
"ok": true
"errors": []
```

它额外检查 Garden 自己的 `manifest.json`、版本和必需文件。项目级 manifest 不是 Agent Skills 通用规范的一部分。

## 6. 精读一次渐进加载

选择 `kb-retriever`：

```bash
rg -n '^name:|^description:|^#|references/|scripts/' \
  skills/kb-retriever/SKILL.md
find skills/kb-retriever -maxdepth 2 -type f | sort
```

回答：

1. L1 里哪些词让模型知道“何时使用”？
2. L2 主流程有几个阶段？
3. 哪些细节被推迟到 L3？
4. 如果 references 缺失，Skill 会 fail closed 还是继续猜？

## 7. 设计路由正负样本

不要调用模型，先人工写期望：

| 用户输入 | 期望 |
|---|---|
| “在我的本地知识库里找 deployment rollback 记录” | 应触发 |
| “解释什么是 deployment rollback” | 未必触发，可直接回答 |
| “帮我搜索公开网页上的 rollback 最佳实践” | 不应误触发本地 KB |
| “列出知识库，但不要读取内容” | 触发后应受只读边界约束 |

Route eval 至少需要：

- 明确正例。
- 近义表达。
- 容易混淆的负例。
- 冲突 Skill 同时存在的样本。

只改 description，不测负例，常把“漏触发”修成“到处误触发”。

## 8. 把 20 项放回生命周期

| 生命周期 | 代表项目 | 初学者先问什么 |
|---|---|---|
| 规范 | Agent Skills Spec | 最小合法结构是什么？ |
| 官方样例 | Anthropic Skills | 复杂 Skill 如何拆 scripts/references？ |
| 内容工程 | Garden、Addy、Matt、Scientific | 怎样把专业流程写成可维护资产？ |
| 发现 | 两个 Awesome 列表 | 收录标准和来源证据是什么？ |
| 安装 | Vercel Skills CLI | 来源、路径、symlink 和协议怎样校验？ |
| 市场 | Claude Plugins Official | registry 能证明什么，不能证明什么？ |
| Harness | Superpowers、Compound | 多个 Skill 怎样组成任务生命周期？ |
| 触发 | Infrastructure Showcase | 何时需要 Hook，而不只靠 description？ |
| 安全 | Skill Scanner | 哪些风险可静态发现？ |
| 评测 | Agent Skills Eval | baseline 与 with-skill 怎样对照？ |
| 优化 | SkillOpt | 候选更新怎样经过 held-out gate？ |
| 生成 | Skill Seekers、Skill Factory | source 和 pattern 错误如何污染结果？ |

## 9. 初学者常见误区

1. **validator 通过 = Skill 有效。**
   validator 只回答 Parse。

2. **安装成功 = 当前会话已经加载。**
   宿主可能只在启动时扫描 metadata。

3. **官方市场收录 = 后续版本持续安全。**
   registry 和内容更新是两个时间轴。

4. **自动优化分数更高 = 可以直接发布。**
   需要独立任务集、人工门和回滚。

## 10. 完成标准

- [ ] 能解释 L1/L2/L3 各自承担的决策。
- [ ] `skills-ref` 40 个测试通过。
- [ ] `kb-retriever` 通过 reference validator。
- [ ] Garden 5 个 manifest/结构检查通过。
- [ ] 能给一个 Skill 写至少 2 个正例和 2 个负例。
- [ ] 能解释 Parse、Route、Act、Outcome 为什么不能互相替代。

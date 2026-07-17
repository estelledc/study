# 中国独立开发者列表：最终接班页

> 面向第一次接触 GitHub、自动化和 Agent Skill 的实习生。
>
> 预计投入：20 分钟读完；60-90 分钟完成只读实验。

## 先记住一句话

这个项目不是普通网站应用，而是一间“用 Markdown 当账本的社区编辑部”：

- 社区用评论、Issue 和 PR 投稿。
- Skill 像编辑手册，写清分类、去重、格式和沟通规则。
- GitHub Actions 像定时门铃，只负责叫醒外部 Routine。
- Routine 像值班编辑，按 Skill 调用 `gh`、`git` 和文件工具。
- 三个 README 像最终出版的栏目，也是数据源真相。

类比的边界：真实系统没有一个数据库事务把这些步骤绑在一起。GitHub、Routine、Git commit 和评论 API 都可能分别成功或失败。

## 四层心智模型

```text
输入层
评论 / Issue / Pull Request
  ↓
政策层
.claude/skills/chinese-indie-dev/SKILL.md
  ↓
执行层
GitHub Actions -> Claude Routine -> gh/git/Edit
  ↓
数据与反馈层
README.md / pages/*.md + commit + 评论 + issue/PR 状态
```

### 1. 数据层：Markdown-as-database

技术定义：**Markdown-as-database** 是把可读 Markdown 文件同时当展示页面和数据源。

优点：

- 不需要部署数据库。
- 每次修改都有 Git 历史。
- 普通贡献者能直接编辑和提 PR。

代价：

- schema 藏在格式约定里。
- URL 唯一性、日期顺序和状态枚举要靠额外检查。
- 两个写入者同时编辑同一日期区块时容易冲突。

### 2. 政策层：Skill-as-policy

技术定义：**Skill-as-policy** 是把操作规则写成 Agent 可加载的自然语言合同。

当前 Skill 不只是提示词，它还规定：

- 先检查三类输入，无新内容就提前退出。
- 用完整产品 URL 做固定字符串去重。
- 分到主版面、程序员版面、游戏版面或拒绝。
- 普通 PR 无冲突时必须 squash merge，保留贡献者归属。
- 新评论要去除自动签名并 GET 回读验证。

代价是自然语言规则没有编译器。规则可以写得很细，但仍需要案例测试证明 Agent 会稳定执行。

### 3. 执行层：触发器不等于工作流

当前 GitHub Action 只向 Anthropic Routine API 发一个请求：

```text
schedule
  -> HTTP POST /routines/.../fire
  -> API 接受或拒绝
```

它没有在 runner 内执行 Skill，也没有等待下游处理结果。因此：

- Action 绿色：只证明触发请求没有返回已识别错误。
- Action 红色：只能先定位到触发边界。
- README 是否变化：还要看下游 Routine、commit 和 GitHub 对象。

2026-07-17 的最新公开运行因 token 认证失败而变红，说明当前链路停在 HTTP 触发阶段。

### 4. 备用层：旧 Python 自动化

`.github/scripts/process_item.py` 是上一代实现：

- 管理员用 reaction 标记待处理项。
- Python 调 LLM 格式化。
- 脚本创建批量 PR。
- 成功后加 reaction 和评论。

它仍可手动触发，但规则已经落后：

- 只写主 `README.md`。
- 不覆盖当前三版面分类。
- 使用 reaction 作为幂等标记。
- 测试只覆盖收集逻辑的一小部分。

所以它是“可运行的历史备用链”，不是当前 Skill 的等价灾备。

## 一条请求怎样流动

以 issue #160 新评论为例：

1. 定时 Action 调用 Routine API。
2. Routine 加载仓库和 `chinese-indie-dev` Skill。
3. Skill 查询最近 7 小时评论、新 Issue 和全部 open PR。
4. 对评论提取完整产品 URL。
5. 在三个列表中用 `grep -F` 查重。
6. 提取作者、产品名、URL 和描述。
7. 按使用门槛选择目标版面。
8. 把条目插入当天日期区块。
9. 批量 commit 并 push `master`。
10. 给成功投稿者逐人评论，再回读确认签名已清理。

这条链任何一步失败，都要保留“输入是否已处理”的证据，否则下一轮可能重复写入。

## 三个最重要的工程取舍

| 取舍 | 得到什么 | 付出什么 |
|---|---|---|
| Markdown 作为源真相 | 低门槛、可读、Git 可追踪 | schema 和唯一性弱 |
| 自然语言 Skill 作为当前政策 | 规则修改快，覆盖复杂例外 | 难做确定性测试 |
| Issue 类投稿直接推主分支 | 减少维护者操作 | 回滚、并发和审计压力更高 |

## 当前证据等级

| 结论 | 等级 | 证据 |
|---|---|---|
| 四个 Markdown 列表、Skill、两代 workflow 存在 | E1 静态源码 | 本地固定提交 `58185a2` |
| 旧脚本的 4 个收集逻辑测试通过 | E2 本地验证 | `python3 -m unittest tests/test_process_item.py -v` |
| PR #1133 被 squash merge 并增加 3 行 | E3 外部结果 | 上游 PR 与 merge commit |
| 最新 Routine 触发因认证失败 | E3 外部结果 | Action run `29545709871` |
| Routine 内部是否正确执行完整 Skill | 未证明 | 仓库没有下游完成回执 |

## 零基础学习路线

| 等级 | 目标 | 完成证据 |
|---|---|---|
| L0 看懂 | 能解释四层模型 | 不看文档复述输入到输出 |
| L1 会查 | 能找到分类、去重和写入规则 | 指出对应文件与行段 |
| L2 会验 | 能运行单测和 Markdown 数据探针 | 保存命令与结果 |
| L3 会分诊 | 能区分 trigger、Routine、Git 写入和反馈故障 | 完成三个案例题 |

推荐顺序：

1. 本页。
2. [源码研究正文](README.md)。
3. [只读动手实验](01-hands-on-lab.md)。
4. [真实案例与答案检查](02-case-cards-and-answer-guide.md)。
5. 最后再读 262 行 Skill 和 284 行旧 Python 脚本。

## 初学者常见误区

1. **错误认知：Action 绿色就代表项目已经收录。**  
   正确理解：当前 Action 只证明 Routine API 接受了触发请求。

2. **错误认知：URL 重复就应该自动删除一条。**  
   正确理解：同一 URL 可能是历史重复、跨版面迁移或有效多条说明，先人工确认。

3. **错误认知：旧 Python 脚本能自动接替当前 Skill。**  
   正确理解：两条链的输入、分类、写入和幂等规则已经漂移。

4. **错误认知：自然语言规则写得足够详细就不需要测试。**  
   正确理解：越多例外越需要离线案例和真实结果验证。

## 读完应能回答

1. 为什么这个项目可以不使用传统数据库？
2. Routine token 失效时，哪几层完全没有开始执行？
3. 为什么 PR 投稿和 Issue 投稿采用不同的合并路径？
4. 为什么“完整 URL 精确匹配”仍不能彻底解决重复问题？
5. 如果两个 Routine 同时写当天日期区块，哪个机制负责避免丢数据？

答案检查见[案例与答案检查](02-case-cards-and-answer-guide.md)。

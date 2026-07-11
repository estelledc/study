# Study 仓库扩展 — 跨会话交接状态

> 创建于 2026-05-29，会话 19h 后必须切。下个会话直接读这个文件 + `git log -20` 即可恢复上下文。

## 目标

papers 10000 + projects 10000（用户在最近一次 `/goal` 设定）

## 当前进度（2026-05-29 末）

- **Total in main**: 143 papers + 213 projects = **356 files** / 20000（1.78%）
- **重写完成**: 140 篇 (47% of original 298)
- **新建完成**: 51 篇（来自候选池）
- **候选池**: 1490+ 个 slug 待写（papers 620 + projects 870）

## 模板（绝对不能丢）

唯一参考：`src/content/docs/papers/hindley-milner.md`（147 行，用户认可的零基础友好模板）

12 段结构：frontmatter 5 行 → 是什么（带类比）→ 为什么重要（4 条）→ 核心要点（编号 1/2/3）→ 实践案例（3 个，带逐部分解释）→ 踩过的坑（4 条）→ 适用 vs 不适用 → 历史小故事（可跳过）→ 学到什么 → 延伸阅读 → 关联（5-7 条 [[xxx]]）→ 反向链接占位

## 基础设施

- **8 个 worktree**（全部 sync 到 main）：
  - `$HOME/study-refactor-papers` (refactor/papers)
  - `$HOME/study-refactor-papers-2` 到 `-4`
  - `$HOME/study-refactor-projects` 到 `-4`
- **scripts/regen-atlas.mjs** — 主题分类自动映射 30+ 主题
- **scripts/regen-backlinks.mjs** — 自动填 ## 反向链接 段
- **scripts/remark-wikilinks.mjs** — `[[slug]]` → markdown 链接

## 候选池清单（research/）

| 文件 | 主题 | 数量 |
|---|---|---|
| papers-databases.md | 数据库系统 | 60 |
| papers-graphics.md | 图形渲染 | 60 |
| papers-operating-systems.md | OS | 60 |
| papers-network-protocols.md | 网络 | 60 |
| papers-machine-learning.md | ML | 80 |
| papers-compilers-pl.md | 编译器/PL | 80 |
| papers-distributed-systems.md | 分布式 | 60 |
| papers-formal-methods.md | 形式化方法 | 50 |
| papers-info-retrieval.md | 信息检索 | 50 |
| papers-gpu-architecture.md | GPU 体系结构 | 60 |
| papers-security-privacy.md | 安全/隐私 | 50 |
| projects-databases.md | 数据库本体 | 80 |
| projects-cli.md | CLI 工具 | 80 |
| projects-editors.md | 编辑器 | 60 |
| projects-runtimes.md | 运行时 | 60 |
| projects-mobile.md | 移动跨平台 | 60 |
| projects-devops.md | DevOps/CI | 60 |
| projects-data-science-ai.md | 数据/AI | 70 |
| projects-backend-api.md | 后端 API | 70 |
| projects-graphics.md | 游戏引擎 | 60 |
| projects-media.md | 媒体 | 50 |
| projects-blockchain.md | 区块链 | 60 |
| projects-embedded.md | 嵌入式 | 50 |
| projects-communication.md | 通信 | 50 |
| projects-dataviz.md | 数据可视化 | 60 |

## 工作流（每批 8 agent）

1. **Sync**: 8 worktree 同步到 main
2. **Dispatch 8 agent**（4 rewrite + 4 NEW，或全 NEW 加速扩展）
3. **等通知** — 不要主动 poll
4. **Cherry-pick** 8 个 commit 到 main
5. **regen atlas + backlinks** + build 验证
6. **commit + push** main
7. **Sync 8 worktree** 重新进入下一批

## 严禁项（每个 prompt 必含）

- 学术编号 / Definition / Theorem / 怀疑段
- GitHub permalink ≥ 4
- 红线词（commit + 正文双扫）：
  - blindbox / quanzhiping / video-eval-agent / 6 件套
  - sankuai / friday / cagent / aigc.sankuai / 美团 / mis.sankuai
  - cagent_fe_h5_blindbox / LongCat
- frontmatter 来源含逗号+引号必须用单引号包裹（YAML 解析坑）

## 已知 bug 修复

- ✅ `.md` 中 Astro `import` 泄漏（已修 8 个文件，starlight.md/shiki.md 是 code fence 内不算）
- ⚠️ `[[gatsby]]` slug missing warning（无害，gatsby.md 候选未写入）

## 接续策略建议

**如果要快速冲 10000+10000**：
- 每批全 8 个都 NEW 创建，不要 rewrite（已重写 47%，rewrite 价值递减）
- 优先攻 candidate 池里的高频项（postgresql 同类）
- 单笔记 130-150 行（当前 200 行偏长，缩到 130 加速产出）

**如果要保持质量**：
- 继续 4 rewrite + 4 NEW 平衡
- 当前节奏 ~8 net new / 30 min wall clock

## 命令速查

```bash
# 看进度
cd "$HOME/study"
ls src/content/docs/papers/*.md | wc -l
ls src/content/docs/projects/*.md | wc -l

# Sync 8 worktree
for w in study-refactor-papers study-refactor-papers-2 study-refactor-papers-3 study-refactor-papers-4 \
         study-refactor-projects study-refactor-projects-2 study-refactor-projects-3 study-refactor-projects-4; do
  cd "$HOME/$w"
  git -c http.sslVerify=false fetch origin main
  git -c http.sslVerify=false reset --hard origin/main
done

# Cherry-pick 8 commit 后
node scripts/regen-atlas.mjs && node scripts/regen-backlinks.mjs && npm run build
```

## 最近 20 commit

跑 `git log --oneline -20` 即可。

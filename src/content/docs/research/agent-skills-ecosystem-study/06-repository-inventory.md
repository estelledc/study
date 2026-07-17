# 06. fork、clone 与源码快照

## 1. 总体结果

- 正式语料：20 个 GitHub 仓库。
- GitHub 个人账户：`estelledc`。
- 本地根目录：`explorations/research/repos/`。
- 所有仓库均有独立 `.git`。
- 所有 `origin` 均指向个人 fork。
- 所有 `upstream` 均指向 canonical 原仓。
- 所有工作树在本轮交付前均为 clean。
- 本轮新增 19 个 clone；最先 clone 的 `garden-skills` 是普通完整 clone，其余 18 个使用 `--filter=blob:none`。
- 已有 `scientific-agent-skills` 保留原浅层、部分、稀疏 clone。
- `gpt-image-2-101` 使用 sparse checkout，只物化 `scripts/`、`src/` 和根配置，不下载 `public/case/` 的大型图片工作树。

## 2. 逐仓清单

star 和许可证为 2026-07-16 快照。许可证列不是法律意见；GitHub 未识别时，同时参考仓库内 package/README/LICENSE。

| 类别 | 上游 | 个人 fork | 本地目录 | 分支 | pinned commit | 许可证快照 |
|---|---|---|---|---|---|---|
| 主项目 | [ConardLi/garden-skills](https://github.com/ConardLi/garden-skills) | [estelledc/garden-skills](https://github.com/estelledc/garden-skills) | `explorations/research/repos/garden-skills` | `main` | `aaf9a82f5efd` | MIT |
| 运行时协议 | [ConardLi/reacticle](https://github.com/ConardLi/reacticle) | [estelledc/reacticle](https://github.com/estelledc/reacticle) | `explorations/research/repos/reacticle` | `main` | `dcfc4baf386b` | package 标记 MIT；GitHub 未识别 |
| 案例网站 | [ConardLi/gpt-image-2-101](https://github.com/ConardLi/gpt-image-2-101) | [estelledc/gpt-image-2-101](https://github.com/estelledc/gpt-image-2-101) | `explorations/research/repos/gpt-image-2-101` | `main` | `971b67dc8cbc` | 未识别 |
| 官方样例 | [anthropics/skills](https://github.com/anthropics/skills) | [estelledc/anthropic-agent-skills](https://github.com/estelledc/anthropic-agent-skills) | `explorations/research/repos/anthropic-agent-skills` | `main` | `9d2f1ae18723` | 混合：Apache-2.0 与 source-available/proprietary |
| 规范 | [agentskills/agentskills](https://github.com/agentskills/agentskills) | [estelledc/agent-skills-spec](https://github.com/estelledc/agent-skills-spec) | `explorations/research/repos/agent-skills-spec` | `main` | `38a2ff82958a` | Apache-2.0 |
| 安装器 | [vercel-labs/skills](https://github.com/vercel-labs/skills) | [estelledc/vercel-agent-skills-cli](https://github.com/estelledc/vercel-agent-skills-cli) | `explorations/research/repos/vercel-agent-skills-cli` | `main` | `a9d8e3ae5bab` | package 标记 MIT；GitHub 未识别 |
| 索引 | [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | [estelledc/awesome-claude-skills](https://github.com/estelledc/awesome-claude-skills) | `explorations/research/repos/awesome-claude-skills` | `main` | `1da55aa810f2` | 未识别 |
| Harness | [obra/superpowers](https://github.com/obra/superpowers) | [estelledc/superpowers](https://github.com/estelledc/superpowers) | `explorations/research/repos/superpowers` | `main` | `d884ae04edeb` | MIT |
| 工程 Skill | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | [estelledc/addy-agent-skills](https://github.com/estelledc/addy-agent-skills) | `explorations/research/repos/addy-agent-skills` | `main` | `c1974de476a3` | MIT |
| 垂直 Skill | [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) | [estelledc/scientific-agent-skills](https://github.com/estelledc/scientific-agent-skills) | `explorations/research/repos/scientific-agent-skills` | `main` | `3f825caafe14` | MIT |
| 工程 Skill | [mattpocock/skills](https://github.com/mattpocock/skills) | [estelledc/mattpocock-agent-skills](https://github.com/estelledc/mattpocock-agent-skills) | `explorations/research/repos/mattpocock-agent-skills` | `main` | `9603c1cc8118` | MIT |
| 安全 | [cisco-ai-defense/skill-scanner](https://github.com/cisco-ai-defense/skill-scanner) | [estelledc/skill-scanner](https://github.com/estelledc/skill-scanner) | `explorations/research/repos/skill-scanner` | `main` | `41fec4a9570b` | 仓内 Apache-2.0；GitHub NOASSERTION |
| 评测 | [darkrishabh/agent-skills-eval](https://github.com/darkrishabh/agent-skills-eval) | [estelledc/agent-skills-eval](https://github.com/estelledc/agent-skills-eval) | `explorations/research/repos/agent-skills-eval` | `main` | `b60eebe3c6ed` | MIT |
| 索引 | [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | [estelledc/awesome-agent-skills](https://github.com/estelledc/awesome-agent-skills) | `explorations/research/repos/awesome-agent-skills` | `main` | `c97eda5e3406` | MIT |
| 官方市场 | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | [estelledc/claude-plugins-official](https://github.com/estelledc/claude-plugins-official) | `explorations/research/repos/claude-plugins-official` | `main` | `b5eddebc6444` | Apache-2.0；外部插件各自许可 |
| Harness | [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) | [estelledc/compound-engineering-plugin](https://github.com/estelledc/compound-engineering-plugin) | `explorations/research/repos/compound-engineering-plugin` | `main` | `e745e9663b4b` | MIT |
| 优化 | [microsoft/SkillOpt](https://github.com/microsoft/SkillOpt) | [estelledc/SkillOpt](https://github.com/estelledc/SkillOpt) | `explorations/research/repos/SkillOpt` | `main` | `d2670205d185` | MIT |
| 生成器 | [yusufkaraaslan/Skill_Seekers](https://github.com/yusufkaraaslan/Skill_Seekers) | [estelledc/Skill_Seekers](https://github.com/estelledc/Skill_Seekers) | `explorations/research/repos/Skill_Seekers` | `development` | `bbf5bb1cc78b` | MIT |
| 生命周期 | [rooftop-Owl/skill-factory](https://github.com/rooftop-Owl/skill-factory) | [estelledc/skill-factory](https://github.com/estelledc/skill-factory) | `explorations/research/repos/skill-factory` | `main` | `ba63b4906b0e` | MPL-2.0 |
| 触发控制 | [diet103/claude-code-infrastructure-showcase](https://github.com/diet103/claude-code-infrastructure-showcase) | [estelledc/claude-code-infrastructure-showcase](https://github.com/estelledc/claude-code-infrastructure-showcase) | `explorations/research/repos/claude-code-infrastructure-showcase` | `main` | `07f75ce3c301` | MIT |

## 3. GitHub 活跃度快照

star 只表示关注度，不代表设计质量、安全或可维护性。

| 项目 | 约 star | fork | 最近 push |
|---|---:|---:|---|
| garden-skills | 9.6k | 1.3k | 2026-07-12 |
| reacticle | 62 | 7 | 2026-06-10 |
| gpt-image-2-101 | 3 | 5 | 2026-05-31 |
| Anthropic Skills | 161.6k | 19.1k | 2026-07-13 |
| Agent Skills Spec | 23.2k | 1.6k | 2026-07-10 |
| `npx skills` | 26.3k | 2.2k | 2026-07-16 |
| Awesome Claude Skills | 14.1k | 1.7k | 2026-04-28 |
| Superpowers | 255.8k | 22.9k | 2026-07-16 |
| Addy Agent Skills | 78.7k | 8.5k | 2026-07-16 |
| Scientific Agent Skills | 31.0k | 3.1k | 2026-07-15 |
| Matt Pocock Skills | 173.7k | 14.9k | 2026-07-16 |
| Skill Scanner | 2.4k | 292 | 2026-06-29 |
| Agent Skills Eval | 620 | 34 | 2026-07-15 |
| Awesome Agent Skills | 28.2k | 3.0k | 2026-07-10 |
| Claude Plugins Official | 32.2k | 3.6k | 2026-07-16 |
| Compound Engineering | 23.3k | 1.9k | 2026-07-16 |
| SkillOpt | 12.9k | 1.2k | 2026-07-16 |
| Skill Seekers | 14.5k | 1.5k | 2026-07-16 |
| skill-factory | 1 | 1 | 2026-07-07 |
| Infrastructure Showcase | 9.7k | 1.2k | 2026-07-13 |

## 4. 本地结构快照

计数来自当前物化工作树。`SKILL.md` 数不等于公开稳定 Skill 数，可能包含模板、内置 Skill、deprecated/in-progress 或测试样本。

| 项目 | 本地文件 | `SKILL.md` | 测试/eval 相关文件 |
|---|---:|---:|---:|
| garden-skills | 593 | 5 | 0 |
| reacticle | 138 | 0 | 0 |
| gpt-image-2-101 | 46 | 0 | 0 |
| Anthropic Skills | 415 | 18 | 1 |
| Agent Skills Spec | 135 | 0 | 4 |
| `npx skills` | 100 | 1 | 45 |
| Awesome Claude Skills | 3 | 0 | 0 |
| Superpowers | 171 | 14 | 66 |
| Addy Agent Skills | 171 | 24 | 67 |
| Scientific Agent Skills | 1490 | 149 | 16 |
| Matt Pocock Skills | 166 | 41 | 0 |
| Skill Scanner | 391 | 20 | 135 |
| Agent Skills Eval | 42 | 1 | 4 |
| Awesome Agent Skills | 4 | 0 | 0 |
| Claude Plugins Official | 409 | 29 | 1 |
| Compound Engineering | 700 | 36 | 131 |
| SkillOpt | 333 | 3 | 35 |
| Skill Seekers | 2989 | 26 | 292 |
| skill-factory | 23 | 3 | 0 |
| Infrastructure Showcase | 133 | 9 | 0 |

## 5. Clone 策略说明

### 5.1 普通完整 clone

`garden-skills` 最先通过 `gh repo clone` 获取，保留完整工作树和普通 Git 对象。

### 5.2 Partial clone

其余本轮新 clone 使用：

```bash
gh repo clone estelledc/<fork> <path> -- --filter=blob:none
```

这不是浅 clone：

- commit/tree 历史仍可用；
- 历史 blob 按需下载；
- 当前工作树文件已物化；
- 后续可正常 fetch、checkout 和 diff。

### 5.3 Sparse checkout

`gpt-image-2-101` 的上游标称约 307 MiB，主要是案例 PNG/WebP。研究只需要构建脚本和前端源码，因此：

```text
sparse paths:
  scripts/
  src/
```

根配置和 README 由 cone mode 保留。需要查看某个案例时，可按需扩展：

```bash
git -C explorations/research/repos/gpt-image-2-101 \
  sparse-checkout add public/case/<category>/<template>
```

### 5.4 已有 Scientific clone

它是本轮开始前已有的浅层 partial sparse clone：

```text
shallow: true
sparse paths:
  docs/
  skills/
  tests/
```

当前研究范围足够；需要完整历史时再 fetch，不为静态分析无界扩仓。

## 6. 恢复方式

### 恢复单仓

如果个人 fork 已存在：

```bash
gh repo clone estelledc/<fork-name> explorations/research/repos/<local-slug> \
  -- --filter=blob:none
git -C explorations/research/repos/<local-slug> \
  remote add upstream https://github.com/<owner>/<repo>.git
```

特殊命名以第 2 节表格为准，例如：

- `anthropic-agent-skills` 对应上游 `anthropics/skills`；
- `agent-skills-spec` 对应上游 `agentskills/agentskills`；
- `vercel-agent-skills-cli` 对应上游 `vercel-labs/skills`；
- `addy-agent-skills` 对应上游 `addyosmani/agent-skills`；
- `mattpocock-agent-skills` 对应上游 `mattpocock/skills`。

### 恢复固定快照

```bash
git -C explorations/research/repos/<slug> fetch upstream
git -C explorations/research/repos/<slug> checkout <pinned-commit>
```

固定 commit 适合复核本材料；日常跟踪更新时保留分支，再对比：

```bash
git -C explorations/research/repos/<slug> fetch upstream
git -C explorations/research/repos/<slug> log --oneline HEAD..upstream/<branch>
```

## 7. 单仓验证命令

```bash
git -C explorations/research/repos/<slug> status --short --branch
git -C explorations/research/repos/<slug> remote -v
git -C explorations/research/repos/<slug> rev-parse HEAD
git -C explorations/research/repos/<slug> fsck --no-dangling
```

预期：

- branch 与第 2 节一致；
- status 无工作树改动；
- origin 是 `esteldc`；
- upstream 是表格原仓；
- HEAD 与 pinned commit 一致。

## 8. 更新材料的触发条件

以下任一发生时，先检查 upstream diff：

- Agent Skills 规范字段变化；
- 宿主统一目录或 Plugin schema 变化；
- `garden-skills` 新增/删除 Skill；
- release pipeline 改变 tag/artifact 约定；
- 安全扫描器新增威胁类型；
- eval schema 或 SkillOpt gate 变化；
- 当前研究问题需要新目录或历史。

更新时不能只改 star 和 README 摘要；凡是架构结论受影响，必须重新核对对应源码入口。

## 9. 可证明与暂不可证明

### 当前已证明

- 20 个 fork 真实存在；
- 20 个本地独立 Git 仓真实存在；
- origin/upstream/branch/commit 可核验；
- 工作树 clean；
- 目录、Skill 数、测试相关文件可统计；
- 本材料引用的关键源码路径存在；
- `garden-skills` 的发布、打包、checksum 和 README sync 链存在；
- 规范、安装、安全、eval、优化的关键控制流存在。

### 当前未证明

- 20 个项目的全套测试在本机均通过；
- 所有云 API、宿主和可选 provider 可用；
- 项目 README 的 benchmark 数字可复现；
- 所有收录 Skill 都安全且当前有效；
- 不同模型/宿主对同一 Skill 行为一致；
- SkillOpt 的论文收益能迁移到 `garden-skills`；
- 视觉 Skill 的主观质量提升可由自动 judge 可靠衡量。

这些需要针对具体问题做最小运行实验，不能由静态阅读替代。

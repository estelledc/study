# 08. 仓库清单、版本与本地约束

## 1. 完成状态

- 入选仓库：17。
- 个人 GitHub：`estelledc`。
- fork：17/17 已存在。
- 本地 clone：17/17 已存在。
- 工作树：17/17 clean。
- remote：`origin` 指向个人 fork，`upstream` 指向原项目。
- 父仓：只跟踪本研究材料和 `_meta` 卡，不跟踪第三方源码。
- 本地总体积：约 200 MiB；通过浅层、部分、稀疏 clone 避免下载大媒体和完整历史。

## 2. 精确版本清单

GitHub 数据和 Stars 为 2026-07-16 快照。

| 类别 | 项目 | 上游 | Stars | 分支 | pinned commit | 许可证快照 |
|---|---|---|---:|---|---|---|
| 核心 | Trellis | `mindfold-ai/Trellis` | 12,724 | `main` | `c6f85dc796dc` | AGPL-3.0 |
| SDD | Spec Kit | `github/spec-kit` | 121,753 | `main` | `aaf6bc22e300` | MIT |
| SDD | OpenSpec | `Fission-AI/OpenSpec` | 61,193 | `main` | `0a99f4104572` | MIT |
| 全生命周期 | BMAD-METHOD | `bmad-code-org/BMAD-METHOD` | 50,684 | `main` | `717479bc3f50` | MIT（包清单；GitHub API 未识别） |
| Skills | Superpowers | `obra/superpowers` | 255,847 | `main` | `d884ae04edeb` | MIT |
| 工作记忆 | Planning with Files | `OthmanAdi/planning-with-files` | 25,415 | `master` | `f90780c92f05` | MIT |
| 长任务 | GSD Core | `open-gsd/gsd-core` | 6,703 | `next` | `1bb724048a1c` | MIT |
| 标准 | Agent OS | `buildermethods/agent-os` | 5,074 | `main` | `cae8e664fb59` | MIT |
| 审批 | Spec Workflow MCP | `Pimzino/spec-workflow-mcp` | 4,264 | `main` | `d38e82eaa8a6` | GPL-3.0 |
| 复利 | Compound Engineering | `EveryInc/compound-engineering-plugin` | 23,255 | `main` | `e745e9663b4b` | MIT |
| PRP | PRPs Agentic Eng | `Wirasm/PRPs-agentic-eng` | 2,211 | `development` | `a643e84600c4` | MIT |
| 教学 | Context Engineering Intro | `coleam00/context-engineering-intro` | 13,711 | `main` | `a2d84b021cee` | MIT |
| Skill Memory | Acontext | `memodb-io/Acontext` | 3,580 | `main` | `259d73bfdebe` | Apache-2.0 |
| File Memory | memU | `NevaMind-AI/memU` | 14,032 | `main` | `9b2a70ca214c` | Apache-2.0（README/LICENSE.txt） |
| Session Memory | claude-mem | `thedotmack/claude-mem` | 87,471 | `main` | `f5633c1f8418` | Apache-2.0 |
| Git SDD | SpexCode | `shuxueshuxue/Spexcode` | 61 | `main` | `fc28137d77ba` | MIT |
| Static Governance | OpenLore | `clay-good/OpenLore` | 198 | `main` | `1294c359898a` | MIT |

许可证快照用于提醒复制边界，不构成法律意见。复制实现前应重新阅读目标 commit 的 LICENSE。

## 3. Fork 与本地映射

| 本地 slug | 个人 fork | 本地路径 |
|---|---|---|
| `trellis` | `estelledc/Trellis` | `explorations/research/repos/trellis` |
| `spec-kit` | `estelledc/spec-kit` | `explorations/research/repos/spec-kit` |
| `openspec` | `estelledc/OpenSpec` | `explorations/research/repos/openspec` |
| `bmad-method` | `estelledc/BMAD-METHOD` | `explorations/research/repos/bmad-method` |
| `superpowers` | `estelledc/superpowers` | `explorations/research/repos/superpowers` |
| `planning-with-files` | `estelledc/planning-with-files` | `explorations/research/repos/planning-with-files` |
| `gsd-core` | `estelledc/gsd-core` | `explorations/research/repos/gsd-core` |
| `agent-os` | `estelledc/agent-os` | `explorations/research/repos/agent-os` |
| `spec-workflow-mcp` | `estelledc/spec-workflow-mcp` | `explorations/research/repos/spec-workflow-mcp` |
| `compound-engineering` | `estelledc/compound-engineering-plugin` | `explorations/research/repos/compound-engineering` |
| `prps-agentic-eng` | `estelledc/PRPs-agentic-eng` | `explorations/research/repos/prps-agentic-eng` |
| `context-engineering-intro` | `estelledc/context-engineering-intro` | `explorations/research/repos/context-engineering-intro` |
| `acontext` | `estelledc/Acontext` | `explorations/research/repos/acontext` |
| `memu` | `estelledc/memU` | `explorations/research/repos/memu` |
| `claude-mem` | `estelledc/claude-mem` | `explorations/research/repos/claude-mem` |
| `spexcode` | `estelledc/Spexcode` | `explorations/research/repos/spexcode` |
| `openlore` | `estelledc/OpenLore` | `explorations/research/repos/openlore` |

## 4. 本地 clone 约束

### 4.1 为什么放在 `explorations/research/repos/`

这些仓库是外部研究对象，不是 intern-journal 的源码：

- 每个仓有独立 `.git`。
- 每个仓有独立许可证。
- 依赖、构建产物和媒体不应进入父仓。
- 父仓只保存恢复方式和消化后的结论。

父仓 `.gitignore` 已忽略：

```text
explorations/research/repos/*/
```

### 4.2 clone 参数

除已有的 Superpowers 外，本轮默认使用：

```bash
git clone \
  --depth=1 \
  --single-branch \
  --filter=blob:none \
  --sparse \
  git@github.com:estelledc/<fork>.git \
  explorations/research/repos/<slug>
```

含义：

| 参数 | 作用 |
|---|---|
| `--depth=1` | 只取当前默认分支最新历史 |
| `--single-branch` | 不取其他分支 |
| `--filter=blob:none` | 文件内容按需下载 |
| `--sparse` | 只 materialize 研究需要的目录 |

### 4.3 稀疏目录

每仓优先展开：

- README、LICENSE、package/pyproject。
- 核心 `src/`。
- tests。
- architecture/docs。
- skills/templates/scripts。

默认不展开：

- 大媒体。
- 网站静态资源。
- 历史 archive。
- demo 数据。
- build output。

Trellis 特别排除了约 100 MiB 的 GIF/图片和大部分历史任务，只展开 CLI、Core、运行时 scripts、核心 spec 和少量竞品研究。

### 4.4 按需扩展

增加目录：

```bash
git -C explorations/research/repos/<slug> sparse-checkout add <path>
```

补完整历史：

```bash
git -C explorations/research/repos/<slug> fetch --unshallow upstream
```

切到本轮基线：

```bash
git -C explorations/research/repos/<slug> checkout <pinned-commit>
```

## 5. Remote 约定

```text
origin   git@github.com:estelledc/<fork>.git
upstream https://github.com/<owner>/<repo>.git
```

更新前：

```bash
git -C explorations/research/repos/<slug> fetch upstream
git -C explorations/research/repos/<slug> log --oneline HEAD..upstream/<branch>
```

不要直接把结论自动升级到新 HEAD。先检查：

- 架构是否变化。
- 路径/行号是否失效。
- package version 是否变化。
- README 宣称是否被实现。

## 6. 单仓恢复

以 OpenSpec 为例：

```bash
git clone \
  --depth=1 \
  --single-branch \
  --filter=blob:none \
  --sparse \
  git@github.com:estelledc/OpenSpec.git \
  explorations/research/repos/openspec

git -C explorations/research/repos/openspec \
  remote add upstream https://github.com/Fission-AI/OpenSpec.git

git -C explorations/research/repos/openspec \
  sparse-checkout set docs src test schemas scripts openspec bin .agents
```

其他项目的精确 URL、路径和 pinned commit 以 `_meta` 卡为准。

## 7. 验证命令

### Remote 与 HEAD

```bash
git -C explorations/research/repos/<slug> remote -v
git -C explorations/research/repos/<slug> branch --show-current
git -C explorations/research/repos/<slug> rev-parse HEAD
git -C explorations/research/repos/<slug> status --short --branch
```

### 父仓隔离

```bash
git check-ignore -v explorations/research/repos/<slug>
git status --short
```

### 项目卡审计

```bash
python3 scripts/explorations/restore-projects.py --audit
```

## 8. 本轮没有做什么

- 没有运行外部仓库安装脚本。
- 没有执行其 postinstall/hook。
- 没有下载模型、数据库或大型媒体。
- 没有向个人 fork 推送本地改动。
- 没有修改外部源码。
- 没有把第三方源码纳入父仓暂存面。

原因：本轮目标是源码研究，不是信任外部依赖或验证产品运行。

## 9. 更新材料的规则

每次升级某个仓库时：

1. 记录旧 commit 和新 commit。
2. 只更新受影响的项目档案。
3. 重新核对源码引用行号。
4. 不用最新 README 覆盖旧基线结论。
5. 如果结论变化，写明“旧行为 -> 新行为”。
6. 不把 Stars 变化当成技术进展。

## 关键思考点

1. shallow + sparse 是否足以做架构研究？何时必须补历史？
2. 研究材料绑定 branch 名还是 commit SHA 更可靠？
3. 个人 fork 的价值是备份、贡献入口，还是会增加 GitHub profile 噪声？
4. 是否应该为 17 仓建立自动 upstream drift 报告，而不是自动拉取？

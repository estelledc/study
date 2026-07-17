# Study 项目统一标准

> 标杆：`src/content/docs/research/` 中的 Research Refresh Program。
>
> 适用范围：`src/content/docs/projects/*.md`。本标准约束项目研究页，不要求第三方项目采用相同技术栈或源码目录。

## 结论

统一的对象不是上游仓库代码，而是 Study 如何研究、解释、验证和维护每个项目。每个项目页最终必须形成下面这条证据链：

```text
canonical source + fixed revision
  -> identity and value
  -> input/output and main flow
  -> design trade-off and limits
  -> runnable practice
  -> application self-test
  -> explicit evidence boundary
```

这保留不同项目的真实架构，不把 React、PostgreSQL 和 FFmpeg 强行改成同一种源码目录。

## 目录合同

| 路径 | 责任 |
|---|---|
| `src/content/docs/projects/<slug>.md` | 单项目正文源真相 |
| `public/projects/<slug>/` | 正文明确引用的图像资产 |
| `data/review-receipts/projects/<slug>.json` | 与正文 digest 绑定的审查证据 |
| `data/project-standard-audit.json` | 961 项逐页差距快照 |
| `research-worktrees/<slug>/` | 可选、被忽略的上游源码工作树 |

站点 Markdown 进入 Git；第三方 clone 不进入 Git。一个项目页只对应一个 canonical slug，禁止用嵌套目录绕开内容合同。

## 文档合同

标题名称可以贴合对象，不强制所有项目使用同一组 H2；但正文必须能回答：

1. **是什么与为什么**：一句话定位、初学者类比、解决的问题。
2. **主链**：输入、输出、3-8 步控制流、关键组件或源码地形。
3. **取舍**：一个关键设计选择、收益、代价、不适用场景。
4. **实践**：可执行命令或最小代码、预期观察、失败边界。
5. **学习结果**：读者完成后能解释或完成什么。
6. **应用型自测**：至少三个需要迁移机制的问题，附答案或检查点。
7. **来源**：官方或作者一手来源，以及需要复查的版本边界。

## 证据合同

新建或实质修改的项目页必须使用 `study-v2`：

- `canonical_source` 指向稳定的一手来源。
- `immutable_revision` 固定到 7-128 位提交或等价不可变版本。
- `evidence_type` 只声明真实取得的证据。
- `verification_status` 不把静态阅读升级成运行成功。
- `reviewed_at` 与 `review_after` 明确时效。
- review receipt 必须与正文 digest、source revision 和 evidence type 一致。

证据等级沿用 Research：

| 等级 | 可写结论 |
|---|---|
| E0 项目自述 | “README 声称……” |
| E1 静态源码 | “固定提交中的代码表明……” |
| E2 本地验证 | “命令在当前环境得到……” |
| E3 外部结果 | “上游 PR、Issue、部署或用户流程显示……” |

## 工程合同

- Node/npm 版本只以 `.nvmrc`、`package.json` 和 CI 工具链审计为准。
- 内容、数据、脚本和站点配置分别归位，不在 Markdown 内嵌维护逻辑。
- 派生 Atlas 和评估清单由脚本生成，禁止手工伪造绿色状态。
- 单项目正文实质修改必须同步 review receipt。
- 不通过批量填充虚假 revision、复制模板问答或放宽门禁完成迁移。

## 当前基线

运行：

```bash
npm run audit:project-standard
```

当前 961 个项目页的差距记录在 `data/project-standard-audit.json`：

- 3 页：已补齐来源、固定 revision、证据边界、实践和应用型自测，作为完整示范。
- 958 页：正文骨架基本完整，但仍缺固定 revision、证据边界或应用型自测。

这意味着下一阶段的主要成本是逐项目来源核验和实践闭环，不是机械移动目录。

## 重构顺序

1. 以 3 个 `benchmark-aligned` 页面作为实现参考，不复制其领域结论。
2. 按主题一次处理一个项目：固定来源、核对主链、补实践、生成 receipt。
3. 每页通过 `quality-gate` 后才减少 legacy baseline。
4. 每个小批次重生成评估快照，并运行完整 CI。

任何项目只在证据真实提升时转为 `benchmark-aligned`。

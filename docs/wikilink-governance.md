# Wikilink 身份与治理

## 身份合同

- 笔记主键是 `area::slug`，area 只允许 `papers`、`projects`。
- slug 与文件名一致，规则为小写字母、数字、点、下划线和连字符，首字符必须是字母或数字。
- 公开 wikilink 保留三种输入：裸 slug、`area/slug`、旧的 `area:slug`；`area::slug` 只用于脚本和数据，不改变公开 URL。
- 裸链接在 papers/projects 笔记内优先解析到同 area；全仓唯一 slug 可跨 area 解析；顶层页面遇到跨区同名必须显式 namespace。

唯一实现位于 `scripts/lib/note-id.mjs`。remark、backlink 与 audit 不再维护各自的 slug 正则。

## Alias

`data/wikilink-aliases.json` 只接受显式记录：

```json
{
  "version": 1,
  "aliases": [
    { "from": "papers::old-slug", "to": "papers::new-slug" }
  ]
}
```

`from` 不能覆盖现有笔记，同一 from 不能有多条定义，最终 target 必须存在；链式 alias 可以使用，但循环会让 audit 失败。Alias 只改变解析结果，不创建旧 URL、不改写正文。

## 历史预算

`data/wikilink-baseline.json` 按 `source area::slug + target` 聚合，不复制正文。每组必须有 category、owner 与 decision；类别固定为：

- `typo`
- `alias`
- `planned-note`
- `external-concept`
- `intentional-placeholder`
- `unknown`

初始基线保守地把尚未人工判定的历史项标为 `unknown / content-maintainers / triage-required`。审计同时执行总量和逐组非增长：新增 unresolved、现有组新增 occurrence、顶层 unresolved、显式 namespace missing 都会失败。`planned-note` 只是规划分类，不授权自动生产正文。

常用命令：

```bash
node scripts/audit-wikilink-ambiguity.mjs --json
node scripts/regen-backlinks.mjs --dry-run --json
node scripts/regen-backlinks.mjs --check
```

更新 baseline 是需要单独审查的动作，不能作为修复审计失败的默认手段。必须说明新增项的 owner/decision，并确认没有正文被改写。

## Backlink 写回边界

生成器只识别带固定 HTML marker 的自动生成段；没有 marker 的手写「反向链接」段保持 byte-identical。ALL 与 BACKREFS 均以 NoteId 为 key，跨区重复 slug 不再覆盖。重复 slug 的生成链接使用 `area/slug`，唯一 slug 继续使用裸形式。

当前 shadow 运行预测 1,582 个自动生成段会变化，第二轮内存生成是零 diff。由于该批量超过本轮安全阈值，代码与 dry-run 已落地，但正文目录未写回；应在没有其他 note diff 的独立提交中审阅并生成。

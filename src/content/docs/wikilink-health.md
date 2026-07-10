---
title: Wikilink 健康状态
description: Wikilink 身份、历史未解析预算和生成边界的公开状态说明
sidebar:
  hidden: true
---

# Wikilink 健康状态

本页展示冻结审查基线的聚合状态，不包含学习笔记正文或未解析链接原文。

| 指标 | 基线值 |
|---|---:|
| papers / projects 笔记 | 1,975 |
| wikilink occurrence | 31,804 |
| 历史 unresolved occurrence | 1,672 |
| unresolved 聚合组 | 1,361 |
| unknown occurrence | 1,672 |
| 跨 area 重复 slug | 31 |
| 点号 slug | 7 |
| 顶层阻断 | 0 |
| 显式 namespace missing | 0 |

历史 unresolved 不是通过删除或批量改正文来“清零”。当前门禁要求总量和每个 `source NoteId + target` 聚合组都不得增长；新增 unknown 会直接失败。每个 unknown 都由 `content-maintainers` 持有，当前决策为 `triage-required`。

Alias 必须显式、唯一、无循环，并最终指向真实笔记。计划中的笔记只进入规划，不会触发自动内容生产。

Backlink 生成器已经使用 `area::slug` 区分 papers 与 projects。全量 shadow 预计只会改动 1,582 个带 marker 的自动生成段，内存第二轮为零 diff；为避免和其他笔记改动混合，本轮不执行批量写回。

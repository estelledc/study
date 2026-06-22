# v6 KPI Dashboard — 2026-05-31

> 环 #4：三轨 + AND 门禁 + alignment 重打。

## 三轨

| # | 轨 | 阈值 | 当前 | status |
|---|---|---|---|---|
| 1 | Quality（候选引用率） | ≥70% | 43.9%（69/157） | fail |
| 2 | Dogfood（双场景均） | ≥0.8 | 0.835 | pass |
| 3 | 完整 v6 lens | ≥8 | 8 | pass |

## 轨 1：Quality

| lens | 表 | 引 | % |
|---|---|---|---|
| backend | 22 | 20 | 91 |
| data | 18 | 13 | 72 |
| frontend | 17 | 11 | 65 |
| devops | 24 | 10 | 42 |
| aieng | 20 | 7 | 35 |
| mobile | 21 | 4 | 19 |
| vllm | 17 | 3 | 18 |
| media | 18 | 1 | 6 |
| 合 | 157 | 69 | 43.9 |

仅 backend / data 过线。覆盖 written 池 13.7%；priority 命中 31/39。

## 轨 2：Dogfood

- LangGraph 教学站 v6：1.0（10/10）
- SaaS dashboard v6：0.67（6/9）
- 均 0.835；SaaS 盲区：PDF / 邮件 / presigned 上传 ADR 缺

## 轨 3：Lens

完整 v6 = 5（frontend / aieng / devops / backend / media-storage）；升级中 = 2（vllm / data）；新增 = 1（mobile）。合 8 ✓


## AND

Quality ✗ / Dogfood ✓ / Lens ✓ → **fail**。不进 next（公开发表 / 第二范式暂停）。

## fix（Quality）

1. media-storage 6%：候选砍 ≤8 + 已写补 wikilinks
2. mobile 19%：减表再 ingest
3. vllm 18%：升 v6 + ALIASES 对齐
4. devops 42%：picked 未 written 不进表
5. aieng 35%：mastra/portkey/langsmith written 后再放

路径：A 写流转 → ~60%；B 瘦身 → ~85%。B 先 + A 持续。

## alignment 重打

| 因子 | delta |
|---|---|
| 完整 lens 5→8 | +6 |
| Dogfood 单→双 | +4 |
| Quality fail | -8 |
| SOP 稳定 | +2 |
| AND fail | -2 |

**80 → 82**。Quality 可修非 paradigm 错。

## next trigger

- 瘦身 + 命中 ≥80% → 环 #5
- picked→written → 重跑 meter
- vllm 升 v6 → 补 v6-full
- data 升 v6 + 第三 dogfood → 环 #6
- 三轨全 pass → next（site-v0 公开 + 第二范式）

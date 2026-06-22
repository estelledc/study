# Lens Schema v4

## 1. Lens 文件

```
---
lens: <slug>
version: 4
status: active|frozen|retired
layer: app|serving|kernel    # 单一值
---
## 候选表
## ADR 索引
## 外迁 excludes（链接）
```

## 2. 候选表 schema（F1+F4）

列序锁定 5 列，顺序不可变：

| 候选 | ring | 立场 | 触发条件 | layer |

- ring ∈ {adopt, trial, assess, hold}
- layer ∈ {app, serving, kernel}
- **F1 强约束**：同表 layer 必须全等；不同 layer 候选拆到不同 lens
- **F4**：列序错或列数 ≠5 即 lint fail

## 3. ADR 三子模板必填段白名单（F5）

不再用"≥3 段"计数。每 subtype 列出具体段名作为白名单，缺一即 fail。

### subtype = implementation-tuning
必填段：`## context` / `## decision` / `## rationale` / `## consequences`

**F2**：`## decision` 正文必须正则匹配 `[A-Za-z_]+\s*=\s*\S+` 至少一处（如 `max_num_seqs = 256`），挡口号型 decision。

### subtype = vendor-selection
必填段：`## context` / `## decision` / `## alternatives` / `## consequences`
- `## alternatives` 必须 ≥2 候选 + 拒绝理由

### subtype = architecture
必填段：`## context` / `## decision` / `## consequences` / `## rollback`
- `## rollback` 写明回滚条件 + 操作

## 4. Excludes 外迁（F3）

glossary 不再承担 excludes。每 lens 必须配齐 4 个 stub（即占位也存在）：

| 文件 | 用途 |
|---|---|
| `sources/<lens>.md` | 引用文献 |
| `reading_list/<lens>.md` | 阅读顺序 + 难度 |
| `getting_started/<lens>.md` | 第一周任务清单 |
| `what_is_not/<lens>.md` | 显式划界 |

stub 模板见 `excludes-stubs/`。lint：4 文件存在 + 各 ≥50 字。

## 5. 状态机

- active：候选表 + ADR 都更新
- frozen：候选表停更，ADR 仍补
- retired：归档

## 6. v3 → v4 不兼容

- 候选表重排为 5 列（v3 是 4 列无 layer）
- 跨 layer lens 必须拆分
- ADR tuning 缺 param=value 需重写
- 4 个 excludes 文件必须创建

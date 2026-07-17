# 动手实验：把 Markdown 列表当成一个小型数据系统

> 目标：不用修改仓库、不调用 Routine、不接触 token，在 60-90 分钟内验证数据、政策、执行器和外部故障四层。
>
> 实验基线：本地提交 `58185a2de07cd2aea247b06fb689f08f8555d884`。

## 实验 0：进入只读教材

```bash
cd explorations/research/repos/chinese-independent-developer
git status --short --branch
git rev-parse HEAD
```

预期：

```text
## master...origin/master
58185a2de07cd2aea247b06fb689f08f8555d884
```

如果工作树不干净，先停止。第三方源码是教材，本实验不覆盖也不清理任何改动。

## 实验 1：验证现有测试到底保护什么

```bash
python3 -m unittest tests/test_process_item.py -v
```

2026-07-17 实测结果：4 个测试通过。

然后回答：

1. 测试覆盖的是当前 Routine Skill，还是旧 Python 脚本？
2. 它验证了 Markdown 插入和 URL 去重吗？
3. 它能发现“程序员版面”被写成“程序员版”吗？

答案：

- 测试只导入 `.github/scripts/process_item.py`。
- 它保护 reaction 归属、跳过 PR、保留管理员标记 Issue。
- 它没有覆盖当前 Skill、三版面分类、README 写入或评论文本。

## 实验 2：把 Markdown 当表扫描

先数四个列表中的状态行：

```bash
for f in README.md \
  pages/README-Programmer-Edition.md \
  pages/README-Game.md \
  pages/README-2018-2020.md
do
  printf '%s\t' "$f"
  rg -c '^\* :(white_check_mark|clock8|x):' "$f"
done
```

固定提交的结果：

| 文件 | 状态行 |
|---|---:|
| `README.md` | 1,726 |
| `pages/README-Programmer-Edition.md` | 228 |
| `pages/README-Game.md` | 100 |
| `pages/README-2018-2020.md` | 490 |
| 合计 | 2,544 |

这一步只证明行首格式匹配，不证明每一行都有合法 URL 或唯一产品。

## 实验 3：做一个严格 schema 探针

下面的脚本只读文件，抽取“状态 + 产品名 + `http/https` URL”：

```bash
python3 - <<'PY'
from collections import Counter
from pathlib import Path
import re

files = [Path("README.md"), *Path("pages").glob("README-*.md")]
rows = []
for file in files:
    for line in file.read_text(encoding="utf-8").splitlines():
        match = re.match(
            r"^\* :(white_check_mark|clock8|x): "
            r"\[[^]]+\]\((https?://[^)]+)\)",
            line,
        )
        if match:
            rows.append((file.as_posix(), match.group(1), match.group(2)))

counts = Counter(status for _, status, _ in rows)
repeated = {url for _, _, url in rows if sum(r[2] == url for r in rows) > 1}
print("entries", len(rows))
print("statuses", dict(sorted(counts.items())))
print("repeated_product_urls", len(repeated))
PY
```

固定提交的结果：

```text
entries 2513
statuses {'clock8': 26, 'white_check_mark': 2093, 'x': 394}
repeated_product_urls 26
```

推理：

```text
2,544 个状态行 - 2,513 个严格匹配行 = 31 个需人工复核的格式差
```

不要直接把 31 行叫作错误，也不要删除 26 个重复 URL。探针负责找候选，人工或更强规则负责判断语义。

## 实验 4：检查日期区块唯一性

```bash
for f in README.md \
  pages/README-Programmer-Edition.md \
  pages/README-Game.md \
  pages/README-2018-2020.md
do
  printf '%s\n' "$f"
  rg '^### 20[0-9]{2} 年 ' "$f" | sort | uniq -d
done
```

固定提交会找到：

```text
pages/README-Programmer-Edition.md
### 2025 年 8 月 8 号添加
```

这说明“日期标题唯一”只是隐含规则，当前没有确定性门禁。

## 实验 5：定位当前主链与备用链

查看触发器：

```bash
nl -ba .github/workflows/trigger_claude_routine.yml
```

重点看：

- 第 3-6 行：定时和手动触发。
- 第 13-17 行：只发送 HTTP 请求。
- 第 19-22 行：只识别返回 JSON 中的 `"type":"error"`。

查看当前政策：

```bash
rg -n '预检|去重规则|步骤2：分类|批量提交|最后一步' \
  .claude/skills/chinese-indie-dev/SKILL.md
```

查看旧备用链：

```bash
rg -n '^def |阶段 [1-4]|create_pull|create_reaction' \
  .github/scripts/process_item.py
```

把结果整理成表：

| 维度 | 当前 Skill + Routine | 旧 Python |
|---|---|---|
| 输入 | 评论、新 Issue、全部 open PR | reaction 标记的评论和 Issue |
| 分类 | 三个版面 + 拒绝 | 主 README |
| 去重 | 完整 URL 文本匹配 | 成功 reaction |
| 写入 | Issue 批量直推；PR squash merge | 批量分支 + PR |
| 测试 | 无离线契约测试 | 4 个收集逻辑测试 |

## 实验 6：只读分诊一次真实失败

前提：`gh auth status` 已登录公开 GitHub。命令只读取 Action 日志：

```bash
gh run view 29545709871 \
  -R 1c7/chinese-independent-developer \
  --log-failed
```

定位顺序：

```text
schedule 已启动
  -> runner 已执行 curl
  -> Routine API 返回 authentication_error
  -> workflow 识别 type:error
  -> step 退出 1
```

不要继续检查 README 写入、评论签名或分类代码，因为它们在这次运行里根本没有开始。

## 实验 7：设计一个最小改进，不实施

请写出一个只读方案，给当前仓库增加三类确定性门禁：

1. 产品 URL 重复候选。
2. 日期标题重复。
3. Skill 中固定版面名称的离线案例。

约束：

- 不自动删除历史条目。
- 不调用 LLM 或外部 API。
- CI 返回非零时要给出文件和行号。
- 旧历史问题与本次新增回归要能区分。

推荐答案形态：

```text
scripts/audit_lists.py
  -> 解析四个 Markdown
  -> 输出 duplicate URL / duplicate date / malformed row
  -> allowlist 保存已确认的历史例外

tests/skill_cases/
  -> 输入投稿
  -> 期望版面和评论措辞
  -> Agent/eval 运行不直接写真实仓库
```

## 完成标准

- [ ] 4 个旧脚本测试通过。
- [ ] 能解释 2,544 与 2,513 的差异。
- [ ] 能说明为什么 26 个重复 URL 不能自动删除。
- [ ] 能指出当前主链和旧备用链的四个规则差异。
- [ ] 能把认证失败定位在触发边界。
- [ ] 能提出一个不修改历史数据的确定性门禁方案。

完成后进入[真实案例与答案检查](02-case-cards-and-answer-guide.md)。

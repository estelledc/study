# 零基础实验：系统跑完，不等于学生学会

> 目标：不用模型、API Key、数据库或网络，理解教学系统怎样保存可审计的学习证据。
>
> 代码：[`labs/evidence_tutor.py`](labs/evidence_tutor.py)

## 1. 先建立生活类比

驾校 App 显示“课程播放完成”，只能证明视频播完。学员在原题上答对，只能证明这次
表现正确。真正更强的证据是：换一条陌生路线，不看提示，仍能独立驾驶。

| 驾校 | AI Tutor |
|---|---|
| 开课前试驾 | diagnostic baseline |
| 教练带练 | guided practice |
| 陌生路线独立驾驶 | independent transfer |
| App 显示课程结束 | session completed |
| 驾驶记录 | attempt provenance |

类比边界：一次迁移题也不是终身掌握。真实学习还需要延迟复习、多题覆盖和人工判断。

## 2. 四层证据不要混

| 层 | 回答的问题 | 例子 |
|---|---|---|
| System health | 软件是否完成请求 | turn 发出 `DONE` |
| Task performance | 这道题是否答对 | answer == expected |
| Mastery estimate | 历史表现达到什么阈值 | 最近正确率 0.9 |
| Learning gain | 教学后能否独立迁移 | baseline 错，陌生题独立对 |

前一层是后一层的必要支撑，但不是充分证据。

## 3. DeepTutor 当前做到了什么

`deeptutor/learning/mastery.py` 对最近五次答题做 recency-weighted 计算，并设置
低置信上限：

```text
1 次正确 -> 最多 0.5
2 次正确 -> 最多 0.8
3 次及以上 -> 才可能到 1.0
```

`deeptutor/learning/policy.py` 再按知识类型设置 gate：

- MEMORY / PROCEDURE：mastery 至少 0.9；
- CONCEPT / DESIGN：必须通过 qualitative explanation assessment。

这比“一次答对即掌握”更可靠，也允许已证明的知识点 test out。

但 `compute_mastery()` 只接收 `list[bool]`。它不知道：

- 三次是否为同一道题；
- 是否用了提示；
- 是否看过答案；
- 是否换了新场景；
- 教学前 baseline 是什么。

所以它是有用的 progress estimate，不是 learning gain 的完整证明。

## 4. 最小实验主链

```text
diagnostic
  -> practice
  -> independent transfer
  -> evidence-backed mastery projection
```

每次 attempt 记录：

```text
attempt_id
learner_id + course_id scope
exercise_id
concept
phase
answer
correct
hints_used
independent
```

mastery 不是被模型直接写入，而是每次从 attempt 重算。

## 5. 状态定义

| Level | 含义 |
|---|---|
| `unknown` | 还没有 baseline |
| `needs_instruction` | baseline 未通过 |
| `practicing` | guided practice 已通过，尚无独立迁移 |
| `needs_review` | transfer 错误或使用提示 |
| `prior_knowledge` | baseline 已会，不能算本次教学增益 |
| `retained` | baseline 已会，后续 transfer 仍会 |
| `demonstrated_gain` | baseline 错，practice 后独立 transfer 对 |

`session_status` 另存为 `running/completed`，不参与自动升级 mastery。

## 6. 运行实验

从仓库根目录：

```bash
cd explorations/research/deeptutor-ecosystem-study/labs
PYTHONDONTWRITEBYTECODE=1 python3 evidence_tutor.py
```

2026-07-17 实测：

```text
first_run=completed:practicing
second_run=completed:demonstrated_gain
evidence=diag-1,practice-1,transfer-1
```

解释：

1. 第一轮 baseline 错，带提示的 practice 对。
2. session 已完成，但 mastery 仍是 `practicing`。
3. 恢复 session 后，学生独立完成不同 transfer 题。
4. 此时才生成 `demonstrated_gain`，并保留三条 attempt ID。

## 7. 运行九个测试

```bash
PYTHONDONTWRITEBYTECODE=1 \
python3 -m unittest -v test_evidence_tutor.py
```

结果：

```text
Ran 9 tests
OK
```

| 测试 | 证明什么 |
|---|---|
| diagnostic prerequisite | 不能跳过 baseline 直接写练习证据 |
| deterministic grading | 评分合同可复查，不依赖模型自评 |
| completion separation | session 完成不会升级 learning gain |
| hinted transfer | 使用提示的 transfer 不算独立掌握 |
| independent transfer | baseline + practice + transfer 才形成 gain |
| repeated practice | 重复原题不能冒充迁移 |
| attempt idempotency | 重复提交不重复计数，冲突复用 fail closed |
| scope isolation | learner/course 之间不串状态 |
| transfer identity | practice 与 transfer 不能使用同一 prompt |

## 8. 为什么必须有 Baseline

学生教学前已经会，教学后又答对：

```text
post-test correct
```

不能推出：

```text
teaching caused improvement
```

实验把 baseline 已正确标为 `prior_knowledge`；即使 transfer 正确，也只变成
`retained`，不会写成 `learning_gain=true`。

## 9. 为什么必须有不同题

重复原题可能只是在记答案。迁移题至少改变表面形式，同时保留目标概念。

实验要求：

- phase 必须是 `transfer`；
- transfer prompt 与 practice prompt 不同；
- transfer 前已有正确 practice；
- `hints_used == 0`；
- 结果正确。

真实系统还应进一步记录题目难度、知识点覆盖和生成来源。

## 10. 为什么 Mastery 需要 Provenance

只保存：

```json
{"order-of-operations": "mastered"}
```

无法回答：

- 谁做的？
- 哪门课？
- 根据哪几次作答？
- 是否使用提示？
- 是同题重复还是新题？
- 何时应该过期或复习？

实验返回：

```json
{
  "concept": "order-of-operations",
  "level": "demonstrated_gain",
  "learning_gain": true,
  "evidence_attempt_ids": [
    "diag-1",
    "practice-1",
    "transfer-1"
  ]
}
```

这仍是最小模型，但结论可以追回原始事件。

## 11. 教学 Policy 与 Agent Loop 的边界

Agent loop 负责：

- 收消息；
- 调工具；
- streaming；
- 重试、取消和完成；
- 保存 turn。

Tutor policy 负责：

- 先诊断还是先解释；
- 何时给提示；
- 何时练习；
- 什么证据能升级 mastery；
- 下一步复习还是迁移。

把 policy 全写进 prompt，会让阈值、优先级和回归行为难以测试。DeepTutor 将
mastery gate 写成纯函数，这是正确方向。

## 12. 常见误区

1. **页面显示 100%，说明已经学会。**  
   正确理解：先查 100% 由哪些题、提示和时间窗口产生。

2. **连续答对三次，说明掌握。**  
   正确理解：如果是同题或看过提示，证据仍弱。

3. **模型说“解释得很好”，就能写 mastery。**  
   正确理解：定性 assessment 也要保存 rubric、原回答、grader 版本和来源。

4. **RAG 回答正确，所以教学有效。**  
   正确理解：RAG 证明依据更可靠，不证明学生之后能独立完成。

5. **记得越多，个性化越强。**  
   正确理解：错误、过期或跨用户记忆会直接伤害教学决策。

## 13. 应用题与检查点

### 题 1

学生 baseline 已正确，教学后 transfer 也正确，能写 learning gain 吗？

检查点：不能归因给本次教学；可写 `retained` 或“先验已掌握”。

### 题 2

学生 baseline 错，practice 对，transfer 在提示后对，能标 mastered 吗？

检查点：不能标独立掌握；下一步应减少提示后再做新题。

### 题 3

Tutor turn 发送 `DONE`，但评分存储失败，应该怎样记录？

检查点：系统执行和学习证据分开；turn 可标响应完成，attempt/mastery 更新必须失败
或待恢复，不能静默补成成功。

### 题 4

为什么同一 learner 在两门课中的 mastery 不能只按 `learner_id` 存？

检查点：概念定义、课程标准、题目和目标不同；至少要有 learner/course scope。

## 14. 未覆盖边界

- 多题难度校准、IRT/BKT 或知识追踪模型；
- 延迟数日后的 transfer；
- 开放题 rubric 与人类教师一致性；
- 题目泄露和猜测概率；
- 情绪、动机和无障碍需求；
- 真实 DeepTutor UI、provider 和数据库 E2E。

实验只证明一条最小 evidence contract，不宣称它是完整教育测量方案。

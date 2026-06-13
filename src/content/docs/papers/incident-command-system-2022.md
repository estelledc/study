---
title: Incident Command System for Tech Operations — 技术事故里的「现场总指挥」
来源: https://response.pagerduty.com/training/incident_commander/
日期: 2026-06-13
子分类: 工程文化
分类: 其他
provenance: pipeline-v3
---

## 先想成什么事

想象商场里突然冒烟，警铃大作。这时最怕的不是火本身，而是**二十个人同时喊不同方案**：保安去拉闸、电工查线路、店长打电话、有人在群里发未经证实的照片。

消防系统里早就有答案：**现场只认一个总指挥（Incident Commander）**。他不必亲自灭火，但要：

- 问清「烟从哪来、影响多大」；
- 让专家汇报，**点名**谁去关燃气、谁去疏散；
- 每隔几分钟对外报平安；
- 决定「先救人还是先断电」——错了也比没人拍板强。

PagerDuty 把美国应急体系里的 **Incident Command System（ICS，事故指挥系统）** 改造成适合软件团队的流程，并开源在 [Incident Response Documentation](https://response.pagerduty.com/)。核心文档之一便是 [Incident Commander 培训指南](https://response.pagerduty.com/training/incident_commander/)：教你在数据库宕机、支付超时、区域故障时，如何当那个**不碰键盘、但让整个响应不瘫痪**的人。

日常类比再往前一步：IC 像**电影导演**——自己不上场演戏，但场记、摄影、灯光都向他汇报；剪辑意见可以听，**开机拍哪条镜头由他定**。事故响应里，Subject Matter Expert（SME，领域专家）是演员，IC 是导演。

## 这篇材料在说什么

| 维度 | 内容 |
|------|------|
| 名称 | Incident Command System for Tech Operations（PagerDuty 实践版） |
| 来源 | PagerDuty 开源事故响应手册 + IC 培训页 |
| 血统 | 源自美国野火/灾害应急 ICS，PagerDuty 按「不涉及人命」场景做了裁剪 |
| 一句话 | **重大事故期间，用固定角色与固定话术，把混乱的多人调试变成可预测的协同** |

与 [[chaos-engineering-netflix-2016]] 的关系：混沌工程回答「我们能不能承受故障」；ICS 回答「故障已经发生时，**谁说话算数、信息往哪流**」。与 [[dora-state-of-devops-2023]] 里的 **MTTR（平均恢复时间）** 也直接相关——恢复快慢往往取决于协调成本，而不只是技术难度。

## 为什么值得学（零基础图景）

没有 ICS 时，典型反模式是：

1. **最资深的工程师边查日志边指挥**，上下文切换导致修复变慢；
2. Zoom 里七个人同时改生产；
3. Slack 线程 200 条，没人知道当前决策是什么；
4. 高管进来问「还要多久」，团队被迫编 Excel 而不是修服务。

PagerDuty 的论点是：**协调是一种专职工作**。IC 不需要深度懂每个服务，但需要会：

- 收集症状与影响面（Size-Up）；
- 收集方案、评估风险、**拍板**（Stabilize）；
- 定时播报（Update）；
- 验证修复或回到上一步（Verify）。

培训页明确写：**实习生也可以当 IC**，只要完成 shadow / reverse shadow，并把自己放上值班表。

## 核心概念

### 1. 角色分工（战时编制）

PagerDuty [Different Roles](https://response.pagerduty.com/before/different_roles/) 把响应拆成可扩展编制。最小可用集通常只有 **IC + 修复者**；成熟团队会补齐下表。

| 角色 | 缩写 | 做什么 | 不做什么 |
|------|------|--------|----------|
| **Incident Commander** | IC | 唯一决策源；委派任务；对外口径审批 | 看 Grafana、ssh、改配置 |
| **Deputy** | 副 IC | 盯遗漏、计时、热备接管 | 与 IC 抢决策权 |
| **Scribe** | 记录员 | 时间线、决策、链接写入 Slack/文档 | 参与技术争论 |
| **Subject Matter Expert** | SME | 查因、提方案、**被指派**后执行 | 自行其是改生产 |
| **Customer Liaison** | 对外联络 | 状态页、客户沟通草稿 | 技术修复 |
| **Internal Liaison** | 对内联络 | 通知其他部门、收集非技术诉求 | 代替 IC 指挥 |

关键原则：**信息向上汇聚到 IC，指令向下派发**。SME 向 IC 汇报发现与建议；是否回滚、是否公开声明，由 IC 决定。

### 2. IC 的唯一使命

培训页把 IC 的目的浓缩成一句：

> **Keep the incident moving towards resolution.**（让事故持续朝解决方向推进。）

这意味着 IC 要随时想 **Plan B**：如果三分钟后回滚没效果，下一手是什么？宁可选一个「次优但可执行」的方案，也不要全场沉默等完美答案。

### 3. 四阶段循环：Size-Up → Stabilize → Update → Verify

这是每次重大事故的主循环，来自 [Incident Commander 培训](https://response.pagerduty.com/training/incident_commander/#handling-incidents) 的 **Handling Incidents** 章节。

```text
        ┌──────────┐
        │ Size-Up  │  什么坏了？影响多大？是否在扩大？
        └────┬─────┘
             ▼
        ┌──────────┐
        │ Stabilize│  收集方案 → 决策 → 征求强烈反对 → 指派任务
        └────┬─────┘
             ▼
        ┌──────────┐
        │  Update  │  定期状态播报（内部 + 利益相关方）
        └────┬─────┘
             ▼
        ┌──────────┐
        │  Verify  │  任务完成了吗？好了就收尾；没好就回到 Size-Up
        └──────────┘
```

**Size-Up（研判）** 要问：

- 「What's wrong?」——症状是什么？
- 「Is this affecting multiple services?」——范围、是否在升级？

**Stabilize（稳住）** 步骤：

1. 问专家：有哪些动作？风险各是什么？
2. IC 说：**「We're proceeding with …」**（我们按某方案执行）
3. **「Are there any strong objections?」**（有谁强烈反对？）——注意不是「大家都同意吗」，而是只收集**强烈**反对，避免嘈杂与沉默并存
4. **「Alice, please do X, I'll come back in 3 minutes. Understood?」**——任务必须**指派到具体的人**并**限时**

**Update（同步）** 在等待时填空，避免会议死寂。

**Verify（验证）** 回到被指派的人：完成了吗？没解决则重新 Size-Up。

### 4. 话术与反模式（Lingo）

| 要说 | 不要说 | 原因 |
|------|--------|------|
| 「Bob，请在 3 分钟内查 web 延迟，明白吗？」 | 「谁能看一下延迟？」 | 避免 **bystander effect（旁观者效应）** |
| 「是否有**强烈**反对？」 | 「大家都同意吗？」 | 后者引发叠话或沉默 |
| 「This is [NAME], I am the **Incident Commander**.」 | 「我是 IC」 | 新人不懂缩写；**commander** 明确权威 |
| 「Do you wish to take command?」 | 与高管争论 | **Executive swoop** 时把「夺权」显性化 |

[During an Incident](https://response.pagerduty.com/during/during_an_incident/) 还规定：SME **只建议、不擅自执行**；IC 不确定是否对外公告时，原则往往是 **「If in doubt, post it out」**（有疑虑就发状态公告）。

### 5. 复杂事故：子团队与缩小范围

当人数超过 IC 能有效掌控的跨度（通常 ~7 人），可 spin off **Alpha / Bravo / Charlie** 子组：指定组长、限时、**子组只通过组长与 IC 沟通**。

根因明确后，IC 应**缩小会议**：点名「请 Deputy、Scribe、SRE 留下，其他人可退出」——凌晨三点的人性化设计。

### 6. 指挥权交接（Transfer of Command）

疲劳、复杂度变化、私人紧急事务都可以交接。流程：

1. 在 Slack 私聊副 IC 说明上下文；
2. 在会议上：**「I am handing over command to [X].」**
3. 新 IC 重新做开场自我介绍。

注意：**更资深的人到场 ≠ 自动换指挥**。职级在和平年代有效，战时只认 IC 角色。

### 7. 培训路径

PagerDuty 建议的训练阶梯（见 IC 培训页）：

1. 阅读角色文档；
2. 参加 **Failure Friday**（故意演练）：先旁观 → 当 Scribe → 当 IC；
3. **Shadow** 一周：跟真实 IC，不发言；
4. **Reverse shadow** 一周：你指挥，导师只在失控时接管；
5. **毕业**：把自己放上 IC on-call 排班。

游戏 *Keep Talking and Nobody Explodes* 被当作低成本协调练习——信息不完整、一人指挥、多人执行。

## 代码示例一：用 Python 实现「限时任务看板」（IC 的委派追踪器）

IC 的核心负担之一是：**谁在被指派什么、何时该追问**。下面是一个极简的 in-memory 任务看板，可在事故 Slack bot 或 CLI 里使用；体现培训页里的 **assign → time-box → acknowledge** 三步。

```python
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import json

class TaskState(str, Enum):
    ASSIGNED = "assigned"
    ACKED = "acked"
    DONE = "done"
    OVERDUE = "overdue"

@dataclass
class IncidentTask:
    assignee: str
    instruction: str
    due_at: datetime
    state: TaskState = TaskState.ASSIGNED
    ack_text: str = ""

    def is_overdue(self, now: datetime) -> bool:
        return self.state not in (TaskState.DONE,) and now >= self.due_at

class IncidentBridge:
    """模拟事故桥接器：IC 委派、Deputy 可轮询超时"""

    def __init__(self, incident_id: str, commander: str):
        self.incident_id = incident_id
        self.commander = commander
        self.tasks: list[IncidentTask] = []

    def assign(self, assignee: str, instruction: str, minutes: int) -> IncidentTask:
        task = IncidentTask(
            assignee=assignee,
            instruction=instruction,
            due_at=datetime.utcnow() + timedelta(minutes=minutes),
        )
        self.tasks.append(task)
        return task

    def acknowledge(self, assignee: str, text: str = "Understood") -> None:
        for t in reversed(self.tasks):
            if t.assignee == assignee and t.state == TaskState.ASSIGNED:
                t.state = TaskState.ACKED
                t.ack_text = text
                return
        raise ValueError(f"no open task for {assignee}")

    def complete(self, assignee: str) -> None:
        for t in reversed(self.tasks):
            if t.assignee == assignee and t.state != TaskState.DONE:
                t.state = TaskState.DONE
                return

    def overdue(self, now: datetime | None = None) -> list[IncidentTask]:
        now = now or datetime.utcnow()
        out = []
        for t in self.tasks:
            if t.is_overdue(now):
                t.state = TaskState.OVERDUE
                out.append(t)
        return out

    def ic_status_line(self) -> str:
        """生成 Update 阶段的口播提纲"""
        parts = [f"INC {self.incident_id} — commander {self.commander}"]
        for t in self.tasks:
            parts.append(
                f"- {t.assignee}: {t.instruction} [{t.state.value}, due {t.due_at.isoformat()}Z]"
            )
        return "\n".join(parts)

# --- 模拟一次 Stabilize 阶段的委派 ---
bridge = IncidentBridge("INC-2026-0412", commander="Alice")
bridge.assign("Bob", "check p99 latency on checkout-api", minutes=3)
bridge.assign("Carol", "confirm last deploy hash for payments", minutes=5)
bridge.acknowledge("Bob")

print(bridge.ic_status_line())
print("overdue:", [t.assignee for t in bridge.overdue()])
```

要点：

- 每个任务绑定**一个人 + 截止时间**，对应 IC 话术里的 **「I'll come back to you in X minutes」**；
- Deputy 可以定时调用 `overdue()` 提醒 IC 追问；
- `ic_status_line()` 帮助 Scribe 把 Update 口播结构化。

## 代码示例二：事故响应 Runbook 的 YAML + 检查清单生成

把 ICS 流程固化成可版本化的 runbook，便于 onboarding 与演练。下面 YAML 描述角色、阶段检查项与标准口播；用短脚本渲染成值班笔记本。

```yaml
# incident-runbook.yaml — 与 PagerDuty open-source IR 对齐的骨架
incident:
  severity: SEV-1
  bridge:
    zoom: "https://example.com/bridge/rotating"
    slack: "#inc-sev1"
  roles:
    incident_commander: oncall-ic
    deputy: oncall-ic-shadow
    scribe: auto-rotate
    customer_liaison: oncall-support-lead

phases:
  size_up:
    prompts:
      - "What's wrong? (symptoms)"
      - "Is this affecting multiple services?"
      - "Is impact escalating, flapping, or static?"
  stabilize:
    decision_template: "We're proceeding with {action} because {rationale}."
    objection_poll: "Are there any strong objections to this plan?"
    assign_template: "{name}, please {task}. I'll come back in {minutes} minutes. Understood?"
  update:
    cadence_minutes: 5
    public_status_if_in_doubt: true
  verify:
    follow_up: "Have you finished {task}?"

announcements:
  start: "This is {name}, I am the Incident Commander for this call."
  handover: "Everyone on the call, be advised, I am handing over command to {name}."
  end: "We're ending the call at this time. Follow-up in {slack}. Thanks everyone."
```

```python
#!/usr/bin/env python3
"""render-runbook.py — 从 YAML 生成 IC 口袋检查清单"""
import sys
from pathlib import Path
import yaml

def main(path: Path) -> None:
    doc = yaml.safe_load(path.read_text())
    inc = doc["incident"]
    print(f"# Incident checklist — {inc['severity']}\n")
    print("## Roles")
    for role, who in inc["roles"].items():
        print(f"- {role}: {who}")
    print("\n## Phases")
    for phase, body in doc["phases"].items():
        print(f"\n### {phase}")
        for key, val in body.items():
            if isinstance(val, list):
                for item in val:
                    print(f"- [ ] {item}")
            else:
                print(f"- {key}: {val}")
    print("\n## Announcements")
    for name, tmpl in doc["announcements"].items():
        print(f"- {name}: `{tmpl}`")

if __name__ == "__main__":
    main(Path(sys.argv[1]))
```

运行 `python render-runbook.py incident-runbook.yaml` 会得到可打印的检查清单，适合 **Failure Friday** 或新 IC shadow 时随身携带。

## 与「普通 on-call」的差异

| 维度 | 普通 on-call | ICS 重大事故模式 |
|------|--------------|------------------|
| 决策 | 谁懂谁上 | **唯一 IC**，职级让位 |
| 沟通 | Slack 自由讨论 | 口播 + Scribe 时间线 |
| 修复 | 处理人可能即指挥 | **指挥与执行分离** |
| 对外 | 临时拼凑公告 | Customer Liaison + IC 审批 |
| 事后 | 口头吐槽 | 指定 postmortem 负责人 |

Getting Started 文档建议：**先从 IC 角色起步**，有人够再加 Scribe；用**假事故**练「和平时期到战时」的心态切换。

## 常见坑（Incident Response Pitfalls）

1. **IC 亲自查日志** — 失去全局视角；应立刻委派给 SME。
2. **「Can someone…」** — 任务悬空；必须点名。
3. **无限时指派** — 无法 Verify；三分钟、五分钟都要说出来。
4. **会议不缩小** — 无关人员凌晨耗着，次日二次事故。
5. **高管夺权但不接班** — 用 **「Do you wish to take command?」** 把权责说清楚。
6. **只有一位 IC** — 应尽早培养多人并 **daily on-call rotation**（PagerDuty 建议从周排班尽快过渡到日排班）。

## 落地清单（给零基础团队）

1. 定义何为 **major incident**（例如 SEV-1/SEV-2 触发桥接）。
2. 指定沟通渠道（Zoom/Meet + `#incident` Slack）。
3. 选 2–3 人训练 IC，建立 shadow 机制。
4. 写一页纸 runbook：角色表 + 四阶段 + 三条口播模板。
5. 每月一次演练（Failure Friday 或 game day）。
6. 每次真实事故后做 **blameless postmortem**，Scribe 的时间线是输入。

## 进一步阅读

- [Incident Commander 培训](https://response.pagerduty.com/training/incident_commander/) — 本文主来源
- [Different Roles](https://response.pagerduty.com/before/different_roles/) — 角色职责全文
- [During an Incident](https://response.pagerduty.com/during/during_an_incident/) — IC / Deputy / SME 分步指令
- [Getting Started](https://response.pagerduty.com/getting_started/) — 最小可行 ICS
- [Incident Response Training 课程快照](https://response.pagerduty.com/training/courses/incident_response/) — 2018 开源课件
- 关联笔记：[[chaos-engineering-netflix-2016]]、[[dora-state-of-devops-2023]]

## 小结

**Incident Command System for Tech Operations** 不是又一个 on-call 排班表，而是一套**战时宪法**：谁指挥、谁执行、谁记录、谁对外说话，以及决策时用什么句子。PagerDuty 用十年事故经验证明：把 ICS 从火灾现场搬到数据中心，能显著降低「人越多越乱」的协调税。你不必是最强的调试者，但必须能让最强的那几个人**朝同一个方向用力**——这就是 Incident Commander 存在的理由。

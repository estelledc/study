---
title: Agile Software Development: Principles and Practices
来源: https://agilemanifesto.org/
日期: 2026-06-13
分类: 其他
子分类: software-engineering
provenance: pipeline-v3
---

# Agile Software Development: Principles and Practices

## 一、这是什么？一个日常类比

想象你要装修一间房子。

**传统方法（瀑布模型）：** 你花一个月时间把所有设计图纸画好——墙面颜色、插座位置、家具摆放——然后交给施工队，告诉他们"照做就行，别问别改"。三个月后验收，发现插座位置挡住了沙发，墙面颜色跟家具不搭。你想改？不行，合同写死了。

**敏捷方法：** 你先刷一面墙试试效果，看看颜色对不对；装好一盏灯，看看亮度够不够；摆上家具，实际走两步，发现过道太窄，立刻调整。每两周看一次进展，随时可以改主意。最后你得到的是一个真正适合你生活的空间，而不是一份"完美图纸"。

2001年，17位软件专家在犹他州滑雪场聚会，得出了同样的结论：**软件也应该像装修一样，小步快跑、随时调整。** 他们写下了著名的《敏捷宣言》（Agile Manifesto）。

## 二、敏捷宣言：四条价值观

宣言的核心很简单——在对比中选择左边，但不否认右边的价值：

| 我们更重视 | 但也认可右边的价值 |
|---|---|
| 个体和互动，高于流程和工具 | 流程和工具 |
| 可工作的软件，高于详尽的文档 | 详尽的文档 |
| 客户合作，高于合同谈判 | 合同谈判 |
| 响应变化，高于遵循计划 | 遵循计划 |

关键理解：右边的东西**也有价值**，只是左边的价值更高。不是"不要文档"，而是"文档够用就好，别耽误写代码"。

## 三、敏捷的十二条原则（简化版）

十二条原则可以归纳为几个核心思想：

1. **客户满意是第一目标** — 尽早、持续地交付有价值的软件
2. **欢迎变化** — 即使开发后期，变化也能带来竞争优势
3. **频繁交付** — 几周或几个月一次，越短越好
4. **业务人员与开发人员每天合作**
5. **激励个体** — 给优秀的人提供环境，信任他们
6. **面对面沟通最高效**
7. **可工作的软件是进度的唯一度量**
8. **可持续开发** — 保持恒定节奏，长期可维持
9. **技术优秀和良好设计增强敏捷性**
10. **简洁** — 最大化不做的工作量，是艺术
11. **自我组织团队产生最佳架构和需求**
12. **定期反思调整** — 团队定期反思如何更高效，然后调整行为

## 四、核心概念详解

### 4.1 Sprint（冲刺）

Sprint 是 Scrum 框架中的核心概念。它是一个固定长度的周期（通常 2-4 周），期间团队完成一组预先选好的任务。

每个 Sprint 结束时，必须产出**可工作的、可用的软件增量**。

```
Sprint 1 (2周): 用户注册功能
  -> 第1天: 设计数据库表
  -> 第3天: 写注册API
  -> 第5天: 写前端表单
  -> 第10天: 测试通过，演示给产品看
  -> 产出: 用户能注册了 ✅

Sprint 2 (2周): 登录功能
  -> 基于 Sprint 1 的注册数据继续构建
  -> 产出: 用户能登录了 ✅
```

### 4.2 用户故事（User Story）

用户故事是从用户角度描述需求的简短语句：

> "作为一个 [角色]，我想要 [功能]，以便于 [价值]。"

例如：
> "作为一个购物者，我想要一键下单，以便快速完成购买。"

### 4.3 迭代与增量

- **迭代（Iteration）**：重复的开发周期
- **增量（Increment）**：每次迭代交付的可用软件部分

每次迭代都在之前的增量上**添加**新功能，而不是替换。

## 五、代码示例

### 示例1：使用 TDD（测试驱动开发）写一个用户注册功能

TDD 是敏捷的核心实践之一：**先写测试，再写代码，最后重构**。流程是 Red-Green-Refactor（红-绿-重构）：

```python
# ---------- 第一步：先写测试（Red — 测试失败） ----------
# tests/test_user_registration.py

import pytest
from user_service import UserService, DuplicateEmailError

class TestUserRegistration:
    def setup_method(self):
        self.service = UserService()

    def test_register_new_user(self):
        """新用户可以成功注册"""
        result = self.service.register("alice@example.com", "Alice")
        assert result.email == "alice@example.com"
        assert result.name == "Alice"
        assert result.is_active is True

    def test_register_duplicate_email_fails(self):
        """重复邮箱注册应该失败"""
        self.service.register("alice@example.com", "Alice")
        with pytest.raises(DuplicateEmailError):
            self.service.register("alice@example.com", "Alice 2")

    def test_register_empty_email_raises_error(self):
        """空邮箱应该报错"""
        with pytest.raises(ValueError):
            self.service.register("", "Alice")
```

```python
# ---------- 第二步：写最少的代码让测试通过（Green） ----------
# user_service.py

class DuplicateEmailError(Exception):
    """邮箱已存在的自定义异常"""
    pass

class User:
    """用户数据模型"""
    def __init__(self, email, name, is_active=True):
        self.email = email
        self.name = name
        self.is_active = is_active

    def __repr__(self):
        return f"User(email={self.email}, name={self.name})"


class UserService:
    """用户注册服务"""
    def __init__(self):
        self._users = {}  # 用字典存储用户，key 是邮箱

    def register(self, email: str, name: str) -> User:
        """注册用户，返回 User 对象"""
        if not email or "@" not in email:
            raise ValueError("邮箱格式无效")

        if email in self._users:
            raise DuplicateEmailError(f"邮箱 {email} 已被注册")

        user = User(email=email, name=name)
        self._users[email] = user
        return user

    def get_user(self, email: str) -> User:
        """根据邮箱查找用户"""
        return self._users.get(email)
```

```python
# ---------- 第三步：运行测试验证 ----------
# 终端执行: pytest tests/test_user_registration.py -v
#
# 输出:
# tests/test_user_registration.py::TestUserRegistration::test_register_new_user PASSED
# tests/test_user_registration.py::TestUserRegistration::test_register_duplicate_email_fails PASSED
# tests/test_user_registration.py::TestUserRegistration::test_register_empty_email_raises_error PASSED
# 3 passed ✅
#
# 测试全部通过！现在可以考虑"重构"（优化代码结构，但不改变行为）
```

**TDD 的节奏：**

```
写一个失败的测试 (Red)
  ↓
写最少代码让它通过 (Green)
  ↓
重构代码（让它更干净）(Refactor)
  ↓
重复...
```

### 示例2：Sprint 风格的增量开发

假设在做一个待办事项（Todo）应用，我们用敏捷的方式来逐步构建：

```python
# ---------- Sprint 1: 最简可运行的待办事项（1周） ----------
# todo_v1.py

class TodoApp:
    """最简版：能添加和查看待办事项"""
    def __init__(self):
        self._items = []

    def add(self, task: str) -> int:
        """添加待办事项，返回 ID"""
        item = {"id": len(self._items) + 1, "task": task, "done": False}
        self._items.append(item)
        return item["id"]

    def list_all(self) -> list:
        """列出所有待办事项"""
        return [f"[{'x' if i['done'] else ' '}] {i['task']}" for i in self._items]

    def complete(self, item_id: int) -> bool:
        """标记为已完成"""
        for item in self._items:
            if item["id"] == item_id:
                item["done"] = True
                return True
        return False


# 演示
if __name__ == "__main__":
    app = TodoApp()
    app.add("学 Python 基础")
    app.add("理解 TDD")
    app.add("写一个待办事项应用")
    app.complete(2)

    for line in app.list_all():
        print(line)

# 输出:
# [ ] 学 Python 基础
# [x] 理解 TDD          ← 已完成
# [ ] 写一个待办事项应用
```

```python
# ---------- Sprint 2: 增加优先级和截止日期（1周后） ----------
# todo_v2.py

from datetime import date

class TodoApp:
    """v2: 增加优先级 + 截止日期 + 筛选"""
    def __init__(self):
        self._items = []
        self._next_id = 1

    def add(self, task: str, priority: str = "中", due_date=None) -> int:
        """
        添加待办事项

        :param task:       任务描述
        :param priority:   优先级: '高', '中', '低'
        :param due_date:   截止日期, 可选
        :return:           任务 ID
        """
        item = {
            "id": self._next_id,
            "task": task,
            "done": False,
            "priority": priority,
            "due_date": due_date.isoformat() if due_date else None,
        }
        self._next_id += 1
        self._items.append(item)
        return item["id"]

    def list_all(self) -> list:
        """列出所有待办事项"""
        lines = []
        for i in self._items:
            status = "x" if i["done"] else " "
            priority_tag = f" [{i['priority']}]"
            date_tag = f" (截止: {i['due_date']})" if i["due_date"] else ""
            lines.append(f"[{status}]{priority_tag} {i['task']}{date_tag}")
        return lines

    def list_by_priority(self, priority: str) -> list:
        """按优先级筛选"""
        return [
            f"[{'x' if i['done'] else ' '}] {i['task']}"
            for i in self._items
            if i["priority"] == priority and not i["done"]
        ]

    def complete(self, item_id: int) -> bool:
        """标记为已完成"""
        for item in self._items:
            if item["id"] == item_id:
                item["done"] = True
                return True
        return False


# 演示 v2
if __name__ == "__main__":
    app = TodoApp()
    app.add("准备敏捷宣言笔记", priority="高", due_date=date(2026, 6, 14))
    app.add("学 Python 基础", priority="中")
    app.add("整理代码风格", priority="低")
    app.complete(1)

    print("=== 全部待办事项 ===")
    for line in app.list_all():
        print(line)

    print("\n=== 高优先级未完成 ===")
    for line in app.list_by_priority("高"):
        print(line)

# 输出:
# === 全部待办事项 ===
# [x][高] 准备敏捷宣言笔记 (截止: 2026-06-14)
# [ ][中] 学 Python 基础
# [ ][低] 整理代码风格
#
# === 高优先级未完成 ===
# (空 — 因为高优先级的那个已完成)
```

```python
# ---------- Sprint 3: 增加数据存储（持久化） ----------
# todo_v3.py

import json
from datetime import date
from pathlib import Path

class TodoApp:
    """v3: 增加文件持久化"""
    def __init__(self, data_file: str = "todos.json"):
        self._data_file = Path(data_file)
        self._items = []
        self._next_id = 1
        self._load()  # 启动时加载已有数据

    def _load(self):
        """从文件加载数据"""
        if self._data_file.exists():
            data = json.loads(self._data_file.read_text())
            self._items = data["items"]
            self._next_id = data["next_id"]

    def _save(self):
        """保存数据到文件"""
        data = {"items": self._items, "next_id": self._next_id}
        self._data_file.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    def add(self, task: str, priority: str = "中", due_date=None) -> int:
        item = {
            "id": self._next_id,
            "task": task,
            "done": False,
            "priority": priority,
            "due_date": due_date.isoformat() if due_date else None,
        }
        self._next_id += 1
        self._items.append(item)
        self._save()  # 每次修改都保存
        return item["id"]

    def list_all(self) -> list:
        lines = []
        for i in self._items:
            status = "x" if i["done"] else " "
            priority_tag = f" [{i['priority']}]"
            date_tag = f" (截止: {i['due_date']})" if i["due_date"] else ""
            lines.append(f"[{status}]{priority_tag} {i['task']}{date_tag}")
        return lines

    def complete(self, item_id: int) -> bool:
        for item in self._items:
            if item["id"] == item_id:
                item["done"] = True
                self._save()  # 每次修改都保存
                return True
        return False


if __name__ == "__main__":
    app = TodoApp()
    print("=== 全部待办事项 ===")
    for line in app.list_all():
        print(line)

# 数据持久化到 todos.json:
# {
#   "items": [
#     {
#       "id": 1,
#       "task": "准备敏捷宣言笔记",
#       "done": false,
#       "priority": "高",
#       "due_date": "2026-06-14"
#     }
#   ],
#   "next_id": 2
# }
```

**注意这个增量模式：**

```
Sprint 1 → 能用的基础功能（增、删、查）
     ↓
Sprint 2 → 在 Sprint 1 的基础上加优先级和筛选（不破坏已有功能）
     ↓
Sprint 3 → 在 Sprint 2 的基础上加持久化（不破坏已有功能）
     ↓
Sprint N → 继续迭代...
```

每一轮迭代结束，软件都是可运行、可演示的。

## 六、常见敏捷框架对比

| 框架 | 核心机制 | 适合场景 |
|---|---|---|
| **Scrum** | Sprint（2-4周冲刺）+ 每日站会 + 评审会 | 需求频繁变化的项目 |
| **Kanban（看板）** | 可视化工作流 + 限制在制品数量 | 持续交付、运维支持 |
| **XP（极限编程）** | TDD + 结对编程 + 持续集成 | 对质量要求高的项目 |

## 七、敏捷不是银弹

敏捷也有它的挑战和误区：

1. **敏捷 ≠ 没有计划** — 只是计划更灵活、更频繁地调整
2. **敏捷 ≠ 没有文档** — 文档要写，但要写有用的，别写没人看的
3. **敏捷 ≠ 随意开发** — 依然需要纪律、测试和技术优秀
4. **敏捷需要客户参与** — 如果客户不配合反馈，敏捷效果大打折扣
5. **敏捷适合需求不确定的项目** — 如果需求一开始就完全确定（如造火箭导航系统），瀑布可能更合适

## 八、学习资源

- 原始文献：[agilemanifesto.org](https://agilemanifesto.org/)
- 原始文献：[12条原则](https://agilemanifesto.org/principles.html)
- 《敏捷软件开发：原则、模式与实践》— Robert C. Martin
- 《Scrum精髓》— Jeff Sutherland

## 九、本章小结

敏捷的核心精神可以用一句话概括：**用最小的代价，尽快交付真正有价值的东西。**

它不是某个具体工具或方法论，而是一种思维方式——承认变化是常态，拥抱变化，用小步快跑代替宏大计划，用可运行的软件代替厚厚的文档。

对于零基础的初学者，理解这四条价值观和十二条原则，你就掌握了敏捷的骨架。剩下的实践部分，需要在实际项目中逐步体会。

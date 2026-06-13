---
title: My Take on AI Coding (2026)
来源: https://blog.zhengyi.com/posts/ai-coding-2026.html
日期: 2026-06-13
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

## 是什么

"AI Coding 2026" 是作者对其过去一年多来，使用 AI 工具完成编程全流程的真实总结。不是"AI 能不能写代码"的争论，而是"我用 AI 写代码的真实方式、踩过的坑、以及它已经改变了什么"。

日常类比：

- **2023 年的 AI 写代码**：像一个刚毕业的新人——能写简单的函数，但经常搞错需求，你需要逐行 Review。类比：你让一个实习生做 PPT，他做了，但每页都要你改。
- **2025-2026 年的 AI 写代码**：像一个有经验的同事——你告诉它"做什么"，它自己决定"怎么做"，做完还能跑测试、修 bug。类比：你让同事做 PPT，他做完你就直接拿去开会。

这篇文章的核心观点：**AI 编程已经进入了"你负责决策，AI 负责执行"的阶段。**

## 为什么重要

2024 年大家还在讨论"AI 会不会取代程序员"，到 2026 年，这个讨论已经变成了更实际的问题：

- 一个会用 AI 的"普通开发者"，产出已经接近一个不用 AI 的"好开发者"
- 编程的门槛从"语法会多少"变成了"你能不能把问题讲清楚"
- 编程的能力模型变了——从"手写每一行"变成"设计 + 审查 + 迭代"

## 核心概念

### 概念 1：编程角色从"写代码"变成了"审代码"

类比：过去厨师是"自己切菜、自己炒"，现在是"自己设计菜单、让 AI 做菜、你负责试吃"。你的核心能力变成了判断"这道菜对不对味"，而不是"这把刀怎么用"。

代码示例——过去你写一个 API 端点：

```javascript
// 2023：你必须自己写出每一行
app.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const posts = await Post.find({ author: user._id });
    return res.json({ user, posts });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});
```

现在你用 AI 写同一个端点——你只需要描述意图：

```
// 你告诉 AI：
"帮我写一个 GET /users/:id 端点，返回用户信息和该用户的所有帖子，
  404 时返回错误，出错时 500"
```

然后 AI 输出上面那段代码，你的任务是**读一遍、跑一下、确认正确**。

### 概念 2：Prompt 质量决定产出质量

类比：AI 编程就像你给外卖平台下订单——你说"随便来点好吃的"，它可能给你端来一碗冷饭；你说"要一份少辣的麻婆豆腐饭，不要香菜"，它就能给你对的。

**好的 AI 编程 Prompt = 明确的需求 + 足够的上下文 + 清晰的验收标准**

代码示例——差的 Prompt vs 好的 Prompt：

```
// 差的 Prompt（太模糊）
"帮我写个用户注册功能"

// 好的 Prompt（有上下文 + 约束 + 验收标准）
"帮我写一个用户注册 API 端点，用 Express + MongoDB。
要求：
1. 接收 { email, password, name }，用 Joi 做校验
2. 密码用 bcrypt 哈希，salt rounds = 10
3. 邮箱必须唯一，重复返回 409
4. 成功后返回 { id, email, name }，不返回密码
5. 写完之后写对应的单元测试"
```

第二个 Prompt 的产出质量远高于第一个，因为**它给了 AI 和你预期完全对齐的约束**。

### 概念 3：AI 编程的"审核循环"

AI 写的代码不是"写了就完了"，核心流程变成了：

```
提出需求 → AI 生成代码 → 你读代码 → 你跑测试 → 有问题？→ 告诉 AI 修 → 再读再跑
```

类比：就像设计师出方案，不是"A 方案好还是 B 方案好"那种拍脑袋，而是"让 AI 出方案，你拿着尺子量——这个间距不对、那个颜色偏了、这个交互少了个过渡"。

代码示例——你发现 AI 写的代码有个 bug，告诉它修：

```
// 你读代码后发现的问题：
"这个注册端点有个问题：Joi 校验通过之后，
  数据库插入之前没有再检查邮箱唯一性。
  两个请求同时进来都会通过校验，
  但数据库 unique index 只会拦下第二个，
  第一个会抛异常导致 500。
  请在 insert 之前加一个 findOne 检查。"
```

AI 会根据你的具体描述，自动修好这个问题。

## 实际案例演示

下面用一个完整的例子，展示 2026 年用 AI 编程的典型流程。

### 需求：写一个待办事项 API

**第 1 步：描述需求**

```
帮我写一个 RESTful 待办事项 API，用 Express + MongoDB：
- POST /todos 创建待办（字段：title, completed 默认 false）
- GET /todos 列出所有待办
- PATCH /todos/:id 修改 completed 状态
- DELETE /todos/:id 删除待办
- 用 async/await，做好错误处理
- 写完单元测试
```

**第 2 步：AI 生成代码**

AI 会输出完整的代码，包括：

```javascript
// models/Todo.js
const mongoose = require('mongoose');

const todoSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  completed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Todo', todoSchema);
```

```javascript
// routes/todos.js
const express = require('express');
const router = express.Router();
const Todo = require('../models/Todo');

// POST /todos
router.post('/', async (req, res) => {
  try {
    const todo = await Todo.create({ title: req.body.title });
    res.status(201).json(todo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /todos
router.get('/', async (req, res) => {
  try {
    const todos = await Todo.find().sort({ createdAt: -1 });
    res.json(todos);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /todos/:id
router.patch('/:id', async (req, res) => {
  try {
    const todo = await Todo.findByIdAndUpdate(
      req.params.id,
      { completed: req.body.completed },
      { new: true, runValidators: true }
    );
    if (!todo) return res.status(404).json({ error: 'Not found' });
    res.json(todo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /todos/:id
router.delete('/:id', async (req, res) => {
  try {
    const todo = await Todo.findByIdAndDelete(req.params.id);
    if (!todo) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
```

**第 3 步：你审核 + 跑测试**

```bash
# 你做的事情
$ npm test
# 发现测试挂了 → 告诉 AI 修 → AI 自动修好 → 再跑
```

**第 4 步：迭代完善**

```
// 你继续提需求：
"再帮我加一个功能：GET /todos?completed=false 可以只查未完成的"
```

AI 自动在查询路由里加上过滤逻辑。

## 踩过的坑

作者分享了几条实战教训：

1. **AI 会"自信地犯错"**——它生成的代码看起来没问题，但可能有逻辑漏洞。所以"读代码"的能力依然重要，只是从"逐行写"变成了"逐行审"。

2. **上下文窗口不够时，要学会拆分**——一个 200 行的文件，你让它"重构"，它可能顾此失彼。拆成小块："先改 A 函数"、"再改 B 函数"，效果更好。

3. **不要一次性让它改太多**——"帮我把整个项目从 JS 迁移到 TS"这种需求，AI 会乱。改成"先帮我配好 tsconfig，再把 utils/ 目录迁移过来，跑完测试确认没挂"，一步一步来。

4. **测试是 AI 编程的锚点**——没有测试的情况下，你很难判断 AI 改坏了什么。有测试时，AI 修改之后跑一遍，有问题它自己就能修。

## 对我学习编程的影响

作为一个零基础学习者，这个转变意味着：

- **不必从语法记忆开始**——你不需要记住所有 API 用法，AI 可以帮你查、帮你写
- **但你需要学会"问对问题"**——能把"我要做一个 X"拆成"第一步做 A、第二步做 B"，这比背语法重要得多
- **读代码的能力会越来越重要**——虽然你可能不手写每一行，但你需要判断 AI 写的对不对、好不好
- **编程变成了"设计 + 沟通 + 审核"**——你的价值不在于打字多快，而在于理解问题、拆解问题、判断方案

类比总结：

> 以前学编程像学开车——要记离合器的位置、方向盘的转角、刹车的力度。
> 现在学编程像学坐出租车——你只需要说"去机场"，司机（AI）知道怎么走，你的任务是确认"方向对吗"、"这是最快路线吗"。

但别忘了：如果你永远不学怎么开车，你就永远只能坐出租车。所以**理解基本的编程概念依然重要**——只是你不再需要每次都自己握方向盘。

## 一句话总结

**2026 年的 AI 编程，核心能力不再是"你会不会写"，而是"你能不能说出你想要什么，并且判断 AI 给的是不是对的"。**

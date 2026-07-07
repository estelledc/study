---
title: Aider — 终端 AI 结对编程 CLI
来源: 'https://github.com/Aider-AI/aider'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

Aider 是一个在终端里运行的 AI 结对编程工具：你把它带进 git 仓库，告诉它要改什么文件，它会读上下文、生成补丁、应用修改，并把结果提交成一条 git commit。

日常类比：像请一位同事坐在你旁边改代码。你不用把整个项目念给他听，只要指给他关键文件、说清目标；他会先看地图，再动手改，改完还把每一步放进版本历史。

最小例子是这样：

```bash
cd my-app
aider app.py
```

然后在 `aider>` 里说：

```text
add a /health endpoint that returns ok
```

这和普通聊天机器人的区别在于：普通聊天给你一段代码让你复制，Aider 直接在本地仓库里编辑文件，并让 git 负责回看、撤销和拆分变化。

## 为什么重要

不理解 Aider，下面这些事很容易做得又慢又乱：

- 你会把代码贴进网页聊天，再把答案手动复制回来，漏掉 import、路径和测试失败。
- 你会让模型一次看太多无关文件，结果上下文变贵，回答也更容易跑偏。
- 你会把 AI 改动和自己的手改混在一起，出了问题不知道该回滚哪一部分。
- 你会只把它当“代码生成器”，错过“读仓库、改仓库、跑测试、留提交”的完整工作流。

## 核心要点

1. **文件进入聊天**：Aider 只直接编辑被加入会话的文件。类比：修理师傅先拿到要修的零件，才不会误拆整台机器。

2. **仓库地图补上下文**：它会为整个 git 仓库建立 repo map，挑出重要文件、类、函数签名给模型看。类比：看城市地图先知道主干路，再决定要不要进某条小巷。

3. **每次改动可追踪**：Aider 和 git 绑得很紧，改完会生成 commit，也提供 `/diff`、`/undo`、`/commit` 等命令。类比：做实验每一步都拍照，失败时能退回上一张。

## 实践案例

### 案例 1：从空文件做一个 Flask 小服务

官方示例里，用户先让 Aider 管理一个空的 `app.py`：

```bash
aider app.py
```

随后提出需求：

```text
make a flask app with a /hello endpoint that returns hello world
add an endpoint like /add/3/5 which returns the sum
add /fibonacci/X
remove the hello endpoint
```

对应的代码形态会逐步长成这样：

```python
@app.route("/add/<int:a>/<int:b>")
def add(a, b):
    return str(a + b)
```

逐部分解释：

- `aider app.py` 把文件加入会话，Aider 可以创建或修改它。
- 每句需求都很短，但目标具体：新增路由、参数、返回值。
- 每轮修改都会形成 diff 和 commit，所以“加路由”和“删路由”不是混成一坨。

### 案例 2：在 2048 游戏里改一处得分规则

官方示例还改过一个开源 2048 游戏。用户先进入项目，再启动 Aider：

```bash
git clone https://github.com/gabrielecirulli/2048
cd 2048
aider
```

用户问“得分怎么算”，模型判断需要看 `js/game_manager.js`，Aider 征得同意后把文件加入会话。后续需求是：合并方块时，10% 概率给 10 倍得分奖励。

核心变化可以简化成：

```js
const bonus = Math.random() <= 0.1 ? 10 : 1;
score += merged.value * bonus;
```

逐部分解释：

- 先问机制，再提修改，避免在不懂代码位置时硬改。
- Aider 不是一开始就吞全仓库，而是按需要添加相关文件。
- 这个案例适合小改动：目标明确、影响集中、可以用 git diff 快速复查。

### 案例 3：多文件测试重构和错误回灌

官方复杂示例里，用户想把测试里的空输入改成 `prompt_toolkit` 的 mock 输入。启动时直接指定两个文件：

```bash
aider tests/test_main.py aider/getinput.py
```

第一次改完后测试失败，用户把错误贴回会话：

```text
FAILED tests/test_main.py::TestMain::test_main_with_empty_git_dir_new_file
TypeError: main() got an unexpected keyword argument 'input'
```

随后再加入 `aider/main.py`：

```text
/add aider/main.py
```

逐部分解释：

- 多文件任务不是一次“神来之笔”，而是改、跑、报错、再改的循环。
- 错误信息是很高价值的上下文，贴回去比泛泛说“坏了”有效得多。
- `/add` 可以在中途扩大会话范围，让模型看到真正需要改的入口函数。

## 踩过的坑

1. **把全仓库都加进聊天**：文件越多不一定越聪明，很多无关上下文会分散模型注意力，也会增加 token 成本。

2. **没把脏改动先分开**：仓库里已有未提交改动时，要先确认哪些是人的改动，哪些是 AI 改动，否则回滚会很痛。

3. **只让它写，不让它跑测试**：没有 `/test` 或 `--auto-test`，Aider 可能把语法改对了，却没发现行为坏了。

4. **把它当成完全自主代理**：Aider 擅长在明确边界内改代码，但需求、验收标准和风险判断仍然要由人把关。

## 适用 vs 不适用场景

**适用**：

- 已经是 git 仓库，且你希望每次 AI 修改都能 diff、commit、undo。
- 需求能落到具体文件或小范围模块，例如加路由、补测试、改 CLI 参数。
- 你愿意提供失败日志、测试命令和人工复查，让模型在反馈里迭代。
- 想在终端工作，不想频繁复制代码到网页聊天窗口。

**不适用**：

- 没有版本控制、也不打算让工具写入本地文件的场景。
- 需求本身还很模糊，只是想做产品方向探索或长篇方案讨论。
- 超大仓库里一次跨很多系统改动，且没有清晰测试和拆分策略。
- 涉及密钥、隐私数据或不能发给外部模型的代码上下文。

## 历史小故事（可跳过）

- **2023 年前后**：生成式编程工具从“网页聊天给代码”转向“工具直接改仓库”，Aider 属于终端派代表。
- **项目作者 Paul Gauthier**：围绕 git、repo map、diff edit format、模型基准持续打磨工作流。
- **社区演化**：README 从“会改代码”扩展到多模型、图片网页上下文、语音、lint/test、IDE 使用等能力。
- **到 2026 年 7 月**：GitHub 页面显示约 47k stars，比候选池里的约 36k 又涨了一截，说明终端 AI 编程仍在快速扩散。

## 学到什么

- AI 编程工具的关键不只是“会生成代码”，而是能不能和现有仓库、测试、版本历史接上。
- Aider 的核心策略是少量显式文件 + 仓库地图，而不是把所有文件一股脑塞进上下文。
- git commit 是安全绳：每轮 AI 修改都可复查、可撤销、可拆分。
- 真正好用的姿势是人给边界和验收，Aider 负责在边界内快速试改。

## 延伸阅读

- 官方主页：[Aider GitHub README](https://github.com/Aider-AI/aider)
- 使用文档：[Usage](https://aider.chat/docs/usage.html)
- 机制文档：[Repository map](https://aider.chat/docs/repomap.html)
- 工作流文档：[Git integration](https://aider.chat/docs/git.html)
- 案例文档：[Example chat transcripts](https://aider.chat/docs/usage.html#example-chat-transcripts)
- [[claude-code]] —— 同样面向“让 AI 在代码库里干活”，但产品边界和交互方式不同。

## 关联

- [[claude-code]] —— 另一个代码库级 AI 编程助手，适合对比终端代理工作流。
- [[openai-agents-sdk]] —— Aider 是具体工具，Agents SDK 更像搭建代理应用的积木。
- [[continue]] —— IDE 内 AI 编程助手，和 Aider 的终端工作流互补。
- [[shell-gpt]] —— 同在终端里使用 LLM，但更偏通用命令行问答。
- [[gitui]] —— Aider 改完代码后，仍可以用 TUI 工具审查 git 历史。
- [[lazygit]] —— 用图形化终端界面检查 Aider 生成的 commit 很顺手。
- [[ripgrep]] —— 定位代码位置时常和 Aider 搭配，先搜清楚再让 AI 改。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

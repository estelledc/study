---
title: "从零开始学编程：解读 Build Your Own X"
来源: "https://github.com/codecrafters-io/build-your-own-x"
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

# 从零开始学编程：解读 Build Your Own X

## 什么是 Build Your Own X？

想象一下，你每天用着微信聊天、用浏览器上网、用 Git 管理代码。你觉得这些工具很神奇，但你从没想过它们是怎么被制造出来的。

Build Your Own X（简称 BYOX）就是一个巨大的教程目录库，里面收集了成百上千篇手把手教程，教你**从零开始**重新发明这些你每天都在用的技术。

它的座右铭来自物理学家费曼的一句话：

> "What I cannot create, I do not understand."（我不能创造的，我就不真正理解。）

这个仓库由 codecrafters.io 创建，目前已有超过 50 万个星标，是全世界编程学习者最知名的学习资源之一。

## 核心概念：为什么"再造轮子"有用？

### 类比你最熟悉的东西：做菜

想象你天天吃红烧肉。你知道它好吃，但如果你从来没下过厨，你就永远不会明白：

- 为什么肉要先焯水
- 糖和酱油的比例为什么重要
- 火候是怎么影响口感的

**看懂菜谱（阅读别人的代码）和能做出一道菜（自己写出代码）是两回事。**

BYOX 的做法就是让你亲自做一遍：不是直接用 Git，而是自己写一个迷你版的 Git；不是直接用 Python，而是自己写一个能运行简单代码的 Python 解释器。

### 三条学习原则

**第一条：从"会用"到"会造"**

很多人学编程停留在"能跑通教程代码"的阶段，但一旦关掉教程就不会写了。BYOX 强制你离开"使用"的舒适区，进入"创造"的挑战区。

**第二条：每门技术都能被拆解**

无论是操作系统、数据库、还是神经网络，这些看似高深的东西，本质上都是几十到几千行代码的组合。BYOX 的每个教程都帮你把大系统拆成小步骤。

**第三条：选一条适合你的路**

BYOX 按技术领域分类（见下文），每个领域下有多个语言版本。你是 JavaScript 初学者？那就从"用 JavaScript 写一个 Web 服务器"开始，不要一上来就"用 C 写一个操作系统"。

## BYOX 的主要分类

BYOX 涵盖的技术领域非常广，以下是从零基础学习者角度的分层建议：

**入门友好（几百行代码就能完成）：**

- 命令行工具（Command-Line Tool） — 写一个自己的 ls 或 grep
- 模板引擎（Template Engine） — 写一个类似 JSX 的模板系统
- 正则表达式引擎（Regex Engine） — 理解模式匹配的本质
- Web 服务器（Web Server） — 用 Node.js 处理 HTTP 请求
- Git（迷你版 Gitlet） — 理解版本控制的底层原理

**中等难度（需要一定编程基础）：**

- 数据库（Database） — 写一个键值存储
- 前端框架（Front-end Framework） — 自己实现一个迷你 React
- 神经网络（Neural Network） — 从零实现一个能识别数字的网络
- Shell — 写一个能运行命令的终端

**高阶挑战（需要系统级知识）：**

- 操作系统（Operating System） — 从引导扇区开始
- 编程语言（Programming Language） — 设计语法、写编译器
- 虚拟机 / 模拟器（Emulator / Virtual Machine） — 模拟 Game Boy 硬件

## 两个代码示例

### 示例一：一个迷你版 Git（Gitlet）

这个 JavaScript 实现的迷你 Git，帮你理解版本控制的核心机制：

```javascript
// 一个超简单的版本控制系统，只有 50 行核心代码
const fs = require('fs');
const path = require('path');

class MiniGit {
  constructor(repoPath) {
    this.repo = repoPath;
    this.history = [];
    this.init();
  }

  // 初始化一个仓库 — 和 git init 一样
  init() {
    const dir = path.join(this.repo, '.minigit');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
      console.log('初始化了空的迷你 Git 仓库');
    }
  }

  // 提交一个快照 — 和 git commit 一样
  commit(message) {
    const snapshot = {
      message: message,
      files: this.getFileSystemSnapshot(),
      timestamp: Date.now()
    };

    this.history.push(snapshot);
    const file = path.join(this.repo, '.minigit', `commit-${this.history.length}`);
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
    console.log(`已提交: ${message}`);
  }

  // 获取当前文件系统的快照
  getFileSystemSnapshot() {
    const snapshot = {};
    const files = fs.readdirSync(this.repo);
    for (const file of files) {
      if (file === '.minigit') continue;
      const fullPath = path.join(this.repo, file);
      if (fs.statSync(fullPath).isFile()) {
        snapshot[file] = fs.readFileSync(fullPath, 'utf-8');
      }
    }
    return snapshot;
  }

  // 查看提交历史 — 和 git log 一样
  log() {
    this.history.forEach((entry, index) => {
      console.log(`[提交 #${index + 1}] ${entry.message} (${new Date(entry.timestamp).toLocaleString()})`);
    });
  }
}

// 使用示例：
// const repo = new MiniGit('./my-project');
// fs.writeFileSync('./my-project/hello.txt', '你好世界');
// repo.commit('第一次提交');
// fs.writeFileSync('./my-project/hello.txt', '你好世界 v2');
// repo.commit('更新内容');
// repo.log();
```

这段代码做的事情其实很简单：每次你运行 `commit`，它就把项目里所有文件的内容存成一个快照。这就是 Git 最核心的思想——**保存快照，而非记录差异**。

### 示例二：一个迷你版正则表达式引擎

正则表达式是你每天都在用的，但你可能不知道它背后的核心逻辑有多简洁：

```python
# 一个超简单的正则匹配器，只支持 .（任意字符）和 *（零次或多次）
# 和 re 模块的 a.b*c 等价

def match_here(regex, text):
    """从当前位置尝试匹配正则表达式"""
    if not regex:
        return True  # 正则式匹配完了，成功

    if len(regex) >= 2 and regex[1] == '*':
        # 处理 a* 的情况：零次或多次匹配
        char = regex[0]
        rest = regex[2:]
        # 尝试零次匹配
        if match_here(rest, text):
            return True
        # 尝试多次匹配：只要当前字符符合，就消耗一个继续匹配
        if (char == '.' or char == text[0]) and len(text) > 0:
            return match_here(regex, text[1:])

    # 没有 *，普通字符匹配
    if len(text) > 0 and (regex[0] == '.' or regex[0] == text[0]):
        return match_here(regex[1:], text[1:])

    return False  # 匹配失败

def match_regex(pattern, text):
    """尝试在整个文本中匹配正则表达式"""
    if match_here(pattern, text):
        return True
    # 从文本的每个位置尝试匹配
    for i in range(len(text)):
        if match_here(pattern, text[i+1:]):
            return True
    return False

# 使用示例：
# print(match_regex("a.c", "abc"))    # True — a后面任意字符再跟c
# print(match_regex("ab*c", "ac"))    # True — b出现零次
# print(match_regex("ab*c", "abbbc")) # True — b出现三次
# print(match_regex("a.b*c", "aabbbc")) # True — 组合使用
```

这个 25 行的 Python 函数就是整个正则表达式引擎的核心。你可能每天都在用正则，但这段代码展示了：**正则匹配的底层就是一个递归的回溯过程**。

## 给零基础学习者的建议

**第一步：先学一门语言的基础语法。** 不要一上来就"造"任何东西。先用 Python 或 JavaScript 完成基础教程：变量、循环、函数、条件判断。这需要 1-2 周。

**第二步：从"命令行工具"或"模板引擎"入门。** 这两个领域的教程代码量少、反馈快。你写几行代码就能看到结果，不会有挫败感。

**第三步：找一个你最常用的工具，挑战自己。** 你用 Git 吗？读一读 Gitlet 的教程。你用浏览器吗？看看"从零构建浏览器"的教程。当你知道自己每天都在用什么，学习就会更有动力。

**第四步：不要追求一步到位。** BYOX 的教程里有很多"一千行代码的操作系统"，但你不需要一口气写完。看懂每一步在做什么，比跑通全部代码更重要。

## 总结

BYOX 的价值不在于让你真的去重写一个操作系统或浏览器。它的价值在于：

- 把**黑盒**变成**透明**：你不再只是工具的用户，而是理解工具如何工作
- 把**抽象**变成**具体**：每个复杂概念都被拆成了你能理解的小步骤
- 把**被动学习**变成**主动创造**：你不再跟着教程敲代码，而是在"造东西"

费曼说得对：你能创造它，你才真正理解它。

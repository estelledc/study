---
title: xonsh — 在同一行里同时写 bash 命令和 Python 代码
来源: https://github.com/xonsh/xonsh
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 入门
---

## 是什么

xonsh（读作 "conch"，海螺）是一个**用 Python 写、让你在 shell 里直接混用 bash 命令和 Python 表达式**的 shell。日常类比：bash 是只懂中文的厨师，Python 是只懂英文的厨师，平时你得用两本菜谱来回切；xonsh 是同时懂两种语言的厨师，一句话里中英文混着说，他都听得懂。

具体看一行：

```xonsh
for f in `.*\.log$`:
    print(f, $(wc -l @(f)).split()[0])
```

`` `.*\.log$` `` 是 xonsh 的正则文件 glob，返回一个 Python 列表；`for f in ...` 是标准 Python；`$(wc -l @(f))` 在 subprocess 模式下跑 `wc -l`，`@(f)` 把 Python 变量 `f` 塞回命令行；`.split()[0]` 又回到 Python。**一行里两种语言来回穿插**。

这就是 xonsh 想推的核心：**shell 该有的东西不丢，Python 该有的东西也不丢**。

## 为什么重要

不学 xonsh 也不影响干活，但理解它能让你看清三件事：

- **shell 和编程语言可以不分家** —— 你写 bash 脚本到第 30 行总会想"要是能直接用 Python 的字典/列表多好"，xonsh 让你不用切语言
- **Python 已经事实上是运维语言** —— pip 装的工具、ML 训练脚本、k8s operator 都是 Python，shell 直接会 Python 等于零摩擦调它们
- **shell 的语法可以重新设计** —— xonsh 不像 bash 加补丁，它把 Python 语法当主干，bash 风格的部分用 `$()` `!()` `@()` 三个标记融进去

如果你日常 `python -c "..."` 或写一堆 `subprocess.run(...)` 的小脚本，xonsh 的卖点就是**这些直接变成命令行交互**。

## 核心要点

xonsh 的设计可以拆成 **三块**：

1. **双模式自动切换**：同一行里 `ls -la` 是 subprocess 模式（按 bash 风格跑外部命令），`x = [1, 2, 3]` 是 python 模式（按 Python 跑）。**靠词法上下文判断**，不用前缀。

2. **三个特殊标记把两边接起来**：
   - `$VAR` 读环境变量（也是 Python dict 的一员，可以 `$PATH.append(...)`）
   - `$(cmd)` 跑命令、捕获 stdout 字符串（像 bash 的 `$()`）
   - `!(cmd)` 跑命令、捕获完整 CompletedCommand 对象（含 returncode、stderr）
   - `@(py_expr)` 把 Python 表达式的值塞进命令行参数

3. **rc 文件就是 Python 文件**：`~/.xonshrc` 是 `.xsh` 文件，可以 `import` 任何包、写函数、定义别名。配置和脚本同一种语言。

加上一个故意的设计：**不兼容 POSIX**。老的 `.sh` 脚本要跑得用 `bash old.sh` 显式调 bash——这点和 fish、nushell 同源。

## 实践案例

### 案例 1：bash 和 Python 在一行里穿插

```xonsh
files = $(ls *.txt).split()
for f in files:
    if 'TODO' in $(cat @(f)):
        print(f'{f} 还有 TODO')
```

**逐部分解释**：

- `$(ls *.txt)` 是 subprocess 模式，跑 `ls` 拿到一个字符串
- `.split()` 是 Python 字符串方法，拆成列表
- `for f in files:` 是 Python 循环
- `$(cat @(f))` 又跳回 subprocess，`@(f)` 把当前 `f` 这个 Python 变量塞回命令行
- `f'{f} ...'` 是 Python 3.6 的 f-string

bash 等价要 `for f in *.txt; do grep -l TODO "$f" && echo "$f 还有 TODO"; done`——能写但拼接性差，复杂逻辑就崩。

### 案例 2：环境变量当成 Python 字典用

```xonsh
$PATH.append('/usr/local/bin')
$EDITOR = 'vim'
del $LESS
```

**逐部分解释**：

- `$PATH` 不是字符串而是一个 list-like 对象，直接 `append` 不用 `:` 拼
- `$EDITOR = 'vim'` 是 Python 赋值
- `del $LESS` 是 Python 的 del 语句，把环境变量删掉

bash 里要 `export PATH="$PATH:/usr/local/bin"`，要会引号、冒号、export 三件事。xonsh 把环境当 Python 对象。

### 案例 3：用 Python 包写别名

```xonsh
import json

def _pretty_json(args):
    with open(args[0]) as f:
        data = json.load(f)
    print(json.dumps(data, indent=2, ensure_ascii=False))

aliases['pj'] = _pretty_json
```

**逐部分解释**：

- 直接 `import json`——shell 里能 import
- 别名是一个 Python 函数，不是字符串
- `aliases['pj'] = _pretty_json` 把它绑成 `pj` 命令

之后 shell 里输 `pj data.json` 就漂亮打印 JSON。bash 实现等价功能要写 `function pj() { python -c "..." }` 嵌套引号地狱。

## 踩过的坑

1. **启动慢**：每次开 shell 都要把 Python 解释器拉起来 + import xonsh 自身，冷启动 100-200ms。bash 是 5-10ms。频繁开新 shell 的场景（tmux 大量开 pane）会感受到。

2. **生态远小于 bash/zsh**：oh-my-zsh、starship 这些主流 prompt 框架是 zsh 优先，xonsh 有 xontrib 系统但插件数量是数量级差距。

3. **Python 表达式和 subprocess 边界容易混**：`ls -la` 是 subprocess，但 `ls` 单独写就被解析成 Python 名字。新人常踩。**保险写法**：subprocess 命令始终带参数或加 `!()` 包起来。

4. **CI/Docker 场景几乎不用**：Dockerfile 的 `RUN` 默认 `/bin/sh`，安装 xonsh 反而拖慢 image build。xonsh 主要是**交互 shell + 个人脚本**，不替代 `/bin/sh`。

## 适用 vs 不适用场景

**适用**：

- 写 50-200 行的运维小脚本，一半 bash 命令、一半 Python 数据处理
- 已经精通 Python，不想再为 bash 学一套引号/分词/数组规则
- ML/数据工程师，平时 90% 工作在 Python，shell 偶尔一用

**不适用**：

- 给别人发的 install.sh / Dockerfile / Makefile（必须 POSIX）
- 极致快速冷启动场景（频繁开新 shell）
- 团队里同事不会 Python（脚本读不懂）

## 学到什么

1. **shell 的语法可以从一门通用语言长出来**：bash 是为命令行从零设计；xonsh 反过来，把 Python 当主干、命令行风格当扩展。两条路都成立，选哪条看你团队的语言重心。

2. **"同一行混两种语言"是真正的 win**：传统 shell 脚本到第 50 行总会想换 Python，但又懒得改文件类型。xonsh 让这个切换不存在——一行里随时切。

3. **故意不兼容 POSIX 的代价和收益**：fish、nushell、xonsh 都选了不兼容。代价是老脚本跑不了，收益是新设计不被 1973 年的妥协绑住。这一代 shell 工具的共同信念。

## 延伸阅读

- 官网：[xon.sh](https://xon.sh/)（左侧 Tutorial 是入门最快的路径，比 GitHub README 详）
- xontrib（插件）目录：[xontrib-index](https://github.com/xonsh/xontrib-index)——看生态大小直接看这个
- 对比阅读：xonsh 文档里的 [Bash to Xonsh Translation Guide](https://xon.sh/bash_to_xsh.html)，把常见 bash 习惯一对一翻译

## 关联

- [[nushell]] —— 同样故意不兼容 POSIX 的现代 shell，但 nushell 走结构化 pipeline 路线，xonsh 走"shell + Python 同源"路线
- [[fish]] —— 也是反 POSIX 阵营，但 fish 自创语法，xonsh 复用 Python 语法
- [[ipython]] —— Python 交互式环境，但不是 shell，不能直接 `ls -la` 跑 subprocess

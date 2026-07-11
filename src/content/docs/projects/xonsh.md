---
title: xonsh — 在同一行里同时写 bash 命令和 Python 代码
来源: https://github.com/xonsh/xonsh
日期: 2026-05-31
分类: 命令行工具
难度: 入门
---

## 是什么

xonsh（读作 "conch"，海螺）是一个**用 Python 写、让你在 shell 里直接混用 bash 命令和 Python 表达式**的 shell。日常类比：bash 是只懂中文的厨师，Python 是只懂英文的厨师，平时你得用两本菜谱来回切；xonsh 是同时懂两种语言的厨师，一句话里中英文混着说，他都听得懂。

具体看一行：

```xonsh
for f in `.*\.log$`:
    print(f, $(wc -l @(f)).split()[0])
```

`` `.*\.log$` `` 是 xonsh 的正则文件 glob，返回 Python 列表；`for f in ...` 是标准 Python；`$(wc -l @(f))` 跑外部命令 `wc -l`，`@(f)` 把变量 `f` 塞回命令行；`.split()[0]` 又回到 Python。**一行里两种语言来回穿插**。

这就是 xonsh 想推的核心：**shell 该有的东西不丢，Python 该有的东西也不丢**。

## 为什么重要

不学 xonsh 也不影响干活，但理解它能让你看清四件事：

- **shell 和编程语言可以不分家** —— bash 脚本写到第 30 行总会想"要是能直接用字典/列表多好"，xonsh 让你不用切语言
- **Python 已经事实上是运维语言** —— pip 工具、ML 脚本、k8s operator 多是 Python，shell 直接会 Python 等于零摩擦调它们
- **shell 的语法可以重新设计** —— 它把 Python 当主干，bash 风格用 `$()` `!()` `@()` 三个标记融进去，不是给 bash 打补丁
- **交互 REPL 能替代 `python -c` / `subprocess` 样板** —— 那些一次性小脚本直接变成命令行里的一行

## 核心要点

xonsh 的设计可以拆成 **三块**：

1. **双模式自动切换**：`ls -la` 按外部命令跑，`x = [1, 2, 3]` 按 Python 跑。**靠这句话更像「命令」还是更像「赋值」来判断**（术语叫词法上下文），不用加前缀。

2. **三个特殊标记把两边接起来**：
   - `$VAR` 读环境变量（也是 Python dict，可 `$PATH.append(...)`）
   - `$(cmd)` 跑命令、捕获 stdout 字符串
   - `!(cmd)` 跑命令、拿到完整结果对象（含退出码、stderr；文档叫 CompletedCommand）
   - `@(py_expr)` 把 Python 表达式的值塞进命令行参数

3. **rc 文件就是 Python 文件**：`~/.xonshrc` 可 `import` 任何包、写函数、定义别名。配置和脚本同一种语言。

故意的设计：**不兼容 POSIX**（老 `.sh` 要用 `bash old.sh` 显式调）——和 fish、nushell 同源。

## 实践案例

### 案例 1：bash 和 Python 在一行里穿插

```xonsh
files = g`*.txt`   # 教学写法：用 glob，避免 ls+split 遇空格文件名碎掉
for f in files:
    if 'TODO' in $(cat @(f)):
        print(f'{f} 还有 TODO')
```

**逐部分解释**：

- `` g`*.txt` `` 是 xonsh 的 glob，直接得到路径列表（文件名无空格时 `$(ls *.txt).split()` 也能跑，但不推荐）
- `for f in files:` 是 Python 循环
- `$(cat @(f))` 跳回外部命令，`@(f)` 把当前 `f` 塞回命令行
- `f'{f} ...'` 是 Python f-string

bash 等价要 `for f in *.txt; do grep -l TODO "$f" && echo "$f 还有 TODO"; done`——能写但拼接性差，复杂逻辑就崩。

### 案例 2：环境变量当成 Python 字典用

```xonsh
$PATH.append('/usr/local/bin')
$EDITOR = 'vim'
del $LESS
```

**逐部分解释**：

- `$PATH` 不是字符串而是 list-like，直接 `append`，不用 `:` 拼
- `$EDITOR = 'vim'` 是 Python 赋值
- `del $LESS` 是 Python 的 `del`，把环境变量删掉

bash 里要 `export PATH="$PATH:/usr/local/bin"`，要会引号、冒号、`export` 三件事。xonsh 把环境当 Python 对象。

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

之后 shell 里输 `pj data.json` 就漂亮打印 JSON。bash 实现等价功能常陷入 `python -c "..."` 嵌套引号地狱。

## 踩过的坑

1. **启动慢**：每次开 shell 都要拉起 Python + import xonsh，冷启动量级约 100-200ms（bash 量级约 5-10ms）。tmux 大量开 pane 会感受到。
2. **生态远小于 bash/zsh**：oh-my-zsh、starship 优先 zsh；xonsh 有 xontrib，但插件数量级差距大。
3. **Python 名和外部命令边界易混**：`ls -la` 是命令，单独写 `ls` 可能被当成 Python 名字。**保险写法**：始终带参数，或用 `!ls` / `which ls`。
4. **CI/Docker 几乎不用**：Dockerfile 的 `RUN` 默认 `/bin/sh`；xonsh 主要是**交互 shell + 个人脚本**。

## 适用 vs 不适用场景

**适用**：

- 写 50-200 行运维小脚本，一半命令、一半 Python 数据处理
- 已精通 Python，不想再学 bash 引号/分词/数组
- ML/数据工程师，平时 90% 在 Python，shell 偶尔一用

**不适用**：

- 给别人发的 install.sh / Dockerfile / Makefile（必须 POSIX）
- 极致快速冷启动（频繁开新 shell）
- 团队同事不会 Python（脚本读不懂）

## 历史小故事（可跳过）

- 2015-03：Anthony Scopatz 发布 xonsh 0.1.0——写书讲 Bash 时觉得「连加法都别扭」，决定用 Python 重做 shell
- 灵感来自「shell 该贴合大脑」：复杂管道能写，基础控制流却像另一门外语
- 之后社区把 xontrib 插件体系、跨平台（含 Windows）一路补齐，定位成 Python 用户的日常 shell

## 学到什么

1. **shell 语法可以从一门通用语言长出来**：bash 从零设计命令行；xonsh 反过来，Python 当主干、命令行当扩展。两条路都成立，选哪条看团队语言重心。
2. **"同一行混两种语言"是真正的 win**：传统脚本到第 50 行想换 Python 又懒得改文件类型；xonsh 让这个切换不存在——一行里随时切。
3. **故意不兼容 POSIX 的代价和收益**：fish、nushell、xonsh 都选了不兼容。代价是老脚本跑不了，收益是新设计不被 1973 年的妥协绑住。

## 延伸阅读

- 官网 Tutorial：[xon.sh](https://xon.sh/)（比 GitHub README 更适合入门）
- Bash 对照：[Bash to Xonsh Translation Guide](https://xon.sh/bash_to_xsh.html)
- 插件目录：[xontrib-index](https://github.com/xonsh/xontrib-index)
- FAQ 起源故事：[Why xonsh?](https://xon.sh/faq.html)
- [[nushell]] —— 另一条「反 POSIX」现代 shell 路线

## 关联

- [[nushell]] —— 同样故意不兼容 POSIX，但走结构化 pipeline，xonsh 走「shell + Python 同源」
- [[fish]] —— 也是反 POSIX，但自创语法；xonsh 复用 Python
- [[zsh]] —— 兼容 bash 的主流交互 shell，生态最大；xonsh 用 Python 换生态
- [[starship]] —— 跨 shell 的 prompt；xonsh 也能接，但社区默认仍偏 zsh/fish
- [[shellcheck]] —— 静态检查 POSIX/bash 脚本；xonsh 脚本不在它的目标里

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

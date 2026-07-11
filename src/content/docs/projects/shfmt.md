---
title: shfmt — Shell 脚本的 gofmt（用 Go 写的统一格式化器）
来源: https://github.com/mvdan/sh
日期: 2026-05-31
分类: 命令行工具
难度: 中级
---

## 是什么

shfmt 是**给 shell 脚本做统一格式化**的工具，作者 Daniel Martí 用 Go 写。日常类比：以前每个写 shell 的人都有自己的缩进喜好，2 空格、4 空格、Tab 各占山头；shfmt 像团队里来了个**专门管文件夹标签的助理**，所有人交上来的纸都按一种格式重新打印一遍。

你只要写一行：

```bash
shfmt -i 2 -w deploy.sh
```

就把 `deploy.sh` 按 2 空格缩进重写。支持 **POSIX sh / Bash / mksh / bats**，以及 **实验性 zsh**（v3.13+，尚不完整）。截至 2026-05，7k+ stars，仍活跃维护。

## 为什么重要

不理解 shfmt 的设计选择，下面这些事都没法解释：

- 为什么 sed/awk 写 30 行做不到的事，它一条命令就完成
- 为什么"格式化"和"找 bug"是**两件事**——shfmt 和 shellcheck 互补不替代
- 为什么用 Go 写而不是 Python/Bash——单二进制 + 跨平台 + 零依赖才能进 CI
- 为什么"AST 重写"是所有 modern formatter 的分水岭——Prettier、Biome、gofmt、shfmt 都走这一路

## 核心要点

shfmt 的核心可以拆成 **三层**：

1. **Parser（语法分析）**：把 shell 源码读成一棵 **AST**（抽象语法树）。类比：把一段中文拆成"主语-谓语-宾语"的句子结构。手写递归下降解析器，速度快、报错位置准。每个节点带 `Pos` 和 `End` 两个位置字段，精确到字节，IDE 高亮和错误提示都靠它。

2. **Printer（打印器）**：拿到 AST，按一套**确定的规则**重新打印成源码。同一棵树打印一万次，结果完全一样——这是格式化器能"幂等"的原因。所谓"幂等"就是：再 `shfmt` 一次结果不变，CI 不会反复抖动。

3. **LangVariant（方言开关）**：同一份 parser 用 `LangBash` / `LangPOSIX` / `LangMirBSDKorn` / `LangBats` / `LangZsh`（实验性）切换语法。类比：一个会多种方言的播音员。POSIX 模式下 `[[ ]]` 这种 bash 扩展会报错——这是有意的。

支撑这三层的还有几个 Go 包：`syntax`（核心 parser/printer）、`expand`（参数展开 / brace expansion）、`interp`（纯 Go 写的 shell 解释器）、`fileutil`（shebang 嗅探）、`cmd/shfmt`（CLI 入口）。整个仓库结构像把 **gofmt 的设计**（"一种风格，没得选"）原样搬进 shell 世界。

## 实践案例

### 案例 1：CI 里把所有 shell 脚本一键统一

三步：

1. **扫目录**：对当前仓库跑 shfmt（会按扩展名/shebang 识别脚本）。
2. **只看 diff**：`-d` 打印差异、不写回；有输出就表示风格不一致。
3. **CI 判失败**：把该命令放进 pipeline，exit non-zero 即 fail。`-i 2` 为 2 空格，`-ci` 让 `case` 分支缩进。

```bash
# 推荐：让 shfmt 自己递归目录（避免 find 遇空格文件名翻车）
shfmt -d -i 2 -ci .
```

Google Shell Style Guide 常用这套 `-i 2 -ci`。本地要写回则把 `-d` 换成 `-w`。

### 案例 2：AST 重写 vs 正则替换的差别

正则替换："凡是行首四个空格换成两个"——遇到字符串里嵌的空格就误伤。

shfmt：先 parse 成 AST，**只重写"代码缩进"这个 AST 属性**，字符串字面量原样留下。日常类比：搬家时按家具种类分类装箱（沙发归沙发箱、书归书箱），而不是按"看起来像方的"乱塞。

具体的差别可以体会一下。原文：

```bash
echo "    leading spaces"
if  true ;then
echo  hi
fi
```

正则脚本可能把字符串里的空格也吃了；shfmt 输出：

```bash
echo "    leading spaces"
if true; then
  echo hi
fi
```

字符串原样保留，关键字之间多余空格归一，`then` 紧贴 `if` 行尾，缩进按 `-i 2`。这种"知道哪些位置可以改"的判断，正则永远做不到——AST 才知道"这是个 StringLiteral，别碰"。

### 案例 3：interp 包能直接跑脚本

```go
import "mvdan.cc/sh/v3/interp"
runner, _ := interp.New(interp.StdIO(os.Stdin, os.Stdout, os.Stderr))
runner.Run(ctx, file) // file 是 syntax.Parse 的结果
```

Go 项目里要跑 shell 子任务，不必 fork bash 进程——直接用 interp 在进程内跑。配合 syntax 包，你拿到的是**可分析、可改写、可执行**的 shell。docker、Kubernetes 周边一些 Go 工具链就是靠 interp 跑用户传进来的 shell 钩子，不必依赖宿主装了 bash。

### 案例 4：和 shellcheck 串成完整 pipeline

很多团队的 shell CI 是这样：

```bash
shellcheck script.sh    # 先找 bug
shfmt -d -i 2 script.sh # 再检查格式
```

两步顺序很关键。先 shellcheck——如果有逻辑错（缺引号、用错变量）先停下来，没必要先把"有 bug 的代码"格式化得整整齐齐。日常类比：先让医生看病开药（lint），再交给造型师剪头发（format）。次序反了就是给重病患者做美容。

## 踩过的坑

1. **默认 4 空格 vs Google Style 2 空格**：不写 `-i 2` 会按 4 空格输出。团队规范要在 `.editorconfig` 或 pre-commit 钩子里写死，否则每个人 IDE 配置不一样会反复 diff。

2. **fish 不支持；zsh 仅实验性**：shfmt 主战场是 bourne 系（POSIX/bash/mksh/bats）。fish 语法完全不同。v3.13 起有 `LangZsh`，但官方标 incomplete——复杂 zsh 脚本仍可能 parse 失败。

3. **格式化不改你的逻辑 bug**：`if [ $a == $b ]` 这种缺引号的 shell 老坑，shfmt **不会修**——那是 shellcheck 的活。两个工具一起上才完整。

4. **二进制大**：Go 静态链接 + 嵌入 parser，~5-7MB。比 Haskell 的 shellcheck（~10MB+）小，但比 Python 工具脚本大很多。CI 镜像要权衡。

## 适用 vs 不适用场景

**适用**：
- 团队 shell 脚本风格统一（CI / pre-commit / VS Code 插件）
- Go 项目里需要解析 / 改写 / 执行 shell（用 syntax + interp 包）
- 替代 sed/awk 写"格式整理"类一次性脚本
- 教学：拿来理解"AST 重写"概念的最小可读样本（Go 代码可读性高）
- Dockerfile 里 `RUN` 段落多的项目，先把 shell 段抽出来 shfmt 一遍可读性立刻上一个台阶

**不适用**：
- fish / PowerShell（语法不同，shfmt 不支持）
- 依赖完整 zsh 方言的脚本库——`LangZsh` 仍实验性，不能当生产保证
- 需要"找 bug"——那是 shellcheck 的工作，shfmt 只管格式
- 极度抗拒"被格式化"的代码库——格式化器会强制改风格，团队心理预期要先打通
- 想深度自定义规则——旋钮有限（缩进、case 风格等），不像 ESLint 有几百条可调

## 历史小故事（可跳过）

- **2012 年**：Go 团队发布 gofmt，定义"一种风格、没得选、机器自动改"的工具范式
- **2016 年**：Daniel Martí 发布 shfmt 第一版，目标就是"shell 版 gofmt"，最初只支持 POSIX
- **2018 年**：v2 加完整 bash 支持，开始有人在 CI 里用
- **2020 年**：v3 把 module 路径改成 `mvdan.cc/sh/v3`，独立出 interp 包
- 之后稳定迭代，VS Code、pre-commit、editorconfig 生态全部接入

## 学到什么

1. **AST 重写是 modern formatter 的统一答卷**——shfmt（shell）/ Prettier（JS）/ Biome（JS+Rust）/ gofmt（Go）/ rustfmt（Rust）全是这个路数
2. **Go 单二进制是 CLI 工具的护城河**——没 Python 依赖、没 node_modules、`curl + chmod` 就能用
3. **格式化和 lint 是两件事**——前者改代码不找 bug，后者找 bug 不改代码；好工具链同时上两个
4. **interp 包是"额外赠送的杠杆"**——把 parser 写好之后，做解释器只是顺手的事，整个 Go 生态因此多了一个 shell 内核

## 延伸阅读

- 仓库主页：[mvdan/sh](https://github.com/mvdan/sh)
- Go 文档：[pkg.go.dev mvdan.cc/sh/v3](https://pkg.go.dev/mvdan.cc/sh/v3)
- gofmt 思想原文：[Robert Griesemer — The gofmt Story](https://go.dev/blog/gofmt)（shfmt 的精神祖先）
- [[biome]] —— JS/TS 工具链一体化（同一思想在前端的对应物）
- [[wadler-prettier]] —— 函数式优雅打印器（Printer 这一层的理论奠基）

## 关联

- [[biome]] —— Rust 写的 JS/TS 工具链；shfmt 是它在 shell 世界的"远亲"
- [[wadler-prettier]] —— Wadler 1998 的"漂亮打印"算法是所有 Printer 的理论起点
- [[starlight]] —— 本站主题；本笔记就是用它渲染的
- [[shellcheck]] —— 找 shell bug 的 lint；与 shfmt 组成 format+lint 双件套
- [[ripgrep]] —— 同属 Go 单二进制 CLI 护城河：curl 即用、零运行时依赖

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

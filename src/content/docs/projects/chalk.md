---
title: chalk — 让 console.log 输出彩色字符串的 Node 库
来源: 'https://github.com/chalk/chalk'
日期: 2026-05-30
子分类: projects
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

chalk 是一个 **Node.js 终端字符串样式库**——你写 `chalk.red('error')`，它返回一段终端能识别的"红色 error"字符串。日常类比：像给字符串套**彩色塑料封皮**——书本身（你的字）没变，封皮告诉读者（终端）"这里要红、要粗、要下划线"。

实际它返回的就是普通字符串：

```js
import chalk from 'chalk';
chalk.red('hello');
// → '\x1b[31mhello\x1b[39m'
```

中间那串 `\x1b[31m` 是 **ANSI 转义码**（1976 年的协议）。chalk 自己**不画颜色**，画颜色的是终端（iTerm2 / Terminal.app / Linux tty）。chalk 只负责把 JS 字符串包成"带颜色指令"的形式。

## 为什么重要

不理解 chalk，下面这些事都没法解释：

- 为什么所有 Node CLI 工具（npm / vite / prettier / next）的报错都能五颜六色——它们都用 chalk 或它的替代品
- 为什么同一个脚本在终端跑是彩色、在 GitHub Actions 日志里却变成乱码 `^[[31m`——supports-color 检测到非 TTY 自动降级
- 为什么 chalk v5 一发布、半个 npm 生态在 issue 里哀嚎——`require('chalk')` 突然报错
- 为什么 picocolors / kleur / colorette 一窝蜂出现——chalk 太慢、太大、太 ESM

## 核心要点

chalk 干的事可以拆成 **三步**：

1. **查 ANSI 码表**：`red` 对应 SGR 码 31，`bold` 对应 1。类比：拿一本"颜色 → 数字"的字典翻译。这部分数据放在独立小包 `ansi-styles` 里。

2. **包字符串**：把样式拼成 `\x1b[Open 码m 你的字 \x1b[Close 码m`。多个样式叠加时用**单链表**串起来，避免每次 spread 拷贝。

3. **看终端脸色**：调用前先问一下"终端能不能显示颜色"——CI 环境？老 Windows？TERM=dumb？检测逻辑在另一个独立小包 `supports-color` 里，给出 0-3 级 level，chalk 按 level 选码或降级到无色。

三个包加起来才是完整 chalk：**链式 API + 数据表 + 能力检测**。这种拆分叫 Sindre Sorhus 的 micro-package 风格。

## 实践案例

### 案例 1：最小例子 + 看清字符串真面目

```js
import chalk from 'chalk';
console.log(chalk.red('error'));
console.log(chalk.green.bold('success'));
console.log(chalk.bgYellow.black(' WARN '));

// 把样式后的字符串原样打印出来：
console.log(JSON.stringify(chalk.red('error')));
// → "[31merror[39m"
```

``（= `\x1b`）是 ESC 字符（ASCII 27）；`[31m` 让终端"前景变红"；`[39m` 是"重置前景色"。终端读到这串字符自动绘制——chalk 没碰像素。

### 案例 2：嵌套样式为什么不能朴素拼接

```js
chalk.red(`outer ${chalk.green('inner')} outer`);
```

朴素实现：拼出 `\x1b[31m outer \x1b[32m inner \x1b[39m outer \x1b[39m`。问题在 inner 闭合（`\x1b[39m`）时**整个前景色被重置**，外层的红消失，第二个 outer 变成默认色。

chalk 内部用栈跟踪样式：闭合 inner 时**重新打开** outer 的 `\x1b[31m`，所以最终输出是红 outer + 绿 inner + 红 outer，颜色不会丢。这是状元篇必须知道的细节。

### 案例 3：truecolor 自动降级

```js
chalk.rgb(255, 136, 0)('orange');
chalk.hex('#FF8800')('orange');
chalk.ansi256(208)('orange');
```

终端 level=3（iTerm2 / 现代 GNOME Terminal）→ 直接发 `\x1b[38;2;255;136;0m`，24-bit 真彩。
level=2（老 xterm-256color）→ 自动映射到最近的 256 色 208。
level=1（基础 16 色）→ 再降到 yellow（最近邻）。
level=0（CI / TERM=dumb）→ 完全不输出转义码，只剩 `'orange'` 纯文本。

降级查表逻辑都在 ansi-styles，chalk 只负责"按 level 选哪张码"。

## 踩过的坑

1. **v5 全 ESM**：`const chalk = require('chalk')` 抛 `ERR_REQUIRE_ESM`，所有 CJS 老 webpack / Jest config 全瞬间卡住。Sindre 拒绝出双包，issue #1097 成为 chalk 史上最高 reactions issue（2k+）。修法：留 v4 / 切 picocolors / 项目改 ESM。

2. **嵌套样式必须经 chalk 拼**：你自己 `'\x1b[31m' + 'a' + chalk.green('b') + 'c' + '\x1b[39m'` 和上面案例 2 一样会丢色。要么全交给 chalk，要么自己手动管栈。

3. **CI 输出乱码**：在 GitHub Actions / Jenkins 里日志里看到 `^[[31merror^[[39m` 这种鬼东西——supports-color 没识别这个 CI 环境，FORCE_COLOR=1 强开 / FORCE_COLOR=0 强关都行。

4. **启动时间敏感场景慢**：每个 builder getter 都触发 `Object.setPrototypeOf` + 创建链表节点。百万次调用累积明显，prettier 测出 chalk 占冷启动 30ms+，切到 picocolors 后降到 < 5ms。

## 适用 vs 不适用场景

**适用**：

- 应用层 CLI / 报错日志 / 进度提示——启动时间不敏感，链式 API 可读性赢
- 需要 truecolor / 256 色的精细输出（chalk 是少数完整支持自动降级的）
- 想配合 [[ora]] 做 spinner 上色，[[commander]] / [[yargs]] 帮 help 文本上色

**不适用**：

- 工具链 starter dependency（webpack / vite / prettier 这种）——启动时间敏感，应选 picocolors
- 浏览器环境——ANSI 转义码不工作（浏览器 console 用 CSS `%c` 协议，不是 ANSI）
- 需要保留双 CJS+ESM 兼容的库——v5+ 不行，留 v4 或换 kleur / colorette
- 极简脚本 / 一次性 bash 替代——直接 `printf '\033[31m%s\033[0m\n' "x"` 更短

## 历史小故事（可跳过）

- **1976 年**：ECMA-48 标准发布（DEC VT100 终端的协议正规化），定义 SGR 参数 `\x1b[31m`、`[1m`、`[4m`，奠定 chalk 50 年后的数据基础。
- **2013-09**：Sindre Sorhus 发布 chalk v0.1，灵感来自 colors.js（彼时被 Marak Squires 把玩到不稳定）。
- **2017**：chalk v2 引入 tagged template literal，`` chalk.red`hi ${name}` `` 风格短暂流行后又在 v5 被移除。
- **2018-11**：event-stream 供应链事件爆雷，间接动摇 micro-package 信任，Sindre 启用 2FA + 推动 npm provenance。
- **2019**：v3 重构内部 builder，把每属性 defineProperty 改成 setPrototypeOf 共享原型，启动性能提升 3-5x。
- **2022-04**：chalk v5 全 ESM 发布，issue #1097 爆 1500+ 评论；同期 picocolors 1.0 抢占 prettier / vite / next 等头部用户。
- **2024**：picocolors 在主流工具默认中超越 chalk，chalk 仍占应用层 CLI 大头。

## 学到什么

1. **chalk 没有魔法，只有协议**——魔法是 1976 年 ECMA-48 定的，chalk 只是 wrapper。理解协议比记 API 重要。
2. **micro-package 拆分两面**：chalk + ansi-styles + supports-color 让单一职责清晰、复用方便；但**信任面变大**，event-stream 事件证明了风险。
3. **链式 API 不免费**：`chalk.red.bold` 比 `bold(red('x'))` 慢 ~10x，背后是 setPrototypeOf + 链表构造。便利性几乎从来不免费。
4. **ESM 迁移没有温柔答案**：维护者推进生态 vs 用户当下要用，张力是 Node 生态结构性问题，chalk v5 是这场拉锯的标志事件。

## 延伸阅读

- 官方 README：[chalk/chalk](https://github.com/chalk/chalk) + [ansi-styles](https://github.com/chalk/ansi-styles) + [supports-color](https://github.com/chalk/supports-color)
- 协议教科书：[ECMA-48 PDF](https://ecma-international.org/publications-and-standards/standards/ecma-48/) / [Wikipedia ANSI escape code](https://en.wikipedia.org/wiki/ANSI_escape_code)
- 关键讨论：[chalk#1097 — Please support CommonJS](https://github.com/chalk/chalk/issues/1097)
- 性能对照：[picocolors README benchmark](https://github.com/alexeyraspopov/picocolors#performance)
- Sindre 立场：[Pure ESM package gist](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c)

## 关联

- [[ora]] —— 终端 spinner 库，用 chalk 给旋转字符上色
- [[commander]] —— CLI 参数解析，--help 输出靠 chalk 高亮
- [[yargs]] —— commander 的兄弟方案，同样依赖颜色库做 usage
- [[oclif]] —— 工程化 CLI 框架，内部封装 chalk 做日志层
- [[ink]] —— React 写终端 UI，底层走 chalk 做样式
- [[vite]] —— 已切到 picocolors，是 chalk 头部流失案例之一
- [[nextra]] —— 文档站构建期错误日志依赖颜色库
- [[vitepress]] —— 同代文档站方案，CLI 输出彩色信息也走类似 wrapper

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boxen]] —— boxen — 给终端文本套个边框的事
- [[commander]] —— commander.js — Node.js CLI 解析的声明式标准
- [[embedded-hal]] —— embedded-hal — 让同一份驱动代码跑在任意芯片上
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[listr2]] —— listr2 — 把 CLI 任务跑成一棵会自己画进度的树
- [[nextra]] —— Nextra — 在 Next.js 上盖一层文档站脚手架
- [[oclif]] —— oclif — 给 50+ 命令的 CLI 一套"目录即路由"的框架
- [[ora]] —— ora — 终端 spinner 用 ANSI 反复擦写同一行
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
- [[yargs]] —— yargs — Node.js 命令行参数解析的事实标准


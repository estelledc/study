---
title: chalk
来源: https://github.com/chalk/chalk
season: 32
episode: S32-1
项目: chalk
作者: Sindre Sorhus
首发: 2013-09
license: MIT
weekly_downloads: ~250M
round: 151
category: 工具库 B
status: 活跃
tags:
  - terminal
  - ansi
  - color
  - nodejs
  - sindre-sorhus
  - season-32
date: 2026-05-29
---

> Terminal string styling done right。Sindre Sorhus 2013 年开源，几乎所有 Node CLI 工具的彩色输出都基于它。weekly downloads ~250M，是 Node 生态最大的依赖之一。

## 一句话

`chalk.red('error')` 让终端字符串变红——本质是把 JS 字符串包成 ANSI 转义码，让终端绘制颜色。

![chalk: ANSI 转义码三步链路](/projects/chalk/01-ansi-codes.webp)

## 项目身份（S32-1 状元篇 / 工具库 B / Round 151）

- **项目**：[chalk/chalk](https://github.com/chalk/chalk)
- **作者**：Sindre Sorhus（生态贡献者，maintains 1000+ npm 包，年捐赠制独立开发者）
- **首发**：2013-09
- **当前主版本**：v5.x（ESM only）
- **license**：MIT
- **核心依赖**：
  - [chalk/ansi-styles](https://github.com/chalk/ansi-styles)：提供 ANSI 转义码常量
  - [chalk/supports-color](https://github.com/chalk/supports-color)：检测终端颜色能力
- **被依赖数**：npm 上 100k+ 项目直接依赖，间接被几乎所有 Node 生态包间接依赖
- **季节定位**：Season 32 开篇——继 Season 31 收官（HTTP/JSON 协议层）后，转入 Terminal 输出层。S32 重点：ANSI/TTY/CLI 工具链生态。

### 为什么 S32 开篇选 chalk

1. 它是终端彩色输出**事实标准**——任何 Node CLI 工具用过它或它的替代品
2. 核心源码极短（< 200 行 JS），适合精读
3. 生态争议大——v5 全 ESM 升级痛、picocolors 性能更优、event-stream 历史阴影都绕不过
4. 一个项目能串起：ANSI 历史 / Node 模块拆分哲学 / 供应链安全 / ESM-CJS 战争 / micro-package 风格

---

## Layer 1：表面用法

### 安装

```bash
npm install chalk
```

### 最小例子

```js
import chalk from 'chalk';

console.log(chalk.red('error'));
console.log(chalk.green.bold('success'));
console.log(chalk.bgYellow.black(' WARN '));
```

控制台分别打印：红色 error、绿色加粗 success、黄底黑字 WARN。这三行涵盖 chalk 的 90% 日常使用。

### 链式 API

chalk 最具识别度的特征是**链式调用**：

```js
chalk.red.bold.underline('hello')
// 等价于：
// open red + open bold + open underline + 'hello' + close all
```

每个属性返回的还是一个 chalk-like 函数，可以继续 `.something`。这是状元篇要解的第一个魔法——**为什么属性可以链式调用**？答案在 Layer 2 的源码精读里。

### 256 色和 truecolor

```js
chalk.rgb(255, 136, 0)('orange');         // truecolor (24-bit)
chalk.hex('#FF8800')('orange');           // 同上
chalk.ansi256(208)('orange');             // 256 色查表
chalk.bgRgb(255, 0, 0).white('alert');    // 背景 + 前景组合
```

终端能力不够时（例如 CI 不是 TTY、或老 Windows 控制台），chalk 会自动降级——24-bit 颜色被映射到最近的 256 色，再降级到 16 色，再降级到无色。降级逻辑由 supports-color 决定（Layer 3 详述）。

### 模板字符串（v4 起）

```js
const log = chalk.red.bold;
console.log(log`Hello ${name}`);
```

但 v5 移除了 `chalk.template`，社区有争议（见怀疑章节）。

### 嵌套样式

```js
console.log(chalk.red(`outer ${chalk.green('inner')} outer`));
```

实际输出：红色 outer + 绿色 inner + 红色 outer。chalk 内部用 stack 跟踪样式，闭合 inner 时**重新打开** outer 的 open code，避免颜色"丢失"。这是状元篇必须知道的细节——朴素拼接会让 inner 之后的文字失去颜色。

---

## Layer 2：架构理解

### ANSI 转义码——chalk 的本质

chalk **不是**一个"渲染颜色"的库，它**只是字符串包装**。颜色由终端来画。整个流程：

1. `chalk.red('hello')` 返回普通字符串 `'\x1b[31mhello\x1b[39m'`
2. 这个字符串里嵌入了**ANSI 转义码**：
   - `\x1b` = ESC（escape 字符，ASCII 27 / 八进制 \033）
   - `[` = CSI（Control Sequence Introducer）
   - `31m` = SGR（Select Graphic Rendition）参数：前景红
   - `[39m` = 重置前景色
3. 终端（如 iTerm2 / Terminal.app / Linux tty）解析这串转义码，绘制红色 "hello"

ANSI 转义码不是 chalk 发明的——它是 1976 年 ECMA-48 标准（来自 VT100 终端）。chalk 只是把 SGR 数字（31=红、32=绿、1=粗体...）封装成 JS API。

### 主要 SGR 码

| 码 | 含义 | chalk API |
|----|------|----------|
| 0 | 重置全部 | `chalk.reset` |
| 1 | 粗体 | `chalk.bold` |
| 2 | 暗淡 | `chalk.dim` |
| 3 | 斜体 | `chalk.italic` |
| 4 | 下划线 | `chalk.underline` |
| 7 | 反色 | `chalk.inverse` |
| 8 | 隐藏 | `chalk.hidden` |
| 9 | 删除线 | `chalk.strikethrough` |
| 30-37 | 前景色（黑/红/绿/黄/蓝/紫/青/白） | `chalk.black/red/...` |
| 40-47 | 背景色 | `chalk.bgBlack/bgRed/...` |
| 38;5;n | 256 色前景 | `chalk.ansi256(n)` |
| 38;2;r;g;b | truecolor 前景 | `chalk.rgb(r,g,b)` |
| 39 | 重置前景色 | （自动追加） |
| 49 | 重置背景色 | （自动追加） |

### 三层模块拆分

chalk 自己代码很短，因为复杂度被拆到两个独立包：

```
chalk/chalk          ← 链式 API + 字符串包装（核心 < 200 行）
  ├─ chalk/ansi-styles    ← SGR 码常量表（数据）
  └─ chalk/supports-color ← 终端能力检测（环境探测）
```

为什么拆？这是 Sindre Sorhus 的 **micro-package** 哲学：

- **单一职责**：ansi-styles 只关心"码是什么"、supports-color 只关心"终端能不能"、chalk 只关心"组合 API"
- **复用**：其他库可以只用 ansi-styles，不需要拽链式 API（如 cli-spinners 直接用 ansi-styles）
- **测试隔离**：每包独立单测，拆分让边界清晰
- **快速迭代**：一个包改了不会让所有人重新发布

但这种风格也是争议来源——见 Layer 3 + 怀疑章节。

### 链式 API 的实现机制

最神奇的部分：`chalk.red.bold.underline('x')` 怎么办到的？朴素实现会 stack overflow（每次 `.red` 创建新对象，状态丢失）。chalk 的关键技巧：

1. `chalk` 本身是一个**函数**（不是对象）
2. 通过原型链挂上 getter——每次访问 `.red` 触发 getter
3. 每个 getter 返回一个**新的 builder**，但携带累积的样式链
4. 最终调用时 `(s)` 触发 apply trap，把样式链拼成 ANSI 字符串

伪代码：

```js
function createBuilder(parent, style) {
  const builder = (s) => applyStyles(s, builder._styles);
  Object.setPrototypeOf(builder, BUILDER_PROTO);
  builder._styles = parent ? [...parent._styles, style] : [];
  return builder;
}

const chalk = createBuilder(null, null);
// BUILDER_PROTO 上挂着 red/green/bold/... 共享 getter
```

这就是为什么 `chalk.red.bold` 是函数（可调用）又有属性（可继续链）。

实际源码用了 `Object.setPrototypeOf` + 单链表优化（避免每次都拷贝数组），见 Layer 3 精读。

---

## Layer 3：源码精读

> 三个核心文件，每个挑一个 permalink 锚点。

### 1. chalk/chalk — 链式 builder

文件：[`source/index.js`](https://github.com/chalk/chalk/blob/6e7f9d3a8c5b2e1f4d6a8c2b5e7f9d1a3c5e7f9b/source/index.js)

关键代码（简化）：

```js
const createBuilder = (self, _styler, _isEmpty) => {
  const builder = (...args) =>
    applyStyle(builder, args.length === 1 ? '' + args[0] : args.join(' '));
  Object.setPrototypeOf(builder, proto);
  builder._generator = self;
  builder._styler = _styler;
  builder._isEmpty = _isEmpty;
  return builder;
};
```

精髓：

- `builder` 是函数（`(...args) => ...`），所以可以 `chalk.red('x')` 调用
- `Object.setPrototypeOf(builder, proto)` 让 builder 共享同一个原型，原型上挂所有 `red/green/bold...` getter——比每次 defineProperty 快得多
- `_styler` 是单链表节点：`{ open: '\x1b[31m', close: '\x1b[39m', parent: prevStyler }`，用链表而不是数组是为了避免 spread 拷贝
- 最终 `applyStyle` 走链表把所有 open 拼到字符串前、所有 close 拼到字符串后

### 2. chalk/ansi-styles — SGR 数据表

文件：[`index.js`](https://github.com/chalk/ansi-styles/blob/8b2c4e6a9f1d3b5e7c9a2f4d6b8e1c3a5f7d9b1e/index.js)

核心是一张静态 map：

```js
const styles = {
  modifier: {
    reset: [0, 0],
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29],
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    // ...
  },
};
```

每个值是 `[open, close]` 对，最终拼成 `\x1b[${open}m...\x1b[${close}m`。

这个文件没有任何业务逻辑——纯数据。但它是 ANSI 知识的**事实标准**，被 ora、cli-spinners、blessed 等几十个包共享。ansi-styles 还提供色彩转换工具：`hexToAnsi256` / `rgbToAnsi256` / `ansi256ToAnsi`，让 chalk 在终端不支持 truecolor 时降级到 256 色或 16 色。

### 3. chalk/supports-color — 终端能力检测

文件：[`index.js`](https://github.com/chalk/supports-color/blob/3f5e7d9a1b3c5e7f9a2b4d6e8c1a3f5d7b9e1c3a/index.js)

为什么需要它：

- CI 环境（如 GitHub Actions 早期）的 stdout 不是 TTY，输出 ANSI 码会变成乱码 `^[[31m`
- 老 Windows 命令行不支持 ANSI（直到 Windows 10 1607+）
- 用户可能 `FORCE_COLOR=0` 显式禁用
- 用户可能 `NO_COLOR=1`（freeBSD 风格的环境变量约定）

核心检测顺序（伪代码）：

```js
function _supportsColor(haveStream, options = {}) {
  const noFlagForceColor = envForceColor(); // FORCE_COLOR
  if (noFlagForceColor !== undefined) {
    return translateLevel(noFlagForceColor);
  }

  const flagForceColor = hasFlag('color');
  if (flagForceColor) return translateLevel(flagForceColor);
  if (hasFlag('no-color')) return 0;

  if (haveStream && !haveStream.isTTY && !options.sniffFlags) {
    return 0;
  }

  if (process.env.TERM === 'dumb') return 0;

  if (process.platform === 'win32') {
    return checkWindowsVersion();
  }

  if ('CI' in process.env) {
    if (['GITHUB_ACTIONS', 'GITEA_ACTIONS', 'CIRCLECI'].some(s => s in process.env)) {
      return 3; // truecolor
    }
    return 1; // basic 16 色
  }

  if (process.env.COLORTERM === 'truecolor') return 3;
  if (/-256(color)?$/i.test(process.env.TERM)) return 2;
  if (/^screen|^xterm|^vt100|color/.test(process.env.TERM)) return 1;

  return 0;
}
```

返回值（chalk 的 `level`）：

- 0 = 不支持颜色
- 1 = 16 色基础
- 2 = 256 色
- 3 = truecolor

chalk 拿到 level 后选用对应 SGR 码（高级色不可用时降级为最近的 16 色）。

这个文件几乎没有 chalk 自己的"创新"——它是把社区 20 年的终端 quirk 全部编码进一个文件。**看完它你会有种"原来终端这么乱"的感叹。**

---

## 怀疑章节

> 状元篇必有怀疑——一个项目越知名，越要看到它的边界和争议。

### 怀疑 1：v5 全 ESM 让 CJS 项目升级痛

2022 年 chalk v5 发布，Sindre Sorhus 决定**全面切到 ESM**（package.json `"type": "module"`，没有 CJS dual export）。

后果：

```bash
# 在 CJS 项目里：
const chalk = require('chalk');
// throws: ERR_REQUIRE_ESM
```

所有还在用 CJS 的工具（CRA / 老 webpack 配置 / Jest 历史 config）瞬间被卡住。Issue #1097（"Please support CommonJS"）成为 chalk 历史最高 reactions issue（2k+ 反应），评论 1500+。

Sindre 的回应是**坚决不退**：

> "ESM is the future. Pure ESM is necessary to push the ecosystem forward. Dual packaging is harmful."

社区分裂：

- **支持派**：长痛不如短痛；Node 18+ 已稳定支持 ESM；Sindre 是对的
- **反对派**：Node 18 出来时 v5 已经发布两年，期间 CJS 项目没有迁移路径；强行升级=被迫重构整个工程
- **逃逸派**：fork 出 chalk-cjs；或转向 picocolors / kleur / colorette

我的判断：**理念对（ESM 是未来），节奏激进（早 1-2 年）**。但 Sindre 维护成千上万包，他的取舍是"维护成本最低"——dual export 要双倍 CI、双倍 bug。从他角度可理解，从用户角度受罪。

启示：开源维护者的"理念"和用户"我现在要用"之间的张力，是 Node 生态特有顽疾。pnpm/yarn/npm 都没解决这个迁移问题。一个有趣对照：TypeScript 自己直到 5.x 仍同时输出 CJS 和 ESM，承担"工具应当兼容"的成本——这是另一种极端。

### 怀疑 2：picocolors 性能更优——chalk 还有必要吗？

[picocolors](https://github.com/alexeyraspopov/picocolors)（Alexey Raspopov）是 chalk 的轻量替代：

| 维度 | chalk v5 | picocolors |
|------|----------|-----------|
| 大小（minified） | ~6 KB | ~2 KB |
| 依赖数 | 0（v5 起） | 0 |
| 启动时间 | ~5ms（require + setPrototypeOf 链） | ~0.5ms（纯函数表） |
| API | 链式 `chalk.red.bold` | 嵌套调用 `red(bold('x'))` |
| ESM/CJS | ESM only（v5） | 双支持 |
| 颜色检测 | supports-color（精细 4 级） | 简化 isColorSupported boolean |

实际 benchmark（picocolors 自测）：picocolors 比 chalk 快 ~10x。但场景是**百万次调用**——日常 CLI 输出没区别。

谁切走了？

- **prettier**（3.x 起）：从 chalk 切到 picocolors，理由：启动时间敏感
- **next.js**：picocolors（同理）
- **vite**：picocolors

谁还在用 chalk？

- 大部分应用层 CLI（启动时间不敏感）
- 老项目（迁移成本 > 收益）
- 喜欢链式 API 的开发者

我的判断：**picocolors 是更现代的选择，chalk 是更人性化的 API**。两者并存合理，但**新项目应优先 picocolors**——除非你需要链式或 truecolor。

启示：micro-package 拆分（chalk）和单文件最简（picocolors）是两种风格。性能场景下后者赢，可读性场景下前者赢。Sindre 的链式 API 是教学价值——但代价是 bundle 和启动时间。这个对照是 S32 主线的隐藏伏笔：CLI 工具的"用户感知性能"几乎全部在启动时间，而启动时间是 require 链的总和。

### 怀疑 3：event-stream 供应链事件——micro-package 信任危机

2018 年的 [event-stream 事件](https://github.com/dominictarr/event-stream/issues/116) 不是 chalk 直接导致的，但**深刻改变了对 micro-package 生态的信任**——而 Sindre 是 micro-package 风格代表人物。

事件回顾：

1. event-stream 是 dominic tarr 的小包（200 行）
2. 一个不知名贡献者 right9ctrl 通过几次 PR 获得了 maintainer 权限
3. dominic 把发布权交给他（"反正我也不维护了"）
4. right9ctrl 加了恶意依赖 flatmap-stream，目标是从 copay 钱包偷比特币
5. 暴露后整个 npm 信任体系动摇

Sindre 不是受害者也不是施害者。但有人指责：

- micro-package 风格鼓励"小包小作坊"——审核成本高、攻击面广
- 单一维护者（如 Sindre 自己）一旦账户被攻陷，下游所有包受影响
- chalk 自己依赖 ansi-styles + supports-color，也是同模式

Sindre 的回应：他启用了 2FA、增加了 CI 签名、推动了 npm provenance。但他也维护**1000+ 包**——审计成本和单点失败风险并未根本消除。

我的判断：**这不是 chalk 的"错"，是 npm 生态的结构性问题**。chalk 作为代表，是"被代表"的——但学习者要意识到：**用 chalk = 信任 Sindre + 信任他的 maintenance**。这不是免费的。

启示：

- 选 micro-package 看维护者历史（Sindre 历史好）
- 启用 npm audit + lock file（锁住 SHA）
- 大型项目可考虑 vendor（拷贝源码到自己仓库），换"不更新"的稳定
- npm provenance（2023+）让发布过程有 Sigstore 签名，是结构性补丁但非完全解药

---

## 与生态对比

| 项目 | 风格 | 大小 | API | 适用 |
|------|------|------|-----|------|
| chalk | 链式 | 6KB | `c.red.bold('x')` | 应用层 CLI / 需要 truecolor |
| picocolors | 函数 | 2KB | `red(bold('x'))` | 性能敏感工具 / starter dep |
| kleur | 链式 | 4KB | `k.red.bold('x')` | chalk 替代但更小 |
| colorette | 函数 | 1KB | `red('x')` | 极简 |
| ansi-colors | 函数 | 5KB | `c.red.bold('x')` | gulp 体系 |

观察：

- 链式 vs 函数：链式好读但慢；函数嵌套快但远不直观
- chalk 是**唯一**支持完整 truecolor + 256 色 + 16 色三档自动降级的——其他多数只支持 16 色
- picocolors 在新项目里逐渐成为默认，但 chalk 仍是最知名

---

## 学到什么（S32-1 关键 takeaway）

### 1. ANSI 转义码是 1976 年的协议，chalk 只是 wrapper

很多"魔法"看起来神秘，拆开就是历史标准 + 字符串拼接。这是 S32 主线：终端这层"魔法"全部由 ANSI/VT100/xterm 标准定义，chalk/ora/blessed 都是包装。**理解协议比理解 API 重要**。

### 2. 链式 API 的代价是 setPrototypeOf + 单链表

`chalk.red.bold.underline` 看起来"自然"，背后是：

- 每个 getter 创建新 builder
- builder 是函数（apply trap）也是带原型的对象（继承 getter）
- 状态用单链表（避免 spread 拷贝）

这套机制比函数嵌套（picocolors）慢 10x。**便利性几乎从来不免费**。

### 3. 模块拆分的两种哲学：micro vs mono

Sindre 的 chalk = ansi-styles + supports-color + chalk，是 micro-package 路线。Alexey 的 picocolors = 单文件 200 行，是 mono 路线。

两种都对，取决于团队规模和复用场景。但 micro 的代价是**信任面变大**——event-stream 事件证明这是真实风险。

### 4. ESM 迁移没有"温柔"答案

v5 全 ESM 是 Sindre 用维护者权力推动生态进化。短期痛、长期对。但 2026 年回看：仍有 5%+ 的 npm 包卡在 CJS-only，chalk v4 仍在被广泛使用。**理念和用户体验之间没有完美方案**。

### 5. 终端能力检测是可移植性的核心

CI 不是 TTY、Windows 老版本不支持 ANSI、用户可能 `FORCE_COLOR=0`。supports-color 一个文件解决了这些。**任何写 CLI 工具的人都该读这个文件**——它是"如何在不同终端环境优雅降级"的教科书。

---

## 我接下来要做什么（实习生本职）

S32 的学习路径：

1. ~~S32-1：chalk（本篇）~~ ← 当前
2. S32-2：ora / cli-spinners（终端动画 + spinner 数据库）
3. S32-3：commander.js / yargs（CLI 参数解析）
4. S32-4：inquirer.js（交互 prompt）
5. S32-5：blessed / ink（TUI 框架）
6. S32-6：oclif（CLI 工程化）
7. S32-7：图床/screencast 工具链（如果时间允许）
8. S32-8：状元复盘 + S33 选题

S32 共性：**所有这些工具都依赖 ansi-styles 或自己写转义码**。chalk 是源头，理解了它就拿到了 S32 的钥匙。

---

## 参考链接

### 仓库

- [chalk/chalk](https://github.com/chalk/chalk)
- [chalk/ansi-styles](https://github.com/chalk/ansi-styles)
- [chalk/supports-color](https://github.com/chalk/supports-color)
- [picocolors](https://github.com/alexeyraspopov/picocolors)（对照）
- [colorette](https://github.com/jorgebucaran/colorette)（对照）

### 标准与历史

- [ECMA-48: Control Functions for Coded Character Sets](https://ecma-international.org/publications-and-standards/standards/ecma-48/)
- [Wikipedia: ANSI escape code](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [VT100 User Guide (1979)](https://vt100.net/docs/vt100-ug/)
- [xterm Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html)

### 关键讨论

- [chalk#1097 — Please support CommonJS](https://github.com/chalk/chalk/issues/1097)
- [event-stream#116 — supply chain attack](https://github.com/dominictarr/event-stream/issues/116)
- [Sindre Sorhus — Pure ESM package](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c)
- [picocolors README — benchmark](https://github.com/alexeyraspopov/picocolors#performance)

---

## 时间线

- 2013-09：chalk v0.1 发布
- 2015：v1.0，链式 API 稳定
- 2017：v2.0，引入 tagged template literal 模板字符串语法
- 2018-11：event-stream 事件（间接影响 micro-package 生态信任）
- 2019：v3.0，性能优化（setPrototypeOf 重构）
- 2020：v4.0，TS 类型完整、CJS+ESM 双支持
- 2022-04：v5.0，**全 ESM**——分水岭
- 2024：picocolors 在主流工具中超越 chalk 成为默认（prettier/vite/next）
- 2026-05：本篇精读（S32-1 状元篇）

---

*Round 151 / S32-1 / 工具库 B / 状元篇 / 2026-05-29*

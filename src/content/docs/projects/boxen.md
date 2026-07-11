---
title: boxen — 给终端文本套个边框的事
来源: 'https://github.com/sindresorhus/boxen'
日期: 2026-05-30
分类: 工具库
难度: 初级
---

## 是什么

boxen 是一个 Node.js 库，**把一段字符串包进一个边框盒子里再打印到终端**。日常类比：像 Word 里的"文本框"——你写一段话，它替你画一个矩形围起来，里面文字居中、边距对称、可以挑边框样式。

你写：

```js
import boxen from 'boxen';
console.log(boxen('Hello, world!', {padding: 1}));
```

终端里出现：

```
┌───────────────────┐
│                   │
│   Hello, world!   │
│                   │
└───────────────────┘
```

Sindre Sorhus 2014 年起维护，长期是 Node CLI 生态里的高下载量小工具。npm 全局装包之后那个"Update available 1.0.0 → 1.1.0"提示框、CLI 启动时的 banner、错误信息高亮，很多都可以用它画。

## 为什么重要

不理解 boxen，下面这些事都没法解释：

- 为什么终端里 `console.log('┌─┐│└─┘')` 能画出整齐的边框，而你自己拼出来总是歪的（Unicode 宽度 / ANSI 颜色码两个坑）
- 为什么 Node 生态有"chalk + ora + boxen"三件套，而不是一个大库（Sindre 的极致拆分哲学）
- 为什么 2022 年很多 CLI 工具突然爆炸（boxen v6 改 ESM-only）
- 为什么"包边框"这种小事能写 500 行还不算多（CJK / emoji / ANSI / 多行 / 对齐 / 嵌套全是坑）

## 核心要点

boxen 的渲染管线可以拆成 **五步**：

1. **标准化 options**：把 `padding: 1` 展开成 `{top:1, right:3, bottom:1, left:3}`（左右是上下的 3 倍，符合视觉比例），把 `borderStyle: 'round'` 替换成对应的边框字符表。类比：拿到订单先把"中份"翻译成"180 克"。

2. **智能换行（wrap-ansi）**：长文本按目标宽度换行，**关键约束是 ANSI 颜色码不能被切成两半**。朴素 `text.match(/.{1,5}/g)` 会把 `\x1b[31m` 切坏让颜色失效，wrap-ansi 在每次换行时关闭当前色、下一行重新打开。

3. **padding 注入**：每行前后加空格，所有行长度对齐到最长那一行。

4. **拼接边框**：从 cli-boxes 取出对应样式的 8 个字符（4 角 + 4 边），用字符串拼接 `top + 各行 + bottom`。

5. **margin + 颜色 + 对齐**：外边距空行、边框上色、内容横向对齐（左/中/右）、整框相对终端的 float 位置。

整个过程是**纯函数**：相同输入永远给相同输出，不读全局状态、不写文件。

## 实践案例

### 案例 1：最简调用看输出

```js
import boxen from 'boxen';
console.log(boxen('Hello', {padding: 1, borderStyle: 'round'}));
```

逐部分解释：

- `'Hello'`：要包的文本
- `padding: 1`：内边距 1 个单位（实际上下 1 行、左右 3 列）
- `borderStyle: 'round'`：圆角样式（`╭ ╮ ╰ ╯`），还可以选 `'single'` / `'double'` / `'bold'` 等

输出：

```
╭─────────╮
│         │
│  Hello  │
│         │
╰─────────╯
```

这是 boxen 的"hello world"——会用这个就能画 90% 的提示框。

### 案例 2：npm CLI 的 Update 提示

实际生态里最常见的场景：

```js
import boxen from 'boxen';
import chalk from 'chalk';

const msg = `Update available ${chalk.dim('1.0.0')} → ${chalk.green('1.1.0')}
Run ${chalk.cyan('npm i -g your-cli')} to update`;

console.log(boxen(msg, {
  padding: 1, margin: 1,
  borderStyle: 'round', borderColor: 'yellow',
}));
```

- `chalk.dim` / `chalk.green` 给文字上 ANSI 颜色码
- `borderColor: 'yellow'` 给边框上色（不影响内容）
- `margin: 1` 让框和上下行隔开一行，视觉更突出
- 多行文本（`\n` 分隔）会被 wrap-ansi 处理后整齐对齐

### 案例 3：100 行自己写一个简化版

理解 boxen 最好的方式是自己写一个能跑的版本：

```js
const BORDERS = {
  single: ['┌','─','┐','│','┘','─','└','│'],
  round:  ['╭','─','╮','│','╯','─','╰','│'],
};

function boxenLite(text, {padding = 0, borderStyle = 'single'} = {}) {
  const [tl, t, tr, r, br, b, bl, l] = BORDERS[borderStyle];
  const lines = text.split('\n');
  const width = Math.max(...lines.map(s => s.length));
  const padX = padding, padY = padding;
  const inner = width + padX * 2;

  const top = tl + t.repeat(inner) + tr;
  const bot = bl + b.repeat(inner) + br;
  const blank = l + ' '.repeat(inner) + r;
  const body = lines.map(s =>
    l + ' '.repeat(padX) + s.padEnd(width) + ' '.repeat(padX) + r);

  return [top, ...Array(padY).fill(blank), ...body,
          ...Array(padY).fill(blank), bot].join('\n');
}
```

它**没处理**的：ANSI 颜色码、CJK / emoji 宽度、margin、对齐、标题、嵌套。但已经能画 ASCII 文本框——剩下 400 行都在补这些细节，这就是 boxen 不可替代的原因。

## 踩过的坑

1. **`text.length` 在中文 / emoji / 颜色场景下完全错**：`'你好'.length === 2` 但终端占 4 cell；`'\x1b[31mhi\x1b[0m'.length === 11` 但终端只显示 2 cell。必须用 `string-width` 测量真实显示宽度。

2. **wrap-ansi 是 boxen 的"暗侧"依赖**：朴素换行会把 `\x1b[31m` 切成两半让颜色失效，wrap-ansi 在每次换行时关闭当前色、下一行重新打开——任何处理终端字符串的库都绕不开。

3. **v6 改 ESM-only 是生态级断崖**：还停在 CommonJS 的项目必须用动态 `import()` 或卡在 v5。技术上正确，但不少旧 CLI 工具升级成本很高。

4. **嵌套 box 不友好**：把 boxen 输出再喂给另一个 boxen，外层宽度计算会被内层 ANSI 边框字符干扰，对不齐。boxen 假设输入是"内容"而非"已渲染的框"——要嵌套请改用 ink（React-for-CLI）。

## 适用 vs 不适用场景

**适用**：

- CLI 工具的 update 提示框 / 启动 banner / 错误高亮
- 一次性、文本短、只需要单层框的场景
- 想"省心地"画一个对齐好看的框，又不想自己处理 ANSI / CJK 宽度
- 配合 chalk（颜色）/ ora（spinner）做 CLI UI

**不适用**：

- 高频重绘（progress bar 每帧调用 → 用 ink 的 diff 渲染）
- 嵌套布局（box 套 box → 用 ink）
- 需要交互（按键响应、光标移动 → 用 inquirer / clack）
- CommonJS 项目且不能改成 ESM → 卡 v5 或换 cli-boxes 自己拼

## 历史小故事（可跳过）

- **2014 年**：Sindre Sorhus 写第一版，单边框样式，几十行代码
- **2017 年**：v2 加入 `backgroundColor` / `align` / `float`，开始有"框内排版"概念
- **2019 年**：v4 大重写，把换行能力交给独立的 `wrap-ansi` 包
- **2022 年**：v6 改成 ESM-only，全网 CLI 工具集体爆炸需要紧急升级
- **2024 年**：v8 加 `fullscreen` 自适应、`NO_COLOR` 环境变量自动检测

10 年里每个 major 版本都对应一次破坏性变更，semver 严格执行。

## 学到什么

1. **极致拆分** vs **打包内置**——Sindre 把 boxen / wrap-ansi / cli-boxes / string-width 拆成独立包，复用度高但依赖树深；要看场景选风格
2. **数据 / 逻辑分离**——cli-boxes 是纯数据（边框字符表），boxen 是纯逻辑（拼接），各自演进互不干扰
3. **底层能力共享**——`string-width` 把"字符宽度测量"做成全生态共享基础设施，所有终端工具都受益
4. **小而完整的库胜过大而全**——boxen 只做"单层框渲染"，嵌套 / 高频重绘交给 ink，这种边界感是健康开源的关键

## 延伸阅读

- 仓库 README：[sindresorhus/boxen](https://github.com/sindresorhus/boxen)（API 完整覆盖，无需另开 docs 站）
- 关键依赖：[wrap-ansi](https://github.com/chalk/wrap-ansi) / [cli-boxes](https://github.com/sindresorhus/cli-boxes) / [string-width](https://github.com/sindresorhus/string-width)
- Sindre 的"小而专"哲学博客：[blog.sindresorhus.com](https://blog.sindresorhus.com/)
- [[ink]] —— React-for-CLI，原生支持嵌套和 diff 渲染
- [[chalk]] —— Node 终端字符串上色的事实标准

## 关联

- [[chalk]] —— 给字符串加 ANSI 颜色，boxen 直接依赖它给边框上色
- [[ora]] —— 终端 spinner，常和 boxen 配套用做 CLI UI
- [[ink]] —— React-for-CLI，是 boxen 在嵌套 / 高频场景的替代
- [[clack]] —— 现代 CLI 交互组件库，boxen 思路的进化版
- [[commander]] —— Node CLI 参数解析，常作为 boxen 的上游入口
- [[listr2]] —— 终端任务列表，和 boxen 一样是 CLI UI 工具家族成员

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ora]] —— ora — 终端 spinner 用 ANSI 反复擦写同一行
- [[yargs]] —— yargs — Node.js 命令行参数解析的事实标准

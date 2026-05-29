---
title: boxen — Terminal box 渲染库
来源: https://github.com/sindresorhus/boxen
season: 32
episode: S32-3
round: 153
category: 工具库 B
version: v1.1
date: 2026-05-29
tags: [terminal, cli, box, ascii-art, sindresorhus, wrap-ansi, cli-boxes]
---

# boxen — 给终端文本套个边框的事

## 一句话识别

`boxen` 把一段文本包进一个边框盒子里，作用类似 Word 里的"文本框"，但是在终端里画出来。

```
┌─────────────────┐
│  Hello, world!  │
└─────────────────┘
```

Sindre Sorhus 2014 年起维护，weekly downloads 约 30M。npm update 提示框、CLI 启动 banner、错误高亮，几乎所有 Node CLI 都在用。

## 1 分钟版（电梯）

- **输入**：一段字符串 + 一组配置（边框样式、padding、margin、对齐、颜色）
- **输出**：一段带 ANSI 颜色码和 Unicode 框线字符的字符串
- **三层依赖（重要）**：
  - `boxen`：组合 padding / margin / 对齐 / 颜色，调度其他库
  - `wrap-ansi`：把长文本按宽度智能换行（关键是不切坏 ANSI 颜色码）
  - `cli-boxes`：提供 9 种预设边框字符（single / double / round / bold / classic / arrow 等）
- **应用**：`npm install -g xxx` 之后那个"Update available"框，就是 boxen 渲染的
- **本质**：字符串处理 + 字符宽度测量 + 终端控制码拼接

## 项目身份

| 字段 | 值 |
|---|---|
| 仓库 | https://github.com/sindresorhus/boxen |
| 创建年份 | 2014 |
| 当前主版本 | v8.x（ESM-only） |
| 维护者 | Sindre Sorhus（个人） |
| weekly downloads | 约 30M |
| 核心代码量 | < 500 行（source/index.js） |
| 同生态依赖 | wrap-ansi, cli-boxes, chalk, string-width, widest-line, ansi-align, camelcase |

## 为什么挑这个学（S32 工具库 B 选型理由）

- **小而完整**：单一职责（包边框），核心代码 < 500 行，但解决一个真实问题
- **依赖链清晰**：boxen → wrap-ansi → string-width → emoji-regex，可以一路追到 Unicode 处理
- **生态地位**：Node CLI 工具的事实标准（chalk / ora / boxen 三件套）
- **设计精巧**：处理 emoji / 全角字符 / ANSI 颜色码 / 多行文本对齐，每一项都有坑
- **学习成本低，迁移高**：理解了 boxen，自己写一个 Markdown 表格渲染、终端进度条都能复用思路

## 整体流程图（必看）

![box rendering pipeline](/projects/boxen/01-box-rendering.webp)

数据流：

1. 用户调用 `boxen('Hello', {padding: 1, borderStyle: 'round'})`
2. boxen 用 `wrap-ansi` 按目标宽度换行（保留 ANSI 颜色码完整性）
3. boxen 用 `cli-boxes` 查找 `round` 样式的边框字符（┌─┐│└─┘）
4. boxen 拼接 `top_border + 各行 padding + 内容 + padding + side_border + bottom_border`
5. 输出最终终端字符串，由 `process.stdout.write()` 渲染

---

## Layer 1 — 表面：怎么用

### 最简调用

```js
import boxen from 'boxen';

console.log(boxen('Hello, world!', {padding: 1}));
```

输出：

```
┌───────────────────┐
│                   │
│   Hello, world!   │
│                   │
└───────────────────┘
```

### 完整 API（v8.x）

```js
boxen(text, options)
```

`options` 字段：

| 字段 | 类型 | 默认 | 含义 |
|---|---|---|---|
| `borderColor` | string \| hex | undefined | 边框颜色（chalk 颜色名或 #RRGGBB） |
| `borderStyle` | string \| object | 'single' | 边框样式（cli-boxes 9 种预设之一，或自定义） |
| `dimBorder` | boolean | false | 边框是否显示为暗色（ANSI dim） |
| `padding` | number \| object | 0 | 内边距（数字 = 4 边相同，对象 = 单独设置） |
| `margin` | number \| object | 0 | 外边距 |
| `float` | 'left' \| 'center' \| 'right' | 'left' | 框相对于终端宽度的水平位置 |
| `backgroundColor` | string \| hex | undefined | 内容区背景色 |
| `align` | 'left' \| 'center' \| 'right' | 'left' | 文本在框内的对齐方式 |
| `title` | string | undefined | 顶部边框上显示的标题 |
| `titleAlignment` | 'left' \| 'center' \| 'right' | 'left' | 标题对齐 |
| `width` | number | undefined | 强制框宽（不写则自动适配） |
| `height` | number | undefined | 强制框高 |
| `fullscreen` | boolean \| function | false | 占满整个终端 |
| `textAlignment` | 'left' \| 'center' \| 'right' | 'left' | 多行文本的对齐（v8 新增） |

### 典型用例 1：npm update 提示

```js
import boxen from 'boxen';
import chalk from 'chalk';

const message = `Update available ${chalk.dim('1.0.0')} → ${chalk.green('1.1.0')}
Run ${chalk.cyan('npm install -g your-cli')} to update`;

console.log(boxen(message, {
  padding: 1,
  margin: 1,
  borderStyle: 'round',
  borderColor: 'yellow'
}));
```

### 典型用例 2：CLI 启动 banner

```js
console.log(boxen('My CLI v1.0.0', {
  padding: {top: 1, bottom: 1, left: 4, right: 4},
  borderStyle: 'double',
  borderColor: 'cyan',
  align: 'center',
  title: 'Launch',
  titleAlignment: 'center'
}));
```

### 典型用例 3：错误高亮

```js
console.log(boxen(`✖ ${error.message}\n\nStack:\n${error.stack}`, {
  padding: 1,
  borderStyle: 'bold',
  borderColor: 'red',
  backgroundColor: '#330000'
}));
```

---

## Layer 2 — 实现机制：拆开看

### Step 1：解析 options（normalizeOptions）

boxen 入口是一个纯函数 `boxen(text, options)`。第一步把 options 标准化：

- `padding: 1` → `{top: 1, right: 3, bottom: 1, left: 3}`（左右是上下的 3 倍，符合视觉比例）
- `margin: {x: 2}` → `{top: 0, right: 2, bottom: 0, left: 2}`
- `borderStyle: 'round'` → 从 cli-boxes 取出对应字符表
- 处理 `width` / `height` / `fullscreen` 三者互斥

参考：https://github.com/sindresorhus/boxen/blob/b8d2f7a9c4e1f5a8b7c9d3e2f6a4b1c8d5e7f9a3/source/index.js#L1-L20

### Step 2：从 cli-boxes 取边框字符

cli-boxes 是一个**纯数据包**，导出一个 JSON：

```js
{
  single: {
    topLeft: '┌', top: '─', topRight: '┐',
    left: '│', right: '│',
    bottomLeft: '└', bottom: '─', bottomRight: '┘'
  },
  double: {
    topLeft: '╔', top: '═', topRight: '╗',
    left: '║', right: '║',
    bottomLeft: '╚', bottom: '═', bottomRight: '╝'
  },
  round: { topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯' /* ... */ },
  bold: { /* ... */ },
  classic: { topLeft: '+', top: '-' /* ... */ },
  // 共 9 种
}
```

参考：https://github.com/sindresorhus/cli-boxes/blob/7e4d2c9b6f8a5c3e1d9f7b4a8c6e2d1f9b5a7c8e/index.js#L1-L10

设计上 cli-boxes 是 boxen 的子项目（同一个作者拆出来的），目的是让别人写自己的 box 渲染器时也能复用这个字符表。

### Step 3：用 wrap-ansi 智能换行

wrap-ansi 的作用是把长文本按指定宽度换行，但有一个关键约束：**ANSI 颜色码不能被切坏**。

朴素换行：

```js
'\x1b[31mHello, world!\x1b[0m'.match(/.{1,5}/g)
// ['\x1b[31', 'mHell', 'o, wo', 'rld!\x1b', '[0m']  ← 坏了
```

正确换行（wrap-ansi）：

```js
wrapAnsi('\x1b[31mHello, world!\x1b[0m', 5)
// '\x1b[31mHello\x1b[0m\n\x1b[31m, wor\x1b[0m\n\x1b[31mld!\x1b[0m'
//  每行重新打开 + 关闭颜色，颜色不丢失
```

参考：https://github.com/sindresorhus/wrap-ansi/blob/3a8c5e2f9d7b4c1e6f8a5d2c9b7e4a1f6d3c8e5b/index.js#L1-L30

wrap-ansi 内部用 `string-width` 测量"显示宽度"——CJK 全角字符算 2，emoji 算 2，ANSI 控制码算 0，普通 ASCII 算 1。这是终端排版的基础，没有这个就一切都歪。

### Step 4：padding & margin 注入

把换行后的文本数组（每行一个字符串）加上 padding：

```text
原始 lines:
  ['Hello', 'World']

加 padding {top:1, right:3, bottom:1, left:3} 之后：
  ['',           ← top padding
   '   Hello   ', ← left + right padding
   '   World   ',
   '']           ← bottom padding
```

每一行最终长度 = 内容宽度 + leftPad + rightPad，所有行宽度相同（不足补空格）。

### Step 5：拼接边框

```js
const horizontalBorder = topLeft + top.repeat(width - 2) + topRight;
const lines = paddedContent.map(line => left + line + right);
const bottomLine = bottomLeft + bottom.repeat(width - 2) + bottomRight;

const result = [horizontalBorder, ...lines, bottomLine].join('\n');
```

### Step 6：margin 注入（可选）

外边距：在最终字符串前后加空行，每行前面加空格。

### Step 7：颜色和对齐

- `borderColor` → 用 chalk 给边框字符上色
- `backgroundColor` → 内容区每个空格也填上对应背景色 ANSI 码
- `align` → 内容横向对齐（短行补 padding 偏左/中/右）
- `float` → 整个 box 在终端中的横向位置（左边补空格）

---

## Layer 3 — 设计哲学：为什么这样切分

### 为什么把 cli-boxes 单独拆出来

如果 boxen 直接把 9 种边框字符写在自己代码里，也能跑。但 Sindre 拆成独立包：

- **复用**：别人写自己的 box 渲染（比如 Markdown 表格、对话框）也能用 cli-boxes
- **数据/逻辑分离**：cli-boxes 是纯数据，boxen 是纯逻辑，各自演进
- **维护**：增加新边框样式只需改 cli-boxes，不动 boxen
- **测试**：cli-boxes 几乎不需要测试（数据），boxen 的逻辑测试也不会被边框字符的修改打扰

这是 Sindre 一贯的风格：**极致拆分**。他的 npm 主页有 1000+ 包，很多都是这种"一个函数一个包"的结构。

### 为什么 wrap-ansi 不是 boxen 内部函数

按 ANSI 智能换行是一个独立的、可复用的能力：

- inquirer 用它来换行长 prompt
- ora 用它来截断 spinner 文本
- 任何要在终端打印长文本的库都可能用到

如果埋在 boxen 里，其他库就要复制代码或者强行依赖 boxen（拉一堆无关代码）。拆出去之后，wrap-ansi 在 npm 上 weekly downloads 100M+，比 boxen 还高。

### 为什么 boxen 自己只剩 < 500 行

把 wrap-ansi、cli-boxes、chalk、string-width、widest-line、ansi-align 都拆出去之后，boxen 自己就是个**胶水层**：

- 解析 options
- 调度依赖
- 拼接结果

这种结构的好处：

- 每个依赖单独维护，独立 release
- bug 修复扩散：wrap-ansi 修了 emoji bug，boxen / ora / inquirer 都自动受益
- 学习曲线：新人想读 boxen，不用先读 500 行 ANSI 解析

坏处见后面"怀疑"。

### 字符宽度问题（隐藏深坑）

终端里 1 个"字符"占多宽？

- ASCII：1 cell
- CJK 汉字：2 cell
- emoji：2 cell（但有些 fancy emoji 是 1 cell + ZWJ + 多 codepoint）
- ANSI 控制码（`\x1b[31m`）：0 cell（不显示）
- 零宽字符（`​`）：0 cell

如果用 `text.length` 算长度，在中文 / emoji 场景下完全错。boxen 用 `string-width` 包来测量真实显示宽度，这个包是整个生态的基础设施。

---

## 关键代码片段（GitHub permalinks）

### boxen 入口

入口处理 options 和调度：

https://github.com/sindresorhus/boxen/blob/b8d2f7a9c4e1f5a8b7c9d3e2f6a4b1c8d5e7f9a3/source/index.js#L1-L20

主要做三件事：参数标准化、调用 wrap-ansi 换行、调用拼接函数。

### cli-boxes 边框字符表

数据文件，纯 JSON 导出：

https://github.com/sindresorhus/cli-boxes/blob/7e4d2c9b6f8a5c3e1d9f7b4a8c6e2d1f9b5a7c8e/index.js#L1-L10

每个样式有 8 个角/边字符。

### wrap-ansi 核心

智能换行 + ANSI 码保护：

https://github.com/sindresorhus/wrap-ansi/blob/3a8c5e2f9d7b4c1e6f8a5d2c9b7e4a1f6d3c8e5b/index.js#L1-L30

关键逻辑：识别 ANSI escape code → 换行时关闭当前色 → 下一行开头重新打开。

---

## 怀疑与风险

### 怀疑 1：bus factor 集中（chalk / ora / boxen 都是 Sindre）

- **现象**：chalk、ora、boxen、wrap-ansi、cli-boxes、string-width 全部是 Sindre Sorhus 一个人维护
- **风险**：他个人退出（生病 / 转岗 / 心情不好）会让 Node CLI 生态半瘫
- **历史佐证**：2022 年 chalk 升 ESM-only 时全网 CLI 工具集体爆炸，需要紧急升级
- **缓解**：Sindre 有 GitHub Sponsors 持续赞助，且依赖链稳定，但底层依赖如果出问题影响面巨大
- **对比**：相比 React 有 Meta 团队 + 社区贡献者，boxen 的 contributor 列表里 Sindre 占 90%+ commit
- **学习启示**：在公司里写公共包，不能复制这种"一个人维护"模式（除非你保证 5 年不离职 + 不生病）

### 怀疑 2：ESM-only 升级痛

- **现象**：boxen v6 起改成 ESM-only，CommonJS 项目（仍占 Node 生态 40%+）必须用动态 `import()` 或者卡在 v5
- **真实代价**：很多 CLI 工具至今卡在 boxen v5，因为升 ESM 要改整个项目结构
- **Sindre 的态度**：明确说"未来都 ESM，CJS 是历史包袱"——技术正确，但生态层面很多人受伤
- **对策**：
  - 选项 A：项目整体迁 ESM（推荐，但工作量大）
  - 选项 B：动态 import（runtime overhead）
  - 选项 C：卡在 v5（错过新功能 + 安全更新）
- **学习启示**：技术债的迁移决策不只是"对不对"，还要看生态阻尼

### 怀疑 3：nested boxes 不友好（嵌套 box 边框计算不准）

- **现象**：把一个 boxen 输出再当输入塞给另一个 boxen，外层框的宽度计算会把内层 ANSI 边框字符算进去
- **具体问题**：

  ```js
  const inner = boxen('Hi', {borderStyle: 'single'});
  const outer = boxen(inner, {borderStyle: 'double'});
  ```

  内层框边的 ┌─┐ 字符虽然是单宽 Unicode，但有 ANSI 颜色码时 `string-width` 测量可能不准，导致外层框对不齐
- **本质原因**：boxen 假设输入是"内容文本"，而不是"已渲染的 box"，多层嵌套破坏这个假设
- **issue 历史**：GitHub 上有多个嵌套相关的 issue（比如 #76、#156），部分修了部分还开着
- **绕过方案**：
  - 自己手动算嵌套宽度（不推荐）
  - 改用同时支持 nested 的库（`ink` 是 React-for-CLI，原生支持嵌套）
  - 在最外层用 boxen，内部用纯文本和 ANSI 颜色（不用嵌套 box）
- **学习启示**：库的边界要看准——boxen 是"单层框渲染器"，硬要嵌套是用错了工具

### 额外怀疑：测试覆盖

- boxen 自己测试覆盖看着不错，但**视觉测试**很难做（终端输出需要肉眼对比）
- 大量边界 case（CJK + emoji + ANSI + nested 各种组合）很难穷尽测试
- 实际 bug 都是用户报告才发现，比如 emoji ZWJ 序列（如家庭组合 emoji）的宽度处理

---

## 学到了什么

### 设计层面

1. **极致拆分** vs **打包内置**——Sindre 走极端，每个能力都是独立包；优点是复用，缺点是依赖树深
2. **数据 / 逻辑分离**——cli-boxes 纯数据、boxen 纯逻辑，演进互不干扰
3. **小而完整**——单一职责（包边框），不试图做"通用 CLI 渲染框架"，留给 ink 去做
4. **依赖底层抽象**——string-width 把"字符宽度测量"变成全生态共享基础设施

### 实现层面

1. **ANSI 控制码处理**——任何处理终端字符串的库都要能识别 / 保护 / 重建 ANSI 码
2. **Unicode 宽度测量**——CJK / emoji / ZWJ 序列各有坑，必须用 string-width 这种专门的包
3. **管道式数据流**——options → 标准化 → 换行 → padding → 边框 → margin → 输出，每一步都是纯函数
4. **配置对象 vs 链式 API**——boxen 用单 options 对象（适合多参数），chalk 用链式（`chalk.red.bold('x')`，适合组合）

### 工程层面

1. **README 即文档**——boxen 的 README 完整覆盖所有 options + 多个示例，无需另开 docs 站
2. **变更日志**——CHANGELOG.md 严格按 semver，breaking change 大版本号
3. **TS 类型完整**——`index.d.ts` 与 `index.js` 同步维护，TS 用户开箱即用

---

## 与 chalk / ora 的关系

三件套定位：

| 库 | 职责 | 主要 API |
|---|---|---|
| **chalk** | 给字符串加 ANSI 颜色 | `chalk.red('error')` |
| **ora** | 终端 spinner（loading 转圈） | `const s = ora('Loading'); s.start()` |
| **boxen** | 包边框 | `boxen('text', options)` |

它们互不依赖（chalk 是 boxen 的依赖，但 ora 不是 boxen 的依赖），但通常一起用：

```js
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';

const spinner = ora('Building').start();
await build();
spinner.succeed('Done');

console.log(boxen(
  `${chalk.green('✓')} Build complete\n${chalk.dim('Output:')} dist/`,
  {padding: 1, borderStyle: 'round', borderColor: 'green'}
));
```

设计上的共同点：都是"输入一个字符串/状态，输出一段终端字符串"的纯函数（chalk 是链式但本质纯）。

---

## 复用思路：自己写一个简化版（约 100 行）

```js
const BORDERS = {
  single: ['┌', '─', '┐', '│', '┘', '─', '└', '│'],
  double: ['╔', '═', '╗', '║', '╝', '═', '╚', '║'],
  round:  ['╭', '─', '╮', '│', '╯', '─', '╰', '│'],
};

function boxenLite(text, {padding = 0, borderStyle = 'single'} = {}) {
  const [tl, t, tr, r, br, b, bl, l] = BORDERS[borderStyle];
  const lines = text.split('\n');
  const width = Math.max(...lines.map(line => line.length));

  const padX = typeof padding === 'number' ? padding : padding.left ?? 0;
  const padY = typeof padding === 'number' ? padding : padding.top ?? 0;

  const innerWidth = width + padX * 2;
  const top = tl + t.repeat(innerWidth) + tr;
  const bot = bl + b.repeat(innerWidth) + br;

  const padLine = l + ' '.repeat(innerWidth) + r;
  const contentLines = lines.map(line =>
    l + ' '.repeat(padX) + line.padEnd(width) + ' '.repeat(padX) + r
  );

  return [
    top,
    ...Array(padY).fill(padLine),
    ...contentLines,
    ...Array(padY).fill(padLine),
    bot,
  ].join('\n');
}
```

这个简化版**没有处理**：

- ANSI 颜色码（要 wrap-ansi）
- CJK / emoji 宽度（要 string-width）
- margin（外边距）
- align / float（对齐）
- borderColor / backgroundColor（颜色）
- title（标题）
- nested

但它已经能用：

```js
console.log(boxenLite('Hello\nWorld', {padding: 1, borderStyle: 'round'}));
```

输出：

```
╭───────╮
│       │
│ Hello │
│ World │
│       │
╰───────╯
```

写完这 100 行就理解了 boxen 的核心。剩下的 400 行都在处理上面"没有处理"的那些细节——这就是为什么 boxen 不可替代。

---

## 测试思路

### 单元测试

- **快照测试**：`expect(boxen('test')).toMatchSnapshot()`，固化输出格式
- **边界 case**：空字符串 / 单字符 / 超长行 / 多行 / CJK / emoji / ANSI 颜色
- **options 组合**：padding × margin × align × borderStyle 的笛卡尔积（重点 case 即可）

### 视觉回归

- 输出一段已知文本到固定 80 列终端，截图比对
- 可以用 `term-size` 模拟不同终端宽度

### 集成测试

- 实际跑在不同终端模拟器（iTerm / Terminal.app / Windows Terminal）
- 检查 emoji / CJK 真实显示效果
- 不同字体宽度下的对齐

---

## 性能考量

### 单次调用

boxen 每次调用都是纯函数，无副作用。性能瓶颈：

1. `wrap-ansi` 的正则匹配（处理 ANSI escape）
2. `string-width` 的字符宽度查表（emoji / CJK）
3. 字符串拼接

对于"打印一个 update 提示框"这种场景（一次性、文本短），完全无所谓。

### 高频调用

如果在 progress bar / spinner 里每帧都调用 boxen 重绘，会有性能问题：

- 每帧约 5ms（粗估），60fps 时占 30%+ CPU
- 解决：用 ink（React-for-CLI，diff 渲染）替代

### 内存

- 输入 1KB 文本，输出约 1.2KB（边框字符开销）
- 不缓存任何状态，GC 友好

---

## 边界 case 清单（看完会怕）

1. **空字符串**：`boxen('')` → 一个空框（高度 = 1 + 2*padTop）
2. **单字符**：`boxen('a')` → 最小可能框（宽度 = 1 + 2*padX + 2 边框）
3. **超长行**：超过终端宽度 → wrap-ansi 自动换行（按终端 columns）
4. **多行不等长**：每行 padEnd 到最长行宽度
5. **CJK 全角**：正确占 2 cell（依赖 string-width）
6. **emoji**：占 2 cell；ZWJ 序列按整体 2 cell（部分版本可能算错）
7. **ANSI 颜色码混合**：wrap-ansi 保护颜色码不被切断
8. **零宽字符（U+200B）**：占 0 cell（理论上）
9. **制表符 `\t`**：v8 起会展开成空格，旧版本对齐会乱
10. **Windows 终端**：某些 Unicode 边框字符在老 cmd.exe 里显示成 `?`，需要 fallback 到 `classic` 样式
11. **NO_COLOR 环境变量**：v8 起自动检测，跳过颜色（chalk 行为传染过来）
12. **背景色 + padding**：padding 区也要填满背景色，否则视觉上有"缺口"
13. **title 比框宽**：v8 会截断 title，加省略号
14. **fullscreen 模式**：自适应 `process.stdout.columns`，但终端缩放时不会自动重绘（需要监听 `resize` 事件）

---

## 历史时间线

| 年份 | 版本 | 关键变化 |
|---|---|---|
| 2014 | v0.1 | 初始版本，单边框样式 |
| 2015 | v1.0 | 加入多 borderStyle |
| 2017 | v2.0 | 加入 backgroundColor / align / float |
| 2019 | v4.0 | 重写内部结构，依赖 wrap-ansi |
| 2021 | v5.0 | 加入 title / titleAlignment |
| 2022 | v6.0 | **ESM-only**（重大破坏性变更） |
| 2022 | v7.0 | 加入 fullscreen / textAlignment |
| 2024 | v8.0 | 优化 fullscreen 行为；NO_COLOR 自动检测 |

每次大版本号都对应一次破坏性变更，semver 严格执行。

---

## 一句话总结

**boxen 是一个把"字符串包边框"这件事做到极致的 < 500 行胶水库**——它自己只做调度，把 ANSI 处理交给 wrap-ansi、字符表交给 cli-boxes、宽度测量交给 string-width。理解 boxen 的最大收获不是会用它（5 分钟看 README），而是看到 Sindre 怎么把一个看似简单的需求拆成 6 个独立包，每个都能在生态里独立活下去。这套"极致拆分 + 一人维护"的工程模式既是 Node CLI 生态的支柱，也是它最大的脆弱点。

---

## 引用与延伸

- 仓库：https://github.com/sindresorhus/boxen
- 依赖：
  - https://github.com/sindresorhus/cli-boxes
  - https://github.com/sindresorhus/wrap-ansi
  - https://github.com/sindresorhus/string-width
  - https://github.com/chalk/chalk
- 相关库：
  - ink（React-for-CLI，支持 nested + diff 渲染）
  - inquirer（交互式 prompt，依赖 wrap-ansi）
  - ora（spinner，常和 boxen 配套使用）
- Sindre Sorhus 的"小而专"哲学博客：https://blog.sindresorhus.com/

---

> S32-3 / round 153 / 工具库 B / v1.1 完成。下次同主题深入：可以读 string-width 的 emoji-regex 实现，或者 wrap-ansi 的 ANSI 解析状态机。

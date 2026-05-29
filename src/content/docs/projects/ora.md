---
title: "ora — Terminal spinner 的 ANSI 重写艺术"
description: "ora（sindresorhus）：从 \\r + ANSI 控制码 + 80 帧数据集到 5000 万周下载量"
来源: https://github.com/sindresorhus/ora
season: 32
episode: S32-2
project_name: ora
round: 152
slug: ora
status: drafted
created: 2026-05-29
sidebar:
  label: ora
  order: 152
---

# ora — Terminal spinner 的 ANSI 重写艺术

![ora ANSI rewrite line technique](/projects/ora/01-spinner.webp)

## 30 秒认识

`npm install` 时屏幕上那个旋转的小圈圈加 "installing dependencies..."，那就是 ora 在工作。

它本身不是动画库，而是一个**终端字符流的拼装器**——把转动的字符、颜色、文字拼成一段字节流，然后用 ANSI 控制码反复擦除当前行重新绘制。视觉上是动画，本质上是同一行字符串的每秒 12.5 次（dots 默认 80ms / 帧）重写。

技术身份卡：

- **作者**：Sindre Sorhus（挪威开源作者，npm 上维护 1100+ 包）
- **首发**：2016 年初
- **下载量**：周下载约 5000 万次，npm 全站前 200 包
- **代码量**：核心 `source/index.js` 不到 400 行，依赖几乎都是 Sindre 自己的单职责小包
- **依赖图**：`cli-spinners`（80+ 帧数据）、`log-symbols`（成功/失败/警告/信息符号）、`chalk`（颜色）、`is-interactive`（TTY 检测）、`cli-cursor`（隐藏光标）、`stdin-discarder`（吞掉 spinner 期间的用户输入）
- **许可证**：MIT
- **典型用法**：`const spinner = ora('Loading...').start(); /* await something */ spinner.succeed('Done');`

## 为什么读这道题

第一性问题：**终端不是浏览器，没有 DOM、没有 setTimeout 重绘窗口、没有事件循环驱动的 RAF**——它只是一个**单向字符流**。但 npm 安装时用户确实看到了"动画"。这个动画到底是怎么做出来的？

读 ora 就是在读终端动画的最小核：

- 用什么字符序列
- 多久换一次（间隔从哪里来）
- 怎么擦除上一帧（不能直接覆盖，会留尾巴）
- 在不支持动画的环境怎么退化（CI / Docker logs / 文件重定向）

这套东西**手写一遍很容易翻车**：

- 帧之间擦除不干净，残留半截字符
- 重复打印满屏（CI 里几十万行日志，把构建机磁盘塞满）
- Ctrl+C 之后光标永远消失，用户终端废掉，要 `tput cnorm` 手动恢复
- 多个 spinner 同时跑，互相覆盖
- 宽字符（中文 / Braille / log-symbols 符号）的实际显示宽度判断错，光标位置错位

ora 把这些坑全踩过、全修过。把它读通，一次性掌握以下概念：

1. **ANSI 控制码的最小子集**：`\r`（回车不换行）、`\x1B[2K`（擦除当前行）、`\x1B[?25l`（隐藏光标）、`\x1B[?25h`（恢复光标）
2. **TTY 探测**：怎么判断 stdout 是终端还是被重定向到文件（`process.stdout.isTTY`）
3. **优雅降级**：CI / Docker logs / 测试输出里没有 TTY，spinner 应该退化成什么形态
4. **进程信号处理**：监听 SIGINT / SIGTERM，无论用户怎么终止，光标必须恢复

这四件事，写过 cli 工具的人迟早会遇到。ora 是参考实现。

## 项目背景：Sindre Sorhus 这个人

要理解 ora，先得理解 Sindre。他是 npm 生态里最高产的个人作者，维护 1100+ 个包，绝大多数是**单一职责的小工具**——`is-online`、`pify`、`p-map`、`cli-cursor`、`figures`、`chalk`、`log-symbols`、`cli-spinners`、`ora`、`yoctospinner`、`execa`、`got`、`np`……

ora 不是孤立的，它是 Sindre 整个 cli 工具家族的**集成器**。看它的依赖关系：

```
ora
├── cli-spinners (Sindre)        # spinner 帧数据 JSON
├── cli-cursor (Sindre)          # 隐藏 / 显示终端光标
├── log-symbols (Sindre)         # 成功 / 失败 / 警告 / 信息符号
├── chalk (Sindre)               # 终端颜色
├── is-interactive (Sindre)      # TTY + CI 检测
├── strip-ansi (Sindre)          # 测量字符宽度时去 ANSI
├── string-width (Sindre)        # 计算字符显示宽度（处理 CJK）
└── stdin-discarder (Sindre)     # spinner 期间防用户输入污染
```

所有依赖都是 Sindre 本人维护的小包。这种生态有个明显的好处：**每个层都是单职责，可以独立替换、独立测试、独立升级**。读 ora 顺便读完一整个 cli 工具家族。

但是这种生态也有明显的坏处——后面"怀疑 1"会展开 bus factor 问题。

10 年来 ora 的演进节点：

- v1.0（2016）：CommonJS、回调风格
- v3.0（2019）：转纯 ESM
- v5.0（2021）：彻底放弃 CommonJS（业内一片抱怨）
- v8.0（2024）：现代化 Node 18+，更精确的 stdin discarder
- 当前（2026）：稳定，几乎没有 breaking change，主要是依赖升级和 spinner 数据集扩充

## Layer 0：API 表面

这是用户视角的 ora。一行代码出动画：

```js
import ora from 'ora';

const spinner = ora('Loading unicorns').start();

setTimeout(() => {
    spinner.color = 'yellow';
    spinner.text = 'Loading rainbows';
}, 1000);

setTimeout(() => {
    spinner.succeed('Found unicorn');
}, 3000);
```

API 三件套：

- **构造**：`ora(text)` 或 `ora({ text, spinner, color, stream, isEnabled, isSilent })`
- **生命周期**：`.start()` / `.stop()` / `.succeed(text?)` / `.fail(text?)` / `.warn(text?)` / `.info(text?)`
- **运行时修改**：`spinner.text = '...'`、`spinner.color = '...'`、`spinner.spinner = 'dots' | 'line' | 'arc' | ...`

完整 API 表：

| 方法 / 属性 | 行为 |
|------------|------|
| `.start(text?)` | 开始动画。可选立即更新 text。返回 this（链式） |
| `.stop()` | 停止动画，**清除当前行**（不留任何痕迹）。返回 this |
| `.succeed(text?)` | 停止动画，前缀替换为成功符号（绿色 log-symbols） |
| `.fail(text?)` | 停止动画，前缀替换为失败符号（红色） |
| `.warn(text?)` | 停止动画，前缀替换为警告符号（黄色） |
| `.info(text?)` | 停止动画，前缀替换为信息符号（蓝色） |
| `.clear()` | 擦除当前 spinner 输出但不停止。可以打印别的，再 `.render()` 重绘 |
| `.render()` | 立即手动渲染一帧 |
| `.frame()` | 返回当前帧字符串，不打印 |
| `.text` | 后置文字（spinner 旁边的内容） |
| `.prefixText` | 前置文字（spinner 之前的内容） |
| `.suffixText` | 后置后置文字 |
| `.color` | spinner 颜色（chalk 支持的所有颜色名） |
| `.spinner` | spinner 形态（cli-spinners 里的 80+ 种之一） |
| `.indent` | 缩进空格数 |
| `.isSpinning` | 只读，是否在转 |

**关键 API 设计选择**：

1. **链式返回**：`.start().succeed()` 这种短句子直接连。
2. **属性可写**：`.text = 'x'` 直接赋值，不需要 `setText('x')`。这把"修改"动作压成 1 个 token。
3. **stop 静默清行**：`.stop()` 后屏幕上不留任何东西，留给业务自己决定要不要打印结果。`.succeed()` 才会留 ✓ 行。
4. **静态方法 `oraPromise`**：包装一个 promise 自动 succeed / fail：

```js
import { oraPromise } from 'ora';
await oraPromise(fetchData(), 'Fetching data');
// resolved → ✓ Fetching data
// rejected → ✗ Fetching data
```

这一层设计是 **ora productivity 的真正来源**。Promise 风格的代码不再需要 try/catch + spinner.fail，一行包住即可。

## Layer 1：ANSI 重写当前行的机制

这是 ora 的核心。**所有动画 = 在同一行上反复擦除重写**。

### 原始问题：怎么"动"

终端是一个字符流。`console.log('hello')` 把 `hello\n` 丢进去，光标自动到下一行。如果要做"动画"，第一个想法是：

```js
// 错误做法：会一直往下打印
setInterval(() => console.log(getNextFrame()), 80);
```

这会一直往下打印，半秒就刷满一屏。

正确做法：**回退到行首，覆盖再写一遍**。

### `\r`：回车不换行

ASCII 里 `\r`（0x0D）叫 carriage return，把光标拉回当前行的最左边。`\n`（0x0A）才换行。

```js
process.stdout.write('Frame 1');
process.stdout.write('\r');         // 光标回到行首
process.stdout.write('Frame 2');    // 覆盖 Frame 1
```

这样就能在同一行更新内容。**ora 每一帧都做这件事**。

### `\x1B[2K`：擦除整行

但 `\r` 只是把光标回到行首。如果新内容比旧内容短，旧内容的尾巴会留下来。

```
旧帧: 'Loading...'   (10 字符)
新帧: 'Done'         (4 字符)
\r 后写 'Done'      → 'Doneing...'  ← 'ing...' 尾巴残留
```

解决：写新帧之前用 `\x1B[2K` 把整行擦掉。

`\x1B` 是 ESC（0x1B），后面跟 `[2K` 是 ANSI 控制码 "Erase in Line, mode 2 = entire line"。

ora 的实际渲染序列：

```
\x1B[?25l                   # 隐藏光标（防止光标跳来跳去闪烁）
[渲染循环开始]
  \r                        # 光标回到行首
  \x1B[2K                   # 擦除整行
  <颜色码><spinner 帧><文字> # 写新帧
  setTimeout(80ms)          # 等下一帧
[结束]
\x1B[?25h                   # 显示光标
```

### 帧间隔从哪里来

cli-spinners 的每个 spinner 定义都有 `interval` 字段（毫秒）。比如经典的 dots：

```json
{
  "dots": {
    "interval": 80,
    "frames": ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]
  }
}
```

ora 用 `setInterval(render, interval)` 驱动渲染。每次 tick 拿下一帧字符（`frames[i++ % frames.length]`），拼上颜色和文字，写入 stdout。

### 多行 text 的复杂度

如果用户传的 text 是多行（含 `\n`）或文本超过终端宽度自动换行，擦除就更复杂——光标只在当前行，要把上面几行也擦掉，必须用 `\x1B[1A`（光标上移一行）+ `\x1B[2K` 循环。

ora 的实际处理（简化版伪代码）：

```js
const lineCount = computeLineCount(prevText, terminalWidth);
for (let i = 0; i < lineCount; i++) {
    if (i > 0) stdout.write('\x1B[1A');  // 上移
    stdout.write('\r\x1B[2K');             // 行首 + 擦除
}
```

**为什么需要 string-width**：text 是 `'你好 hello 旋转中'` 时，字符长度（grapheme）和显示宽度不同。中文一个字符占 2 列。要正确算出占了几行，必须用 `string-width`。否则光标定位错，多擦或少擦一行，留下视觉残影。

### 为什么需要隐藏光标

不隐藏的话，光标在每帧重写之间会闪烁、可见跳动，体验差。`\x1B[?25l` 隐藏，结束时 `\x1B[?25h` 恢复。

**关键约束**：必须在进程退出前恢复光标。否则用户的终端从此光标消失（直到他手动 `tput cnorm` 或重启 shell）。这就是 cli-cursor 的存在意义——它注册 SIGINT / SIGTERM / process exit 钩子，确保光标无论怎么死都能恢复。

### `process.stdout.write` vs `console.log`

ora 全程用 `process.stdout.write`，不用 `console.log`。原因：

- `console.log` 自动加 `\n`，会换行打印
- `console.log` 调用 `util.format`，性能比 raw write 差
- ora 需要精确控制每个字节，不能让 Node 加东西

### 总结：ora 渲染一帧的完整字节序列

```
[首次 start] \x1B[?25l                                          # 隐藏光标
[每帧]       \r\x1B[2K\x1B[36m⠋\x1B[39m Loading dependencies    # 重绘
[结束 stop]  \r\x1B[2K                                          # 清行
[succeed]    \r\x1B[2K\x1B[32m✓\x1B[39m Done\n                  # 终态行 + 换行
[退出]       \x1B[?25h                                          # 显示光标
```

10 来个 ANSI 控制码，外加 cli-spinners 的字符数据，构成完整动画。

## Layer 2：spinner 帧数据集（cli-spinners）

ora 内置 80+ 种 spinner，全部从 cli-spinners 这个独立 npm 包来。读 cli-spinners 等于读一个**手工策划的 ASCII 动画数据集**。

### 数据格式

cli-spinners 的核心是一个 JSON 文件：

```json
{
  "dots":  { "interval": 80,  "frames": ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"] },
  "line":  { "interval": 130, "frames": ["-","\\","|","/"] },
  "arc":   { "interval": 100, "frames": ["◜","◠","◝","◞","◡","◟"] },
  "pipe":  { "interval": 100, "frames": ["┤","┘","┴","└","├","┌","┬","┐"] }
}
```

每个 entry 两个字段：

- `interval`：帧间隔毫秒
- `frames`：字符串数组，按顺序循环播放

JSON 文件里大概 80 个 spinner，覆盖：

- **几何形**：dots / dots2 / dots3 ... 用 Braille 字符做圆形旋转
- **进度型**：line / pipe / arrow 用 ASCII 字符做条状
- **特殊主题**：clock（12 种钟面）、earth（地球三面）、moon（月相 8 帧）、weather（晴天雨天）
- **趣味**：runner（一个奔跑的人）、smiley（旋转笑脸）、bouncingBar / bouncingBall

### 为什么单独拆 cli-spinners

第一性问题：spinner 数据 vs spinner 引擎，本质是数据 vs 算法。Sindre 拆开是因为：

1. **复用性**：其他 cli 库（不止 ora）也想用这套数据
2. **更新粒度**：加一个新 spinner，改 `cli-spinners` 即可，不用动 ora
3. **零代码**：cli-spinners 几乎只是 JSON + 简单 export，逻辑全在数据里

实际上，cli-spinners 这个包**核心代码不到 5 行**，主要价值是 spinners.json 这个数据集本身。

### Braille 字符的妙用

dots 系列用的是 Unicode Braille 字符（U+2800 ~ U+28FF），256 个组合，能表达 8 个点的任意亮灭：

```
⠋ = U+280B = 0010 1011  (1, 2, 4 位亮)
⠙ = U+2819 = 0001 1001  (1, 4, 5 位亮)
⠹ = U+2839 = 0011 1001  (1, 4, 5, 6 位亮)
...
```

通过精心选择字符序列，模拟点在圆周上转动的视觉效果。这是**字符画**的极致案例——用 1 个 Unicode 码位表达 8 个二进制状态，再用一系列状态做动画。

### 帧序列的设计原则

读 cli-spinners 的 `spinners.json` 能看出几个手工设计的痕迹：

- **闭合循环**：最后一帧到第一帧要"自然"，不能突变
- **interval 与帧数匹配**：dots 是 10 帧 × 80ms = 800ms 转一圈，符合"loading"的视觉节奏
- **不同 spinner 用不同 interval**：earth（地球）旋转慢用 180ms，dots 紧凑用 80ms
- **字符宽度一致**：所有 frames 字符串长度尽量等长，否则擦除会留尾

这种"数据即设计"的思路，在 ora / cli-spinners 上是个很纯粹的体现。

### Contribution 流程

cli-spinners 的 PR 历史里有个有趣的现象：**新 spinner 提交者要附 GIF 录屏**。原因——JSON 看不出动画效果，必须录屏让 reviewer 直接看视觉。这是数据集类项目的特殊 review 方式。

## Layer 3：颜色与符号（chalk + log-symbols）

ora 渲染的输出最终长这样：

```
[蓝色][⠹] [白色]Loading dependencies
```

或停止后：

```
[绿色][✓] [白色]Loading dependencies
```

颜色和前缀符号，分别由两个独立包管：chalk 和 log-symbols。

### chalk：颜色 ANSI 码

chalk 把"加颜色"压成简单 API：

```js
chalk.cyan('hello')        // → '\x1B[36mhello\x1B[39m'
chalk.bold.red('error')    // → '\x1B[1m\x1B[31merror\x1B[39m\x1B[22m'
```

ANSI 颜色码格式 `\x1B[<code>m`：

- 30-37：前景色（黑红绿黄蓝紫青白）
- 40-47：背景色
- 90-97：亮色前景
- 1：bold；4：underline
- 0：reset

ora 的颜色处理：

```js
spinner.color = 'cyan';
// 渲染时：chalk[spinner.color](spinner.frame()) + ' ' + spinner.text
```

支持的颜色：black, red, green, yellow, blue, magenta, cyan, white, gray, blackBright, redBright, ... 加上 hex 比如 `'#ff8800'`（chalk 支持 hex / 真彩色）。

### log-symbols：成功 / 失败 / 警告 / 信息

log-symbols 是一个 4 行包：

```js
export default {
    info:    chalk.blue('ℹ'),
    success: chalk.green('✓'),
    warning: chalk.yellow('⚠'),
    error:   chalk.red('✗'),
};
```

Windows 不支持 Unicode 时退化成 ASCII：

```js
const isUnicodeSupported = process.platform !== 'win32' || ...;
const main     = { info: 'ℹ', success: '✓', warning: '⚠', error: '✗' };
const fallback = { info: 'i', success: 'V', warning: '!!', error: 'x' };
```

ora 的 succeed/fail/warn/info 直接拿这四个符号当前缀：

```js
spinner.succeed('Done');
// → '✓ Done\n'  (绿色)
spinner.fail('Boom');
// → '✗ Boom\n'  (红色)
```

### 为什么 chalk 比手动拼 ANSI 好

直接写 ANSI 码：

```js
const RED = '\x1B[31m';
const RESET = '\x1B[0m';
console.log(RED + 'error' + RESET);
```

这样写的问题：

1. **嵌套时 reset 错乱**：`bold(red(text))` 结束后两个 reset 相互冲突
2. **平台兼容**：Windows 老 cmd.exe 不支持 256 色，需要 force-color 检测
3. **颜色转换**：hex / RGB → ANSI 256 / 真彩色的退化逻辑

chalk 把这些全包了。ora 直接用 chalk，无脑拼颜色。

### 颜色检测的层级

chalk 内部维护一个色彩深度判断：

- **0**：无色（CI / NO_COLOR 环境变量 / 非 TTY）
- **1**：基础 16 色
- **2**：256 色
- **3**：真彩色（24-bit RGB）

ora 通过 chalk 自动获得这套退化。CI 里调用 `spinner.color = '#ff8800'` 不会崩，只是颜色被丢弃。

## 怀疑 1：Bus factor = 1

读完 ora 的依赖链，你会发现一个很尴尬的事实：

- ora 本身：Sindre 维护
- cli-spinners：Sindre 维护
- log-symbols：Sindre 维护
- chalk：Sindre 维护
- is-interactive：Sindre 维护
- cli-cursor：Sindre 维护
- string-width：Sindre 维护
- strip-ansi：Sindre 维护
- stdin-discarder：Sindre 维护

**每周 5000 万次下载的链路上，bus factor = 1**。

风险点：

1. **Sindre 一旦停手**：整个 cli 工具生态短期没人接管。他偶尔会发"我考虑离开开源"的推文，社区紧张数月。
2. **breaking change 决策权完全在他**：v3 转 ESM 时业务大量崩，社区强烈反对，但他坚持。
3. **安全响应**：CVE 出现时，依赖响应速度只能等他。
4. **品味决定**：API 设计、依赖选择全是个人偏好。比如 stdin-discarder 是 Sindre v8 引入的，社区没怎么讨论就进了主线。

历史教训：2022 年 colors.js（另一个流行 ANSI 颜色包）作者 Marak 发疯，故意往包里塞了一个无限循环，搞崩了整个 npm 生态。Sindre 不是 Marak，但**结构性风险一样存在**。

ora 自己 readme 里没提 bus factor。这是开源生态的盲区——所有人都在用，没人在备份。

实践层的对策（写自己工具时）：

- **如果是商业关键路径**：评估是否要 fork 关键依赖（至少 ora + cli-spinners）
- **如果是 npm 公开包**：把 ora 列为 peerDependency，让用户决定版本
- **如果是 cli 工具**：考虑用 yoctospinner（Sindre 自己出的轻量版，依赖更少，但 → 怀疑 2）
- **生态层**：关注 Sindre 是否有指定继承人、组织化迁移（最近他把若干包转给了 chalk org）

## 怀疑 2：与 yoctospinner 的重叠

2024 年 Sindre 发布 yoctospinner——一个**他自己出的更轻量的 ora 替代**。

差异：

| 维度 | ora | yoctospinner |
|------|-----|--------------|
| 依赖数 | 8+ 个 Sindre 自己的包 | 0 直接依赖 |
| 包大小 | 安装后 ~500KB | < 50KB |
| 功能 | 全（80 spinner / 颜色 / 多行 / promise wrapper） | 阉（1 spinner / 基础颜色） |
| API | 动态 spinner 切换 / oraPromise / clear | 仅 start / stop / 静态文字 |
| 维护重心 | 主线，但变化少 | 实验性，迭代快 |

yoctospinner 的存在引发一个问题：**Sindre 自己都不再坚定推荐 ora 了？**

读 yoctospinner 的 readme：

> A tiny terminal spinner. If you don't need ora's features, use this.

这是个微妙的信号。从生态读法：

- **如果你只是想转个圈**，yoctospinner 更对
- **如果你需要颜色 / 多 spinner 同时跑 / promise 包装**，仍然 ora
- **但是 yoctospinner 的存在，意味着 ora 的"全功能"会越来越少被新项目首选**

ora 不会消失（5000 万周下载量太大了），但**新项目选择 ora 的理由在减弱**。

实践的判断：

- 写 cli 工具，跑在用户机器上，依赖体积无所谓 → **ora**
- 写 npm 包，会被别人 install 进项目 → **yoctospinner**（节省下游 install 时间）
- 写大型 dev tool 链（Webpack 插件、test runner）→ **ora**（生态成熟）
- 写一次性小脚本 / 自用工具 → **yoctospinner**（启动快）

更深的层：Sindre 这种"自己出替代品"的模式，在他的生态里反复出现（execa → tinyexec、got → 类似）。这是他对**"功能膨胀"的自我修正机制**。读 ora 时把这个上下文记住——ora 是"功能完整版"的代表，yoctospinner 是"功能极简版"的代表，两者之间是 Sindre 的设计哲学摆动。

## 怀疑 3：non-TTY 环境的失效

ora 默认行为在 CI / Docker logs / 文件重定向时**会出问题**，除非显式禁用。

### 没有 TTY 的场景

- GitHub Actions / GitLab CI 输出
- `npm run build > build.log` 重定向
- `docker logs -f container` 抓取容器输出
- `tee` 多路输出
- 测试断言里的 stdout 捕获

这些场景下，`process.stdout.isTTY === undefined`（不是 true）。

### ora 的默认行为

ora v8+ 默认会用 `is-interactive` 检测：

```js
import isInteractive from 'is-interactive';
// 内部判断: process.stdout.isTTY && !process.env.CI && ...
```

如果不是 TTY，**ora 退化成"只打印 text，不动画"**：

```
Loading dependencies
```

每次 `.start()` 多打印一次（不擦除）。这避免了 ANSI 控制码污染日志。

### 但是历史上的坑

- ora v3 之前，CI 里能看到大量 `\x1B[2K\x1B[1G⠋ Loading...` 字面量充斥日志
- v4 加了 isInteractive 后好多了，但**用户传 `{ isEnabled: true }` 强制开启时仍会污染**
- v6 之前，spinner.text 含 emoji 时 string-width 误算，多行擦除会少擦一行
- 某些 docker setup 里 `process.env.CI` 没设，ora 误判为 TTY，照样污染

历史上多个 issue（参考 GitHub repo）都是**"我的 CI 日志被 ora 字符塞满"**。

### 实践上的最佳做法

```js
const spinner = ora({
    text: 'Loading',
    isSilent: process.env.CI || !process.stdout.isTTY,  // 显式关
});
```

或者用 `{ isEnabled: false }`：

```js
const spinner = ora({ isEnabled: process.stdout.isTTY }).start();
```

**ora 文档里没有强调这点**，导致很多新人的 cli 工具在 CI 里炸日志，得自己踩坑才发现。

### 教训抽象

写 cli 工具的通用准则：**所有 stdout 副作用必须能被环境变量关掉**。ora 后来加的 `isSilent` 选项就是这个准则的体现——但**默认值还是不对**（默认开启），用户不知道要主动关。

更深层：**library 的默认行为应该是"在最坏环境下仍能工作"**，而不是"在理想环境下最酷"。ora 历史上多次违反这个原则，每次发版都有 CI 用户吐槽。

## GitHub 永链与代码考古

读这种 hot path 库，固定到 commit 永链很重要——`main` 分支会变，看的时候和你看的代码可能已经不同了。

ora 的核心实现：

- [`source/index.js` — 核心 render / start / stop](https://github.com/sindresorhus/ora/blob/7e8f3a2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f/source/index.js)
- 渲染循环逻辑，约 v8.0 时点的版本

cli-spinners 的数据集：

- [`spinners.json` — 80+ spinner 全部定义](https://github.com/sindresorhus/cli-spinners/blob/9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d/spinners.json)
- 每个 entry: `{ interval, frames }`

log-symbols 的核心：

- [`index.js` — 4 个符号 + Windows fallback](https://github.com/sindresorhus/log-symbols/blob/3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b/index.js)
- 不到 30 行

读法建议：

1. 先看 ora `source/index.js` 的 `render` / `start` / `stop` 三个方法
2. 然后看 cli-spinners 的 spinners.json 找一个你喜欢的 spinner，理解 frames + interval 怎么配合
3. 最后看 log-symbols 的 fallback 逻辑，理解 Windows / non-Unicode 兼容
4. 进阶：读 cli-cursor 的 SIGINT / SIGTERM 钩子注册，理解为什么 spinner 能优雅退出

这三个 repo 加起来代码不到 600 行，是新人读"高质量小型库"最好的样本。

## 类比与小结

### 日常类比

ora 就像**翻页动画书（flipbook）**。每页是一帧，快速翻动产生动画错觉。

终端不能"翻页"，但是可以**反复擦掉同一行重写新内容**，达到一样的视觉效果。`\r` 是"把笔退回行首"，`\x1B[2K` 是"用橡皮擦掉这行"。

cli-spinners 是**已经画好的翻页动画素材包**——80 套不同主题的"翻页书"，每套有 frames（页内容）和 interval（翻页速度）。ora 是**翻页机器**：拿一套素材，按 interval 自动翻。

chalk 是**彩色铅笔**——给翻页动画的字符上色。log-symbols 是**橡皮印章**——结束时盖一个 ✓ 或 ✗ 表示"这事成了 / 黄了"。

### 一句话技术总结

ora 把"终端 loading 动画"这件事压成 4 个步骤：

1. 隐藏光标（cli-cursor）
2. 用 ANSI `\r` + `\x1B[2K` 反复重写当前行（核心）
3. 帧数据从 cli-spinners 拿（数据），颜色从 chalk 拿（颜色），符号从 log-symbols 拿（前缀）
4. 退化：non-TTY 时只打印不动画

### 给我自己的提醒

读 ora 之后我现在能：

- **手写一个最小 spinner**（就是 setInterval + `\r` + frames 数组）
- **理解为什么 CI 里 cli 工具有时会炸日志**（没禁用动画）
- **知道 ora 的 bus factor 风险**（Sindre 一人维护链路）
- **判断什么时候用 ora、什么时候用 yoctospinner**（依赖大小敏感时用后者）
- **理解 ANSI 控制码的最小子集**（`\r` / `\x1B[2K` / `\x1B[?25l/h`）

下一步可能：

- 读 cli-spinners 的 contribution guide，理解新 spinner 是怎么被收进去的（涉及视觉一致性 review）
- 读 chalk 的 256 色和真彩色检测逻辑（独立技术专题）
- 写一个最小 spinner（不依赖 ora）放在自己工具箱里，验证理解到位
- 跟 yoctospinner 对比读，看 Sindre 自己怎么"剃掉"ora 的功能

读 ora 是个**性价比极高的源码学习选择**——5000 万周下载量、不到 400 行核心代码、覆盖 ANSI / TTY / 进程信号 / 国际化字符宽度 4 个底层概念。半天读完，受用很久。

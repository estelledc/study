---
title: ora — 终端 spinner 用 ANSI 反复擦写同一行
来源: 'https://github.com/sindresorhus/ora'
日期: 2026-05-30
分类: 命令行工具
难度: 初级
---

## 是什么

ora 是一个 **Node.js 终端 spinner 库**——`npm install` 时屏幕上那个旋转的小圈圈加 "installing dependencies..."，就是它在工作。日常类比：像**翻页动画书**，每页是一帧字符，快速翻动就出现了"动画"。

终端没法真的翻页，但 ora 用了等价的把戏：**在同一行上反复擦掉再写新内容**。视觉上是动画，本质上是同一行字符串每秒重写十几次。

```js
import ora from 'ora';
const spinner = ora('Loading').start();
setTimeout(() => spinner.succeed('Done'), 2000);
```

三行代码出动画。周下载量约 5000 万次，npm install / Vite / 各种 CLI 工具都在用。

## 为什么重要

不理解 ora 这种"在终端做动画"的把戏，下面这些事都没法解释：

- 为什么 CI 日志里有时会冒出 `\x1B[2K\x1B[1G⠋ Loading...` 这种乱码——spinner 没禁掉
- 为什么 Ctrl+C 强杀 CLI 后终端光标消失，要敲 `tput cnorm` 才回来——退出钩子没跑
- 为什么 ora 一行 `.start().succeed()` 能链式写而不会出大段重复代码——API 设计的极简
- 为什么 spinner 含中文字时偶尔留视觉残影——字符显示宽度算错了

## 核心要点

ora 的核心机制可以拆成 **三件事**：

1. **回到行首再覆盖**：用 ASCII 控制字符 `\r`（回车不换行）把光标拉回当前行最左边，再写新内容。类比："把笔退回这行开头继续写"。

2. **擦除整行避免残留**：如果新内容比旧内容短（"Done" 短于 "Loading..."），尾巴会留下来。所以写新帧前先用 ANSI 控制码 `\x1B[2K` 把整行擦干净。类比："拿橡皮擦整行再写新字"。

3. **隐藏光标 + 退出恢复**：每帧重写之间光标会闪跳，所以用 `\x1B[?25l` 隐藏开始、`\x1B[?25h` 退出恢复。**必须**注册 SIGINT / SIGTERM 钩子，否则用户 Ctrl+C 后光标永远消失。

三件事加 cli-spinners 的 80+ 套帧数据集，组成完整 spinner 体验。

## 实践案例

### 案例 1：最小三行用法

```js
import ora from 'ora';
const spinner = ora('Loading unicorns').start();
await fetchSomething();
spinner.succeed('Found unicorn');
```

**逐部分解释**：

- `ora('Loading unicorns')` 构造 spinner 对象，传入文字
- `.start()` 开始动画——立刻隐藏光标、启动 setInterval 每 80ms 重绘一帧
- `.succeed('Found unicorn')` 停止动画，把前缀替换成绿色 `✓` 符号留一行

链式调用：`.start()` 和 `.succeed()` 都返回 this，可以串起来。

### 案例 2：oraPromise 包 promise 自动 succeed/fail

```js
import { oraPromise } from 'ora';
await oraPromise(fetch('/api/data'), {
  text: 'Fetching data',
  successText: 'Got data',
  failText: 'Network error',
});
```

**逐部分解释**：

- `oraPromise(p, opts)` 内部 `start()` → `await p` → resolve 时 `succeed`、reject 时 `fail` 后 rethrow
- 省掉手写 try/catch + spinner.fail 的模板代码
- promise 抛错仍会冒泡，业务可以继续 catch；spinner 只是副作用

### 案例 3：手写最小 spinner（验证你读懂了）

```js
const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
let i = 0;
process.stdout.write('\x1B[?25l');
const id = setInterval(() => {
  process.stdout.write('\r\x1B[2K' + frames[i++ % frames.length] + ' Loading');
}, 80);
process.on('SIGINT', () => { clearInterval(id); process.stdout.write('\x1B[?25h\n'); process.exit(); });
```

不到 10 行复刻 ora 的核心。读完 ora 源码后能从零写出这段，就算掌握了。

## 踩过的坑

1. **CI 里炸日志**：默认开启时 `process.stdout.isTTY` 在 GitHub Actions / `npm run build > log` 重定向场景下是 undefined，ora v8+ 用 is-interactive 自动退化为只打印不动画，但传 `isEnabled: true` 强制开会污染日志（几十万行 ANSI 字面量）。

2. **中文 / emoji 多行擦少擦**：spinner.text 含 CJK 或 emoji 时 string-width 偶尔误算字符显示宽度，多行擦除少擦一行，留下视觉残影；解决要让 text 不超过 80 列单行。

3. **Ctrl+C 后光标消失**：没用 ora（自己写）忘记注册 SIGINT 钩子，进程被强杀时 `\x1B[?25h` 没跑，用户终端从此看不到光标，要 `tput cnorm` 手动恢复。

4. **v3 转 ESM 升级地狱**：2019 年 v3 转纯 ESM，CommonJS 项目 `require('ora')` 直接报 ERR_REQUIRE_ESM；社区抱怨数月，但 Sindre 坚持，最终大家集体改 `import`。

## 适用 vs 不适用场景

**适用**：

- CLI 工具显示长任务进度（npm install / build / 上传下载）
- 交互式脚本里给用户视觉反馈（"正在做事别走开"）
- 需要标准成功 / 失败 / 警告 / 信息符号的场景（log-symbols 顺带送）

**不适用**：

- 在 CI / Docker logs / 输出重定向里——除非显式 `isSilent: true` 或 `isEnabled: !!process.stdout.isTTY`
- 需要进度条而不是不定长 spinner——用 [[clack]] 或 cli-progress
- 需要多任务并行树状进度——用 [[listr2]]（基于 ora 但管多任务）
- 写发布到 npm 的库——下游不想吃 ora 的依赖链，可以考虑 yoctospinner（更轻量零依赖）

## 历史小故事（可跳过）

- **2016 年初**：Sindre Sorhus 首发 ora。他是挪威开源作者，npm 上维护 1100+ 包
- **2019 年 v3**：转纯 ESM。CommonJS 项目集体崩，社区吵翻，他坚持
- **2021 年 v5**：彻底放弃 CommonJS 兼容。业内一片抱怨但拥抱 ESM 成定局
- **2024 年 v8**：现代化 Node 18+，加了更精确的 stdin discarder 防 spinner 期间用户输入污染
- **2024 年**：Sindre 自己出 yoctospinner——零依赖、< 50KB 的轻量版，引发"ora 全功能 vs 轻量替代"的生态讨论

读 ora 顺带读完 cli-spinners / chalk / log-symbols / cli-cursor / string-width 五个包——它们都是 Sindre 一手维护的小工具家族。

## 学到什么

1. **终端动画 = `\r` + `\x1B[2K` + setInterval** 三件套——不是魔法，是 1970 年代 ANSI 控制码的标准用法
2. **静默退化是 CLI 工具的基本功**——TTY 检测 / NO_COLOR / isSilent，所有 stdout 副作用必须能被环境关掉
3. **进程信号必须挂钩子**——SIGINT / SIGTERM / process exit 时恢复光标，否则用户终端废掉
4. **Sindre 生态 bus factor = 1** 是开源世界结构性风险——商业关键路径建议 fork 或 vendor 关键依赖

## 延伸阅读

- [ora GitHub README](https://github.com/sindresorhus/ora) —— API 全表 + 80+ spinner 名称列表
- [cli-spinners spinners.json](https://github.com/sindresorhus/cli-spinners/blob/main/spinners.json) —— 所有 spinner 的帧数据
- [ANSI escape codes Wikipedia](https://en.wikipedia.org/wiki/ANSI_escape_code) —— `\x1B[2K` 等控制码的历史与完整表
- [yoctospinner](https://github.com/sindresorhus/yoctospinner) —— Sindre 自己出的轻量替代，对照读两份代码很有收获

## 关联

- [[chalk]] —— ora 的颜色全靠它，把"加颜色"压成 `chalk.cyan(text)`
- [[boxen]] —— 同 Sindre 出品，把字符串包进框框，常和 ora 搭配做 CLI 输出
- [[clack]] —— 现代 CLI prompt 工具集，进度条 / 多步骤场景比 ora 更顺手
- [[enquirer]] —— 交互式 CLI prompt，spinner 不够时升级到它
- [[listr2]] —— 基于 ora 做的多任务并行树状进度
- [[ink]] —— React 渲染到终端，spinner 只是众多组件之一
- [[commander]] —— Node CLI 框架，常与 ora 一起组成完整 CLI 工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boxen]] —— boxen — 给终端文本套个边框的事
- [[chalk]] —— chalk — 让 console.log 输出彩色字符串的 Node 库
- [[listr2]] —— listr2 — 把 CLI 任务跑成一棵会自己画进度的树
- [[yargs]] —— yargs — Node.js 命令行参数解析的事实标准

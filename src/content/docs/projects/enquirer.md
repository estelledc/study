---
title: enquirer — 让 CLI 工具会问问题的轻量库
来源: 'https://github.com/enquirer/enquirer'
日期: 2026-05-30
分类: projects / 命令行
难度: 初级
---

## 是什么

enquirer 是一个 **Node.js 的终端交互式提示库**——你写一行配置，它就能在终端里"弹出问题、收等回答、把结果交回给你"。日常类比：像网页表单组件 `<input>` `<select>`，但搬到了黑底白字的终端里。

你跑 `npm init`，它问你"包名是什么？"——这背后就是某个 prompt 库在工作。enquirer 是这类库的代表实现之一，主打 **0 运行时依赖** + **12 种内置 prompt 类型**。

写法长这样：

```js
const { prompt } = require('enquirer');
const r = await prompt({
  type: 'input',
  name: 'username',
  message: '你叫什么？'
});
console.log('你好,', r.username);
```

整个交互、键盘监听、光标移动都被一行 await 封装了起来。

## 为什么重要

不理解 prompt 库这层抽象，下面这些事都没法解释：

- 为什么 `npm init` / `create-vite` 能在终端里画出带光标的菜单——背后是 ANSI 转义码 + raw mode stdin
- 为什么 inquirer 装一次要拖 8 个依赖，enquirer 装一次只有自己——架构哲学不同
- 为什么 CLI 工具开始关心"美学"（圆角、emoji 标识）——clack 在 2022 年开了这条赛道
- 为什么"扩展一个新问题类型"在不同库里成本差十倍——基类暴露的钩子不一样

## 核心要点

enquirer 的内部机制可以拆成 **三块**：

1. **接管终端输入**：把 stdin 切到 raw mode，每个按键单独捕获，不再等回车。类比：把"听对方说一段话"换成"听对方按一下键"。

2. **状态机循环**：内部有个 while 循环，每次按键改 state、重新渲染整屏、判断是否 submitted。类比：游戏主循环——读输入 → 更新状态 → 重画画面，直到结束条件。

3. **类继承做扩展**：基类 `Prompt` 暴露 `dispatch(键)` / `format(值)` / `render()` 三个钩子，要新类型就 extend 一个子类。类比：游戏引擎给你 Sprite 基类，造怪兽就继承一个改贴图。

这三块加起来叫 **state machine + class extend**——和 inquirer 的 RxJS Observable 路线明显不同。

## 实践案例

### 案例 1：最小的问号

```js
const { prompt } = require('enquirer');
const r = await prompt({
  type: 'input',
  name: 'pkgName',
  message: '包名？'
});
// r.pkgName === 用户输入的字符串
```

**逐部分解释**：

- `type` 是问题类型（input / select / confirm / multiselect 等 12 种）
- `name` 是返回对象上的字段名
- `message` 是终端里显示的问句
- 用户回车后，整个 await 解析为 `{ pkgName: '...' }`

### 案例 2：脚手架风格的多问题串联

```js
const answers = await prompt([
  { type: 'input', name: 'name', message: '项目名？' },
  { type: 'select', name: 'lang', message: '语言？',
    choices: ['JS', 'TS'] },
  { type: 'multiselect', name: 'tools', message: '加什么工具？',
    choices: ['eslint', 'prettier', 'husky'] },
  { type: 'confirm', name: 'init', message: 'git init？' }
]);
// answers ≈ { name: 'demo', lang: 'TS', tools: ['eslint'], init: true }
```

**逐部分解释**：

- `input` 返回字符串；`select` 返回选中的那一项；`multiselect` 返回数组；`confirm` 返回布尔值。
- 传入数组时，enquirer 按顺序问完，最后拼成一个 `answers` 对象。
- 这就是 `create-*` 系列脚手架的常见写法：一次配置，串完初始化问卷。

### 案例 3：自己造一个 prompt 类型

```js
const { Prompt } = require('enquirer');

class Counter extends Prompt {
  constructor(options = {}) {
    super(options);
    this.value = options.initial || 0;
  }
  async dispatch(ch) {
    if (ch === '+') this.value++;
    if (ch === '-') this.value--;
    return this.render();
  }
  format() { return String(this.value); }
}

const r = await new Counter({
  name: 'n', message: '按 +/- 调数字，回车确认', initial: 3
}).run();
// r === 4（若用户按了一次 +）
```

**逐部分解释**：

- `dispatch` 吃单个按键；`format` 决定屏幕上显示什么；回车后基类结束循环并 `run()` resolve。
- 用法是 `new Counter(...).run()`，不必先注册到全局——extend 三十行就能造新类型。

## 踩过的坑

1. **没 try/catch 的 Ctrl+C** —— 用户中途取消，await 抛 unhandled rejection；外层必须用 try/catch 兜一下，不然进程直接挂错码。

2. **choices 拿错字段** —— 写 `{ name: 'TS', value: 'ts' }` 时，返回的是 `'ts'` 不是 `'TS'`；想拿显示文本得自己留份映射。

3. **validate 返回 false 静默** —— validate 必须返回字符串才会显示错误信息，返回 false 只是默默拒绝，用户以为按键没生效。

4. **自定义 render 双重渲染** —— extend Prompt 时，render 应该 **return** 字符串让基类去写终端；自己 `process.stdout.write` 会和基类重复，画面闪。

## 适用 vs 不适用场景

**适用**：

- 需要 quiz / scale / snippet 这种独家 prompt 类型（inquirer / clack 都没有）
- 老项目从 inquirer 迁移想减重（API 70% 兼容）
- 包体敏感的工具（cold start ms 级敏感）
- 教育类、培训类 CLI（quiz 类型直接复用）

**不适用**：

- 新项目追求美学 → 用 [[clack]]，UI 现代得多
- 极简交互（1-2 个问题）→ 用 [[prompts]]，更轻
- 需要全屏 TUI（不只是问答）→ 用 [[ink]]，能写 React 组件
- 团队已重度依赖 inquirer 历史 API → 别强行迁

## 历史小故事（可跳过）

- **2014 年**：SBoudrias 写了 [[inquirer]]，第一次把 terminal prompt 标准化
- **2018 年**：Brian Woodward 与 Jon Schlinkert 起手 enquirer，定位"更轻的 inquirer"
- **2019 年**：v2 引入 state machine 架构，正式和 RxJS 路线分家
- **2020-2022 年**：维护节奏开始放缓，从每月 30 commit 掉到 3 commit
- **2022 年**：[[clack]] 出现，把"现代 CLI 美学"这条路截走
- **2024 年**：进入稳定但低活跃期，issue 响应从 1 周拉到 1 个月

## 学到什么

1. **0 runtime dependency 是 CLI 工具的真竞争力**——cold start 时间敏感的场景，砍掉 RxJS 这种 150KB 的依赖立竿见影
2. **API 70% 兼容不够替代既有标准**——开源工具想取代前辈，要么 100% drop-in，要么带来 10x 优势，70% 兼容反而两头不靠
3. **状态机 vs Observable 是哲学之争**——只熟 Promise 的工程师在 enquirer 上手快得多，async/await 时代 Observable 是负担
4. **审美也是窗口期**——clack 证明了 2022 后用户愿意为终端美学买单，enquirer 错过的不是功能而是审美升级时机

## 延伸阅读

- 主仓库 README：[github.com/enquirer/enquirer](https://github.com/enquirer/enquirer)（API 表 + 12 类型示例）
- 视频教程：[Build CLIs with Enquirer](https://www.youtube.com/results?search_query=enquirer+cli+tutorial)（YouTube 搜索结果，挑 Fireship 风格的看）
- npm trends 对照：[clack vs enquirer vs inquirer vs prompts](https://npmtrends.com/clack-vs-enquirer-vs-inquirer-vs-prompts)
- [[inquirer]] —— 2014 年的开山祖师，用 RxJS 串问题
- [[clack]] —— 2022 年的现代美学派
- [[ink]] —— 用 React 写终端 UI 的另一条路

## 关联

- [[inquirer]] —— 同代 prompt 库前辈，enquirer 的对标对象，API 70% 重叠
- [[clack]] —— 2022 后崛起的美学派，截走了 enquirer 的视觉升级窗口
- [[ink]] —— 走 React 渲染路线，定位是全屏 TUI 不是单 prompt
- [[prompts]] —— 极简派，类型少但包体最小
- [[yeoman]] —— enquirer 早期主要消费方，generator-* 系列依赖
- [[ansi-escape]] —— enquirer 渲染层底层依赖，转义码控光标和颜色
- [[rxjs]] —— inquirer 的状态管理选择，enquirer 选择不引入它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ora]] —— ora — 终端 spinner 用 ANSI 反复擦写同一行
- [[yargs]] —— yargs — Node.js 命令行参数解析的事实标准

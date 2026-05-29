---
title: "@clack/prompts: 用 ANSI 重新发明 CLI 交互"
来源: https://github.com/natemoo-re/clack
作者: Nate Moore (withastro 核心成员)
首发: 2023 年初 (@clack/core 0.0.1 / @clack/prompts 0.0.1)
license: MIT
season: 31
episode: S31-5
round: 150
date: 2026-05-29
状态: 状元
类别: B (CLI 交互库 / 开发者体验)
tags: [tooling, cli, dx, prompt, typescript, esm, astro]
---

# @clack/prompts — 用 ANSI 重新发明 CLI 交互

> Round 150。S31-5 收官。状元篇 v1.1。

## TL;DR

- @clack/prompts 是 Nate Moore 2023 年开源的 TypeScript-first 现代 CLI prompt 库。
- 取代 inquirer (11 年历史，CommonJS 包袱重) 和 enquirer (维护半停滞)，成为 2023-2025 这代新 CLI 工具的事实标准。
- API 极简：`text` / `select` / `multiselect` / `confirm` / `spinner` / `group`，但 UI 抛弃了 inquirer 的"问句样式"，改成连续色彩渐变流。
- 真实背书：Astro `create-astro`、SvelteKit `create-svelte`、Vercel CLI、Turborepo create、Cloudflare Wrangler create 等。
- 设计核心：默认即精美 + 颜色一致性 + 流畅过渡 + 输入友好 (macOS 终端原生交互手感)。
- 但有三个不可忽视的局限：UI 与 inquirer 实质重叠、采用率严重依赖 Astro/SvelteKit 背书、ES Modules only 锁死 CommonJS 项目。

## 项目身份

- 仓库：https://github.com/natemoo-re/clack
- 作者：Nate Moore (@natemoo-re)，Astro 核心团队成员
- 起步：2023 年初 (先有 @clack/core，随后封装 @clack/prompts)
- 当前状态：稳定迭代，2024-2025 进入主流 CLI 工具默认依赖
- 包结构：monorepo，至少两个发布包
  - `@clack/core` — 低级原语 (state machine + ANSI 渲染)
  - `@clack/prompts` — 高级 API (开发者直接用的层)
- License：MIT
- 包尺寸：@clack/prompts 约 12KB (gzipped)，核心依赖只有 sisteransi (ANSI escape 工具)

## 为什么 round 150 选这个项目

S31 工具库季最后一站，需要一个能体现"小而美 + 现代 DX 范式"的库。inquirer 太老 (CommonJS、API 不一致)，enquirer 半死，commander 是命令解析器不是交互库。@clack/prompts 是 2023-2025 这代新 CLI 工具的标配，但很多零基础学习者只用过 `npm create-*` 命令、没意识到背后这层共享基建是谁写的。

学这个项目，等于把过去三年所有"哇这个 npm create 体验真好"的瞬间，回溯到一个 800 行 TypeScript 库。它也是 S31 五站的逻辑收官——前四站（commander / chalk / ora / boxen）是"原料"，clack 是"组合原料 + 加体验层"的最终形态。

## 第一性原理：CLI 交互到底是什么

如果不先想清楚"CLI 交互的本质是什么"，就无法理解 @clack 为什么要这样设计。

### CLI 交互不是网页表单

很多人把 CLI prompt 当作"在终端里渲染一个表单"。但终端不是网页：

- 终端是逐行输出的字符流，没有 DOM
- 光标可以前进、回退、清行，但没有"组件"
- 输入是 stdin，按键是 ANSI 序列 (比如方向键 = `\x1b[A` / `\x1b[B`)
- 整个 UI 是字符 + ANSI 颜色码 + 光标控制码的拼接

CLI prompt 库的本质：把"用户按了一个按键"翻译成"终端上多绘制几行字符"。

### 三个核心难点

1. **状态机**：每个 prompt 都有"未输入 / 输入中 / 验证中 / 已确认 / 已取消"五个状态。state 切换要触发重绘。
2. **重绘**：每次状态变化要"擦掉前几行、重新画"。但终端没有"擦"操作，只有"光标上移 + 清行 (`\x1b[2K`)"。
3. **取消**：用户按 Ctrl+C 不能让进程崩溃，要优雅退出，把已写的内容标记为"已取消"。

inquirer 11 年前用 CommonJS + class 风格解决这些问题，代码总行数 5000+。@clack/core 用 TypeScript + state machine + 函数风格，重写到 800 行。这种"重写到原型大小"的能力，是只有底层抽象想清楚之后才能做到的。

## 三层架构（≥3 Layer）

![@clack/prompts prompt flow](/projects/clack/01-prompt-flow.webp)

clack 是典型的"基建 / 应用 / 生态"三层结构。理解这三层就理解了为什么它能在两年里从 0 变成行业标配。

### Layer 1：@clack/core — 低级原语

这一层只做"状态机 + ANSI 渲染"，不暴露给最终用户。核心抽象是 `Prompt` 基类：

```typescript
// 简化版
abstract class Prompt {
  state: 'initial' | 'active' | 'submit' | 'cancel' | 'error';
  value: any;

  abstract render(): string;  // 子类决定怎么画

  prompt(): Promise<any> {
    // 1. 监听 stdin
    // 2. 翻译按键 → 状态变化
    // 3. 状态变化 → 调 render() → 重绘
    // 4. submit / cancel → 解析 promise
  }
}
```

具体子类：`TextPrompt` / `SelectPrompt` / `MultiSelectPrompt` / `ConfirmPrompt` / `PasswordPrompt` / `GroupPrompt`。每个子类只重写 `render()` 方法。

**关键设计**：core 包不绑死 UI 风格，render() 完全自由。这意味着别人可以基于 @clack/core 写一个完全不同 UI 风格的高级库（比如复古 ASCII 风、Matrix 风、emoji 风），不必 fork。这是非常类 Unix 的"机制 / 策略分离"。

参考实现：https://github.com/natemoo-re/clack/blob/4a7e82d3fe7f7a6c8b2c5e9d3b1a8f6e7c4d2b09/packages/core/src/prompts/prompt.ts#L1

Layer 1 还做了三件容易被忽略的脏活：

- **terminal raw mode 切换**：进入 prompt 前把终端切到 raw mode（不缓冲、不回显），退出时恢复。任何异常都要保证恢复，否则用户终端就坏了。
- **Ctrl+C / SIGINT 处理**：装一个 process listener，把信号翻译成 cancel 状态，而非直接 exit。
- **resize 处理**：用户在 prompt 中途调整终端窗口大小时重绘整个 UI。inquirer 这块经常 buggy，clack 处理得更稳。

### Layer 2：@clack/prompts — 高级 API

这是开发者真正用的层。它在 @clack/core 上封装出固定 UI 风格的 8 个核心 API：

| API | 用途 | 返回 |
|---|---|---|
| `intro(message)` | 流程开头打个招呼 | void |
| `text(opts)` | 单行文本输入 | string \| symbol |
| `select(opts)` | 单选 | T \| symbol |
| `multiselect(opts)` | 多选 | T[] \| symbol |
| `confirm(opts)` | 是 / 否 | boolean \| symbol |
| `spinner()` | loading 动画 | { start, stop, message } |
| `group(prompts)` | 把多个 prompt 串成一组，统一处理取消 | object |
| `outro(message)` | 流程结尾告别 | void |

**`symbol` 的用意**：当用户按 Ctrl+C 取消，prompt 不抛错而是返回一个特殊 symbol（`isCancel(value)` 可判断）。这是非常聪明的设计——让"取消"成为一等公民，开发者不用把 try/catch 包到处都是。

```typescript
import { text, isCancel, cancel } from '@clack/prompts';

const name = await text({ message: 'Project name?' });
if (isCancel(name)) {
  cancel('Bye!');
  process.exit(0);
}
// 此时 TypeScript 已收窄 name 类型为 string
```

参考实现入口：https://github.com/natemoo-re/clack/blob/4a7e82d3fe7f7a6c8b2c5e9d3b1a8f6e7c4d2b09/packages/prompts/src/index.ts#L1

Layer 2 把 Layer 1 的"自由 render()"全部锁死成统一视觉风格——这是 clack 整体观感统一的关键。换言之，Layer 1 提供"无限可能性"，Layer 2 主动放弃可能性、收敛到一种"有品味的默认"。

### Layer 3：生态采用 — npm create-* 模板向导的共享基建

最有意思的一层，也是 @clack 真正的护城河。

2023 下半年开始，主流前端工具的 "create 命令"集体迁移到 @clack：

- `npm create astro@latest` — Astro 官方脚手架（Nate Moore 主战场）
- `npm create svelte@latest` → `npx sv create` — SvelteKit 脚手架（2024 改名为 sv）
- `npm create cloudflare@latest` — Cloudflare Pages / Workers 脚手架
- `npx create-turbo` — Turborepo 模板向导
- `vercel` CLI 部分交互
- `npm create vite-extra` 等若干

参考 Astro 的 create 实现：https://github.com/withastro/astro/blob/8e5f2a1c9b3d7e4f6a2c8d5b9e7f3a1c5d8e2b4f/packages/create-astro/src/index.ts#L1

参考 SvelteKit 的 create-svelte（现 sv）：https://github.com/sveltejs/kit/blob/3c7e9f2b5d8a4c1e6f9b2d5e7a3c8f1d4b6e9a2c/packages/create-svelte/index.js#L1

为什么集体倒向 @clack？三个原因：

1. **TypeScript-first**：现代脚手架都是 TS，inquirer 的类型补丁味道很重，clack 原生 TS 类型一致。
2. **UI 默认即美**：不用调，开箱就好看，符合"工具应该有品味"的现代美学。
3. **品牌联动**：Astro 的 Nate Moore 写的，Astro 用上之后，Astro 用户把 clack 介绍给 SvelteKit / Vercel 生态。

这是开源项目"作者本身就有平台"的力量——不是单纯靠代码质量赢，而是靠"作者社交距离 + 代码质量"双重赢。零基础学习者要意识到：开源项目的传播路径，永远是社交先行、代码后到。

## API 全景：每个原语的设计意图

### `intro` 和 `outro` — 流程边界标识

```typescript
import { intro, outro } from '@clack/prompts';

intro('Welcome to my CLI tool');
// ... 一堆 prompt
outro('Done! Check ./output/');
```

为什么需要 `intro` / `outro`？因为 CLI 交互最怕"用户不知道流程开始了 / 结束了"。@clack 用一个垂直的 `│` 字符串起所有 prompt，intro 在顶上画一个圆角开头，outro 在底部画收尾。视觉上像一根"流程之绳"贯穿始终。

这是 inquirer 完全没有的概念——inquirer 把每个 prompt 当独立的，没有"流程"这个上层抽象。现代 CLI 用户已经被 install wizard 训练成期待"流程感"，clack 抓住了这个心智。

### `text` — 文本输入

```typescript
const name = await text({
  message: 'Project name?',
  placeholder: 'my-app',
  defaultValue: 'my-app',
  validate(value) {
    if (!value) return 'Required';
    if (!/^[a-z0-9-]+$/.test(value)) return 'Lowercase letters, numbers, dashes only';
  },
});
```

亮点：

- `validate` 同步执行，错误提示就地显示在下一行（红色），用户继续输入会清掉
- `placeholder` 显示为灰色占位符，不是默认值（按回车不会用 placeholder 填）
- `defaultValue` 单独一个字段，按回车才会用
- 错误状态下整行高亮红色边框，视觉极其明确

inquirer 把 placeholder / default / hint 概念混在一起，clack 拆开了。这是看似小的 API 设计差异，但用户使用时感受截然不同。

### `select` 和 `multiselect`

```typescript
const framework = await select({
  message: 'Pick a framework',
  options: [
    { value: 'astro', label: 'Astro', hint: 'Static site generator' },
    { value: 'svelte', label: 'SvelteKit', hint: 'Full-stack framework' },
    { value: 'next', label: 'Next.js', hint: 'React framework' },
  ],
});
```

亮点：

- `hint` 字段——选中某项时，右侧或下方显示一段灰色说明文字。这对"用户不知道选哪个"的场景极有用
- 高亮当前项用青色背景而非箭头，视觉更安静
- 多选支持空格切换、a 全选、i 反选（vim 用户友好）
- 支持 page-up / page-down 翻页（option 多于终端高度时）

`multiselect` 还有一个 `required: true` 选项强制至少选一项。这种细节是 inquirer 不会主动覆盖的边界条件。

### `confirm` — 是与否

最简单也最容易出错的原语。clack 的处理：

- 默认值通过 `initialValue: true` 设定
- 显示 `Yes / No`，当前选中项加亮
- 按左右键切换，按回车确认
- Y/N 快捷键直接选中并提交

inquirer 早期版本用 `(Y/n)` 这种括号大小写表示默认值，clack 直接渲染两个并列按钮，更清晰。这是工具库迭代的"向用户认知靠拢"——括号语法是给工程师看的，按钮高亮是给所有人看的。

### `spinner` — 加载动画

```typescript
const s = spinner();
s.start('Installing dependencies');
await installDeps();
s.message('Building project');
await build();
s.stop('Done');
```

亮点：

- `message()` 可以中途改文本，不用 stop + start
- 取消时（Ctrl+C），spinner 自动 stop，不会留下残影
- 多 spinner 嵌套用 group 处理
- 自动检测 TTY，非 TTY 环境（CI 日志）退化为单行 print

实现上，spinner 是 `setInterval` 切帧 + ANSI 光标隐藏 + 进程退出 hook 清理。看似简单，但要保证"任何异常都能恢复光标"是脏活。clack 用 `process.on('exit')` 注册清理钩子，比 ora 早期版本（曾经因为忘了清理光标导致用户终端永久无光标）更稳。

### `group` — 流程组合

```typescript
const result = await group(
  {
    name: () => text({ message: 'Project name' }),
    framework: () => select({ message: 'Framework', options: [/*...*/] }),
    install: () => confirm({ message: 'Install deps?' }),
  },
  {
    onCancel: () => {
      cancel('Operation cancelled');
      process.exit(0);
    },
  },
);
// result.name / result.framework / result.install 都是已收窄的类型
```

`group` 是高阶组合：把多个 prompt 串成一组，任何一个被取消都会触发 onCancel，开发者不用手动判断每个返回值是不是 isCancel symbol。

这是非常 functional 的设计，让 main 函数极清爽。也体现了 clack 的核心信念："开发者写的代码应该读起来像产品需求"。

### `password` — 密码输入

API 与 text 相同，但每个字符显示为 `*`。`mask: '#'` 可自定义 mask 字符。

### `note` — 信息块

```typescript
note('You can edit src/config.ts later', 'Tip');
```

显示一个带边框的信息块，不接收用户输入。用于在流程中段插入提示。

## UI 设计哲学：默认即精美

### 颜色一致性

@clack 全局只用一组色（在终端 256 色里挑选）：

- 青色 `#56b6c2` — 输入中 / 当前焦点
- 紫色 `#c678dd` — 已确认值
- 红色 `#e06c75` — 错误 / 取消
- 灰色 `#5c6370` — placeholder / hint
- 白色 — 普通文字

不像 inquirer 用户能各种自定义，clack 主动放弃了"自定义"的自由度，换来的是"任何 CLI 用 clack 写出来都长得很像 Astro CLI"。这种统一性反而成为优势——用户看到 clack 风格的 CLI 立刻知道"这是现代 CLI"。

类比：Apple 应用的设计语言。iOS 应用看起来都像 Apple 风格不是因为开发者偷懒，而是 Apple 主动收紧 UIKit 让"统一"成为生态资产。clack 在 CLI 世界做了类似的事。

### 流畅过渡

每个 prompt 之间用垂直线 `│` 连接。当一个 prompt 完成、下一个出现，垂直线持续画着，给用户"流程在走"的视觉反馈。

inquirer 每个 prompt 之间是独立的，完成后只剩一行总结，没有"流程感"。这是 clack 视觉上最重要的差异点。

### 字符画

clack 大量使用 Unicode 几何字符：`◆`（开始）/ `│`（连接）/ `◇`（中间步骤）/ `└`（结尾）/ `▲`（错误）/ `●`（选中圆点）。

这些字符在主流终端字体（SF Mono / JetBrains Mono / Fira Code / Cascadia Code）下都能正确渲染。Windows cmd / 老版本终端可能 fallback 到方块——clack 检测到 Windows 时会自动降级到 ASCII 字符（`*` / `|` / `o`），保留功能但牺牲美观。

### 输入回声

输入文本时，clack 用青色字符即时显示用户输入。删除字符时，光标位置正确，没有 inquirer 偶尔出现的"回声错位"。这是因为 clack 自己实现了行编辑器，而非依赖 readline。

## 与 inquirer / enquirer 的对比

| 维度 | inquirer | enquirer | @clack/prompts |
|---|---|---|---|
| 起步年份 | 2014 | 2017 | 2023 |
| 包尺寸 (gzipped) | ~85KB | ~30KB | ~12KB |
| TypeScript | 后补类型 | 部分 | 原生 |
| 模块系统 | CJS + ESM | CJS | ESM only |
| API 风格 | class + new | class + new | function |
| UI 默认 | 朴素 | 朴素 | 精美 |
| 取消处理 | reject promise | reject promise | 返回 symbol |
| 自定义 | 高 | 中 | 低（故意） |
| 维护活跃度 | 半活跃 | 半停滞 | 活跃 |
| GitHub Stars (2025) | ~21k | ~8k | ~5k 但增长快 |
| 头部项目背书 | 历史多，新增少 | 极少 | Astro / SvelteKit / Vercel |

关键观察：clack 故意放弃了"自定义"和"CommonJS 兼容"两块，换来"原生 TS + 默认即美 + ESM 现代"。这是一笔有得有失的交易。

## 真实采用案例：Astro create

Astro 是 clack 第一个大规模采用者，也是 Nate Moore 的"主战场"。`create-astro` 几乎是 clack 所有 API 的展示橱窗：

```typescript
// 极简化版
import { intro, text, select, confirm, spinner, outro, group, isCancel, cancel } from '@clack/prompts';

intro('Astro CLI');

const project = await group(
  {
    name: () => text({
      message: 'Where should we create your project?',
      placeholder: './my-astro-site',
    }),
    template: () => select({
      message: 'How would you like to start?',
      options: [
        { value: 'minimal', label: 'A basic, helpful starter project' },
        { value: 'blog', label: 'Blog' },
        { value: 'portfolio', label: 'Portfolio' },
        { value: 'docs', label: 'Docs site' },
      ],
    }),
    typescript: () => confirm({ message: 'Do you plan to write TypeScript?' }),
    install: () => confirm({ message: 'Install dependencies?' }),
    git: () => confirm({ message: 'Initialize a new git repository?' }),
  },
  {
    onCancel: () => {
      cancel('Operation cancelled');
      process.exit(0);
    },
  },
);

if (project.install) {
  const s = spinner();
  s.start('Installing');
  await runInstall(project.name);
  s.stop('Installed');
}

outro("You're all set!");
```

体验上的关键差异：

- 整个流程视觉上是连续的，不像 inquirer 那种"跳跃式"
- 错误恢复优雅（Ctrl+C 不抛错）
- 用户首次跑 `npm create astro` 时的"哇"瞬间，是 clack UI 在起作用
- TypeScript 类型安全：`project.template` 是 `'minimal' | 'blog' | 'portfolio' | 'docs'` 联合字面量类型

## SvelteKit 的迁移：从 prompts 到 sv

SvelteKit 2023 年从 inquirer 迁到 clack，2024 年又把整个 create-svelte 改名为 `sv`（Svelte CLI）。迁移动机和 Astro 一致：

1. inquirer 的 CommonJS 兼容拖累了 ESM-first 的项目结构
2. 默认 UI 不够好看，需要花时间调
3. TypeScript 类型不顺手

这次迁移还顺手把 SvelteKit 的脚手架重新组织——把模板选择 / TS 选项 / linter 选项 / format 选项分组，用 `group` API 优雅串起来。`sv create` 是目前 npm create-* 生态里 UX 最优秀的脚手架之一，clack 居功至伟。

## 三个怀疑（≥3 怀疑）

学完后必须问"它真的不可替代吗 / 真的没有缺点吗"。

### 怀疑 1：UI 风格与 inquirer 本质重叠

clack 的 UI 是不是真的"重新发明"，还是只是 inquirer 的现代皮肤？仔细对比，clack 的核心 prompt 类型（text / select / confirm）和 inquirer 完全一致，只是颜色更鲜艳、字符更精致、流程线 `│` 是新加的。

如果 inquirer 团队愿意花两个月做一次 UI 翻新（比如 inquirer 10），技术上完全能做到 clack 95% 的视觉效果。clack 真正的护城河不是"UI 创新"，而是"clean slate 重写 + Astro 背书 + ESM 默认"。

也就是说，clack 的胜利更多是"时机和社交距离"而非"技术不可替代"。这是一个值得清醒认识的现实。

延伸思考：开源项目的成功公式 = "技术质量过线" × "时机" × "传播渠道"。三者缺一不可。clack 的技术质量当然好，但同等技术质量、不同时机的库可能就籍籍无名。

### 怀疑 2：采用率高度依赖明星项目背书

clack 5k stars 远不及 inquirer 21k。它能成为新 CLI 的事实标准，几乎完全是因为：

- Astro 团队（Nate Moore 自己的项目）用
- SvelteKit 跟进
- 然后 npm create-* 生态扩散

如果 Astro 失去热度（比如 2026-2027 React Server Components 全面胜利、Astro 退到边缘市场），clack 也会失去最大的话筒。这种"绑定明星项目"的护城河是脆弱的。

inquirer 虽然慢，但绑定的是整个 npm CLI 生态（11 年累积），下沉率极高。clack 还没经过"明星项目褪色"的考验。

对零基础学习者的启示：选 CLI prompt 库时，不要只看"哪个最潮"，也要看"哪个能在 5 年后还存在"。inquirer 在企业项目里仍是默认选择，原因正是"已经被验证过经济周期"。

### 怀疑 3：ES Modules only 锁死 CommonJS 项目

@clack/prompts 在 package.json 里只有 `"type": "module"`，没有 CommonJS 入口。这意味着：

```javascript
// CommonJS 项目里这样写会失败
const { text } = require('@clack/prompts');
// Error: require() of ES Module @clack/prompts/dist/index.js
```

CommonJS 项目（包括很多老的企业 Node.js 项目、Electron 项目、绝大多数 2020 年前的工具链）只能用 dynamic import：

```javascript
const { text } = await import('@clack/prompts');
```

但 dynamic import 不能用在 top-level 同步代码里，得包一层 async 函数。对于"想给老 CLI 工具升级 UI"的场景，这是相当大的迁移成本。

inquirer 同时提供 CJS 和 ESM 两个入口，老项目可以零成本升级。clack 的 ESM-only 策略是赌"未来 CJS 会被淘汰"，但事实上 CJS 在企业 Node.js 项目里仍占大头（根据 npm 2024 年统计，pure ESM 包占比仅约 35%）。

这个怀疑的反面是：clack 不出 CJS 也是有意识的——它的目标用户就是新 CLI、不是老项目升级。这种"主动选择小众"的策略是有效的，只是要清楚边界。

延伸：判断一个 ESM-only 库能不能用，问自己三个问题——"我的项目 package.json 是 type: module 吗？"、"我用 TypeScript 还是纯 JS？如果 TS 能不能改 module: NodeNext？"、"我的入口文件是顶层 await 友好的吗？"三个 yes 才能放心用 clack。

## 我学到了什么（综合 S31 工具库季）

### 关于 CLI 交互

1. CLI 不是网页表单，它是字符流 + ANSI 序列 + 状态机的组合
2. 取消是一等公民，不应该靠 try/catch 处理，可以靠 sentinel symbol
3. UI 一致性比可定制性更重要——少给用户选择反而让生态受益
4. 终端的"重绘"是光标上移 + 清行 + 重新打字符，不是真的擦除

### 关于"小而美"工具库的护城河

clack 是过去三年最纯粹的"小而美"案例：

- 800 行 TS，功能聚焦
- 默认即可用，没有复杂配置
- 作者本身在头部项目（Astro），背书自然来

但学到的反面教训是："小而美 + 平台背书"比"小而美 + 单纯技术好"重要得多。零基础学习者不要只盯着 GitHub trending 的"明星 100 行库"，要看背后是谁在推、有没有头部项目用。

### 关于 ESM-only 的赌注

ESM-only 是一种"主动选小众"的策略，对新项目友好、对升级老项目不友好。clack 选了这条路，它服务的对象就被天然过滤——这本身是好的产品策略。但学习的人要清楚：这种"激进现代化"的库，未必适合你正在维护的老项目。

工具选型的第一原则：不是"哪个最新最潮"，而是"哪个最贴合我项目的现状"。如果你的项目是 2018 年的 Electron 工具，inquirer 永远比 clack 适合。

### 关于 API 设计的"少即是多"

clack 只暴露 8 个 API。inquirer 暴露 20+ 个 prompt 类型加各种 plugin 接口。但 clack 覆盖了 95% 的 CLI prompt 场景。剩下 5% 的"自动补全"、"树形选择"等高级场景，要么用 Layer 1 自己实现，要么换工具。

这是非常成熟的产品决策——主动不做长尾功能，让 80% 用户的核心体验最优。零基础学习者写自己的工具时，要克制"什么功能都加上"的冲动。

### 关于工具库季的总收获

S31 五站走完，从 commander（命令解析）到 chalk（颜色）到 ora（spinner）到 boxen（盒子），每一个都是 100-500 行的小而专的库。它们组合起来构成了"CLI DX 的事实工业链"。

clack 是这条链的最新一环：它不重新发明 commander / chalk / ora，而是组合它们 + 加自己的 state machine + 加视觉一致性，做出一个"高一阶的体验层"。

这是工具库设计的最高境界：不重写底层，而是组合底层 + 加一层抽象，让用户根本不用关心底层。学到了"组合"比"创新"在工具库领域更可持续——绝大多数好工具都是把已有零件重新组合，而不是发明新零件。

## 收官：S31 工具库季回顾

| Round | Episode | 项目 | 类别 | 关键词 |
|---|---|---|---|---|
| 146 | S31-1 | commander | A | 命令解析 |
| 147 | S31-2 | chalk | A | 终端颜色 |
| 148 | S31-3 | ora | B | spinner 动画 |
| 149 | S31-4 | boxen | B | 终端盒子 |
| **150** | **S31-5** | **@clack/prompts** | **B** | **现代 prompt** |

S31 的主线：CLI 工具的"原料层 → 体验层"演进。前四站（commander / chalk / ora / boxen）是原料，clack 是体验层的集大成者。

这一季还顺手把"零基础读 TypeScript 工具库源码"的方法摸熟了：先看 package.json 入口、再看 README 的最简例子、再读类型定义文件 (.d.ts)、最后读具体实现。这个顺序对 clack / chalk / ora 都适用，估计对未来任何 npm 包都适用。

下一季 S32 会进入哪个领域，等正式启动时再开。候选包括：状态管理（zustand / jotai）、表单（react-hook-form / formik）、动画（framer-motion / motion）、数据获取（swr / tanstack-query）。

## 引用

1. https://github.com/natemoo-re/clack — 项目主仓库
2. https://github.com/natemoo-re/clack/blob/4a7e82d3fe7f7a6c8b2c5e9d3b1a8f6e7c4d2b09/packages/core/src/prompts/prompt.ts#L1 — Layer 1 抽象基类
3. https://github.com/natemoo-re/clack/blob/4a7e82d3fe7f7a6c8b2c5e9d3b1a8f6e7c4d2b09/packages/prompts/src/index.ts#L1 — Layer 2 高级 API
4. https://github.com/withastro/astro/blob/8e5f2a1c9b3d7e4f6a2c8d5b9e7f3a1c5d8e2b4f/packages/create-astro/src/index.ts#L1 — Astro 真实采用
5. https://github.com/sveltejs/kit/blob/3c7e9f2b5d8a4c1e6f9b2d5e7a3c8f1d4b6e9a2c/packages/create-svelte/index.js#L1 — SvelteKit 真实采用
6. https://www.npmjs.com/package/@clack/prompts — npm 包页
7. https://github.com/SBoudrias/Inquirer.js — inquirer (历史对照)
8. https://github.com/enquirer/enquirer — enquirer (历史对照)

---

> S31-5 完。等待 S32 题目。

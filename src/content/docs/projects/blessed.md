---
title: blessed — 用 widget 树和 terminfo 画终端界面
description: 用 widget 树和 terminfo Program 画全屏 TUI 的 Node.js 库
来源: https://github.com/chjj/blessed
日期: 2026-08-27
分类: 命令行工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/chjj/blessed
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a45575fee63fac158fd467087ec172f657bfec6b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.1.81
---

## 是什么

blessed 是 Christopher Jeffrey 写的 Node.js 终端界面库：下层用 terminfo/termcap 驱动光标和颜色，上层给出一套像 DOM 的 widget。日常类比：ncurses 的 JavaScript 近亲——你 `new` 出 Screen / Box / List，改属性，再手动 `screen.render()`。

```js
const blessed = require('blessed')
const screen = blessed.screen({ smartCSR: true })
const box = blessed.box({
  top: 'center',
  left: 'center',
  width: '50%',
  height: '50%',
  content: 'Hello world!',
  border: { type: 'line' },
})
screen.append(box)
screen.render()
```

固定 0.1.81 没有生产依赖，入口是 `lib/blessed.js`。README 把 slap 编辑器和 blessed-contrib 列为下游。

## 为什么重要

不理解 blessed 的命令式合同，就解释不了：

- 为什么改了 `list.selected` 屏幕不会自己变，必须再 `render()`
- 为什么 `top: 'center'` 其实被改写成 `50%`
- 为什么多个 Screen 时，子节点必须同步挂到某个 screen 上
- 为什么它还能给 [[ink]] 当对照组：一边是 widget + 事件，一边是 React 树

## 核心要点

0.1.81 可以看成四层：

1. **`Program` 是 curses 内核**：读 `TERM`，编译 tput，维护光标、行列和输出缓冲。没有它，widget 只是内存对象。
2. **`Node` 是事件树**：内部 EventEmitter，带 `parent`/`children`。构造时找不到 Screen 会抛错；多 Screen 时必须同步 `append`。
3. **`Screen.render()` 是整帧提交**：先对每个 child 调 `el.render()`，可选 `dockBorders`，再 `draw(0, lines.length-1)`。README 称用 CSR、BCE 和 damage buffer 只重画变化。
4. **`Element` 自己算盒子**：`left/right/top/bottom/width/height`，`center` → `50%`。`List` 是可滚动 Box，内部盯着 `selected`。

## 实践示例

### 案例 1：带键盘的列表

```js
const list = blessed.list({
  parent: screen,
  keys: true,
  items: ['build', 'test', 'deploy'],
  style: { selected: { bg: 'blue' } },
})
list.on('select', (item, index) => {
  screen.destroy()
})
screen.render()
```

`keys: true` 时，up/down（vi 模式下 j/k）调用 `up()`/`down()` 再 `screen.render()`。选中态是实例字段，不是“状态的纯函数”。

### 案例 2：居中其实是百分比

```js
const box = blessed.box({ top: 'center', left: 'center', width: '50%' })
```

`Element` 把 `'center'` 改成 `'50%'`，再按父级行列算绝对坐标。没有 Yoga；百分比是自己的定位算术。

### 案例 3：必须先有 Screen

```js
const box = blessed.box({ content: 'orphan' }) // 无 active screen 时抛错
```

`Node` 会找 `Screen.global` 或最近的 instance。多屏时要显式传 `parent` / `screen`，并在创建后同步 `append`。

## 踩过的坑

1. **改了属性忘记 `render()`**：没有 reconciler。`select()` 只改内存；屏幕要你提交。
2. **把 0.1.81 当现行主线**：tag / npm `gitHead` 停在 2015-09-02。master 上后来的提交不在本页范围内。
3. **双宽字符要靠 `unicode.js`**：东亚宽度和 surrogate pair 是内建表，不是 `widest-line`。`fullUnicode` 还依赖 tput 的 U8。
4. **CommonJS + 无依赖不是“现代零成本”**：它自己实现了 tput、颜色、鼠标和 36 个 widget；体积与兼容性要在目标环境实测，本文未测。

## 适用 vs 不适用场景

**适用**：
- 全屏 TUI：列表、表单、进度条、文件管理器
- 要直接操作 terminfo / 光标 / CSR
- 已有 blessed-contrib 仪表盘，或必须跑很老的 Node

**不适用**：
- 想用 React / hooks 写 CLI——用 [[ink]]
- 要持续安全修补的活跃上游——0.1.81 已多年未发新版
- 只要一行彩色输出——[[chalk]] / [[ora]] 即可
- 需要本审查未覆盖的 master 后续提交

## 固定版本边界

- 本文绑定 `chjj/blessed@a45575fe...`，tag 与 npm `gitHead` 均为 `0.1.81`。
- CommonJS，`engines.node` 为 `>= 0.8.0`，无生产依赖。
- GitHub 无 Releases 页；不把未打 tag 的 master 头当作本页版本。
- 本文只做静态审查，没有运行 widget、tput 探测或 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **命令式 TUI 的核心是“改对象 + 提交帧”**，不是“状态的纯函数”。
2. **高层 widget 仍坐在 terminfo 上**：`Program` 才是和终端说话的那一层。
3. **定位语言可以很像 CSS，实现却是自己的百分比算术**。
4. **停更包也能当教学对照**：看清 ink 声明式流水线补上了什么。

## 应用型自测

1. `list.select(2)` 之后不调 `screen.render()`，终端会立刻高亮第三项吗？
2. `top: 'center'` 在 Element 里会保持这个字符串，还是被改写？
3. 没有 active Screen 时直接 `blessed.box({})` 会怎样？

检查点：

1. 不会。`select` 只改 `selected`；要提交帧。
2. 被改写成 `'50%'`。
3. 抛 `No active screen.`（或多屏时要求同步 append）。

## 延伸阅读

- 仓库：[github.com/chjj/blessed](https://github.com/chjj/blessed)
- 固定源码：本文绑定提交 `a45575fee63fac158fd467087ec172f657bfec6b`
- 下游仪表盘：[yaronn/blessed-contrib](https://github.com/yaronn/blessed-contrib)
- 对照：[vadimdemedes/ink](https://github.com/vadimdemedes/ink)

## 关联

- [[ink]] —— 声明式 React reconciler TUI，blessed 的对照组
- [[bubbletea]] —— Go Elm 架构，对照“消息进 Update、View 纯输出”
- [[textual]] —— Python + CSS 的终端界面
- [[ratatui]] —— Rust 立即模式，不管事件循环
- [[chalk]] —— 只做颜色，不做 widget 树
- [[enquirer]] —— 轻量提问，不占全屏 Screen

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

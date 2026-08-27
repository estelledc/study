---
title: cmdk — 用复合组件拼出来的命令菜单
来源: https://github.com/pacocoursey/cmdk
日期: 2026-08-27
分类: 前端 / 命令面板
难度: 中级
description: React 命令菜单：子组件自己注册，过滤时仍留在 React 树，只从 DOM 卸下。
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/pacocoursey/cmdk
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fb4ea04e9ec211777fbb39c6104e3c5f2ee107d2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.1.1
---

## 是什么

cmdk 是 Paco Coursey 做的 **React 命令菜单**。日常类比：VS Code 的 `Cmd+P` 被拆成一组能互相看见的零件——输入框、列表、条目、分组——你按 JSX 树摆它们，库负责过滤、选中和键盘。

你写：

```tsx
import { Command } from "cmdk"

<Command label="Command Menu">
  <Command.Input />
  <Command.List>
    <Command.Item onSelect={() => {}}>Open file</Command.Item>
    <Command.Item value="xxx">Value</Command.Item>
  </Command.List>
</Command>
```

固定 1.1.1 把每个 `Item` 留在 React 树里；搜索对不上时组件返回 `null`，DOM 变短，实例还在。条目身份优先用 `value`，否则从 `children` 或 `textContent` 推断。

## 为什么重要

不理解这套“DOM 说了算”的复合组件，就解释不了：

- 为什么可以把 `<BlogItems />` 这种自定义组件塞进列表，而不必先摊成数组
- 为什么过滤后条目从 DOM 消失，但 React 仍为未命中项分配实例
- 为什么 [[shadcn-ui]] 的 Command 能直接包一层样式，而不重写过滤
- 为什么 [[kbar]] 用 action 对象，cmdk 却坚持让调用方渲染子树

## 核心要点

固定 1.1.1 的执行链可以拆成五步：

1. **注册**：`Item` / `Group` 在 layout effect 里把自己的 id 记进 root 的 `allItems` / `allGroups`。
2. **打分**：默认 `filter` 是内嵌 `command-score`。返回 `0` 就隐藏；`keywords` 会拼进被打分字符串。
3. **显隐**：`shouldFilter` 显式 `false` 时，库不再打分排序，可见性交给调用方。空搜索默认全显示。
4. **排序**：有搜索且开启过滤时，库用 `appendChild` 按分数重排 list sizer / group 里的 DOM。
5. **选中**：搜索或过滤后选第一个未 `aria-disabled` 的可见项。`Enter` 向该项派发 `cmdk-item-select`。

`Command.Dialog` 只是 [[radix-ui]] Dialog 的 portal 包装；开关状态由调用方的 `open` / `onOpenChange` 拥有，库不监听 `Cmd+K`。

## 实践示例

### 案例 1：最小菜单

```tsx
<Command label="Menu">
  <Command.Input placeholder="Search…" />
  <Command.List>
    <Command.Empty>No results.</Command.Empty>
    <Command.Item onSelect={(v) => console.log(v)}>Open file</Command.Item>
  </Command.List>
</Command>
```

`Empty` 只在 `filtered.count === 0` 时渲染。空搜索时 count 等于已注册条目数，空状态不会出现。

### 案例 2：自己过滤

```tsx
<Command shouldFilter={false}>
  <Command.Input value={q} onValueChange={setQ} />
  <Command.List>
    {items.filter((item) => match(item, q)).map((item) => (
      <Command.Item key={item.id} value={item.id}>{item.label}</Command.Item>
    ))}
  </Command.List>
</Command>
```

`shouldFilter={false}` 跳过打分和 DOM 重排。异步结果应自己决定何时挂 `Command.Loading`；它只是进度条，不会替你拉数据。

### 案例 3：Dialog 由调用方开关

```tsx
<Command.Dialog open={open} onOpenChange={setOpen} label="Menu">
  <Command.Input />
  <Command.List>{/* items */}</Command.List>
</Command.Dialog>
```

快捷键、焦点陷阱和 overlay 样式都在这层 Radix Dialog；根 `Command` 本身不绑定全局快捷键。

## 踩过的坑

1. **以为过滤会卸载 React 子树**：未命中项返回 `null`，实例仍在。几千条时内存按“全量 Item”估，不能按可见 DOM 估。
2. **`textContent` 会变却不给 `value`**：选中与过滤按稳定 `value` 跟踪。内容每次 render 都变时必须显式传入。
3. **把 `vimBindings` 当成关闭**：默认 `true`，Ctrl+N/J/P/K 会移动选中。CJK IME 合成中（`isComposing` 或 `keyCode === 229`）这些键被忽略。
4. **指望箭头在两端循环**：`loop` 默认关；越界不会绕回。
5. **把 GitHub 旧地址和 npm `gitHead` 当同一证明**：npm 1.1.1 没有 `gitHead`；GitHub 现把 `pacocoursey/cmdk` 解析到 `dip/cmdk`。本文绑的是可达 tag `v1.1.1`。

## 适用 vs 不适用场景

**适用**：

- 需要复合组件、自定义条目 UI、分组和 Radix Dialog 外壳的 React 18/19 应用
- 愿意让过滤发生在“仍挂着的 Item 实例”上，并用 `value` / `keywords` 控制匹配

**不适用**：

- 需要全局 `Cmd+K`、嵌套 action 树或可撤销命令——那是 [[kbar]] 的合同
- React 17 或不能接受 Radix dialog / primitive 依赖
- 要把过滤完全做成虚拟列表数据源，却还想保留默认 `shouldFilter`

## 固定版本边界

- 本文绑定 `dip/cmdk@fb4ea04e...`（GitHub 对 `pacocoursey/cmdk` 的当前解析），tag 与 package 均为 `1.1.1`。
- peer 为 React 18/19；运行时依赖 `@radix-ui/react-compose-refs`、`react-dialog`、`react-id`、`react-primitive`。
- 未安装依赖、未跑 Playwright、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **复合组件用注册表补“看不见的子树”**——`<BlogItems />` 里的 Item 自己申报，不必 `React.Children`。
2. **过滤策略是可关的默认值**——`shouldFilter === false` 把可见性交还调用方。
3. **排序可以是 DOM 手术**——有搜索时 `appendChild` 重排，而不是只改 React 顺序。
4. **对话框不等于命令菜单**——Dialog 只提供 portal；快捷键和数据模型在别处。

## 应用型自测

1. 空搜索时，`Command.Empty` 会不会出现？
2. `shouldFilter={false}` 时，默认 `command-score` 还会隐藏低分项吗？
3. 不设 `open` 监听时，`Command.Dialog` 会不会自己响应 `Cmd+K`？

检查点：

1. 不会；空搜索把 `filtered.count` 设成全部已注册条目。
2. 不会；显式 `false` 跳过打分与排序。
3. 不会；开关由调用方拥有，库不注册全局快捷键。

## 延伸阅读

- 固定源码：[pacocoursey/cmdk](https://github.com/pacocoursey/cmdk) —— 本文绑定 `fb4ea04e9ec211777fbb39c6104e3c5f2ee107d2`
- [[kbar]] —— action 树 + Fuse + 内置 `$mod+k`
- [[radix-ui]] —— Dialog / Primitive 底座
- [[shadcn-ui]] —— 在 cmdk 外包了一层可复制样式

## 关联

- [[kbar]] —— 同赛道；数据模型是 action 而不是复合组件
- [[radix-ui]] —— `Command.Dialog` 直接用 Radix Dialog
- [[react]] —— peer 18/19
- [[shadcn-ui]] —— 常见样式分发层
- [[fzf]] —— 终端里的模糊选择器，合同不同

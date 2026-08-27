---
title: TanStack Form — 跨框架共享一份表单校验逻辑
来源: 'https://github.com/TanStack/form + https://tanstack.com/form'
日期: 2026-05-30
分类: projects / 前端
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/TanStack/form
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b865ef335a69aa08a2f160895258f13e03773467
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.33.5
---

## 是什么

TanStack Form 是一个**把表单状态引擎写成纯 JS、再按框架套薄适配层**的表单库。日常类比：像一份外贸合同的双语模板——业务条款（值、校验、错误追踪）只写一遍，前面贴哪国语言（哪种框架）就长哪国的样子。

核心包 `@tanstack/form-core` 不依赖任何框架，只依赖 `@tanstack/store` 等自家基础库，用 `FormApi` / `FieldApi` 两个类管字段值、跑校验、追错误。固定 1.33.5 的仓库里，框架适配层有 React、Vue、Solid、Lit、Angular、Preact、Svelte 七个包，另有 devtools 与 Next.js / Remix / Start 集成包。

它和最有名的对手 **react-hook-form**（RHF）的关键差异：RHF 是 React 专属的 uncontrolled 路线；TanStack Form 是显式受控——每个字段要自己接 `value` / `onChange` / `onBlur` 三件套，换来的是同一套核心跨框架复用。

## 为什么重要

不理解 TanStack Form，下面这些事都没法解释：

- 为什么一家公司前端栈是 React 后台 + Solid 营销页，可以共用一份业务校验代码不用写两遍
- 为什么 zod、valibot、arktype 这些 schema 库能被同一个表单库直接“吃”进去——背后是哪个接口在牵线
- 为什么 TanStack 全家桶（Query / Form / Table / Router）都长成“core + adapter”的形状
- 为什么显式 selector 订阅和 RHF 那种“记录你读过什么”的隐式订阅，是同一个问题的两条路线

## 核心要点

TanStack Form 的设计可以拆成三个支柱（对应固定源码 `packages/form-core/src/`）：

1. **核心和适配分离**：`FormApi` 在构造时用 `@tanstack/store` 的 `createStore` 建一个 base store，再派生出 fieldMeta 等衍生 store；它不知道 React 是什么。React 适配层在 `useState` 里建 `FormApi`，每次渲染调 `formApi.update(opts)` 同步配置，挂载时调 `formApi.mount()`。类比：`form-core` 是发动机，adapter 是变速箱。

2. **显式 selector 订阅**：组件用 `useStore(form.store, s => s.values.email)`（从 `@tanstack/react-store` 再导出的独立函数）或 `<form.Subscribe selector={...}>` 组件，主动声明只关心哪一片状态。类比：订报纸时只勾“体育版”。注意固定 1.33.5 里没有 `form.useStore(...)` 这种实例方法。

3. **Standard Schema 接口**：任何对象只要带 `'~standard'` 属性（`version: 1`、`vendor`、`validate()`，同步或返回 Promise），就能直接放进 `validators` 当校验器。zod / valibot / arktype 都实现这个协议，所以可以互换。类比：USB 接口标准化以后，鼠标键盘随便插。

提交主链：`handleSubmit()` → 提交计数 +1、批量把所有字段标记 touched → 字段级 `validateAllFields('submit')` → 表单级 `validate('submit')` → 全部通过才调你的 `onSubmit({ value })`。

## 实践示例

### 案例 1：React 登录表单 + zod 校验

```tsx
import { useForm } from "@tanstack/react-form";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function LoginForm() {
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => console.log(value),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
      <form.Field name="email">
        {(field) => (
          <input
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
    </form>
  );
}
```

逐部分解释：`useForm` 返回带 `Field` / `Subscribe` 组件的扩展 FormApi；`form.Field` 是 render-prop 写法，把当前字段的 state + handler 交给你；`field.handleChange` 内部走 `setValue` → `form.setFieldValue` 再触发 `validate('change')`。整段就是显式受控三件套。`password` 字段同形（再写一块 `form.Field name="password"`），上面为省篇幅只展开了 email。

### 案例 2：跨框架共享 schema

```ts
// shared/schemas.ts —— 一份 zod schema
export const LoginSchema = z.object({ email: z.string().email() });

// React 端（@tanstack/react-form）
const reactForm = useForm({ validators: { onSubmit: LoginSchema }, ... });

// Solid 端（@tanstack/solid-form）
const solidForm = createForm(() => ({ validators: { onSubmit: LoginSchema }, ... }));
```

业务校验只写一遍。React 用 `useForm`，Solid 用 `createForm`，参数对象几乎同形——因为两边最终都进同一个 `form-core` 的 `FormApi`。换 RHF 就只能 React 一份、Solid 另找一套。

### 案例 3：selector 精准订阅减少重渲染

```tsx
import { useStore } from "@tanstack/react-form";

// 只让这个按钮随 isSubmitting 重渲染，别的字段变化不影响它
const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
return <button disabled={isSubmitting}>登录</button>;

// 组件式等价写法
<form.Subscribe selector={(s) => s.isSubmitting}>
  {(isSubmitting) => <button disabled={isSubmitting}>登录</button>}
</form.Subscribe>
```

selector 返回什么，组件就只在那一片状态变化时重渲染。这套 selector 思路与 zustand 等库同源，但这里的实现是 TanStack 自家的 `@tanstack/store` + `@tanstack/react-store`。

## 踩过的坑

1. **每个字段必须显式三件套**：`value` / `onChange` / `onBlur` 一个不能少，比 RHF `register('email')` 一行多几行代码——刚从 RHF 切过来的人会不适应。这是显式受控换跨框架的固定成本。

2. **selector 写错容易订阅过多**：`useStore(form.store, s => s)` 返回整个 state，等于每次任何变化都重渲染；正确做法是取最小子集，如 `s => s.values.email`。

3. **API 形态要对准版本**：固定 1.33.5 的订阅入口是独立函数 `useStore(form.store, selector)` 或 `<form.Subscribe>`；网上教程里 `form.useStore(...)` 的实例方法写法在这个版本不存在，抄错会直接编译报错。

4. **Standard Schema 需要对应版本的 schema 库**：`validators` 直接吃 schema 的前提是该库实现了 `'~standard'` 协议（zod / valibot / arktype 的新主版本）；老版本 schema 库要走函数校验器或升级。

5. **首次提交失败后的行为有细节**：`canSubmit` 为 false 时第一次提交会直接走 `onSubmitInvalid` 返回；再次提交则会重新跑全字段校验以清掉过期错误。写“提交按钮永远可点”的逻辑时要知道这条链。

## 适用 vs 不适用场景

**适用**：

- 真的有多框架并存的项目（如 React 后台 + Solid 营销页 + Lit 嵌入组件），想共用校验逻辑
- schema 库可能切换的长期项目——Standard Schema 让 zod ↔ valibot ↔ arktype 互换
- 已用 TanStack Query / Table / Router、想统一“core + adapter + selector”心智模型的团队
- 需要字段级 async 校验 + `asyncDebounceMs` 防抖、或表单级服务端校验挂点的场景

**不适用**：

- 单一 React 项目且无跨框架计划——[[react-hook-form]] 生态更深、每字段样板更少
- 重 SSR 表单流（Server Action / FormData first）——先评估框架自带方案与 meta-framework 集成包的边界
- 想要“零样板”极简表单——显式三件套注定比 uncontrolled 写得多
- 依赖旧版 schema 库又不能升级——Standard Schema 协议接不上

## 固定版本边界

- 本文绑定 `TanStack/form@b865ef33...`（"ci: Version Packages (#2319)"），per-package tag `@tanstack/form-core@1.33.5` 与 `@tanstack/react-form@1.33.5` 都指向该提交；npm 未暴露 gitHead，以双 tag 一致作为溯源锚点。
- `@tanstack/form-core` 依赖 `@tanstack/store` `^0.11.0`、`@tanstack/pacer-lite`、`@tanstack/devtools-event-client`；`@tanstack/react-form` peer 依赖 React `^17 || ^18 || ^19`。
- 该版本校验器按 cause 分组（`onMount` / `onChange` / `onBlur` / `onSubmit` / `onDynamic` + async 变体，支持 `asyncDebounceMs`），并接受实现 `'~standard'`（Standard Schema v1）协议的对象。
- 上游已存在 `@tanstack/*-form@2.0.0-alpha.2` tag（2026-08-21），v2 alpha 线进行中；本文不描述 v2 行为。
- 本文未安装依赖、未运行上游测试、未测 bundle 或字段规模性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **core + adapter 模式**是工具库可持续架构——状态引擎一台，框架桥各配一个，TanStack 全家桶都用这一套
2. **显式 selector vs 隐式记录读取**是订阅设计的两条路：显式的可预测、可调试，隐式的少样板；选型时先想清楚团队要哪种可见性
3. **接口标准化（Standard Schema）让生态库可互换**——一个 `'~standard'` 属性解耦了表单库与校验库，胜过硬编码绑定
4. **跨框架复用的真实成本在字段接线**：核心逻辑免费共享，每个框架的输入绑定仍要各自写——评估收益时别只看“一份 schema”

## 应用型自测

1. 固定 1.33.5 里，想只订阅 `isSubmitting`，应该写 `form.useStore(s => s.isSubmitting)` 吗？
2. 把一个实现了 `'~standard'` 协议的 valibot schema 直接放进 `validators.onSubmit`，可以吗？
3. `field.handleChange(v)` 只是改值吗，还会发生什么？

检查点：

1. 不应该。该版本没有这个实例方法；用独立导出的 `useStore(form.store, s => s.isSubmitting)` 或 `<form.Subscribe selector>`。
2. 可以。校验入口检测到 `'~standard'` 属性就按 Standard Schema v1 调它的 `validate()`，zod / valibot / arktype 同理。
3. 还会走 `form.setFieldValue` 更新核心 store、标记 dirty，并默认触发该字段的 `validate('change')`。

## 延伸阅读

- 官方文档：[tanstack.com/form](https://tanstack.com/form/latest)（七个框架各自的 quickstart）
- 固定源码：[TanStack/form](https://github.com/TanStack/form) —— 本文绑定提交 `b865ef335a69aa08a2f160895258f13e03773467`
- Standard Schema 规范：[github.com/standard-schema/standard-schema](https://github.com/standard-schema/standard-schema)
- [[react-hook-form]] —— 直接对手，uncontrolled 路线的 React 专属之王

## 关联

- [[react-hook-form]] —— 直接对手，React-only 但生态深
- [[zod]] —— 经 Standard Schema 接口直接接入的主流 schema 库
- [[valibot]] —— 同走 Standard Schema，模块化更细的替代
- [[arktype]] —— 同协议，string DSL 风格
- [[zustand]] —— selector 订阅思路可对照，但实现分属两家 store
- [[tanstack-query]] —— 同团队兄弟项目，共享 core + adapter 设计哲学
- [[tanstack-router]] —— 同款 framework-agnostic 思路，把路由跨框架化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[conform]] —— Conform — 让浏览器原生 form 也能 type-safe 校验
- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库

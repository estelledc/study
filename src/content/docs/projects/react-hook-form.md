---
title: react-hook-form — input 不进 React state 也能写表单
来源: 'https://github.com/react-hook-form/react-hook-form'
日期: 2026-05-30
分类: projects
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/react-hook-form/react-hook-form
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 33860b43d5c52f39b7280a012b5876e6ad3e905c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.86.0
---

## 是什么

react-hook-form（缩写 **RHF**）是一套**让 input 值不走 React state、由内部可变对象直接托管**的 React 表单库。日常类比：像饭店点单——服务员（React）不必每写一个字就跑回厨房汇报，最后下单（提交）才把整张纸递过去。

你写：

```jsx
const { register, handleSubmit } = useForm();
return <input {...register("email")} />;
```

`register("email")` 返回 `{ name, onChange, onBlur, ref }` 摊到 input 上。从这一刻起，用户每敲一个字符只更新 DOM 和内部值仓库，默认不触发 React 重渲染——直到提交那一下，RHF 才把所有字段值收齐交给你的回调。固定 7.86.0 的重渲染差异来自“少走 setState”这一机制本身；本轮未运行与 Formik 等库的对比 benchmark，不引用倍数结论。

## 为什么重要

不理解 RHF 的 uncontrolled 心智，下面这些事都解释不通：

- 为什么多字段大表单里“每个 input 一个 useState”会让每次击键都重渲染整棵子树，而 RHF 默认击键不重渲染
- 为什么 RHF 常和 zod / valibot 这类 schema 库搭配——核心只留了一个 `resolver` 挂点，校验库全部外置
- 为什么 uncontrolled 值存在 DOM/内部仓库里，遇到 Server Components 与 hydration 边界要格外小心
- 为什么“订阅你读过的状态、只在它变化时重渲染”是一类通用性能思路——RHF 对 formState 的按需订阅是其中一种实现

## 核心要点

RHF 的执行链可以拆成四步（对应固定源码 `src/logic/createFormControl.ts`）：

1. **register 把 input 登记成 uncontrolled**：返回 `{ name, onChange, onBlur, ref }`；`onBlur` 与 `onChange` 是同一个统一处理器，内部靠 `event.type` 区分 blur/change。值不进 React state。

2. **内部值仓库 `_formValues`**：一个可变对象镜像所有字段值。输入时统一处理器把新值 `set` 进去，但不调用 setState；只有 touched/dirty 变化、字段被 watch 或错误状态变化时才通知订阅者重渲染。

3. **formState 按需订阅**：`useForm` 返回的 `formState` 经 `getProxyFormState` 包装，用 `Object.defineProperty` 的 getter 记录你读过哪些**顶层 key**（`errors`、`isDirty`、`isValid`…）。之后只有这些 key 变化才让根组件重渲染。注意粒度是 formState 的 key，不是 `errors.email` 这种字段级路径。

4. **handleSubmit 收口**：克隆 `_formValues` → 跑 resolver schema 或内建规则校验 → 把 disabled 字段从提交值里剔除 → 全部通过才调用你的 onValid 回调，并更新 `isSubmitted` / `submitCount`。

默认校验模式：`mode: onSubmit`（提交前不校验）、`reValidateMode: onChange`（提交失败后每次输入重校验）、`shouldFocusError: true`。

## 实践示例

### 案例 1：register 一行替代 useState + onChange

```jsx
import { useForm } from "react-hook-form";

function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm();
  return (
    <form onSubmit={handleSubmit(v => console.log(v))}>
      <input {...register("email", { required: "必填" })} />
      {errors.email && <span>{errors.email.message}</span>}
      <input {...register("password", { minLength: 8 })} />
      <button>登录</button>
    </form>
  );
}
```

**逐部分**：

- `register("email", { required: "必填" })` 摊到 input 上 = name + 统一 onChange/onBlur + ref 一次给齐
- `handleSubmit(callback)` 返回真正的事件处理器，先 preventDefault、跑校验，全部通过才调 callback
- 这里读了 `formState.errors`，getter 把 `errors` 记入订阅集；提交失败写入 errors 时组件才重渲染

零 useState、零手写 onChange——一份表单写完没碰一次 React state。

### 案例 2：resolver 挂点接 schema 校验

```ts
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const schema = z.object({ email: z.string().email(), age: z.number().min(18) });
type FormValues = z.infer<typeof schema>;

const { register, handleSubmit } = useForm<FormValues>({ resolver: zodResolver(schema) });
// 下面仍是 <input {...register("email")} /> + handleSubmit，与案例 1 同形
```

**逐部分**：

- 固定源码里 `handleSubmit` 与输入路径都优先走 `_options.resolver`，命中时跳过内建规则
- `z.infer<typeof schema>` 把 schema 类型灌给 hook，`register("email")` 字段名补全、值类型自动对
- `@hookform/resolvers` 是独立仓库/包，负责把 zod 等库桥成 resolver 函数；本文只绑定核心的挂点行为，不绑定桥接包版本

### 案例 3：Controller 桥接受控组件

react-select / MUI / antd 这类组件不暴露原生 input ref，需要用 Controller 包一层：

```jsx
import { Controller } from "react-hook-form";
import Select from "react-select";

<Controller control={control} name="country"
  render={({ field }) => <Select {...field} options={countries} />} />
```

**逐部分**：

- `control` 从 useForm 拿，相当于“表单遥控器”
- `render` 拿到 `field = { value, onChange, onBlur, ref }`，spread 给受控组件即可
- 固定源码中 `useController` = `useWatch`（值）+ `useFormState`（字段状态）的组件级订阅：该字段每次输入这个组件都会重渲染——比 register 路径重，是与受控生态妥协的桥

## 踩过的坑

1. **register 和 value 属性抢值**：给 input 同时写 `value={x}` 和 `{...register("x")}`，两套机制互相覆盖，input 看起来更新了但提交拿到旧值。RHF 要 uncontrolled，input 上别再写 value。

2. **watch() 把性能优势全交回去**：固定源码里无参 `watch()` 订阅整张表的值，每次输入都让本组件重渲染。要单字段就用 `useWatch({ name: "email" })`，订阅留在子组件；7.86.0 的 `useWatch` 还支持 `compute` 投影，只在算出的结果变化时更新。

3. **Controller 越多越接近全受控**：每个 Controller 都是组件级订阅，字段一多，击键重渲染次数随之增加，uncontrolled 的差异逐渐消失。这是机制推论；本轮未测量具体阈值。

4. **shouldUnregister 默认保留卸载字段的值**：7.86.0 默认 `shouldUnregister` 为 falsy——字段组件卸载后值仍留在 `_formValues`，提交结果里会带出“已经不在界面上”的字段。做动态表单要么显式 `shouldUnregister: true`，要么手动 `unregister`。

5. **disabled 字段不进提交结果**：`handleSubmit` 在调用回调前把 disabled 字段的值从 payload 里 `unset`。想保留只读值就用 `readOnly` 而不是 `disabled`。

## 适用 vs 不适用场景

**适用**：

- 中大型、字段多、击键频繁的表单，希望输入路径不触发 React 重渲染
- React + TypeScript 项目，用 resolver 挂点接 zod / valibot 等 schema 库
- 复杂条件字段、依赖联动、动态 FieldArray
- 满足 package 边界：Node >=18，React `^16.8 || ^17 || ^18 || ^19`

**不适用**：

- 重 Server Components / Server Action 的表单——uncontrolled 值不在 React 树里，hydration 与服务端往返边界要自己兜
- 表单只有 3-5 个字段——RHF 的心智成本和 useState 持平甚至更高
- 已深度绑定 antd Form / Mantine Form 的项目——这些 UI 库自带表单系统，混用代价高
- 大多数字段都必须走 Controller 的纯受控生态——RHF 的机制优势发挥不出来

## 固定版本边界

- 本文绑定 `react-hook-form/react-hook-form@33860b43...`，即 tag `v7.86.0`，package 版本 `7.86.0`。
- npm 同版本的 `gitHead` 比 tag 多一个仅改 CHANGELOG 的提交，tag 是它的祖先，两者源码树一致；本文绑定 tag 提交。
- package 声明 Node >=18；peer 依赖 React `^16.8.0 || ^17 || ^18 || ^19`。
- 默认选项：`mode: onSubmit`、`reValidateMode: onChange`、`shouldFocusError: true`；`shouldUnregister` 默认 falsy（卸载保留值）；disabled 字段值在提交时被剔除。
- 同版本还提供 `createFormControl`（hook 外建控制器）、公开 `subscribe` API 与 bfcache 恢复用的内部 resync；本文未展开。
- 本文未安装依赖、未运行上游测试、未测 bundle 或性能对比，状态保持 `UNVERIFIED`。

## 学到什么

1. **uncontrolled 在 React 时代不是落后选择**——把高频值更新挪出 React state 是性能 vs DX 的工程权衡，字段多时优势明显
2. **可变仓库 + 选择性通知**是高频状态的通用解法：值随便写，重渲染只在“有人订阅的状态”变化时发生
3. **记录“你读过什么”不一定要 Proxy**——defineProperty getter 同样能实现按需订阅；粒度设计（key 级 vs 字段级）才是关键取舍
4. **resolver 模式**让校验库与表单库解耦：核心只留挂点，桥接放独立包，生态可以各自演化

## 应用型自测

1. `register("email")` 返回的 `onChange` 和 `onBlur` 是两个不同的处理函数吗？
2. 组件里只读了 `formState.isDirty`，另一个字段的校验错误变化会让它重渲染吗？
3. 一个 `disabled` 的字段，它的值会出现在 `handleSubmit` 拿到的 values 里吗？

检查点：

1. 不是。两者是同一个统一处理器，内部靠 `event.type` 判断是 blur 还是 change。
2. 不会。getter 只把读过的顶层 key（这里是 `isDirty`）记入订阅集，`errors` 变化不触发它重渲染。
3. 不会。提交前 disabled 字段的值被从 payload 中剔除；要保留值应改用 `readOnly`。

## 延伸阅读

- 官方文档：[react-hook-form.com](https://react-hook-form.com/)（Get Started 30 分钟能跑通）
- 固定源码：[react-hook-form/react-hook-form](https://github.com/react-hook-form/react-hook-form) —— 本文绑定提交 `33860b43d5c52f39b7280a012b5876e6ad3e905c`
- [[zod]] —— RHF 最常搭的 schema 库，经 resolver 挂点接入
- [[tanstack-form]] —— 同代竞品，显式受控 + selector 订阅，设计哲学正相反

## 关联

- [[zod]] —— RHF 最常配的 schema 校验库，`@hookform/resolvers/zod` 一行接通
- [[valibot]] —— zod 的轻量替代，同样有 RHF resolver 桥
- [[react]] —— RHF 完全建立在 hooks 之上，没有 16.8 就没有它
- [[tanstack-form]] —— 同期新作品，从设计到 API 都是 RHF 的对照组
- [[valtio]] —— 用 Proxy 做细粒度订阅的 state 库；RHF 用 getter 记录订阅，两者可对照
- [[jotai]] —— atom 粒度订阅，与 RHF 的 formState key 粒度订阅是同思路不同粒度
- [[mobx]] —— 响应式订阅的老牌代表，适合对照理解“订阅你读过的状态”

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[conform]] —— Conform — 让浏览器原生 form 也能 type-safe 校验
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[pdfme]] —— pdfme — TypeScript 模板化 PDF
- [[projects/react]] —— React — 用组件描述界面的 JavaScript 库
- [[react-dnd]] —— react-dnd — React 时代第一个把拖拽拆成四层的库
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[zod]] —— Zod — TypeScript-first schema 验证

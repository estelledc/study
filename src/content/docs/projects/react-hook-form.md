---
title: react-hook-form — input 不进 React state 也能写表单
来源: 'https://github.com/react-hook-form/react-hook-form'
日期: 2026-05-30
分类: projects
难度: 中级
---

## 是什么

react-hook-form（缩写 **RHF**）是一套**让 input 不走 React state、靠 ref 直接读 DOM 值**的 React 表单库。日常类比：像饭店点单——服务员（React）不必每写一个字就跑回厨房汇报，最后下单（提交）才把整张纸递过去。

你写：

```jsx
const {register, handleSubmit} = useForm();
return <input {...register("email")} />;
```

`register("email")` 返回一组 `ref + onChange + onBlur` 摊到 input 上。从这一刻起，用户每敲一个字符**只更新 DOM 自己**，不触发 React 重渲染——直到提交那一下，RHF 才把所有字段值收齐。这就是它在大表单里比 Formik 快 5-10 倍的根因。

## 为什么重要

不理解 RHF 的 uncontrolled 心智，下面这些事都解释不通：

- 为什么 100 字段表单用 Formik 输入卡顿，换成 RHF 立刻丝滑——同一个 React，差异在哪
- 为什么 RHF + zod 几乎成了 React + TS 项目的默认搭配，而不是 RHF + 自己写校验
- 为什么 RHF 在 Server Components / Suspense 边界总有奇怪 hydration warning，新一代库（Conform）反而更好
- 为什么 valtio / mobx-react-lite / TanStack Query 这些库都用同一套"Proxy + 按字段订阅"

## 核心要点

RHF 性能秘诀拆三步：

1. **register 把 input 注册成 uncontrolled**：返回 `{ref, name, onChange, onBlur}`，spread 到 `<input>`。值存在 DOM 里，**不进 React state**。类比：把笔记写在纸上，不每次都拍照发群。

2. **valuesRef 当影子仓库**：RHF 内部维护一个 `valuesRef.current` 镜像所有字段值。用户输入时 onChange 更新它，但**不**调用 setState。类比：服务员心里记单，但不打断厨房。

3. **formState 用 Proxy 按字段订阅**：你访问 `formState.errors.email` 时，Proxy 拦截这次 get，把"errors.email"加进订阅集。之后只有 errors.email 变了，本组件才重渲染。类比：你订阅"我的快递"通知，邻居的快递更新不吵你。

三件事合起来：输入只动 DOM，校验只动相关订阅者，整张表只在提交时被读一遍。

## 实践案例

### 案例 1：register 一行替代 useState + onChange

```jsx
import {useForm} from "react-hook-form";

function LoginForm() {
  const {register, handleSubmit, formState: {errors}} = useForm();
  return (
    <form onSubmit={handleSubmit(v => console.log(v))}>
      <input {...register("email", {required: "必填"})} />
      {errors.email && <span>{errors.email.message}</span>}
      <input {...register("password", {minLength: 8})} />
      <button>登录</button>
    </form>
  );
}
```

**逐部分**：

- `register("email", {required: "必填"})` 摊到 input 上 = ref + name + onChange + onBlur 一次给齐
- `handleSubmit(callback)` 返回一个真正的事件处理器，会先跑校验再调 callback
- `errors.email` 被读到时 Proxy 才订阅；提交失败 errors 写入，才重渲染该 span

零 useState、零 onChange handler——一份表单写完没碰一次 React state。

### 案例 2：zodResolver 端到端类型安全

```ts
import {z} from "zod";
import {zodResolver} from "@hookform/resolvers/zod";

const schema = z.object({email: z.string().email(), age: z.number().min(18)});
type FormValues = z.infer<typeof schema>;

const {register, handleSubmit} = useForm<FormValues>({resolver: zodResolver(schema)});
```

**逐部分**：

- `z.object({...})` 写一份 schema，**一次定义，校验+类型双输出**
- `z.infer<typeof schema>` 自动算出 `{email: string, age: number}` 类型
- `useForm<FormValues>` 把类型灌给 hook，`register("email")` 字段名补全、值类型自动对
- 同一个 schema 拿去 Server Action 再 `safeParse` 一次，前后端校验逻辑零重复

### 案例 3：Controller 桥接受控组件

react-select / MUI / antd 这些 UI 库的组件不接受 ref 直接读值，需要用 Controller 包一层：

```jsx
import {Controller} from "react-hook-form";
import Select from "react-select";

<Controller control={control} name="country"
  render={({field}) => <Select {...field} options={countries} />} />
```

**逐部分**：

- `control` 从 useForm 拿，相当于"表单遥控器"
- `render` 拿到 `field = {value, onChange, onBlur, ref}`，spread 给受控组件即可
- 代价：Controller 是组件级订阅，每次输入都重渲染——比 register 慢，但是与生态妥协的必要桥

## 踩过的坑

1. **register 和 useState 抢值**：你给 input 同时写 `value={x}` 和 `{...register("x")}`，两套机制互相覆盖，结果 input 看起来更新了但提交拿到旧值。RHF 要 uncontrolled，input 上**别**再写 value 属性。

2. **watch() 把性能优势全交回去**：`const all = watch()` 订阅整张表，每次输入都让本组件重渲染。10+ 字段时性能掉到 Formik 水平。该用 `useWatch({name: "email"})` 单字段订阅。

3. **Controller 越多越像 Formik**：受控组件每个字段都是一次组件级重渲染。10+ 个 Controller 的表单里 RHF 性能护城河接近消失，要么换 useController（更轻），要么承认这种场景就是慢。

4. **shouldUnregister v6→v7 默认翻转**：v7 默认 false（卸载组件保留字段值），v6 默认 true（删）。老项目升级时动态字段表行为静默改变，提交结果突然多出"已删除"字段。

## 适用 vs 不适用场景

**适用**：
- 中大型表单（10+ 字段），性能敏感
- React + TypeScript 项目，与 zod / valibot / yup schema 配套
- 复杂条件字段、依赖联动、动态 FieldArray
- 客户端高频校验场景（实时反馈用户输入）

**不适用**：
- 纯 Server Components / Server Action 场景——uncontrolled 与 hydration 边界冲突，Conform 更顺
- 表单只 3-5 字段——RHF 心智成本和 useState 持平甚至更高
- 已深度绑定 antd Form / Mantine Form 的项目——这些 UI 库自带表单系统，混用代价高
- React 19 之前的 SSR 表单——defaultValues 与 server props 同步要自己做

## 历史小故事（可跳过）

- **2019 年**：Bill Luo（@bluebill1049）个人开源 v1，对标当时垄断的 Formik，主打 uncontrolled。第一版 README 直接放 benchmark 数据，性能差距说服力极强。
- **2021 年**：v7 重写——把原来手动维护的 subscription 系统换成 Proxy，bundle 砍 30%，API 收敛到现在这套 register / handleSubmit / formState。breaking change，但社区接受度高。
- **2022 年**：`@hookform/resolvers` 拆出来独立维护，按子包提供 zod / yup / joi / valibot / arktype / class-validator 等桥接，让校验库与表单库彻底解耦。
- **2024 年**：weekly downloads ~10M+，GitHub 40k stars，与 zod 形成 React+TS 表单事实标配。

## 学到什么

1. **uncontrolled 在 React 时代不是落后选择**——它是性能 vs DX 的工程权衡，量大时优势明显
2. **Proxy + 按字段订阅** 是高性能 React 库的通用套路（valtio / mobx-react-lite / Jotai 都是这套思路）
3. **resolver 模式** 让校验库与表单库解耦，是开源最佳实践——Formik 早期硬编码 yup 后悔莫及
4. **生态网络效应是真护城河**——RHF 单点技术优势在小表单不明显，但 RHF + zod + tRPC + Next.js 形成闭环后新项目几乎默认这一套

## 延伸阅读

- 官方文档：[react-hook-form.com](https://react-hook-form.com/)（Get Started 30 分钟能跑通）
- 性能对比文章：[Why React Hook Form?](https://react-hook-form.com/faqs)（含与 Formik / Final Form 的逐项 benchmark）
- 视频：YouTube 搜 "Bill Luo react-hook-form" 有作者亲自讲设计动机
- [[zod]] —— RHF 默认搭档的 schema 库
- [[react]] —— hooks 是 RHF 存在的前提
- [[tanstack-form]] —— 同代竞品，hook-based + 渐进 control

## 关联

- [[zod]] —— RHF 最常配的 schema 校验库，`@hookform/resolvers/zod` 一行接通
- [[valibot]] —— zod 的轻量替代，bundle 小一截，同样有 RHF resolver
- [[react]] —— RHF 完全建立在 hooks 之上，没有 16.8 就没有它
- [[tanstack-form]] —— 同期新作品，从设计到 API 都是 RHF 的回应
- [[valtio]] —— 同样 Proxy + 按字段订阅，但用在全局 state 而非表单
- [[jotai]] —— atom 粒度订阅，与 RHF 字段粒度订阅是同思路在不同问题上的应用
- [[mobx]] —— Proxy 订阅的祖师爷，RHF 的 formState Proxy 思路就是 mobx 简化版

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[conform]] —— Conform — 让浏览器原生 form 也能 type-safe 校验
- [[jotai]] —— Jotai — 原子化 React 状态管理
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[pdfme]] —— pdfme — TypeScript 模板化 PDF
- [[react]] —— React UI 组件库
- [[react-dnd]] —— react-dnd — React 时代第一个把拖拽拆成四层的库
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[valtio]] —— valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
- [[zod]] —— Zod — TypeScript-first schema 验证


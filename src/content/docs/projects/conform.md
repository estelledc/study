---
title: Conform — 让浏览器原生 form 也能 type-safe 校验
来源: 'https://github.com/edmundhung/conform'
日期: 2026-05-31
分类: projects
难度: 中级
---

## 是什么

Conform 是一套**让 React 表单顺着浏览器原生 `<form>` 提交流程跑、还能拿到 zod 级类型安全**的库。日常类比：邮局寄快递——你只填一张纸单（FormData），扔进邮筒（浏览器自动收集），快递员按规章校验。和 react-hook-form（RHF）那种"服务员心里记单"路线相反。

你写：

```jsx
const [form, fields] = useForm({onValidate: ({formData}) => parseWithZod(formData, {schema})});
return <form {...getFormProps(form)}><input {...getInputProps(fields.email, {type: "email"})} /></form>;
```

每个 input 上的 `name` 属性就是真相，提交时**浏览器自己**把 FormData 打包送出去。关掉 JS 这张表照样能提交——这叫 **progressive enhancement**，是 Conform 与 RHF 的根本分歧点。

## 为什么重要

不理解 Conform 的 FormData-first 心智，下面这些事都解释不通：

- 为什么 Next.js Server Action / Remix action 圈子默认用 Conform 而不是 RHF——uncontrolled-via-ref 在 server boundary 上水土不服
- 为什么"关掉 JS 也能跑"在 2025 年还重要——SEO 爬虫、低端机、网络故障 fallback、邮件 client 内嵌表单
- 为什么同一个 zod schema 能在 client 和 server action 里跑两遍而不写两份代码
- 为什么 RHF 用 `valuesRef` 维护影子仓库，Conform 一行影子代码都没有

## 核心要点

Conform 的设计可以拆成 **三件事**：

1. **FormData 是唯一真相**：input 上的 `name="email"` 就是字段名，提交时浏览器自动收集成 FormData。Conform 不维护任何影子 state。类比：纸单本身就是订单，没有"另一份心里记的单"。

2. **schema validate 跑两遍**：同一份 zod schema 在 `onValidate` 里跑客户端校验（即时反馈），又在 server action 里 `parseWithZod` 跑一遍（最终把关）。`useForm` 的 `lastResult` 把 server 错误回灌给 UI。

3. **Proxy + lazy subscription 保性能**：`fields.email.errors` 被读到时才订阅这一字段，error 变了只重渲染相关组件。这一步和 RHF 的 formState Proxy 同思路。

三件合起来：表单值跟着浏览器走，校验跟着 schema 走，渲染跟着订阅走。

## 实践案例

### 案例 1：Server Action 端到端最小表单

```tsx
// app/login/page.tsx
"use client";
import {useActionState} from "react";
import {useForm, getFormProps, getInputProps} from "@conform-to/react";
import {parseWithZod} from "@conform-to/zod";
import {z} from "zod";
import {login} from "./actions";

const schema = z.object({email: z.string().email(), password: z.string().min(8)});

export default function LoginPage() {
  const [lastResult, action] = useActionState(login, undefined);
  const [form, fields] = useForm({
    lastResult,
    onValidate: ({formData}) => parseWithZod(formData, {schema}),
    shouldValidate: "onBlur",
  });
  return (
    <form {...getFormProps(form)} action={action}>
      <input {...getInputProps(fields.email, {type: "email"})} />
      <div>{fields.email.errors}</div>
      <input {...getInputProps(fields.password, {type: "password"})} />
      <button>登录</button>
    </form>
  );
}
```

**逐部分**：

- `getFormProps(form)` 把 noValidate / id / onSubmit 一次铺到 `<form>` 上
- `getInputProps(fields.email, {type: "email"})` 给 input 配 name + defaultValue + aria-invalid
- `useActionState(login, undefined)` 把双参数 Server Action 接到表单上，返回值再通过 `lastResult` 回灌 UI

### 案例 2：同一 schema 服务端再校验一次

```ts
// app/login/actions.ts
"use server";
import {parseWithZod} from "@conform-to/zod";
import {schema} from "./schema";

export async function login(prevState: unknown, formData: FormData) {
  const submission = parseWithZod(formData, {schema});
  if (submission.status !== "success") return submission.reply();
  // ...真正登录逻辑
}
```

`submission.reply()` 把 server 错误打包成 `lastResult`，前端用 `useActionState` 接住后传给 `useForm({lastResult})`——客户端 / 服务端校验逻辑零重复。

### 案例 3：FieldArray 用 intent 驱动

```tsx
const tasks = fields.tasks.getFieldList();
return (
  <>
    {tasks.map(task => <input key={task.key} {...getInputProps(task, {type: "text"})} />)}
    <button {...form.insert.getButtonProps({name: fields.tasks.name})}>加一行</button>
  </>
);
```

按钮渲染成 `<button name="__intent__" value="insert/tasks">`——禁 JS 时点击也会 POST，server 收到 intent 后插一行再回 200。这是 Conform 与 RHF 最不一样的地方：动态字段也走原生 form 语义。

## 踩过的坑

1. **v0 → v1 API 大改**：老教程里 `conform.input(fields.email)` 已废弃，现在叫 `getInputProps(fields.email, {type})`。看 2023 年之前的博客容易踩坑，认准 `@conform-to/react` v1+。

2. **lastResult 没回传 = server 错误显示不出来**：忘了在 `useForm({lastResult})` 把 server action 返回值穿回去，server 报"邮箱已存在"前端永远不显示。Server Action 必须 `return submission.reply()`。

3. **client 校验默认懒**：不写 `shouldValidate: "onBlur"` 或 `"onInput"`，校验只在提交时跑——用户填错半天没反馈。Conform 默认安静是为了 progressive enhancement，但要交互体验得显式打开。

4. **getInputProps 的 type 必须传**：`getInputProps(fields.email, {type: "email"})` 第二参的 `type` 决定生成的 props 是 text/checkbox/radio 哪类。漏写会拿到 string 默认值塞进 checkbox，行为错乱。

## 适用 vs 不适用场景

**适用**：
- Next.js App Router + Server Action 的 CRUD 表单
- Remix 项目（作者 Edmund Hung 来自 Remix 圈，原生契合）
- 需要支持禁 JS 用户、SEO 爬虫、邮件内嵌表单
- 服务端校验是真相源、客户端只做即时反馈的"表单 = 数据提交"场景

**不适用**：
- 高频实时校验、复杂字段依赖联动、富交互动画 → RHF 更顺
- 纯 SPA 无 server action（CSR-only） → Conform 渐进增强优势消失
- 已深度绑定 Mantine Form / AntD Form 的项目 → 混用代价高
- 表单只 3-5 字段无 server action → useState + zod 心智更省

## 历史小故事（可跳过）

- **2022 年**：Edmund Hung（@edmundhung）在 Remix 社区开源 Conform v0，定位是"让 Remix action 表单更顺"，靠 useFetcher + FormData 跑通。
- **2023 年**：脱离 Remix 专属，扩展到 Next.js App Router / 通用 React。同年 Server Action 进 Next.js stable，Conform 找到第二个主战场。
- **2024-01**：v1.0 release。API 从 `conform.input/select` 收敛到 `getInputProps/getSelectProps` 风格，对齐 RHF 的 register 心智，迁移成本压到最低。
- **2024-2025**：Next.js Server Action 普及后采用率攀升，社区把 RHF vs Conform 的选择写进 ADR——progressive enhancement 选 Conform，富交互选 RHF。

## 学到什么

1. **FormData 才是浏览器表单的真相**——React 时代我们习惯 valuesRef / useState 影子仓库，但浏览器原生提交流程一直在那
2. **progressive enhancement 不是历史包袱**——禁 JS 用户只是少数，但"关 JS 也能跑"是健壮性证书，server action 时代它重新值钱
3. **同一 schema 跑两遍** 是工程性价比最高的去重——客户端即时反馈 + 服务端最终把关，逻辑一份代码两个跑场
4. **API 风格趋同是好事**——Conform v1 的 `getInputProps` 与 RHF 的 `register` 心智几乎同型，迁移与对照成本都降到最低

## 延伸阅读

- 官方文档：[conform.guide](https://conform.guide)（含 Next.js / Remix / 通用 React 三套 Get Started）
- v1 升级指南：conform.guide/upgrading-v1（v0 → v1 API diff，老项目必读）
- 视频：YouTube 搜 "Edmund Hung Conform" 有作者讲 progressive enhancement 设计动机
- [[zod]] —— Conform 默认搭档的 schema 库
- [[react-hook-form]] —— ADR-4 核心张力对照对象
- [[react]] —— Conform 完全建立在 hooks 与 FormData 之上

## 关联

- [[react-hook-form]] —— 同代竞品，uncontrolled-via-ref vs uncontrolled-via-FormData 的根本分歧
- [[zod]] —— Conform 最常配的 schema 校验库，`@conform-to/zod` 一行接通
- [[valibot]] —— zod 的轻量替代，同样有 conform resolver
- [[react]] —— Conform 完全建立在 hooks + 浏览器原生 form 之上
- [[tanstack-form]] —— 第三条路，跨框架 + hook-based，与 Conform / RHF 形成三足
- [[remix]] —— 作者发源生态，action + useFetcher 与 Conform 心智同源
- [[next-app-router]] —— Server Action 时代让 Conform 找到主战场

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

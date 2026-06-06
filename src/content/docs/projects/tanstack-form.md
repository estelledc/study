---
title: TanStack Form — 跨框架共享一份表单校验逻辑
来源: 'https://github.com/TanStack/form + https://tanstack.com/form'
日期: 2026-05-30
子分类: projects / 前端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

TanStack Form 是一个**让你写一份表单校验逻辑、在 React/Vue/Solid/Lit/Angular 五种框架里都能用**的库。日常类比：像一份外贸合同的中英双语模板——业务条款（校验规则）只写一遍，前面贴哪国语言（哪种框架）就长哪国的样子。

它的"核心"`@tanstack/form-core` 是一段不依赖任何框架的纯 JS 代码，负责管字段值、跑校验、追错误。每种框架再各有一个薄薄的"适配层"`@tanstack/react-form` / `@tanstack/vue-form` 等，把核心结果接到当前框架的渲染机制上。

它和最有名的对手 **react-hook-form**（RHF）的区别：RHF 只能在 React 里用，TanStack Form 跨五个框架。代价是每个字段要多写 3-4 行（必须显式给 `value` / `onChange` / `onBlur` 三件套）。2024-10 发的 v1.0 RC 还引入了 **standardSchema** 接口，让 zod / valibot / arktype 这些校验库可以零成本互换。

## 为什么重要

不理解 TanStack Form，下面这些事都没法解释：

- 为什么一家公司前端栈是 React 后台 + Solid 营销页，可以共用一份业务校验代码不用写两遍
- 为什么 zod、valibot、arktype 这些 schema 库现在可以互换，背后是哪个接口在牵线
- 为什么 TanStack 全家桶（Query / Form / Table / Router）每个都比单点最佳更繁琐，但合在一起又能成立
- 为什么"跨框架"这个看似没人需要的能力，会被一些跨平台公司视为刚需

## 核心要点

TanStack Form 的设计可以拆成 **三个支柱**：

1. **核心和适配分离**：state 引擎写在纯 JS 包 `form-core`，不知道 React 是什么。每个框架有 5 KB 上下的 adapter，把 store 桥到框架的 reactivity。类比：`form-core` 是发动机，adapter 是变速箱——发动机一台，变速箱看你装哪辆车。

2. **显式 selector 订阅**：用 `form.useStore(s => s.values.email)` 主动声明"我只关心 email 字段"。类比：订报纸时只勾"体育版"，别的不送；vs RHF 用 Proxy 自动嗅探读了哪个字段。

3. **standardSchema 接口**：v1.0 RC 引入的统一校验协议。zod / valibot / arktype 都实现这个接口，TanStack Form 直接吃。类比：USB 接口标准化以后，鼠标键盘 U 盘随便插。

## 实践案例

### 案例 1：React 登录表单 + zod 校验

```tsx
import {useForm} from "@tanstack/react-form";
import {z} from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function LoginForm() {
  const form = useForm({
    defaultValues: {email: "", password: ""},
    validators: {onSubmit: schema},
    onSubmit: async ({value}) => console.log(value),
  });
  return (
    <form onSubmit={(e) => {e.preventDefault(); form.handleSubmit()}}>
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

逐部分解释：`useForm` 给你一个 form 对象；`form.Field` 是 render-prop 写法，把当前字段的 state + handler 交给你；`field.handleChange` 触发 store 更新。整段就是显式 controlled 三件套。

### 案例 2：跨框架共享 schema

```ts
// shared/schemas.ts —— 一份 zod schema
export const LoginSchema = z.object({email: z.string().email()});

// React 端
const reactForm = useForm({validators: {onSubmit: LoginSchema}, ...});

// Solid 端
const solidForm = createForm(() => ({validators: {onSubmit: LoginSchema}, ...}));
```

业务校验只写一遍。React 用 `useForm`，Solid 用 `createForm`，参数对象长得几乎一样。换 RHF 你就只能 React 一份、Solid 自己再写一份。

### 案例 3：selector 精准订阅减少重渲染

```tsx
// 只让这个组件随 isSubmitting 重渲染，其他字段变了它不动
const isSubmitting = form.useStore(s => s.isSubmitting);
return <button disabled={isSubmitting}>登录</button>;
```

`useStore(selector)` 是一个钩子，selector 返回什么，组件就只在那一片状态变化时重渲染。这套模式和 zustand 的 `useStore` 完全同源。

## 踩过的坑

1. **每个字段必须显式三件套**：`value` / `onChange` / `onBlur` 一个不能少。比 RHF `register('email')` 一行多 3-4 行代码——刚从 RHF 切过来的人会不适应。

2. **selector 写错容易订阅过多**：`useStore(s => s)` 直接返回整个 state 等于退化成全表渲染；正确做法是 `useStore(s => s.values.email)` 取最小子集。

3. **v1.0 仍在 RC**：2024-10 的版本号还是 RC，小版本之间偶有 break。生产用要锁版本 + 看 changelog。

4. **standardSchema 兼容性看版本**：必须 zod 4 / valibot 1.0 / arktype 2 这些版本才有原生 standardSchema 实现，老版本 zod 3 还得走 wrapper，类型推导偶尔挂掉。

## 适用 vs 不适用场景

**适用**：

- 跨框架的项目（如 React 后台 + Solid 营销页 + Lit 嵌入组件）
- schema 库可能切换的长期项目（standardSchema 让 zod ↔ valibot 切换零成本）
- 想统一 TanStack 全家桶心智模型的团队（已用 Query / Table / Router 的）

**不适用**：

- 单一 React 项目 + 没有跨框架计划 → 选 [[react-hook-form]]，生态最深、文档最全
- Server Action / Remix / Next App Router 重 SSR 场景 → 选 Conform，FormData first
- Vue 单生态 → 选 VeeValidate，Vue 内最成熟
- 100+ 字段的超大表单 → 慎用，官方 benchmark 主要在 50 字段以内

## 历史小故事（可跳过）

- **2017 年**：Tanner Linsley 开源 react-table，火到成为 React 表格事实标准
- **2020 年**：react-table v8 改名 TanStack Table，第一次走 framework-agnostic 路线
- **2023 年 9 月**：TanStack Form v0.1 发布，把同一套架构搬到表单
- **2024 年 10 月**：v1.0 RC 引入 standardSchema 接口，与 zod 4 / valibot 1.0 同期成熟

整条路线是同一个商业判断：未来 3-5 年前端框架更分散，跨框架的 state 抽象会成刚需。

## 学到什么

1. **核心 + adapter 模式**是工具库可持续架构——一个引擎多种宿主，TanStack 全家桶都用
2. **显式 selector vs 隐式 Proxy** 是订阅模式的两条路，各有适用场景：中等复杂表单 Proxy 顺手，超复杂表单 selector 可调试
3. **接口标准化（standardSchema）让生态库可互换**是健康开源的方向，胜过强绑定 vendor
4. **生态网络效应远比技术正确重要**——RHF + zod 仍占主导，TanStack Form 短期难撼动

## 延伸阅读

- 官方文档：[tanstack.com/form](https://tanstack.com/form)（含五个框架各自 quickstart）
- 视频：[Tanner Linsley — TanStack Form v1 announcement](https://www.youtube.com/c/tannerlinsley)（设计原则讲解）
- standardSchema spec：[github.com/standard-schema/standard-schema](https://github.com/standard-schema/standard-schema)
- [[react-hook-form]] —— 直接对手，单 React 之王
- [[zod]] —— 通过 standardSchema 接口集成最常见

## 关联

- [[react-hook-form]] —— 直接对手，React-only 但生态深
- [[zod]] —— 通过 standardSchema 接口集成的主流 schema 库
- [[valibot]] —— 同走 standardSchema，bundle 更小的替代
- [[arktype]] —— 同 standardSchema，string DSL 风格
- [[zustand]] —— TanStack Form core 的 store 设计与之同源
- [[tanstack-query]] —— 同团队兄弟项目，共享 selector + adapter 设计哲学
- [[tanstack-router]] —— 同款 framework-agnostic 思路，把路由跨框架化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[conform]] —— Conform — 让浏览器原生 form 也能 type-safe 校验
- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[tanstack-query]] —— TanStack Query — 数据获取与缓存库
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[vue-i18n]] —— vue-i18n — Vue 官方 i18n，切语言整页自己刷新
- [[zod]] —— Zod — TypeScript-first schema 验证
- [[zustand]] —— Zustand — 极简 React 状态管理


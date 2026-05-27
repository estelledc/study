---
title: shadcn/ui — 把组件库变成"代码源加 CLI 包管"
description: 反 npm install 范式：组件源码直接复制进你的项目，让你 own 它。
sidebar:
  label: shadcn/ui
  order: 1
---

| 维度 | 值 |
|------|------|
| GitHub | <https://github.com/shadcn-ui/ui> |
| Star | 115k（2026-05） |
| 版本 | v4.8.1（2026-05-26） |
| 最近活跃 | 2 天前最新 commit；v4 系列稳定迭代 |
| 主语言 | TypeScript 90.3% |
| 维护 | 主要由 [@shadcn](https://github.com/shadcn) 主导 + 活跃社区 |
| License | MIT |
| 研究日期 | 2026-05-27（按 [方法论 7 层](/study/method/) 重写第 1 版） |

## 一句话定位

shadcn/ui 不是一个 React 组件库。它是 **一个 CLI + 一份 schema + 一组组件源码模板**——
你用 `npx shadcn add button`，CLI 去 registry 拉源码，**把 button.tsx 写进你项目的
`components/ui/`**。从此这文件归你，没有 npm 升级问题，因为没有 npm 包。

## Why（它解决了什么）

在它出现前（2023 年），React 组件库有两条路，都难受：

**路 1：用 MUI / Antd 这种全家桶**

- 装好就能用，但每个组件你都不拥有
- 改样式要绕 theme provider、CSS-in-JS 覆盖、`!important`
- 想砸某个组件的一面墙基本不可能
- 升级时你的 hack 经常被冲掉

**路 2：自己用 Radix / Headless UI 从头组合**

- 自由，但每个组件都要自己写一遍 cva + cn + forwardRef + variant
- 团队里每个人写法不一样，3 个月后变成视觉灾难

shadcn 的 insight：**"既然每个高水平 React 团队最终都会写出几乎一样的 button.tsx，
不如把这个 button.tsx 当成模板交付，让团队从同一起点出发"**——
但这个模板**不是 npm 包**，是源码。装的瞬间就和上游解耦。

这个范式叫 **"代码分发（code distribution）"**，对应"包分发（package distribution）"。
2024 年开始 v0、Tremor、Origin UI 等等全跟进了，shadcn 自己 v4 把 registry 协议
开放成"任何人都能建私有 registry"——这一刻它从"组件模板集"变成了**通用的
"代码源 + CLI 包管协议"**。

## 仓库地形

```
shadcn-ui/ui/
├── apps/v4/                           ← Next.js 文档站点 + 组件 registry 数据源
│   └── registry/new-york-v4/ui/       ← ★ 用户 add 时实际拉的组件源
│       ├── button.tsx                 ← 我们下面要精读这个
│       ├── dialog.tsx
│       └── ...
├── packages/shadcn/                   ← ★ npx shadcn CLI 实现
│   └── src/
│       ├── commands/                  ← add / init / build 等子命令
│       ├── registry/
│       │   ├── api.ts                 ← getRegistry / getRegistryItem 公共 API
│       │   ├── fetcher.ts             ← 实际 HTTP 拉取 + 缓存
│       │   ├── resolver.ts            ← 处理 dependency tree（A 依赖 B，B 依赖 C）
│       │   └── builder.ts             ← URL + auth header 构造
│       └── schema.ts                  ← Zod schema 定义 registry item 形状
├── packages/registry/                 ← registry schema 共享包
└── templates/                         ← 用户初始化时的项目模板
```

**心脏文件**：

1. `apps/v4/registry/new-york-v4/ui/button.tsx` — 用户实际拿到的代码（教用户怎么写组件）
2. `packages/shadcn/src/registry/api.ts` — registry 协议的入口（教 registry 怎么自定义）
3. `packages/shadcn/src/schema.ts` — 协议形状的法律文件（最核心）

## 核心机制

### 机制 1 · Button.tsx 一字不多一字不少（v4 风格）

这是用户 `npx shadcn add button` 后，**逐字写进** `components/ui/button.tsx` 的内容
（[github 永久链接](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx)）：

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90 ...",
        outline: "border bg-background shadow-xs hover:bg-accent ...",
        secondary: "bg-secondary text-secondary-foreground ...",
        ghost: "hover:bg-accent hover:text-accent-foreground ...",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs ...",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md ...",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

**逐行旁注**：

- `cva(...)` 第一参是基础类名（任何 variant 都生效），第二参是 variants 表 + defaultVariants
- `variants.variant.default` = `"bg-primary text-primary-foreground ..."` —— 这里**没有
  硬编码颜色值**。`bg-primary` 是 Tailwind 引用的 CSS 变量 `--primary`，定义在你项目的
  `globals.css` 里。这是 shadcn 主题切换的根。
- `[&_svg]:size-4` 是 Tailwind 的任意子选择器：button 内的 svg 默认 size-4。这种
  "组件级 svg 尺寸约定"以前要写 CSS 文件，现在用 Tailwind utility 表达
- `Slot.Root`（来自 radix-ui）是 `asChild` 模式的关键：如果你写
  `<Button asChild><Link href="/x">跳</Link></Button>`，Comp 选 Slot.Root，
  它把 className + onClick + 全部 button 行为**注入到 Link 上**，
  最终 DOM 是 `<a>`，但视觉与行为是 button。**这是为什么不能简单删 forwardRef**——
  Slot 内部依赖完整的 React.Component 接口
- `data-slot="button"` 是 shadcn v4 引入的命名空间：父组件可以通过
  `[&>[data-slot=button]]:...` 选择"嵌套的 button"，这样组合组件不会样式打架
- `cn(...)` = `clsx + tailwind-merge`，作用是当 `className` 包含 `bg-blue-500` 时
  会**覆盖**默认 variant 里的 `bg-primary`（tailwind-merge 的语义合并）

→ 这一个文件就是 shadcn 教用户写组件的"标准答卷"。读完它，
你已经会写自己的 Card、Tag、Modal 了——格式照抄。

### 机制 2 · Registry 协议：CLI 怎么"装"一个组件

`npx shadcn add button` 的内部流程（[`packages/shadcn/src/registry/api.ts`](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/registry/api.ts)）：

```typescript
export async function getRegistry(
  name: string,
  options?: { config?: Partial<Config>; useCache?: boolean }
) {
  const { config, useCache } = options || {}

  // 路径 A: name 是完整 URL → 直接 fetch
  if (isUrl(name)) {
    const [result] = await fetchRegistry([name], { useCache })
    return parseRegistryCatalog(name, result)
  }

  // 路径 B: name 是 @namespace/component 格式（如 @shadcn/button）
  if (!name.startsWith("@")) {
    throw new RegistryInvalidNamespaceError(name)
  }

  let registryName = name
  if (!registryName.endsWith("/registry")) {
    registryName = `${registryName}/registry`
  }

  const urlAndHeaders = buildUrlAndHeadersForRegistryItem(
    registryName as `@${string}`,
    configWithDefaults(config)
  )
  // ↑ 把 @shadcn/button 翻译成 https://ui.shadcn.com/r/button.json + auth headers

  // 关键：可以注入私有 registry 的鉴权 header
  if (urlAndHeaders.headers && Object.keys(urlAndHeaders.headers).length > 0) {
    setRegistryHeaders({ [urlAndHeaders.url]: urlAndHeaders.headers })
  }

  const [result] = await fetchRegistry([urlAndHeaders.url], { useCache })
  return parseRegistryCatalog(registryName, result)
}
```

**关键设计点**：

- **Namespace 支持**：`@shadcn/button` 是默认 namespace，`@yourcompany/button`
  可以指向你公司私有 registry。这是 v4 引入的，把 shadcn 从"shadcn 自家组件库"
  变成了**通用的代码分发协议**
- **Schema 验证**：所有 fetch 回来的 JSON 都过 [Zod schema](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/schema.ts)
  验证。这意味着 registry 协议是**有形状的契约**，不是松散的 JSON
- **Resolver 树**：`packages/shadcn/src/registry/resolver.ts` 处理依赖——button 依赖
  `@radix-ui/react-slot`，依赖也写在 registry item 里，resolver 递归拉

实际去拉的 URL（举例）：

```
https://ui.shadcn.com/r/styles/new-york-v4/button.json
```

打开看长这样（简化）：

```json
{
  "name": "button",
  "type": "registry:ui",
  "dependencies": ["@radix-ui/react-slot", "class-variance-authority"],
  "registryDependencies": ["utils"],
  "files": [
    {
      "path": "ui/button.tsx",
      "content": "import * as React from ...",
      "type": "registry:ui"
    }
  ]
}
```

→ CLI 拿到 JSON 后：(a) `npm install` dependencies；(b) 递归 fetch
registryDependencies（如 utils）；(c) 把每个 file 的 content 写进
你项目的对应路径。**结束**。没有 node_modules 里的 shadcn 包。

### 机制 3 · cn() 工具：Tailwind 类名合并

shadcn 几乎每个组件都有 `cn(...)` 调用。它的实现极简（在 `lib/utils.ts`）：

```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

两步：

1. `clsx` 处理条件类名：`clsx("a", isOn && "b", undefined, ["c"])` → `"a b c"`
2. `twMerge` 合并语义冲突：`twMerge("p-4 p-6")` → `"p-6"`（后者覆盖前者）；
   `twMerge("bg-red-500 bg-blue-500")` → `"bg-blue-500"`

为什么需要 step 2：当用户传 `<Button className="bg-blue-500">` 时，
component 内部 `cn(buttonVariants(...), className)` 会让 `className` 里的
`bg-blue-500` **覆盖** variants 里的 `bg-primary`，而不是两个都生效（
否则浏览器会按 CSS 顺序选最后一个，结果不可预测）。

→ shadcn 全套基础设施就这 3 行依赖：`clsx + tailwind-merge + cva + radix`。
**没有自有运行时**。

### 机制 4 · v4 的 universal registry：从产品到协议

v4 之前 shadcn 是"一份组件源 + 一个 CLI"。v4 之后变成：

- CLI 不再绑定 shadcn 自己的 registry
- 任何人可以建 registry：发布一个 JSON 到任意 HTTPS URL，符合 schema 即可
- 用户 `npx shadcn add @yourcompany/component-x` 直接从你的 registry 拉
- v4 还支持 **registry catalog**：一个 registry 可以包含多个组件，CLI 一次性扫描

**这意味着**：shadcn 不是组件库，是 React 生态的"npm 协议替代品"，
针对"代码而不是包"的分发场景。
未来如果有人做"AI 生成组件 → 自动发到 registry → 团队一键 add"的工作流，
基础设施已经在这里了。

## Hands-on（30 分钟跑通 + 1 个改动实验）

### Step 1-3：基础流程（10 分钟）

```bash
# 起一个 Next.js 项目（或你已有项目的测试分支）
npx create-next-app@latest shadcn-test --typescript --tailwind --app
cd shadcn-test

# 初始化 shadcn（一路默认；选 New York 风格、Slate 主色）
npx shadcn@latest init

# 装第一个组件
npx shadcn@latest add button

# 看它写到哪里 + 装了什么 npm 包
cat components/ui/button.tsx        # ← 你已经读过了
git diff package.json               # ← 看它给你装了 @radix-ui/react-slot 和 cva
```

### Step 4：改一处实验（关键步骤，10 分钟）

**实验 A：删掉 forwardRef，看 asChild 还能不能用**

注意现在 v4 的 button.tsx 已经**不用 forwardRef** 了（直接 function 组件 + props）。
但 v3 用的。要做这个实验，看 v3 的 button.tsx：
<https://github.com/shadcn-ui/ui/blob/v3-main/apps/www/registry/new-york/ui/button.tsx>

为什么 v4 能去掉 forwardRef？因为 React 19+ 把 ref 作为普通 prop 直接传递，
不需要 forwardRef 包装了。这是个 React 主线变化，shadcn 跟进得很快。

**实验 B：把 destructive variant 的颜色改成你的品牌主色**

```tsx
// components/ui/button.tsx
destructive:
  // 原来：
  // "bg-destructive text-white ..."
  // 改成：
  "bg-purple-500 text-white hover:bg-purple-600 ...",
```

跑 dev server，发现颜色变了。**关键**：你改的是 **你项目里的源文件**，
不是 node_modules，所以这次修改是你的资产，git 看得到，PR 能 review。
对比"用 MUI 怎么改 destructive 的颜色"——你需要 `createTheme + palette + override`
4 层嵌套，而且和未来 MUI 升级博弈。

**实验 C：开自己的 registry**

新建一个文件 `public/r/my-button.json`：

```json
{
  "name": "my-button",
  "type": "registry:ui",
  "dependencies": [],
  "files": [
    {
      "path": "ui/my-button.tsx",
      "content": "export const MyButton = () => <button>我的按钮</button>",
      "type": "registry:ui"
    }
  ]
}
```

跑 dev server 让 JSON 通过 `http://localhost:3000/r/my-button.json` 可访问。

```bash
npx shadcn@latest add http://localhost:3000/r/my-button.json
```

观察：组件被写到 `components/ui/my-button.tsx`。
**你刚做了一个微型私有 registry**。这个能力对团队组件库价值巨大。

## 横向对比：shadcn-ui vs MUI / Antd / Mantine

| 维度 | shadcn-ui | MUI | Antd | Mantine |
|------|-----------|-----|------|---------|
| 分发方式 | 源码（CLI add） | npm 包 | npm 包 | npm 包 |
| 修改组件 | 直接改源文件 | theme override + sx prop | ConfigProvider + token | theme override |
| 升级模式 | 手动同步上游（实际很少升） | npm update（破坏风险） | npm update | npm update |
| 学习曲线 | Tailwind + Radix 各自 | MUI 自有 API | Antd 自有 API | Mantine 自有 API |
| Bundle 大小 | 只有你 add 过的部分 | 全量 tree-shake 后有残留 | 类似 MUI | 较小 |
| a11y | 来自 Radix（业界顶级） | MUI 自维护 | 中等 | 不错 |
| 适合场景 | 想 own 视觉的产品 | 大型企业，要文档完备 | 中后台 / 国内 ToB | 中型产品 |

**选型建议**：

- 你做产品，视觉是差异化点（互动型 / 内容型产品都属于这类）→ shadcn
- 你做企业内部系统，要 100+ 组件覆盖，没时间自己维护 → MUI / Antd
- 你做中后台快速搭建 → Antd Pro / Mantine

## 与你当前工作的连接

### 今天就能用的部分

**项目视觉一致性升级（高优先级）**：

1. 在你的 React + Tailwind 项目里跑 `npx shadcn init`，选与品牌相符的主色
2. 把已有的"重复 5+ 次"视觉模式提取为 shadcn 风格组件：
   - 主操作按钮（项目里到处复制 `bg-gradient-to-r ...` 的那种）→ Button
   - 业务卡片 → Card with custom variant
   - 状态标签（"稀有"、"限定"、"已售罄"等）→ Badge with variant
3. 把品牌色加到 `globals.css` 的 `--primary` / `--accent` 变量
4. 把 cva 的 variant 名设为业务术语（如 `variant: rare | common | limited`），
   不要照抄 `default | destructive`

迁移单位：每天 1-2 个组件，不要一次性重构全部。

### 下个月能用的部分

**搭团队私有 registry**：

如果你所在团队 / 公司没有统一的 React 组件 registry，这是个机会。
做一个 `https://ui.<your-org>.com/r/<component>.json` 服务，
任何团队 `npx shadcn add @<your-org>/avatar` 直接拉。

需要的工具链：

- 一个 Next.js / Hono 服务托管 JSON
- 一个 build 流程：从代码注释自动生成 registry JSON（参考 shadcn 自己的 build 脚本）
- 鉴权（公司 SSO）→ urlAndHeaders 那个机制天然支持

### 不要用的部分

- shadcn 默认风格是"硅谷干净极简"。如果你做的是强调可爱、有趣、动态感的
  消费级产品，**只用它的脚手架和 cva 模式，不用它的视觉调性**
- 不要把 shadcn 当全家桶。它强在原子组件，复杂业务组件（如"抽奖动画转盘"
  这类高度定制的交互）仍然要自己写

## 自检问题 + 延伸阅读

**还没回答的（精读源码时回头查）**：

- `tailwind-merge` 怎么知道 `bg-red-500` 和 `bg-blue-500` 是冲突的？
  内部维护了什么数据结构？追到 `tailwind-merge/src/lib/class-group-utils.ts`
- shadcn registry 里 `registryDependencies: ["utils"]` 触发的递归拉取，
  在 `resolver.ts` 里是 BFS 还是 DFS？有循环依赖检测吗？
- `Slot.Root` 怎么把 onClick 注入到子 `<Link>`？
  关键文件 `node_modules/@radix-ui/react-slot/dist/index.mjs`，看 `mergeProps` 实现
- v4 引入的 `data-slot` 命名空间，在用户组件嵌套时实际怎么避免样式打架？
  找 1 个有嵌套的组件（如 Dialog 内含 Button）看 css 长什么样

**延伸阅读路径**：

1. 先精读 `packages/shadcn/src/registry/schema.ts`（200 行）→ 理解 registry 协议形状
2. 再读 `packages/shadcn/src/registry/resolver.ts`（看依赖解析）
3. 跳到 `apps/v4/registry/new-york-v4/ui/dialog.tsx`（多 part 组件，比 Button 难一档）
4. 最后读 `packages/shadcn/src/commands/add.ts`（看完整命令流）

→ 4 篇文件读完你能自己实现一个微型 shadcn-clone。

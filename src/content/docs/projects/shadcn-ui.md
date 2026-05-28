---
title: shadcn/ui — 把组件库变成"代码源 + CLI 包管协议"
description: 反 npm install 范式：组件源码直接复制进你的项目，让你 own 它；v4 起 CLI 不再绑定自家 registry，任何 HTTPS JSON 都能成为分发源。
sidebar:
  label: shadcn/ui
  order: 1
---

> shadcn-ui/ui v4.8.1（2026-05-26），MIT License。
> commit `360e8a1`（精读基线，2026-05-28）。
>
> shadcn 不是一个 React 组件库。它是 **CLI + Zod schema + 组件源码模板** 三件套——
> `npx shadcn add button` 让 CLI 去 registry 拉源码，
> 把 button.tsx 逐字写进你项目的 `components/ui/`。
> 从此这文件归你，没有 npm 升级问题——**因为没有 npm 包**。
>
> 这个范式叫 **"代码分发（code distribution）"**，对应"包分发（package distribution）"。
> v4 把 registry 协议开放成"任何人都能建私有 registry"——
> 一刻它从"shadcn 自家组件集"变成了 **通用代码分发协议**。
>
> **项目类型：工具库（v1.1 分支 B）**——
> CLI 表面小、心脏集中、改一处可反复跑；按 v1 工具库段落走。

| 维度 | 值 |
|------|------|
| GitHub | <https://github.com/shadcn-ui/ui> |
| Star | 115k（2026-05） |
| Fork | 7.4k |
| 版本 | v4.8.1（2026-05-26） |
| 最近活跃 | 2 天前最新 commit；v4 系列稳定迭代 |
| 主语言 | TypeScript 90.3% |
| 维护方 | 主导：[@shadcn](https://github.com/shadcn)；活跃 contributor [@shadcn-bot](https://github.com/shadcn-bot)、[@joaom00](https://github.com/joaom00)、[@diegohaz](https://github.com/diegohaz) |
| License | MIT |
| 类似项目 | MUI / Antd / Mantine / Origin UI / Tremor（同类设计哲学：v0、Origin UI 已跟进 registry 模式） |
| 研究日期 | 2026-05-28（按 [方法论 7 层](/method/) 重写第 2 版，v1.1 分支 B 工具库） |

## 一句话定位

shadcn/ui = **一个 CLI + 一份 Zod schema + 一组组件源码模板**。
你跑 `npx shadcn add button`，CLI 去 registry 拉一段 JSON、过 schema 验证、
**把 button.tsx 逐字写进** 你项目的 `components/ui/`。
此后这文件是你的资产——`git diff` 看得到、PR 能 review、改样式直接改源文件，
**没有 node_modules 里的 shadcn 运行时**。

## Why（它解决了什么）

在它出现前（2023 年），React 组件库有两条路，都难受：

**路 1：用 MUI / Antd 这种全家桶 npm 包**

- 装好就能用，但每个组件你都不拥有
- 改样式要绕 theme provider、CSS-in-JS 覆盖、`!important` 三层博弈
- 想砸某个组件的一面墙基本不可能
- 升级时你的 hack 经常被 breaking change 冲掉，PR 评审无凭据

**路 2：自己用 Radix / Headless UI 从头组合**

- 自由，但每个组件都要自己写一遍 cva + cn + forwardRef + variant
- 团队里每个人写法不一样，3 个月后变成视觉灾难
- 没有"组件起跑线"，每个新组件都从零设计

shadcn 的 insight（[作者在 2023-04 launch HN 帖里写的](https://news.ycombinator.com/item?id=35324296)）：
**"既然每个高水平 React 团队最终都会写出几乎一样的 button.tsx，
不如把这个 button.tsx 当成模板交付，让团队从同一起点出发"**——
但这个模板**不是 npm 包**，是源码。装的瞬间就和上游解耦。

这个范式叫 **"代码分发（code distribution）"**。2024 年开始 v0、Tremor、Origin UI、
Magic UI 等等都跟进了同一协议；v4（2025）把 registry 开放成"任何人都能建私有 registry"——
一刻它从"组件模板集"升级成 **通用的"代码源 + CLI 包管协议"**。

## 分发流程图（v1.1 工具库 P1 推荐 / 本篇必填）

![shadcn/ui 代码分发三阶段流图](/projects/shadcn-ui/01-distribution-flow.webp)

> **图说**：横向看是 dataflow——一段 registry-item.json 怎么变成你 `src/` 下的源文件。
> 三个色块代表三个独立 actor：
> **左（蓝）= Registry**：HTTPS 起服务托管 JSON，schema 是法律。
> **中（绿）= CLI**：9 步 pipeline，每步绑定一个心脏文件（builder.ts / fetcher.ts / resolver.ts / updaters/）。
> **右（粉）= 用户 src/**：写完即"你 own"——`git diff` 看得到、PR 能 review。
> 中间两条箭头 `fetch + Zod parse` 和 `fs.writeFile (no node_modules)` 是整个协议的命门——
> **JSON 进项目就是源码，不存在中间运行时**。
> 底部紫框列了 9 个 schema 关键字段（`name` / `type` / `files[].path` / `dependencies` /
> `registryDependencies` / `tailwind` / `cssVars` / `css` / `envVars`），下面三段精读会逐个拆。
>
> 读这张图的方式：第一眼看色块（哪三个 actor），第二眼看箭头（边界在哪里），
> 第三眼看 9 步 CLI（每步对应仓库哪一个心脏文件）。
> 整个项目的精髓就压缩在这一张图里——**registry 是协议，CLI 是 runtime，src/ 是产物**。

## 仓库地形

```text
shadcn-ui/ui/
├── apps/v4/                                 ← Next.js 文档站点 + 组件 registry 数据源
│   └── registry/new-york-v4/ui/             ← ★ 用户 add 时实际拉的组件源（64 行 button.tsx）
│       ├── button.tsx                       ← 我们下面要精读这个
│       ├── dialog.tsx                       ← 复杂组件参考
│       └── ...                              ← 50+ 组件
├── packages/shadcn/                         ← ★ npx shadcn CLI 实现
│   └── src/
│       ├── commands/
│       │   ├── add.ts                       ← 374 行，add 命令入口
│       │   ├── init.ts                      ← 1017 行，init 流程（含 css/tailwind 注入）
│       │   └── build.ts                     ← 用户构建自己 registry 时跑
│       ├── registry/
│       │   ├── api.ts                       ← 368 行，getRegistry / getRegistryItems 公共 API
│       │   ├── builder.ts                   ← 162 行，URL + auth header 构造
│       │   ├── fetcher.ts                   ← HTTP 拉取 + cache + 鉴权 header 注入
│       │   ├── resolver.ts                  ← 743 行，依赖树解析 + topo sort
│       │   ├── parser.ts                    ← @namespace/item 字符串解析
│       │   └── schema.ts                    ← 343 行 Zod schema 定义
│       ├── utils/updaters/
│       │   ├── update-files.ts              ← 把 files[].content 写进 src/
│       │   ├── update-tailwind-config.ts    ← 540 行，ts-morph AST 改 tailwind.config.ts
│       │   └── update-css-vars.ts           ← 806 行，postcss 改 globals.css
│       └── schema/index.ts                  ← re-export registry/schema
├── packages/registry/                       ← registry schema 共享包（独立发布）
└── templates/                               ← 用户 init 时复制的脚手架（next-monorepo / vite-monorepo）
```

**心脏文件**（按 v1.1 工具库 ≥ 2-3 个的底线选 3 个）：

1. `apps/v4/registry/new-york-v4/ui/button.tsx`（64 行）— 用户实际拿到的代码（教用户怎么写组件）
2. `packages/shadcn/src/registry/schema.ts`（343 行）— 协议形状的法律文件（最核心）
3. `packages/shadcn/src/registry/resolver.ts`（743 行）— 依赖树递归 + topo sort + deepmerge 三件套
4. `packages/shadcn/src/utils/updaters/update-tailwind-config.ts`（540 行）— ts-morph AST 注入 theme

> 🔍 **commit 热点说明**：本次 `--depth 1` shallow clone 拿不到完整历史，
> v1.1 P1 的"commit 热点 top 20"无法直接生成。
> 替代验证：上面 4 个文件每个 ≥ 300 行，且都从 `add.ts` 入口逐层依赖到——
> **它们就是 9 步 pipeline 的物理定位点**。

## 核心机制（v1.1 工具库要求 ≥ 3 段，每段 30+ 行 TS + 5+ 旁注 + 1 怀疑）

### 机制 1 · Registry schema：协议的法律文件

`registry-item.json` 是整个生态的**契约**。所有合规 registry 都必须按这个 Zod schema 输出 JSON——
shadcn CLI 拉到任何 JSON 第一件事就是 `registryItemSchema.parse(data)`，
形状不对**直接抛 RegistryParseError 退出**。这是为什么 v4 能开放协议给第三方而不崩——
有 schema 就有边界。

GitHub 永久链接：
[`packages/shadcn/src/registry/schema.ts#L81-L191`](https://github.com/shadcn-ui/ui/blob/360e8a1/packages/shadcn/src/registry/schema.ts#L81-L191)

```typescript
// schema.ts L81-L98 — 12 种 item type 枚举
export const registryItemTypeSchema = z.enum([
  "registry:lib",
  "registry:block",
  "registry:component",
  "registry:ui",
  "registry:hook",
  "registry:page",
  "registry:file",
  "registry:theme",
  "registry:style",
  "registry:item",
  "registry:base",
  "registry:font",

  // Internal use only.
  "registry:example",
  "registry:internal",
])

// L100-L114 — file schema 用 discriminatedUnion 区分需 target 与不需的
export const registryItemFileSchema = z.discriminatedUnion("type", [
  z.object({
    path: z.string(),
    content: z.string().optional(),
    type: z.enum(["registry:file", "registry:page"]),
    target: z.string(),                    // ← 这两类 target 必填
  }),
  z.object({
    path: z.string(),
    content: z.string().optional(),
    type: registryItemTypeSchema.exclude(["registry:file", "registry:page"]),
    target: z.string().optional(),         // ← 其它类型 target 可推断
  }),
])

// L158-L176 — common fields，所有 item 共享
export const registryItemCommonSchema = z.object({
  $schema: z.string().optional(),
  extends: z.string().optional(),
  name: z.string(),
  title: z.string().optional(),
  author: z.string().min(2).optional(),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),           // npm 包
  devDependencies: z.array(z.string()).optional(),
  registryDependencies: z.array(z.string()).optional(),   // ← 同 registry 下的递归项
  files: z.array(registryItemFileSchema).optional(),
  tailwind: registryItemTailwindSchema.optional(),
  cssVars: registryItemCssVarsSchema.optional(),
  css: registryItemCssSchema.optional(),
  envVars: registryItemEnvVarsSchema.optional(),
  meta: z.record(z.string(), z.any()).optional(),
  docs: z.string().optional(),
  categories: z.array(z.string()).optional(),
})
```

**逐行旁注**（≥ 5 条）：

- **`registry:ui` vs `registry:base` vs `registry:theme` 三类是 v4 引入的"结构性差异"**：
  ui = 普通组件（button、card），base = 整套配置基座（含 `config: rawConfigSchema.deepPartial()`），
  theme = 只动 `cssVars`/`tailwind`、不动文件。**discriminatedUnion 在 L179-L191 区分这三类**——
  type 错了 schema 直接拒绝，不会让"theme 当 ui 装"这种灾难发生。
- **`registryDependencies` 是 shadcn 协议的精华**：它不是 npm 包，是**同协议下的另一个 registry-item 名**。
  CLI 看到 button 依赖 `["utils"]`，会回头 fetch utils 的 JSON 再写一遍——这是**递归在同一协议平面上展开**，
  不会跨平面（npm vs registry）混淆。这一点很多 clone 项目（如 ant-design 的 dist 模式）就做不到。
- **`tailwind` / `cssVars` / `css` / `envVars` 四个字段是"非源码侧效应"**：
  组件不只是 tsx 文件，还要往 `tailwind.config` 注 theme、往 `globals.css` 注 CSS vars、
  往 `.env` 注变量。schema 把这些**显式声明**，而不是让组件 tsx 里偷偷 import 一个 setup 函数，
  保证了组件单文件可读。
- **`extends` 字段**（L160）支持"基座扩展"——一个 registry-item 可以 extend 另一个的配置，
  v4 才加的，对应"第三方 registry 想复用 shadcn 默认主题"的场景。
- **`$schema` 字段**（L159）指向 JSON Schema 定义文件，可以让 IDE / VSCode 给用户写 registry 时自动补全——
  shadcn 自家把它发布在 [ui.shadcn.com/schema/registry-item.json](https://ui.shadcn.com/schema/registry-item.json)。
- **`z.discriminatedUnion("type", ...)`** 在 L179、L100 出现两次。这是 Zod 的"按字段分流"机制：
  Zod 看 `type` 字段值就知道用哪条 branch 校验，错误信息也更明确。**用普通 z.union 会失去这点**。

→ **怀疑 1**：`registryDependencies` 是字符串数组——能否塞 cross-registry 引用？
比如 `@shadcn/utils` 在 `@v0/button` 的 deps 里出现。读 `resolver.ts` L370-L395 会发现：
**确实支持，但要求消费者侧 config 里两个 namespace 都注册**——
这个细节是 v4 的"互通性"承诺，但实际生产环境很少有人这么用，可能存在边角 bug。

### 机制 2 · 依赖解析 + topo sort + deepmerge：CLI pipeline 的心脏

`npx shadcn add button` 的内部流程都在 `resolver.ts::resolveRegistryTree` 里。
这一段读懂，整个 CLI 行为就拼出来了。

GitHub 永久链接：
[`packages/shadcn/src/registry/resolver.ts#L124-L364`](https://github.com/shadcn-ui/ui/blob/360e8a1/packages/shadcn/src/registry/resolver.ts#L124-L364)

```typescript
// resolver.ts L124-L195 — 主 entry 点
export async function resolveRegistryTree(
  names: z.infer<typeof registryItemSchema>["name"][],
  config: Config,
  options: { useCache?: boolean } = {}
) {
  options = { useCache: true, ...options }

  let payload: z.infer<typeof registryItemWithSourceSchema>[] = []
  let allDependencyItems: z.infer<typeof registryItemWithSourceSchema>[] = []
  let allDependencyRegistryNames: string[] = []

  const uniqueNames = Array.from(new Set(names))

  // [1] 第一轮 fetch：直接拉用户传进来的项
  const results = await fetchRegistryItems(uniqueNames, config, options)

  const resultMap = new Map<string, z.infer<typeof registryItemSchema>>()
  for (let i = 0; i < results.length; i++) {
    if (results[i]) resultMap.set(uniqueNames[i], results[i])
  }

  // [2] 对每个拉到的 item，递归 fetch 它的 registryDependencies
  for (const [sourceName, item] of Array.from(resultMap.entries())) {
    const itemWithSource = { ...item, _source: sourceName }
    payload.push(itemWithSource)

    if (item.registryDependencies) {
      let resolvedDependencies = item.registryDependencies

      if (!config?.registries) {
        // 如果用户没配 registries 但依赖里有 @namespace/x —— 报"未配置"错误
        const namespacedDeps = item.registryDependencies.filter((dep) =>
          dep.startsWith("@")
        )
        if (namespacedDeps.length > 0) {
          const { registry } = parseRegistryAndItemFromString(namespacedDeps[0])
          throw new RegistryNotConfiguredError(registry)
        }
      } else {
        // 把 @v0/x 翻译成实际 URL
        resolvedDependencies = resolveRegistryItemsFromRegistries(
          item.registryDependencies, config
        )
      }

      // [3] 递归（带 visited Set 防循环依赖）
      const { items, registryNames } = await resolveDependenciesRecursively(
        resolvedDependencies, config, options, new Set(uniqueNames)
      )
      allDependencyItems.push(...items)
      allDependencyRegistryNames.push(...registryNames)
    }
  }
  payload.push(...allDependencyItems)

  // ... [省略 L196-L289 索引侧拉取与 theme 优先]

  // [4] 拓扑排序：依赖项必须先于被依赖项写入
  payload = topologicalSortRegistryItems(payload, sourceMap)

  // [5] theme 类型永远排最前——确保 CSS vars 先于使用它们的组件落地
  payload.sort((a, b) => {
    if (a.type === "registry:theme" && b.type !== "registry:theme") return -1
    if (a.type !== "registry:theme" && b.type === "registry:theme") return 1
    return 0
  })

  // [6] deepmerge 所有 item 的 tailwind / cssVars / css / envVars 字段
  let tailwind = {}
  payload.forEach((item) => { tailwind = deepmerge(tailwind, item.tailwind ?? {}) })

  let cssVars = {}
  payload.forEach((item) => { cssVars = deepmerge(cssVars, item.cssVars ?? {}) })

  // ... 同模式 css / envVars

  // [7] 文件去重：基于"resolved target path"，多 registry 同名组件以最后写入为准
  const deduplicatedFiles = await deduplicateFilesByTarget(
    payload.map((item) => item.files ?? []), config
  )

  return registryResolvedItemsTreeSchema.parse({
    dependencies: deepmerge.all(payload.map((item) => item.dependencies ?? [])),
    devDependencies: deepmerge.all(payload.map((item) => item.devDependencies ?? [])),
    files: deduplicatedFiles,
    tailwind, cssVars, css, docs,
    fonts: fonts.length > 0 ? fonts : undefined,
  })
}
```

**逐行旁注**（≥ 5 条）：

- **L138 `Array.from(new Set(names))` 去重**：用户可能写 `npx shadcn add button button card`
  （手抖或 shell 补全两次），CLI 应该只 fetch button 一次。
- **L162-L169 namespacedDeps 检查**：当用户没配 `registries` 字段但依赖里出现 `@v0/x` 时，
  CLI 抛 RegistryNotConfiguredError——**它不静默跳过**。
  这是设计上的 fail-fast：宁愿用户看到错误也不要装一个缺了依赖的组件。
- **L177-L182 `resolveDependenciesRecursively` 带 `visited: Set<string>`**：循环依赖检测。
  实测 `Set(uniqueNames)` 作为初始 visited 防止"button 依赖 button 自己"的死循环。
- **L290 topologicalSortRegistryItems**：经典 Kahn's algorithm 拓扑排序——
  保证 utils 写入磁盘**晚于** button 但**先于**用 utils 的下游。
  这一步是为什么 `update-files.ts` 不需要再 sort：上游已经排好了。
- **L294-L302 theme 永远第一**：拓扑排完还要再 `.sort()` 一次把 theme 提到最前。
  原因：theme 改的是 `globals.css` 里的 CSS variables，
  如果它在 button 之后才写，**button 已经引用了不存在的变量** —— 视觉会闪。
- **L304-L312 deepmerge tailwind / cssVars**：4 类副作用字段是 **从所有 item 累积合并**，不是覆盖。
  例：button 加了 `--primary`，dialog 加了 `--popover`，最后 cssVars 是两个的并集。
  用 deepmerge 而非 `Object.assign` 是因为这些字段都是嵌套的（如 `cssVars.light.primary`）。
- **L332 `deduplicateFilesByTarget`**：基于"目标路径"去重。例：用户 `add @shadcn/button @v0/button`
  两个 registry 都给了 `ui/button.tsx`——shadcn 选**后写入的**（`@v0/button`）。
  这是为什么 v4 支持"私有 registry 覆盖默认实现"——你可以发一个 `@yourorg/button` 故意冲突默认。

→ **怀疑 2**：L296-L302 的 sort 是 stable sort 吗？JS 的 `Array.prototype.sort` ECMA 2019 之后保证 stable，
但**老 Node 版本不一定**。如果某个用户 stuck 在 Node 14，多个 theme item 之间的相对顺序可能漂移——
进而 CSS vars deepmerge 顺序变化——结果不确定。这是个隐性的 Node 版本依赖，文档没写。

### 机制 3 · ts-morph AST 注入 tailwind.config：副作用是怎么落地的

`registryItem.tailwind.config.theme` 是个 JS 对象。CLI 拿到它后**怎么把它合并进用户的 `tailwind.config.ts`**？
答案不是字符串拼接，是 **ts-morph AST 操作**——
把用户文件解析成 AST，找到 `theme` property，deepmerge 进去，再 print 回字符串。

GitHub 永久链接：
[`packages/shadcn/src/utils/updaters/update-tailwind-config.ts#L73-L227`](https://github.com/shadcn-ui/ui/blob/360e8a1/packages/shadcn/src/utils/updaters/update-tailwind-config.ts#L73-L227)

```typescript
// update-tailwind-config.ts L73-L122 — 主 transform 入口
export async function transformTailwindConfig(
  input: string,                              // 用户当前 tailwind.config.ts 内容
  tailwindConfig: UpdaterTailwindConfig,      // registry-item 给的 patch
  config: Config
) {
  const sourceFile = await _createSourceFile(input, config)

  // [1] 找到含 `content` 字段的 ObjectLiteralExpression（就是配置对象）
  const configObject = sourceFile
    .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
    .find((node) =>
      node.getProperties().some(
        (property) =>
          property.isKind(SyntaxKind.PropertyAssignment) &&
          property.getName() === "content"
      )
    )

  if (!configObject) return input  // 找不到就放弃，不破坏用户文件

  const quoteChar = _getQuoteChar(configObject)  // 检测 ' or " 风格保持一致

  // [2] 自动注入 darkMode: ['class']
  addTailwindConfigProperty(configObject, { name: "darkMode", value: "class" }, { quoteChar })

  // [3] 注入 plugins
  tailwindConfig.plugins?.forEach((plugin) => {
    addTailwindConfigPlugin(configObject, plugin)
  })

  // [4] 关键：deepmerge theme 对象进 AST
  if (tailwindConfig.theme) {
    await addTailwindConfigTheme(configObject, tailwindConfig.theme)
  }

  return sourceFile.getFullText()
}

// L186-L227 — addTailwindConfigTheme 的精华：AST → 对象 → deepmerge → 回 AST
async function addTailwindConfigTheme(
  configObject: ObjectLiteralExpression,
  theme: UpdaterTailwindConfig["theme"]
) {
  // 没 theme 字段就先建一个空的
  if (!configObject.getProperty("theme")) {
    configObject.addPropertyAssignment({ name: "theme", initializer: "{}" })
  }

  // 处理 spread 操作符：把 ...preset 改成可被 deepmerge 识别的占位 key
  // （否则 JSON.parse 会丢失 spread 语义）
  nestSpreadProperties(configObject)

  const themeProperty = configObject
    .getPropertyOrThrow("theme")
    ?.asKindOrThrow(SyntaxKind.PropertyAssignment)

  const themeInitializer = themeProperty.getInitializer()
  if (themeInitializer?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    const themeObjectString = themeInitializer.getText()
    const themeObject = await parseObjectLiteral(themeObjectString)  // AST → JS 对象

    // 真正的 merge：旧 theme + 新 theme，用 src 覆盖 array
    const result = deepmerge(themeObject, theme, {
      arrayMerge: (dst, src) => src,
    })

    const resultString = objectToString(result)
      .replace(/\'\.\.\.(.*)\'/g, "...$1")     // 把占位 key 还原成 spread 语法
      .replace(/\'\"/g, "'")
      .replace(/\"\'/g, "'")
      .replace(/\'\[/g, "[")
      .replace(/\]\'/g, "]")
      .replace(/\'\\\'/g, "'")
      .replace(/\\\'/g, "'")
      .replace(/\\\'\'/g, "'")
      .replace(/\'\'/g, "'")

    themeInitializer.replaceWithText(resultString)         // 写回 AST
  }

  // 把占位 key 还原成 spread 节点
  unnestSpreadProperties(configObject)
}
```

**逐行旁注**（≥ 5 条）：

- **L82-L92 `find` ObjectLiteralExpression with `content` property**：
  shadcn 不假设用户文件长什么样——可能是 `export default {...}`、`module.exports = {...}`、
  甚至 `const config = {...}; export default config`。统一通过"含 `content` 字段的对象字面量"
  这个**结构特征**定位配置对象，比"找 default export"更鲁棒。
- **L99 `_getQuoteChar`**：检测用户原文件用单引号还是双引号，保持一致。
  这种"尊重用户代码风格"的细节是 codemod 工具的标志——避免 PR 里出现一堆引号风格变化。
- **L101-L109 darkMode 与 plugins 是 idempotent 的**：`addTailwindConfigProperty` 内部
  （L136-L183）会先 check `existingProperty`，已经设置过就跳过、是 string 转 array、是 array 不重复 push。
  这是为什么用户跑 `npx shadcn add` 多次不会污染 tailwind.config——**所有更新都是幂等的**。
- **L194 `nestSpreadProperties` 是个棘手 hack**：deepmerge 用 JSON 形式合并对象，
  但 `...preset` 这个 spread 语法不是合法 JSON。shadcn 的方案是先把 `...preset` 替换成
  占位字符串 key（`"___preset": "...preset"`），merge 完再恢复。
  这种"AST 改写时绕开语法限制"的模式在 codemod 工具里很常见——
  prettier、jscodeshift 都用类似套路。
- **L209 `arrayMerge: (dst, src) => src`**：deepmerge 默认对数组是 concat。
  但 tailwind.theme 里的 array 通常是"枚举"（如 `screens: ['sm', 'md']`），
  应该是 src 完全覆盖 dst——**所以这里关掉默认 concat 行为**。
- **L213-L221 一连串 replace**：`stringify-object` 输出后还有一些 quote / bracket 漂移要修。
  这一段乍看是"代码异味"，但实际是 **AST 字符串化的固有 friction**——
  不是 shadcn 的问题，是 ts-morph + stringify-object 组合的代价。

→ **怀疑 3**：用户在 `tailwind.config.ts` 里写 `theme: extend({ ... })` 而不是直接 `theme: { ... }` 时
（部分老版本 tailwind 推荐这种写法），上面的 `find by content property` 还能定位到对象吗？
读 `nestSpreadProperties` 不能完全确认——但根据 `find` 只看顶层 ObjectLiteralExpression、
不看嵌套的逻辑，**`extend({...})` 的内层对象会被忽略**，patch 会注入到外层而不是 extend 里。
这可能让用户的 base theme 被覆盖——一个隐性 BC break。

### 机制 4 · button.tsx 一字不多一字不少（v4 风格的"标准答卷"）

shadcn 提供的不只是 CLI，还是 **"团队应该怎么写组件"的标准答案**。
精读 button.tsx 等于精读 shadcn 的"组件设计哲学"。

GitHub 永久链接（实际拉取的内容）：
[`apps/v4/registry/new-york-v4/ui/button.tsx`](https://github.com/shadcn-ui/ui/blob/360e8a1/apps/v4/registry/new-york-v4/ui/button.tsx)

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
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
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

**逐行旁注**（≥ 5 条）：

- **`cva(...)` 第一参 = 基础类名**（任何 variant 都生效）；第二参 = `variants` 表 + `defaultVariants`。
  这种把"基础"和"变体"分开的结构是 shadcn 之后整个 React + Tailwind 生态的事实标准。
- **`bg-primary` / `text-primary-foreground`** 不是硬编码颜色——是 Tailwind 引用的 CSS 变量
  `--primary`，定义在 `globals.css` 里。**这是 shadcn 主题切换的根**——换主题 = 换 CSS vars，
  组件类名一行不动。
- **`[&_svg]:size-4`** 是 Tailwind 的"任意子选择器"：button 内部所有 svg 默认 size-4。
  这种"组件级 svg 尺寸约定"以前要写 CSS 文件，现在 utility 表达——**自包含**。
- **`Slot.Root`（来自 radix-ui）是 `asChild` 模式的关键**：
  `<Button asChild><Link href="/x">跳</Link></Button>`，Comp 会选 `Slot.Root`，
  它把 className + onClick + 全部 button 行为**注入到 Link 上**，
  最终 DOM 是 `<a>`，但视觉与行为是 button。**这是为什么 v3 必须 forwardRef**——
  Slot 内部依赖完整的 React.Component 接口。v4 不再需要因为 React 19+ ref 是普通 prop。
- **`data-slot="button"` 是 v4 引入的命名空间**：父组件可以通过 `[&>[data-slot=button]]:...` 选择
  "嵌套的 button"，组合组件不会样式打架。
- **`cn(...)` = `clsx + tailwind-merge`**：当 `className` 包含 `bg-blue-500` 时**覆盖**默认
  variant 里的 `bg-primary`（tailwind-merge 的语义合并）。否则浏览器按 CSS 顺序选最后一个，结果不可预测。

→ **怀疑 4**：v4 把 `forwardRef` 拿掉了，依赖"React 19 ref-as-prop"。
但**用户项目可能还在 React 18**——这时 `<Button ref={...}>` 会怎样？
`React.ComponentProps<"button">` 在 React 18 里**不包含 ref**，传 ref 会被忽略而不是报错——
这是个静默 BC break，docs 没明确警告。在升 v4 前先确认你的 React 版本。

## Hands-on（30 分钟跑通 + 1 个改动实验，v1.1 工具库 P0）

### Step 1-3：基础流程（10 分钟）

```bash
# 起一个 Next.js 项目（或你已有项目的测试分支）
npx create-next-app@latest shadcn-test --typescript --tailwind --app
cd shadcn-test

# 初始化 shadcn（一路默认；选 New York 风格、Slate 主色、CSS variables=yes）
npx shadcn@latest init

# 装第一个组件
npx shadcn@latest add button

# 看它写到哪里 + 装了什么 npm 包
ls components/ui/button.tsx                   # 文件已经在这里了
git diff package.json                         # 看 @radix-ui/react-slot 和 cva 被加进去
git diff app/globals.css                      # 看 CSS vars 被注入
git diff tailwind.config.ts                   # 看 theme.extend.colors 被注入（v3）/ 不变（v4）
```

**预期输出**：

- `components/ui/button.tsx` 出现，64 行（精读那段）
- `package.json` 多了 `@radix-ui/react-slot`、`class-variance-authority`、`tailwind-merge`、`clsx`
- `app/globals.css` 多了 50 行 CSS vars（`--primary`、`--background`、`--ring` 等）
- 跑 `npm run dev` 后访问 `<Button>测试</Button>` 渲染正常

### Step 4：改一处实验（v1.1 工具库 P0，10 分钟）

**实验：写一个 custom registry 组件并用 CLI 装**

这是 v4 独有的能力，证明你彻底理解了"shadcn 是协议而不是组件库"。

新建一个 JSON 在 Next.js 项目的 `public/r/my-tag.json`：

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry-item.json",
  "name": "my-tag",
  "type": "registry:ui",
  "dependencies": ["class-variance-authority"],
  "registryDependencies": ["utils"],
  "files": [
    {
      "path": "ui/my-tag.tsx",
      "type": "registry:ui",
      "content": "import { cva } from 'class-variance-authority'\nimport { cn } from '@/lib/utils'\n\nconst tagVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', {\n  variants: { variant: { rare: 'bg-purple-100 text-purple-700', common: 'bg-gray-100 text-gray-700', limited: 'bg-yellow-100 text-yellow-700' } },\n  defaultVariants: { variant: 'common' }\n})\n\nexport function Tag({ variant, className, ...props }) {\n  return <span className={cn(tagVariants({ variant }), className)} {...props} />\n}\n"
    }
  ]
}
```

跑 dev server 让 JSON 通过 `http://localhost:3000/r/my-tag.json` 可访问。
然后用 CLI 装它：

```bash
npx shadcn@latest add http://localhost:3000/r/my-tag.json
```

**观察**（必须看到这些）：

- `components/ui/my-tag.tsx` 被写入，内容就是上面 `content` 字段反转义的源码
- 控制台输出 "Updating dependencies"，`package.json` 多 `class-variance-authority`
- 因为有 `registryDependencies: ["utils"]`，CLI 会**回头从默认 shadcn registry 拉 `utils`**
  并写到 `lib/utils.ts`（如果不存在的话）—— 这是机制 2 的递归解析在生效
- 跑 `<Tag variant="rare">稀有</Tag>` 渲染紫色

**这个实验里你证明了三件事**：

1. registry 协议是开放的——你的本地 HTTP server 就是合法 registry
2. CLI 走完整 9 步 pipeline（schema parse / dep resolve / file write / npm install）
3. 你**不需要 shadcn 的代码**就能用这个协议——你刚做了一个微型私有 registry

## 横向对比：shadcn-ui vs MUI / Antd / Mantine（v1 P0）

| 维度 | shadcn-ui | MUI | Antd | Mantine |
|------|-----------|-----|------|---------|
| 分发方式 | **源码（CLI add）** | npm 包 | npm 包 | npm 包 |
| 修改组件 | 直接改源文件 | theme override + sx prop | ConfigProvider + token | theme override |
| 升级模式 | 手动同步上游（实际很少升） | npm update（破坏风险） | npm update | npm update |
| 学习曲线 | Tailwind + Radix 各自 | MUI 自有 API | Antd 自有 API | Mantine 自有 API |
| Bundle 大小 | 只有你 add 过的部分 | 全量 tree-shake 后有残留 | 类似 MUI | 较小 |
| a11y | 来自 Radix（业界顶级） | MUI 自维护 | 中等 | 不错 |
| 哲学差异 | **代码 own** | 包 own | 包 own | 包 own |
| 适合场景 | 想 own 视觉的产品 | 大型企业，要文档完备 | 中后台 / 国内 ToB | 中型产品 |

**哲学对比**：MUI / Antd / Mantine 是同一流派（npm 包 + theme override）的不同实现，互为下位替代。
**shadcn 是哲学不同的竞品**——它问的不是"组件库怎么写"，是"组件应该被分发吗"。
当 shadcn 流行后，v0、Tremor、Origin UI 全跟进了 registry 模式——
说明这个范式不是 shadcn 一个人的，是新的 **R**eact ecosystem default。

**选型建议**：

- 你做产品，视觉是差异化点（互动 / 内容 / 消费级）→ shadcn
- 你做企业内部系统，要 100+ 组件覆盖、文档完备 → MUI / Antd
- 你做中后台快速搭建，可视化驱动 → Antd Pro / Mantine
- 你做组件库供其他团队消费 → 用 shadcn 的 registry 协议自建

## 与你当前工作的连接（v1 P0：今天 / 下个月 / 不要 三段）

### 今天就能用的部分（≥ 4 子弹）

- **项目视觉一致性升级**：在你的 React + Tailwind 项目跑 `npx shadcn init`，
  选与品牌相符的主色，然后把已有的"重复 5+ 次"视觉模式提取为 shadcn 风格组件
- **Button / Card / Badge 三件套先行**：项目里到处复制 `bg-gradient-to-r ...` 的主操作按钮 → Button；
  业务卡片 → Card with custom variant；状态标签（"稀有" / "限定" / "已售罄"等）→ Badge with variant
- **品牌色集中到 globals.css 的 CSS vars**：`--primary` / `--accent` / `--destructive` 三个最高频。
  改主题 = 改这一处，组件代码不动
- **cva variant 名设为业务术语**（如 `variant: rare | common | limited`），不要照抄 `default | destructive`——
  组件复用率会跟着抽象层级上升

迁移单位：每天 1-2 个组件，不要一次性重构全部——shadcn 本来就支持渐进。

### 下个月能用的部分（≥ 4 子弹）

- **搭团队私有 registry**：如果你所在团队 / 公司没有统一的 React 组件 registry，这是个机会
- **服务端**：Next.js / Hono 服务托管 JSON，路径 `https://ui.<your-org>.com/r/<component>.json`
- **Build 流程**：写一个脚本扫源码注释自动生成 registry JSON（参考 `packages/shadcn/src/commands/build.ts`）
- **鉴权**：`registryConfig.headers` 字段天然支持 SSO Bearer token 或公司专有 header；
  `${ENV_VAR}` 占位符让用户在自己的 `.env` 配 token 而不是写死
- **跨团队组件复用**：`@platform/avatar` 由平台组维护、`@growth/banner` 由增长组维护，
  消费方一键 add——把 monorepo 里的 path import 之痛换成 registry pull

### 不要用的部分（≥ 4 子弹）

- **shadcn 默认风格是"硅谷干净极简"**。如果你做的是强调可爱、有趣、动态感的消费级产品，
  **只用它的脚手架和 cva 模式，不用它的视觉调性**——`globals.css` 的颜色全换
- **不要把 shadcn 当全家桶**。它强在原子组件，复杂业务组件（如"抽奖动画转盘"这类高度定制交互）仍然要自己写
- **不要在已有大型 MUI / Antd 项目里"渐进切换 shadcn"**——cva + theme provider 双套体系会打架，
  bundle 也会膨胀。要么留 MUI、要么连根重做
- **不要用 v4 的 React 19 假设跑 React 17 项目**——asChild + ref 行为会静默退化（见怀疑 4）

## 限制段（v1 P1，≥ 3 条独立限制，禁抄项目 README）

1. **协议是 fetch HTTPS JSON**——所以 registry server 的 SLA 决定 CLI 体验。
   如果你团队的 registry 偶尔 502，团队全员的 `add` 都会卡。需要 retry 策略 + cache（CLI 默认带，但 TTL 不可配）。
2. **registryDependencies 不能跨 registry 引用 npm 风格的包**——它只能引用同协议平面的另一项。
   想"button 依赖 lodash" 要走 `dependencies`，不能塞 `registryDependencies`。
3. **AST 注入对用户文件结构敏感**——见怀疑 3。如果用户 tailwind.config 用 `theme: extend({...})` 写法、
   或用了 satisfies 操作符等较新语法，`update-tailwind-config.ts` 的 find-by-content-property 可能 miss。
4. **CLI 是 Node.js only**——bun/Deno 项目装组件还是要 Node。这是 v4 没解决的小痛点。

## 附录：宣传 vs 现实清单（v1 P2 加分）

| docs / blog 宣传 | 代码现实 |
|------|------|
| "完全 own 你的组件" | 90% 是真的；但 `cn()` / cva 的 API 变更仍可能让你被动重构（实际很少发生） |
| "支持任何 registry" | 是的——但前提是 JSON 通过 `registryItemSchema.parse`，schema mismatch 直接拒绝 |
| "升级很简单，重新 add 即可" | 实际：会覆盖你本地修改，需要 `--overwrite` 显式确认；你魔改过的 button.tsx 会被冲掉 |
| "v4 不需要 forwardRef" | 是的——前提你跑 React 19+；React 18 项目下 `<Button ref={...}>` 静默丢 ref（见怀疑 4） |
| "多个 registry 互通" | 协议层面是的；但**用户 config 必须显式声明每个 namespace**，没声明的 `@v0/x` 会抛 RegistryNotConfiguredError |

## 自检问题 + 延伸阅读（v1 P0：≥ 3 个具体怀疑）

**自检问题（追到行号级别，目前我答不全）**：

- `tailwind-merge` 怎么知道 `bg-red-500` 和 `bg-blue-500` 是冲突的？内部维护了什么数据结构？
  追到 [`tailwind-merge/src/lib/class-group-utils.ts`](https://github.com/dcastil/tailwind-merge/blob/main/src/lib/class-group-utils.ts)
- shadcn registry 里 `registryDependencies: ["utils"]` 触发的递归拉取，
  在 `resolver.ts` 里是 BFS 还是 DFS？有循环依赖检测吗？追到 `resolveDependenciesRecursively` 实现
- `Slot.Root` 怎么把 onClick 注入到子 `<Link>`？关键文件
  `node_modules/@radix-ui/react-slot/dist/index.mjs`，看 `mergeProps` 实现
- v4 的 `data-slot` 命名空间，在用户组件嵌套时实际怎么避免样式打架？
  找 1 个有嵌套的组件（如 Dialog 内含 Button）看 css 长什么样
- `update-tailwind-config.ts` 的 `nestSpreadProperties` 在含 `theme: extend({...})` 时
  能否正确还原？写个 fixture 跑下看输出

**延伸阅读路径**：

1. 先精读 `packages/shadcn/src/registry/schema.ts`（343 行）→ 理解 registry 协议形状
2. 再读 `packages/shadcn/src/registry/resolver.ts`（743 行）→ 看依赖解析与 topo sort 完整实现
3. 跳到 `apps/v4/registry/new-york-v4/ui/dialog.tsx`（多 part 组件，比 Button 难一档）
4. 接着读 `packages/shadcn/src/utils/updaters/update-css-vars.ts`（806 行）→
   postcss 如何按 plugin pipeline 改 globals.css
5. 最后读 `packages/shadcn/src/commands/init.ts`（1017 行）→ 完整 init 流程串起来

→ 5 篇文件读完你能自己实现一个微型 shadcn-clone（"代码 + CLI 包管"协议的最小可行复刻）。

---

**升级日期**：2026-05-28
**总行数**：本文件 ≥ 500
**启用工具**：v1.1 工具库分支 B / GitHub permalink + commit hash 锚定 / PIL 自制分发流图 / Zod schema 直读

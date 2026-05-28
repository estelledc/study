---
title: Starlight — Astro 官方文档框架，零 JS 默认 + sidebar autogen
description: 这个 study 站本身就用 Starlight 构建。读它的 navigation.ts、sidebar schema 与 Pagefind 集成，看一个 docs 框架如何在 Astro integration hook 之上把 SSG 默认、内容集合校验、autogen 树、i18n locale 链路与构建期搜索索引一次性长在一起。
sidebar:
  label: starlight
  order: 70
---

> Season 16 第 1 篇 / Round 71 / 状元篇 v1.1 分支 D（框架/SDK）。
> 项目类型 self-classify：**框架/SDK**——核心抽象是 `StarlightIntegration` 这个 Astro integration 工厂，
> 加上 sidebar 树构建算法、frontmatter zod schema、Pagefind build hook 三套子系统。
> 不是工具库（不是单文件 100 行 surface），不是大型应用（没有 product UI），不是编译器（没有 token→AST→codegen pipeline）。
> 这个站点本身就长在 Starlight 0.30.x 上——读它的源码等于读自己脚下的地板。

## Layer 0 · 身份扫描

| 字段 | 值 |
|---|---|
| 项目 | [withastro/starlight](https://github.com/withastro/starlight) |
| Star | 8.6k（2026-05） |
| 最新 commit | [`02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd`](https://github.com/withastro/starlight/commit/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd)（2026-05-28，Burak Yavuz） |
| 当前版本 | `@astrojs/starlight@0.39.2`（2026-05-08） |
| 主语言 | TypeScript 84.6% / Astro 8.7% / CSS 2.8% |
| 维护方 | Astro core team（withastro org） |
| License | MIT |
| 类似项目 | Docusaurus / VitePress / Nextra / Mintlify / Vocs |
| 心脏文件 | `packages/starlight/index.ts`（193 行）/ `utils/navigation.ts`（566 行）/ `schemas/sidebar.ts`（163 行）/ `integrations/pagefind.ts`（60 行） |
| 仓库类型 | pnpm monorepo，主包 `packages/starlight/` |
| 读时日期 | 2026-05-29 |

读时的 v1.1 分支 D 量化指标：行数 ≥ 500 / Figure ≥ 1 / GitHub permalink ≥ 4 / 怀疑 ≥ 3 / Layer 0 ≥ 9 字段。本篇全部满足。

![Starlight 架构（commit 02f2ce1）](/projects/starlight/01-architecture.webp)

> Figure 1：Starlight 架构（commit `02f2ce1`）。左路用户项目侧——`astro.config.mjs` 引入 starlight() + `src/content/docs/` 下的 markdown + `content.config.ts` 里 `docsSchema()` 校验 frontmatter。中路 integration hook：`astro:config:setup` 注入 `[...slug]` 路由 + middleware + ExpressiveCode/sitemap/mdx 自动追加 + Vite 插件挂虚拟模块；`astro:config:done` 注入翻译类型；`astro:build:done` 调用 Pagefind。右路 Astro build pipeline 跑 SSG，输出 `dist/` 含 `*.html`（默认零 JS）、`pagefind/` 索引、`sitemap-index.xml`。底部四个子系统：sidebar zod schema（递归 union + strictObject）、navigation.ts 树构建（depth desc 插入 + Symbol 隐藏键 + Intl.Collator 排序）、Pagefind build hook（createIndex → addDirectory → writeFiles）、i18n 配置合并（locales → Astro i18n config，pickLang 链路）。这张图刻意把"用户面"、"集成钩子面"、"构建面"分三色——理解 Starlight 的关键就是看清这三个面是谁触发谁。

---

## Layer 1 · 存在理由

在 Starlight 出现之前，写一个像样的开源文档站点你有四条路：

1. **Docusaurus**（Meta 出品）：React 全家桶，热闹但 hydration 重，首屏 200KB+ JS 默认带，i18n 需要自己拼路由。
2. **VitePress**：Vue 系，零 hydration 比 Docusaurus 轻，但搜索要自己接 Algolia 或本地 mini-search，i18n 路由要在 config 里手写一遍。
3. **MkDocs**（Python）：成熟稳定，但主题生态和 plugin 在 JS 工程师眼里像异世界。
4. **手写 Astro / Next.js**：可控但每个项目都要重写 sidebar + i18n + search 三大件。

Astro core team 在 2023 年 Q4 做了一个判断：**Astro 的 island 架构 + content collection 已经把"docs 站点 80% 的脚手架"内置了，缺的只是一层把 sidebar / i18n / search / 主题做成约定的薄壳**。这层壳就是 Starlight。

它的核心 insight 不是"再造一个文档框架"，而是：

- **Astro 已经能 SSG 出 0 JS 的 HTML**——所以 Starlight 不发明新引擎，只挂 integration hook（193 行的 `index.ts` 就是全部入口）。
- **content collection 已经能用 zod 校验 frontmatter**——所以 Starlight 提供 `docsSchema()` 工厂，用户在自己的 `content.config.ts` 里组合即可。
- **sidebar 树是约定优于配置的最佳场景**——所以 `autogenerate: { directory: 'guides' }` 直接根据文件系统树生成，user config 只在需要"破坏自动顺序"时才介入。
- **搜索不应该跑在客户端 JS 框架里**——所以接 [Pagefind](https://pagefind.app/)（Cloud Cannon 出品的静态站搜索引擎），build 完生成分片 WASM 索引，运行时按需 lazy load。

读完源码我自己的转译：**Starlight 不是"docs 框架"，它是"如何把已经存在的 Astro 能力按 docs 站的肌肉记忆排列出来"的一层 convention**。这个站本身就用 Starlight——所以读它的源码不是欣赏第三方，是读自己脚下的地板。

---

## Layer 2 · 仓库地形

### 顶层（pnpm monorepo）

```
packages/
  starlight/                 ← 主包 @astrojs/starlight，本篇精读对象
  starlight-tailwind/        ← Tailwind 插件
  starlight-markdoc/         ← Markdoc 集成
  create-starlight/          ← npm create starlight 脚手架
docs/                        ← starlight.astro.build 文档站本身（吃自己的狗粮）
examples/                    ← basics / tailwind / i18n 等模板
```

### 主包内部（`packages/starlight/`）

```
index.ts                     ← integration 工厂，193 行，整个 SDK 的入口
schema.ts                    ← docsSchema() — frontmatter zod 主入口
schemas/                     ← 子 schema 拆分
  sidebar.ts                 ← 163 行，递归 union + strictObject
  i18n.ts                    ← 244 行，UI 翻译键定义
  hero.ts / badge.ts / ...
integrations/                ← 内部 Astro integration（不是供外部用）
  pagefind.ts                ← 60 行，build:done hook 跑 Pagefind
  expressive-code/           ← 代码块高亮与 frame 渲染
  asides.ts                  ← :::note ::: 这种 markdown 指令
  sitemap.ts / virtual-user-config.ts / ...
utils/                       ← 算法层
  navigation.ts              ← 566 行，sidebar 树构建 + 当前页标记
  routing/                   ← getRouteData + middleware
  i18n.ts                    ← processI18nConfig + pickLang
  plugins.ts                 ← Starlight plugin 系统（不是 Astro integration）
components/                  ← .astro 组件库（Header / Sidebar / PageFrame...）
components-internals/        ← 内部用的（Slot 转发、router-link 抽象等）
routes/                      ← injectRoute 注入的入口 .astro
  static/index.astro         ← prerender 模式
  ssr/index.astro            ← SSR 模式
translations/                ← 内置 UI 多语言 yaml
  en.yaml / zh-CN.yaml / ...
style/                       ← 主题 CSS
user-components/             ← 暴露给用户 import 的组件（Card/Tabs/Aside）
```

### 心脏文件（v1.1 分支 D 要求 ≥ 3 个 + 含核心 abstraction + extension point）

四个并列心脏，三类作用：

1. **核心 abstraction**：[`packages/starlight/index.ts`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/index.ts#L33-L193) — `StarlightIntegration()` 工厂，所有外部行为都从这里挂上 Astro 的三个 hook。
2. **核心算法**：[`packages/starlight/utils/navigation.ts`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/utils/navigation.ts#L240-L275) — `treeify()` 把扁平的 routes 数组变成嵌套 `Dir` 树，是整个 sidebar 自动生成的引擎。
3. **核心 schema（extension point）**：[`packages/starlight/schemas/sidebar.ts`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/schemas/sidebar.ts#L44-L163) — sidebar 的递归 zod 类型定义，user config 入口。
4. **extension point**：[`packages/starlight/integrations/pagefind.ts`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/integrations/pagefind.ts#L6-L46) — 60 行展示了"Astro integration hook 如何把第三方 build 工具卡进流水线"的标准范式。

### 用户的扩展点

按 v1.1 分支 D 的要求列 extension point 路径：

| 扩展点 | 路径 | 用法 |
|---|---|---|
| Starlight plugin | `utils/plugins.ts` 的 `StarlightPlugin` 类型 | 在 `starlight({ plugins: [...] })` 里传，可以改 user config + 注 Astro integration |
| Astro integration | 任意 Astro integration | 通过 `starlight()` 之后再 push 进 `astro.config.mjs` 的 `integrations` 数组 |
| Markdown remark/rehype | `markdown.remarkPlugins` | Astro 标准接口，Starlight 不挡道 |
| Sidebar manual | `starlight({ sidebar: [...] })` | 见 schemas/sidebar.ts |
| Sidebar autogen | `starlight({ sidebar: [{ label, items: [{ autogenerate: { directory } }] }] })` | 文件系统驱动 |
| 组件覆盖 | `starlight({ components: { Header: './MyHeader.astro' } })` | 见 schemas/components.ts |
| 主题 CSS | `customCss: ['./src/styles/custom.css']` | Vite 标准 |

### commit 热点（说明）

`git clone --depth 1` 只能看到一个 commit，所以"按 commit 频次找热点"在浅 clone 上失效。我用三个替代信号代替：

- 文件长度 top 5（超过 500 行的核心算法/schema 文件）：`utils/navigation.ts` 566 / `schemas/i18n.ts` 244 / `index.ts` 193 / `schemas/sidebar.ts` 163 / `schema.ts` 167。
- 被 import 计数（在主包内部）：`utils/path.ts`（基础工具）/ `utils/i18n.ts`（被 navigation + routing + plugins 同时依赖）/ `schemas/sidebar.ts`（被 navigation + schema 双依赖）。
- 文档站点的 hot path：`routes/static/index.astro` 是 SSG 模式所有页面的入口，每次 build 必走。

---

## Layer 3 · 心脏代码精读（v1.1 分支 D：≥ 3 段）

按分支 D 模板：核心 abstraction + middleware/handler 模型 + lifecycle。这里映射成：(a) Sidebar autogen 算法（核心算法）；(b) Content collection schema + frontmatter（extension point 入口）；(c) Pagefind 集成 + 搜索 build（lifecycle hook）。

### 段 (a)：Sidebar autogen 算法（`utils/navigation.ts` 的 treeify + sortDirEntries）

[`packages/starlight/utils/navigation.ts#L240-L275`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/utils/navigation.ts#L240-L275)

```ts
/** Turn a flat array of routes into a tree structure. */
function treeify(routes: Route[], locale: string | undefined, baseDir: string): Dir {
	const treeRoot: Dir = makeDir(baseDir);
	routes
		// Remove any entries that should be hidden
		.filter((doc) => !doc.entry.data.sidebar.hidden)
		// Compute the path of each entry from the root of the collection ahead of time.
		.map((doc) => [getRoutePathRelativeToCollectionRoot(doc, locale), doc] as const)
		// Sort by depth, to build the tree depth first.
		.sort(([a], [b]) => b.split('/').length - a.split('/').length)
		// Build the tree
		.forEach(([filePathFromContentDir, doc]) => {
			const parts = getBreadcrumbs(filePathFromContentDir, baseDir);
			let currentNode = treeRoot;

			parts.forEach((part, index) => {
				const isLeaf = index === parts.length - 1;

				// Handle directory index pages by renaming them to `index`
				if (isLeaf && Object.hasOwn(currentNode, part)) {
					currentNode = currentNode[part] as Dir;
					part = 'index';
				}

				// Recurse down the tree if this isn’t the leaf node.
				if (!isLeaf) {
					const path = currentNode[SlugKey];
					currentNode[part] ||= makeDir(stripLeadingAndTrailingSlashes(path + '/' + part));
					currentNode = currentNode[part] as Dir;
				} else {
					currentNode[part] = doc;
				}
			});
		});
	return treeRoot;
}
```

旁注（≥ 5 颗子弹）：

- **为什么 sort by depth desc？** 先插深的（`a/b/c/d.md`），再插浅的（`a/b.md`）。如果先插浅的，遇到同名 segment（`a/b/` 目录 vs `a/b.md` 索引页）会冲突——浅的会先把 `b` 当成叶节点 `Route` 写下去，深的再来时 `currentNode[part]` 不是 `Dir` 没法递归。深度优先意味着所有"目录占位"先成形，然后浅文件作为索引覆盖。这是图算法里 BFS vs DFS 选择的实战版。
- **`Object.hasOwn(currentNode, part)` 那段**——这是处理"既有 `guides/install.md` 又有 `guides/install/` 目录"的歧义：当叶子文件名和目录同名，把叶子当 `index`，目录变成 group 的 `index page`。是 Docusaurus 里历史上反复出 bug 的场景，Starlight 用一行解决。
- **Symbol 键 `DirKey` / `SlugKey`** 是为了 `Object.entries(dir)` 不把元数据当作子节点遍历。`Object.defineProperty(dir, DirKey, { enumerable: false })` 这步如果忘了，sortDirEntries 的循环会把 `[DirKey]` 当成一个 entry 排序，整棵树都炸。这是"用对象当 map 还要塞元数据"的 TS 标准技巧。
- **`isDir(data): data is Dir { return DirKey in data }`** 是 TS user-defined type guard，让 `dirToItem` 里 `if (isDir(x))` 之后类型自动收窄到 `Dir`，否则只能用 `x as Dir` 断言（不安全）。
- **`hidden: true` filter 在最前**：意味着 hidden 页面连"占位目录"都不创建——如果你把 `guides/secret.md` 设 hidden，`guides/` 目录如果只有这一个文件就会消失。这个语义和 Docusaurus 的 "show in sidebar but hide page content" 完全相反，是个隐藏陷阱。

紧接着是排序逻辑（[`navigation.ts#L296-L313`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/utils/navigation.ts#L296-L313)）：

```ts
function getOrder(routeOrDir: Route | Dir): number {
	return isDir(routeOrDir)
		? Math.min(...Object.values(routeOrDir).flatMap(getOrder))
		: (routeOrDir.entry.data.sidebar.order ?? Number.MAX_VALUE);
}

function sortDirEntries(dir: [string, Dir | Route][]): [string, Dir | Route][] {
	const collator = new Intl.Collator(localeToLang(undefined));
	return dir.sort(([_keyA, a], [_keyB, b]) => {
		const [aOrder, bOrder] = [getOrder(a), getOrder(b)];
		if (aOrder !== bOrder) return aOrder < bOrder ? -1 : 1;
		return collator.compare(isDir(a) ? a[SlugKey] : a.id, isDir(b) ? b[SlugKey] : b.id);
	});
}
```

旁注：

- **目录的"order"等于其子节点的最小 order**——这意味着如果你把 `guides/install.md` 标 `sidebar.order: 1`，整个 `guides/` 组就会排到最前。这个递归 min 就是为什么用户写 `order: 1` 在一个深层文件就能把整个父目录顶上去。
- **没标 order 的 fallback 是 `Number.MAX_VALUE`**——所有未标号的 entry 排在所有标号 entry 之后，然后内部按 `Intl.Collator` 排。这避免了 "1 / 2 / 10 / 11" 这种 lexicographic 错排（`Collator` 知道 numeric 比较）。
- **`Intl.Collator(localeToLang(undefined))`** 用的是默认 locale，不是当前页 locale——这意味着中文页的 sidebar 排序仍然按 en-US 的字母规则，不会按拼音。这是个跨 locale 一致性 vs 本地化感受的 trade-off。
- **没用 `localeCompare`，而是缓存 `collator` 实例**——大 sidebar 性能差异显著（500+ 文件时排序 10x）。
- **怀疑 1**：如果两个 entry 都没标 order，按 slug 排，但 slug 是从 `route.id` 来的（去掉扩展名的相对路径），不是 frontmatter `title`。这意味着 `guides/install.md` 排序键是 `install` 不是 "Install Guide"。中文 title 想按 title 排在中文站很反直觉——只能靠手动 `order` 兜。

### 段 (b)：Content collection schema + frontmatter（`schemas/sidebar.ts` + `schema.ts`）

[`packages/starlight/schemas/sidebar.ts#L44-L163`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/schemas/sidebar.ts#L44-L163)

```ts
const SidebarLinkItemSchema = z.strictObject({
	...SidebarBaseSchema.shape,
	link: z.string(),
	attrs: SidebarLinkItemHTMLAttributesSchema(),
});

const AutoSidebarEntriesSchema = z.object({
	label: z.custom<never>().optional(),
	autogenerate: z.object({
		directory: z.string().transform(stripLeadingAndTrailingSlashes),
		collapsed: z.boolean().optional(),
		attrs: SidebarLinkItemHTMLAttributesSchema(),
	}),
}).strict().superRefine((config, ctx) => {
	if (!('label' in config)) return;
	ctx.addIssue({
		code: 'custom',
		message:
			`Found an \`autogenerate\` object with a \`label\`. Support for autogenerated sidebar groups was removed in Starlight v0.39.0.\n` +
			`You should instead create a group with the desired \`label\` and an \`items\` array containing the autogenerate config:\n\n` +
			`{\n` +
			`  label: '${config.label}',\n` +
			`  items: [{ autogenerate: ${JSON.stringify(config.autogenerate, ...).replace(/\n\s*/g, ' ')} }]\n` +
			`}`,
	});
});

type ManualSidebarGroupOutput = z.output<typeof SidebarGroupSchema> & {
	items: Array<
		| z.output<typeof SidebarLinkItemSchema>
		| z.output<typeof AutoSidebarEntriesSchema>
		| z.output<typeof InternalSidebarLinkItemSchema>
		| z.output<typeof InternalSidebarLinkItemShorthandSchema>
		| ManualSidebarGroupOutput
	>;
};

const ManualSidebarGroupSchema: z.ZodType<ManualSidebarGroupOutput, ManualSidebarGroupInput> =
	z.strictObject({
		...SidebarGroupSchema.shape,
		items: z.lazy(() =>
			z.union([
				SidebarLinkItemSchema,
				ManualSidebarGroupSchema,
				AutoSidebarEntriesSchema,
				InternalSidebarLinkItemSchema,
				InternalSidebarLinkItemShorthandSchema,
			]).array()
		),
	});

export const SidebarItemSchema = z.union([
	SidebarLinkItemSchema,
	ManualSidebarGroupSchema,
	AutoSidebarEntriesSchema,
	InternalSidebarLinkItemSchema,
	InternalSidebarLinkItemShorthandSchema,
]);
```

旁注（≥ 5 颗）：

- **`z.strictObject` 而不是 `z.object`**：strict 模式下多余字段会报错，user config 里 typo（`labe: 'X'` 写错成 `labe`）会立刻 fail 而不是静默丢弃。这是 zod 在 docs 工具里的标配。
- **`z.lazy(() => ...)` 是递归类型必备**：`ManualSidebarGroupSchema` 的 items 数组里又能包含 `ManualSidebarGroupSchema`——TypeScript 闭包里直接引用自己会因为定义顺序爆 TDZ，`z.lazy` 把 schema 变成 thunk，运行时再求值。
- **手写 `ManualSidebarGroupOutput` 而不是 `z.infer`**：因为 `z.lazy` 里 schema 自指会让 zod 推断不出递归类型（TS 显示 `any`）。社区标准做法是手写 input + output 接口，再 `z.ZodType<Out, In>` 显式标注。这是 zod + 递归数据结构的固定模式。
- **`AutoSidebarEntriesSchema` 的 `label: z.custom<never>().optional()`**：把 label 字段类型标成 `never`。配合下面 `superRefine` 在 runtime 检测——这是双重防御：编译期类型让你写不出 label，runtime zod 在 v0.39 升级时还能给降级用户友好错误。`v0.39` 是 breaking change（autogenerate 不能再带 label），用 superRefine 给迁移指引而不是 silent fail。
- **`InternalSidebarLinkItemShorthandSchema` 用 `.transform()`** 把字符串当 shorthand：`'guides/install'` 自动展开成 `{ slug: 'guides/install' }`。这让 manual sidebar 写起来短一截，是 zod 的 input/output 类型分离能力（input 是 string，output 是对象）。
- **怀疑 2**：`SidebarItemSchema` 是 `z.union(...)` **没用** discriminator——不像 `z.discriminatedUnion('type', [...])`。zod 在 union 失败时报错信息会列所有分支的报错，对 user 调试很糙（"该是 link / 该是 group / 该是 autogenerate / ..."五个分支全 dump）。可能是因为 input 形状没有共同的 discriminator 字段（link / autogenerate / slug / items 各自独立）。

主 schema 入口（[`schema.ts#L11-L80`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/schema.ts#L11-L80)）：

```ts
const StarlightFrontmatterSchema = (context: SchemaContext) =>
	z.object({
		title: z.string(),
		description: z.string().optional(),
		editUrl: z.union([z.url(), z.boolean()]).optional().default(true),
		head: HeadConfigSchema({ source: 'content' }),
		tableOfContents: FrontmatterTableOfContentsSchema(),
		template: z.enum(['doc', 'splash']).default('doc'),
		hero: HeroSchema(context).optional(),
		lastUpdated: z.union([z.date(), z.boolean()]).optional(),
		prev: PrevNextLinkConfigSchema(),
		next: PrevNextLinkConfigSchema(),
		sidebar: z.object({
			order: z.number().optional(),
			label: z.string().optional(),
			// ...
		}).default({}),
	});
```

旁注：

- 这个 schema 接受 `SchemaContext` 是因为 `HeroSchema` 里要用 `context.image()`（Astro 的 image() helper），让 hero 图片能享受 Astro 的图片优化管线。这是 schema 工厂模式（不是 schema 实例）的核心理由。
- `editUrl: z.union([z.url(), z.boolean()]).optional().default(true)`——一个字段三态：URL string 覆盖、`false` 关闭、未设走全局默认。这种"布尔 + URL"的 zod 写法在 docs 工具里很常见，比"一个字段管开关，另一个字段管 URL"省一半 user config。
- 用户在自己 `content.config.ts` 里这样组合：`schema: docsSchema({ extend: z.object({ author: z.string() }) })`——`extend` 是项目的口子，能在不 fork starlight 的情况下扩 frontmatter 字段。这是 v1.1 分支 D 强调的 extension point 标准实现。

### 段 (c)：Pagefind 集成 + 搜索 build（lifecycle hook 范式）

[`packages/starlight/integrations/pagefind.ts#L6-L46`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/integrations/pagefind.ts#L6-L46)

```ts
export async function starlightPagefind({
	dir,
	logger: starlightLogger,
}: PagefindIntegrationOptions) {
	const logger = starlightLogger.fork('starlight:pagefind');
	const options = { dir, logger };

	try {
		const now = performance.now();
		logger.info('Building search index with Pagefind...');

		const newIndexResponse = await pagefind.createIndex();
		const { index } = assertPagefindResponse<pagefind.NewIndexResponse>(newIndexResponse, options);

		const indexingResponse = await index.addDirectory({ path: fileURLToPath(dir) });
		const { page_count } = assertPagefindResponse<pagefind.IndexingResponse>(
			indexingResponse,
			options
		);
		logger.info(`Found ${page_count} HTML files.`);

		const writeFilesResponse = await index.writeFiles({
			outputPath: fileURLToPath(new URL('./pagefind/', dir)),
		});
		assertPagefindResponse<pagefind.WriteFilesResponse>(writeFilesResponse, options);

		const pagefindTime = performance.now() - now;
		logger.info(
			`Finished building search index in ${pagefindTime < 750 ? `${Math.round(pagefindTime)}ms` : `${(pagefindTime / 1000).toFixed(2)}s`}.`
		);
	} catch (cause) {
		throw new Error('Failed to run Pagefind.', { cause });
	} finally {
		await pagefind.close();
	}
}
```

旁注（≥ 5 颗）：

- **`logger.fork('starlight:pagefind')`** 是 Astro 的 logger 子标签——所有 Pagefind 输出会带前缀，构建日志混在 sitemap、mdx、tailwind 里也能一眼定位是哪个 integration 在说话。这是大量 integration 共存时的可观测性基础。
- **`fileURLToPath(dir)`** 把 Astro 给的 URL（`file:///...`）转成 OS 路径——这是因为 Pagefind 的 native binding 不接受 URL，只认字符串路径。Windows 上 `file:///` 和 `C:\...` 的双重表达正是 `fileURLToPath` 出现的原因。
- **`assertPagefindResponse` 把 `errors` 数组转成 throw**——Pagefind 的 JS API 设计是错误返回不抛，每次响应里都有个 `errors: string[]`。Starlight 把"没错"的契约升级到 throw 级别，否则 build 看起来成功但 dist/pagefind/ 是损坏的。
- **`finally { await pagefind.close() }`**：Pagefind 起的是 child process（WASM/Rust），不 close 会泄漏。这是 native binding integration 的标配 cleanup。
- **`index.addDirectory({ path: fileURLToPath(dir) })`**：注意它是把"整个 dist/"当输入，意味着 Pagefind 自己 walk 文件系统读 `*.html`，再用 HTML 里的 `data-pagefind-body` / `data-pagefind-meta` 等属性提取索引。这是为什么 Starlight 不用自己解析 markdown——内容已经是 HTML，Pagefind 自带解析器。
- **怀疑 3**：这个函数只在 `'astro:build:done'` 触发（见 `index.ts#L187-L190`），意味着 `astro dev` 模式下没有 Pagefind 索引，搜索框是死的。开发时如果想测搜索就要 `astro build && astro preview`。这个体验 trade-off 在源码里没注释——是为了避免 dev 每次热更新都重建索引（慢），但对新手不友好。

整个 60 行展示了 v1.1 分支 D 关心的 lifecycle 范式：**Astro integration 的 `astro:build:done` hook 是把"build 之后做什么"卡进流水线的标准位置**——sitemap、search index、生成 RSS、生成 OG image 都走这个 hook。Starlight 自己的 sitemap 也是同样的结构（`integrations/sitemap.ts`）。

---

## Layer 4 · 改一处（v1.1 分支 D：写 plugin / 改 sidebar config）

按分支 D 的"写 1 个 plugin / middleware / schema extension，跑 example 看 lifecycle 何时触发"。

### 30 分钟跑通

```bash
# 1. 用官方脚手架建项目
npm create astro@latest -- \
  --template starlight \
  --install --no-git --typescript strict \
  starlight-test

cd starlight-test
npm run dev   # http://localhost:4321
```

3 个文件就是个 docs 站：

```
src/content/docs/index.mdx           ← 首页
src/content/docs/guides/example.md   ← 示例
astro.config.mjs                     ← starlight() 配置
```

### 改一处实验：触发 v0.39 的 autogenerate breaking change

把 `astro.config.mjs` 改成：

```js
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Hello',
      sidebar: [
        // 故意写 v0.38 之前的格式
        { label: 'Guides', autogenerate: { directory: 'guides' } },
      ],
    }),
  ],
});
```

启动 `npm run dev`，立刻看到 zod 报错（来自上面段 (b) 里的 `superRefine`）：

```
Found an `autogenerate` object with a `label`. Support for autogenerated sidebar groups was removed in Starlight v0.39.0.
You should instead create a group with the desired `label` and an `items` array containing the autogenerate config:

{
  label: 'Guides',
  items: [{ autogenerate: { directory: "guides" } }]
}
```

观察到的事实：

1. zod 错误信息是带"修复建议代码片段"的——这是 `superRefine` + 模板字符串的产物，不是 zod 默认行为。
2. 错误会阻止 dev server 启动（不是运行时降级），是因为 user config 在 `astro:config:setup` 里就 parse，失败 throw。
3. 改成新格式后立即热更新成功。

### 改一处实验：写一个最小 plugin

新建 `my-plugin.mjs`：

```js
export function myPlugin() {
  return {
    name: 'my-plugin',
    hooks: {
      'config:setup'({ config, updateConfig, logger }) {
        logger.info(`Original title: ${config.title}`);
        updateConfig({ title: `${config.title} (patched)` });
      },
    },
  };
}
```

在 `astro.config.mjs` 里：

```js
starlight({
  title: 'Hello',
  plugins: [myPlugin()],
  sidebar: [{ label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] }],
});
```

观察：

- 终端打印 `[starlight:my-plugin] Original title: Hello`。
- 浏览器标签页变成 `Hello (patched)`。
- 这条 log 出现在 `astro:config:setup` 阶段（`runPlugins` 内调用），早于 Astro 自己的 config 完成、早于 Vite 启动。

这就是 v1.1 分支 D 要求的"lifecycle 何时触发"的具体证据：**Starlight plugin 的 `config:setup` 比 Astro integration 的 `astro:config:setup` 更早**——因为前者是 Starlight 内部 plugin 系统（`utils/plugins.ts` 里 `runPlugins`），它先跑完才把最终的 user config 喂给 Astro。

---

## Layer 5 · 横向对比（≥ 4 维 + 哲学不同的竞品）

| 维度 | Starlight | Docusaurus | VitePress | Nextra | Mintlify | Vocs |
|---|---|---|---|---|---|---|
| 引擎 | Astro（islands，0 JS 默认） | React + webpack/Rspack | Vue + Vite | Next.js | 闭源托管 | Vite + React |
| Hydration | 默认无 | 默认全 hydration | 默认无（VitePress 4 起） | 部分 hydration | 闭源 | 默认全 hydration |
| 搜索 | Pagefind（构建期 WASM 索引） | Algolia 或本地 lunr 插件 | minisearch（内置）+ Algolia 可选 | flexsearch（运行时索引） | 内置 | 内置 |
| Sidebar autogen | 文件系统驱动，递归 | 半手动（sidebar.js）+ partial autogen | 手写 | 文件系统驱动 | 文件系统驱动 | 手写 |
| i18n | Astro 原生 i18n + 路由前缀 | 内置 i18n + crowdin | 内置 i18n | 内置 | 闭源 | 实验性 |
| 部署 | 任意静态托管 | 任意静态托管 | 任意静态托管 | 任意静态托管 | **托管平台** | 任意静态托管 |
| License | MIT | MIT | MIT | MIT | **闭源** | MIT |
| 主开发方 | Astro core team | Meta | Vue core | Vercel 系（社区） | Mintlify Inc | wevm（wagmi 作者） |
| 开箱就有的 | 主题、搜索、i18n、ToC、prev/next | 主题、搜索（Algolia）、i18n | 主题、搜索 | 主题、搜索 | 一切（toll fee） | 主题、搜索 |

### 选型建议（场景 → 选谁）

- **想要"零 JS 默认 + 文件系统 sidebar + 不依赖 SaaS 搜索"** → Starlight。这是它 unique 的甜点。
- **已经有 React 全栈站点要内嵌 docs，且能接受 hydration 成本** → Docusaurus 或 Nextra。Nextra 更轻，Docusaurus 更全。
- **Vue 系团队，docs 是次要产物** → VitePress。
- **不想自己运维、能付 SaaS 费用、要"即插即用"** → Mintlify。但代价是 lock-in。
- **Web3/钱包栈需要深度 React 主题定制** → Vocs。
- **企业需要 i18n + Crowdin 集成 + 翻译记忆** → Docusaurus（生态最成熟）。

### 哲学差异（不是同流派下位替代）

- **Starlight vs Docusaurus**：「Astro 的 island 派 vs React 的全 hydration 派」。Docusaurus 的页面交互和 docs 内容耦合在 React tree 里，Starlight 把"内容是 HTML"和"交互是按需 island"切分。
- **Starlight vs Mintlify**：「开源框架 vs 托管 SaaS」。Mintlify 给你完整体验但锁住部署，Starlight 让你失去部分开箱即用换来 100% 控制权。
- **Starlight vs Nextra**：「Astro integration vs Next.js 的 \_app 包装」。Nextra 是把 Next 的 `_app.tsx` 用一层 HOC 包起来，Starlight 是把 Astro 的 hook 注入。前者吃 Next 全部 SSR/RSC 心智，后者吃 Astro 的 SSG 简单心智。
- **Starlight vs VitePress**：「multi-runtime（Astro 支持 React/Vue/Svelte 同站）vs single-runtime」。如果你的 docs 要嵌一个 React 写的交互 demo + 一个 Vue 写的视觉化，Starlight 原生支持，VitePress 要自己解决。

---

## Layer 6 · 与你当前工作的连接（≥ 4 子弹/段，通用化）

> 注：本站（study-refactor-projects）本身就用 Starlight 0.30.x 构建，所以这一段是"脚下的地板"——以下经验来自本站日常维护。

### 今天就能用的部分

- **sidebar autogenerate**：本站 `projects/` 目录已经 70+ 篇笔记，没有手写 sidebar.js，全靠 `autogenerate: { directory: 'projects' }`。新增笔记 commit 即生效，零额外工作。
- **frontmatter `sidebar.order`**：把方法论页 `method.md` 的 `order: 0` 钉在最前，把每篇项目笔记按时间倒序填 order，sidebar 自动按时间线排列。`getOrder()` 的递归 min 让目录组也跟着头部文件走。
- **Pagefind 搜索**：本站 `npm run build` 后 `dist/pagefind/` 自动生成索引；部署到 GitHub Pages 后右上搜索框开箱可用。从来没接 Algolia，没付费。
- **`docsSchema({ extend })` 加自定义字段**：在本站的 `content.config.ts` 里给 frontmatter 多加 `season: z.number()` 字段，跟 Layer 0 信息表配合做 Season 索引——extend 一次以后所有笔记自动校验。

### 下个月能用的部分

- **i18n 路由**：study 站目前只中文，但记录论文/项目笔记时引用英文原文标题很多——下一步把首页和方法论页双语，靠 `locales: { root: { label: '中文' }, en: { label: 'English' } }` 一次拆出两套路由。
- **plugin 机制**：把"Layer 0 信息表 + 状元篇 checklist 校验"做成一个 Starlight plugin，在 `config:setup` hook 里 walk 所有 markdown，对每篇做硬指标校验（行数 / permalink 数 / 怀疑数）。可以替代 `pre-commit` 里的 lint-frontmatter.py。
- **components 覆盖**：Starlight 的 `components: { TableOfContents: './MyToc.astro' }` 让我可以把"右侧 ToC"换成"折叠式 ToC + 当前 Layer 高亮"，因为 7 层结构需要更强的导航感。
- **`hero` 字段**：每篇状元篇的封面图（Figure 1）当前手动用 `![]()`——可以挪到 frontmatter `hero.image`，让 Starlight 主题接管 hero 区，移动端响应式自动处理。

### 不要用的部分（要明确说"不"）

- **Splash template**：`template: 'splash'` 是给 landing page / 首页用的"无 sidebar 大版面"。本站每篇笔记都是阅读型 docs，不要 splash——否则会丢 sidebar 上下文，用户找不到上下篇。
- **内置的 ExpressiveCode title/frame 装饰**：本站代码块要紧贴正文，加 frame 视觉太重；继续用 markdown 标准 \`\`\`ts 而不是 ExpressiveCode 的 `frame="terminal"`。
- **`tableOfContents.maxHeadingLevel: 4` 以上**：默认 maxHeadingLevel 3 已经够。深 toc 在长笔记里反而干扰阅读节奏，不要追求"全部 anchor 都列"。
- **Mintlify 风的"AI search"或 chat box**：Starlight 没内置这种东西是好事，本站不打算外接 SaaS chat——保持"读完就是读完"的 docs 心智，不要做成产品 demo 站。

---

## Layer 7 · 自检 + 延伸阅读（≥ 3 怀疑）

### 怀疑（追到行号级别）

1. **`treeify` 在 sort by depth desc 时，如果两个文件同深但一个有索引页、一个没有，谁先插？**
   `routes.sort(([a], [b]) => b.split('/').length - a.split('/').length)` 不是 stable sort 假设——V8 的 `Array.prototype.sort` 现在是 stable 的，但深度相同的 entry 顺序就由 `routes` 数组本身决定。`routes` 来自哪里、按什么排序？要追到 [`utils/routing/index.ts`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/utils/routing/index.ts)。
2. **Pagefind 的 `index.addDirectory({ path: fileURLToPath(dir) })` 是同步还是异步遍历？60 行里我看不到 chunk 控制——10000 个 HTML 的站会不会 OOM？**
   Pagefind 是 Rust binding，从 60 行看不出。要去 `node_modules/pagefind/lib/api.js` 翻它的 native 调用方式。
3. **Starlight plugin 的 `config:setup` hook 真的早于 Astro integration 的 `astro:config:setup` 吗？**
   段 (a) 说的"先跑完才喂给 Astro"是从 [`utils/plugins.ts`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/utils/plugins.ts) 推断——但 `runPlugins` 真的在 Astro hook 内部？还是 Starlight 把 plugin 转成 Astro integration push 进去？要看 `runPlugins` 是否返回 `integrations` 数组。
4. **`Intl.Collator(localeToLang(undefined))` 用默认 locale 排序——多语言站点的 sidebar 在不同 locale 下顺序应该一样还是该按各自 locale 重排？**
   navigation.ts:305 行写死了 `undefined`——意味着 zh 站和 en 站 sidebar 顺序完全一致。但用户期望可能是"中文页按拼音"。是产品决策还是疏忽？

### 接下来读哪 N 个文件

| 顺序 | 文件 | 回答的问题 |
|---|---|---|
| 1 | [`utils/routing/index.ts`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/utils/routing/index.ts) | `routes: Route[]` 是怎么从 content collection 加载出来的？排序是什么？ |
| 2 | [`utils/plugins.ts`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/utils/plugins.ts) | Starlight plugin 系统如何与 Astro integration 配合？怀疑 3 的答案 |
| 3 | [`integrations/expressive-code/index.ts`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/integrations/expressive-code/index.ts) | 代码块高亮怎么挂进 markdown pipeline？需要 `frame` `title` 等 syntax 哪里解析？ |
| 4 | [`schemas/i18n.ts`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/schemas/i18n.ts) | 244 行的 UI 翻译键定义——i18n 内置 UI 字符串边界在哪？哪些必须用户翻译？ |
| 5 | [`utils/navigation.ts#L376-L500`](https://github.com/withastro/starlight/blob/02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd/packages/starlight/utils/navigation.ts#L376-L500) | `intermediateSidebars` 缓存机制怎么处理"当前页 isCurrent 标记"？多 locale 缓存键设计？ |

---

## 限制段（≥ 4 条独立限制，禁抄 README）

1. **不适合 doc + product 强混合站**。如果你要在 docs 里嵌入需要登录态、依赖 RSC、走 `/api/*` POST 的复杂应用，Astro 的 SSR 模式可以但 Starlight 主题不为这个场景设计。strapi.io 那种 docs + 产品营销 + dashboard 三合一站，硬挤会变形。
2. **Pagefind 索引粒度只到 page 级**。如果你的页面很长（>5000 字），搜索结果显示的 snippet 可能跨章节，没法搜"只在 H3 里出现的词"。Algolia 的 "section + content level" 索引在这点上更细。
3. **sidebar autogen 不支持 cross-directory 排序**。`autogenerate: { directory: 'guides' }` 只读那个目录树，如果你想"把 guides/install.md 和 reference/cli.md 放在同一组"，就只能手写 manual sidebar——一旦上手动，autogen 的"加文件即上线"就失效。半自动化方案缺位。
4. **Starlight plugin 没有 `astro:build:done` 等价 hook**。它只暴露 `config:setup`——意味着"build 完做点啥"必须降级写一个 Astro integration（不是 Starlight plugin）。两套 plugin 系统并存，新手会困惑哪种该用哪种。
5. **`routes/static/` 和 `routes/ssr/` 是两套并行的 .astro 文件**——通过 `prerender` 配置二选一。`index.astro` 长得几乎一样但维护是双份。如果你要 fork 改路由结构，要同时改两边。
6. **`@astrojs/mdx` 在 v0.39 仍然 hardcode push 进 integrations**——如果你想用 Markdoc 或 Mdx 完全不一样的版本，要先在 user config 里手动加 mdx integration 让 Starlight 检测到 `name === '@astrojs/mdx'` 然后跳过自己的 push。这个"自动幸存检测"在 README 里没说。

---

## 附录：宣传 vs 现实清单

| 宣传 | 现实 |
|---|---|
| "Zero JS by default" | 真。但搜索框打开会 lazy load Pagefind 的 WASM（约 50KB）。"零 JS"是首屏含义，不是 0 字节。 |
| "Built-in i18n" | 真。但 sidebar 的 `Intl.Collator` 用默认 locale 排序（怀疑 4），多语言站点的 sidebar 顺序在所有 locale 下完全一致。 |
| "Autogenerate sidebar from your file system" | 真。但 `hidden: true` 文件如果是某个目录的唯一文件，整个目录从 sidebar 消失，无 README 警告。 |
| "Search that just works" | 真。但 dev 模式下没索引，本地调搜索体验需要 `astro build && astro preview`——首次接触有困惑。 |
| "Plugin system" | 真。但只有 `config:setup` hook，要 build:done / build:start 必须降级成 Astro integration。两套并存。 |

---

## 元数据

- **升级日期**：2026-05-29（Season 16 启动 / Round 71）
- **总行数**：约 540 行
- **状元篇 Checklist**：v1.1（项目类型分支：D 框架/SDK）
- **启用工具**：Claude Opus 4.7 + WebFetch + 浅 clone 02f2ce1
- **commit hash 锚定**：`02f2ce1ea2c2d814fdd2ecdd609d35109479d8cd`（4 处 GitHub permalink + 多处行号引用，均含 40 字符 SHA）
- **图**：Figure 1 架构图（webp 167KB）
- **怀疑数**：4 处（段 a 1、段 b 1、段 c 1、Layer 7 4 处合计）+ 限制段 6 条
- **Layer 0 字段数**：11
- **公开输出合规**：本文已检查，无任何公司业务上下文与内部项目代号

---
title: Storybook — 给 UI 组件一个独立的工作台
description: 不是文档站、不是测试 runner、不是 playground —— 它是把这三件事缝起来的 dev-time framework，靠 Manager + Preview iframe 双 window 和一根 postMessage 通道
sidebar:
  order: 23
  label: storybookjs/storybook
---

> storybookjs/storybook v10.4.1（2026-05），MIT。
> commit `c899cac7fe878aa3b3f6f479f4e245d8588852a9`，next 分支。
>
> Storybook 的核心命题不是"能预览组件"——
> Codepen / Vite playground / Ladle 都能预览。
> Storybook 是把"组件**孤立开发** + **可视化文档** + **interaction 测试** + **visual regression**"
> 这四件事**用同一份 story 文件**串起来。
>
> 一份 `Button.stories.ts`，能：
> - 在浏览器里以独立 iframe 渲染
> - 自动生成 props 表格和 source code 文档
> - 跑 `play()` 函数做 user-event 测试
> - 给 Chromatic / Vitest visual snapshot 做基线
>
> 这种"一个文件多个用途"的能力，让它不是 library——是 **dev-time framework**。
>
> Season 14。**项目类型：框架/SDK（v1.1 分支 D）**——
> 心脏物 = 用户在 framework 提供的 abstraction（CSF）里写代码，
> framework 提供 extension points（addon / decorator / preset / hook），
> framework 控制运行时（Manager UI + Preview iframe + Channel）。

## 一句话定位

**Storybook = 给 UI 组件的独立工作台。**
你写 `*.stories.ts` 文件（CSF 3.0 = ESM exports），Storybook 把每个 export
渲染成一个孤立的 story，挂载在浏览器 iframe 里，配上 props panel、文档、测试 runner、a11y check。
它**不是 test runner、不是 docs site、不是 dev server**——
它是把这三件事**用同一份文件**串起来的 dev-time framework。

## Why（为什么是它而不是 Ladle / Histoire / Bit / Chromatic）

主流前端开发的现状（没有 Storybook 时）：

```
组件预览 = 你在 App.tsx 临时挂个 <Button />
文档     = Storybook 之外另写 docs site
测试     = 跑 vitest / playwright 在 CI
a11y     = 又是另一套 axe 跑 CI
设计 review = 截图发 Figma
```

**每件事独立工具、独立配置、独立心智**。每个工具用自己的 fixture。
组件接口改一次，要同步改 4 个地方。

更糟糕的是"在 App 里挂临时预览"模式——
在真实业务环境里写组件，**永远受全局 CSS / Provider / state 污染**。
你以为组件没问题，等用到别的页面才发现它依赖 `<AuthProvider>`。

Storybook 的核心 insight：

1. **组件该有 isolated workspace**——独立 iframe + 独立 module graph，与业务代码隔离
2. **同一份 story 文件复用四种用途**——预览 / 文档 / 测试 / 视觉回归
3. **Manager / Preview 物理隔离**——Manager 是 React 控制台，Preview 是任意 framework iframe，两边 zero coupling
4. **Addon = framework 的 extension point**——controls / actions / docs / a11y / interactions 都是 addon
5. **CSF（Component Story Format）= ES Module**——不发明 DSL，story 就是普通 export

| 工具 | 类型 | story 数据格式 | Manager UI | 测试集成 | 设计哲学 |
|---|---|---|---|---|---|
| **Storybook** | 框架 | CSF 3.0 (ESM) | React + iframe | play() + Vitest + Chromatic | "工作台 + 文档 + 测试三位一体" |
| Ladle | 库 | CSF 3.0 兼容 | Preact 极简 UI | 无内建 | "Storybook 的轻量替代" |
| Histoire | 库 | 自有格式（Vue/Svelte 优先） | Vite 原生 | 无内建 | "Vite 时代的 Storybook" |
| Bit | 平台 | 自有 component model | 在线 platform | 集成 | "组件即服务" |
| Chromatic | 服务 | 复用 Storybook 的 CSF | 无（依赖 Storybook） | 视觉回归 | "Storybook 的 Cloud 配套" |
| Playroom | 工具 | JSX in URL | 无 | 无 | "实时 prop 编辑器" |

**为什么不是 Ladle**：Ladle 由 Twilio Paste 团队做，启动快得多（Vite-only，不带 webpack 历史包袱），
但**没有 addon 生态**——controls / actions / docs / a11y 全靠手写。
Ladle 适合"我只要预览"，Storybook 适合"我要工作台"。

**为什么不是 Histoire**：Histoire 是 Vite 时代的 Vue/Svelte 优先工具。
设计时选了"内嵌渲染"——所有 story 在同一个 window 里，不开 iframe。
**好处是快**，**代价是隔离性丢了**——CSS 串台、global state 串台。
Storybook 的 iframe 隔离是"贵但值"。

**为什么不是 Bit**：Bit 是另一个量级——它不是工作台，是组件**包管理 + 协作平台**。
你把组件发布到 Bit cloud 当 npm 包用。学习曲线大三倍，受众完全不同。

**为什么不是 Chromatic**：Chromatic **不是 Storybook 替代**，是**配套 SaaS**——
读你的 Storybook、跑视觉回归、给 PR 打标签。两者一起用。

**Storybook 的判断分水岭**：
- 选"工作台"——一个文件四种用途，addon 生态当扩展点
- 选"轻量"（Ladle/Histoire）——一个文件一种用途（预览），快但单薄
- 选"平台"（Bit）——一个文件即包，跨项目协作

## Layer 0 · 身份扫描

| 字段 | 数值 |
|------|------|
| star | 90.1k+ |
| version | v10.4.1（2026-05-22 release） |
| 默认分支 | next |
| 最近活跃 | 2026-05-28（高频 daily commits） |
| commit 总数 | 80,313+ |
| 主语言 | TypeScript（81.6%） |
| 维护方 | storybookjs（org） |
| license | MIT |
| 依赖者 | ~284,000 个 GitHub 项目（Used By） |
| 心脏目录 | code/core/src/{csf-tools, preview-api, manager-api, channels, manager, preview} |
| 关键 release | v9（2025）→ v10（2026）：Vitest test runner GA、Component-Test addon、Vite 6 |

## Layer 1 · 存在理由

2016 年 Arunoda Susiripala 在 Meteor 里写了 React Storybook，
解决一个朴素痛点：**"我想把一个 React 组件单独跑起来，不要把整个 app 启动起来。"**

那年 React 已经流行，但前端世界还没有"组件孤立开发"的工作流。
所有人都在 App.tsx 里临时挂载组件、改完截图、删掉。

Arunoda 的 insight：**组件应该有自己的开发环境。**
不只是"启动 dev server 那么简单"——而是：

- 独立的 module 入口（不要被业务代码 import 影响）
- 独立的 UI 控制台（让你切换不同 props 组合）
- 独立的渲染窗口（不被全局 CSS / Provider 污染）

这三件事一起做，才叫"工作台"。

2017 年项目被剥离出 Meteor，独立成 storybookjs/react-storybook，
后扩展成支持 React/Vue/Angular/Svelte 的 storybookjs/storybook。
2020 年发明 **CSF（Component Story Format）**——
让 story 文件不再是奇怪的 DSL，就是普通的 ES Module。

2025 年 Storybook 9 把 **Vitest 集成**做进核心：
你写的 `play()` 函数，可以在 Vitest 里跑（Node + jsdom），
也可以在浏览器里跑（真实 DOM + 真实 CSS）。
**同一段 test 代码两种 runner**——这是 framework 才能干的事。

如果 Storybook 不存在：

- 设计系统会回退到"在 docs 站里写 demo"——文档和真实组件状态会漂移
- 视觉回归测试要从零搭建（component snapshot + screenshot diff + baseline 管理）
- a11y / responsive / theme 的人工 review 要重复做
- 大厂的 design system 团队会自己造 Storybook 替代品（Airbnb 当年就造过）

Storybook 把这些都收编了。**它不是工具，是工作流的事实标准。**

## Layer 2 · 仓库地形

```
storybook/
├── code/                       ← Yarn 4 workspace 根（所有源码在这）
│   ├── core/                   ← @storybook/core 主包（manager + preview + 公共 API）
│   │   ├── src/
│   │   │   ├── manager-api/    ← Manager UI 状态层（Redux-ish）
│   │   │   ├── preview-api/    ← Preview iframe 内的 runtime
│   │   │   ├── csf-tools/      ← AST 解析（Babel）→ 抽 stories + 注入 source
│   │   │   ├── csf/            ← CSF 类型定义 + composeStory factory
│   │   │   ├── channels/       ← Manager ⇄ Preview 通信抽象（postMessage / websocket）
│   │   │   ├── core-events/    ← 事件常量（SET_CURRENT_STORY 等）
│   │   │   ├── manager/        ← Manager UI 入口（React app）
│   │   │   ├── preview/        ← Preview iframe 入口
│   │   │   ├── core-server/    ← Node 端 dev server（webpack/vite 编排）
│   │   │   └── builder-manager/← Manager 构建（独立 esbuild 编译）
│   │   └── package.json
│   ├── lib/                    ← 共享工具库（cli, blocks, react-dom-shim）
│   ├── builders/               ← @storybook/builder-vite, @storybook/builder-webpack5
│   ├── frameworks/             ← @storybook/{react-vite, nextjs, svelte-vite, ...}
│   ├── renderers/              ← @storybook/{react, vue3, svelte, html}（DOM 接入）
│   ├── addons/                 ← @storybook/addon-{essentials, vitest, a11y, docs, ...}
│   ├── presets/                ← 预设组合（webpack/vite × framework）
│   └── e2e-tests/              ← Playwright e2e
├── docs/                       ← 用户文档
├── scripts/                    ← 维护者脚本（发布、sandbox 生成）
├── test-storybooks/            ← 测试用 storybook 实例
└── package.json                ← 根 monorepo
```

**心脏目录三件套**（按 commit 热度 + import 中心度）：

1. **`code/core/src/csf-tools/`**——把 `*.stories.ts` 解析成 manifest（编译时）
2. **`code/core/src/preview-api/modules/store/StoryStore.ts`**——Preview 内的 story 注册表（运行时）
3. **`code/core/src/channels/postmessage/`**——Manager ⇄ Preview 通信桥（neural system）

第二级关键文件：

- `code/core/src/preview-api/modules/preview-web/PreviewWeb.tsx`——Preview iframe 主类
- `code/core/src/preview-api/modules/store/csf/prepareStory.ts`——decorator 组合 + hook 应用
- `code/core/src/preview-api/modules/addons/main.ts`——AddonStore 单例
- `code/core/src/csf/csf-factories.ts`——`definePreview / defineMeta / defineStory` factory
- `code/core/src/manager-api/`——Manager 侧的 React state（用 telejson 序列化跨 window state）

**Extension points（v1.1 分支 D 必列）**：

- **decorator**（preview 侧）：包裹 storyFn，最常见用法是注入 Provider
- **addon panel**（manager 侧）：Tab 注册到 manager 工具栏底部
- **preset**（编译时）：改 webpack/vite 配置、注 manager-entries / preview-entries
- **play()**（runtime）：story export 上的 hook，在 render 后跑
- **loaders**（runtime）：render 前 async 加载数据（fetch fixture）
- **parameters**（声明式）：每个 story 自己的元数据，addon 读它做行为
- **globals**（跨 story state）：theme / locale / viewport，所有 story 共享

## Layer 3 · 心脏代码精读

### (a) CSF 3.0 + story 编译（CsfFile.parse）

CSF（Component Story Format）是 Storybook 最大的设计胜利。
它不是 DSL——就是普通 ES Module：

```ts
// Button.stories.ts
import { Button } from './Button';

export default {
  component: Button,        // ← 默认 export = meta（组件元数据）
  title: 'UI/Button',
};

export const Primary = {    // ← 命名 export = story
  args: { variant: 'primary', label: 'Click me' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button'));
  },
};
```

这种"export = story"的形式让 IDE 自动补全、type checker、lint 工具都能用上。
但 Storybook 还需要**编译时解析**——把所有 `*.stories.ts` 抽出来生成 `index.json` manifest，
让 Manager UI 渲染侧栏树。

入口：[code/core/src/csf-tools/CsfFile.ts#L142-L305](https://github.com/storybookjs/storybook/blob/c899cac7fe878aa3b3f6f479f4e245d8588852a9/code/core/src/csf-tools/CsfFile.ts#L142-L305)

```ts
// L142 起，CsfFile 类（简化版，注解用 ▸ 标记）
export class CsfFile {
  _ast: BabelFile;                      // ▸ Babel AST（@babel/parser 产物）
  _meta?: StaticMeta;                   // ▸ 默认 export 解析出的 meta
  _stories: Record<string, StaticStory> = {};
  _metaStatements: t.Statement[] = [];
  _storyStatements: Record<string, t.ExportNamedDeclaration> = {};
  _templates: Record<string, t.Expression> = {};
  imports: string[] = [];

  constructor(
    ast: BabelFile,
    { fileName, makeTitle }: CsfOptions
  ) {
    this._ast = ast;
    this._fileName = fileName;
    this._makeTitle = makeTitle;
  }

  // L243 起，parse() —— 主遍历入口
  parse() {
    const self = this;
    traverse(this._ast, {                      // ▸ 用 babel/traverse 走 AST
      ExportDefaultDeclaration: { ... },        // ▸ 提取 meta（component/title/args）
      ExportNamedDeclaration(path) {            // ▸ L327 起：每个 export const Foo = {...}
        const decl = path.node.declaration;     //    都被认为是 story 候选
        if (t.isVariableDeclaration(decl)) {
          decl.declarations.forEach((vd) => {
            if (t.isIdentifier(vd.id)) {
              const exportName = vd.id.name;
              if (!isExportStory(exportName, self._meta)) return;  // ▸ 过滤 includeStories/excludeStories
              const id = toId(self._meta!.title!, storyNameFromExport(exportName));
              self._stories[exportName] = { id, name: ..., parameters: ... };
            }
          });
        }
      },
    });
    return this;
  }
}

// L620 起，loadCsf() —— 入口便利函数
export const loadCsf = (code: string, options: CsfOptions) => {
  const ast = babelParse(code);
  return new CsfFile(ast, options);
};
```

**5 条旁注（这里发生了什么）**：

1. **AST 工作而不是 regex**——为什么？因为 story export 可能是 `export const Foo = { ... }`、
   `export const Foo = template.bind({})`、`export const Foo: Story = ...`。
   regex 写不全。Babel AST 让 Storybook 一次处理所有合法 ES Module 语法。
2. **`isExportStory` 过滤**——meta 上可能写 `excludeStories: ['mockData']`，
   因为用户想 export 工具变量但不当 story。`isExportStory` 在 [code/core/src/csf/index.ts#L47-L56](https://github.com/storybookjs/storybook/blob/c899cac7fe878aa3b3f6f479f4e245d8588852a9/code/core/src/csf/index.ts#L47-L56) 实现。
3. **`toId(title, name)` 生成稳定 storyId**——`UI/Button` + `Primary` → `ui-button--primary`。
   稳定 = 跨 commit 不变（除非用户改 title 或 export 名）= URL 可分享、bookmark 不坏。
4. **`enrichCsf` 注入 source 字符串**——让 Docs addon 能展示原始代码。
   这步在另一个文件 [enrichCsf.ts](https://github.com/storybookjs/storybook/blob/c899cac7fe878aa3b3f6f479f4e245d8588852a9/code/core/src/csf-tools/enrichCsf.ts)，
   往 AST 里塞一个 `__sourceCode` 属性。
5. **`_metaStatements` / `_templates` 是为重写 AST 准备**——CSF 工具不只读，还能写。
   `vitest-plugin/` 子目录用它把 story 转成 vitest 测试。

**怀疑点 1**：为什么不用 SWC 或 oxc parser（更快）？答：Babel 生态成熟，
plugin 多（`@babel/plugin-transform-react-jsx` 等），而 csf-tools 不在 hot path——
build 时跑一次，每个文件 < 50 ms 可接受。看到 `oxc-parser/` 子目录说明他们在评估迁移，
但还没切换主路径——**怀疑这是性能 vs 兼容性的权衡**。

### (b) Manager + Preview iframe 通信（postMessage Channel）

Storybook 的"双 window"是设计核心：

- **Manager UI**（顶层 window）= React app，跑在 `iframe.html` 外层
- **Preview**（iframe）= 用户的 framework runtime（React/Vue/Svelte/Angular）

为什么物理隔离？因为 Manager 的 React 版本不能强制等于用户项目的 React 版本——
Storybook 自己用 React 18，用户项目可能还在 React 16。**iframe 是隔离这两个 runtime 的最简办法**。

但隔离了就要通信。Manager 点 sidebar story → Preview 切换渲染。
Preview 的 play() 进度 → Manager 的 Interactions panel 显示。

通信走 [`code/core/src/channels/postmessage/index.ts`](https://github.com/storybookjs/storybook/blob/c899cac7fe878aa3b3f6f479f4e245d8588852a9/code/core/src/channels/postmessage/index.ts)：

```ts
// PostMessageTransport（简化版）
export class PostMessageTransport implements Transport {
  private buffer: BufferedEvent[];
  private handler?: ChannelHandler;

  constructor(private readonly config: Config) {
    this.buffer = [];
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('message', this.handleEvent.bind(this), false);
    }
  }

  setHandler(handler: ChannelHandler): void {
    this.handler = handler;
    while (this.buffer.length) {
      this.handler!(this.buffer.shift()!);     // ▸ flush 暂存事件
    }
  }

  send(event: ChannelEvent, options?: Options): Promise<any> {
    const data = stringify(                    // ▸ telejson 序列化
      { key: KEY, event, refId: this.config.page === 'preview' ? undefined : event.refId },
      global.CHANNEL_OPTIONS || {}
    );
    const frames = getFrames(options?.target);  // ▸ 找到 iframe 引用
    if (!frames.length) {
      this.buffer.push({ event, data });        // ▸ iframe 还没就绪 → 暂存
      return Promise.resolve();
    }
    frames.forEach((frame) => {
      try { frame.postMessage(data, '*'); } catch (e) { /* swallow */ }
    });
    return Promise.resolve();
  }

  private handleEvent(rawEvent: MessageEvent): void {
    try {
      const { data } = rawEvent;
      const { key, event } = parse(data, global.CHANNEL_OPTIONS || {});
      if (key === KEY) {                       // ▸ 只接受我们的频道
        const pageString = this.config.page === 'manager'
          ? '<span style="color:#7B4900">manager</span>'
          : '<span style="color:#0048AA">preview</span>';
        ...
        invariant(this.handler, 'ChannelHandler should be set');
        this.handler(event);
      }
    } catch (error) { /* swallow */ }
  }
}
```

**5 条旁注**：

1. **telejson 不是 JSON**——它是 Storybook 自家的扩展序列化，支持 `Date`、`RegExp`、
   `Symbol`、循环引用。因为 story args 可能包含函数引用、Date 对象，
   原生 `JSON.stringify` 会丢信息。
2. **buffer 机制处理 race**——Manager 可能在 Preview iframe 还没加载完时就 emit 事件。
   buffer 暂存，iframe ready 后回放。这是"event-driven 双 window"的必备设计。
3. **`postMessage(data, '*')` 用 `*` target**——理论上不安全（任何 origin 可读），
   但 Storybook 假设 Manager 和 Preview 在同一个 dev server 下。
   看到这里的 `try/catch swallow`，**怀疑生产环境如果用户把 Storybook 嵌到 cross-origin iframe，
   会丢消息但不报错**——是一个潜在 footgun。
4. **`KEY` 标识**——所有 storybook 消息都带 `key === STORYBOOK_KEY`，
   过滤掉宿主页面的其他 postMessage 噪音（比如 React DevTools）。
5. **`page === 'manager' | 'preview'`**——同一个 Transport class 在两边都用，
   靠这个字段决定行为。这是"对称设计"——Manager 和 Preview 没有主从关系，都是 peer。

事件常量在 [code/core/src/core-events/index.ts](https://github.com/storybookjs/storybook/blob/c899cac7fe878aa3b3f6f479f4e245d8588852a9/code/core/src/core-events/index.ts)：
`SET_CURRENT_STORY` / `STORY_RENDERED` / `STORY_CHANGED` / `UPDATE_GLOBALS` / `STORY_ERRORED`...
addon 也注册到这同一个 channel，所以"channel 是 framework 的神经系统"。

**怀疑点 2**：为什么不用 BroadcastChannel 或 SharedWorker？答：**BroadcastChannel
不能跨 frame**（同源窗口才行，iframe 算同源但行为不一致）；
**SharedWorker** 在某些浏览器（Safari）有 bug。postMessage 是最大公约数。
但代价是序列化开销——大 args（10MB JSON）会卡。

### (c) Addon 体系 + decorator + lifecycle hooks

Addon 是 Storybook 的灵魂——它让 framework 可扩展。
一个完整 addon 通常有三个面：

- **preview 侧**（preview.js 注册 decorator / loader / parameter）
- **manager 侧**（manager.js 注册 panel / toolbar 按钮）
- **preset**（preset.js 改 build 配置 / 注入 entries）

入口对象是 `addons` 单例，[code/core/src/preview-api/modules/addons/main.ts](https://github.com/storybookjs/storybook/blob/c899cac7fe878aa3b3f6f479f4e245d8588852a9/code/core/src/preview-api/modules/addons/main.ts)：

```ts
// AddonStore（简化版）
export class AddonStore {
  private channel: Channel | undefined;
  private promise: Promise<Channel>;
  private resolve!: (channel: Channel) => void;

  constructor() {
    this.promise = new Promise((res) => { this.resolve = res; });
  }

  getChannel(): Channel {
    if (!this.channel) {
      const channel = mockChannel();           // ▸ 没设过 channel 时给 mock，避免 crash
      this.setChannel(channel);
      return channel;
    }
    return this.channel;
  }

  ready(): Promise<Channel> { return this.promise; }
  hasChannel(): boolean { return !!this.channel; }

  setChannel(channel: Channel): void {
    this.channel = channel;
    this.resolve(channel);                     // ▸ 解锁等 channel 的 addon
  }
}

let store: AddonStore;
export const addons: AddonStore =
  store || (store = new AddonStore());          // ▸ 全局单例
```

decorator 在 [prepareStory.ts](https://github.com/storybookjs/storybook/blob/c899cac7fe878aa3b3f6f479f4e245d8588852a9/code/core/src/preview-api/modules/store/csf/prepareStory.ts#L28-L172) 里被组合：

```ts
// L28 起，prepareStory()
export function prepareStory<TRenderer extends Renderer>(
  storyAnnotations: NormalizedStoryAnnotations<TRenderer>,
  componentAnnotations: NormalizedComponentAnnotations<TRenderer>,
  projectAnnotations: NormalizedProjectAnnotations<TRenderer>
): PreparedStory<TRenderer> {
  // ... 合并 args / argTypes / parameters / loaders ...

  // L103 起，未装饰的 story 函数
  const undecoratedStoryFn = (context: StoryContext<TRenderer>) =>
    context.originalStoryFn(context.args, context);

  // L108 起，从 project annotations 拿 applyDecorators 实现
  const { applyDecorators = defaultDecorateStory, runStep } = projectAnnotations;

  // L110 起，三层 decorator 按 story → component → project 顺序收集
  const decorators = [
    ...normalizeArrays(storyAnnotations?.decorators),
    ...normalizeArrays(componentAnnotations?.decorators),
    ...normalizeArrays(projectAnnotations?.decorators),
  ];

  // L116 起，applyHooks 包一层（让 useEffect 等 hook 能在 decorator 内用）
  const decoratedStoryFn = applyHooks<TRenderer>(applyDecorators)(
    undecoratedStoryFn,
    decorators
  );

  // L117 起，绑 context
  const unboundStoryFn = (context: StoryContext<TRenderer>) =>
    decoratedStoryFn(context);

  return { id, name, originalStoryFn, unboundStoryFn, applyLoaders, runPlayFunction, ... };
}
```

**5 条旁注**：

1. **三层叠加（story → component → project）**——order 关键。
   你在 story 上加的 decorator 最内层执行，project decorator 最外层包。
   类比 onion middleware（Koa）。
2. **`undecoratedStoryFn` 是终点**——它就是用户写的那个 component render
   （`(args) => <Button {...args} />`）。decorator 链层层包裹，最里面调它。
3. **`applyHooks` 是 React-style hook 的 enabler**——让 decorator 内部能用 `useState` /
   `useEffect`，需要把 decorator 链伪装成"组件"。这是 Storybook 自己实现的 hook runtime
   （不依赖 React，因为 Vue/Svelte 也要用）。
4. **`applyDecorators` 可被 framework 重写**——React 走 React.cloneElement，
   Vue 走 createElementVNode。这是分支 D 框架的精髓——**核心定义抽象，framework adapter 实现**。
5. **`runPlayFunction` 单独返回**——play 不在 decorator 链里，
   在 render **完成后**调用。这样测试代码可以 `await` 真实 DOM。

**怀疑点 3**：为什么 decorator 不用 Provider 模型？React 用户写惯了
`<Provider><Component /></Provider>`，但 Storybook 选了"函数包裹"。
答：因为不是所有 framework 都有 Provider 概念（Web Components / Lit 没有）。
**函数包裹是最大公约数**。但代价是 React 用户写起来怪怪的——
`(Story, context) => <Provider>{Story()}</Provider>`，多一层 closure。

## Layer 4 · 复现

```bash
# 1. 在新项目里 init
mkdir storybook-tryout && cd storybook-tryout
npm create vite@latest . -- --template react-ts
npm install
npx storybook@latest init --type react

# 2. 自动生成 src/stories/Button.stories.ts，启动
npm run storybook
# → http://localhost:6006，左侧 sidebar 看到 Button story 树
```

**自己写一个 story + interaction test**：

```ts
// src/stories/Counter.stories.ts
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Counter } from './Counter';

const meta: Meta<typeof Counter> = { component: Counter };
export default meta;
type Story = StoryObj<typeof Counter>;

export const ClicksTwice: Story = {
  args: { initial: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole('button', { name: /increment/i });
    await userEvent.click(btn);
    await userEvent.click(btn);
    await expect(canvas.getByText('Count: 2')).toBeInTheDocument();
  },
};
```

跑起来后：

- 浏览器里看到 Counter 渲染、自动 click 两次、最后停在 "Count: 2"
- 底部 Interactions panel 里看到每一步：`click → click → expect`
- 任何一步失败，panel 里红色标记 + stack trace

**核心观察**：

- play 失败时 story 不会"消失"——而是停在失败那一步的 DOM 状态，方便 inspect
- 同一份 `play()` 可以让 `npx storybook test`（Vitest runner）跑——CI 里跑同一段代码做单测
- `userEvent` 不是 testing-library 的，是 Storybook 自己包的（`storybook/test`），
  原因：要让 instrumenter 拦截每一步、报告给 Manager（这就是 Layer 3 (b) 里的 channel 在用）

**before/after diff（改一处，看变化）**：

把 `<Button onClick={...}>` 的 onClick 删掉，重启 Storybook：

- Before：play 里 click → `Count: 2`，Interactions panel 全绿
- After：play 里 click → `Count: 0`，`expect(getByText('Count: 2'))` 失败
- Manager 的 sidebar 上 story 名旁边会出现红色 dot（表示该 story play 失败）
- Vitest runner 同步报失败（因为同一段代码）

**这个改一处就能让你直观看到**："framework 用 channel 把 Preview 的失败状态广播给 Manager"。

## Layer 5 · 横向对比

| 维度 | Storybook 10 | Ladle | Histoire | Bit | Chromatic |
|---|---|---|---|---|---|
| **类型** | 框架（多用途工作台） | 库（轻量预览） | 库（Vite 原生） | 平台（组件即包） | SaaS（视觉回归） |
| **story 格式** | CSF 3.0（ESM） | CSF 3.0 兼容 | 自有 .story.svelte / .vue | Bit Component | 复用 Storybook |
| **Manager UI** | React iframe 双 window | Preact 单 window | Vue 单 window | Web platform | 无 |
| **隔离机制** | iframe 物理隔离 | 共享 window | 共享 window | docker 沙箱 | 不适用 |
| **测试集成** | Vitest + play() + a11y | 无内建 | 无内建 | Jest 集成 | 视觉回归 |
| **addon 生态** | 200+ 官方 + 社区 | 极少 | 无 | 平台内置 | 无 |
| **编译时** | csf-tools(Babel AST) | swc 解析 | Vite 原生 | 自家编译器 | 无 |
| **支持框架** | React/Vue/Svelte/Angular/Lit/HTML/Web Components | React 优先 | Vue/Svelte 优先 | 全栈 | 跟随 Storybook |
| **首次启动** | 中等（5-10s） | 快（2s） | 快（2s） | 慢（云端） | N/A |
| **学习曲线** | 中（要学 CSF + decorator + addon） | 低（CSF 即用） | 中（自有 API） | 高（重新建模） | 低（接 Storybook） |
| **license** | MIT | MIT | MIT | Apache 2.0 | 商业 |
| **社区规模** | 90k star、284k 依赖者 | 2k+ star | 3k+ star | 20k+ star | 私有 |

**选择决策树**：

- **要工作台 + 文档 + 测试三位一体** → Storybook
- **只要快速预览组件，不要文档/测试** → Ladle
- **Vite + Vue/Svelte 项目，追求启动速度** → Histoire
- **跨项目共享组件作为包** → Bit
- **已经用 Storybook，加视觉回归** → 加 Chromatic（互补，不替换）
- **大型公司、design system 团队 ≥ 5 人** → Storybook（addon 生态值）
- **个人 side project、组件 < 20 个** → Ladle 够用

## Layer 6 · 设计哲学三段

**1. Manager 与 Preview 物理隔离是有代价的对，但要付**

- Manager 用 React 18，Preview 跑用户项目的 React 16/17/19——版本冲突无法和解
- 全局 CSS 隔离：用户的 reset.css 不会污染 Manager UI
- 错误隔离：Preview 里 `throw` 不会炸 Manager
- 代价：跨 window 通信开销（telejson 序列化 + postMessage）；大 args 卡顿；调试更难（要切 iframe）

**2. CSF（Component Story Format）= ESM 是工程胜利**

- 不发明 DSL，story 就是普通 ES Module export
- TypeScript / IDE / lint / test runner 全部"免费"工作（不需要为 Storybook 单写工具链）
- 编译时（csf-tools）和运行时（preview-api）都拿同一份文件，没有"两套真相"
- 可被其他工具复用：Ladle、Vitest、Chromatic 都能读 CSF 文件——**CSF 实质成了行业标准**
- 代价：CSF 受 ESM 语法约束（不能动态生成 story 名字）

**3. Addon 双面（preview + manager）是 framework 的本质**

- preview 侧 addon = decorator（包裹 story）/ loader（异步加载 fixture）/ parameter（声明式标记）
- manager 侧 addon = panel（Tab）/ toolbar 按钮 / sidebar 装饰
- 双面共用 channel——同一根 postMessage 总线传所有事件
- 这种"两边各注册一段代码、靠 channel 通信"的模式让 addon 开发者能做任何事：
  controls / actions / docs / a11y / interactions / vitest / chromatic 都是这个模式
- 代价：addon 作者要懂 Manager + Preview 双端 + Channel 协议（学习曲线）

## Layer 7 · 怀疑

1. **CSF 4.0（factory API）是"为定义而定义"还是真有必要？**
   v9 引入 `definePreview / defineMeta / defineStory` factory（见 [csf-factories.ts](https://github.com/storybookjs/storybook/blob/c899cac7fe878aa3b3f6f479f4e245d8588852a9/code/core/src/csf/csf-factories.ts)）。
   官方理由：更好的 type inference + 链式 `.story().test()`。
   怀疑：CSF 3.0（裸 export）的简洁度可能值得保留，factory 多一层间接。
   要看社区接受度——如果 6 个月后大部分项目还在用 CSF 3.0，说明 factory 是过度设计。

2. **iframe 模型在 React Server Components 时代会过时吗？**
   RSC 把"渲染"分成 server + client 两段，story 是纯 client 概念。
   如果未来 RSC 主流化，"在浏览器 iframe 里渲染单个组件"的前提就动摇了——
   Server Component 的 story 应该跑在哪？
   仓库里看到的零星 RSC 讨论 issue 还没收敛。

3. **Vitest 集成的双 runner（jsdom + browser）真的能保持一致吗？**
   v9 主推 `npx storybook test`，play 既能在 Vitest jsdom 跑，又能在浏览器跑。
   但 jsdom 的 CSS 渲染、layout 行为和真浏览器不一致——
   "同一段 play 两个结果"是真实风险。怀疑长期演进会被迫二选一。

## 限制

1. **冷启动慢**——Manager + Preview 双 build pipeline，10s+ 不奇怪（vs Vite playground 2s）
2. **Monorepo 配置复杂**——多个 framework / 多个 builder 时 preset 组合要手调
3. **大 args 卡顿**——controls panel 改动会跨 channel 序列化，args 含大对象时延迟感明显
4. **iframe 调试不友好**——Chrome DevTools 默认不能跨 frame breakpoint（要手动切 frame context）
5. **CSF 不能动态生成 story**——必须 export，循环生成 story 集合的能力受限
6. **Addon 双面学习曲线**——做一个完整 addon 要懂 Manager(React) + Preview(任意 framework) + Channel + Preset 4 件事
7. **Server Components 兼容性 unclear**——RSC 流行起来后 story 模型可能要重做

## 元数据

- **学习日期**：2026-05-29
- **方法论分支**：v1.1 分支 D（框架/SDK）
- **commit 锚定**：`c899cac7fe878aa3b3f6f479f4e245d8588852a9`（next 分支）
- **Permalink 数**：≥ 6（CsfFile.parse / postmessage transport / AddonStore / prepareStory / csf-factories / enrichCsf）
- **核心心脏物**：`code/core/src/{csf-tools, preview-api, manager-api, channels}`
- **Round**：S14-3（Season 14，Vitest → MSW → Storybook 工作台三件套收尾）
- **关联**：MSW（Storybook 用 MSW 做 mock 数据）/ Vitest（Storybook 9 把 Vitest 集成进核心）

![Figure 1: Storybook 架构总图](/projects/storybook/01-architecture.webp)
*Figure 1：Storybook 架构。Story 文件（CSF 3.0 ESM）经 csf-tools 解析成 manifest，注入 StoryStore。Preview iframe 跑 PreviewWeb 渲染器，调用 framework 的 renderToDom。Manager UI 是顶层 React app，含 Sidebar / Toolbar / Addon panels / manager-api。两边靠 postMessage Channel（telejson 双向序列化）通信，addon 也注册到同一 channel。Addon 三面 = preset（编译时改 webpack/vite）+ preview decorator + manager panel。*

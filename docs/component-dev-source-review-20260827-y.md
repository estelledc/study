# Component-dev source review (writer Y)

> 用途：记录 Storybook、Testing Library 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。仓库没有独立 `chromatic` 页，按并行 writer Y 约定回退到 `testing-library`。

## 范围与边界

- review date：2026-08-27
- writer：Y
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、Chromatic 视觉回归、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- chromatic：`src/content/docs/projects/` 下无 chromatic / chromaui 页；本文不新增该页，也不绑定 Chromatic 商业服务源码

## Storybook

- canonical source：`https://github.com/storybookjs/storybook`
- revision：`a2db7526e1538a48bfa0529a881822e8074b2009`
- package：`storybook@10.5.10`（目录 `code/core`）；同提交 `@storybook/addon-vitest@10.5.10`
- inspected：
  - `code/core/package.json`
  - `code/core/src/channels/index.ts`
  - `code/core/src/channels/main.ts`
  - `code/core/src/channels/postmessage/index.ts`
  - `code/core/src/manager/runtime.tsx`
  - `code/core/src/manager/container/Preview.tsx`
  - `code/core/src/csf/index.ts`
  - `code/core/src/csf/export-story.ts`
  - `code/core/src/csf/csf-factories.ts`
  - `code/core/src/preview-api/modules/store/csf/processCSFFile.ts`
  - `code/core/src/preview-api/modules/store/csf/prepareStory.ts`
  - `code/core/src/preview-api/modules/preview-web/render/StoryRender.ts`
  - `code/core/src/preview-api/modules/preview-web/render/mount-utils.ts`
  - `code/core/src/preview-api/modules/store/csf/portable-stories.ts`
  - `code/core/src/test/preview.ts`
  - `code/core/src/test/testing-library.ts`
  - `code/addons/vitest/package.json`
  - `code/addons/vitest/src/vitest-plugin/index.ts`
  - `MIGRATION.md`（Node 版本声明）
- observed：
  - `storybook@10.5.10` 的 npm `gitHead` 与 GitHub tag `v10.5.10` 均为 `a2db7526e1538a48bfa0529a881822e8074b2009`；源码树内 `code/core/package.json` 的 `gitHead` 字段是不可解析的占位值 `a8e7fd8a655c69780bc20b9749d2699e45beae1l`，不以它为准；
  - Manager 通过 `createBrowserChannel({ page: 'manager' })` 建通道；Preview 默认入口是 `iframe.html`；
  - 浏览器通道默认挂 `PostMessageTransport`，开发模式再追加 `WebsocketTransport`；`UniversalStore.__prepare` 按 `manager` / `preview` 分环境；
  - `PostMessageTransport` 用 `telejson` 的 `stringify`/`parse`，默认 `maxDepth: 25`，消息信封为 `{ key: 'storybook-channel', event, refId }`；manager 侧按 `iframe[data-is-storybook][data-is-loaded]` 找目标窗，本地预览框 id 为 `#storybook-preview-iframe`；
  - `processCSFFile` 同时接受 CSF3（`default` meta + named export）与 CSF factory（`isStory` / `definePreview`→`meta`→story）；`isExportStory` 排除 `__esModule`，并尊重 `includeStories`/`excludeStories`；
  - `prepareStory` 把 story/component 的 `play` 收成 `playFunction`，用 `mountDestructured`（解析 `play.toString()` 的解构参数）判断是否必须从 context 解构 `mount`；生命周期为 loaders → beforeEach → mount/renderToCanvas → play → afterEach（afterEach 逆序）；
  - `StoryRender` 在 `autoplay && forceRemount` 时跑 play；未解构 `mount` 却再调用 `context.mount` 会抛 `MountMustBeDestructuredError`；play 异常经 channel 发 `PLAY_FUNCTION_THREW_EXCEPTION`；
  - 核心 `storybook/test` 直接依赖并再导出 `@testing-library/dom` 与 `@testing-library/user-event`；`enhanceContext` loader 把 `context.canvas` 设为 `within(canvasElement)`，并在存在 `navigator.clipboard` 时执行 `userEvent.setup()`；
  - `@storybook/addon-vitest` 以 Vite/Vitest plugin 读 `.storybook` 配置、用 `vitestTransform` 把 stories 变成 Vitest 用例；peer 为 `vitest` / `@vitest/runner` `^3 || ^4`；
  - 同仓 `MIGRATION.md` 写明 Storybook 10 需要 Node.js 20.19+ 或 22.12+（`require(esm)`）。
- provenance note：
  - npm `storybook@10.5.10` 与 tag `v10.5.10` 指向同一提交，内部一致；
  - 源码 `gitHead` 字段损坏，不作为 provenance。

## Testing Library

- canonical source：`https://github.com/testing-library/dom-testing-library`
- revision：`225a3e4cfaa8f8046989d51b9051df507354b644`
- package：`@testing-library/dom@10.4.1`
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/config.ts`
  - `src/wait-for.js`
  - `src/query-helpers.ts`
  - `src/suggestions.js`
  - `src/queries/index.ts`
  - `src/queries/role.ts`
  - `src/events.js`
  - `src/role-helpers.js`
- observed：
  - 仓库 `package.json` 的 `version` 是 `0.0.0-semantically-released`；发布版本由 tag / npm 给出，绑定 `v10.4.1` / `@testing-library/dom@10.4.1`；
  - npm `gitHead` 与 GitHub tag `v10.4.1` 均为 `225a3e4cfaa8f8046989d51b9051df507354b644`；
  - `engines.node` 为 `>=18`；查询实现依赖 `aria-query@5.3.0` 与 `dom-accessibility-api`；
  - `waitFor` 默认 `asyncUtilTimeout=1000`、`interval=50`；真实时钟路径同时挂 `setInterval` 与 `MutationObserver`（观察 `subtree/childList/attributes/characterData`）；假时钟路径改走 `jest.advanceTimersByTime`；回调包在 `runWithExpensiveErrorDiagnosticsDisabled` 里；
  - `makeFindQuery` = `waitFor(() => getter(...))`，因此 `findBy*` 就是带超时的 `getBy*`；
  - `getSuggestedQuery` 优先级为 Role（跳过 `generic`）→ LabelText → PlaceholderText → Text → DisplayValue → AltText → Title → TestId；`testIdAttribute` 默认 `data-testid`；
  - `queryAllByRole` 用 `aria-query` 的角色表与隐式角色，`name` 过滤走 `computeAccessibleName`；
  - `fireEvent` 只 `dispatchEvent`；完整指针/键盘序列属于独立包 `@testing-library/user-event`，不在本仓。
- provenance note：
  - tag、npm `gitHead` 与可达提交一致；
  - 源码 `version` 字段不能当发布号。

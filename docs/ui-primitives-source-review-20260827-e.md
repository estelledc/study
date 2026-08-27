# UI primitives source review (writer E)

> 用途：记录 Radix UI、shadcn/ui 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer E
- evidence：GitHub metadata、npm latest 对照、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、Storybook、e2e、CLI、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Radix UI Primitives

- canonical source：`https://github.com/radix-ui/primitives`
- revision：`9aebdd45abd447b84092ecf20f8bcd27f2398c36`
- release：annotated tag `1.6.7` 解引用到该提交（"New release (#4079)"，2026-07-24）
- package：umbrella `radix-ui@1.6.7`；同提交中 `@radix-ui/react-dialog@1.1.23`
- inspected：
  - `package.json`、`philosophy.md`
  - `packages/react/radix-ui/package.json`
  - `packages/react/slot/src/slot.tsx`
  - `packages/react/primitive/src/primitive.tsx`
  - `packages/react/use-controllable-state/src/use-controllable-state.tsx`
  - `packages/react/dialog/src/dialog.tsx`
  - `packages/react/dialog/src/dialog.test.tsx`
  - `packages/react/presence/src/presence.tsx`
  - `packages/react/dismissable-layer/src/dismissable-layer.tsx`
  - `packages/react/context/src/create-context.tsx`
  - `packages/core/primitive/package.json`
- observed：
  - 仓库仍是 monorepo：`packages/react/*` 为独立 npm 包，`packages/core` 放非 React 工具（如 `@radix-ui/primitive`）；umbrella `radix-ui@1.6.7` 再导出全部 React 原语；
  - `philosophy.md` 仍把 1-to-1 DOM、无展示样式、受控/非受控双模和 `data-state` 写成硬原则；
  - `createSlot` 用 `cloneElement` + `mergeProps` 把 slot props 合到单一子元素；支持 `Slottable`、`React.lazy`（经 `React.use`）、以及 React 18/19 两套 ref 读取路径；非法多子节点会 throw；
  - `Primitive.*` 在 `asChild` 时走 Slot，否则渲染对应 HTML 标签；
  - `useControllableState` 以 `prop !== undefined` 判定受控；受控路径同步调用 `onChange`，非受控路径先 `useState` 再在 effect 里触发 `onChange`；DEV 下受控/非受控切换会 `console.warn`；
  - Dialog 主链为 `useControllableState` → `Presence` → `Portal` → `FocusScope` → `DismissableLayer`；Overlay 用 `react-remove-scroll` 并注册 `dismissableSurfaces`；`aria-labelledby`/`aria-describedby` 只在 Title/Description 实际挂载时设置；`WarningProvider` 已是 deprecated noop；
  - Presence 用 mounted / unmountSuspended / unmounted 状态机等待 CSS 退场动画；DismissableLayer 维护 layers 集合，处理 Esc、pointerdown-outside、focus-outside，并提供 `deferPointerDownOutside`；
  - peer 范围为 React / ReactDOM `^16.8 || ^17 || ^18 || ^19`。
- provenance note：
  - GitHub 仅见 annotated tag `1.6.7`；npm `@radix-ui/react-primitive` latest 为 `2.1.10`（2026-07-24），本页绑定 umbrella 与 tag 一致的 `1.6.7`，不把个别子包 latest 外推为 monorepo HEAD；
  - 旧正文的固定 11kb gzip、Title 空写仍 console.warn、以及未绑定 star / 收购年表，已由上述观察替换。

## shadcn/ui

- canonical source：`https://github.com/shadcn-ui/ui`
- revision：`1773ecfeeb4a04366978d353e69b5c7ded78dcb2`
- release：annotated tag `shadcn@4.19.0` 解引用到该提交（"chore(release): version packages (#11567)"，2026-08-21）
- package：`packages/shadcn` 的 `shadcn@4.19.0`；`engines.node >=20.18.1`；bin 为 Node CLI
- inspected：
  - 根 `package.json`、`packages/shadcn/package.json`
  - `packages/shadcn/src/index.ts`
  - `packages/shadcn/src/commands/add.ts`
  - `packages/shadcn/src/commands/init.ts`
  - `packages/shadcn/src/utils/add-components.ts`
  - `packages/shadcn/src/registry/schema.ts`
  - `packages/shadcn/src/registry/resolver.ts`
  - `packages/shadcn/src/registry/errors.ts`
  - `packages/shadcn/src/preset/preset.ts`
  - `packages/shadcn/src/utils/get-package-manager.ts`
  - `packages/shadcn/src/utils/transformers/transform-aschild.ts`
  - `apps/v4/registry/new-york-v4/ui/button.tsx`
  - `apps/v4/registry/new-york-v4/ui/dialog.tsx`
- observed：
  - CLI 表面为 `init` / `add` / `apply` / `diff` / `docs` / `view` / `search` / `migrate` / `eject` / `info` / `build` / `mcp` / `preset` / `registry`；组件本身不作为运行时 npm 包安装；
  - `add` 拉 registry JSON 后用 `registryItemSchema.parse`；`resolveRegistryTree` 递归展开 `registryDependencies`，再跑 Kahn 拓扑排序（环不抛错，剩余项追加到末尾）；随后按序 `updateDependencies` → `updateTailwindConfig` → `updateEnvVars` → `updateFonts` → `updateFiles` → `updateCss`；
  - `registries` 的 key 必须以 `@` 开头；未配置的 `@namespace` 抛 `RegistryNotConfiguredError`；
  - `PRESET_BASES` 为 `radix` / `base` / `aria`；`base-` 风格会把 `asChild` 改写成 Base UI 的 render 形态；官方 `new-york-v4` 模板从 umbrella `radix-ui` 导入 Dialog/Slot，不再写 `@radix-ui/react-dialog`；
  - `init` 在缺少显式 style 时仍可回落到 `"new-york"`；另有 nova/vega/maia 等 named preset；
  - 包管理器探测含 npm / yarn / pnpm / bun / deno，但 CLI 自身仍是 Node 可执行文件；
  - `--overwrite` 与交互确认决定是否覆盖已有文件；`--dry-run` 只预览。
- provenance note：
  - npm `shadcn@4.19.0` 与 GitHub release / 解引用提交一致；
  - 旧正文的 “New York + Slate 是唯一默认”“CLI 不支持 bun/Deno 装依赖”“v4 假设 React 19 才会丢 ref”“固定 64 行 button / 115k stars” 在该 revision 无法按原样绑定，已由上述观察替换。

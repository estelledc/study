# Component library source review (writer AS)

> 用途：记录 Chakra UI 与 Mantine 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：AS
- evidence：GitHub metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、Storybook、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Chakra UI

- canonical source：`https://github.com/chakra-ui/chakra-ui`
- revision：`f8133940accf0b7de1f7c9ac4aca37e9be5e2027`
- annotated tag：`@chakra-ui/react@3.36.1` → tag object `f17650ed2afb0408596ca21de704baf9521dc1ac`
- package：`@chakra-ui/react@3.36.1`
- inspected：
  - `packages/react/package.json`
  - `packages/react/src/index.ts`
  - `packages/react/src/preset.ts`
  - `packages/react/src/preset-base.ts`
  - `packages/react/src/styled-system/system.ts`
  - `packages/react/src/styled-system/provider.tsx`
  - `packages/react/src/styled-system/factory.tsx`
  - `packages/react/src/styled-system/conditions.ts`
  - `packages/react/src/styled-system/create-slot-recipe-context.tsx`
  - `packages/react/src/components/button/button.tsx`
  - `packages/react/src/components/dialog/dialog.tsx`
  - `packages/react/src/components/dialog/namespace.ts`
- observed：
  - `createSystem` merges configs, builds token CSS variables (`prefix=chakra`, root `:where(:root, :host)`), CVA recipes and SVA slot recipes;
  - `ChakraProvider` is strict and requires a `value: SystemContext`; it injects Emotion `Global` for layers and `_global` CSS;
  - there is no ColorModeProvider in this package; `_dark` resolves to `.dark &, .dark .chakra-theme:not(.light) &`;
  - interactive compounds wrap `@ark-ui/react@5.37.2`; `Dialog.Root` defaults `lazyMount` and `unmountOnExit` to true;
  - `Button` uses recipe context, sets `type="button"`, and disables the control while `loading` is true;
  - peers are `@emotion/react>=11` and `react>=18`.

## Mantine

- canonical source：`https://github.com/mantinedev/mantine`
- revision：`8a284e2c2c53a9cb6f39f5dc389bf41b7a2073f8`
- lightweight tag：`9.5.2`
- package：`@mantine/core@9.5.2`（同提交 `@mantine/form@9.5.2`）
- inspected：
  - `package.json`
  - `packages/@mantine/core/package.json`
  - `packages/@mantine/core/src/core/MantineProvider/MantineProvider.tsx`
  - `packages/@mantine/core/src/core/MantineProvider/create-theme/create-theme.ts`
  - `packages/@mantine/core/src/core/MantineProvider/merge-mantine-theme/merge-mantine-theme.ts`
  - `packages/@mantine/core/src/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.tsx`
  - `packages/@mantine/core/src/core/MantineProvider/default-theme.ts`
  - `packages/@mantine/core/src/core/factory/factory.tsx`
  - `packages/@mantine/core/src/core/styles-api/use-styles/use-styles.ts`
  - `packages/@mantine/core/src/components/Button/Button.tsx`
  - `packages/@mantine/form/package.json`
  - `packages/@mantine/form/src/use-form.ts`
  - `packages/@mantine/form/src/schema-resolver.ts`
- observed：
  - `@mantine/core` ships CSS entry points (`styles.css` / `styles.layer.css`) and marks `*.css` as side effects;
  - peers are `react^19.2.0`, `react-dom^19.2.0` and `@mantine/hooks@9.5.2`; Emotion is not a core dependency;
  - `createTheme` is an identity helper; `MantineThemeProvider` merges overrides onto `DEFAULT_THEME` via `mergeMantineTheme` and validates `primaryColor` / `primaryShade`;
  - default theme uses `primaryColor: blue`, `primaryShade: { light: 6, dark: 8 }`, `defaultRadius: md`;
  - color scheme defaults to `light` and `localStorageColorSchemeManager`; `forceColorScheme` bypasses the manager;
  - `HeadlessMantineProvider` skips CSS variables and static classes;
  - `useStyles` assembles static `mantine-{Name}-{selector}` classes, theme component overrides and CSS variables;
  - `useForm` defaults to `mode: 'controlled'`; `schemaResolver` talks to Standard Schema via `schema['~standard'].validate`.

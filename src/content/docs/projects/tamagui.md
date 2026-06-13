---
title: Tamagui — 跨平台 React / React Native 样式与 UI 系统
来源: https://github.com/tamagui/tamagui
日期: 2026-06-13
分类: 后端 API
子分类: 移动端
provenance: pipeline-v3
---

## 是什么

Tamagui 是一套面向 **React Web + React Native** 的跨平台 UI 基础设施：底层是类型安全的样式库（`@tamagui/core`），上层是可选的组件库（`tamagui`），中间还夹着一台**可选的优化编译器**（`@tamagui/static`），把你在 JSX 里写的样式尽量「压扁」成平台原生能直接吃的形式。

日常类比：你要同时装修**手机 App 店面**和**网页旗舰店**，传统做法是请两拨设计师各画一套图纸——改个按钮颜色，两边各改一遍，还容易风格走样。Tamagui 像一家「连锁装修总部」：先定好**品牌色板、间距标尺、灯光主题**（tokens + themes），再发一套**标准货架和收银台组件**（Button、Card、Input…），最后配一台**自动施工图机器**（compiler）——Web 端把复杂组件树压成 `div` + 原子 CSS，原生端把样式对象提前算好挂到 `View` 上，两边看起来一致，跑起来也不拖后腿。

它和 React Native Web、NativeWind 的关系：

| 技术 | 定位 |
|------|------|
| React Native Web | 让 RN 组件能在浏览器渲染——**兼容层** |
| NativeWind | 在 RN 上用 Tailwind class 写样式——**样式工具** |
| Tamagui | 设计 tokens + 主题 + 组件 + 编译优化——**完整设计系统** |

官方推荐用脚手架起步：

```bash
npm create tamagui@latest
```

当前主版本为 **Tamagui 2.x**（2026 年初 GitHub 最新 release 约 v2.1.0），强调更稳定的编译器、Web-first 的 `Input`、以及可混用的动画驱动（`animatedBy`）。

## 为什么重要

不理解 Tamagui，以下问题很难答清楚：

- **「一套代码三端」为什么常常牺牲性能？** —— 抽象层叠太多（styled-components、CSS-in-JS runtime、RN Web 转换）会让 Web bundle 膨胀、原生端 re-render 变多。Tamagui 用编译期**树扁平化（tree flattening）**和**部分求值（partial evaluation）**把抽象拆掉
- **主题切换为什么很多库会闪一下？** —— 运行时改 context 会触发子树重渲染。Tamagui 把主题编译成 CSS 变量（Web）或静态样式对象（Native），切换时尽量不走 React 更新路径
- **和 Tamagui 竞争的还有谁？** —— Gluestack UI、NativeWind + 自建组件、React Native Paper 等。Tamagui 的差异化是 **compiler + 完整 token/theme 体系 + 100% RN 样式 API 超集**
- **编译器是必装的吗？** —— 不是。Tamagui 在**无插件**时也能跑；官方建议开发期先不装，上线前再开 Babel/Metro/Vite 插件做最后一档加速

## 核心概念

Tamagui 可以拆成四层来记：

### 1. Core：跨平台样式原语

`@tamagui/core` 提供 `View`、`Text`、`Stack`（`XStack` / `YStack` / `ZStack`）等基础视图，以及 `styled()` 工厂。样式 props 是 React Native Style API 的**类型化超集**，并支持：

- **Token 引用**：`padding="$4"`、`color="$blue10"`
- **主题引用**：`backgroundColor="$background"`（随 `<Theme>` 变化）
- **响应式 props**：`$sm={{ padding: '$2' }}`（编译为 media query 或原生条件样式）
- **伪状态**：`hoverStyle`、`pressStyle`、`focusStyle`

### 2. Tokens：设计常量（不会动态变的 CSS 变量）

用 `createTokens` 定义 `size`、`space`、`radius`、`color`、`zIndex` 等。类比连锁店的**全国统一尺码表**——S/M/L 编号全店通用，不会今天 S 是 36 明天变 38。

```tsx
const tokens = createTokens({
  size: { sm: 8, md: 12, lg: 20 },
  space: { sm: 4, md: 8, lg: 12 },
  color: { white: '#fff', black: '#000' },
})
```

组件里写 `width="$md"`，TypeScript 会校验 token 名是否存在。

### 3. Themes：可沿组件树覆盖的语义色

Themes 像**按区域切换的灯光方案**：大堂用暖光（`light`），VIP 室用冷光（`dark`），还能嵌套子主题 `dark_blue`。子组件读 `$background`、`$color` 等语义键，而不是硬编码 hex。

Theme 值优先；找不到时回退到 `tokens.color` 同名项——类似 CSS 变量作用域覆盖全局变量。

### 4. Compiler：前端「不可能三角」的妥协方案

Tamagui 文档把跨平台 UI 的困境叫 **Frontend Trilemma**（来自 Nathan Curtis 的跨平台讨论）：

1. **只写一次，到处跑**（共享代码）
2. **像原生一样快**（性能）
3. **开发体验好**（inline style、主题、响应式随手写）

传统方案通常只能三选二。Tamagui 的编译器在构建期做四件事：

| 优化 | 效果 |
|------|------|
| 原子 CSS 提取 | Web 端样式变 class，减小 JS |
| 部分求值与提升 | 把能算死的样式从运行时挪到构建期 |
| 树扁平化 | `styled(YStack)` 可能直接变成 `div` / `View` |
| 媒体查询 / 主题求值 | `useMedia`、`useTheme` 逻辑尽量编译掉 |

Tamagui 官网首页约 55 个内联 styled 组件里，有 49 个被压扁成原生 `div`；开编译器后 Lighthouse 分数约提升 15%（官方 benchmark，实际项目因复杂度而异）。

### 5. UI Kit：开箱即用的组件

`tamagui` 包提供 `Button`、`Input`、`Sheet`、`Dialog`、`Avatar` 等，支持 **compound component** API（如 `Button.Icon`）、`size` / `theme` prop、以及 `Adapt`  primitive——同一组件在 Web 弹 Dialog、在 Native 弹 Sheet，代码路径可合并。

## 从零配置（最小可运行）

**1. 安装**

```bash
npm install tamagui @tamagui/config
# 可选：编译器
npm install --save-dev @tamagui/babel-plugin
```

**2. 配置文件 `tamagui.config.ts`**

推荐先用官方预设 `@tamagui/config/v5`，再按需覆盖：

```tsx
import { defaultConfig } from '@tamagui/config/v5'
import { animations } from '@tamagui/config/v5-css' // Tamagui 2：动画需单独导入
import { createTamagui } from 'tamagui'

export const config = createTamagui({
  ...defaultConfig,
  animations,
  media: {
    ...defaultConfig.media,
    // 自定义断点
    tablet: { maxWidth: 1024 },
  },
})

type Conf = typeof config
declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
```

**3. 根组件包裹 Provider**

```tsx
import { TamaguiProvider, YStack, Text } from 'tamagui'
import { config } from './tamagui.config'

export default function App() {
  return (
    <TamaguiProvider config={config} defaultTheme="light">
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
        <Text fontSize="$6" color="$color">
          你好，Tamagui
        </Text>
      </YStack>
    </TamaguiProvider>
  )
}
```

**4. 启用编译器（可选，生产阶段）**

Metro（Expo）示例——在 `babel.config.js` 中加入：

```js
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './tamagui.config.ts',
          logTimings: true,
        },
      ],
    ],
  }
}
```

Vite / Webpack 有对应插件；暂不支持 Turbopack 时可用 `@tamagui/cli` 预编译。

## 实践案例

### 案例 1：styled 组件 + 主题嵌套

用 `styled()` 定义可复用按钮，颜色全部走 theme token，换主题不用改组件内部：

```tsx
import { styled, Theme, YStack, Text, Button } from 'tamagui'

const PrimaryButton = styled(Button, {
  name: 'PrimaryButton',
  backgroundColor: '$blue10',
  color: '$blue1',
  borderRadius: '$4',
  paddingHorizontal: '$4',
  paddingVertical: '$2',

  hoverStyle: {
    backgroundColor: '$blue9',
  },
  pressStyle: {
    backgroundColor: '$blue8',
    scale: 0.97,
  },

  variants: {
    size: {
      sm: { paddingVertical: '$1', fontSize: '$2' },
      lg: { paddingVertical: '$3', fontSize: '$5' },
    },
  } as const,

  defaultVariants: {
    size: 'sm',
  },
})

export function SettingsScreen() {
  return (
    <YStack padding="$4" gap="$3" backgroundColor="$background">
      <Text fontSize="$6" fontWeight="600" color="$color">
        设置
      </Text>

      {/* 默认 light 主题 */}
      <PrimaryButton size="lg">保存</PrimaryButton>

      {/* 局部切到 dark 子主题，不影响外层 */}
      <Theme name="dark">
        <PrimaryButton>深色模式预览</PrimaryButton>
      </Theme>
    </YStack>
  )
}
```

要点：

- `name: 'PrimaryButton'` 让该组件可以绑定**组件级主题**（进阶用法）
- `variants` 是 Tamagui 的变体系统，类似 CVA（class-variance-authority）但跨平台
- `hoverStyle` / `pressStyle` 在 Web 走 CSS 伪类，在 Native 走 Pressable 状态——同一套 API

### 案例 2：响应式布局 + UI Kit 表单

下面示例展示 `$gtSm` 响应式 prop（大于 sm 断点时生效）和 Tamagui 2 的 Web-first `Input`：

```tsx
import { useState } from 'react'
import {
  XStack,
  YStack,
  Input,
  Label,
  Button,
  H2,
  Paragraph,
  Separator,
} from 'tamagui'

export function LoginCard() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <YStack
      maxWidth={400}
      width="100%"
      padding="$4"
      gap="$3"
      borderRadius="$4"
      backgroundColor="$background"
      borderWidth={1}
      borderColor="$borderColor"
      // 宽屏时加大内边距——编译器可提取为 @media (min-width: …)
      $gtSm={{ padding: '$6' }}
    >
      <H2 color="$color">登录</H2>
      <Paragraph color="$color11" size="$3">
        同一套表单在 iOS、Android、Web 复用
      </Paragraph>

      <Separator />

      <YStack gap="$2">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          placeholder="you@example.com"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          size="$4"
        />
      </YStack>

      <YStack gap="$2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          placeholder="••••••••"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          size="$4"
        />
      </YStack>

      <XStack gap="$2" marginTop="$2">
        <Button flex={1} chromeless>
          注册
        </Button>
        <Button flex={1} theme="active">
          登录
        </Button>
      </XStack>
    </YStack>
  )
}
```

Tamagui 2 的 `Input` 允许写标准 HTML 属性（`autoComplete`、`id`），在 Native 端自动映射为 RN 等价 props——减少 `#ifdef web` 式分支代码。

### 案例 3：Adapt — 同一 Dialog，Web 弹窗 / 手机 Sheet

`Adapt` 是 Tamagui 的「场景切换器」：大屏走 Dialog 居中弹窗，触屏小屏自动换成底部 Sheet——像同一份菜单，堂食用托盘、外卖用打包盒，后厨只炒一次菜。

Tamagui 2 起，`Popover.Sheet` 子组件已拆成独立的 `Sheet`；动画 prop 从 `animation` 改为 `transition`：

```tsx
import { useState } from 'react'
import {
  Adapt,
  Button,
  Dialog,
  Sheet,
  Paragraph,
  XStack,
  YStack,
} from 'tamagui'

export function ConfirmDelete({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button theme="red" onPress={() => setOpen(true)}>
        删除账户
      </Button>

      <Dialog modal open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            key="overlay"
            transition="lazy"
            opacity={0.5}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content bordered elevate key="content" gap="$4" padding="$4">
            <Dialog.Title>确认删除？</Dialog.Title>
            <Paragraph>此操作不可撤销，所有数据将被清除。</Paragraph>
            <XStack gap="$3" justifyContent="flex-end">
              <Dialog.Close asChild>
                <Button chromeless>取消</Button>
              </Dialog.Close>
              <Button theme="red" onPress={onConfirm}>
                确认删除
              </Button>
            </XStack>

            {/* 触屏 / 窄屏：内容自动「搬进」Sheet */}
            <Adapt when="max-md" platform="touch">
              <Sheet modal dismissOnSnapToBottom>
                <Sheet.Overlay transition="quick" />
                <Sheet.Handle />
                <Sheet.Frame padding="$4" gap="$4">
                  <Adapt.Contents />
                </Sheet.Frame>
              </Sheet>
            </Adapt>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  )
}
```

Native 端建议在入口文件提前 import 官方 setup，否则 Portal / 手势可能异常：

```tsx
import '@tamagui/native/setup-teleport'        // Dialog / Sheet 挂载
import '@tamagui/native/setup-gesture-handler' // Sheet 拖拽更顺滑
```

## 与相关技术怎么选

| 场景 | 建议 |
|------|------|
| 已有 Expo + Tailwind 习惯，只要样式工具 | NativeWind 更轻 |
| 要从零建设计系统 + 三端组件库 | Tamagui 更完整 |
| 只要 Material Design 风格安卓/iOS | React Native Paper |
| 已有大量 RN Web 代码，想渐进增强 | 先 `@tamagui/core` 只替换样式层，再逐步引入 UI kit |

Tamagui **不替代** React Native 或 Expo——它站在 RN 组件模型之上。Web 端底层仍依赖 RN Web 的语义（flex 默认纵向、`Text` 包裹文字等），所以同时理解 [React Native Web](./react-native-web.md) 会少踩很多坑。

## 常见坑与排查

1. **类型提示不出来**：`tamagui.config.ts` 里必须 `declare module 'tamagui' { interface TamaguiCustomConfig … }`，且 Provider 只在根入口 import 一次 config，避免热更新循环引用。

2. **Web-only 项目也要装 `react-native` 类型**：当前 prop 自动完成依赖 `@types/react-native` 或 workspace 里的 `react-native` 类型包——运行时 Web bundle 不一定会打进 RN 本体。

3. **编译器没生效**：默认只优化 `components` 配置里列出的模块（通常是 `tamagui` 包和你自己的 `components/` 目录）。App 目录里临时写的 `styled()` 可能仍走运行时插入——把共享组件抽到独立目录。

4. **主题闪烁（FOUC）**：SSR 场景检查 `settings.disableSSR`、确保服务端与客户端 `defaultTheme` 一致；Web 端用编译后的 CSS 变量可避免 hydration 后改色。

5. **动画平台差异**：Tamagui 2 把 `animation` 统一改名为 `transition`；可用 `animatedBy` 按组件选择 Reanimated / CSS / Moti 驱动，编译器据此做更好优化。配置里别忘了 `import { animations } from '@tamagui/config/v5-css'` 并传给 `createTamagui`。

## 学习路径建议

1. **第一天**：`npm create tamagui@latest` 跑通 starter → 改 `tamagui.config` 里的一个 color token → 观察组件变化
2. **第二天**：读 `styled` + `variants` 文档，把页面里两个重复按钮抽成 styled 组件
3. **第三天**：加 `Theme` 嵌套实现 dark mode，用 `$gtSm` 做一个响应式两栏布局
4. **上线前**：按 [Compiler 文档](https://tamagui.dev/docs/intro/compiler-install) 接入 Babel/Metro 插件，对比 bundle 体积与 Lighthouse

## 小结

Tamagui 解决的不是「能不能跨平台」，而是「跨平台之后**还像原生、还好维护**」。记住这张心智图：

```
tokens（全局常量）→ themes（语义配色，可嵌套）→ styled / UI 组件（开发体验）
                                    ↓
                          compiler（构建期压扁抽象）
                                    ↓
              Web: div + atomic CSS    Native: View + 提升后的 style 对象
```

如果你在做 Expo / Next.js + RN Web 的共享 UI 层，Tamagui 值得作为**默认候选**认真评估一轮；若项目只需几个跨端页面，先用 NativeWind 或纯 RN Web 也完全合理。

## 参考链接

- 官网与文档：https://tamagui.dev
- GitHub：https://github.com/tamagui/tamagui
- 为什么需要编译器：https://tamagui.dev/docs/intro/why-a-compiler
- 配置指南：https://tamagui.dev/docs/core/configuration
- Tamagui 2 发布公告：https://tamagui.dev/blog/version-two

---
title: gluestack-ui — 跨平台 React 组件库
来源: https://github.com/gluestack/gluestack-ui
日期: 2026-06-13
分类: 项目/前端
子分类: 移动端跨平台
provenance: pipeline-v3
---

## gluestack-ui 是什么

gluestack-ui 是一个开源的跨平台 React / React Native 组件库，由 GeekyAnts 团队开发和维护。MIT 协议，完全免费，商用无忧。

核心特征可以概括为三个关键词：**copy-paste、跨平台、Tailwind**。

**copy-paste 架构**：不需要 `npm install` 一个庞大的组件包。你需要什么组件（按钮、输入框、弹窗等），直接从官方文档里把源码复制到你的项目文件夹里。组件就在你的代码里，想怎么改就怎么改，不会因为库升级而崩溃，也不会打包进用不到的死代码。

**跨平台**：同一套组件代码，可以在网页（React Web）、手机 App（React Native / Expo）上运行。不需要为每个平台写两遍不同的 UI 代码。以 Box 组件为例，在 Web 上它渲染成 `<div>`，在手机上渲染成 `<View>`——你不需要手动判断平台。

**Tailwind CSS + NativeWind 统一样式**：网页端用 Tailwind CSS 写 `className`，手机端用 NativeWind 解析同样的 class 语法。同一个 `className="bg-blue-500 rounded-full"` 在两端都生效。gluestack-ui 还内置了设计 token（如 `text-typography-900`、`bg-background-0`），自动适配亮色/暗色模式。

v3 版本（2025 年发布）支持 Next.js 15 + RSC（React Server Components）、Expo SDK 53，提供 126+ 组件。项目拥有 100 多位贡献者、15.6k+ 次提交，社区活跃度很高。

## 日常类比：买家具 vs 自己做家具

想象你要装修一套房子。方案 A：自己锯木头、钉钉子、刷油漆——每间房花很久，风格还不统一。方案 B：买现成的门窗、地板、橱柜模块，按自己喜好拼装——快且一致。

组件库就是 UI 界的"预制建材"。它提供按钮、输入框、弹窗、卡片等基础零件，你像搭积木一样把它们拼起来就能搭出完整界面。

gluestack-ui 相当于这样一家建材商：它的产品目录不是让你"买一整套回家"（npm install），而是"你需要什么就从货架上拿什么"（copy-paste）。而且这些建材不管用在哪里——网页、iPhone、Android——安装方法完全一样。就像同一套乐高积木，不管搭在桌子上还是地板上，拼法不变。

## 为什么重要

gluestack-ui 解决了跨平台 UI 开发的三个核心痛点：

**痛点 1：Web 和 Native 两套代码**

传统做法：网页用一套组件库（比如 Material UI），手机用另一套（比如 React Native Paper）。两套 API 不一样，设计语言不同步，改一处就要改两处。gluestack-ui 用一套组件处理两端——`<Button>` 在 Web 渲染成 `<button>`，在手机上渲染成 `<Pressable>`，但你的代码只写一次。

**痛点 2：组件库的 vendor lock-in（供应商锁定）**

大多数组件库通过 npm 安装。升级可能 break 你的代码，想改组件内部行为得 hack 或提 PR。gluestack-ui 把源码直接放在你的项目里——你是组件的主人，不是组件的租户。

**痛点 3：样式系统学习成本**

每个组件库都有自己的样式方案——styled-components、emotion、style props、theme objects……换一个库就要重新学一套。gluestack-ui 用 Tailwind CSS，这是一个已经被数百万开发者验证过的工具类 CSS 方案，学习一次，到处能用。NativeWind 让同一套 Tailwind class 在手机上也能工作。

总结：gluestack-ui 把前端社区两个最大的趋势——**Tailwind 工具类样式**和**跨平台代码复用**——打了个漂亮的组合拳。

## 核心要点

### 1. Compound Component 模式（复合组件）

传统思路：一个按钮就是 `<Button label="提交" icon={SearchIcon} />`，所有配置通过 props 传入。

gluestack-ui 的思路：按钮是由多个子组件自由拼装的：

```tsx
<Button>
  <ButtonIcon as={SearchIcon} />
  <ButtonText>搜索</ButtonText>
</Button>
```

类比：就像一个三明治，你可以自由决定放几片火腿、加不加芝士。每个子组件独立，组合在一起就是一个完整的按钮。

常见子组件关系：
- `Button` > `ButtonText` / `ButtonIcon` / `ButtonSpinner`
- `Modal` > `ModalBackdrop` / `ModalContent` / `ModalBody` / `ModalFooter`
- `Input` > `InputField` / `InputSlot` / `InputIcon`
- `Checkbox` > `CheckboxIndicator` / `CheckboxIcon` / `CheckboxLabel`

### 2. Factory 函数（工厂模式）

每个组件背后都是 `createX` 工厂函数。你给它基础零件，它帮你组装成完整组件，自动处理好交互状态：

```
createButton({ Root: Pressable, Text: Text, Icon: Icon })
  → Button 自动处理点击、悬停、焦点、键盘导航、ARIA 无障碍
  → Button.Text 自动读取 Button 的当前状态（按下？禁用？）
  → Button.Icon 自动继承 Button 的颜色和尺寸
```

源码结构（以 Button 为例）：
- `creator/index.tsx` — 工厂函数入口
- `creator/Button.tsx` — 主包裹器，管理状态和 context
- `creator/ButtonText.tsx` — 文字子组件
- `creator/Context.tsx` — React Context 在父子组件间共享状态
- `creator/types.ts` — TypeScript 类型定义

### 3. Tailwind / NativeWind 样式系统

Tailwind 的核心思想：样式直接写在标签上，每个 class 只做一件事。不用在 `.css` 文件和 HTML 之间跳来跳去：

```tsx
// 蓝色胶囊形按钮，悬停时变深
<Button className="bg-blue-500 rounded-full hover:bg-blue-600">
  <ButtonText>点击</ButtonText>
</Button>
```

- `bg-blue-500` = 背景蓝色；`rounded-full` = 完全圆角
- `hover:bg-blue-600` = 鼠标悬停时变深蓝
- `data-[hover=true]:bg-blue-600` = 组件内部 hover 状态时变深蓝

NativeWind 让同一套 Tailwind class 在 React Native 上也能用。不用学两套。

gluestack-ui 内置的设计 token 预设了完整的颜色体系：typography（文字色）、background（背景色）、outline（边框色），每种颜色从 0（最浅）到 950（最深）分 11 档。自动适配亮色/暗色模式。

### 4. GluestackUIProvider（全局配置）

在应用根组件外包裹 Provider，注入主题配置：

```tsx
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import '@/global.css';

export default function App() {
  return (
    <GluestackUIProvider>
      {/* 所有页面和组件 */}
    </GluestackUIProvider>
  );
}
```

`npx gluestack-ui init` 会自动配置好 tailwind.config.js、babel.config.js、metro.config.js、global.css、tsconfig.json 等所有必需文件。

### 5. 三种样式变体

每个组件有三种"穿衣风格"：

| 变体 | 说明 | 适用场景 |
|------|------|----------|
| NativeWind | Tailwind class 写样式（推荐） | 大多数项目 |
| Themed | gluestack 设计 token 变量 | 想用内置设计系统的项目 |
| Unstyled | 完全裸组件，无预设样式 | 完全自定义设计系统 |

## 实践案例

### 案例 1：完整的登录表单

这个例子展示了 10 种 gluestack-ui 组件如何协作——输入框、密码显示/隐藏、复选框、按钮：

```tsx
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { Button, ButtonText } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { Checkbox, CheckboxIcon, CheckboxIndicator, CheckboxLabel } from '@/components/ui/checkbox';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Input, InputField, InputSlot, InputIcon } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { EyeIcon, EyeOffIcon, CheckIcon } from '@/components/ui/icon';
import React from 'react';

export default function LoginScreen() {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <GluestackUIProvider>
      <Center className="flex-1 p-6">
        <VStack className="rounded-xl border border-outline-200 bg-background-0 p-6 w-full max-w-[336px]">
          <Heading>Log in</Heading>
          <Text className="mt-2">Login to start using gluestack</Text>

          <Text className="mt-4">Email</Text>
          <Input>
            <InputField type="text" placeholder="Enter your email" />
          </Input>

          <Text className="mt-6">Password</Text>
          <Input>
            <InputField
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
            />
            <InputSlot onPress={() => setShowPassword(!showPassword)} className="mr-3">
              <InputIcon as={showPassword ? EyeIcon : EyeOffIcon} />
            </InputSlot>
          </Input>

          <HStack className="justify-between my-5">
            <Checkbox value="" size="sm">
              <CheckboxIndicator>
                <CheckboxIcon as={CheckIcon} />
              </CheckboxIndicator>
              <CheckboxLabel>Remember me</CheckboxLabel>
            </Checkbox>

            <Button variant="link" size="sm">
              <ButtonText className="underline underline-offset-1">
                Forgot Password?
              </ButtonText>
            </Button>
          </HStack>

          <Button className="w-full" size="sm">
            <ButtonText>Log in</ButtonText>
          </Button>
        </VStack>
      </Center>
    </GluestackUIProvider>
  );
}
```

关键点解读：
- `Center` 居中容器，`flex-1` 占满空间
- `VStack` 纵向排列，`space-*` 控制子元素间距
- `HStack` 横向排列，`justify-between` 两端对齐
- `InputSlot` + `InputIcon` 在输入框右侧放可点击图标
- `React.useState` 控制密码的显示/隐藏切换
- 所有颜色用设计 token（`bg-background-0`、`text-typography-500`、`border-outline-200`），自动适配暗色模式

### 案例 2：按钮的多种状态和组合

展示 Button 的复合子组件、ButtonGroup 粘合、加载状态：

```tsx
import {
  Button, ButtonText, ButtonIcon, ButtonGroup, ButtonSpinner,
} from '@/components/ui/button';
import { ArrowUpIcon, PlusIcon, TrashIcon } from '@/components/ui/icon';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';

function ButtonShowcase() {
  return (
    <VStack space="xl">
      {/* 基本按钮：文字 + 图标 */}
      <Button
        size="sm"
        className="bg-blue-500 data-[hover=true]:bg-blue-600 rounded-full"
      >
        <ButtonText className="font-medium text-white">回到顶部</ButtonText>
        <ButtonIcon as={ArrowUpIcon} className="h-3 w-3 text-white ml-1" />
      </Button>

      {/* 纯图标按钮 */}
      <HStack space="md">
        <Button size="sm" className="rounded-full w-9 h-9">
          <ButtonIcon as={PlusIcon} className="text-white" />
        </Button>
        <Button size="sm" action="negative" className="rounded-full w-9 h-9">
          <ButtonIcon as={TrashIcon} className="text-white" />
        </Button>
      </HStack>

      {/* ButtonGroup：粘连按钮组（分页器） */}
      <ButtonGroup isAttached={true}>
        <Button action="secondary" variant="outline" className="rounded-r-none">
          <ButtonText>上一页</ButtonText>
        </Button>
        <Button action="secondary" variant="outline" className="rounded-l-none">
          <ButtonText>下一页</ButtonText>
        </Button>
      </ButtonGroup>

      {/* 禁用 + 加载状态 */}
      <Button isDisabled={true} className="bg-blue-400">
        <ButtonSpinner className="text-white" />
        <ButtonText className="text-white ml-2">提交中...</ButtonText>
      </Button>
    </VStack>
  );
}
```

关键点解读：
- `data-[hover=true]:bg-blue-600` 是 Tailwind 的 data 属性选择器，自动响应组件内部 hover 状态，不需要手动写事件处理
- `ButtonGroup isAttached={true}` 粘合按钮，`rounded-r-none` / `rounded-l-none` 去除中间圆角，形成连续按钮条
- `action="negative"` 语义动作，红色表示删除等危险操作
- `ButtonSpinner` 加载转圈动画，配合 `isDisabled` 显示"正在处理"

## 踩过的坑

1. **初始化后别忘记 GluestackUIProvider**：没有 Provider 包裹，所有组件的主题配置都不会生效，组件会渲染但没有样式。最常见的错误是只复制了组件文件但没在 `App.tsx` 里加 Provider。

2. **Tailwind class 在 Native 端不完全兼容**：虽然 NativeWind 覆盖了大部分 Tailwind class，但仍有少数 CSS 属性在 Native 端没有对应实现（比如 `backdrop-blur`、复杂动画）。遇到不生效的 class，先查 NativeWind 文档确认是否支持。

3. **copy-paste 后需要手动调整 import 路径**：官方文档里假设你的组件放在 `@/components/ui/` 下。如果你的项目 alias 不同（比如用了 `~` 或直接相对路径），需要逐文件修改 import。`npx gluestack-ui add` CLI 方式可以自动处理。

4. **版本升级不会自动同步**：因为组件源码在你的项目里，gluestack-ui 升级到新版本时，你已经复制的组件不会自动更新。需要手动对比官方最新源码并合并改动。好的一面是：你的定制不会被升级覆盖。

5. **RSC（React Server Components）需要额外文件**：如果在 Next.js 15+ 里用 RSC，需要为某些组件提供 `index.web.tsx` 文件（用 `'use client'` 指令），否则服务端渲染会报错。官方文档的 Manual Installation 里通常会标注这一步。

## 适用场景

gluestack-ui 适合以下项目：

- **跨平台应用**：同时需要网页版和手机 App（Expo / React Native），而且希望用一套代码实现两端的 UI
- **重视设计自由度**：不想被组件库的视觉效果约束，需要随意修改组件内部样式和行为
- **Tailwind 技术栈**：团队已经熟悉 Tailwind CSS，想在不学新东西的前提下做手机端开发
- **长期维护的项目**：copy-paste 架构让组件版本完全由你控制，不会被依赖升级搞崩
- **打包体积敏感的移动端**：只用你复制的那几个组件，不会带进一整个库的重量
- **AI 辅助开发**：gluestack-ui 提供了 MCP Server，Claude、Cursor 等 AI 工具可以直接读取组件源码帮你生成代码

不适合的场景：

- **纯 Web 项目**：shadcn/ui 是更好的选择（同样 copy-paste + Tailwind，但 Web 生态更成熟）
- **Material Design 风格要求的项目**：React Native Paper 内置了完整的 Material Design 主题，开箱即用
- **快速原型只想拖拽**：gluestack-ui 没有任何可视化构建器，纯代码方式

## 历史小故事

gluestack-ui 的历史可以追溯到 **NativeBase**，这是 GeekyAnts 在 2020 年左右推出的 React Native 组件库，一度是 React Native 生态里最流行的 UI 库之一。但 NativeBase 的问题是：它只支持 React Native，不支持 Web；样式系统是自研的（不是 Tailwind），学习成本高；组件以 npm 包形式安装，定制困难。

2023 年，前端社区出现了一个关键趋势：**shadcn/ui**。这是一个 React Web 组件库，核心理念不是 `npm install`，而是"把源码直接复制进项目"。这个理念非常成功，因为它彻底解决了组件库 vendor lock-in 的问题。

GeekyAnts 团队看到了这个趋势，也想把 Tailwind 在 Web 端的成功复制到跨平台领域。2024 年，他们用 **NativeWind**（一个让 Tailwind class 在 React Native 工作的方案）做底层，重新设计了一个全新的组件库——这就是 gluestack-ui v2。

v2 的核心变化：
- 从 npm 包变成了 copy-paste 架构
- 从自研样式系统变成了 Tailwind CSS / NativeWind
- 从 React Native only 变成了 Web + Native

2025 年的 v3 进一步增强了 RSC 兼容性、Expo SDK 53 支持，并推出了 MCP Server 让 AI 工具能直接调用组件源码。

所以 gluestack-ui 本质上是对两个业界趋势的回应：**shadcn/ui 的 copy-paste 理念**和 **Tailwind 的工具类样式方法论**，把它们从 Web 带到了跨平台世界。

## 学到什么

1. **Copy-paste 架构是一个反直觉的好设计**：大多数库追求"零配置开箱即用"，但这带来了 vendor lock-in。把源码交给你，短期多了一点复制粘贴的工作，长期却省下了无数和升级对抗的时间。

2. **Compound Component 模式比 props 配置更灵活**：`<Button icon={...} text="..." />` 看起来很简洁，但一旦需求变复杂（比如图标在文字前面还是后面？要加两个图标？），props 就爆炸了。Compound Component 让消费者自由排列子组件，灵活度更高。

3. **Tailwind 的跨端潜力**：Tailwind 的"每一个 class 做一件事"的哲学，让它天然适合在不同渲染引擎之间映射。NativeWind 证明了这是一个可行的方向——不是"让 Web CSS 跑到手机上"，而是"class 作为一种 DSL，在不同平台有不同实现"。

4. **不要重复造轮子——但要选对轮子**：gluestack-ui 没有自己发明新的样式系统，而是站在两个巨人的肩膀上：Tailwind CSS（Web 端最流行的工具类 CSS）和 React Aria（Adobe 维护的无障碍库）。组件库的核心竞争力不在于发明新东西，而在于把已有的好东西组合得更好。

5. **MCP Server 是组件库的新分发方式**：传统组件库的文档是给人看的，MCP Server 让 AI 也能"读文档"。在 AI 辅助编程越来越普及的时代，组件库的可 AI 访问性会成为选择的重要考量。

## 延伸阅读

- [gluestack-ui GitHub 仓库](https://github.com/gluestack/gluestack-ui) — 源码、示例、贡献指南
- [gluestack-ui 官方文档](https://gluestack.io/ui/docs) — 所有组件的 API 参考和安装说明
- [NativeWind 文档](https://www.nativewind.dev/) — 理解 Tailwind class 如何在 React Native 上工作
- [shadcn/ui](https://ui.shadcn.com/) — copy-paste 架构的鼻祖（Web 端），理解理念来源
- [React Aria](https://react-spectrum.adobe.com/react-aria/) — gluestack-ui 底层使用的无障碍 hooks
- [Tailwind CSS 文档](https://tailwindcss.com/docs) — 工具类样式的完整参考

## 关联

- [shadcn-ui](./shadcn-ui.md) — Web 端 copy-paste 组件库，gluestack-ui 的核心理念来源
- [nativewind](./nativewind.md) — 让 Tailwind class 在 React Native 工作的方案，gluestack-ui 的样式引擎
- [tamagui](./tamagui.md) — 另一个跨平台 UI 方案，编译时优化 + 设计系统
- [expo](./expo.md) — gluestack-ui 主要支持的 React Native 框架
- [tailwind](./tailwind.md) — 工具类 CSS 框架，gluestack-ui 的 Web 端样式语言
- [native-base](./native-base.md) — gluestack-ui 的前身，React Native 组件库（已停止活跃开发）

## 反向链接

（本页面由 pipeline 自动生成，反向链接将在 /wiki index 后自动填充。）

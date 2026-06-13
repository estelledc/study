---
title: GlueStack UI — RN/Web 通用组件库
来源: https://github.com/gluestack/gluestack-ui
日期: 2026-06-13
分类: 后端 API
子分类: mobile-cross-platform
provenance: pipeline-v3
---

## 日常类比

想象你在搭积木。传统 UI 库像是一套「固定模具」——你买了一个按钮组件，它的颜色、大小、交互行为全都被写死了，想改就得翻源码、改依赖、可能还会牵一发而动全身。

GlueStack UI 的做法不一样：它像给你一盒**裸积木**，每块积木长什么样完全由你决定。你要红色按钮？自己加样式。要圆角？自己设。而且最妙的是——**同一块积木在网页（React/Next.js）和手机 App（React Native/Expo）上长得一样、长得像**。

这就是 GlueStack UI 的核心卖点：**一套代码，跨 Web 和移动端**。

## 核心概念

### 1. Copy-Paste 架构

GlueStack UI 不是让你 `npm install` 一个完整的 UI 库然后被动等待更新。它的组件就像「半成品源码」——你从官网复制组件代码，粘贴到自己的项目里，**完全拥有**。这跟 shadcn/ui 的思路一脉相承。

```
你需要的组件 → 复制 → 粘贴到你的项目 → 随意修改 → 你的代码
你不需要的组件 → 不安装 → 零负担
```

### 2. Tailwind CSS + NativeWind

- Web 端：用 **Tailwind CSS**（你给 HTML 标签加 `bg-red-500` 它就变红色，这是工具类）
- 移动端：用 **NativeWind**（把 Tailwind 的 CSS 工具类翻译成 React Native 能识别的样式）

这意味着你学会了一套样式写法，两边通用。

### 3. 组合式组件（Compound Components）

GlueStack 的组件擅长「嵌套子组件」：

```
<Button>
  <ButtonText> 点击我 </ButtonText>
</Button>
```

外层容器管布局，内层子元素管文字。比「一个巨大的 props 对象」灵活得多。

### 4. 可访问性（Accessibility）

每个组件默认支持键盘导航和屏幕阅读器。无障碍不是事后补的，是出厂自带的。

## 安装

```bash
npx gluestack-ui init
```

CLI 会自动帮你搭建 `GluestackUIProvider` 和必要的基础组件（图标、弹窗、提示框等）。然后按需添加：

```bash
npx gluestack-ui add box button input
```

## 代码示例

### 示例一：按钮组件

```tsx
import { Button, ButtonText, ButtonIcon } from '@/components/ui/button';
import { Moon } from '@/components/ui/icon';

function Example() {
  return (
    <Button
      size="md"
      variant="solid"
      action="primary"
      style={{ $$css: true }}
      className="bg-primary-500 hover:bg-primary-600 rounded-lg"
    >
      <ButtonIcon as={Moon} className="text-typography-50 mr-2" />
      <ButtonText className="text-typography-50">
        切换夜间模式
      </ButtonText>
    </Button>
  );
}
```

- `size` 控制大小：`xs` / `sm` / `md` / `lg`
- `variant` 控制风格：`solid` / `outline` / `link`
- `action` 控制语义色：`primary` / `secondary` / `success` / `warning` / `error`
- `className` 直接用 Tailwind 工具类自定义
- `$$css: true` 是关键——告诉 NativeWind 这是一个 CSS 样式对象，需要桥接

### 示例二：表单输入 + 布局

```tsx
import {
  FormControl,
  FormLabel,
  FormHelperText,
  FormError,
  Input,
  InputField,
  VStack,
  Button,
  ButtonText,
} from '@/components/ui';

function LoginScreen() {
  return (
    <VStack className="flex-1 bg-background-0 p-6 space-y-4">
      <VStack className="space-y-2">
        <FormControl isInvalid={false}>
          <FormLabel className="text-typography-900 text-base font-normal">
            邮箱
          </FormLabel>
          <Input size="md">
            <InputField
              type="text"
              className="bg-background-50 border border-background-300 rounded-lg"
              placeholder="请输入邮箱"
            />
          </Input>
          <FormHelperText className="text-typography-500">
            我们绝不会把邮箱分享出去
          </FormHelperText>
        </FormControl>

        <FormControl>
          <FormLabel className="text-typography-900 text-base font-normal">
            密码
          </FormLabel>
          <Input size="md">
            <InputField
              type="password"
              className="bg-background-50 border border-background-300 rounded-lg"
              placeholder="请输入密码"
            />
          </Input>
        </FormControl>

        <Button className="bg-primary-500 mt-4">
          <ButtonText className="text-typography-50">
            登录
          </ButtonText>
        </Button>
      </VStack>
    </VStack>
  );
}
```

这里展示了几个关键组件：

- `VStack`：垂直堆叠布局（Web 上等价于 `flex-direction: column`）
- `FormControl` + `FormLabel` + `Input` + `InputField`：完整的表单语义结构
- `FormHelperText` / `FormError`：辅助文字和错误提示
- `className` 统一用 Tailwind 工具类，两边通用

## 组件覆盖范围

GlueStack UI v3 提供 **30+ 组件**，覆盖：

| 类别 | 代表组件 |
|---|---|
| 排版 | Heading, Text |
| 布局 | Box, Center, Divider, HStack, VStack, Grid |
| 反馈 | Alert, Progress, Spinner, Toast |
| 表单 | Button, Checkbox, Radio, Input, Select, Slider, Switch, Textarea |
| 弹窗 | AlertDialog, Drawer, Modal, Popover, Tooltip |
| 数据展示 | Badge, Card, Table |
| 媒体 | Avatar, Image, Icon |
| 其他 | Fab, Skeleton, Accordion, ActionSheet |

## 一句话总结

> **GlueStack UI = shadcn/ui 的跨平台版**。复制粘贴、Tailwind 驱动、Web+RN 通用，适合既要做网页又要做手机 App 的团队。

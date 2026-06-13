---
title: React Native Paper — Material Design 风格的 RN UI 组件库
来源: https://github.com/callstack/react-native-paper
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

React Native Paper 是 Callstack 维护的**跨平台 Material Design UI 组件库**：把 Google Material Design 3（Material You）里的按钮、卡片、输入框、对话框等「标准件」封装成 React Native 组件，在 iOS 和 Android 上开箱即用。

日常类比：你在装修一套公寓（React Native App），自己从零做门把手、开关面板、橱柜门会很费时间，而且容易和邻居（用户）熟悉的 Google/Android 风格对不上。Paper 就像**宜家 + 谷歌联名样板间**——颜色、圆角、阴影、动效都按 Material 规范预制好了，你只管选组件、拼布局、换主题色，不用自己画每个 ripple 波纹和 elevation 阴影。

最小用法：用 `PaperProvider` 包住 App，然后直接 import 组件：

```tsx
import { PaperProvider, Button } from 'react-native-paper';

export default function App() {
  return (
    <PaperProvider>
      <Button mode="contained" onPress={() => console.log('pressed')}>
        提交
      </Button>
    </PaperProvider>
  );
}
```

Paper 默认启用 **MD3（Material Design 3）** 主题；若项目仍依赖旧版视觉，可通过 `PaperProvider` 的 `theme` 或 `version={2}` 切回 MD2。

## 为什么重要

不理解 Paper，在 RN 移动端 UI 选型时容易走弯路：

- **Material 规范已经帮你做了 80% 的交互细节**：按钮的 pressed 态、FAB 的 elevation、Snackbar 的队列、TextInput 的浮动标签——自己用 `Pressable` + 手写样式复刻，成本高且容易和 Android 系统预期不一致
- **Expo / RN 生态的「官方感」组件库**：14k+ GitHub stars，Callstack（React Native 核心贡献团队之一）长期维护，文档、Snack 示例、Play/App Store Demo App 齐全
- **主题系统与 MD3 色板对齐**：`primary` / `onPrimary` / `primaryContainer` 等 token 与 Material Theme Builder 一致，设计师给 Figma kit，开发可以直接映射到 `theme.colors`
- **和 React Navigation 等库配合成熟**：AppBar、Drawer、BottomNavigation 等导航相关组件与 RN 导航栈是常见组合

Paper **不是** RN 的唯一 UI 方案：偏 iOS Human Interface Guidelines 的项目可能选 NativeBase 或 Tamagui；要高度定制设计系统时也可能自研。Paper 的甜区是：**Android 为主或需要统一 Material 视觉的 B 端 / 工具类 App**。

## 核心概念

Paper 的心智模型可以拆成五块：

1. **`PaperProvider`（主题与 Portal 根）**  
   必须在应用根部包裹（Expo 项目在 `App.tsx`，裸 RN 在 `AppRegistry` 注册的外层）。它通过 React Context 向下传递 `theme`，并为 `Modal`、`Menu`、`Snackbar` 等需要「渲染到顶层」的组件提供 Portal。  
   **Provider 顺序**：Redux / TanStack Query 等应包在 **Paper 外面**，这样 Modal 内的子树仍能访问 Redux；Paper 在内层。

2. **Material Design 3 主题（Theme Token）**  
   默认不传 `theme` 时使用内置 MD3 浅色主题。主题对象包含：
   - `dark: boolean` — 深/浅色
   - `version: 2 | 3` — 设计系统版本
   - `roundness: number` — 全局圆角基数
   - `colors` — MD3 色板（`primary`、`secondary`、`tertiary`、`surface`、`error` 及对应的 `on*` / `*Container`）
   - `fonts` — MD3 Typescale（`displayLarge`、`titleMedium`、`bodySmall` 等）
   - `animation` — 动画时长缩放  
   用 `useTheme()` 在任意子组件读取当前主题，无需 prop drilling。

3. **组件 `mode` 与变体**  
   许多组件通过 `mode` 表达 Material 层级，例如 `Button` 支持 `contained`（实心主按钮）、`outlined`、`text`、`elevated`、`contained-tonal`。`Card` 可组合 `Card.Title`、`Card.Content`、`Card.Cover`、`Card.Actions`。理解 mode = 理解「这个控件在视觉层级里扮演什么角色」。

4. **平台适配（Platform Adaptation）**  
   Paper 遵循 Material 的跨平台指南：同一组件在 iOS 上可能用 slightly 不同的 ripple / 字体度量，但整体仍保持 Material 身份，而不是完全变成 Cupertino。若你要「iOS 像 iOS、Android 像 Android」，需要额外做平台分支或换库。

5. **依赖与动画**  
   现代版本依赖 `react-native-safe-area-context`（安全区）、`react-native-reanimated` + `react-native-worklets`（动画）。Expo 项目用 `npx expo install` 对齐版本；生产环境可在 `babel.config.js` 启用 `react-native-paper/babel` 插件做 **tree-shaking**，只打包用到的组件。

## 安装与项目接入

```bash
# 安装 Paper
npm install react-native-paper

# Expo 项目：对齐 peer 依赖
npx expo install react-native-safe-area-context react-native-reanimated react-native-worklets
```

Expo 已内置 vector icons，无需再装 `react-native-vector-icons`；裸 RN CLI 项目需额外安装并 link icons。

根组件接入：

```tsx
import { PaperProvider } from 'react-native-paper';
import App from './App';

export default function Root() {
  return (
    <PaperProvider>
      <App />
    </PaperProvider>
  );
}
```

## 实践案例

### 案例 1：自定义 MD3 主题 + 深色模式

```tsx
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import {
  MD3DarkTheme,
  MD3LightTheme,
  PaperProvider,
  adaptNavigationTheme,
} from 'react-native-paper';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';

const brandLight = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6750A4',
    secondary: '#625B71',
  },
};

const brandDark = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#D0BCFF',
    secondary: '#CCC2DC',
  },
};

export default function Root() {
  const scheme = useColorScheme();
  const paperTheme = scheme === 'dark' ? brandDark : brandLight;

  const { LightTheme, DarkTheme } = adaptNavigationTheme({
    reactNavigationLight: DefaultTheme,
    reactNavigationDark: DefaultTheme,
  });
  const navTheme = scheme === 'dark' ? DarkTheme : LightTheme;

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer theme={navTheme}>
        <App />
      </NavigationContainer>
    </PaperProvider>
  );
}
```

要点：

- 基于 `MD3LightTheme` / `MD3DarkTheme` **展开合并**，只覆盖需要改的 `colors`，避免漏掉 MD3 必需的 token
- `useColorScheme()` 跟随系统深/浅色；也可接自己的主题开关 state
- `adaptNavigationTheme` 让 React Navigation 的 header / tab 颜色与 Paper 主题一致，减少「导航栏一种紫、按钮另一种紫」的割裂感

### 案例 2：登录表单 — TextInput、Button、Helper 文本

```tsx
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  TextInput,
  Button,
  Text,
  HelperText,
  Surface,
} from 'react-native-paper';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);

  const emailError = email.length > 0 && !email.includes('@');

  async function handleLogin() {
    setLoading(true);
    try {
      await signIn(email, password);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Surface style={styles.container} elevation={1}>
      <Text variant="headlineSmall" style={styles.title}>
        登录
      </Text>

      <TextInput
        label="邮箱"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        error={emailError}
        mode="outlined"
      />
      <HelperText type="error" visible={emailError}>
        请输入有效邮箱
      </HelperText>

      <TextInput
        label="密码"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={secure}
        right={
          <TextInput.Icon
            icon={secure ? 'eye-off' : 'eye'}
            onPress={() => setSecure((s) => !s)}
          />
        }
        mode="outlined"
      />

      <Button
        mode="contained"
        loading={loading}
        disabled={!email || !password || emailError}
        onPress={handleLogin}
        style={styles.button}
      >
        进入
      </Button>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: { margin: 16, padding: 24, borderRadius: 12 },
  title: { marginBottom: 16 },
  button: { marginTop: 24 },
});
```

要点：

- `TextInput` 的 `mode="outlined"` / `"flat"` 对应 Material 描边与填充两种风格
- `HelperText` 与 `error` prop 联动，比手写红色 `<Text>` 更符合 MD 规范
- `Button` 的 `loading` 会自动显示 `ActivityIndicator` 并禁用重复点击
- `Text variant="headlineSmall"` 使用主题 typescale，而不是硬编码 `fontSize`

### 案例 3：Snackbar 全局反馈

```tsx
import { useState } from 'react';
import { Button, Snackbar } from 'react-native-paper';

export function SaveExample() {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Button mode="contained-tonal" onPress={() => setVisible(true)}>
        保存草稿
      </Button>
      <Snackbar
        visible={visible}
        onDismiss={() => setVisible(false)}
        action={{ label: '撤销', onPress: () => {} }}
        duration={4000}
      >
        已保存
      </Snackbar>
    </>
  );
}
```

实际项目里常把 Snackbar 状态提到 Context 或 Zustand，避免每个屏幕各自维护 `visible`。

## 常用组件速查

| 组件 | 典型用途 |
|------|----------|
| `Appbar.Header` / `Appbar.Action` | 顶栏、返回、菜单 |
| `FAB` / `FAB.Group` | 主操作悬浮按钮 |
| `Card` | 信息块、列表项容器 |
| `Chip` / `SegmentedButtons` | 标签、筛选、分段控制 |
| `Dialog` / `Portal` | 模态确认 |
| `Menu` / `Dropdown` | 溢出菜单 |
| `List.Item` / `List.Section` | 设置页、分组列表 |
| `DataTable` | 简单表格 |
| `ProgressBar` / `ActivityIndicator` | 加载与进度 |
| `Switch` / `Checkbox` / `RadioButton` | 表单控件 |

完整列表见官方文档：https://callstack.github.io/react-native-paper/docs/components/ActivityIndicator

## 常见坑与排查

1. **忘记包 `PaperProvider`**  
   症状：组件样式全乱、控制台报 theme 相关 warning。解决：在导航和 Redux 内层包上 Provider。

2. **Modal 内主题/Redux 丢失**  
   Modal 渲染在独立子树。Redux Provider 必须在 Paper **外层**；若自定义 Modal 内 Paper 组件无主题，用 `ThemeProvider` 再注入一次或用 `withTheme` 传 `theme` prop。

3. **图标不显示（裸 RN）**  
   需安装 `react-native-vector-icons` 并按平台 link；Expo 无此问题。

4. **Reanimated 版本不匹配**  
   动画组件异常或构建失败。用 Expo 的 `npx expo install` 或对照 Paper 文档的最低版本要求。

5. **MD2 老项目升级**  
   检查 breaking changes（`Provider` 改名为 `PaperProvider`、`accent` 色改为 `secondary` 等）。可暂时 `theme={{ version: 2, ...MD2LightTheme }}` 过渡。

6. **与 Tailwind / NativeWind 混用**  
   可以共存，但同一元素不要既用 Paper 的 `style` 又用 className 抢布局；建议布局用 RN `StyleSheet`，视觉 token 用 Paper theme。

## 与生态的关系

- **Callstack**：React Native 商业支持与开源的核心团队，Paper 是其开源门面之一
- **Expo**：无额外配置即可使用 Paper；Snack 上有官方 v5 示例项目
- **React Navigation**：推荐 `adaptNavigationTheme` 统一主题
- **Material Theme Builder**：导出 JSON 后可映射到 `theme.colors`
- **竞品参考**：NativeBase（更通用）、React Native Elements（更轻）、Tamagui（性能 / 编译向）

## 学习路径建议

1. 跑通 `PaperProvider` + 一个 `Button` + 一个 `TextInput`（30 分钟）
2. 读官方 Theming 指南，改 `primary` 色并开深色模式（1 小时）
3. 用 `Card` + `List` + `Appbar` 拼一个设置页（半天）
4. 接 React Navigation，做带 FAB 的列表详情流（1 天）
5. 读 `react-native-paper/babel` 优化生产包体积（按需）

## 小结

React Native Paper 把 Material Design 3 翻译成 RN 可直接使用的组件与主题系统。**`PaperProvider` + MD3 theme token + 语义化 `mode`** 是三个支点；其余是在此之上选 Card、Dialog、Snackbar 等标准件。对需要快速做出「像 Google 出品」的跨平台 App 的开发者，Paper 是最省心的起点之一。

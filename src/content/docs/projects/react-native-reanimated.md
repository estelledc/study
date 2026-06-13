---
title: React Native Reanimated — 高性能动画库
来源: https://github.com/software-mansion/react-native-reanimated
日期: 2026-06-13
分类: 后端 API
子分类: mobile-cross-platform
provenance: pipeline-v3
---

# React Native Reanimated — 高性能动画库

## 什么是 Reanimated

Reanimated 是 Software Mansion 开发的 React Native 动画库。它的口号是 "React Native's Animated library reimplemented"——用他们自己的话说，就是把 React Native 自带的 Animated 库彻底重写了一遍。

听起来有点绕。用日常类比来理解：

**React Native 自带的 Animated 库就像手动挡自行车**——你告诉它每一步怎么动，它会在"主线程"（JavaScript 线程）上一步步执行。一旦动画变复杂，主线程就被动画占满了，用户一点击页面，动画就卡住。

**Reanimated 就像自动挡电动车**——你只告诉它"起点在哪、终点在哪"，它把动画计算交给了一个专门的"动画引擎线程"（UI 线程）。主线程自由了，页面照样流畅响应。

这就是 Reanimated 的核心卖点：**动画跑在 UI 线程，不阻塞 JavaScript 主线程**，所以能做到 120fps 的丝滑效果。

## 为什么自带 Animated 不够好

React Native 自带 Animated 库的工作方式是"桥接模式"（Bridge）：每次动画一帧都要从 JS 线程通过桥接发一条消息到原生线程。动画越快、帧数越高，桥接次数就越多。想象一下，你每秒钟要通过一个邮局的窗口寄 60 封信，这邮局窗口肯定排长队。

Reanimated 的做法是：动画的定义（代码）直接编译到原生层去执行。JS 线程只负责说"把值从 0 变成 100"，具体怎么动、每帧怎么算，全部在原生层完成，不需要反复过桥接。

## 核心概念：三个词

### 1. Animated 组件

`Animated.View`、`Animated.Text`、`Animated.Image` 等，是 Reanimated 提供的"会动的"原生组件。用法和普通 RN 组件一样，只是能接受共享值（后面会讲）作为样式属性。

### 2. Shared Value（共享值）

这是 Reanimated 最核心的概念。可以把它理解为一个"在 JS 线程和原生线程之间自动同步的变量"。

- 你用 `useSharedValue(100)` 创建一个共享值，初始值为 100
- 通过 `.value` 读写它的值
- 你改了这个值，绑定到它上面的 UI 会自动更新

### 3. 动画函数

你直接给共享值赋一个数字，它会"瞬移"过去。如果你想让它平滑过渡，就要用动画函数包裹它，比如 `withSpring()`（弹簧效果）、`withTiming()`（匀速/缓动效果）、`withSequence()`（一串动画连起来）。

## 代码示例一：基础弹簧动画

最简单的动画：点击按钮，一个方块弹来弹去。

```javascript
import { Button, View } from 'react-native';
import Animated, { useSharedValue, withSpring } from 'react-native-reanimated';

export default function App() {
  // 创建一个共享值，初始值为 100
  const width = useSharedValue(100);

  const handlePress = () => {
    // 把宽度随机变成 50~150 之间的值
    // withSpring 会让它自然地"弹"过去，而不是瞬间跳过去
    width.value = withSpring(Math.random() * 100 + 50);
  };

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      {/* Animated.View 替代普通的 View，width 直接绑定共享值 */}
      <Animated.View
        style={{
          width,
          height: 100,
          backgroundColor: 'violet',
          marginVertical: 40,
        }}
      />
      <Button onPress={handlePress} title="点我" />
    </View>
  );
}
```

**逐行拆解：**

1. `useSharedValue(100)` — 创建共享值，初始值 100。它就像一个"特殊变量"，普通变量改了不会驱动 UI 更新，但共享值改了会。
2. `width.value = withSpring(...)` — 把共享值设为一个弹簧动画。动画函数返回的本身也是一个"动画描述"，Reanimated 会自动执行它。
3. `style={{ width }}` — 直接把共享值当作 style 属性的值。注意不是 `width.value`，而是共享值对象本身。Reanimated 会自动跟踪它的变化。

## 代码示例二：useAnimatedStyle — 响应式样式

如果动画逻辑比较复杂，不止一个样式属性需要联动，就用 `useAnimatedStyle`。

```javascript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

function AnimatedButton({ title }) {
  const isPressed = useSharedValue(false);
  const scale = useSharedValue(1);

  const onPressIn = () => {
    isPressed.value = true;
    scale.value = withSpring(0.92);
  };

  const onPressOut = () => {
    isPressed.value = false;
    scale.value = withSpring(1);
  };

  // useAnimatedStyle 的回调函数会在每次共享值变化时执行
  // 它返回的样式对象会自动应用到组件上
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: isPressed.value ? 0.8 : 1,
  }));

  return (
    <Animated.View
      style={[
        {
          backgroundColor: '#6c5ce7',
          paddingHorizontal: 32,
          paddingVertical: 16,
          borderRadius: 12,
        },
        animatedStyle,
      ]}
      onTouchStart={onPressIn}
      onTouchEnd={onPressOut}
    >
      <Text style={{ color: '#fff', fontWeight: 'bold' }}>{title}</Text>
    </Animated.View>
  );
}
```

**这里发生了什么：**

- 按下的时候：按钮缩小到 92%（弹簧效果），透明度降到 0.8
- 松手的时候：按钮弹回 100%，透明度恢复
- `useAnimatedStyle` 的回调就像一个"监听器"：`scale.value` 或 `isPressed.value` 一变，它就重新计算样式

## 动画函数速查

| 函数 | 效果 | 类比 |
|------|------|------|
| `withSpring()` | 弹簧效果，有回弹 | 按弹簧床然后松手 |
| `withTiming(duration)` | 线性/缓动过渡 | 电梯匀速上升 |
| `withDecay()` | 惯性减速 | 手机屏幕上滑后的惯性滚动 |
| `withSequence(...)` | 多个动画按顺序执行 | 先缩小再弹大再缩小 |

## 布局动画（进入/退出）

Reanimated 还能让组件"进场"和"退场"时有动画效果，不用写任何动画逻辑：

```javascript
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';

function App() {
  const [visible, setVisible] = useState(true);

  return (
    <>
      {visible && (
        <Animated.View
          entering={FadeIn.duration(500)}   // 进入时淡入，持续 500ms
          exiting={FadeOut.duration(300)}     // 退出时淡出，持续 300ms
          layout={Layout.duration(400)}       // 布局变化时滑动过渡
        >
          <Text>Hello!</Text>
        </Animated.View>
      )}
    </>
  );
}
```

一行 `entering={FadeIn}` 就搞定了进入动画，一行 `exiting={FadeOut}` 搞定了退出动画。比自带动画库省心太多了。

## Reanimated 4 的重要变化

Reanimated 4（当前最新版本 4.4.1）只支持 React Native 的新架构（New Architecture）。如果你的项目还在用旧架构，需要停留在 3.x 版本。

Reanimated 4 还和 React Native Worklets 深度整合，Worklets 让你能把任意 JS 函数编译到 UI 线程运行，不只是动画，任何计算密集型逻辑都可以受益。

## 总结

| 概念 | 一句话 |
|------|--------|
| Animated 组件 | 替代 RN 内置组件，能绑定共享值 |
| Shared Value | 跨线程同步的"神奇变量"，改了自动驱动 UI |
| 动画函数 | 用弹簧、缓动等效果让值的变化有动画感 |
| useAnimatedStyle | 把共享值映射到样式对象的响应式 Hook |
| 布局动画 | 一行代码搞定组件进场/退场动画 |

Reanimated 的学习曲线：概念只有三个（Animated 组件、共享值、动画函数），但组合起来能做很复杂的交互。从 `withSpring` 开始，一步一步玩就行。

---
title: Taro — 一套 React/Vue 代码跑遍小程序与 H5
来源: https://github.com/NervJS/taro
日期: 2026-06-13
分类: 后端 API
子分类: 移动端
provenance: pipeline-v3
---

## 是什么

Taro 是京东凹凸实验室开源的**跨端跨框架**解决方案：你用熟悉的 React 或 Vue 写页面，同一套源码可以编译到微信/支付宝/抖音/京东/百度/QQ/飞书等小程序、H5、React Native，以及鸿蒙等更多平台。日常类比：Taro 像一家连锁餐厅的**中央厨房**——厨师（开发者）只按一份菜谱（React/Vue 代码）炒菜，出餐时自动换成各分店（小程序、H5、App）的盘子和摆盘规范，顾客在各店吃到的仍是同一道菜，不必为每家店单独雇一队厨师。

它和「把网页塞进 WebView」不同。Taro 3 起采用**重运行时**架构：在小程序等环境里模拟 DOM/BOM，让真正的 React 或 Vue 跑起来，再把虚拟 DOM 映射成各端原生视图，因此 Hooks、Context、大部分 npm 生态可以复用。

```bash
# 安装 CLI 并创建 React + TypeScript 项目
npm install -g @tarojs/cli
taro init myApp
# 选择框架：React / Vue，模板：默认或 TS

cd myApp
npm run dev:weapp    # 微信开发者工具预览
npm run dev:h5       # 浏览器预览
npm run build:weapp  # 生产构建小程序
```

## 为什么重要

不理解 Taro，以下场景容易选型失误或反复踩坑：

- **业务要「小程序 + H5 + App」三端齐发**：自研三套团队成本极高；Taro 让前端团队用一套 React/Vue 技能栈覆盖主流端
- **已有 React H5 想进微信生态**：Taro 3 不是简单「语法转译」，而是运行时兼容，迁移 Hooks 组件比 Taro 1/2 时代平滑得多
- **各小程序 API/组件名不一致**：Taro 以微信规范为基准做统一抽象，`Taro.request`、`@tarojs/components` 屏蔽大部分平台差异
- **与 uni-app 的取舍**：uni-app 偏 Vue 生态 + DCloud 工具链；Taro 偏 React/Vue 双栈 + 京东系生产验证（京喜、京东购物等），团队技术栈决定选型

## 核心概念

Taro 的技术栈可以拆成六块：

### 1. 编译时 + 运行时双层架构（Taro 3/4）

Taro 1/2 主要靠**编译时**把 JSX 转成各端模板（类似早期 mpvue），难以 100% 兼容 React，也无法用 Vue。Taro 3 改为：

1. 开发者写标准 React/Vue 代码；
2. **Webpack / Vite** 打包业务与框架；
3. **运行时**（`@tarojs/runtime`）在目标端维护一棵类 DOM 树；
4. 框架 reconciler 更新这棵树的节点；
5. 各端 **Adapter** 把节点变更同步到小程序 `setData`、H5 真实 DOM 或 RN 视图。

类比：不是把中文书逐句翻译成英文（编译替换），而是在国外请一位同声传译（运行时），你继续说中文（写 React），听众听到的是当地语言（各端 UI）。

### 2. 组件与标签：`@tarojs/components`

小程序没有 `div`/`span`，Taro 提供跨端组件：

| Taro 组件 | 小程序侧 | H5 侧（近似） |
|-----------|----------|----------------|
| `View` | `view` | `div` |
| `Text` | `text` | `span` |
| `Image` | `image` | `img` |
| `Button` | `button` | `button` |
| `ScrollView` | `scroll-view` | 可滚动容器 |

样式用 `className` + 类名，或内联 `style` 对象；单位常用 `px`/`rpx`（设计稿 750 宽时 1rpx ≈ 半屏逻辑像素）。

### 3. 路由与页面配置

每个页面是 `src/pages/xxx/index.tsx`，并在 `src/app.config.ts` 注册：

```ts
export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/detail/index',
  ],
  window: {
    navigationBarTitleText: '首页',
    navigationBarBackgroundColor: '#ffffff',
  },
  tabBar: {
    list: [
      { pagePath: 'pages/index/index', text: '首页' },
      { pagePath: 'pages/detail/index', text: '详情' },
    ],
  },
})
```

单页还可有 `index.config.ts` 覆盖导航栏标题等。类比：小程序的 `app.json` 被收进 TypeScript 配置文件，由 CLI 生成各端所需 JSON。

### 4. 生命周期：React 与小程序的桥接

页面级除了 React 的 `useEffect`，还有 Taro 页面钩子（在函数组件里用 hook 形式）：

- `useLoad` — 页面加载，类似小程序 `onLoad`
- `useDidShow` / `useDidHide` — 页面显示/隐藏
- `usePullDownRefresh` — 下拉刷新
- `useReachBottom` — 触底加载

类组件时代对应 `componentDidShow` 等；新项目推荐函数组件 + Hooks。

### 5. API 统一层：`@tarojs/taro`

网络、存储、导航、设备能力走 `Taro.*`，编译到各端原生 API：

```ts
import Taro from '@tarojs/taro'

Taro.request({ url: 'https://api.example.com/items' })
Taro.setStorageSync('token', 'xxx')
Taro.navigateTo({ url: '/pages/detail/index?id=1' })
```

条件编译可用 `process.env.TARO_ENV`（`weapp` / `h5` / `rn` 等）写平台分支。

### 6. 插件化与多端扩展

Taro 3+ 插件系统允许扩展新端或改编译链，无需 fork 核心仓库。官方与各厂商维护微信、支付宝、抖音、京东、鸿蒙等 preset；企业可写自定义插件接入内部容器。

## 示例一：函数组件 + Hooks 首页

```tsx
// src/pages/index/index.tsx
import { View, Text, Button } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import './index.scss'

export default function Index() {
  const [count, setCount] = useState(0)
  const [env, setEnv] = useState('')

  useLoad((options) => {
    console.log('页面参数', options)
  })

  useDidShow(() => {
    setEnv(process.env.TARO_ENV ?? 'unknown')
  })

  const goDetail = () => {
    Taro.navigateTo({ url: '/pages/detail/index?from=index' })
  }

  return (
    <View className="index">
      <Text className="title">你好，Taro</Text>
      <Text className="env">当前端：{env}</Text>
      <Text className="count">点击次数：{count}</Text>
      <Button onClick={() => setCount((c) => c + 1)}>点我 +1</Button>
      <Button onClick={goDetail}>去详情页</Button>
    </View>
  )
}
```

```scss
// src/pages/index/index.scss
.index {
  padding: 40px;
  .title {
    font-size: 36px;
    font-weight: 600;
    margin-bottom: 24px;
  }
  .env, .count {
    display: block;
    font-size: 28px;
    color: #666;
    margin-bottom: 16px;
  }
}
```

要点：`View`/`Text` 替代 HTML 标签；事件用 `onClick`（H5）在小程序会映射为 `bindtap`；样式文件按页引入，构建时各端做相应处理。

## 示例二：请求数据 + 列表渲染 + 下拉刷新

`index.config.ts` 开启下拉刷新：

```ts
export default definePageConfig({
  navigationBarTitleText: '商品列表',
  enablePullDownRefresh: true,
})
```

页面逻辑：

```tsx
import { View, Text, Image } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh, useReachBottom } from '@tarojs/taro'
import { useState, useCallback } from 'react'

interface Item {
  id: string
  title: string
  cover: string
}

export default function ListPage() {
  const [items, setItems] = useState<Item[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const fetchPage = useCallback(async (p: number, replace = false) => {
    if (loading) return
    setLoading(true)
    try {
      const res = await Taro.request<{ list: Item[] }>({
        url: `https://api.example.com/items?page=${p}`,
        method: 'GET',
      })
      const list = res.data?.list ?? []
      setItems((prev) => (replace ? list : [...prev, ...list]))
      setPage(p)
    } catch (e) {
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
      Taro.stopPullDownRefresh()
    }
  }, [loading])

  useLoad(() => fetchPage(1, true))

  usePullDownRefresh(() => fetchPage(1, true))

  useReachBottom(() => fetchPage(page + 1))

  return (
    <View className="list">
      {items.map((item) => (
        <View
          key={item.id}
          className="card"
          onClick={() =>
            Taro.navigateTo({ url: `/pages/detail/index?id=${item.id}` })
          }
        >
          <Image className="cover" src={item.cover} mode="aspectFill" />
          <Text className="name">{item.title}</Text>
        </View>
      ))}
      {loading && <Text className="tip">加载中…</Text>}
    </View>
  )
}
```

这是小程序列表页的常见模式：首屏 `useLoad`、下拉 `usePullDownRefresh`、分页 `useReachBottom`，逻辑与纯微信小程序一致，但写法是 React Hooks。

## 项目结构与常用命令

典型 Taro 4 + React 目录：

```
myApp/
├── config/           # 编译配置 index.ts（designWidth、alias、plugins）
├── src/
│   ├── app.ts        # 应用入口
│   ├── app.config.ts # 全局路由与 window
│   ├── app.scss
│   └── pages/
│       └── index/
│           ├── index.tsx
│           ├── index.config.ts
│           └── index.scss
├── project.config.json   # 微信开发者工具工程（dev:weapp 生成/更新）
└── package.json
```

| 命令 | 作用 |
|------|------|
| `npm run dev:weapp` | 监听编译，输出到 `dist/`，用微信开发者工具打开 |
| `npm run dev:h5` | 本地 H5 开发服务器 |
| `npm run dev:alipay` | 支付宝小程序 |
| `npm run build:weapp` | 生产构建小程序包 |
| `taro build --type h5` | 等价于 build h5 |

`config/index.ts` 里 `designWidth: 750` 与 `deviceRatio` 决定 px 转 rpx 的规则，和设计稿宽度要对齐。

## 与相关技术的关系

| 技术 | 关系 |
|------|------|
| React / Vue | Taro 是运行时容器，不替代框架；你写的仍是标准组件与 Hooks |
| 微信小程序原生 | Taro 编译产物可在微信开发者工具运行；复杂场景仍需了解 wx API 差异 |
| uni-app | 同为跨端方案；uni-app 默认 Vue 语法 + uts，Taro 更偏 React 与京东生态 |
| React Native | Taro 可编译到 RN 端，但 RN 端生态与调试路径与小程序/H5 不同，需单独验证 |
| taro-ui | 官方多端 UI 库（`taro-ui@next`），组件在小程序/H5 可用，RN 端支持有限 |

## 常见问题与最佳实践

**样式**：避免依赖大量 Web 专有选择器；flex 布局最稳妥。小程序不支持 `*` 通配部分行为与 H5 不同，关键页要在真机预览。

**包体积**：小程序主包有 2MB 限制（分包可扩）；用分包加载 `subPackages`，图片走 CDN，按需引入组件。

**原生能力**：蓝牙、支付、登录等用 `Taro.*` 或各端插件；无法满足时可用**原生插件**或 `createNativeComponent` 嵌入原生模块。

**状态管理**：Redux、Zustand、MobX 在 Taro 3+ 大多可用；注意持久化用 `Taro.setStorage` 而非 `localStorage`（小程序无 window）。

**调试**：H5 用 Chrome DevTools；小程序用微信开发者工具 + Source Map；多端差异用 `process.env.TARO_ENV` 分支并维护最小差异层。

## 版本演进（读文档时对齐心智）

| 世代 | 思路 | 特点 |
|------|------|------|
| Taro 1 | 编译 JSX → 模板 | 类 React，生态难复用 |
| Taro 2 | 编译 + 部分运行时 | 组件库统一，仍非完整 React |
| Taro 3 | 重运行时 | 真 React/Vue、Hooks、插件化 |
| Taro 4 | 延续 3 + 工程现代化 | 更好 Vite 支持、类型与鸿蒙等端扩展 |

学习时以官方文档 [docs.taro.zone](https://docs.taro.zone) 为准；GitHub [NervJS/taro](https://github.com/NervJS/taro) 看 issue 与 release 了解各端适配进度。

## 小结

Taro 解决的是**多端重复建设**：用中央厨房式的统一源码 + 运行时适配，让 React/Vue 开发者进入小程序和 H5 时不必重学一套视图语法。零基础路径建议：先用 `taro init` 跑通 `dev:h5` 和 `dev:weapp` → 熟悉 `@tarojs/components` 与页面配置 → 用 `Taro.request` 和生命周期 Hooks 做一页列表 → 再碰分包、条件编译与原生插件。掌握「运行时映射」这条主线，比死记各端 API 表更能长期维护跨端项目。

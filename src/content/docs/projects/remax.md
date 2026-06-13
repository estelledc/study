---
title: Remax — 用真正的 React 构建跨平台小程序
来源: https://github.com/remaxjs/remax
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

Remax 是蚂蚁集团（阿里巴巴）开源的**小程序 React 运行时**方案：你写标准 React 组件、Hooks、Context，Remax 在小程序的逻辑层里跑起真正的 React reconciler，再把虚拟 DOM 变成小程序能消费的 JSON 树，通过 `setData` 驱动各端原生视图。日常类比：

> 微信小程序像一座**只允许方言广播的城市**——官方视图层只认 `view`/`text` 和模板语法，逻辑层又不能直接摸 DOM。
> Remax 在城市里建了一个**同声传译电台**：你在电台里照常用普通话（React/JSX）主持节目，电台内部把每一句话整理成「广播稿」（VNode JSON），市政喇叭（`setData` + 预生成模板）按稿向街头大屏播报。

它和「把 JSX 编译成 WXML 字符串」的**编译时**方案（早期 Taro 1、mpvue）不同：Remax 走**运行时渲染器**，官方 slogan 是 *Learn once, write anywhere*，自称「针对小程序的 React Native」——上层几乎没有 React 语法限制，Hooks 可用。

```bash
# 创建项目（Node.js >= 12）
npx create-remax-app my-app
cd my-app && npm install

# 单端开发
npm run dev

# 跨平台项目指定端，例如微信
npm run dev wechat
```

> **现状提示**：GitHub 仓库 `remaxjs/remax` 已标记为 **Archived**（最后活跃约 2024 年初）。学习 Remax 仍有价值——它清晰展示了 `react-reconciler` 自定义渲染器、VNode 桥接 `setData` 的经典范式；新项目选型请对照 Taro 3+、uni-app 等仍在维护的方案。

## 为什么重要

不理解 Remax，读「React 跑在小程序里」类文章容易和 Taro、kbone 混为一谈：

- **运行时 vs 编译时**：Remax 不限制 JSX 动态能力（map 渲染、条件组件、第三方 React 库），因为 reconciliation 在运行时完成；编译时转译往往要遵守额外语法约束
- **与 kbone 的差异**：kbone 在逻辑层**仿造 DOM/BOM**，任何框架都能挂上去；Remax 只实现了一套 **React 专用 HostConfig**，更轻、更贴 React 生态，但不支持 Vue
- **与 Taro 3 的相似点**：二者都是「真 React + 自定义渲染器 + 各端组件映射」；Taro 持续维护且覆盖 H5/RN，Remax 更专注小程序、工程更轻，历史上有支付宝/淘宝内部实践
- **读懂架构的迁移价值**：掌握 VNode → Page `data` → 递归模板 这条链路，有助于理解所有「setData 驱动 UI」的小程序框架性能瓶颈

## 核心概念

Remax 工程分为 **`remax`（运行时）** 与 **`remax-cli`（构建）** 两部分。心智模型可拆成六块：

### 1. react-reconciler 自定义渲染器

Remax 在小程序 Worker 线程里注册 React 的 reconciler。开发者写的组件经 reconciliation 后，不直接操作 DOM，而是更新一棵 **VNode 树**（带 `id`、`type`、`props`、`children` 的 JSON 友好结构）。类比：React 以为自己在改 DOM，实际改的是后台的「广播稿」。

### 2. VNode → setData → 视图

更新完成后，根容器调用 `applyUpdate`，把 VNode 序列化后通过小程序原生 **`setData`** 写入 Page 的 `data`（常见根字段为 `root`）。渲染层不靠手写 WXML，而靠 **构建期生成的通用模板**：按 `item.type` 选择 `REMAX_TPL_view`、`REMAX_TPL_text` 等模板递归展开子节点。微信模板不支持真递归，因此会为微信生成约 **20 层**嵌套模板调用——这是平台限制下的工程折中。

### 3. 平台包：`remax/wechat`、`remax/ali`、`remax/toutiao`

组件与 API 按端分包导入，避免把微信专用能力打进支付宝包：

| 导入路径 | 用途 |
|----------|------|
| `remax/wechat` | 微信 / QQ 小程序 `View`、`navigateTo`、`request` 等 |
| `remax/ali` | 支付宝、钉钉、淘宝等阿里系 |
| `remax/toutiao` | 字节跳动小程序 |
| `remax` | 跨端 Hooks（如 `usePageEvent`）与运行时工具 |

事件名贴近小程序习惯：微信侧常用 `onTap`，阿里侧常用 `onClick`，写多端时要读各端文档或做封装层。

### 4. 应用与页面都是 React 组件

- **`src/app.js`**：默认导出的 `App` 组件；必须 `render` 出 `props.children`；可用 `componentDidMount`（对应 `onLaunch`）、`onShow` 等应用生命周期
- **`src/app.config.js`**：对应原生 `app.json`（`pages`、`window` 等）；多端时可 `module.exports = { wechat: {...}, ali: {...} }`
- **页面**：`src/pages/foo/index.js` 默认导出页面组件；配置在同级 `index.config.js`
- **页面参数**：通过 `props.location.query` 传入（函数组件），等价于小程序 `onLoad` 的 query

官方建议用 **React Context** 做全局状态，而不是小程序的 `getApp()`——Remax 的 `App` 实例与原生 `getApp` 不是同一对象。

### 5. 生命周期 Hooks

函数组件可用：

- `usePageEvent('onShow', fn)` / `usePageEvent('onLoad', fn)` — 页面级；**子组件里也能注册**（与 class 仅限页面不同）
- `useAppEvent('onLaunch', fn)` — 应用级
- `useShow(fn)` — 简化版页面 `onShow`

类组件页面则直接在 class 上定义 `onShow`、`componentDidMount`（触发时机对齐 `onLoad`）。

### 6. 编译链：页面入口与资源生成

`remax-cli` 在 Webpack 构建中：

1. 为每个页面注入 `createPageConfig`，把 React 组件挂到自定义 `Container`
2. 调用原生 `Page()` 注册小程序页面
3. 插件生成对应 `wxml`/`axml`、样式与 `usingComponents` 依赖图
4. 普通 React 组件可编译为**小程序自定义组件**

## 示例一：应用入口 + 首页（支付宝端）

```jsx
// src/app.js
import * as React from 'react';
import { useAppEvent } from 'remax';
import './app.css';

export default function App({ children }) {
  useAppEvent('onLaunch', () => {
    console.log('Remax app launched');
  });

  return children;
}
```

```js
// src/app.config.js
module.exports = {
  pages: ['pages/index/index'],
  window: {
    defaultTitle: 'Remax Demo',
  },
};
```

```jsx
// src/pages/index/index.js
import * as React from 'react';
import { View, Text, Button, navigateTo } from 'remax/ali';
import { usePageEvent } from 'remax';
import './index.css';

export default function IndexPage(props) {
  const [count, setCount] = React.useState(0);

  usePageEvent('onShow', () => {
    console.log('index onShow', props.location?.query);
  });

  return (
    <View className="wrap">
      <Text className="title">你好，Remax</Text>
      <Text>计数：{count}</Text>
      <Button onClick={() => setCount((c) => c + 1)}>+1</Button>
      <Button
        onClick={() =>
          navigateTo({ url: '/pages/detail/index?id=42' })
        }
      >
        去详情
      </Button>
    </View>
  );
}
```

要点：`App` 只包一层 `children`；页面即普通函数组件；`useState` 与 Web React 相同；导航走 `remax/ali` 的 `navigateTo`；样式用独立 `.css` 文件按页引入。

## 示例二：微信端列表请求 + 下拉刷新

```js
// src/pages/list/index.config.js
module.exports = {
  navigationBarTitleText: '商品列表',
  enablePullDownRefresh: true,
};
```

```jsx
// src/pages/list/index.js
import * as React from 'react';
import { View, Text, Image, request, stopPullDownRefresh } from 'remax/wechat';
import { usePageEvent } from 'remax';

export default function ListPage() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await request({
        url: 'https://api.example.com/items',
        method: 'GET',
      });
      setItems(res.data?.list ?? []);
    } finally {
      setLoading(false);
      stopPullDownRefresh();
    }
  }, []);

  usePageEvent('onLoad', load);
  usePageEvent('onPullDownRefresh', load);

  return (
    <View className="list">
      {items.map((item) => (
        <View key={item.id} className="card">
          <Image src={item.cover} mode="aspectFill" />
          <Text>{item.title}</Text>
        </View>
      ))}
      {loading && <Text>加载中…</Text>}
    </View>
  );
}
```

`remax/wechat` 导出的 API 多数已 **Promise 化**（`request().then(...)`），与微信回调风格并存；页面配置写在 `index.config.js`，构建时生成 `index.json`。

## 项目结构

```
my-app/
├── package.json
├── remax.config.js      # 可选：Webpack 钩子、插件
├── public/                # 静态资源
├── dist/                  # 编译产物，用各端开发者工具打开
└── src/
    ├── app.js
    ├── app.css
    ├── app.config.js
    └── pages/
        └── index/
            ├── index.js
            ├── index.css
            └── index.config.js
```

| 命令 | 作用 |
|------|------|
| `npm run dev` | 监听编译到 `dist/` |
| `npm run dev wechat` | 跨平台仓库指定微信端 |
| `npm run build` | 生产构建 |

## 跨平台实践

官方推荐的跨端路径偏**务实**：

1. 先在一端用 Remax 跑通业务
2. 另一端新建项目对照差异，而不是一开始就「一套代码打天下」
3. 把差异收敛到 `@/components`、`@/api`、`@/hooks` 封装层；页面保持纯业务 JSX

`app.config.js` / `page.config.js` 可导出 `{ wechat, ali, toutiao }` 对象，CLI 按构建目标选取配置。

## 与相关技术的关系

| 技术 | 关系 |
|------|------|
| React | Remax 是渲染目标之一，不修改 React 语义；可复用多数纯逻辑 Hook 与组件 |
| Taro 3+ | 同为运行时 React；Taro 维护更活跃、端更多（含 H5/RN） |
| kbone | 仿 DOM 通用层，框架无关；Remax 仅 React，链路更短 |
| Rax 小程序 | 阿里系另一路线，含编译时与运行时混合；Remax 更「纯 React」 |
| 微信原生 | 最终仍受 `setData` 性能与包体积约束；复杂原生能力需直接调 `wx.*` |

## 性能与限制

- **setData 瓶颈**：VNode  diff 后再 setData，比整树盲传好，但高频大对象更新仍会卡；列表要虚拟化、分页，避免一次绑定上千节点
- **模板深度**：微信 20 层模板嵌套限制极深组件树；过深嵌套需扁平化结构
- **包体积**：运行时 + React reconciler 有固定开销，比纯原生或纯编译方案更大
- **仓库归档**：安全补丁与新端适配需自行评估；生产新项目建议对比 Taro / 原生

## 常见问题

**能用 Redux / MobX 吗？** 可以，它们是 React 生态；注意持久化用各端 `storage` API，不要依赖 `localStorage`。

**能用 React Router 吗？** 小程序路由由 `app.config` 的 `pages` 声明，页面跳转走 `navigateTo` 等；SPA 式路由需自行封装，不如 H5 自由。

**`usePageEvent` 在子组件里会重复触发？** 历史版本有过 bug（同路由跳转、子组件 setState 导致父级不触发等），升级 `remax` 小版本并避免在 `onShow` 里做过多同步状态连锁更新。

**样式方案**：支持 CSS、Less、Sass；无完整浏览器 CSS 支持，flex 布局最稳；类名用 `className` 传到小程序 `class`。

## 小结

Remax 的核心贡献是证明：**不必牺牲 React 运行时，也能在微信/支付宝等小程序里开发**。实现上 = `react-reconciler` + VNode + 构建期通用模板 + `setData`。零基础学习路径：用 `create-remax-app` 跑通单页 → 分清 `remax/平台` 组件与 API → 用 `usePageEvent` 接生命周期 → 读一眼 VNode/模板原理理解性能边界 → 若做新项目，再与 Taro 等维护中方案对比选型。即使 Remax 不再演进，这套「自定义 React 渲染器」知识对 React Native、Canvas、终端 UI 同样适用。

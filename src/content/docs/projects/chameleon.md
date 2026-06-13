---
title: Chameleon — 滴滴「变色龙」跨端框架，一套 CML 跑遍 Web / 小程序 / Weex
来源: https://github.com/didi/chameleon
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

Chameleon（简称 **CML**，中文名「卡梅龙」）是滴滴开源的**跨端统一开发框架**：你用一套自研的 CML 语言写页面，同一工程可以编译到 Web、微信/支付宝/百度/QQ/字节跳动小程序、快应用，以及基于 Weex 的 iOS/Android 原生渲染。官方口号是「**一端所见即多端所见**」——在浏览器里预览成什么样，各端应尽量一致，不必为每个平台单独翻文档。

日常类比：Chameleon 像一只**变色龙**。同一只蜥蜴（你的 `.cml` 源码）会根据栖息环境（微信、支付宝、H5、Weex）自动换皮，但骨骼和肌肉（MVVM 结构、生命周期、组件模型）保持不变。你不必为雨林、沙漠、岩石各养一只不同的宠物——维护一份「物种说明书」即可。

它和「把 H5 塞进 WebView」或「纯编译时字符串替换」都不同。Chameleon 在**语言层**定义统一框架，再用**多态协议**把业务代码与各端底层能力隔开：公共逻辑里不能直接写 `wx.`、`my.`、`window` 等平台专有对象，必须通过标准接口扩展，从而在大型项目里保住可维护性。

```bash
# 全局安装 CLI（官方要求 npm，暂不建议 yarn/cnpm 安装工具链）
npm i -g chameleon-tool

# 创建项目并启动开发预览
cml init project
cd <你的项目名>
cml dev

# 内置 Todo 示例，适合学习数据流与页面结构
cml init project --demo todo
```

## 为什么重要

不理解 Chameleon，以下问题容易在跨端选型里踩坑：

- **滴滴系业务为何曾押注 CML**：2019 年前后小程序与 App 入口爆炸，同一功能要在微信、支付宝、百度、快应用、Weex 各写一遍，维护成本指数上升；Chameleon 试图从「前端中台」角度统一 MVVM，而不是只做语法转译
- **与 Taro / uni-app 的差异**：Taro 以 React/Vue 为源码、运行时适配各端；uni-app 以 Vue 为核心；Chameleon 用**自研 CML + 类 Vue 语法**，更强调语言级一致性与多态协议边界
- **「能跑」和「能长期维护」不是一回事**：跨 6 个端、扩展上百个 API 时，若公共代码里散落平台分支，跨端收益会被维护债吃掉——这正是多态协议要解决的问题
- **渐进式接入**：不必一次性重写老项目；可用 CML 只写可复用组件或新页面，再嵌入各端原生工程

## 核心概念

Chameleon 的技术栈可以拆成七块：

### 1. 三层文件模型：CML + CMSS + JS

类比网页开发的 HTML + CSS + JavaScript，Chameleon 使用：

| 层 | 名称 | 作用 |
|----|------|------|
| 结构 | **CML**（Chameleon Markup Language） | 模板、条件/列表渲染、数据绑定 |
| 样式 | **CMSS** | 写在 `.cml` 的 `<style>` 中，跨端样式 |
| 逻辑 | **JS** | 类组件或 Vue 风格 `export default` |

一个 `.cml` 文件把模板、脚本、样式、JSON 配置（如 `usingComponents`）收进**单文件组件**，类似 Vue SFC，但标签是跨端语义组件（`view`、`text`、`button` 等），不是 `div`/`span`。

### 2. MVVM 跨端大统一

各端底层千差万别，但 Chameleon 认定共同点都是 **MVVM**：统一生命周期、内置组件、事件、路由、布局单位、组件作用域与通信方式，让开发者「学一次，写多端」。你在 CML 里写的 `data`、`methods`、模板绑定，由编译链映射到各端视图更新机制（小程序 `setData`、Web DOM、Weex 原生视图等）。

### 3. 多态协议（Polymorphic Protocol）

这是 Chameleon 区别于许多跨端方案的核心设计，灵感来自 Apache Thrift 的跨语言接口思想：

1. 为能力定义**标准 interface**（输入输出类型与结构）；
2. 各端**独立实现**该 interface；
3. 编译期与运行期做类型/结构检查；
4. **业务公共代码禁止**直接调用 `window`、`wx`、`my`、`swan`、`weex` 等端专有全局对象——即使写在 `if` 里也不行。

类比：多态协议是**海关检疫口**。货物（业务逻辑）出境前必须符合统一报关单（interface），各口岸（平台）各自清关，但货单格式全球一致。你想加「刷脸登录」这种新能力，扩展的是接口实现包，而不是在 5 万行业务文件里复制粘贴 6 份 `wx.login` / `my.getAuthCode`。

### 4. chameleon-api 统一 API 层

常用能力封装在 npm 包 **`chameleon-api`**：网络请求、本地存储、地理位置、系统信息、动画等。业务侧调用统一函数，底层由多态实现路由到各端。这样扩展 100 个接口时，仍保持公共调用签名一致。

### 5. chameleon-tool CLI 与 Webpack 工程链

`chameleon-tool` 提供 `cml init`、`cml dev`、`cml build`，并按端分子命令：

| 命令 | 目标 |
|------|------|
| `cml web dev` / `cml web build` | Web |
| `cml wx dev` / `cml wx build` | 微信小程序 |
| `cml alipay dev` / `build` | 支付宝小程序 |
| `cml baidu dev` / `build` | 百度小程序 |
| `cml weex dev` / `build` | Weex（iOS/Android） |

开发模式常同时构建 Web 端，便于 API Mock 与预览。生产构建读 `chameleon.config.js`，可用 `devOffPlatform` / `buildOffPlatform` 关闭不需要的端。

### 6. 项目目录与路由

典型工程结构：

```
├── chameleon.config.js    # 构建与多端开关
├── dist/                  # 各端产出
├── mock/                  # 本地 mock 数据
├── package.json
└── src/
    ├── app/               # 应用入口（app.cml）
    ├── pages/             # 页面，每页一个 .cml
    ├── components/        # 可复用组件
    ├── router.config.json # 路由表
    └── store/             # 全局状态
```

路由在 `router.config.json` 集中声明，页面通过 `cml init page` 脚手架生成，组件通过 `cml init component` 生成。JSON 配置块写在 `<script cml-type="json">` 中，用于注册 `usingComponents` 等，风格接近小程序 `json` 配置。

### 7. 渐进式跨端与生态

- **C-Design**：基于 CML 的多端 UI 组件库（选择器、索引列表、消息提示等）；
- **G 服务扩展**：统一云存储、数据库、云函数等后端能力接入（面向小程序场景）；
- 老项目可只把**高复用组件**用 CML 重写，再在各端原生壳里引用，降低迁移门槛。

创建项目时可选 `--lang vue` 使用 Vue 风格模板，默认 `cml` 为类组件写法；`--demo todo` 可生成官方 TodoList 学习模板。

## 示例一：计数器首页（CML 单文件）

下面是一个最小页面：展示环境信息、计数与按钮跳转。注意标签使用 `view`/`text`/`cml-button`，逻辑用 class 或 Vue 风格导出。

```vue
<!-- src/pages/index/index.cml -->
<template>
  <view class="index">
    <text class="title">你好，Chameleon</text>
    <text class="subtitle">当前计数：{{ count }}</text>
    <cml-button type="primary" c-bind:tap="onAdd">点我 +1</cml-button>
    <cml-button c-bind:tap="goList">去看列表页</cml-button>
  </view>
</template>

<script>
class Index {
  data = {
    count: 0,
  };

  onAdd() {
    this.count += 1;
  }

  goList() {
    // 路由跳转由各端 adapter 处理，路径与 router.config.json 一致
    this.$cml.navigateTo({ path: '/pages/list/list' });
  }
}

export default new Index();
</script>

<style scoped>
.index {
  padding: 40px;
  align-items: center;
}
.title {
  font-size: 36px;
  font-weight: 600;
  margin-bottom: 24px;
}
.subtitle {
  font-size: 28px;
  color: #666;
  margin-bottom: 32px;
}
</style>

<script cml-type="json">
{
  "base": {
    "navigationBarTitleText": "首页"
  }
}
</script>
```

要点：`c-bind:tap` 绑定点击；样式写在同一文件；页面标题走 JSON 配置块。开发时 `cml dev` 会在浏览器打开预览，并并行构建已启用的小程序/Weex 产物到 `dist/`。

## 示例二：chameleon-api 拉列表 + 自定义组件

列表页演示网络请求、下拉刷新与组件引用——跨端应走 `chameleon-api`，而不是 `wx.request`。

```vue
<!-- src/pages/list/list.cml -->
<template>
  <view class="list-page">
    <order-card
      c-for="(item, index) in orders"
      c-bind:key="item.id"
      c-bind:order="item"
      c-bind:tap="onTapOrder"
      data-id="{{ item.id }}"
    />
    <text c-if="loading" class="hint">加载中…</text>
    <text c-elif="!orders.length" class="hint">暂无订单</text>
  </view>
</template>

<script>
import cml from 'chameleon-api';

class List {
  data = {
    orders: [],
    loading: false,
    page: 1,
  };

  created() {
    this.fetchOrders(true);
  }

  async fetchOrders(reset = false) {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await cml.request({
        url: 'https://api.example.com/orders',
        method: 'GET',
        data: { page: reset ? 1 : this.page },
      });
      const list = res.data?.list ?? [];
      this.orders = reset ? list : this.orders.concat(list);
      if (!reset) this.page += 1;
    } catch (e) {
      await cml.showToast({ message: '加载失败', duration: 2000 });
    } finally {
      this.loading = false;
      cml.stopPullDownRefresh();
    }
  }

  onPullDownRefresh() {
    this.page = 1;
    this.fetchOrders(true);
  }

  onTapOrder(evt) {
    const id = evt.currentTarget.dataset.id;
    this.$cml.navigateTo({ path: `/pages/detail/detail?id=${id}` });
  }
}

export default new List();
</script>

<style scoped>
.list-page {
  padding: 24px;
}
.hint {
  text-align: center;
  color: #999;
  margin-top: 48px;
}
</style>

<script cml-type="json">
{
  "base": {
    "navigationBarTitleText": "订单列表",
    "enablePullDownRefresh": true,
    "usingComponents": {
      "order-card": "../../components/order-card/order-card"
    }
  }
}
</script>
```

```vue
<!-- src/components/order-card/order-card.cml -->
<template>
  <view class="card">
    <text class="id">#{{ order.id }}</text>
    <text class="status">{{ order.status }}</text>
  </view>
</template>

<script>
class OrderCard {
  props = ['order'];
}
export default new OrderCard();
</script>

<style scoped>
.card {
  padding: 24px;
  margin-bottom: 16px;
  background: #fff;
  border-radius: 12px;
}
.id { font-size: 28px; font-weight: 600; }
.status { font-size: 24px; color: #07c160; margin-top: 8px; }
</style>

<script cml-type="json">
{}
</script>
```

要点：`cml.request` / `cml.showToast` 替代平台原生 API；`c-for`、`c-if` 做列表与空态；组件通过 `usingComponents` 注册路径；下拉刷新在 JSON 里 `enablePullDownRefresh: true`，逻辑里 `onPullDownRefresh` 与 `cml.stopPullDownRefresh()` 配对。

## 与 Taro、uni-app 怎么选

| 维度 | Chameleon | Taro | uni-app |
|------|-----------|------|---------|
| 源码语法 | CML（类 Vue / 可选 Vue） | React 或 Vue | Vue |
| 一致性保障 | 语言层 + 多态协议强约束 | 运行时 + 组件映射 | 编译器 + `uni` API |
| 典型场景 | 滴滴/青桔等历史 CML 项目、强一致多端 | React 团队、京东系 | Vue 团队、DCloud 生态 |
| 学习曲线 | 需学 CML 与多态扩展规则 | 会 React/Vue 即可 | 会 Vue 即可 |

若团队已深度使用 React 或 Vue，Taro/uni-app 往往更顺手；若你要理解「**用协议边界管住跨端维护性**」这一设计思路，或维护遗留 CML 工程，Chameleon 值得系统学习。

## 学习路径建议

1. 读官方站 [CML.JS.org](https://cml.js.org) 的「快速上手」「CML 语法」「多态协议」三章；
2. `cml init project --demo todo` 跑通 Todo，观察 `store` 与页面通信；
3. 用 `cml wx dev` 在微信开发者工具打开 `dist` 下微信产物，对照 Web 预览差异；
4. 尝试为一个简单 API（如自定义分享）写多态 interface + 各端实现包；
5. 浏览 [awesome-cml](https://github.com/chameleon-team/awesome-cml) 与滴滴青桔实践分享，了解真实业务边界。

## 小结

Chameleon 不是简单的「小程序语法翻译器」，而是滴滴在入口碎片化时代提出的**跨端 MVVM 统一语言 + 多态协议**方案：`.cml` 单文件承载 UI 与逻辑，`chameleon-tool` 一次构建多端，`chameleon-api` 屏蔽平台 API 差异，多态协议防止公共代码被 `wx`/`my` 污染。作为零基础学习者，把它当成「会变色的中央厨房」——菜谱（CML）一份，各分店（平台）按统一卫生标准（interface）出餐，才能在大规模迭代里仍吃得下跨端这碗饭。

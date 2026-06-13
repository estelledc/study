---
title: uni-app — 一套 Vue 代码跑遍小程序、H5 与 App
来源: https://github.com/dcloudio/uni-app
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

uni-app 是 DCloud 推出的**跨平台前端框架**：你用 Vue 语法写页面，同一套工程可以编译发布到 iOS、Android、鸿蒙、H5（响应式 Web）、以及微信/支付宝/百度/抖音/QQ/快手/钉钉/淘宝/京东/小红书等小程序与快应用。日常类比：uni-app 像一家连锁便利店的**统一供应链**——总部（你写的 Vue 代码）只定一份货品清单和陈列标准，各分店（各端运行时）按当地法规（平台 API）上架同款商品，顾客在哪家店买到的都是同一品牌，不必为每个城市单独建厂。

它和「把 H5 塞进 WebView 壳」不同。uni-app 在底层拆成**编译器 + 运行时**：编译器把 `.vue` 转成各端可执行的代码；运行时在各平台提供统一的组件、路由和 `uni` API 封装，必要时再通过条件编译调用平台专有能力的「加长货架」。

```bash
# 使用 HBuilderX 或 Vue CLI 创建项目（Vue 3 示例）
npx degit dcloudio/uni-preset-vue#vite-ts my-uni-app
cd my-uni-app
npm install
npm run dev:h5          # 浏览器预览
npm run dev:mp-weixin   # 微信开发者工具预览
npm run build:app       # 打包 App（需 HBuilderX 云打包或本地证书）
```

## 为什么重要

不理解 uni-app，以下场景容易选型失误或反复踩坑：

- **业务要「小程序 + H5 + App」齐发**：自研三套前端团队成本极高；uni-app 让会 Vue 的团队用一套技能栈覆盖主流端
- **已有 Vue H5 想进微信生态**：语法与组件模型接近 Vue + 小程序规范，迁移成本低于从零学各端原生
- **各端 API 名称不一致**：`uni.request`、`uni.navigateTo` 等统一封装，屏蔽大部分 `wx.` / `my.` / `plus.` 差异
- **与 Taro 的取舍**：Taro 偏 React/Vue 双栈 + 京东系验证；uni-app 默认 Vue 生态 + DCloud 工具链（HBuilderX、uniCloud、插件市场），国内小程序/App 案例与插件更丰富
- **性能敏感页面**：App 端可选 `nvue` 原生渲染，比纯 WebView 的 `.vue` 页面更适合长列表、地图等场景

## 核心概念

uni-app 的技术栈可以拆成七块：

### 1. 编译器 + 运行时（跨端原理）

官方把跨端能力拆成两部分配合完成：

| 部分 | 职责 |
|------|------|
| **编译器** | 解析 `.vue`、条件编译、把模板/脚本/样式转成目标平台代码 |
| **运行时（runtime）** | 在各端提供 Vue 运行时、页面路由、内置组件、`uni` API |

- **小程序端**：runtime 类似「小程序版 Vue」，路由与组件多是对各小程序规范的转义
- **Web 端**：在普通 Vue 项目上增加 uni 的 UI 库、路由框架和 `uni` 对象
- **App 端**：逻辑层跑在 JS 引擎（Android 为 V8，iOS 为 JavaScriptCore），渲染层可选 WebView（`.vue`）或原生（`.nvue`）

类比：编译器是「翻译官」，runtime 是「当地导游」——翻译官把中文稿子改成当地语言稿，导游在现场带你走正确的路和门禁（平台 API）。

### 2. 页面结构与路由

uni-app 采用**多页应用**模型（类似各端小程序），不是 SPA 单页：

- 页面文件放在 `pages/` 目录，每个页面一个文件夹，主文件为 `index.vue`
- 在根目录 `pages.json` 注册页面路径、窗口样式、`tabBar`、分包等
- 路由用 `uni.navigateTo`、`uni.redirectTo`、`uni.switchTab` 等 API，不用 Vue Router

```json
{
  "pages": [
    {
      "path": "pages/index/index",
      "style": { "navigationBarTitleText": "首页" }
    },
    {
      "path": "pages/detail/detail",
      "style": { "navigationBarTitleText": "详情" }
    }
  ],
  "globalStyle": {
    "navigationBarTextStyle": "black",
    "navigationBarBackgroundColor": "#F8F8F8"
  },
  "tabBar": {
    "color": "#7A7E83",
    "selectedColor": "#3cc51f",
    "list": [
      {
        "pagePath": "pages/index/index",
        "text": "首页",
        "iconPath": "static/tab-home.png",
        "selectedIconPath": "static/tab-home-active.png"
      },
      {
        "pagePath": "pages/detail/detail",
        "text": "详情",
        "iconPath": "static/tab-detail.png",
        "selectedIconPath": "static/tab-detail-active.png"
      }
    ]
  }
}
```

### 3. 组件与标签

跨端使用内置组件，而非 HTML 标签（H5 编译后会映射为 DOM）：

| uni 组件 | 小程序 | H5（近似） | 说明 |
|----------|--------|------------|------|
| `view` | `view` | `div` | 布局容器 |
| `text` | `text` | `span` | 文本，支持嵌套 |
| `image` | `image` | `img` | 图片，`mode` 控制裁剪 |
| `button` | `button` | `button` | 按钮，注意各端默认样式差异 |
| `scroll-view` | `scroll-view` | 可滚动 div | 区域滚动 |

样式支持 `class` + `rpx`（以 750 设计稿为基准的逻辑像素）、内联 `style`，以及 `scss`/`less` 等预处理器。

### 4. uni API 与网络请求

浏览器里的 `fetch` / `axios` 在小程序里不能直接用；统一走 `uni` 命名空间：

```js
// 封装在页面或 composable 中
export function fetchUserProfile(userId) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `https://api.example.com/users/${userId}`,
      method: 'GET',
      header: { Authorization: `Bearer ${getToken()}` },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error(res.data?.message || '请求失败'))
        }
      },
      fail: reject,
    })
  })
}
```

常用 API 还包括：`uni.showToast`、`uni.setStorageSync`、`uni.getSystemInfoSync`、`uni.chooseImage` 等。App 端还可调用 `plus.*`（5+ Runtime）访问更底层的原生能力。

### 5. 条件编译（平台差异化）

同一文件里为不同平台写不同代码，编译时只保留目标平台分支：

```vue
<template>
  <view class="container">
    <!-- #ifdef MP-WEIXIN -->
    <button open-type="getPhoneNumber" @getphonenumber="onGetPhone">
      微信一键登录
    </button>
    <!-- #endif -->

    <!-- #ifdef APP-PLUS -->
    <button @click="nativeLogin">App 原生登录</button>
    <!-- #endif -->

    <!-- #ifdef H5 -->
    <button @click="h5OAuth">H5 扫码登录</button>
    <!-- #endif -->
  </view>
</template>

<script setup>
function onGetPhone(e) {
  console.log('微信手机号授权', e.detail)
}

// #ifdef APP-PLUS
function nativeLogin() {
  plus.oauth.getServices((services) => {
    console.log('可用 OAuth 服务', services)
  })
}
// #endif

function h5OAuth() {
  window.location.href = '/oauth/start'
}
</script>

<style>
/* #ifdef MP */
.container { padding: 32rpx; }
/* #endif */

/* #ifdef H5 */
.container { max-width: 750px; margin: 0 auto; }
/* #endif */
</style>
```

常见平台标识：`H5`、`MP-WEIXIN`、`MP-ALIPAY`、`APP-PLUS`、`APP-PLUS-NVUE` 等。`#ifndef` 表示「非某平台」。

### 6. Vue 版本与组合式 API

uni-app 支持 Vue 2 与 Vue 3（新项目推荐 Vue 3 + `script setup`）：

```vue
<!-- pages/index/index.vue -->
<template>
  <view class="page">
    <text class="title">{{ greeting }}</text>
    <input v-model="keyword" placeholder="搜索商品" />
    <button @click="search">搜索</button>
    <view v-for="item in list" :key="item.id" class="card">
      <text>{{ item.name }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'

const keyword = ref('')
const list = ref([])
const page = ref(1)

const greeting = computed(() =>
  list.value.length ? `共 ${list.value.length} 条` : '暂无数据'
)

async function loadData(reset = false) {
  if (reset) page.value = 1
  const res = await uni.request({
    url: 'https://api.example.com/items',
    data: { q: keyword.value, page: page.value },
  })
  const rows = res.data?.items ?? []
  list.value = reset ? rows : [...list.value, ...rows]
}

function search() {
  loadData(true)
}

onMounted(() => loadData(true))

onPullDownRefresh(async () => {
  await loadData(true)
  uni.stopPullDownRefresh()
})

onReachBottom(() => {
  page.value += 1
  loadData(false)
})
</script>

<style scoped>
.page { padding: 24rpx; }
.title { font-size: 36rpx; font-weight: 600; }
.card { margin-top: 16rpx; padding: 20rpx; background: #fff; border-radius: 12rpx; }
</style>
```

页面生命周期除 Vue 的 `onMounted` 外，还有 uni 专用钩子（如 `onLoad`、`onShow`、`onPullDownRefresh`），需从 `@dcloudio/uni-app` 导入。

### 7. nvue、uniCloud 与生态扩展

- **nvue**：App 端原生渲染页面，使用 Weex 风格 flex 布局，适合高性能列表与动画；与 `.vue` 页面可通过路由混用
- **uni_modules**：插件模块化规范，类似 npm 但针对 uni-app 组件与 SDK 分发
- **uniCloud**：DCloud 提供的云开发（云函数、云数据库），与客户端 `uniCloud.callFunction` 深度集成
- **uts**：类 TypeScript 的跨端原生插件语言，可写高性能原生模块

## 开发工具链

| 工具 | 用途 |
|------|------|
| **HBuilderX** | DCloud 官方 IDE，内置运行、调试、云打包、真机同步 |
| **Vue CLI / Vite 模板** | 习惯 VS Code / WebStorm 的开发者可用 CLI 创建 `uni-preset-vue` 项目 |
| **微信开发者工具** | 预览与调试 `dev:mp-weixin` 产物 |
| **uni 插件市场** | 登录、支付、地图、UI 库等成品模块 |

本地调试常见命令：

```bash
npm run dev:h5
npm run dev:mp-weixin
npm run dev:mp-alipay
npm run build:h5
npm run build:mp-weixin
```

## 与相关技术的关系

| 技术 | 关系 |
|------|------|
| Vue.js | uni-app 基于 Vue 语法与响应式模型；Vue 3 项目用 `createSSRApp` 等入口由 `@dcloudio/uni-app` 封装 |
| 微信小程序 | 组件与 API 设计大量对齐微信规范，降低小程序开发心智负担 |
| Taro | 同为跨端方案；Taro 更偏 React 与编译时+运行时双轨，uni-app 更偏 Vue + DCloud 全家桶 |
| React Native | App 端 nvue 渲染思路接近 RN；uni-app 则强调「一套 Vue 代码」而非 RN 组件树 |
| Flutter | Flutter 自绘引擎、Dart 语言；uni-app 走 Web/小程序运行时转义，学习曲线对前端更友好 |
| uniCloud | 可选后端，与客户端同一厂商，适合中小项目快速全栈 |

## 常见问题与最佳实践

1. **样式单位**：设计稿 750 宽时用 `rpx` 做自适应；固定边框可用 `px`。H5 需注意 `rpx` 与 rem 的换算。
2. **图片与静态资源**：放 `static/` 目录，路径以 `/static/...` 引用；大图与字体注意各小程序包体积限制（主包一般 2MB 内）。
3. **登录与支付**：各端差异大，优先用插件市场成熟方案，再用条件编译补边角。
4. **避免直接使用 DOM/BOM**：`document`、`window` 仅在 H5 条件编译块中使用。
5. **分包加载**：页面多时配置 `subPackages`，加快小程序首屏与通过审核。
6. **TypeScript**：官方模板支持 TS；为 `uni` API 配置 `@dcloudio/types` 获得类型提示。

## 学习路径建议

1. 熟悉 Vue 3 基础（`ref`、`computed`、`script setup`）
2. 用 HBuilderX 或 Vite 模板跑通 H5 + 微信小程序双端预览
3. 精读 `pages.json` 与页面生命周期文档
4. 练习条件编译处理登录、分享等平台差异
5. 需要 App 性能时了解 nvue 与原生插件；需要后端时了解 uniCloud

## 参考资源

- 官方文档：https://uniapp.dcloud.net.cn
- GitHub 仓库：https://github.com/dcloudio/uni-app
- 跨端原理：https://uniapp.dcloud.net.cn/tutorial/
- 条件编译：https://uniapp.dcloud.net.cn/tutorial/platform.html
- 插件市场：https://ext.dcloud.net.cn

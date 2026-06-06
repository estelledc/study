---
title: electron-builder — 一条命令把 Electron 应用打包发布到全平台
来源: 'https://github.com/electron-userland/electron-builder'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 中级
---

## 是什么

electron-builder 是把 Electron 桌面应用从"能跑"变成"能装"的打包工具。日常类比：就像快递公司帮你把商品装箱、贴标签、发往全国——你只管做好产品，剩下的运输、签收、退换货流程它全包。

你写完 Electron 应用后，只需在 `package.json` 里写几行配置，再跑一条命令：

```bash
npx electron-builder
```

它就会帮你生成：
- macOS：`.dmg` 安装盘镜像、`.pkg`、Mac App Store 包
- Windows：`.exe` NSIS 安装程序、`.msi`、Microsoft Store AppX 包
- Linux：`.AppImage`、`.deb`、`.rpm`、`.snap` 等

内置代码签名、自动更新（auto-update）、差分下载，开箱即用，不需要手动配置每个平台的打包脚本。

## 为什么重要

不理解 electron-builder，下面这些事都没法解释：

- 为什么 VS Code、Slack、Discord 这类 Electron 应用能在 macOS 上通过 Gatekeeper 安全检测——代码签名 + notarization 是 electron-builder 帮你完成的
- 为什么用户启动应用后能自动收到更新提示、后台静默下载——这是 `electron-updater` 模块在协调，而它就是 electron-builder 的一部分
- 为什么在 GitHub Actions 上能跑出三个平台的安装包——electron-builder 的 Docker 镜像和 CI 文档让跨平台构建变成标准流程
- 为什么 Electron 应用的 `node_modules` 不会全部打进安装包——electron-builder 自动过滤开发依赖，只打生产依赖

## 核心要点

1. **配置驱动，而非脚本驱动**：所有打包行为都写在 `package.json` 的 `"build"` 字段（或单独的 `electron-builder.yml`）。你声明"我要 macOS dmg + Windows nsis"，工具负责调用底层 `hdiutil` / `makensis`。类比：点外卖填地址，不用自己骑车送。

2. **asar 打包 + 资源过滤**：应用代码和资源默认打进 `.asar` 档案（类似 zip 但可随机读取）。`files` 字段控制哪些文件进包、哪些排除。类比：行李打包只带必要的衣物，把开发工具和测试文件留在家。

3. **自动更新三件套**：electron-builder 发布时生成 `latest.yml`（记录版本号和 hash），`electron-updater` 运行时拉这个文件判断是否有新版，差分下载只传变化的 block。类比：手机 OTA 升级——只下"补丁"不重下整个系统。

## 实践案例

### 案例 1：跨平台打包配置

一个最小可用的 `package.json` 配置：

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "dist/main.js",
  "build": {
    "appId": "com.example.myapp",
    "productName": "My App",
    "mac": {
      "category": "public.app-category.productivity"
    },
    "win": {
      "target": "nsis"
    },
    "linux": {
      "target": "AppImage"
    }
  },
  "scripts": {
    "dist": "electron-builder",
    "dist:mac": "electron-builder --mac",
    "dist:win": "electron-builder --win",
    "dist:linux": "electron-builder --linux"
  }
}
```

**逐部分解释**：
- `appId`：应用唯一标识，macOS 签名和 Windows 注册表都用这个
- `category`：macOS App Store 上架用的分类字符串
- `target: "nsis"`：Windows 生成带安装界面的 `.exe`（用 NSIS 脚本实现）
- `target: "AppImage"`：Linux 生成自包含的单文件 `.AppImage`，无需安装依赖

### 案例 2：接入 GitHub Releases 自动更新

**第一步**：在 `package.json` 加发布配置：

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "my-org",
      "repo": "my-app"
    }
  }
}
```

**第二步**：在主进程里接入 `electron-updater`：

```js
const { autoUpdater } = require('electron-updater')

app.on('ready', () => {
  autoUpdater.checkForUpdatesAndNotify()
})

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall()
})
```

**第三步**：发版时带上 GitHub token 跑：

```bash
GH_TOKEN=xxx electron-builder --publish always
```

electron-builder 会把安装包和 `latest.yml` 上传到 GitHub Release，用户下次启动时 `electron-updater` 自动检测并提示更新。

### 案例 3：在 GitHub Actions 上做代码签名

```yaml
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run dist
        env:
          # macOS 签名
          CSC_LINK: ${{ secrets.MAC_CERT_P12_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_ASP }}
          # Windows 签名
          WIN_CSC_LINK: ${{ secrets.WIN_CERT_P12_BASE64 }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**关键点**：证书以 base64 编码存在 GitHub Secrets，electron-builder 运行时自动解码、导入钥匙串、完成签名和 macOS notarization，整个过程不需要人工操作。

## 踩过的坑

1. **native addon 没有针对 Electron 重新编译**：`npm install` 装的 `.node` 文件是给 Node.js 编译的，必须在 `postinstall` 脚本里加 `electron-builder install-app-deps`，否则运行时会报 `NODE_MODULE_VERSION mismatch` 崩溃。

2. **files 字段漏掉资源目录**：默认只打包生产 `node_modules` 和 `main` 字段指向的文件，若 `src/assets/` 里有运行时需要的字体、图片没加入 `files`，打出来的包会 `ENOENT` 找不到文件。

3. **macOS notarization 超时**：Apple 的 notarization 服务有时排队，electron-builder 默认等待时间可能不够，需要在配置里加 `"notarize": {"teamId": "..."}` 并使用新版 notarytool API（staple 式旧接口已下线）。

4. **auto-update 的 latest.yml 路径不对**：如果 `publish.provider` 和 `electron-updater` 的 `updateConfigPath` 不一致，或发布到 S3 的 bucket/key 配置有误，用户端会一直显示"已是最新版本"但实际上根本没检测到新版。

## 适用 vs 不适用场景

**适用**：
- 用 Electron 开发的桌面应用需要生成安装包发布给最终用户
- 需要代码签名让 macOS Gatekeeper / Windows SmartScreen 不报安全警告
- 需要内置自动更新，让用户不必手动重新下载新版本
- 在 CI/CD 上自动化构建多平台安装包
- 应用有 native Node.js 模块（C++ addon）需要针对 Electron 重编

**不适用**：
- 纯 Web 应用不需要打桌面包——直接部署到服务器即可
- 需要打包到 iOS / Android 移动端——应改用 [[capacitor]] 或 [[react-native]]
- 想用更轻量、更安全的 Rust 技术栈——可考虑 [[tauri]]（体积小 10 倍，无 Node.js runtime）
- 只需要 macOS 单平台且追求最简——可直接用 `electron-packager` 而不用 electron-builder 的全套

## 历史小故事（可跳过）

- **2013 年**：GitHub 发布 Atom 编辑器时，Electron（当时叫 Atom Shell）还没有正式的打包工具，需要手写平台特定脚本。
- **2015 年**：`electron-packager` 出现，解决了"把应用资源打进一个目录"的问题，但签名、更新、多格式 installer 全靠手工。
- **2015 年**：develar（Vladislav Yudintsev）发起 electron-builder，目标是「一行命令，全平台发布」。
- **2016 年**：1.0 正式版发布，加入内置 `electron-updater`，配合 GitHub Releases 实现了开箱即用的自动更新——这一功能让它迅速取代 electron-packager 成为社区首选。
- **2017 年至今**：VS Code、Slack、Discord、WhatsApp Desktop 等主流 Electron 应用陆续使用或参考了 electron-builder 的打包方案；项目在 GitHub 积累超过 14k Stars，npm 月下载量长期超千万。

## 学到什么

1. **声明式配置比命令式脚本更可维护**：electron-builder 把"我要什么平台、什么格式"写成 JSON，工具来决定如何实现——比自己维护 bash 脚本少 90% 出错面
2. **分发是软件交付的"最后一公里"**：代码写好只是开始，签名、打包、更新、分发渠道每一步都需要专门的工具；electron-builder 把这些统一管理
3. **CI 上的代码签名是可行的**：用环境变量传证书、工具自动处理钥匙串，这个模式可以推广到任何需要"有密钥、无交互"的场景
4. **跨平台构建的核心矛盾是 native 依赖**：asar + 重编 native addon 是 electron-builder 处理跨平台的核心手段，其他跨平台工具（Tauri、Capacitor）也面临类似问题

## 延伸阅读

- 官方文档：[electron.build — Configuration](https://www.electron.build/docs/configuration)（所有 build 字段的完整参考）
- 官方文档：[Auto Update](https://www.electron.build/docs/features/auto-update)（配置 electron-updater 的分步指南）
- 视频教程：[Fireship — Electron in 100 Seconds](https://www.youtube.com/watch?v=m3OjWNFREJo)（快速了解 Electron 生态背景）
- 对比文章：[electron-builder vs Tauri vs Neutralino](https://tauri.app/v1/guides/distribution/sign-macos)（Tauri 官方签名文档，对比视角）
- [[tauri]] —— 用 Rust + WebView 替代 Electron runtime，打包体积小 10 倍

## 关联

- [[tauri]] —— 同为桌面应用打包方案，但用 Rust 替代 Node.js runtime，体积更小、内存更低
- [[vite]] —— 常见的 Electron 前端构建工具，electron-builder 负责后续的发行包阶段
- [[webpack]] —— 另一种与 electron-builder 搭配的前端打包工具，处理渲染进程资源
- [[github-actions]] —— electron-builder 的最常见 CI 宿主，用矩阵 job 同时构建多平台包
- [[capacitor]] —— 类似思路但面向移动端（iOS/Android），把 Web 应用打成原生 App
- [[react-native]] —— 面向移动端的跨平台框架，与 Electron 生态互补而非竞争
- [[docker]] —— electron-builder 提供官方 Docker 镜像，用于在 Linux 上交叉编译 Windows 包

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

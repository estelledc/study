---
title: fastlane — iOS / Android 移动应用发布自动化
来源: https://github.com/fastlane/fastlane
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

fastlane 是一套用 **Ruby DSL** 写的移动应用发布自动化工具，把 iOS / Android 上那些重复、易错、又不得不做的琐事——改版本号、签名、编译、上传 TestFlight / Google Play、截屏、填元数据——串成一条可重复执行的「流水线」。

日常类比：想象你是一家面包店的店长，每天要 **和面 → 发酵 → 进炉 → 贴标签 → 送到各门店**。以前每个步骤靠人记、靠微信群喊；fastlane 相当于把整套 SOP 写进一本 **配方书（Fastfile）**，店员只要喊一声「走 beta 流程」，机器按顺序做完，出错还能自动通知 Slack。

官方仓库：https://github.com/fastlane/fastlane（MIT，40k+ stars，移动端 CI/CD 的事实标准之一）。

最小可运行示例——`fastlane init` 之后常见的 iOS beta 车道：

```ruby
# fastlane/Fastfile
default_platform(:ios)

platform :ios do
  desc "构建并上传到 TestFlight"
  lane :beta do
    increment_build_number
    build_app(scheme: "MyApp")
    upload_to_testflight
  end
end
```

终端一行触发：

```bash
bundle exec fastlane beta
```

## 为什么重要

如果你做原生 iOS / Android 或 React Native / Flutter 的 **上架与内测分发**，不理解 fastlane 会在这些场景吃亏：

- **签名地狱**：iOS 的证书、Provisioning Profile、Keychain 权限在本地和 CI 上行为不一致；`match` 把签名材料集中进加密 Git 仓库，团队与 CI 共用同一套身份
- **「我本机能发，CI 不能发」**：手工点 Xcode Archive 能过，Jenkins 上却报 `No signing certificate`——lane 把环境差异显式化（`setup_ci`、`is_ci`）
- **版本号与元数据漂移**：build number 忘加、截图尺寸不对、What's New 没填——action 原子化每一步，失败点可定位
- **多商店、多轨道**：TestFlight internal/external、Play Console internal/closed/open/production 轨道，`upload_to_*` 参数即文档

和 Expo EAS 的分工：EAS 偏 **RN 云构建 + OTA**；fastlane 偏 **任意原生工程** 在 **你自己的 Mac / CI** 上驱动 Xcode / Gradle，与商店 API 对话。二者常并存——RN 项目用 `eas build` 出包，仍可用 fastlane 提交商店。

## 核心概念

fastlane 的心智模型可以压成四层：

### 1. Action（动作）

最小执行单元，约 **170+ 内置 action**（构建、测试、上传、Git、通知等）。在 Fastfile 里看起来像函数调用：

```ruby
increment_build_number(xcodeproj: "MyApp.xcodeproj")
build_app(scheme: "MyApp", export_method: "app-store")
upload_to_testflight(skip_waiting_for_build_processing: true)
```

历史别名仍常见：`gym` ≈ `build_app`，`scan` ≈ `run_tests`，`pilot` ≈ `upload_to_testflight`，`deliver` ≈ `upload_to_app_store`。

### 2. Lane（车道）

**按名字组织的一组 action**，对应团队里的固定流程：`test`、`beta`、`release`。执行：

```bash
fastlane ios beta      # platform :ios 下的 beta
fastlane android beta  # platform :android 下的 beta
fastlane lanes         # 列出所有车道及 desc
```

Lane 支持 `before_all` / `after_all` / `error` 钩子，以及 **`private_lane`** 做内部子流程拆分。

### 3. Fastfile + Appfile

| 文件 | 作用 |
|------|------|
| `fastlane/Fastfile` | 车道与 action 定义（Ruby DSL） |
| `fastlane/Appfile` | 应用标识：iOS `app_identifier`、`apple_id`；Android `package_name` |
| `fastlane/Matchfile` | `match` 签名同步配置（可选） |
| `fastlane/Pluginfile` | 社区插件依赖（可选） |

`fastlane init` 会在项目根下创建 `fastlane/` 目录并引导选择：截屏、TestFlight、App Store 或手动模板。

### 4. 签名与商店：match + upload

- **match**：在私有 Git 仓库存放加密证书与描述文件，开发机与 CI `readonly` 拉取，避免「每人本地一份 p12」
- **upload_to_testflight / upload_to_app_store**：通过 App Store Connect API（`app_store_connect_api_key` 或 Apple ID 会话）上传
- **upload_to_play_store**：用 Play Console 服务账号 JSON 上传 AAB/APK

## 安装与项目初始化

官方推荐 **Bundler** 锁定 Ruby 依赖，避免系统 Ruby 冲突：

```bash
# 项目根目录
bundle init
echo 'gem "fastlane"' >> Gemfile
bundle install

# 进入 iOS 或 Android 工程根目录
bundle exec fastlane init
```

习惯用法：

- 本地与 CI 统一：`bundle exec fastlane <lane>`
- 更新：`bundle update fastlane`
- CI 第一步：`bundle install`

平台支持：**macOS + Xcode 为 iOS 完整支持**；Linux / Windows 可跑部分 action（如 Android Gradle、spaceship API），但无法本地编 iOS。

## 实践案例

### 案例 1：iOS — TestFlight 内测完整车道

含测试、签名、构建号、上传与 Git 回写——接近真实团队配置：

```ruby
default_platform(:ios)

platform :ios do
  before_all do
    setup_ci if is_ci
  end

  desc "单元测试 + UI 测试"
  lane :test do
    run_tests(
      scheme: "MyApp",
      devices: ["iPhone 16"],
      code_coverage: true
    )
  end

  desc "TestFlight Beta"
  lane :beta do |options|
    match(type: "appstore", readonly: is_ci)

    increment_build_number(
      build_number: ENV["GITHUB_RUN_NUMBER"]
    ) if ENV["GITHUB_RUN_NUMBER"]

    build_app(
      scheme: "MyApp",
      export_method: "app-store",
      output_directory: "./build"
    )

    upload_to_testflight(
      skip_waiting_for_build_processing: true,
      changelog: "CI build #{ENV['GITHUB_SHA']&.slice(0, 7)}"
    )

    unless options[:skip_git]
      commit_version_bump(message: "Bump build by fastlane")
      push_to_git_remote
    end
  end
end
```

**要点解读**：

- `setup_ci`：在 CI 上创建临时 Keychain，解决无 UI 环境下的签名
- `match(..., readonly: is_ci)`：CI 只读拉证书，防止并发 job 改坏仓库
- `ENV["GITHUB_RUN_NUMBER"]`：与 GitHub Actions 构建号对齐，避免重复 build number
- `skip_waiting_for_build_processing`：上传后不阻塞等 Apple 处理（往往要十几分钟）

运行：`bundle exec fastlane ios beta` 或 `bundle exec fastlane beta`（若已 `default_platform(:ios)`）。

### 案例 2：Android — Google Play Beta 轨道

```ruby
default_platform(:android)

platform :android do
  desc "运行 JVM 单元测试"
  lane :test do
    gradle(
      task: "test",
      project_dir: "android/"
    )
  end

  desc "上传 AAB 到 Play Console beta 轨道"
  lane :beta do
    gradle(
      task: "bundle",
      build_type: "Release",
      project_dir: "android/"
    )

    upload_to_play_store(
      track: "beta",
      aab: "android/app/build/outputs/bundle/release/app-release.aab",
      skip_upload_apk: true,
      skip_upload_metadata: true,
      skip_upload_images: true,
      skip_upload_screenshots: true
    )
  end
end
```

Play 侧需事先在 Console 创建应用、配置 **服务账号** 并把 JSON key 路径交给 fastlane（环境变量 `SUPPLY_JSON_KEY` 或 `json_key_file` 参数）。

### 案例 3：match 初始化（iOS 团队签名）

一次性（管理员机器）：

```bash
bundle exec fastlane match init
bundle exec fastlane match appstore
```

`Matchfile` 片段：

```ruby
git_url("git@github.com:your-org/certificates.git")
storage_mode("git")
type("appstore")
app_identifier(["com.example.myapp"])
```

团队成员与 CI 在同一 lane 里调用 `match(type: "appstore", readonly: true)` 即可同步，无需手工导入 p12。

## 与 CI 集成

fastlane 设计目标之一就是 **在 CI 服务器上无人值守跑 lane**。GitHub Actions 最小模板：

```yaml
name: iOS Beta
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: "3.2"
          bundler-cache: true
      - name: Install Apple certificate via match
        env:
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          MATCH_GIT_BASIC_AUTHORIZATION: ${{ secrets.MATCH_GIT_BASIC_AUTHORIZATION }}
        run: bundle exec fastlane match appstore --readonly
      - name: Beta lane
        env:
          APP_STORE_CONNECT_API_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          APP_STORE_CONNECT_API_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          APP_STORE_CONNECT_API_KEY_CONTENT: ${{ secrets.ASC_KEY_CONTENT }}
        run: bundle exec fastlane ios beta skip_git:true
```

常见 CI：GitHub Actions、CircleCI、Bitrise、GitLab CI。密钥通过环境变量或 CI Secret 注入，**不要**把 p12、API Key 写进 Fastfile。

## 常用工具族（历史名称）

| 工具 | 现代 action | 用途 |
|------|-------------|------|
| gym | `build_app` | Xcode 编译、导出 ipa |
| scan | `run_tests` | 跑 XCTest / XCUITest |
| snapshot | `capture_screenshots` | 多语言多设备截屏 |
| match | `match` | 证书与描述文件 Git 同步 |
| pilot | `upload_to_testflight` | 上传 TestFlight |
| deliver | `upload_to_app_store` | 元数据 + 二进制提交审核 |
| supply | `upload_to_play_store` | Google Play 上传 |

## 插件与扩展

内置 action 不够用时，社区 **fastlane plugin** 可扩展（如 Firebase App Distribution、pgyer 内测等）：

```bash
bundle exec fastlane add_plugin firebase_app_distribution
```

`fastlane/Pluginfile` 会记录 gem 依赖；lane 内直接调用插件提供的 action 名。

## 踩坑与最佳实践

1. **一定用 Bundler**：`gem install fastlane` 全局装容易和系统 Ruby、CocoaPods 冲突
2. **CI 与本地同一套 lane**：避免「CI 专用脚本」分叉；用 `is_ci` / `Helper.ci?` 分支细节
3. **App Store Connect API Key 优于 Apple ID 密码**：支持 2FA、适合 CI，无需会话 cookie
4. **Android 用 AAB 而非 APK 上架**：`bundle` task + `upload_to_play_store` 传 aab 路径
5. **lane 要幂等与可重试**：上传失败时，考虑 `increment_build_number` 是否已提交，避免重复 bump
6. **敏感信息**：`match` 加密密码、`MATCH_PASSWORD`、Play JSON、ASC API Key 全部走 Secret
7. **opt_out_usage**：若需关闭匿名使用统计，在 Fastfile 顶部加 `opt_out_usage` 或设 `FASTLANE_OPT_OUT_USAGE`

## 与相邻工具对比

| 维度 | fastlane | Xcode Cloud | EAS (Expo) | Gradle Play Publisher |
|------|----------|-------------|------------|------------------------|
| 平台 | iOS + Android + macOS | 主要 iOS | RN / Expo 生态 | 仅 Android |
| 运行位置 | 本地 Mac / 任意 CI | Apple 云 | Expo 云 | CI / 本地 |
| 配置 | Ruby Fastfile | Xcode 工作流 UI | eas.json | Gradle 插件 |
| 签名 | match 等 | Apple 托管 | EAS 托管凭证 | Play 服务账号 |
| 适合 | 原生或多端统一发布脚本 | 纯 Apple 栈、少运维 | RN 快速迭代 | 纯 Android 管线 |

很多团队 **Xcode Cloud / EAS 负责构建，fastlane 负责上传与元数据**——按团队边界拆分即可。

## 学习路径建议

1. 在现有 App 根目录 `bundle exec fastlane init`，选 Manual，先写 `lane :test` 调 `run_tests` 或 `gradle test`
2. 读官方 [Actions 列表](https://docs.fastlane.tools/actions/)，把手工步骤映射成 action 序列
3. 引入 `match` 统一 iOS 签名，再接入一条 CI `beta` lane
4. 需要截屏审核素材时再加 `capture_screenshots`（snapshot）
5. 查阅 [GitHub Actions 集成文档](https://docs.fastlane.tools/best-practices/continuous-integration/github/) 对齐 Secret 命名

## 进一步阅读

- 官方文档：https://docs.fastlane.tools/
- 概念：Fastfile、Lanes、Actions — https://docs.fastlane.tools/
- 源码与 issue：https://github.com/fastlane/fastlane
- App Store Connect API：https://developer.apple.com/app-store-connect/api/
- Google Play Developer API（supply）：https://developers.google.com/android-publisher

---

*本篇为 pipeline-v3 生成的零基础学习笔记；分类字段由 `node scripts/classify-notes.mjs --apply --area=projects` 自动维护。*

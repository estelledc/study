---
title: Capawesome -- Capacitor 插件生态
来源: https://github.com/capawesome-team/capacitor-plugins
日期: 2026-06-13
分类: 其他
子分类: mobile-cross-platform
provenance: pipeline-v3
---

# Capawesome -- Capacitor 插件生态

## 一、日常类比：手机就像一台智能手表

想象你的手机是一台带触屏的"智能手表"，它本身能做的事情有限 -- 打开网页、跑 JavaScript 代码、显示你写的界面。

但手机硬件还有很多"隐藏技能"：指纹、摄像头、GPS 定位、蓝牙、震动马达、麦克风……这些能力，浏览器出于安全考虑，不会随便交给网页。

**Capacitor** 就是站在中间的那个"翻译官" -- 它让你用写网页的方式（HTML + CSS + JavaScript）写 app，然后帮你在需要的时候，向手机操作系统"借"那些硬件能力。

而 **Capawesome** 的插件生态，就是翻译官背后的那个"工具库"。

## 二、Capacitor 是什么

Capacitor 是由 Ionic 团队开发的开源跨平台 app 运行时。它的工作原理很简单：

1. 你用 JavaScript/TypeScript 写好前端界面（React、Vue、Angular 都行）
2. Capacitor 把这个网页"装进"一个原生 app 壳子里（Android 的 WebView，iOS 的 WKWebView）
3. 你的代码就能通过 JavaScript 调用手机的原生功能了

可以把它理解为一个"翻译层"：

```
你的 JavaScript 代码
        ↓  翻译成原生调用
   Capacitor 插件
        ↓
Android / iOS / Web
```

## 三、什么是 Capacitor 插件

插件就是一个"小模块"，它做了两件事：

1. **原生部分**：在 Android (Java/Kotlin) 或 iOS (Swift/ObjC) 里调用系统 API
2. **JS 部分**：给 JavaScript 暴露一个简洁的接口

你只管调用 `MyPlugin.doSomething()`，不需要写一行 Kotlin 或 Swift。

Capawesome 团队维护了一整套高质量插件，覆盖了手机最常见的硬件功能。

## 四、核心概念

### 4.1 插件命名空间

Capawesome 的插件使用统一的 npm 命名空间：

- 社区免费插件：`@capawesome-team/capacitor-xxx`
- Insider 独家插件：`@capawesome/capacitor-xxx`

这就像超市货架上同一品牌下的不同商品，只是包装标签略有不同。

### 4.2 安装流程

每个插件的安装基本分三步：

```bash
# 1. 安装 npm 包
npm install @capawesome-team/capacitor-xxx

# 2. 同步到原生项目
npx cap sync

# 3. 按需配置原生平台（Android / iOS）
```

`npx cap sync` 是关键 -- 它把 JS 代码和原生项目"缝合"在一起，之后就能用了。

### 4.3 生命周期：引入 -> 注册 -> 调用

在 Capacitor 中用插件，三步走：

1. **引入**：`import { PluginName } from '@capawesome-team/capacitor-plugin-name'`
2. **注册**（部分插件需要）：在 `main.ts` 里注册到 Capacitor 实例
3. **调用**：`PluginName.someMethod({ parameter: 'value' })`

## 五、代码示例

### 示例一：指纹/面容认证（Biometrics 插件）

这是最实用的场景之一 -- 让用户用指纹或面容登录你的 app。

```typescript
import { Biometrics, ErrorCode } from '@capawesome-team/capacitor-biometrics';

const authenticate = async () => {
  try {
    await Biometrics.authenticate({
      title: '请验证身份',
      subtitle: '使用指纹或面容继续',
      cancelButtonText: '取消',
      // 指纹失败后，允许用 PIN 码兜底
      allowDeviceCredential: true,
      iosFallbackButtonText: '使用密码',
    });
    console.log('认证成功！');
  } catch (error) {
    // 错误码区分不同原因
    if (error.code === ErrorCode.USER_CANCELED) {
      console.log('用户取消了验证');
    } else if (error.code === ErrorCode.NOT_ENROLLED) {
      console.log('设备未录入指纹/面容');
    } else if (error.code === ErrorCode.NOT_AVAILABLE) {
      console.log('此设备不支持生物识别');
    } else {
      console.log('其他错误', error);
    }
  }
};

// 检查设备是否支持生物识别
const checkAvailability = async () => {
  const { isAvailable } = await Biometrics.isAvailable();
  console.log('是否支持:', isAvailable);
};
```

这里的关键点：
- `authenticate()` 是核心方法，返回 Promise
- `ErrorCode` 枚举让你能精确判断用户为什么失败了（取消 vs 设备不支持 vs 未录入）
- `allowDeviceCredential: true` 是个好设计 -- 让用户指纹失败后还能用密码兜底

### 示例二：本地数据库（SQLite 插件）

在手机上存数据，最轻量的方式就是用 SQLite。Capawesome 的 SQLite 插件功能很完整：

```typescript
import { Capacitor } from '@capacitor/core';
import { Sqlite } from '@capawesome-team/capacitor-sqlite';

// 第一步：在 Web 平台需要先初始化 WASM 模块
const initDatabase = async () => {
  if (Capacitor.getPlatform() === 'web') {
    await Sqlite.initialize({
      worker: new Worker('/assets/sqlite-wasm/sqlite3-worker1.mjs', { type: 'module' })
    });
  }
};

// 第二步：创建并打开数据库
const openDb = async () => {
  await Sqlite.create({
    name: 'my-app.db',
    // 可选：开启 256 位加密
    // encrypted: true,
    // key: 'my-secret-key',
  });
};

// 第三步：建表 + 插入数据
const setupTable = async () => {
  await Sqlite.execute({
    sql: `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE
    )`,
  });

  await Sqlite.run({
    sql: 'INSERT INTO users (name, email) VALUES (?, ?)',
    // 参数化查询，防 SQL 注入（就像防弹衣）
    values: ['张三', 'zhangsan@example.com'],
  });
};

// 第四步：查询数据
const getUsers = async () => {
  const result = await Sqlite.query({
    sql: 'SELECT * FROM users',
  });
  // result.values 就是查询到的行数组
  console.log(result.values);
};

// 事务支持 -- 多条操作要么全成功，要么全回滚
const insertMultiple = async () => {
  try {
    await Sqlite.beginTransaction();
    await Sqlite.run({ sql: 'INSERT INTO users (name, email) VALUES (?, ?)', values: ['李四', 'lisi@example.com'] });
    await Sqlite.run({ sql: 'INSERT INTO users (name, email) VALUES (?, ?)', values: ['王五', 'wangwu@example.com'] });
    await Sqlite.commitTransaction();
  } catch (e) {
    await Sqlite.rollbackTransaction(); // 出错就撤回
  }
};
```

这个例子里有几个重要概念：

- **参数化查询**：用 `?` 占位符传值，而不是拼字符串。这能防止 SQL 注入攻击
- **事务**：`beginTransaction` -> `run` -> `commitTransaction` 就像银行转账，要么两笔都成功，要么一起撤回
- **加密支持**：一行 `encrypted: true` 就能给数据库上锁，数据存在手机上也安全

### 示例三：文件选择器（File Picker 插件）

让用户从相册选照片、或从文件管理器选文件：

```typescript
import { FilePicker, FileType } from '@capawesome/capacitor-file-picker';

const pickImage = async () => {
  try {
    const result = await FilePicker.pickFiles({
      types: [FileType.image],
      multiple: false,  // 只选一张
    });
    // result.files[0].path 是文件路径
    console.log('选中的文件:', result.files[0]);
  } catch (error) {
    console.log('用户取消了选择');
  }
};

const pickDocument = async () => {
  await FilePicker.pickFiles({
    types: [FileType.pdf, FileType.doc, FileType.docx],
    multiple: true,
  });
};
```

`types` 参数让你能过滤文件类型，`multiple` 控制是否多选。调用后用户会看到系统原生的文件选择器界面，不需要自己写 UI。

## 六、Capawesome 生态概览

以下是按功能分类的主要插件：

**硬件感知**：加速度计、陀螺仪、指南针、气压计、计步器、NFC、蓝牙低功耗（BLE）

**身份认证**：生物识别、Apple Sign-In、Google Sign-In、OAuth

**数据存储**：SQLite、Secure Preferences、Vault、libSQL

**媒体文件**：文件选择器、文件浏览器、截图、照片编辑器、文件压缩器

**系统功能**：应用评分、应用更新、角标、后台任务、深链接、屏幕方向、打印机

**语音**：语音识别、语音合成

**支付**：Square 移动支付

**监控**：PostHog、Grafana Faro

部分插件（如 Biometrics、SQLite、App Review）是 Capawesome Insider 专属，需要付费订阅。社区版和 Insider 版并存，满足不同需求。

## 七、总结

Capawesome 插件生态的核心价值可以用一句话概括：**把手机硬件能力，变成 npm 包**。

你不需要学 Kotlin 或 Swift，不需要配置原生编译链，只需要：

```
npm install → npx cap sync → import → 调用
```

就像拼积木一样，需要什么能力就装什么插件。对于零基础的学习者来说，这比直接写原生 app 要友好得多 -- 你只需要掌握 JavaScript 这一门语言，就能写出功能完整的跨平台 app。

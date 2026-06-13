---
title: Stagehand — 用自然语言控制浏览器的 AI 框架
来源: https://github.com/browserbase/stagehand
日期: 2026-06-13
分类: Agent
子分类: 智能体与 LLM
provenance: pipeline-v3
---

# Stagehand — 用自然语言控制浏览器的 AI 框架

## 一、从日常类比说起

想象一下你要教一个刚来公司的实习生操作电脑：

- **传统方式**（Selenium / Playwright）：你给他一份精确到像素的操作手册——"把鼠标移到坐标 (452, 318)，点击左键"。页面一改版，坐标全废。
- **AI 代理方式**（纯 Agent）：你跟他说"帮我把这个任务搞定"，他能做，但你不知道他具体点了什么，出问题没法排查。
- **Stagehand 的方式**：你可以混合使用——简单的操作直接说"点登录按钮"（它自己去找），复杂的流程让 Agent 自主完成，中间每一步你还能停下来检查。

Stagehand 就是这座桥梁。它由 Browserbase 团队开发，核心思路是：**开发者自己决定什么时候用代码、什么时候用自然语言**。

## 二、核心概念

Stagehand 提供四个基础原语（primitive），每个对应一种自动化场景：

| 原语 | 作用 | 类比 |
|------|------|------|
| `act()` | 执行单个操作 | "帮我点那个按钮" |
| `extract()` | 从页面抓取结构化数据 | "把页面上的价格提出来" |
| `observe()` | 发现页面上可用的操作 | "这个页面上我能点什么？" |
| `agent()` | 自主完成多步任务 | "帮我完成整个注册流程" |

这四个原语可以单独使用，也可以组合起来构建复杂的自动化流水线。

### 为什么选 Stagehand

1. **自愈能力**：网站改版了？`act()` 会自动适应新的页面结构，不需要你手动改选择器。
2. **可缓存**：同样的操作会缓存下来，后续运行不再消耗 LLM token，速度快且成本低。
3. **变量隔离**：密码等敏感信息通过 `%variable%` 语法传入，不会发送给 LLM 提供商。
4. **兼容主流库**：可以直接接管 Puppeteer、Playwright 创建的 Page 对象。

## 三、快速上手

### 安装

```bash
npx create-browser-app
```

CLI 会引导你创建一个带默认配置的项目，然后设置 API Key：

```bash
cd my-stagehand-app
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY 或 ANTHROPIC_API_KEY
npm start
```

### 最小示例：打开网页并提取标题

```typescript
import { Stagehand } from "@browserbasehq/stagehand";
import "dotenv/config";

async function main() {
  // 1. 初始化 Stagehand
  const stagehand = new Stagehand({
    env: "LOCAL",  // "LOCAL" 用本地浏览器，"BROWSERBASE" 用云端
  });
  await stagehand.init();

  const page = stagehand.context.pages()[0];

  // 2. 导航到目标页面
  await page.goto("https://example.com");

  // 3. 用 extract 提取页面标题
  const title = await stagehand.extract(
    "extract the page title",
    z.string()
  );
  console.log("Page title:", title);

  // 4. 关闭浏览器
  await stagehand.close();
}

main().catch(console.error);
```

这段代码做了什么？

1. `new Stagehand()` 创建实例，`env` 决定用本地浏览器还是 Browserbase 云端。
2. `init()` 启动浏览器会话。
3. `page.goto()` 导航到 URL（这是标准的 Page 对象方法）。
4. `extract()` 接收两个参数：自然语言指令 + Zod 类型定义。Stagehand 会把页面内容交给 LLM，让它按你的 schema 提取数据。
5. `close()` 清理资源。

## 四、深入四个原语

### 4.1 `act()` — 执行动作

用自然语言描述你想做的操作：

```typescript
// 点击按钮
await stagehand.act("click the add to cart button");

// 填写表单
await stagehand.act("fill the email field with %email%", {
  variables: { email: "user@example.com" }
});

// 选择下拉项
await stagehand.act("select 'Premium' from the plan dropdown");
```

建议**每次只做一个动作**。复杂流程应该拆成多个 `act()` 调用，或用 `agent()`。

### 4.2 `extract()` — 提取结构化数据

配合 Zod schema 使用，返回值有 TypeScript 类型推断：

```typescript
import { z } from "zod";

// 提取商品信息列表
const products = await stagehand.extract(
  "extract all product names and prices from the page",
  z.array(
    z.object({
      name: z.string().describe("product name"),
      price: z.number().describe("price in USD"),
      inStock: z.boolean().describe("whether the item is available"),
    })
  )
);

// products 的类型自动推断为:
// Array<{ name: string; price: number; inStock: boolean }>
console.log(products[0].name); // 类型安全，IDE 有补全
```

### 4.3 `observe()` — 观察可用操作

在执行前先看一眼页面上有什么可点的：

```typescript
const actions = await stagehand.observe("find all clickable buttons");
// 返回: Array<{ selector, description, method, arguments }>
for (const action of actions) {
  console.log(`- ${action.description} (${action.method})`);
}
```

典型用法是先 `observe` 确认元素存在，再 `act` 执行：

```typescript
const [action] = await stagehand.observe("click the login button");
if (action) {
  await stagehand.act(action);
}
```

### 4.4 `agent()` — 自主多步代理

最强大的原语。给它一个目标，它会自己规划步骤：

```typescript
const agent = stagehand.agent({
  mode: "cua",  // Computer Use Agent
  model: "google/gemini-2.5-computer-use-preview-10-2025",
  systemPrompt: "你是浏览器助手，帮用户完成任务。",
});

const result = await agent.execute("注册一个新账号并填写资料");
console.log(result);
```

## 五、缓存机制

Stagehand 有两种缓存：

### 本地缓存

```typescript
const stagehand = new Stagehand({
  env: "LOCAL",
  cacheDir: "./act-cache",  // 指定缓存目录
});
```

第一次运行时，`act()` 的结果会被存到本地。下次执行同样的操作，直接读取缓存，不调用 LLM。

### 服务端缓存（Browserbase 专用）

```typescript
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  serverCache: true,  // 默认开启
});

const result = await stagehand.act("click the login button");
console.log(result.cacheStatus); // "HIT" | "MISS" | undefined
```

服务端缓存在同一个 Session 内有效，跨请求也能复用。

## 六、完整示例：电商比价脚本

把四个原语串起来，写一个能自动搜索商品、提取价格、对比最低价的脚本：

```typescript
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import "dotenv/config";

async function comparePrices(keyword: string) {
  const stagehand = new Stagehand({ env: "LOCAL" });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    // 第一步：搜索
    await page.goto("https://www.example-store.com/search");
    await stagehand.act(`type "${keyword}" into the search box`);
    await stagehand.act("press Enter");

    // 第二步：等待结果加载
    await stagehand.act("wait for the product listings to load");

    // 第三步：提取所有商品
    const products = await stagehand.extract(
      "extract product name and price from each listing",
      z.array(
        z.object({
          name: z.string(),
          price: z.number(),
        })
      )
    );

    // 第四步：找出最低价
    const cheapest = products.reduce((min, p) =>
      p.price < min.price ? p : min
    , products[0]);

    console.log(`最便宜的是：${cheapest.name}，价格 $${cheapest.price}`);

    // 第五步：观察是否有优惠券
    const coupons = await stagehand.observe("find coupon or discount codes");
    if (coupons.length > 0) {
      console.log("可用优惠：", coupons.map(c => c.description));
    }
  } finally {
    await stagehand.close();
  }
}

comparePrices("无线鼠标");
```

这个脚本展示了 Stagehand 的典型工作流：导航 → 搜索 → 提取 → 分析 → 观察。每一步都用自然语言描述，不需要维护任何 CSS 选择器。

## 七、与 Playwright / Puppeteer 的关系

Stagehand 不是要取代 Playwright 或 Puppeteer，而是在它们之上加了一层 AI 抽象：

- 底层仍然是 Chromium 浏览器，通过 CDP（Chrome DevTools Protocol）通信。
- `stagehand.context.pages()[0]` 返回的就是一个标准 Page 对象，你可以混用 Playwright/Puppeteer 的方法。
- 你可以把 Puppeteer 的 Page 传进 `act()` 的 `page` 选项，Stagehand 会在上面执行 AI 操作。

简单说：**Stagehand 是浏览器自动化的"智能层"**。

## 八、学习建议

1. 先用 `npx create-browser-app` 跑通第一个例子，感受自然语言控制浏览器的效果。
2. 从 `act()` 开始，试着让它完成几个简单操作（点击、填写、滚动）。
3. 学习 `extract()` + Zod，体会结构化数据提取的便利。
4. 最后尝试 `agent()`，看 AI 如何自主完成复杂任务。
5. 遇到问题时先用 `observe()` 看看页面实际识别到了什么元素。

## 九、参考资料

- 官方文档：https://docs.stagehand.dev
- GitHub：https://github.com/browserbase/stagehand
- 社区 Discord：https://stagehand.dev/discord
- Python 版：https://github.com/browserbase/stagehand-python

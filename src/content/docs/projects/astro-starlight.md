---
title: Astro Starlight — 从零搭建文档站
来源: https://starlight.astro.build/
日期: 2026-06-13
分类: 后端 API
子分类: 前端框架
provenance: pipeline-v3
---

## 一句话理解 Starlight

想象你要建一座图书馆。

传统做法：你自己打地基、砌墙、刷漆、装灯、摆书架——每个细节都要操心。

Starlight 的做法：有人已经帮你把整座图书馆建好了。你只需要搬书进去，告诉它书名和目录。

Starlight 就是这样一个"图书馆"——它是 Astro 官方推出的**文档站点生成器**。你用 Markdown 写内容，它负责把内容变成漂亮、快速、可搜索的文档网站。

## 它是怎么来的？

Starlight 建立在 Astro 之上。Astro 是一个"岛屿架构"的 web 框架——默认输出纯 HTML，只在需要交互的地方加载 JavaScript。Starlight 继承了这一特性，所以生成的文档站天生就快。

## 核心概念

### 1. 内容集合 (Content Collections)

Starlight 使用 Astro 的内容集合系统来管理文档。所有文档放在 `src/content/docs/` 目录下，每个 `.md` 或 `.mdx` 文件就是一篇文档。

文件路径自动变成 URL：

```
src/content/docs/getting-started.md    →  /docs/getting-started
src/content/docs/tutorial/intro.md     →  /docs/tutorial/intro
src/content/docs/api/reference.md      →  /docs/api/reference
```

每篇文档顶部有一个 YAML frontmatter，用来写标题和元数据：

```yaml
---
title: 快速开始
description: 五分钟上手 Starlight
---
```

### 2. 配置文件 (starlight.config.ts)

项目根目录创建一个 `astro.config.mjs`，在里面引入 Starlight 插件：

```js
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: '我的文档站',
      sidebar: [
        {
          label: '指南',
          items: [
            { label: '快速开始', link: '/getting-started' },
            { label: '配置', link: '/configuration' },
          ],
        },
        {
          label: '参考',
          items: [
            { label: 'API 参考', link: '/api/reference' },
          ],
        },
      ],
    }),
  ],
});
```

这里最关键的是 `title`（必填）和 `sidebar`（侧边栏导航）。你也可以让 Starlight 根据文件路径自动生成侧边栏，不用手动写。

### 3. 主题切换

Starlight 内置了亮色/暗色主题切换功能，用户点一下按钮就能切换。你不需要自己写 CSS 变量。

### 4. 内置搜索

Starlight 集成了 Pagefind 搜索引擎。用户按 `Ctrl+K`（Mac 上是 `Cmd+K`）就能弹出搜索框，全站内容秒搜。

### 5. 扩展性

Starlight 不是封闭的。你可以用 React、Vue、Svelte 等组件来扩展页面。比如加一个交互式代码演示、一个实时预览面板，完全没问题。

## 代码示例

### 示例一：从零创建项目

运行一条命令就能搭好骨架：

```bash
npm create astro@latest my-docs -- --template starlight
```

这条命令会：
1. 创建一个叫 `my-docs` 的新目录
2. 安装 Astro + Starlight 依赖
3. 生成 `astro.config.mjs`、`src/content/docs/`、`src/content/config.ts` 等必要文件
4. 生成一篇示例文档 `getting-started.md`

然后：

```bash
cd my-docs
npm run dev
```

打开 `http://localhost:4321`，就能看到你的文档站了。

### 示例二：自定义配置 + 扩展 frontmatter

Starlight 允许你在文档 frontmatter 里添加自定义字段，通过 `docsSchema` 实现类型安全：

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ schema: docsSchema() }),
};
```

如果你想加一个 `author` 字段，可以这样扩展：

```ts
import { defineCollection, z } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    schema: docsSchema().extend({
      author: z.string(),
      updated: z.date().optional(),
    }),
  }),
};
```

然后在文档里就可以用了：

```yaml
---
title: 安装指南
author: Jason
updated: 2026-06-13
---

本文最后更新于 2026 年 6 月 13 日。
```

如果忘了写 `author`，TypeScript 会在开发时给你报错——这就是类型安全的价值。

### 示例三：添加自定义组件

假设你想在文档里放一个可交互的按钮计数器，用 React 写：

```tsx
// src/components/Counter.tsx
export default function Counter() {
  let [count, setCount] = useState(0);
  return (
    <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
      <p>当前计数: {count}</p>
      <button onClick={() => setCount(count + 1)}>+1</button>
    </div>
  );
}
```

然后在文档里直接引用：

```md
---
title: 交互示例
---

下面是一个简单的计数器组件：

<Counter />
```

Starlight 会自动把这个 React 组件渲染到文档中。组件只在点击时才加载 JavaScript，不影响页面的初始加载速度。

## 关键特性速览

- **零 JS 默认**：文档页面默认不加载任何 JavaScript，加载速度极快
- **暗色模式**：一键切换，自动跟随系统偏好
- **响应式布局**：手机、平板、桌面端都好看
- **SEO 友好**：自动生成 sitemap、Open Graph 标签
- **多语言支持**：内置国际化 (i18n)，一个站支持多种语言
- **全键盘操作**：`Ctrl+K` 搜索，`←` `→` 翻页
- **TypeScript 类型安全**：frontmatter 字段有完整的类型检查
- **可插拔**：用 Astro 集成生态扩展功能

## 和同类工具对比

| 特性 | Starlight | Docusaurus | VitePress |
|------|-----------|------------|-----------|
| 底层框架 | Astro | React | Vite + Vue |
| 默认无 JS | 是 | 否 | 部分 |
| 组件扩展 | React/Vue/Svelte | 仅 React | 仅 Vue |
| 构建速度 | 快（Astro  islands） | 中等 | 快 |
| 社区规模 | 快速增长 | 大 | 大 |

Starlight 的优势在于：如果你已经在用 Astro，或者想要框架无关的组件能力，它是最佳选择。

## 总结

Starlight 的理念很简单：**你写 Markdown，它搞定其余一切**。

不需要配置 webpack，不需要调 CSS 变量，不需要手写导航栏。写几篇文档，跑一下 `npm run build`，一个生产级别的文档站就出来了。

对于零基础学习者来说，Starlight 是最友好的文档生成器之一——它的学习曲线几乎只取决于你写 Markdown 的速度。

## 参考

- Starlight 官网：https://starlight.astro.build/
- Astro 官网：https://astro.build/
- GitHub：https://github.com/withastro/starlight

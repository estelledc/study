---
title: Jest — 一个包就能跑 JS 测试的全家桶
来源: 'https://github.com/jestjs/jest'
日期: 2026-05-30
分类: 测试框架
难度: 初级
---

## 是什么

Jest 是一个**只装一个包就能跑 JS 测试**的框架。日常类比：像超市的"火锅一站式购物车"——肉、菜、汤底、调料、锅具一次装齐，不用你跑五个货架对着配料表挑半天。

具体说，写一个 Node 测试以前要凑齐这些：

- **Mocha**（跑测试的 runner）
- **Chai**（写断言的 `expect(x).to.equal(y)`）
- **sinon**（伪造函数 / 假数据）
- **istanbul**（统计覆盖率）
- **babel-register**（让 Node 读懂 TS / JSX）

每装一个就要在 `package.json` 多写一段配置。Jest 把这五件事打包进一个包：`npm i -D jest` 装完，写完测试直接 `npx jest` 就跑。

## 为什么重要

不理解 Jest，下面这些事很难解释：

- 为什么 React 项目里测试文件叫 `*.test.tsx` 不用任何配置就能跑——这是 Jest 的默认约定
- 为什么 `jest.mock('axios')` 一行就能把整个 axios 替换成假货
- 为什么改一个文件 watch 模式只重跑 3 个测试不重跑 300 个
- 为什么 [[vitest]] 出来之后 Jest 团队那么紧张

## 核心要点

Jest 的设计可以拆成 **三件事**：

1. **沙箱隔离模块**：每个测试文件在自己的 `vm.Context` 里跑，全局变量不会串。类比：每个测试发一个独立小厨房，前一个搞乱厨房不影响下一个。

2. **多进程 worker 并行**：默认按 CPU 核心数起 worker，每个 worker 跑一组测试文件。类比：5 个洗碗工同时洗 5 摞碗，比一个人快 5 倍。

3. **自动 mock + 快照**：`jest.mock('./api')` 自动伪造整个模块；`toMatchSnapshot()` 把对象序列化存盘，下次对比。类比：第一次拍证件照存档，下次再拍对比看你有没有变胖。

## 实践案例

### 案例 1：零配置跑第一个测试

```bash
mkdir jest-toy && cd jest-toy
npm init -y
npm i -D jest
```

写 `sum.js`：

```javascript
function sum(a, b) { return a + b; }
module.exports = sum;
```

写 `sum.test.js`：

```javascript
const sum = require('./sum');

test('1 + 1 = 2', () => {
  expect(sum(1, 1)).toBe(2);
});
```

跑 `npx jest`——直接绿。**逐部分解释**：`test(name, fn)` 是 Jest 的全局函数（不用 import）；`expect(x).toBe(y)` 是断言；`.test.js` 后缀让 Jest 自动认出这是测试文件。

### 案例 2：一行替换整个模块

```javascript
jest.mock('axios');
const axios = require('axios');

test('fetchUser 调 axios.get', async () => {
  axios.get.mockResolvedValue({ data: { name: 'Jason' } });
  const user = await fetchUser(1);
  expect(user.name).toBe('Jason');
});
```

`jest.mock('axios')` 让真实 axios 永远不会发 HTTP，所有方法变 `jest.fn()`。`mockResolvedValue` 指定下次调用返回什么。这就是"自动 mock"——你不用手写 `axios.get = () => ...`，Jest 自己替你伪造好了。

### 案例 3：快照测试一行存档

```javascript
test('用户卡片渲染', () => {
  const card = renderUserCard({ name: 'Jason', age: 22 });
  expect(card).toMatchSnapshot();
});
```

第一次跑：在 `__snapshots__/user.test.js.snap` 写入序列化结果。第二次跑：和文件对比，不一致就 fail。改了组件想更新快照，加 `--updateSnapshot`（或 watch 模式按 `u`）。**这是把"输出长这样"固化到 git 里**——下次 review PR 能直接看 `.snap` diff。

## 踩过的坑

1. **自动 mock 在 debug 时反而是阻碍**：测试 fail 了你不知道是真实模块的问题还是 mock 假货行为不对。很多团队最后 `automock: false` 改回手动。
2. **快照测试一键 update 让 review 失效**：CI 红了开发者直接 `--updateSnapshot` 然后 push，根本没看 diff。这不是 Jest 的锅，但 Jest 把这门技术大众化加重了滥用。
3. **ESM 支持长期 experimental**：`vm.Context` 拦不住 Node 原生 `import`，所以纯 ESM 项目用 Jest 要折腾 `--experimental-vm-modules` flag，这是 [[vitest]] 抢市场的关键缝隙。
4. **ts-jest 比 babel-jest 慢但严**：默认走 babel-jest 不做类型检查（只剥 TS 类型注解），切到 ts-jest 会做完整类型检查但 watch 模式启动慢 2-3 倍，选错让人怀疑人生。

## 适用 vs 不适用场景

**适用**：
- React / Vue / 普通 Node 项目的单元测试和集成测试
- 大型 monorepo 已有 Jest 配置——迁移成本不划算就留着
- 需要 mock 大量模块的场景（自动 mock 比手写 sinon 省 80% 代码）
- 需要快照测试的 UI 组件库（搭配 `react-test-renderer` 或 [[storybook]]）

**不适用**：
- 纯 ESM 项目 + 没有遗产负担——直接选 [[vitest]]
- 需要极快启动速度的 CI——Jest 启动比 vitest 慢 3-5 倍
- 浏览器端 E2E 测试——用 [[playwright]] 或 Cypress，Jest 是 Node 进程
- 简单库想要零依赖——Node 18+ 自带 `node:test` 模块够用

## 历史小故事（可跳过）

- **2014 年**：Meta（原 Facebook）的 Christoph Pojer 发起 Jest，为内部 React 项目服务
- **2016 年**：开源；React 16 默认推荐 Jest，生态爆发
- **2018 年**：Jest 22 引入 `jest-circus` 新 runner，替换老的 jest-jasmine2
- **2020 年**：OpenJS Foundation 接管 Jest 治理，从 Meta 独立
- **2022 年**：[[vitest]] 出现，启动速度 3-5 倍 + 原生 ESM，成为新项目的默认选择

## 学到什么

1. **工具一体化 vs UNIX 哲学**：测试栈"小而美组合"在企业里失败，因为配置漂移让新人 onboarding 痛苦；"大而全"反而降低成本——但代价是你被绑架了
2. **沙箱化模块系统**：测试隔离的本质是**模块状态隔离**，不是函数调用隔离。自实现 require 让 Jest 能塞进 mock / coverage / reset 钩子
3. **元数据驱动的代码生成**：jest-mock 用 metadata IR 描述模块结构再生成 mock，这种"先描述再生成"模式在编译器、ORM、Schema 验证都能复用
4. **架构惯性是真护城河**：vitest 启动快但 Jest 在 monorepo 巨型项目里依然主流，迁移成本是真实壁垒

## 延伸阅读

- 官方文档：[jestjs.io](https://jestjs.io/)（getting-started 30 分钟能跑通第一个测试）
- 视频教程：[Jest Crash Course](https://www.youtube.com/watch?v=7r4xVDI2vho)（Traversy Media，1 小时入门）
- 进阶阅读：[Testing JavaScript with Kent C. Dodds](https://testingjavascript.com/)（付费课程，从 Jest 到 React Testing Library 一条龙）
- 对比阅读：[[vitest]] —— 同类对比看新世代怎么做
- 相关工具：[[storybook]] —— UI 组件开发 + 视觉快照搭配 Jest

## 关联

- [[vitest]] —— Jest 的 ESM 时代继任者，API 几乎照抄
- [[esbuild]] —— vitest 用它做 transformer，这是 Jest 慢的原因之一
- [[swc]] —— Rust 写的 transformer，`@swc/jest` 替换 babel-jest 提速 5x
- [[lerna]] —— Jest monorepo 用它管理 50+ package（同款工具链）
- [[storybook]] —— UI 组件开发标配，常和 Jest 快照测试组合
- [[playwright]] —— Jest 不擅长的浏览器 E2E 由它补位
- [[turborepo]] —— monorepo 里跑 Jest 的并行调度器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[msw]] —— MSW — 让 mock 不改业务代码，在网络层透明拦截
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[testing-library]] —— Testing Library — 像用户一样测前端，重构不再挂测试
- [[vitest]] —— Vitest — Vite 原生测试框架

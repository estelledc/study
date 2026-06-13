---
title: Local-First Software 五年回顾：从零开始理解数据归属
来源: https://www.inkandswitch.com/local-first/2026-revisit/
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

## 一、一个日常类比：你的笔记在谁的本子上？

想象一下，你每天用一款笔记 App 写东西。

**云端模式（像 Google Docs）**：你的笔记写在公司的本子上，笔也归公司管。只要公司开门（服务器在线），你就能写、能读、能和同事一起改。但如果公司倒闭了、服务器关掉了，你的笔记就再也打不开了——因为本子不在你手里。

**本地优先模式（Local-First）**：你的笔记首先写在你自己的笔记本上。断网了？照样写。想删就删。同时，如果你愿意，笔记本可以自动和队友的副本同步。即使将来没有服务器了，你的笔记依然在你手里。

Local-First 就是要让软件从"云端优先"转向"本地优先"：**数据首先存在你的设备上，服务器只是帮忙同步的助手，而不是数据的主人。**

这篇文章出自 Ink & Switch 实验室 2019 年的经典论文，而今天（2026 年）回头看，这场运动已经走出了实验室，进入了真正的生产环境。

---

## 二、为什么需要 Local-First？

Ink & Switch 提出了一个"评分卡"，从七个维度评估一款软件：

| 维度 | 说明 |
|------|------|
| 1. 快速 | 打开即用，没有等待加载的 spinner |
| 2. 多设备 | 手机、电脑、平板之间同步 |
| 3. 离线可用 | 断网也能正常工作 |
| 4. 协作 | 多人同时编辑不冲突 |
| 5. 持久性 | 即使公司倒闭，软件和数据还能用 |
| 6. 隐私 | 数据不被公司或政府随意查看 |
| 7. 用户控制权 | 用户可以备份、导出、删除自己的数据 |

2019 年时，没有一款软件能在七个维度都拿满分。今天依然如此——但差距正在缩小。

### 传统方案的缺陷

- **纯云端应用**（Google Docs、Trello）：在 1、2、4 上表现好，但 3、5、6、7 全红。服务器一关，什么都没了。
- **Firebase / CloudKit**：多设备同步和离线支持不错，但数据仍然掌握在 Google 或 Apple 手里，持久性差。
- **CouchDB / PouchDB**：理念很接近 Local-First，但冲突解决太难写，开发者容易出错。

---

## 三、核心技术：CRDT（无冲突复制数据类型）

这是 Local-First 运动最重要的技术发明。

### 什么是 CRDT？

**日常类比**：想象你和朋友各自在一张纸上写购物清单。你加了"牛奶"，朋友加了"鸡蛋"。你们碰一下头，两张清单就合二为一了——没有冲突，因为你们写的不一样。

CRDT 就是让电脑也能做这种事：**多个设备各自修改数据，同步时自动合并，不会产生需要手动解决的冲突。**

2019 年的论文提到，Ink & Switch 为此开发了 Automerge——一个 JavaScript 的 CRDT 实现。到 2026 年，Automerge 已经进化到 3.x 版本，被多个生产级项目采用。

### 代码示例一：用 Automerge 创建一个协作待办清单

```javascript
import * as Automerge from '@automerge/automerge'

// 创建一个空的文档
let doc = Automerge.from({
  tasks: []
})

// 在设备 A 上添加一个任务
doc = Automerge.change(doc, 'Add task', d => {
  d.tasks.push({ text: '学习 CRDT', done: false })
})

// 在设备 B 上同时完成同一个任务
// （假设设备 B 复制了设备 A 的初始状态）
let docB = Automerge.sync.syncState(doc)
// 模拟器之间的网络交换...
let docASynced = Automerge.merge(doc, docB)

// 结果：两个设备看到相同的、合并后的待办清单
// 不需要任何手动冲突解决
```

**关键点**：你写的代码和平时写普通的 JavaScript 对象几乎一模一样。CRDT 在幕后自动处理了同步和合并。

### 代码示例二：实时同步两个设备的状态

```javascript
import * as Automerge from '@automerge/automerge'
import * as AutomergeNet from '@automerge/automerge-net'

// 模拟两台设备
let docA = Automerge.from({ message: '你好' })
let docB = Automerge.from({ message: '你好' })

// 设备 A 修改了消息
docA = Automerge.change(docA, 'Update message', d => {
  d.message = 'Hello from device A!'
})

// 设备 B 也修改了消息（并发）
docB = Automerge.change(docB, 'Update message', d => {
  d.message = 'Hello from device B!'
})

// 合并两个文档——CRDT 自动处理冲突
// 对于字符串，Automerge 保留两个值并排显示
let merged = Automerge.merge(docA, docB)
console.log(merged.message)
// 输出: "Hello from device A!Hello from device B!"
```

**关键点**：当两个人同时修改同一个地方时，CRDT 不会丢数据，也不会崩溃。它把两边的修改都保留下来，让应用决定怎么展示。

---

## 四、五年回顾：2019 → 2026

### 进展

**1. CRDT 从论文变成了产品**

2019 年的论文说"CRDT 理论成立，但工业界几乎没有人在用"。到 2026 年：

- Automerge（Ink & Switch 开发）已经是成熟的生产级库
- Yjs（另一个 CRDT 库）被 CodeMirror 6 和许多编辑器采用
- CRDT 被用在 Notion 竞品、Figma 竞品、笔记应用等多个领域
- Automerge 推出了 Automerge-Net 作为远程同步协议

**2. 开发者体验大幅改善**

2019 年的论文指出，CRDT 的最大挑战是"让普通开发者能用"。现在：

- `@automerge/automerge` 的 API 和 JavaScript 对象几乎一样
- 和 React 的响应式模型天然兼容（论文预言了这一点，后来被 React 社区验证）
- 类型安全支持（TypeScript）已完善

**3. 生态系统在壮大**

- 2025 年举办了首届 Local-First Conf 会议
- Automerge 有了独立网站 automerge.org
- Ink & Switch 实验室更名为 Tenfold（2026 年庆祝成立十周年）
- Keyhive 项目为 Local-First 应用加了访问控制

### 挑战依然存在

**1. 数据量增长问题**

CRDT 会记录每一次修改的历史。如果两个用户协同编辑一个大型文档数月，历史会越来越大。2019 年论文提到的 PushPin 原型就遇到了这个问题。到 2026 年，Automerge 仍在优化压缩和合并策略，但"历史膨胀"仍未彻底解决。

**2. 网络通信仍是难题**

2019 年论文测试了 WebRTC、Dat 协议、IPFS 等多种 P2P 方案。结果都不完美：NAT 穿透不可靠、连接不稳定。到 2026 年，这个问题依然没有标准答案——这也是为什么 Automerge-Net 选择了"有服务器辅助的 P2P"这种混合方案。

**3. "服务器完全消失"是个幻觉**

2019 年论文最初设想 P2P 就够了。后来他们发现，如果两个人同时在线才能同步，那一个人关机了就无法协作。所以"云端对等节点"（cloud peer）仍然有存在价值——只是角色从"数据主人"变成了"数据传输助手"。

---

## 五、给零基础学习者的行动建议

如果你正在开发一款应用，可以从这些小事开始向 Local-First 靠拢：

1. **用本地存储做第一优先级**：不管有没有网络，先读本地的数据
2. **支持离线操作**：关掉 WiFi 测试你的 App，看看会不会出现 spinner 和错误
3. **允许数据导出**：用户可以一键导出 JSON 或 PDF，就像 Google Takeout 那样
4. **预加载资源**：不要让用户等网络响应，先把数据下载到本地
5. **如果要做协作**：看看 Automerge 或 Yjs，别自己造轮子

---

## 六、核心概念总结

| 概念 | 一句话解释 |
|------|-----------|
| Local-First | 数据首先存在用户的设备上，而不是服务器上 |
| CRDT | 让多台设备的数据自动合并、无需手动解决冲突的数据结构 |
| Automerge | Ink & Switch 开发的 JavaScript CRDT 库 |
| 乐观 UI | 不等待服务器确认，先在本地显示结果 |
| 云端对等节点 | 服务器不作为数据主人，只做传输和备份的辅助角色 |
| 持久性 | 软件和数据不依赖任何特定公司的存活 |

---

## 七、延伸阅读

- Automerge 官方文档：https://automerge.org/docs/hello
- Ink & Switch 实验室页面：https://www.inkandswitch.com/local-first-software
- Local-First Conf 2026：https://www.localfirstconf.com
- Automerge GitHub：https://github.com/automerge/automerge

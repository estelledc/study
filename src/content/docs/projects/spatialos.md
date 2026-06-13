---
title: Iris 零基础学习笔记
source: https://github.com/irislib/iris-mbe
date: 2026-06-13
category: 去中心化网络
subCategory: P2P 数据库
provenance: pipeline-v3
分类: 其他
子分类: game-engines-and-graphics
---

# Iris 零基础学习笔记

## 一、 Iris 是什么？（用日常类比理解）

想象一个社区公告栏：

传统方式（比如微信、微博）—— 公告栏放在一个大公司大楼门口，公司管钥匙，公司能看谁贴了纸条、删谁的内容。

**Iris 的做法**—— 社区里每个人都自带一块小公告栏，大家互相串门交换纸条。没有中心大楼，没有管理员，任何人想贴纸条就贴，想删自己的就删，但别人删不了你的。

Iris 就是一个**完全去中心化的 P2P 数据库**，让你用极少的代码就能构建去中心化应用。它不依赖任何中央服务器，数据存在用户的设备上，设备之间直接同步。

## 二、核心概念

### 概念 1：账户就是密钥对

在 Iris 里，**没有注册、没有密码、没有用户名**。你的"账户"就是一对加密密钥：公钥像邮箱地址（告诉别人你的标识），私钥像邮箱钥匙（证明你是你）。你可以随时生成新密钥对，就像随时换邮箱一样简单。

### 概念 2：频道（Channels）

数据按"频道"组织，比如 `profile`、`msgs`、`photos`。每个频道里有键值对，类似一个嵌套的字典：

```
频道 → 子键 → 数据
```

### 概念 3：订阅与回调

你可以"订阅"某个数据路径，一旦数据变化，Iris 自动调用你的回调函数。类似订阅微信公众号——公众号更新了，你手机马上收到通知。

### 概念 4：公共数据 vs 私密消息

- **公共数据**：任何人可读，类似社区公告栏贴海报
- **私密消息**：只有指定收件人能解密，类似加密信件

### 概念 5：群组查询

你可以按群体拉取数据。比如"获取我社交圈里所有人最近发的帖子"，或者"获取某个群管理员列表中所有人的动态"。

## 三、代码示例

### 示例 1：读写公共数据 —— 个人简介

最基础的用法：设置并读取一个公开的个人资料。

```js
// 第一步：导入 Iris 库
import iris from 'iris-lib';

// 第二步：初始化会话（生成密钥对，加入网络）
iris.session.init();

// 第三步：设置你的名字
// iris.public() 拿到自己的公共频道
// .get('profile').get('name') 定位到 profile/name 这个路径
// .put('张三') 写入数据
iris.public().get('profile').get('name').put('张三');

// 第四步：订阅这个名字的变化
// 一旦有人（或自己）改了这个名字，回调就会触发
iris.public().get('profile').get('name').on((name) => {
  console.log('我的名字是：', name);
});

// 第五步：读取别人的公开资料
// 需要对方的公钥（一个字符串标识符）
const 对方公钥 = 'hyECQHwSo7fgr2MVfPyakvayPeixxsaAWVtZ-vbaiSc.TXIp8MnCtrnW6n2MrYquWPcc-DTmZzMBmc2yaGv9gIU';
iris.public(对方公钥).get('profile').get('name').on((name) => {
  console.log('对方的名字是：', name);
});
```

**逐行拆解：**

| 代码 | 含义 | 类比 |
|------|------|------|
| `iris.session.init()` | 生成密钥对，连接网络 | 出门去社区，带上自己的小公告栏 |
| `iris.public()` | 访问自己的公共频道 | 走到自己的公告栏前 |
| `.get('profile').get('name')` | 定位到 profile/name 这个键 | 找到写着"姓名"的那张纸 |
| `.put('张三')` | 写入数据 | 贴上写着"张三"的纸条 |
| `.on((name) => {...})` | 订阅变化 | 站在公告栏旁，有人换纸条就收到通知 |

### 示例 2：群组消息 —— 社交网络动态

这个示例展示如何发一条公开消息，并获取整个社交网络的动态。

```js
// 第一步：初始化会话（同上）
iris.session.init();

// 第二步：发一条公开消息
// 用时间戳作为消息 ID，保证每条都唯一
iris.public().get('msgs').get(new Date().toISOString()).put({
  text: 'Hello world!',
  timestamp: Date.now()
});

// 第三步：获取"所有人"的消息
// iris.group('everyone') 表示整个网络中的所有人
// .map('msgs', ...) 遍历每个人的 msgs 频道
// 回调会收到两个参数：消息内容和发送者的标识
iris.group('everyone').map('msgs', (msg, from) => {
  // from 是发送者的公钥，slice(0, 6) 取前6个字符做简短显示
  console.log('来自', from.slice(0, 6), '的消息：', msg);
});
```

**关键 API 说明：**

- `iris.group('everyone')`：获取整个网络的用户群组
- `.map('msgs', callback)`：对群组里每个人的 `msgs` 频道执行映射操作
- `from` 参数：回调中自动传入消息来源的公钥标识

### 示例 3：私聊消息 —— 加密点对点通信

```js
// 用户 A 的初始化
const userA = iris.session.getKey();  // 获取 A 的密钥对
console.log('A 的公钥：', userA.pub);

// 用户 B 的初始化
const userB = iris.session.getKey();  // 获取 B 的密钥对
console.log('B 的公钥：', userB.pub);

// A 给 B 发送加密消息
iris.private(userB.pub).send('你好，B！这是私聊消息。');

// A 接收来自 B 的消息（回调方式）
iris.private(userB.pub).getMessages((msg) => {
  console.log('A 收到 B 的消息：', msg);
});

// B 给 A 回复
iris.private(userA.pub).send('你好，A！收到你的消息了。');

// B 接收来自 A 的消息
iris.private(userA.pub).getMessages((msg) => {
  console.log('B 收到 A 的消息：', msg);
});
```

**私聊的底层逻辑：**

1. A 用 B 的公钥标识创建一个加密通道
2. `send()` 写入消息，只有持有 B 私钥的人能解密
3. `getMessages()` 持续检查该通道有没有新消息
4. 数据在网络间同步时全程加密，中间节点无法读取

## 四、技术架构速览

Iris 底层使用 **GUN.js**（一个去中心化图数据库）作为数据传输层，加上 Iris 自己封装的联系人管理和加密通道。

```
你的应用代码
    ↓
iris-lib（封装的 API：public / private / group）
    ↓
GUN.js（去中心化 P2P 数据同步网络）
    ↓
浏览器 / 节点之间的 WebSocket 连接
```

- **离线优先**：数据先存本地，网络恢复后自动同步
- **发布-订阅模式**：通过回调实现实时数据更新
- **MIT 开源**：可以自由使用和修改

## 五、总结

| 要点 | 一句话 |
|------|--------|
| Iris 是什么 | 去中心化 P2P 数据库库，几行代码构建去中心化应用 |
| 账户 | 就是密钥对，随时生成，无需注册 |
| 数据组织 | 频道 + 键值对，类似嵌套字典 |
| 实时更新 | 订阅路径，数据变化自动触发回调 |
| 两种数据 | 公共（公开读写）和私密（加密点对点） |
| 群组能力 | 按群体拉取数据，适合社交网络场景 |

**下一步建议**：安装 `npm install iris-lib`，复制上面的示例代码运行，观察控制台输出，是最快的入门方式。

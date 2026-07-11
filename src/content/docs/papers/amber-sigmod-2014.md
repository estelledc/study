---
title: Amber — 把用户数据从 Web 应用里拆出来
来源: 'Chajed et al., "Amber: Decoupling User Data from Web Applications", HotOS XV 2015'
日期: 2026-07-08
分类: 分布式系统 / Web 存储
难度: 中级
---

## 是什么

Amber 是一套 **把用户数据和 Web 应用解耦** 的系统设计。

日常类比：

- 今天很多网站像"每家餐厅都把你的餐具锁在自己后厨"：照片在相册网站，邮件在邮箱网站，日历在日历网站，换一个应用就要导出、授权、再导入。
- Amber 想做成"你自己租一个储物柜，应用只是来用餐具的厨师"：数据按用户存放，应用拿到授权后才能读写，用户可以换应用但不必搬家。

论文的核心不是"再造一个数据库"，而是问一个 Web 架构问题：如果数据属于用户，应用只是处理数据的工具，云服务应该怎么组织？

## 为什么重要

不理解 Amber，下面这些事都讲不清：

- 为什么 Web 应用的"数据孤岛"会让用户被单个网站锁住
- 为什么 OAuth / 导出文件只能缓解问题，不能真正让多应用共享同一份数据
- 为什么一旦数据按用户分散到不同 provider，"全局查询"立刻变成最难的系统问题
- 为什么访问控制不能事后补丁式添加，而必须从查询、缓存、跨 provider 通信一起设计

一句话：Amber 把"应用拥有数据"改成"用户拥有数据，应用临时使用数据"。

## 核心要点

Amber 可以拆成三个角色：

1. **Provider — 用户的数据管家**
   每个用户选择一个 Amber provider 来存自己的对象、验证身份、执行查询。类比：银行保管箱由银行看门，但箱子里的东西属于你。

2. **Object + ACL — 不可变文件和权限单**
   数据被存成 key/value 对象；对象本身不可变，更新就是写一个新对象。每个对象带 ACL，说明哪些用户或 group 可以读。类比：档案一旦归档就不涂改，改动要放一份新版，并重写借阅名单。

3. **Global query — 跨管家的查找请求**
   应用不知道目标数据在哪个 provider，于是用简化 SQL 查询所有相关 provider。类比：你问"谁有发给我的信"，不是挨家挨户手动找，而是让邮局系统维护订阅。

关键挑战：查询看起来是全局的，但实现不能每次广播给所有 provider，否则一大就崩。

## 实践案例

### 案例 1：邮件收件箱怎么写成 standing query

如果 Sal 的邮箱地址是 `sal@amber.example`，邮件客户端可以注册一个长期查询：

```sql
SELECT from, subject, body
WHERE to = 'sal@amber.example'
  AND type = 'email'
```

逐部分解释：

1. `type = 'email'` 说明只看邮件对象，不看照片、日历或帖子。
2. `to = 'sal@amber.example'` 说明只收发给 Sal 的对象。
3. 这个查询是 standing query，provider 会持续维护结果，而不是用户每次刷新都全网扫一遍。

好处是邮件应用不必自己维护后端收件箱；它只要会创建邮件对象、注册查询、读取结果。

### 案例 2：类似 Twitter 的关注流

如果 Sam 想看 Alice 的公开动态，可以注册：

```sql
SELECT content
WHERE .owner = 'alice@provider2.example'
  AND type = 'tweet'
```

逐部分解释：

1. `.owner` 是对象拥有者；这里限定只看 Alice 创建的对象。
2. `type = 'tweet'` 把照片、邮件、日历排除掉。
3. 如果很多用户都关注 Alice，同一个 provider 可以合并这些相似订阅，只向 Alice 的 provider 注册一次兴趣。

这就是 Amber 的工程重点：把"很多用户的相似请求"合并，避免订阅数量按用户数爆炸。

### 案例 3：应用创建对象但不拥有对象

一个照片应用可以这样理解 Amber API：

```js
const photo = Amber.create({
  type: "photo",
  album: "trip",
  url: "hash://photo-bytes"
})
Amber.setACL(photo, ["bob@provider.example"])
const rows = Amber.scan("SELECT url WHERE type = 'photo' AND album = 'trip'")
```

逐部分解释：

1. `create` 创建的是用户名下的对象，不是照片应用私有库里的记录。
2. `setACL` 让 Bob 能读这张照片；权限跟对象走，而不是跟应用账号走。
3. `scan` 让另一个被授权的应用也能找到同一批照片，例如幻灯片工具或备份工具。

这和传统"照片网站开放一个自家 API"不同：Amber 希望应用都围绕同一份用户数据协作。

## 踩过的坑

1. **全局查询不能等于全网广播**：论文用 standing query 和 subscription merging 降低重复工作，否则 provider 数和用户数一大，查询会被网络流量拖死。

2. **ACL 本身也可能泄密**：如果 provider 把完整 ACL 发给另一个 provider，可能暴露"谁能看某个敏感对象"；Amber 只能发送和接收方用户相关的 ACL 子集。

3. **不可变对象让写入简单但让更新变绕**：修改一封邮件标签或一张照片说明时，本质是创建新对象或新元数据对象，应用必须能处理多版本。

4. **provider 之间不是天然互信**：每个 provider 只代表自己的用户可信，跨 provider 查询必须同时考虑身份、计费、滥用和离线。

## 适用 vs 不适用场景

**适用**：

- 用户生成内容，例如邮件、照片、日历、联系人、评论
- 数据天然属于个人，但需要多个应用一起处理
- 应用之间愿意使用共享格式，例如 JPEG、iCalendar、邮件字段
- 多 provider 生态，用户不想被单个网站锁死

**不适用**：

- 数据本来就属于服务方，例如电商库存、支付账本、反作弊日志
- 没有单一用户能拥有的数据，例如拍卖状态、多人游戏实时状态
- 需要大量服务器端计算的业务，例如视频转码、全量推荐训练
- 毫秒级强一致交易，应该看专门的分布式数据库或事务系统

## 历史小故事（可跳过）

- **2007**：W5 提出"没有墙的 Web"愿景，想让数据跨应用流动。
- **2010**：BStore 探索把 Web 应用和用户数据存储分开，是 Amber 的近亲。
- **2015**：Chajed、Gjengset、Kaashoek、Mickens、Morris、Zeldovich 等人在 HotOS XV 提出 Amber。
- **2015 之后**：MIT PDOS 的后续 Oort 项目继续研究跨 cloud provider 的全局查询。
- **今天回看**：Solid、个人数据仓、互操作协议都在碰类似问题，只是各自选择了不同落点。

## 学到什么

1. **数据归属会改变系统边界**：一旦默认"用户拥有数据"，应用后端、权限模型、查询路径都要重新设计。
2. **跨 provider 查询是用户主权的代价**：数据不再集中在一家应用里，查找就必须变成分布式系统问题。
3. **权限不是布尔开关**：ACL、group、查询合并、隐私泄露会互相影响，不能只在 API 门口做一次检查。
4. **不可变对象是工程取舍**：它简化缓存和并发，却把更新语义推给上层应用。
5. **愿景论文也有硬约束**：Amber 很像未来 Web 宣言，但论文最有价值的部分恰恰是把全局查询、滥用、计费、离线这些脏问题摆出来。

## 延伸阅读

- 论文 PDF：[Amber: Decoupling User Data from Web Applications](https://www.usenix.org/system/files/conference/hotos15/hotos15-paper-chajed.pdf)
- 项目页：[MIT PDOS — Amber](https://pdos.csail.mit.edu/projects/amber.html)
- 演示 slides：[Amber HotOS 2015 slides](https://jon.thesquareplanet.com/slides/hotos15-amber/)
- 相关系统：BStore — Separating Web Applications from User Data Storage
- [[spanner-2012]] —— 另一类全球分布式数据系统，对比看"用户数据互操作"和"强一致事务"的目标差异

## 关联

- [[spanner-2012]] —— 都谈全球数据访问，但 Spanner 优先解决事务一致性，Amber 优先解决用户数据归属
- [[bigtable-2006]] —— 分布式存储底座思路不同，适合对比"应用拥有表"和"用户拥有对象"
- [[oauth]] —— 常见授权协议能开放访问，但不改变数据仍被应用网站拥有的事实
- [[dremel]] —— Amber 把对象看成可查询的行，和大规模查询系统有相似抽象
- [[distributed-systems]] —— provider 互信、订阅合并、离线容错都属于分布式系统基本功
- [[privacy-engineering]] —— ACL 子集泄露问题说明隐私要进入协议设计层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

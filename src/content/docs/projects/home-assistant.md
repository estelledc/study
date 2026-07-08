---
title: Home Assistant Core — 本地优先的家庭自动化大脑
来源: 'https://github.com/home-assistant/core'
日期: 2026-07-08
分类: embedded
难度: 初级
---

## 是什么

Home Assistant Core 是一个用 Python 写的开源家庭自动化平台：它把灯、传感器、空调、门锁、语音助手这些原本各说各话的设备，统一变成可以观察、可以控制、可以自动联动的对象。

日常类比：它像家里的“总管家”。每个设备厂商像一个只会说方言的师傅，Home Assistant 的 integration 负责翻译；翻译完以后，自动化规则只需要说“有人来就开灯”“没人时关空调”。

最小例子不是安装命令，而是一个动作：

```yaml
actions:
  - action: light.turn_on
    target:
      entity_id: light.kitchen
```

这段话的意思是：让 Home Assistant 调用 `light` 这个领域里的 `turn_on` 动作，目标是厨房灯 `light.kitchen`。

它的定位不是“又一个手机 App”，而是一个本地运行的中枢：前端、自动化、integration、SQLite 历史库和 WebSocket API 都围绕同一个 Core 协作。

## 为什么重要

不理解 Home Assistant，下面这些事会很难解释：

- 为什么同一个家庭里 Hue、Zigbee、MQTT、Matter、蓝牙设备可以被一套规则联动
- 为什么“本地控制”和“隐私优先”会成为智能家居的核心卖点，而不只是情怀口号
- 为什么自动化不是简单的 if/else，而是 trigger、condition、action、mode 的组合
- 为什么数据库、事件总线、WebSocket 这些后端概念，会直接影响一盏灯什么时候亮

## 核心要点

Home Assistant Core 可以先拆成 **三层** 来理解：

1. **事件总线 + 状态机 + 服务注册表**：像家里的值班前台。传感器状态改变会发事件，状态机会记住每个实体当前值，服务注册表负责把“开灯”“调温”这种动作派给正确 integration。

2. **Integration 把设备翻译成 Entity**：像给每个家电贴统一工牌。无论背后是云 API、本地局域网、MQTT 还是蓝牙，进入 Home Assistant 后都尽量变成 `light.xxx`、`sensor.xxx`、`switch.xxx` 这种可组合对象。

3. **本地记录 + 实时连接**：像一本家里自己的流水账加对讲机。Recorder 默认用 `/config/home-assistant_v2.db` 里的 SQLite 记历史，WebSocket API 让前端或脚本实时订阅状态变化。

这三层合起来，解释了它和 HomeKit、Google Home、Alexa 的差异：Home Assistant 更开放、更可折腾、更本地，但也更需要理解底层规则。

## 实践案例

### 案例 1：有人经过厨房时开灯，没人后自动关

官方 automation 文档把自动化拆成 trigger、condition、action。下面是一个常见的运动传感器例子：

```yaml
automation:
  - alias: Kitchen motion light
    mode: restart
    triggers:
      - trigger: state
        entity_id: binary_sensor.kitchen_motion
        to: "on"
    conditions:
      - condition: sun
        after: sunset
    actions:
      - action: light.turn_on
        target:
          entity_id: light.kitchen
      - delay: "00:03:00"
      - action: light.turn_off
        target:
          entity_id: light.kitchen
```

**逐部分解释**：

- `triggers` 是“谁来敲门”：厨房运动传感器从别的状态变成 `on` 时启动
- `conditions` 是“现在合不合适”：只有日落后才继续执行
- `actions` 是“真正做事”：先开灯，等 3 分钟，再关灯
- `mode: restart` 表示如果 3 分钟内又检测到运动，就重新计时，避免人还在厨房灯却灭了

### 案例 2：让历史数据库别把小主机拖慢

Recorder integration 会把状态和事件写入数据库；官方文档说明默认推荐 SQLite，并提醒小存储介质要控制写入量。一个保守配置可以这样写：

```yaml
recorder:
  purge_keep_days: 7
  commit_interval: 30
  exclude:
    domains:
      - automation
      - updater
    entities:
      - sensor.noisy_power_meter
```

**逐部分解释**：

- `purge_keep_days: 7` 表示只留最近 7 天历史，避免数据库无限长大
- `commit_interval: 30` 把写盘节奏放慢一点，对 SD 卡或小主机更友好
- `exclude.domains` 排除整类实体，适合不需要回看历史的系统噪声
- `exclude.entities` 排除特别吵的单个传感器，比如每秒跳一次的功率读数

### 案例 3：用 WebSocket 订阅灯的状态变化

Home Assistant 的 WebSocket API 位于 `/api/websocket`，前端和外部客户端都可以用它实时收消息。一个最小交互像这样：

```json
{ "type": "auth", "access_token": "LONG_LIVED_ACCESS_TOKEN" }
```

```json
{ "id": 18, "type": "subscribe_events", "event_type": "state_changed" }
```

```json
{
  "id": 24,
  "type": "call_service",
  "domain": "light",
  "service": "turn_on",
  "target": { "entity_id": "light.kitchen" }
}
```

**逐部分解释**：

- 第一条是登录，token 错了就进不了命令阶段
- 第二条订阅 `state_changed`，以后灯、传感器、开关变化都会按事件推过来
- 第三条调用服务动作，等价于在 UI 里点“打开厨房灯”
- `id` 是回执编号，客户端靠它把请求和返回结果对上

这个案例能看出 Core 的“实时性”：你不是每隔几秒问一次灯亮没亮，而是让 Home Assistant 状态变了就推给你。

## 踩过的坑

1. **把 trigger 当成 condition**：trigger 是“发生过的事”，condition 只看自动化启动后的当前状态，快速开关时会出现竞态。

2. **忘记 automation mode**：默认 `single` 会在上一轮没结束时忽略新触发，带 `delay` 的灯光自动化尤其容易出怪问题。

3. **让 Recorder 记录所有噪声**：高频传感器会把 SQLite 写得很大，空间不足时升级和重建表都会变慢。

4. **以为 WebSocket 调服务会自动返回新状态**：服务调用只表示动作执行完；如果关心状态变化，要订阅 `state_changed`。

## 适用 vs 不适用场景

**适用**：

- 家里设备品牌很多，想用一套规则把它们串起来
- 想把核心控制放在本地，不希望所有动作都绕云端
- 愿意用 UI 起步，再逐步学习 YAML、实体、事件和服务
- 想把智能家居当长期项目维护，而不是只装一个遥控 App

**不适用**：

- 只想即插即用，完全不想排查网络、实体名、日志和配置
- 所有设备都被单一生态完整覆盖，而且你满意那个生态的限制
- 需要强商业 SLA、统一客服和厂家兜底，而不是社区驱动
- 不愿意为安全、备份、数据库和远程访问承担一点系统管理员责任

## 历史小故事（可跳过）

- **2013 年**：Paulus Schoutsen 从控制 Philips Hue 的 Python 小脚本出发，把 Home Assistant 推到 GitHub。
- **2017 年**：Hass.io 方向出现，把系统、Supervisor、加载项这些运维负担打包，降低小主机用户门槛。
- **2023 年**：项目十周年，社区已经从“能把灯点亮”成长到语音、能源、Matter、蓝牙等完整生态。
- **2024 年**：Open Home Foundation 成立，把 Home Assistant、ESPHome、Zigpy 等项目放到更长期的治理框架里。
- **现在**：GitHub stars 已经是 8 万多量级，Core 仍然保持 Python、asyncio、模块化 integration 的路线。

## 学到什么

1. **智能家居的核心不是设备，而是抽象**：把不同品牌折成统一 entity，规则才写得下去。
2. **本地优先是一种架构选择**：SQLite、事件总线、WebSocket、局域网协议都在服务“家里自己能跑”。
3. **自动化要想稳定，必须理解时间**：trigger 发生在过去，condition 看当前，mode 决定重入时怎么办。
4. **开放系统的代价是复杂度**：Home Assistant 给你更多控制权，也要求你愿意读日志、做备份、管安全。

## 延伸阅读

- 官方仓库：[home-assistant/core](https://github.com/home-assistant/core)
- 架构总览：[Architecture overview](https://developers.home-assistant.io/docs/architecture_index/)
- 核心结构：[Core architecture](https://developers.home-assistant.io/docs/architecture/core/)
- 自动化参考：[Automations in YAML](https://www.home-assistant.io/docs/automation/yaml/)
- 实时接口：[WebSocket API](https://developers.home-assistant.io/docs/api/websocket/)

## 关联

- [[mqtt]] —— 很多传感器和网关通过 MQTT 把状态送进 Home Assistant
- [[sqlite]] —— Recorder 默认数据库，用来保存本地历史状态
- [[websocket]] —— 前端和外部客户端实时订阅状态变化的通道
- [[python-asyncio]] —— Core 和大量 integration 的并发基础
- [[matter]] —— 智能家居互通标准，Home Assistant 正在深度接入
- [[raspberry-pi]] —— 许多人用它作为 Home Assistant 的低功耗本地服务器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

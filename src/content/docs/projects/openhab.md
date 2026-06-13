---
title: openHAB Core — Java OSGi 智能家居的「标准化物业中枢」
来源: 'https://github.com/openhab/openhab-core'
日期: '2026-06-13'
分类: 操作系统
子分类: 嵌入式
难度: 初级
provenance: pipeline-v3
---

## 日常类比：带「统一台账」的物业中控室

想象你管理一栋混合品牌的大楼：一楼是飞利浦 Hue 灯，二楼是 Sonoff 开关，车库是 Z-Wave 门磁，屋顶还有 MQTT 温湿度计。每家厂商有自己的 App、协议和云账号——住户（你）不可能为 40 个设备装 40 个客户端。

**物业中控室**就是 openHAB 扮演的角色：

- **登记硬件（Thing）**：物业知道「3 楼西户有一个可调光开关、一个温湿度传感器」，但住户不直接跟硬件对话。
- **统一台账（Item）**：台账上写「客厅灯：开/关」「卧室温度：23.5°C」。仪表盘、语音助手、自动化规则只认台账，不认具体品牌。
- **接线员（Binding）**：Hue 说 REST，Z-Wave 说射频，MQTT 说主题——Binding 把各协议翻译成 openHAB 能理解的 Channel。
- **配线表（Link）**：台账条目「客厅灯」接到 Hue 灯泡的「开关 Channel」，才算这条能力真正可用。
- **自动化手册（Rule）**：「日落且有人在客厅 → 开灯 30%」写在中控室的规则引擎里，由事件触发执行。

openHAB 是欧洲社区主导的开源家庭自动化平台，核心仓库 [openhab/openhab-core](https://github.com/openhab/openhab-core) 用 **Java + OSGi** 构建可插拔的 Binding/Addon 生态。与 [[home-assistant]] 同属「本地优先、多协议聚合」路线，但架构更强调 **Thing–Channel–Item 分层** 与 **Eclipse 式模块化（Bundle）**，适合喜欢文本配置、长期稳定运行、与 KNX/MQTT/Z-Wave 深度集成的用户。

---

## 解决什么问题

| 痛点 | 没有统一平台时 | openHAB 的回应 |
| --- | --- | --- |
| 协议碎片化 | 每类设备一套 SDK / 云 API | Binding 抽象为 Thing + Channel |
| UI 与硬件耦合 | 改设备要改界面逻辑 | Item 虚拟层，界面只绑 Item |
| 自动化难维护 | 厂商 App 里点选，不可版本管理 | `.items` / `.things` / `.rules` 文本可 Git 管理 |
| 欧洲标准生态 | KNX、EnOcean 等集成少 | 社区 Binding 覆盖广，KNX 等是强项 |
| 扩展与隔离 | 一个驱动崩溃拖垮全局 | OSGi Bundle 边界，Addon 可热插拔 |

核心问题：**如何把「物理设备能力」与「应用层逻辑（界面、规则、语音）」严格分离，并用可插拔模块连接任意协议？**

---

## openHAB 在整体栈中的位置

完整 openHAB 发行版通常包含多层（安装方式：openHABian、Docker、手动 JVM 等）：

```
┌─────────────────────────────────────────────────────────────┐
│  Main UI / HABPanel / 语音助手 / REST API                    │
├─────────────────────────────────────────────────────────────┤
│  openHAB Core（事件总线、Item 注册表、规则引擎、持久化）       │
│  ← openhab-core 仓库                                         │
├─────────────────────────────────────────────────────────────┤
│  Bindings / Add-ons（OSGi Bundle：MQTT、Hue、Z-Wave、KNX…）   │
├─────────────────────────────────────────────────────────────┤
│  物理设备 / 云服务 / MQTT Broker（如 [[mosquitto]]）          │
└─────────────────────────────────────────────────────────────┘
```

**本文聚焦 Core 所体现的概念模型**：Thing、Channel、Item、Link、Rule。无论你用 UI 发现设备还是手写 `.things` 文件，最终都汇入同一套事件总线与规则引擎。

---

## 核心概念：五层模型

官方文档（[Concepts](https://www.openhab.org/docs/concepts/)）把系统拆成清晰五层：

| 概念 | 是什么 | 日常类比 |
| --- | --- | --- |
| **Binding** | 连接某类协议/厂商的软件适配器（OSGi Addon） | 物业外包的「Hue 专线」「Z-Wave 专线」 |
| **Thing** | 可被系统管理的物理或逻辑实体（设备、服务） | 某一盏灯、某一个 MQTT Broker |
| **Channel** | Thing 暴露的单一能力（开关、温度、触发器） | 设备上的某个接口引脚 |
| **Item** | 应用层虚拟对象，有名称、类型、状态 | 台账上的「客厅灯」「卧室温度」 |
| **Link** | Channel ↔ Item 的一对多/多对多关联 | 配线：台账条目接到具体 Channel |

数据流简化：

```
物理设备 ──Binding──► Thing ──Channel──► Link ──► Item ──► UI / Rule / 持久化
                              ▲
                         事件总线（Item 状态变更、命令、Thing 上下线）
```

### Item 类型（常见）

Item 是规则与界面操作的**唯一入口**。常见类型包括：

| 类型 | 用途 | 典型命令 |
| --- | --- | --- |
| `Switch` | 开关 | ON / OFF |
| `Dimmer` | 调光（0–100%） | ON, OFF, INCREASE, DECREASE |
| `Number` | 数值（可带单位 `Number:Temperature`） | 数值更新 |
| `String` | 文本 | 字符串 |
| `Contact` | 开/闭（门磁） | OPEN / CLOSED |
| `Group` | 嵌套其他 Item，便于批量规则 | — |

Thing 与 Item ** deliberately 分离**：你可以把多个 Channel Link 到同一 Item，或一个 Item 只反映某个 Channel 的状态，而不必在规则里写设备 UID。

### Bridge（桥接 Thing）

Z-Wave USB  stick、Hue Bridge、MQTT Broker 常建模为 **Bridge Thing**，其下挂子 Thing：

```
Bridge mqtt:broker:home  ──包含──► Thing topic:sonoff_living
```

子 Thing 继承 Bridge 的连接参数（IP、用户名等），避免每个设备重复配置。

---

## 配置方式：发现 vs 文本文件

openHAB 支持两条路并存（可混用）：

1. **Inbox 发现**：安装 Binding 后扫描网络，UI 里点「添加」→ 存入内部数据库。
2. **文本配置**：`$OPENHAB_CONF/things/*.things`、`items/*.items`、`rules/*.rules`，适合 Git 版本管理与 Code Review。

注意：UI 添加的 Thing **不会**自动写回 `.things` 文件；生产环境常选「全文本」或「发现后导出」策略，避免配置漂移。

---

## 代码示例 1：`.things` — MQTT Broker 与 Sonoff 开关

以下示例来自官方 Things 文档的 MQTT 模式：先定义 Broker，再定义 Generic MQTT Thing 与 Channel（可与 [[mosquitto]] 配合）。

文件：`conf/things/mqtt.things`

```dsl
Bridge mqtt:broker:MyMQTTBroker [
  host="192.168.1.50",
  secure=false,
  username="mqtt_user",
  password="mqtt_pass"
] {
  Thing topic sonoff_living "Living Room Sonoff" @ "Living Room" {
    Channels:
      Type switch : PowerSwitch [
        stateTopic="stat/sonoff_living/POWER",
        commandTopic="cmnd/sonoff_living/POWER",
        on="ON",
        off="OFF"
      ]
      Type number : Temperature [
        stateTopic="tele/sonoff_living/SENSOR",
        transformationPattern="JSONPATH:$.SI7021.Temperature"
      ]
  }
}
```

解读：

- `Bridge mqtt:broker:MyMQTTBroker`：MQTT Binding 的 broker 类型，UID 第三段 `MyMQTTBroker` 自定义。
- 花括号内 `Thing topic sonoff_living`：Generic MQTT Thing，挂在该 Bridge 下。
- `Type switch : PowerSwitch`：状态 Channel，订阅 `stat/...`、发布命令到 `cmnd/...`。
- `Type number : Temperature`：用 JSONPath 从 SENSOR 报文里抽温度字段。

对应 **Item 与 Link**（`conf/items/living.items`）：

```dsl
Switch LivingRoom_Light "Living Room Light" { channel="mqtt:topic:MyMQTTBroker:sonoff_living:PowerSwitch" }
Number LivingRoom_Temp "Living Room Temperature [%.1f °C]" { channel="mqtt:topic:MyMQTTBroker:sonoff_living:Temperature" }
Group gGroundFloor "Ground Floor"
```

Channel UID 规则：`binding:thing-type:bridge-id:thing-id:channel-id`（Bridge 作父 Thing 时中间段包含 bridge id）。

---

## 代码示例 2：Rules DSL — 日落开灯 + 高温告警

openHAB 内置 **Rules DSL**（`.rules` 文件，位于 `conf/rules/`）。现代安装也支持 UI 规则、JavaScript/JRuby 脚本，但 DSL 仍是文档最完整、零基础最易上手的文本格式。

文件：`conf/rules/living.rules`

```dsl
import org.openhab.core.model.script.actions.Timer
import org.openhab.core.library.types.PercentType

var Timer motionOffTimer = null

rule "Living room light on at sunset"
when
    Channel 'astro:sun:local:set#event' triggered START
then
    LivingRoom_Light.sendCommand(ON)
    if (LivingRoom_Light.state != ON) {
        logInfo("living", "Failed to turn on living room light")
    }
end

rule "Dim living room when motion clears"
when
    Item LivingRoom_Motion changed to ON
then
    if (motionOffTimer !== null) {
        motionOffTimer.cancel()
        motionOffTimer = null
    }
    LivingRoom_Light.sendCommand(new PercentType(70))
end

rule "Turn off after 10 min no motion"
when
    Item LivingRoom_Motion changed to OFF
then
    motionOffTimer = createTimer(now.plusMinutes(10), [ |
        LivingRoom_Light.sendCommand(OFF)
        motionOffTimer = null
    ])
end

rule "High temperature warning"
when
    Item LivingRoom_Temp changed
then
    if ((LivingRoom_Temp.state as Number) > 28) {
        sendNotification("Living room temperature above 28°C: " + LivingRoom_Temp.state)
    }
end
```

要点：

- **触发器**：可以是 Item 变化、`Channel` 触发（如 Astro 绑定的日落事件）、时间 Cron、系统启动等。
- **`sendCommand` vs `postUpdate`**：前者走设备（经 Link 到 Channel）；后者只改 Item 状态（模拟/测试用）。
- **Timer**：规则内可声明 `var Timer`，避免_motion 抖动时重复关灯。

等价的 **极简 UI 规则** 逻辑是：When `LivingRoom_Temp` changes → If > 28 → Notification；Core 事件模型一致，只是编辑器不同。

---

## 事件与规则引擎（进阶一览）

规则可监听多类事件（[Rules 概念](https://www.openhab.org/docs/concepts/rules/)）：

| 触发源 | 示例 |
| --- | --- |
| Item | `Item Foo changed` / `received command` |
| Group | `Member of gLights changed` |
| Time | `Time cron "0 0 7 * * ?"` 每天 7:00 |
| Channel | Astro 日出日落、某些 Binding 的 trigger channel |
| Thing | `Thing 'mqtt:broker:MyMQTTBroker' changed to OFFLINE` |
| System | `System started` |

Script Action 可嵌 JavaScript（`automation/js`）、JRuby 等；Rules DSL 适合「单文件、无 npm 依赖」的家庭场景。

---

## 持久化、Transform 与 Sitemap（知道即可）

零基础路径上还会遇到三个邻居概念：

- **Persistence**：把 Item 历史存 InfluxDB、MapDB 等，供图表与「过去 24h 最高温」类规则使用。
- **Transformation**：Channel 原始字符串 → Item 状态（如 `JSONPATH`、`REGEX`、`MAP`），MQTT 示例中的 `transformationPattern` 即此类。
- **Sitemap / Main UI**：把 Item 排成手机端控件；openHAB 3+ 主推 Main UI，旧版 `.sitemap` 仍可用。

不必第一天全配齐；**Thing → Item → Rule** 跑通后再加持久化与仪表盘。

---

## 与 Home Assistant 的简要对比

| 维度 | openHAB | Home Assistant |
| --- | --- | --- |
| 语言 / 运行时 | Java，OSGi | Python |
| 设备模型 | Thing / Channel / Item 三层 | Integration → Entity 一层 |
| 配置文化 | `.things` / `.items` 文本传统强 | YAML + UI，社区模板多 |
| 欧洲协议 | KNX、EnOcean 等历史积累深 | 全球生态、ESPHome 等更热 |
| 规则 | Rules DSL、UI、JS/JRuby | YAML 自动化、Node-RED、脚本 |

二者都可本地部署、都支持 MQTT；选型常取决于已有硬件协议、团队语言栈（Java vs Python）与个人配置偏好。

---

## 零基础上手路径（建议顺序）

1. **安装**：openHABian（树莓派）或官方 Docker 镜像，确认 Main UI 可访问（默认 `8080`）。
2. **装 Binding**：Settings → Add-ons → 如 MQTT Binding、Astro Binding。
3. **加 Thing**：MQTT 可先手写 `.things` 连 [[mosquitto]]，或用 UI Inbox 发现 Hue/Z-Wave。
4. **建 Item 并 Link**：UI「Create Items」或 `.items` 文件 `{ channel="..." }`。
5. **写一条 Rule**：从「Item 变化 → logInfo」开始，再加 Astro 日落、定时 Cron。
6. **持久化（可选）**：InfluxDB + Grafana 看温湿度曲线。

调试技巧：Developer Tools → Events 监视 `ItemStateChangedEvent`；日志 `openhab.log` / `events.log` 查 Binding 是否 ONLINE。

---

## 常见坑

| 现象 | 可能原因 |
| --- | --- |
| Item 一直是 NULL | Link 未建、Channel UID 写错、Thing OFFLINE |
| 规则不触发 | 文件名非 `.rules`、语法错误未加载、触发器 Item 名拼写不一致 |
| MQTT 有消息 Item 不更新 | stateTopic/commandTopic 反了、JSONPath 不匹配、未 Link |
| UI 与文件配置不一致 | 同一 Thing 既在 DB 又在 `.things`，UID 冲突 |
| 改 `.things` 不生效 | 需触发配置刷新或重启；检查 `conf/things` 路径 |

---

## 小结

openHAB Core 提供的是一套**严格的物理–虚拟分层**：Binding 接入 Thing，Channel 暴露能力，Link 接到 Item，Rule 消费 Item 事件。日常类比就是「物业中控 + 统一台账 + 配线表 + 自动化手册」。用 MQTT `.things` 声明硬件、用 Rules DSL 写日落与告警，是从零到可运行家庭自动化的最短文本路径；深入后再扩展 OSGi Binding 开发、持久化与 Main UI 仪表盘即可。

---

## 参考链接

- 核心仓库：[openhab/openhab-core](https://github.com/openhab/openhab-core)
- 概念总览：[Concepts | openHAB](https://www.openhab.org/docs/concepts/)
- Things 配置：[Things | openHAB](https://www.openhab.org/docs/configuration/things.html)
- Items：[Items | openHAB](https://www.openhab.org/docs/concepts/items.html)
- Rules DSL：[Textual Rules | openHAB](https://www.openhab.org/docs/configuration/rules-dsl.html)

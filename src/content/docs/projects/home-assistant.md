---
title: Home Assistant Core — 开源智能家居的「中央调度台」
来源: 'https://github.com/home-assistant/core'
日期: '2026-06-13'
分类: 操作系统
子分类: 嵌入式
难度: 初级
provenance: pipeline-v3
---

## 日常类比：小区物业的「中央调度台」

想象你住在一栋智能公寓里。每间房有灯、空调、门锁、温湿度计；楼道有人体感应；车库有卷帘门。设备品牌各不相同——飞利浦灯、小米插座、Nest 温控、自家改装的 ESP32——它们不会「互相说话」。

**物业前台**就是 Home Assistant Core 扮演的角色：

- **登记在册**：每个设备在系统里有一个名字（`light.living_room`），当前状态写在册子上（开/关、温度 23.5°C）。
- **广播通知**：有人进门（传感器触发），前台通过内部广播（Event Bus）喊一声「状态变了」，订阅这条消息的自动化规则就会响应。
- **代你办事**：你说「把客厅灯调到 30% 亮度」，前台不是自己去拧灯泡，而是**调用对应厂家的标准指令**（Service：`light.turn_on`），各品牌驱动（Integration）翻译成具体协议（Zigbee、MQTT、HTTP……）。

你不需要记住 47 个 App；前台统一接待。Home Assistant Core 就是这套前台的**核心程序**——用 Python 写的开源家庭自动化引擎，GitHub 约 79k Stars，托管在 [home-assistant/core](https://github.com/home-assistant/core)。

和单纯买某个品牌生态的区别：Core **不绑定单一厂商**。它通过 2000+ Integration 把异构设备抽象成同一套「实体 + 状态 + 服务」模型，再用自动化、脚本、仪表盘把它们编排成「回家模式」「离家关灯」「温度过高开风扇」等场景。

---

## 解决什么问题

| 痛点 | 没有统一平台时 | Home Assistant Core 的回应 |
| --- | --- | --- |
| 设备孤岛 | 每个品牌一个 App，无法联动 | Integration 把设备注册为统一 Entity |
| 自动化碎片化 | IFTTT/厂商场景能力有限、难调试 | 本地 Trigger–Condition–Action 引擎，可 YAML 或 UI 编辑 |
| 隐私与离线 | 云端自动化断网即失效 | Core 默认跑在本地（树莓派、NAS、旧笔记本） |
| 状态不可见 | 不知道「现在家里到底是什么情况」 | State Machine 集中存储所有实体状态，开发者工具可查询 |
| 二次开发难 | 各协议各写一套 | REST API / WebSocket / Python 库统一读写状态、调服务 |

核心要回答的问题：**如何用一套本地、开源、可扩展的架构，把「物」变成「可查询、可触发、可编排」的软件对象？**

---

## Home Assistant 技术栈里 Core 在哪

完整 Home Assistant 产品常包含多层（安装方式不同，你实际跑的组件也不同）：

```
┌─────────────────────────────────────────────────────────┐
│  前端 UI（Lovelace 仪表盘）  ←→  Home Assistant Core    │
│         REST API / WebSocket                             │
├─────────────────────────────────────────────────────────┤
│  Supervisor（可选，HA OS 专属）— 管理加载项、备份、更新   │
├─────────────────────────────────────────────────────────┤
│  操作系统层（HA OS / Docker / venv / 容器）              │
└─────────────────────────────────────────────────────────┘
         ▲                    ▲
    Integration          MQTT / Zigbee / Thread …
    (Philips, Xiaomi,    物理设备与云服务
     ESPHome, …)
```

**本文聚焦 Core**：那个 7×24 跑着的 Python 程序。它不关心你是用 Docker 还是树莓派镜像，只要 Core 起来，Event Bus 就在跳、State Machine 就在记状态。

---

## 核心架构：四个「器官」

官方开发者文档把 Core 拆成四个协作部件（外加大量 helper）：

| 组件 | 职责 | 日常类比 |
| --- | --- | --- |
| **Event Bus** | 事件的发布与订阅，系统心跳 | 小区广播喇叭 |
| **State Machine** | 维护所有 Entity 的当前状态，变更时发 `state_changed` | 物业台账本 |
| **Service Registry** | 注册并执行 `domain.service` 动作 | 前台可代办的业务清单 |
| **Timer** | 每秒发 `time_changed` | 挂钟，到点触发定时自动化 |

数据流可以简化为：

```
设备/Integration ──更新──► State Machine ──state_changed──► Event Bus
                                                              │
自动化/脚本 ◄──监听──────────────────────────────────────────┘
     │
     └──call_service──► Service Registry ──► Integration 驱动硬件
```

理解这条链路后，读日志、写自动化、调 API 都不会迷路：**一切都是状态变化和服务调用，经由事件总线粘合**。

---

## 核心概念

### 1. Entity（实体）与 Entity ID

**Entity** 是 Core 里「一样东西」的最小单位：一盏灯、一个传感器、一个人、甚至太阳。每个实体有全球唯一的 **Entity ID**，格式为 `domain.object_id`：

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| `domain` | 类型/能力族 | `light`、`sensor`、`climate`、`person` |
| `object_id` | 该类型下的实例名 | `living_room`、`outdoor_temperature` |
| 完整 ID | `domain.object_id` | `light.living_room` |

在 **设置 → 开发者工具 → 状态** 可看到全部实体的 `state` 与 `attributes`（亮度、单位、友好名称等）。

### 2. State（状态）

每个实体在 State Machine 里是一条记录，核心字段：

- **state**：主状态值，字符串（`on` / `off` / `23.5` / `home`）
- **attributes**：附加字典（`brightness`、`unit_of_measurement`、`friendly_name`）
- **last_changed** / **last_updated**：变更时间戳

状态变化会产生 `state_changed` 事件，是自动化最常用的触发源。

### 3. Domain 与 Service（服务）

**Service** 是「让系统做一件事」的 API，命名 `domain.service_name`：

- `light.turn_on` / `light.turn_off` / `light.toggle`
- `climate.set_temperature`
- `script.good_morning`（自定义脚本也算服务）

调用服务时可传 **service_data**（如 `entity_id`、`brightness`、`temperature`）。Integration 负责把通用服务翻译成设备协议。

### 4. Integration（集成）

Integration 是连接外部世界的插件：发现设备、创建 Entity、实现平台（platform）逻辑。配置方式分两类：

- **UI 配置流（Config Flow）**：现代设备类集成的主流，向导式添加
- **YAML**：部分高级项仍写在 `configuration.yaml`（语法见官方 YAML 文档）

Core 启动时按配置加载 Integration 列表；每个 Integration 向 Service Registry 注册自己能处理的服务。

### 5. Automation（自动化）：Trigger → Condition → Action

自动化是 Core 最有用的用户面能力，结构固定：

1. **Trigger（触发器）**：何时运行（状态变、时间到、MQTT 消息、webhook……）
2. **Condition（条件，可选）**：触发后是否真执行（白天才开灯、仅当无人在家）
3. **Action（动作）**：做什么（开灯、发通知、调用脚本）

官方最小示例逻辑：*当 Paulus 从 `not_home` 变为 `home` 时，若太阳已下山，则打开客厅灯。*

### 6. 配置文件

- **`configuration.yaml`**：主配置入口，声明加载哪些 Integration、全局选项
- **`automations.yaml`**：UI 创建的自动化列表（YAML 列表，每项需唯一 `id`）
- 可用 `!include` 拆分大配置；敏感信息放 `secrets.yaml`

改 YAML 后可在 UI **检查配置** 并 **重载**，多数 Integration 无需重启整个 Core。

---

## 安装方式（零基础怎么跑起来）

| 方式 | 适合谁 | 说明 |
| --- | --- | --- |
| **Home Assistant OS** | 新手、树莓派 | 一体化镜像，带 Supervisor，最省心 |
| **Container（Docker）** | 已有 NAS/服务器 | 只跑 Core 容器，自行管理持久卷 |
| **Core（venv）** | 开发者 | `python -m homeassistant`，适合读源码、断点调试 |
| **HA Green / Yellow 等硬件** | 想「插电即用」 | 官方设备预装 OS |

零基础建议：先用 **HA OS 或 Docker** 把 Web UI 跑起来，添加一两个集成（如 `mobile_app`、`sun`、`ping`），在开发者工具里观察状态，再写第一条自动化。

本地默认 Web 端口 **8123**，首次启动会引导创建账户与家庭位置（影响日出日落触发）。

---

## 代码示例一：YAML 自动化（进门开灯）

下面是一条可放进 `automations.yaml` 或 UI「YAML 模式」的完整自动化：傍晚有人到家且客厅灯关着时，打开灯并设亮度。

```yaml
- id: welcome_home_evening
  alias: 傍晚回家开客厅灯
  description: 日落后有人到家则开灯
  mode: single
  trigger:
    - platform: state
      entity_id: person.jason
      from: not_home
      to: home
  condition:
    - condition: sun
      after: sunset
    - condition: state
      entity_id: light.living_room
      state: "off"
  action:
    - service: light.turn_on
      target:
        entity_id: light.living_room
      data:
        brightness_pct: 40
        transition: 2
```

要点：

- `trigger` 监听 `person` 实体状态迁移，不是轮询 GPS
- `condition` 用 `sun` 与 `state` 过滤误触发
- `action` 调用 `light.turn_on` 服务，属于声明式编排，不直接操作硬件

---

## 代码示例二：Python 通过 REST API 读状态、控设备

Core 对外提供 REST API（需在 `configuration.yaml` 启用 `api:` 集成，UI 安装通常已自带）。先用 **长期访问令牌（Long-Lived Access Token）** 认证。

```python
#!/usr/bin/env python3
"""通过 Home Assistant REST API 查询温度并在过热时开空调。"""
import os
import requests

HA_URL = os.environ.get("HA_URL", "http://127.0.0.1:8123")
TOKEN = os.environ["HA_TOKEN"]  # 在 UI：个人资料 → 安全 → 长期访问令牌

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


def get_state(entity_id: str) -> dict:
    r = requests.get(f"{HA_URL}/api/states/{entity_id}", headers=HEADERS, timeout=10)
    r.raise_for_status()
    return r.json()


def call_service(domain: str, service: str, **data) -> list:
    url = f"{HA_URL}/api/services/{domain}/{service}"
    r = requests.post(url, headers=HEADERS, json=data, timeout=10)
    r.raise_for_status()
    return r.json()


def main() -> None:
    temp_entity = "sensor.living_room_temperature"
    climate_entity = "climate.living_room_ac"

    state = get_state(temp_entity)
    temp = float(state["state"])
    print(f"当前温度: {temp} {state['attributes'].get('unit_of_measurement', '°C')}")

    if temp >= 28.0:
        print("温度过高，开启空调并设 26°C")
        call_service(
            "climate",
            "set_temperature",
            entity_id=climate_entity,
            temperature=26,
            hvac_mode="cool",
        )
    else:
        print("温度正常，无需操作")


if __name__ == "__main__":
    main()
```

等价的 `curl` 开灯命令（便于 shell 脚本集成）：

```bash
curl -X POST "${HA_URL}/api/services/light/turn_on" \
  -H "Authorization: Bearer ${HA_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"entity_id": "light.living_room", "brightness_pct": 30}'
```

API 路径规律：`GET /api/states/<entity_id>` 读状态；`POST /api/services/<domain>/<service>` 调服务。服务执行完毕会返回执行过程中变更的实体状态列表。

---

## 代码示例三：Template 传感器（衍生状态）

有时你要的状态不存在于单一设备，而是用多个实体**计算**出来。Template Integration 可在 YAML 里定义虚拟传感器：

```yaml
# configuration.yaml 片段
template:
  - sensor:
      - name: "客厅是否闷热"
        unique_id: living_room_stuffy
        state: >
          {% if states('sensor.living_room_temperature') | float > 27
                and states('sensor.living_room_humidity') | float > 70 %}
            stuffy
          {% else %}
            ok
          {% endif %}
        icon: >
          {% if is_state('sensor.living_room_stuffy', 'stuffy') %}
            mdi:weather-hazy
          {% else %}
            mdi:check-circle
          {% endif %}
```

Template 使用 Jinja2 语法，可读其他实体状态。算出的 `sensor.living_room_stuffy` 与普通传感器一样，可被自动化 trigger 监听——这是「软件定义传感器」的常见模式。

---

## 与 MQTT、Matter 的关系

- **MQTT**：许多设备（ESPHome、Tasmota、Zigbee2MQTT）把状态发布到 broker；Core 的 MQTT Integration 订阅 topic，映射为 Entity。常与 [[mosquitto]] 搭配，Core 做编排，Mosquitto 做消息中转。
- **Matter / Thread / Zigbee**：通过对应 Integration 或加载项接入，最终仍落成 Entity + Service，上层自动化写法不变。

协议在变，**Core 抽象层不变**——这是它历经多年仍活跃的原因。

---

## 开发者延伸路径

1. **读状态、调服务**：REST / WebSocket API，外部脚本、手机快捷指令
2. **写 Automation / Script / Scene**：YAML 或 UI，快速验证逻辑
3. **自定义 Integration**：Python，`ConfigFlow` + `Entity` 类，贡献到 [home-assistant/core](https://github.com/home-assistant/core)
4. **读源码**：从 `homeassistant/core.py` 启动流程、`homeassistant/helpers/event` 事件总线入手

官方开发者文档：[developers.home-assistant.io](https://developers.home-assistant.io/) — 架构、Integration 规范、质量门槛（测试、类型注解）均有说明。

---

## 常见坑与建议

| 现象 | 可能原因 | 建议 |
| --- | --- | --- |
| 自动化不触发 | 实体 ID 拼错、trigger 的 `from`/`to` 与实际状态不符 | 开发者工具 → 日志，开自动化调试 |
| YAML 改完无效 | 未重载配置或语法错误 | 先「检查配置」，再重载自动化/模板 |
| API 401 | 令牌过期或权限不足 | 重新签发长期令牌，勿把令牌提交 Git |
| 性能变慢 | 高频 template、过多 recorder 实体 | 缩小 `recorder` 包含域，优化 template 更新间隔 |
| 设备显示 unavailable | Integration 断连、MQTT broker 挂了 | 先修连通性，再看 Core |

零基础学习路线建议：**装起来 → 认 Entity ID → 看状态 → 写一条自动化 → 用 API 读一个传感器**。四步走完，你就已经理解 Core 80% 的日常用法。

---

## 小结

Home Assistant Core 不是「又一个智能家居 App」，而是跑在你家里的**开源自动化内核**：Event Bus 传递消息，State Machine 记住世界长什么样，Service Registry 执行动作，Integration 对接真实设备。把一切抽象成 `entity_id` + `state` + `service`，自动化和 API 就有了统一语言。

- 项目地址：[https://github.com/home-assistant/core](https://github.com/home-assistant/core)
- 用户文档：[https://www.home-assistant.io/docs/](https://www.home-assistant.io/docs/)
- 开发者文档：[https://developers.home-assistant.io/](https://developers.home-assistant.io/)

下一步可深入：ESPHome 自制传感器、Node-RED 可视化流、或与 [[mosquitto]] 搭建完整 MQTT 家居链路。

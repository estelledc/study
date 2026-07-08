---
title: ESPurna — 给便宜智能开关换一套本地大脑
来源: 'https://github.com/xoseperez/espurna'
日期: 2026-07-08
分类: embedded
难度: 初级
---

## 是什么

ESPurna 是一个给 ESP8266 / ESP8285 智能开关、灯、插座、传感器刷入的开源固件。日常类比：像给一台只听厂商 App 的遥控插座，换成一套能听你家 MQTT、网页、OTA 命令的本地大脑。

最小例子不是先写 C++，而是让一个已经刷好 ESPurna 的继电器听 MQTT：

```bash
mosquitto_pub -h 192.168.1.2 -t 'home/living/light/relay/0/set' -m 'toggle'
```

这行命令的意思是：把 `toggle` 发到第 0 路继电器的命令主题，设备收到后切换开关状态。

ESPurna 的价值不在“我能点亮一个灯”，而在它把 WiFi 配网、Web UI、MQTT、HTTP 配置、OTA、传感器、电量统计这些杂事打包成一套固件骨架。

## 为什么重要

不理解 ESPurna，下面这些事都很难解释：

- 为什么很多 ESP8266 智能插座能从云端 App 设备，变成本地 MQTT 设备
- 为什么同一份固件既能管继电器，又能报温湿度、电压、电流、功率
- 为什么嵌入式项目常把“编译选项”和“运行时设置”分开管理
- 为什么 OTA、闪存布局、1MB 板子空间会成为智能家居固件的大坑

## 核心要点

ESPurna 可以拆成 **三层** 来看：

1. **硬件适配层**：给不同插座、开关、灯泡贴“针脚说明书”。类比：同样是墙上开关，有的按钮接左边，有的继电器接右边，ESPurna 用编译 flag 和硬件预设把差异收起来。

2. **本地控制层**：设备自己跑 Web UI、MQTT、HTTP、Telnet、OTA。类比：家里每个开关都有一个小前台，既能接电话，也能开网页，还能收快递式的更新包。

3. **集成层**：把状态发给 Home Assistant、Domoticz、InfluxDB、Prometheus、Thingspeak 等系统。类比：开关不是孤岛，它会把“灯开了”“功率 430W”这类消息送到家里的总控台。

三层加起来，ESPurna 更像一个智能家居固件框架，而不是某一块板子的 demo。

## 实践案例

### 案例 1：给 Sonoff Basic 构建固件

官方 Wiki 推荐用 PlatformIO 构建，Sonoff Basic 有现成环境：

```bash
git clone https://github.com/xoseperez/espurna
cd espurna/code
pio run -e itead-sonoff-basic
```

**逐部分解释**：

- `git clone` 是把 ESPurna 源码拿到本地，不是下载一个神秘二进制
- `cd espurna/code` 进入 PlatformIO 项目目录，ESPurna 的源码根在这里
- `-e itead-sonoff-basic` 选择一套预设环境，告诉编译器“我要给 Sonoff Basic 做固件”

如果用通用 1MB 环境，也可以把板子型号写成编译 flag：

```bash
env ESPURNA_FLAGS='-DITEAD_SONOFF_BASIC' pio run -e esp8266-1m-base
```

这就是“硬件适配层”的入口：同一套 C++ 代码，通过 `-D...` 切到不同板卡。

### 案例 2：用 MQTT 控制继电器和读状态

ESPurna 的 MQTT 约定是：状态主题负责广播，命令主题通常在后面加 `/set`。

```bash
mosquitto_sub -h 192.168.1.2 -t 'home/living/light/relay/0'
mosquitto_pub -h 192.168.1.2 -t 'home/living/light/relay/0/set' -m 'on'
mosquitto_pub -h 192.168.1.2 -t 'home/living/light/relay/0/set' -m 'off'
```

**逐部分解释**：

- `relay/0` 是第 0 路继电器的状态，ESPurna 会发布 `0` 或 `1`
- `relay/0/set` 是命令入口，其他系统要控制它就往这里发
- payload 可以用 `on`、`off`、`toggle`，也可以用数字表达开关动作

这个设计让 Home Assistant、openHAB、Node-RED、脚本都能用同一种消息总线接入。

### 案例 3：首次配网后用 HTTP 配置设备

第一次正常启动时，ESPurna 会开一个临时热点；配置好密码后，也可以用 `/config` 接口备份或替换运行时设置。

```bash
curl --digest -u admin:fibonacci http://192.168.4.1/config

curl -F 'data={"app":"ESPURNA","hostname":"desk-plug","ssid0":"LabWiFi","pass0":"secret123"};type=application/json' \
  --digest -u admin:fibonacci \
  http://192.168.4.1/config
```

**逐部分解释**：

- `--digest -u admin:fibonacci` 是默认账号口令，只适合首次进入，随后必须改
- `/config` 返回当前设置，也能接收 JSON 更新
- JSON 里的 `app` 必须是 `ESPURNA`，否则设备会忽略这份配置
- `hostname`、`ssid0`、`pass0` 是运行时设置，不需要重新编译固件

这说明 ESPurna 有两条配置线：板卡能力靠编译 flag，现场信息靠 Web UI / HTTP / 终端设置。

## 踩过的坑

1. **把状态主题当命令主题**：往 `relay/0` 发消息不会可靠控制继电器，命令默认在 `relay/0/set`。

2. **忽略默认密码**：首次热点和 Web UI 口令公开写在文档里，不改密码就等于把开关控制权留在门口。

3. **从旧版直接 OTA 到新闪存布局**：历史 issue 记录过 1.8.3 闪存布局变化导致配置无法持久化，旧设备升级要先看版本说明。

4. **以为 MQTT SSL 是普通开关**：README 明确说常规构建不带 MQTT TLS，公网 broker 或云服务要额外评估固件大小、性能和安全边界。

## 适用 vs 不适用场景

**适用**：

- 你手上有 ESP8266 / ESP8285 设备，愿意刷机并接受开盖、接串口、查板卡定义
- 你想把智能开关接入本地 MQTT、Home Assistant、openHAB 或自己的脚本
- 你需要 Web UI、OTA、调试终端、传感器读数这些“固件基础设施”
- 你希望一套代码覆盖多种继电器、灯带、功率计、温湿度传感器

**不适用**：

- 你只想买来即用，不想碰串口、编译、WiFi AP、固件升级
- 你必须依赖厂商云、手机 App 生态、售后保修或官方认证
- 你要做安全关键控制，比如门锁、医疗、电机保护这类失败代价很高的系统
- 你主要目标是 ESP32 量产；截至 2026-07-08，ESP32 支持仍要看当前 PR 和分支状态

## 历史小故事（可跳过）

- **2017 年前后**：ESPurna 从 ESP8266 智能开关固件起步，名字来自加泰罗尼亚语里的“火花”。
- **2017 年**：项目 issue 已经在讨论 MQTT SSL、闪存布局、OTA 升级这些真实设备才会遇到的问题。
- **2018 年**：仓库从 Bitbucket 迁到 GitHub，原因之一是社区、文档、贡献流程更适合开源协作。
- **2018 年 11 月后**：Max Prokhorov 成为活跃协作者，项目不再只是作者一个人的业余维护。
- **2026 年**：仓库约 3k stars，仍有 ESP32 port、动态继电器、传感器等方向的社区工作在推进。

## 学到什么

1. **固件不是一个 loop 函数**：成熟固件要同时处理配网、配置、通信、升级、存储和故障恢复。
2. **MQTT 的强项是约定**：只要主题和 payload 稳定，Web UI、Home Assistant、脚本都能换着接。
3. **嵌入式的坑常在“边界”**：闪存布局、1MB 空间、TLS、OTA 失败，比业务逻辑更容易让设备变砖。
4. **开源固件的护城河是硬件库**：支持的板卡、传感器、功率计越多，迁移成本越低。

## 延伸阅读

- 官方仓库：[xoseperez/espurna](https://github.com/xoseperez/espurna)
- 构建文档：[ESPurna Wiki — PlatformIO](https://github.com/xoseperez/espurna/wiki/PlatformIO)
- MQTT 约定：[ESPurna Wiki — MQTT](https://github.com/xoseperez/espurna/wiki/MQTT)
- 配置接口：[ESPurna Wiki — Configuration](https://github.com/xoseperez/espurna/wiki/Configuration)
- [[platformio-core]] —— ESPurna 推荐的嵌入式构建入口
- [[home-assistant]] —— ESPurna 常见的上层自动化中枢

## 关联

- [[mqtt-s-2008]] —— ESPurna 的 relay、sensor、light 控制主要靠 MQTT 主题约定
- [[mosquitto]] —— 本地 broker 可作为 ESPurna 设备和自动化系统之间的消息中转站
- [[platformio-core]] —— 用环境和编译 flag 管理不同 ESP8266 板卡
- [[home-assistant]] —— ESPurna 支持 MQTT discovery，让设备更容易被家庭中枢识别
- [[esphome]] —— 同样面向 ESP 设备，但更偏 YAML 声明式生成固件
- [[openhab]] —— 另一个能通过 MQTT 接入 ESPurna 的自动化平台
- [[embedded-hal]] —— 帮你理解为什么硬件抽象层能减少板卡差异带来的混乱

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

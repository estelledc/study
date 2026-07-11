---
title: openHAB — Java OSGi 家庭自动化框架
来源: 'https://github.com/openhab/openhab-core'
日期: 2026-07-08
分类: embedded
难度: 中级
---

## 是什么

openHAB 是一个用 Java 和 OSGi 组织起来的家庭自动化框架：它把灯、传感器、音箱、窗帘、天气服务这些“各说各话”的东西，翻译成统一的自动化对象。

日常类比：像家里的总电箱加万能转接头。总电箱负责把线路接稳，转接头负责听懂不同品牌插头，最后你只看到“客厅灯”“卧室温度”“回家模式”这些可操作对象。

`openhab-core` 本身不是最终用户安装的完整产品，而是 openHAB runtime 的核心 bundle 仓库。真正的发行版会把这些 core bundle、add-ons、UI、规则引擎和运行时打包到一起。

最小例子先看它的“统一语言”：

```text
Switch Kitchen_Light "Kitchen Light" { channel="mqtt:topic:home:kitchen:switch" }
rule "Turn kitchen light on"
when
  Item Kitchen_Light received command ON
then
  logInfo("demo", "Kitchen light requested ON")
end
```

这段里，真实设备可能是 MQTT、Z-Wave、Hue 或 KNX，但规则只面对 `Kitchen_Light` 这个 Item。

## 为什么重要

不理解 openHAB，下面这些事会很难解释：

- 为什么家庭自动化不是“写一堆设备 API 调用”，而是先把设备翻译成 Things、Channels、Items、Links。
- 为什么 openHAB 可以边运行边加 binding：OSGi bundle 让功能像插件一样被安装、启动、停止。
- 为什么同一个规则能联动 Hue 灯、Z-Wave 开关、MQTT 传感器和云服务：Item 是统一抽象层。
- 为什么开发新设备支持时，重点不是先写 UI，而是写 Thing 描述、Handler、Discovery 和 Channel 状态更新。

## 核心要点

1. **OSGi bundle 是可插拔积木**。类比：家里电箱里每个空开控制一条线路，坏了可以单独换。openHAB core 和 add-ons 都按 bundle 拆开，运行时通过服务注册表把功能拼起来。

2. **Binding 把真实世界翻译成 openHAB 世界**。类比：外语翻译员坐在设备和规则之间。外面是设备协议，里面是 Thing、Channel、Item、Command、State。

3. **Items 是用户和规则真正面对的接口**。类比：遥控器按钮比电路图重要。Thing 描述物理设备，Channel 暴露能力，Item 才是 UI 和规则读写的稳定名字。

## 实践案例

### 案例 1：从源码构建 openHAB Core bundle

官方 README 给出的开发入口是 Maven 构建，适合想改 core 或确认本机环境的人：

```bash
git clone https://github.com/openhab/openhab-core.git
cd openhab-core
export MAVEN_OPTS="-Xms512m -Xmx1024m"
mvn clean spotless:apply install
```

逐部分解释：

- `openhab-core` 产物主要是一组 OSGi bundle，不是一个“下载即住”的完整智能家居 App。
- `MAVEN_OPTS` 给 Maven 和测试过程留内存，Java 大项目第一次构建会拉很多依赖。
- `spotless:apply` 会按项目格式化规则整理代码，避免提交时只因为格式失败。
- 如果只是快速确认能编译，README 也给了跳过检查和测试的 Maven 参数，但那不代表代码质量已通过。

### 案例 2：把设备能力接成 Item，再用规则做场景

官方 Things/Items/Rules 文档里常见的一条链路是：Thing 暴露 Channel，Item 链到 Channel，Rule 操作 Item。

```text
Switch Kitchen_Light_Switch "Kitchen Light" (Indoor_Lights) {
  channel="zwave:device:1a2b3c4d:node2:switch_binary"
}

rule "Movie Scene"
when
  Item MovieScene received command ON
then
  LivingRoom_Blinds.sendCommand(90%)
  LivingRoom_MainLight.sendCommand(OFF)
  LivingRoom_LEDStripe.sendCommand(50%)
  Soundbar.sendCommand(ON)
  TV.sendCommand(ON)
end
```

逐部分解释：

- `zwave:device:...:switch_binary` 是某个 Z-Wave Thing 的 Channel ID，代表真实开关能力。
- `Kitchen_Light_Switch` 是 Item 名，规则和 UI 不需要知道底层协议细节。
- `MovieScene` 是一个“虚拟按钮”，按一下就批量发命令，像 HomeKit 或 Hue 的场景。
- 这说明 openHAB 的常见姿势不是“每个设备写一段脚本”，而是把设备能力先标准化，再组合。

### 案例 3：开发一个 binding 时先描述 Thing，再写 Handler

Developer Guide 里，binding 开发从 ThingType/ChannelType XML 和 Java HandlerFactory 开始：

```xml
<thing-type id="weather">
  <label>Sample Weather Thing</label>
  <description>Weather service exposed as openHAB channels</description>
  <channels>
    <channel id="temperature" typeId="setpoint-temperature" />
    <channel id="humidity" typeId="humidity" />
  </channels>
</thing-type>
```

```java
@Component(configurationPid = "binding.myweatherbinding",
    service = ThingHandlerFactory.class)
public class WeatherHandlerFactory extends BaseThingHandlerFactory {
    @Override
    protected ThingHandler createHandler(Thing thing) {
        return new WeatherHandler(thing);
    }
}
```

逐部分解释：

- XML 先告诉 runtime：“这个外部系统有温度、湿度这些 Channel。”
- `ThingHandlerFactory` 再告诉 runtime：“遇到这种 Thing 时，用哪个 Java 类处理通信。”
- 真正的 Handler 负责连设备、收状态、处理命令、更新 Channel。
- 这就是 openHAB 的双层架构：OSGi bundle 管插件生命周期，binding 内部再把设备抽象成 Thing/Channel。

## 踩过的坑

1. **把 openHAB Core 当成最终产品**：Core 是框架和 bundle 仓库，普通用户通常装 openHAB distribution。

2. **把 Thing 和 Item 混在一起**：Thing 偏物理设备，Item 偏功能接口；规则直接依赖 Thing 会很难维护。

3. **为小需求硬写 binding**：官方开发文档提醒，简单 HTTP 拉值可能用 rule/action 就够了，写 binding 反而增加维护成本。

4. **忽略 OSGi 依赖状态**：bundle 可能因为缺依赖停在 INSTALLED/RESOLVED，看到“装了 jar”不等于功能已经 ACTIVE。

## 适用 vs 不适用

**适用**：

- 家里或实验室有多品牌设备，需要本地规则统一联动。
- 团队要给新硬件、新协议、新云服务写家庭自动化接入层。
- 需要 Java 生态、OSGi 插件化、长期运行和欧洲社区经验的智能家居项目。
- 想学习“设备协议 → 统一模型 → 自动化规则”的完整 IoT 网关设计。

**不适用**：

- 只控制一两个同品牌设备，厂商 App 或简单脚本已经足够。
- 团队不熟 Java、Maven、OSGi，且项目周期很短。
- 追求极简容器部署和 Python 插件生态，可能先看 [[home-assistant]]。
- 高吞吐数据采集或工业消息总线场景，[[emqx]]、[[mosquitto]]、[[kafka]] 更像主角。

## 历史小故事（可跳过）

- **2010 年左右**：openHAB 由 Kai Kreuzer 发起，目标是做一个厂商中立的家庭自动化总线。
- **2013 年前后**：项目进入 Eclipse SmartHome 生态，OSGi 和 Java modularity 成为长期技术底座。
- **2017 年后**：openHAB 2 把 Things/Channels/Items 模型推到主流使用路径，binding 生态继续扩大。
- **2020 年后**：openHAB 3/4/5 逐步统一 UI、规则和 add-on 体验，同时继续保留文本配置路线。
- **今天**：openHAB Core 仓库约千级 stars，openHAB 生态整体在欧洲智能家居社区里仍然很活跃。

## 学到什么

1. **智能家居的难点是统一模型，不只是接设备**：没有 Items/Channels 这种中间层，规则会被设备 API 绑死。
2. **OSGi 的价值在长期运行时可扩展**：bundle 生命周期、服务注册、依赖解析让插件化不是一句口号。
3. **binding 是协议适配器，不是业务脚本**：它应该把外部世界稳定翻译进 openHAB，而不是写一次性自动化。
4. **文本配置和 UI 配置可以共存**：新手用 UI 快速开始，进阶用户用 `.items`、`.things`、rules 文件做可版本化配置。

## 延伸阅读

- GitHub 仓库：[openhab/openhab-core](https://github.com/openhab/openhab-core)
- 官方概念：[Things, Channels, Bindings, Items and Links](https://www.openhab.org/docs/concepts/)
- 官方开发：[Developing a Binding](https://www.openhab.org/docs/developer/bindings/)
- 官方配置：[Items](https://www.openhab.org/docs/configuration/items)
- 视频：[openHAB Foundation YouTube](https://www.youtube.com/@openHAB)
- [[home-assistant]] —— 同类家庭自动化平台，适合对比抽象模型和插件生态。

## 关联

- [[home-assistant]] —— 同样做家庭自动化，但 Python integration 和 openHAB binding 的生态气质不同。
- [[openwrt]] —— 家庭网关常跑在路由器或边缘设备上，openHAB 可作为上层自动化服务。
- [[mosquitto]] —— MQTT broker 常给 openHAB 提供传感器消息入口。
- [[emqx]] —— 大规模 IoT MQTT 平台，对比 openHAB 的家庭/边缘定位。
- [[spring-boot]] —— 都是 Java 生态，但 Spring 偏业务服务，openHAB 偏设备自动化 runtime。
- [[zephyr]] —— 低功耗设备侧可能跑 RTOS，openHAB 在网关侧统一这些设备。
- [[prometheus]] —— openHAB 关注控制与自动化，Prometheus 关注指标采集和告警。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[esphome]] —— ESPHome — 用 YAML 给 ESP32 / ESP8266 生成智能家居固件
- [[espurna]] —— ESPurna — 给便宜智能开关换一套本地大脑

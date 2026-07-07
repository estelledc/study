---
title: LinuxCNC — 实时控制 CNC 机床的开源系统
来源: 'https://github.com/LinuxCNC/linuxcnc'
日期: 2026-07-07
分类: embedded
难度: 中级
---

## 是什么

LinuxCNC 是一套把普通 Linux 电脑变成 CNC 机床控制器的开源系统。日常类比：像把电脑接到一台会动的打印机上，但打印的不是纸，而是刀具、主轴、工作台和安全开关。

它不是单纯的绘图软件，也不是只负责发一串指令的串口工具。它会启动实时系统，读 INI 配置，加载 GUI、运动控制、HAL 硬件抽象层，再按很稳定的节拍给步进电机、伺服、主轴、冷却和限位开关发信号。

最小入口通常长这样：

```bash
linuxcnc configs/sim/sim.ini
```

这句话的意思是：用一个模拟机床配置启动 LinuxCNC。新手先在模拟器里练习，确认 G-code、界面和 HAL 连接都能跑，再碰真实机器。

## 为什么重要

不理解 LinuxCNC，下面这些事都容易混在一起：

- 为什么 CNC 控制不能只靠“程序平均跑得快”，还要看最坏一次响应慢不慢
- 为什么配置机床不只是改一个软件设置，而是把 GUI、运动控制、HAL、驱动和安全链路接起来
- 为什么同一套软件能管铣床、车床、3D 打印、等离子切割和机器人手臂
- 为什么真实机器调试必须先做模拟、延迟测试和急停验证，不能直接让电机上电乱跑

## 核心要点

1. **实时节拍**：普通桌面程序像排队买咖啡，晚几秒也只是尴尬；CNC 像红绿灯控制路口，晚一次就可能撞车。LinuxCNC 依赖实时内核和固定周期线程，让关键函数按规定节拍执行。

2. **HAL 像接线板**：HAL 里的 pin、signal、net 很像真实电柜里的端子排。你不直接把“按钮”写死进“主轴”，而是用信号把按钮输出接到主轴输入，中间还能插逻辑、滤波和安全条件。

3. **INI 负责把整机拼起来**：INI 文件像机床的总装清单。它告诉 `linuxcnc` 要加载哪个 GUI、哪些 HAL 文件、哪些运动参数、哪些工具表和变量文件，所以它是配置入口，不是全部配置。

## 实践案例

### 案例 1：先启动一个模拟机床

```bash
linuxcnc
linuxcnc configs/sim/sim.ini
linuxcnc /etc/linuxcnc/sample-configs/stepper/stepper_mm.ini
```

逐部分解释：

- 第一行不带 INI，会打开配置选择器，适合第一次找样例
- 第二行用源码树里的模拟配置启动，适合学习界面和 G-code
- 第三行用系统安装路径里的步进样例启动，适合对照真实配置

这就是 LinuxCNC 的第一种常见姿势：先在 `sim` 里学会开机、复位、回零、跑程序，再复制一个接近自己硬件的样例去改。

### 案例 2：做延迟测试，判断这台电脑能不能直接发步进脉冲

```bash
latency-test
latency-test 50000 1000000
latency-test -h
```

逐部分解释：

- `latency-test` 会启动默认的 base thread 和 servo thread 延迟测试
- `50000 1000000` 表示 base thread 周期 50 微秒、servo thread 周期 1 毫秒
- `-h` 用来查看参数，避免把测试命令当成固定咒语背

这就是第二种常见姿势：在机器上跑测试，同时移动窗口、复制大文件、跑图形程序，观察最坏抖动。软件步进最怕“偶尔慢一下”，因为脉冲一抖，电机就可能丢步。

### 案例 3：用 HAL 把信号发生器接到两个步进轴

```text
halrun
halcmd: loadrt stepgen step_type=0,0 ctrl_type=v,v
halcmd: loadrt siggen
halcmd: loadrt threads name1=fast fp1=0 period1=50000 name2=slow period2=1000000
halcmd: net X-vel siggen.0.cosine => stepgen.0.velocity-cmd
halcmd: net Y-vel siggen.0.sine => stepgen.1.velocity-cmd
halcmd: addf siggen.0.update slow
halcmd: addf stepgen.update-freq slow
halcmd: addf stepgen.make-pulses fast
halcmd: setp stepgen.0.position-scale 10000
halcmd: setp stepgen.1.position-scale 10000
halcmd: setp stepgen.0.enable 1
halcmd: setp stepgen.1.enable 1
halcmd: start
```

逐部分解释：

- `loadrt` 加载实时组件，`stepgen` 负责发步进脉冲，`siggen` 负责产生正弦和余弦
- `threads` 创建两个节拍：快线程做脉冲，慢线程做浮点计算
- `net` 把信号像电线一样连起来，让 X 轴吃余弦，让 Y 轴吃正弦
- `addf` 决定哪个函数在哪个线程里跑，顺序错了会让数据更新不及时
- `setp` 设置比例和使能，`start` 才真正让实时线程开始执行

这就是第三种常见姿势：不用先改真实硬件，先在 HAL 里搭一个“会动的模型”，看数据怎么从一个组件流到另一个组件。

## 踩过的坑

1. **把 LinuxCNC 当普通桌面软件**：平均速度够快不代表可用，因为 CNC 关心的是最坏延迟。

2. **跳过模拟配置直接连真机**：配置错一个方向、比例或限位，真实电机会照做，风险比网页报错高得多。

3. **只改 INI 不看 HAL**：INI 能指定加载什么，但真正的输入输出连接常在 HAL 文件里。

4. **忽略急停和断电设计**：官方 README 也强调不能只依赖软件安全，危险机器必须有能切断动力的硬件措施。

## 适用 vs 不适用场景

**适用**：

- 自制或改造铣床、车床、等离子切割、激光切割、3D 打印等运动控制设备
- 想把机床控制逻辑拆成可检查、可替换的 HAL 组件
- 需要从并口、Mesa、伺服、VFD、编码器等硬件接口中选择和组合
- 愿意花时间做延迟测试、限位、回零、急停和参数标定

**不适用**：

- 只想把模型切片成刀路，不想理解机床控制链路
- 机器没有硬件急停、限位和安全隔离，还想直接靠软件兜底
- 需要即插即用的消费级体验，不愿读配置和硬件手册
- 对实时性没有要求的普通桌面自动化，直接写脚本更轻

## 历史小故事（可跳过）

- **1990s 末期**：LinuxCNC 的前身来自 Enhanced Machine Controller，把开放源码和机床控制放到一起。
- **2000s**：项目逐步形成 HAL、实时运动控制、多个 GUI 和大量样例配置，社区开始服务不同机型。
- **2020s**：README 里仍强调它已经持续二十多年，贡献者来自很多国家。
- **2.9 以后**：文档切到公开翻译平台，说明项目不只是代码库，也在努力降低全球用户的学习门槛。

## 学到什么

1. CNC 控制的核心不是“会发命令”，而是“在可预期时间内发正确命令”。
2. HAL 的价值是把硬件连接显式化：每根“线”都能看见、调试和替换。
3. LinuxCNC 的学习顺序应该是模拟配置、延迟测试、HAL 观察、真实硬件。
4. 安全设计必须在软件之外成立，急停、限位和断电链路不是可选装饰。

## 延伸阅读

- 官方入口：[LinuxCNC GitHub README](https://github.com/LinuxCNC/linuxcnc)
- 官方文档：[Running LinuxCNC](https://www.linuxcnc.org/docs/stable/html/getting-started/running-linuxcnc.html)
- 官方教程：[HAL Tutorial](https://www.linuxcnc.org/docs/stable/html/hal/tutorial.html)
- 官方说明：[Latency Testing](https://linuxcnc.org/docs/html/install/latency-test.html)
- [[zephyr]] —— 同样关心实时性，但更偏微控制器 RTOS
- [[openthread]] —— 嵌入式系统里把复杂协议拆成可组合组件的另一个例子

## 关联

- [[zephyr]] —— 实时系统的另一条路线，面向更小的嵌入式设备
- [[smoltcp]] —— 都把底层时序和硬件约束暴露给工程配置
- [[lwip]] —— 嵌入式网络栈，和 LinuxCNC 一样重视资源和可预测行为
- [[openthread]] —— 用组件化方式处理复杂硬件环境
- [[kubernetes]] —— 都通过配置把许多组件编排起来，但一个管机器，一个管集群
- [[prometheus]] —— LinuxCNC 调 HAL pin，Prometheus 看指标，都是让系统状态可观察

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

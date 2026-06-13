---
title: "LVGL 零基础入门笔记"
来源: https://github.com/lvgl/lvgl
日期: 2026-06-13
分类: 其他
子分类: embedded-and-iot
provenance: pipeline-v3
---

# LVGL 零基础入门笔记

## 什么是 LVGL？

想象一下你要搭一个乐高模型。普通的做法是你一块一块地捏塑料件——但 LVGL 就像一盒已经造好的乐高组件：按钮、滑块、图表、标签……你只需要把它们拼在一起，就能得到一个完整的界面。

LVGL（Light and Versatile Graphics Library，轻量且通用的图形库）是一个免费开源的 C 语言图形库，专门用于在嵌入式设备上创建漂亮的用户界面。它的核心特点是：

- **无外部依赖**：不需要额外的库，复制进项目就能编译
- **极低资源占用**：最少只需 32kB RAM 和 128kB Flash
- **跨平台**：任何 MCU/MPU、任何 RTOS、任何显示屏都能运行
- **MIT 许可证**：商业项目也可以免费使用

目前最新版本是 v9.5.0，GitHub Star 超过 23,800，有 600+ 贡献者参与开发。

## 核心概念

理解 LVGL 的关键在于掌握四个概念：**显示（Display）、小部件（Widget）、布局（Layout）、样式（Style）**。

### 1. 显示（Display）

显示是 LVGL 的画布。所有界面元素都绘制在显示上。你需要告诉 LVGL：屏幕有多宽多高、用什么缓冲区来存储像素数据、以及如何把渲染结果送到物理屏幕上。

### 2. 小部件（Widget）

小部件就是界面上的"积木块"。LVGL 内置了 30+ 种常用控件：按钮、标签、滑块、图表、键盘、表格等等。每个小部件都是一个 `lv_obj_t` 类型的对象。

### 3. 布局（Layout）

布局决定了小部件如何自动排列。LVGL 提供了 Flexbox 和 Grid 两种布局方式，类似于网页开发中的 CSS Flexbox。设置好布局后，新增或删除子控件时，父容器会自动重新排列它们的位置和大小。

### 4. 样式（Style）

样式系统类似于 CSS。每个小部件都有约 100 个样式属性可以调节：颜色、圆角、阴影、透明度、字体大小等。样式可以复用，也可以针对不同状态（按下、禁用、选中）设置不同的外观。

## 从零开始：第一个 LVGL 程序

### 第一步：初始化 LVGL

在任何界面创建之前，必须先初始化 LVGL 核心、设置时间源、配置显示和输入设备。

```c
#include "lvgl/lvgl.h"

// 回调函数：返回当前毫秒数（LVGL 用它来计时动画、超时等）
static uint32_t my_tick_cb(void)
{
    return my_get_millisec();
}

// 回调函数：将渲染好的像素写入物理屏幕
static void my_flush_cb(lv_display_t * disp, const lv_area_t * area, uint8_t * px_map)
{
    // 把 px_map 中的数据写入 area 指定的屏幕区域
    // 具体实现取决于你的硬件（SPI、DMA、LCD 控制器等）

    // 告诉 LVGL：这一批像素已经发送完毕
    lv_display_flush_ready(disp);
}

void main(void)
{
    my_hardware_init();

    // ① 初始化 LVGL 核心
    lv_init();

    // ② 设置毫秒级时钟源
    lv_tick_set_cb(my_tick_cb);

    // ③ 创建一个显示对象（320x240 分辨率）
    lv_display_t * display = lv_display_create(320, 240);

    // ④ 分配渲染缓冲区（屏幕面积的 1/10，RGB565 格式）
    static uint8_t buf[320 * 240 / 10 * 2];
    lv_display_set_buffers(display, buf, NULL, sizeof(buf),
                           LV_DISPLAY_RENDER_MODE_PARTIAL);

    // ⑤ 绑定刷新回调
    lv_display_set_flush_cb(display, my_flush_cb);

    // ⑥ 主循环：持续处理 LVGL 内部事件
    while(1) {
        lv_timer_handler();
        my_sleep_ms(5);
    }
}
```

这段代码建立了一个最基本的 LVGL 运行环境。`lv_timer_handler()` 是这个循环的心脏——它负责处理动画、触摸事件、重绘请求等所有后台任务。

### 第二步：创建按钮和文字

初始化完成后，就可以开始"搭积木"了。下面创建一个居中的按钮，上面写着"Hello from LVGL!"，点击后会打印日志。

```c
// 事件回调：按钮被点击时触发
static void button_clicked_cb(lv_event_t * e)
{
    printf("Button clicked!\n");
}

// 创建按钮（父对象是活动屏幕）
lv_obj_t * button = lv_button_create(lv_screen_active());

// 把按钮放到屏幕正中间
lv_obj_center(button);

// 注册点击事件回调
lv_obj_add_event_cb(button, button_clicked_cb, LV_EVENT_CLICKED, NULL);

// 在按钮内部创建一个标签
lv_obj_t * label = lv_label_create(button);
lv_label_set_text(label, "Hello from LVGL!");

// 把标签也居中放在按钮里
lv_obj_center(label);
```

这里有两点值得注意：

1. **父子关系**：`lv_label_create(button)` 让标签成为按钮的子对象。子对象的坐标系相对于父对象，所以标签会自动跟随按钮移动。
2. **链式调用**：LVGL 大量使用 `lv_xxx_create(parent)` 的模式，第一个参数永远是父对象。`lv_screen_active()` 表示当前活动屏幕。

### 第三步：用 Flex 布局排列复选框

当界面上有多个同类控件时，手动计算每个控件的位置非常繁琐。LVGL 的 Flex 布局可以自动排列它们。

```c
// 创建一个新的屏幕并加载
lv_obj_t * scr = lv_obj_create(NULL);
lv_screen_load(scr);

// 设置列方向 Flex 布局（子控件垂直排列）
lv_obj_set_flex_flow(scr, LV_FLEX_FLOW_COLUMN);

// 设置子控件之间的间距和对齐方式
lv_obj_set_flex_align(scr,
    LV_FLEX_ALIGN_SPACE_EVENLY,  // 垂直方向：均匀分布
    LV_FLEX_ALIGN_START,         // 水平方向：左对齐
    LV_FLEX_ALIGN_CENTER);       // 轨道内：居中

// 创建 5 个复选框，自动排列
const char * texts[5] = {"Input 1", "Input 2", "Input 3", "Output 1", "Output 2"};
for(int i = 0; i < 5; i++) {
    lv_obj_t * cb = lv_checkbox_create(scr);
    lv_checkbox_set_text(cb, texts[i]);
}

// 设置第 2 个为选中状态，第 4 个为禁用状态
lv_obj_add_state(lv_obj_get_child(scr, 1), LV_STATE_CHECKED);
lv_obj_add_state(lv_obj_get_child(scr, 3), LV_STATE_DISABLED);
```

Flex 布局的核心思想是：你只需要定义排列方向（行或列）和间距规则，剩下的位置计算全部交给 LVGL。这和网页开发中的 CSS Flexbox 几乎一模一样。

## 样式系统

LVGL 的样式系统非常灵活。每个小部件可以被拆分为多个部分（如滑块的背景、指示器、旋钮），每个部分可以独立设置样式。

```c
// 创建一个可复用的样式对象
lv_style_t style_base;
lv_style_init(&style_base);

// 设置背景颜色为橙色，完全不透明，圆角半径 4
lv_style_set_bg_color(&style_base, lv_color_hex(0xff8800));
lv_style_set_bg_opa(&style_base, 255);
lv_style_set_radius(&style_base, 4);

// 创建滑块
lv_obj_t * slider = lv_slider_create(lv_screen_active());
lv_obj_center(slider);
lv_obj_set_size(slider, lv_pct(80), 16);

// 把样式应用到不同部分
lv_obj_add_style(slider, &style_base, LV_PART_INDICATOR);  // 进度条
lv_obj_add_style(slider, &style_base, LV_PART_KNOB);       // 旋钮
lv_obj_add_style(slider, &style_base, 0);                  // 背景

// 单独调整旋钮的边框
lv_obj_set_style_border_width(slider, 3, LV_PART_KNOB);
lv_obj_set_style_border_color(slider, lv_color_hex3(0xfff), LV_PART_KNOB);
```

样式对象通过 `lv_style_init()` 初始化后可以被多个小部件复用，这类似于 CSS 中的 class。

## 数据绑定

LVGL 提供了类似 MVVM 框架的数据绑定机制。你可以把一个变量绑定到控件的属性上，变量变化时控件自动更新，控件变化时变量也自动更新。

```c
// 创建一个整数型数据源，初始值 35
static lv_subject_t subject_value;
lv_subject_init_int(&subject_value, 35);

// 注册观察者：值变化时自动回调
lv_subject_add_observer(&subject_value, my_observer_cb, NULL);

// 滑块的值绑定到 subject_value
lv_slider_bind_value(slider, &subject_value);

// 标签的文本也绑定到同一个变量，带格式化
lv_obj_t * label = lv_label_create(lv_screen_active());
lv_label_bind_text(label, &subject_value, "Temperature: %d °C");
```

现在拖动滑块，标签上的温度数值会自动更新；反之修改 `subject_value` 的值，滑块和标签也会同步变化。

## 学习路线建议

1. **先在 PC 模拟器上手玩**：LVGL 提供了官方模拟器，不需要嵌入式硬件就能体验全部功能
2. **逐个尝试小部件**：从按钮、标签这种简单控件开始，逐步尝试滑块、图表、列表等复杂控件
3. **理解布局系统**：Flex 和 Grid 布局是构建响应式界面的关键
4. **动手做项目**：找一个带显示屏的开发板（如 ESP32 + TFT），把模拟器里的 UI 移植上去

LVGL 的文档站点（docs.lvgl.io）有 100+ 个可直接运行的示例，是最好的学习入口。

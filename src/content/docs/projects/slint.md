---
title: Slint — 声明式跨平台 UI 工具包
来源: https://github.com/slint-ui/slint
日期: 2026-06-13
分类_原始: 前端框架
分类: 后端 API
子分类: rust-tools
provenance: pipeline-v3
---

# Slint — 声明式跨平台 UI 工具包

## 一、日常类比：用"乐高说明书"搭界面

想象一下你要用乐高搭一座小房子。

传统编程写界面，就像一块一块地拼——先创建按钮对象，再设置它的文字颜色，再把它放到窗口里，再给它加一个点击事件监听器。每一步都要写代码去"告诉"系统怎么做。

Slint 的做法更像看一份乐高说明书：你直接描述"这里放一个红色按钮，上面写着'点击我'"。系统会自动理解并把它变成真正的界面元素。这就是**声明式**——你说"要什么"，而不是"怎么做"。

Slint 的名字来源于它的设计目标缩写：

- **S**calable（可扩展）— 从小型嵌入式设备到手机桌面都能跑
- **L**ightweight（轻量）— 内存占用极小，在资源匮乏的设备上也能流畅运行
- **I**ntuitive（直观）— 设计师和开发者都能看懂和上手
- **N**ative（原生）— 编译成机器码，不是 WebView 包装，性能等同原生应用
- **T**ooling（工具链完善）— VS Code 插件、实时预览、Figma 导入

## 二、核心概念

### 2.1 组件（Component）

组件是 Slint 的基本构建单元，类似于乐高积木的一块。每个组件定义了一部分界面，可以包含其他组件作为子元素。最顶层的组件通常继承自 `Window`，代表一个完整的窗口。

### 2.2 属性（Properties）

每个界面元素都有属性，比如颜色、大小、文字内容。属性之间可以建立**绑定关系**——当一个属性的值变化时，依赖它的其他属性会自动更新。这就像一根橡皮筋：你拉一端，另一端跟着动。

属性有三种可见性：

- `in` — 外部可以设置，组件内部提供默认值但不能覆盖
- `out` — 组件内部设置，外部只能读取
- `in-out` — 内外都可以读写

### 2.3 响应式（Reactivity）

这是 Slint 最核心的魔法。在 Slint 中，**每一个表达式都是自动响应的**。如果你把文本内容绑定到一个计数器变量上，计数器一变，界面上的文字立刻跟着变。不需要手动调用"刷新"或"重新渲染"。

这和 React 的响应式不同：React 需要你显式调用 setState 来触发更新，而 Slint 从语言层面就内置了响应式，零配置。

### 2.4 回调（Callbacks）

回调是组件对外发出的"信号"。比如一个按钮被点击了，它就触发 `clicked` 回调。你可以用 `=>` 语法来响应这些信号。

### 2.5 布局（Layouts）

Slint 提供了三种自动布局方式：

- `VerticalLayout` — 垂直排列子元素
- `HorizontalLayout` — 水平排列子元素
- `GridLayout` — 网格排列

你也可以手动指定每个元素的 x、y 坐标来做精确控制。

## 三、代码示例

### 示例 1：计数器应用（Hello World 升级版）

这个例子展示了属性绑定、回调响应和条件表达式的组合使用：

```slint
export component CounterApp inherits Window {
    width: 300px;
    height: 200px;

    // 声明一个整数类型的属性，初始值为 0
    property<int> count: 0;

    // 计算属性：根据计数值动态改变显示文字
    // 这是一个响应式绑定，count 变化时自动重新计算
    property<string> status-text: count == 0 ? "还没有点过"
                                     : count < 5  ? "继续加油！"
                                                   : "已经很多啦！";

    VerticalLayout {
        padding: 20px;
        spacing: 15px;

        Text {
            text: "计数器";
            font-size: 24px;
            horizontal-alignment: center;
        }

        Text {
            text: root.status-text;
            font-size: 16px;
            color: count >= 5 ? red : blue;
        }

        Text {
            text: "当前值：" + count;
            font-size: 32px;
            horizontal-alignment: center;
        }

        // 两个按钮，分别增加和减少计数
        HorizontalLayout {
            spacing: 20px;
            alignment: center;

            Button {
                text: "减一";
                clicked => { root.count -= 1; }
            }

            Button {
                text: "加一";
                clicked => { root.count += 1; }
            }
        }
    }
}
```

这段代码做了什么：

1. 定义了一个 `count` 属性，初始值为 0
2. 定义了 `status-text`，它是一个计算属性——当 `count` 变化时，文字自动从"还没有点过"变为"继续加油！"再变为"已经很多啦！"
3. 颜色也会随 `count` 变化：小于 5 时蓝色，大于等于 5 时红色
4. 两个按钮通过 `clicked =>` 语法响应点击事件，直接修改 `count` 的值
5. 整个过程中没有任何"刷新界面"的代码，响应式引擎自动处理一切

### 示例 2：待办事项列表（数据驱动 UI）

这个例子展示了数据模型和循环渲染：

```slint
import { StandardButton, LineEdit } from "std-widgets.slint";

export component TodoApp inherits Window {
    width: 400px;
    height: 500px;

    // 声明一个字符串数组类型的外部属性
    // 这个属性由后端代码（Rust/C++/JS）提供数据
    in-out property <array<string>> todos;

    // 当前正在输入的新待办项
    property<string> new-todo-text: "";

    // 过滤状态：all / active / completed
    in property <string> filter: "all";

    VerticalLayout {
        padding: 15px;
        spacing: 10px;

        Text {
            text: "待办事项";
            font-size: 20px;
            color: #333;
        }

        // 输入框 + 添加按钮
        HorizontalLayout {
            spacing: 10px;
            LineEdit {
                placeholder-text: "输入新的待办事项...";
                text: root.new-todo-text;
                on-enter-pressed => {
                    if self.text != "" {
                        root.todos.append(self.text);
                        self.text = "";
                    }
                }
            }
            StandardButton {
                text: "添加";
                clicked => {
                    if root.new-todo-text != "" {
                        root.todos.append(root.new-todo-text);
                        root.new-todo-text = "";
                    }
                }
            }
        }

        // 分隔线
        Rectangle {
            height: 1px;
            background: #ddd;
        }

        // 循环渲染待办项列表
        VerticalLayout {
            spacing: 5px;
            for t in root.todos : Row {
                spacing: 10px;

                Rectangle {
                    width: 15px;
                    height: 15px;
                    border-radius: 50%;
                    background: touch.is-active ? #ccc : #eee;
                    TouchArea {
                        clicked => { /* 标记完成逻辑 */ }
                    }
                }

                Text {
                    text: t;
                    font-size: 14px;
                }
            }
        }

        // 底部统计信息
        Text {
            text: "共 " + todos.length + " 项";
            font-size: 12px;
            color: #999;
            horizontal-alignment: right;
        }
    }
}
```

这段代码展示了：

1. `in-out property <array<string>> todos` — 声明一个可由外部（Rust/C++/JS 后端）读写的数据数组
2. `for t in root.todos :` — 循环语法，遍历数组中的每一项并渲染对应的 UI 元素
3. `LineEdit` 的 `on-enter-pressed` 事件 — 按回车键时触发添加操作
4. `touch.is-active` — 内置的触摸状态属性，用来做视觉反馈
5. `todos.length` — 属性可以像普通变量一样参与表达式计算

### 示例 3：自定义可复用组件

Slint 的强大之处在于组件可以像乐高一样无限组合：

```slint
// 定义一个可复用的卡片组件
export component Card inherits Rectangle {
    // 外部可设置的属性
    in property <string> title;
    in property <string> content;
    in property <color> accent-color: blue;

    // 卡片尺寸
    preferred-width: 200px;
    preferred-height: 120px;
    background: white;
    border-radius: 10px;
    border-width: 1px;
    border-color: #eee;

    VerticalLayout {
        padding: 15px;
        spacing: 8px;

        Rectangle {
            height: 3px;
            width: parent.width;
            background: root.accent-color;
        }

        Text {
            text: root.title;
            font-size: 16px;
            font-weight: bold;
        }

        Text {
            text: root.content;
            font-size: 13px;
            color: #666;
        }
    }
}

// 使用卡片组件
export component Dashboard inherits Window {
    width: 500px;
    height: 400px;
    background: #f5f5f5;

    GridLayout {
        spacing: 15px;
        padding: 20px;

        Card {
            title: "用户数";
            content: "本月新增 1,234 位用户";
            accent-color: blue;
        }

        Card {
            title: "收入";
            content: "本月营收 ¥56,789";
            accent-color: green;
        }

        Card {
            title: "订单";
            content: "待处理 42 笔订单";
            accent-color: orange;
        }
    }
}
```

这里的关键点是：

1. `Card` 是一个完全独立的组件，定义了标题、内容和强调色三个外部接口
2. 它内部用 `Rectangle`、`Text`、`VerticalLayout` 组合出卡片的外观
3. `Dashboard` 直接使用了三次 `Card`，每次传入不同的数据
4. 这就是声明式 UI 的威力——**一次定义，多次复用**

## 四、Slint 的工作流程

```
.slint 文件（UI 描述）
    │
    ▼
┌─────────────┐
│  Slint 编译器 │  →  生成 Rust / C++ / JavaScript / Python 代码
└─────────────┘
    │
    ▼
┌─────────────┐
│  运行时引擎   │  →  属性绑定解析、事件分发、渲染调度
└─────────────┘
    │
    ▼
┌─────────────┐
│  渲染后端     │  →  OpenGL (FemtoVG) / Skia / 软件渲染
└─────────────┘
```

整个流程可以概括为三步：

1. **写** — 用 `.slint` 文件描述界面（纯声明式，不涉及业务逻辑）
2. **编** — Slint 编译器将 `.slint` 编译为目标语言的代码（Rust/C++/JS/Python）
3. **跑** — 运行时引擎处理属性绑定、事件和用户交互，渲染后端负责绘制

业务逻辑（数据库操作、网络请求等）写在对应的后端语言文件中，通过属性绑定和回调与 UI 通信。这种分离让设计师可以专注于界面，开发者可以专注于逻辑。

## 五、Slint vs 其他方案对比

| 特性 | Slint | React Native | Flutter | SwiftUI |
|------|-------|-------------|---------|---------|
| 运行时体积 | 极小（几百 KB） | 大（需运行时） | 中等（~10MB） | 中等 |
| 支持平台 | 桌面+移动端+嵌入式+Web | 移动为主 | 全平台 | 苹果生态 |
| 嵌入式支持 | 是（树莓派、STM32） | 否 | 否 | 否 |
| 编译产物 | 原生机器码 | JS 桥接 | Dart 编译 | 原生编译 |
| 学习曲线 | 低（声明式语言） | 中（需懂 React） | 中（需学 Dart） | 低（需懂 Swift） |
| 许可证 | 开源免费 / 商业许可 | MIT | BSD | BSD |

Slint 的独特优势在于**嵌入式场景**——它是少数能在资源极度受限的微控制器（如 STM32、RP2040）上运行的高性能 GUI 工具包。这也是它与 React Native、Flutter 等方案最大的区别。

## 六、为什么值得了解

对于零基础学习者来说，Slint 有几个特别友好的地方：

1. **语法接近自然语言** — `Text { text: "你好" }` 这种写法，即使没学过编程也能猜出意思
2. **没有"刷新"的概念** — 不需要理解"虚拟 DOM diff"或"setState"这些抽象概念，属性变了界面就变
3. **一门语言搞定所有平台** — 不用分别学 Android XML、iOS Storyboard、Web HTML
4. **与主流语言无缝对接** — 你的 UI 可以用 Rust、C++、JavaScript 或 Python 驱动，选你最熟悉的就行

Slint 由德国 SixtyFPS GmbH 公司开发，目前 GitHub 上有超过 22,000 个 Star，社区活跃，文档完善。最新版本为 1.16.x，API 稳定在 1.x 分支。

## 七、进一步学习

- 官方文档：https://slint.dev/docs
- 在线编辑器（无需安装）：https://slintpad.com
- VS Code 扩展：官方提供，支持自动补全和实时预览
- Figma 插件：可以直接把 Figma 设计稿导出为 Slint 代码
- 示例仓库：https://github.com/slint-ui/slint/tree/master/examples
- 社区讨论：https://github.com/slint-ui/slint/discussions

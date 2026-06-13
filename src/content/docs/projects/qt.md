---
title: Qt — C++ 跨平台应用框架
来源: https://github.com/qt/qtbase
日期: 2026-06-13
分类: 其他
子分类: mobile-cross-platform
provenance: pipeline-v3
---

# Qt — C++ 跨平台应用框架

## 一、日常类比：一把瑞士军刀式的开发工具包

想象你要做一个应用——比如说一个待办事项软件。

如果用传统方式，你需要：
- 在 Windows 上调用 Win32 API 画按钮、画窗口
- 在 macOS 上调用 Cocoa / AppKit
- 在 Linux 上调用 GTK 或 Qt Widgets

每个平台一套规则，等于同一个功能要写三遍。

Qt 的做法是：**你只写一次代码，它帮你在这三个平台上各穿一双「本地鞋」跑起来。**

具体来说，Qt 内部有一层「翻译官」：你调用 `QPushButton`，Qt 在 Windows 上翻译成 Win32 的按钮控件，在 macOS 上翻译成 AppKit 的按钮，在 Linux 上翻译成对应的原生控件。你不用管细节。

## 二、核心概念

### 2.1 模块体系（Modules）

Qt 不是一个单一库，而是一个「模块家族」。常用模块：

| 模块 | 作用 | 类比 |
|------|------|------|
| `QtCore` | 核心：字符串、容器、事件循环、线程 | 地基和工具库 |
| `QtGui` | GUI 基础：绘图、字体、图像 | 画笔和颜料 |
| `QtWidgets` | 传统控件：按钮、窗口、菜单 | 现成的 UI 组件 |
| `QtNetwork` | 网络编程：HTTP、TCP、UDP | 邮递员 |
| `QtSql` | 数据库：SQLite、MySQL 等 | 账本管理员 |
| `QtQuick` | 声明式 UI（QML） | 动画导演 |

学习路径建议：`QtCore` → `QtGui` → `QtWidgets`，这是 Qt  Widgets 路线的三条基石。

### 2.2 信号与槽（Signals & Slots）

这是 Qt 最核心的事件通信机制。

**日常类比：**

就像公司的「通知-响应」制度。经理（信号发出者）发布一个通知，员工（槽函数接收者）听到后执行对应动作。

```
信号（Signal）：经理说"客户下单了"
槽（Slot）：  客服听到后"处理订单"
```

Qt 的特色是：信号和槽之间不需要手动注册。你只需要用 `connect()` 把两者连起来，Qt 的元对象系统（Meta-Object System）会自动处理调用。关键优势：

- 类型安全：编译期检查信号和槽的签名是否匹配
- 解耦：发送者和接收者互不知道对方的存在
- 线程安全：跨线程自动排队

### 2.3 对象树（Object Tree）

Qt 有一套**自动内存管理机制**。每个 `QObject` 子类对象都有一个父对象（parent）。当父对象被销毁时，它会自动删除所有子对象。

**日常类比：**就像家庭的财产继承——家长不在了，家里的东西自动按遗嘱分配，不需要你逐个处理。

```cpp
QWidget *parent = new QWidget();
QPushButton *btn = new QPushButton("Hello", parent); // btn 的父对象是 parent
// 当 parent 被 delete 时，btn 也会被自动 delete，不需要手动 delete btn
```

### 2.4 元对象系统（Meta-Object System）

Qt 在标准 C++ 之上加了一层「增强层」，通过 `moc`（Meta-Object Compiler）预处理。它提供了：

- 运行时类型信息（`QObject::metaObject()`）
- 信号与槽机制
- 属性系统（`Q_PROPERTY`）
- 动态属性（`setProperty()` / `property()`）

## 三、代码示例

### 示例一：最小 Qt Widgets 程序

这是最基础的 Qt 桌面应用：一个窗口，一个按钮，点击按钮关闭窗口。

```cpp
#include <QApplication>       // 应用主循环
#include <QPushButton>        // 按钮控件
#include <QWidget>            // 基础窗口类

int main(int argc, char *argv[])
{
    // 1. 创建应用程序对象
    // argc 和 argv 是命令行参数，Qt 需要它们来解析自己的参数
    QApplication app(argc, argv);

    // 2. 创建一个窗口（QWidget 是所有用户界面对象的基类）
    QWidget window;
    window.resize(400, 300);        // 设置窗口大小：宽 400px，高 300px
    window.setWindowTitle("我的第一个 Qt 程序");

    // 3. 创建一个按钮，放到窗口里
    // 第二个参数是父对象，按钮会被显示在窗口内部
    QPushButton quitButton("退出", &window);

    // 4. 设置按钮位置
    quitButton.move(150, 120);      // 离左上角 150px, 120px

    // 5. 连接信号和槽
    // 当按钮被点击时（clicked 信号），调用 app 的 quit 槽（退出应用）
    QObject::connect(&quitButton, &QPushButton::clicked, &app, &QApplication::quit);

    // 6. 显示窗口（默认不显示，必须调用 show()）
    window.show();

    // 7. 进入事件循环
    // app.exec() 是程序的"心脏"——它不断读取用户操作（鼠标、键盘），
    // 然后把对应的事件分发给组件。没有它，窗口闪一下就关了。
    return app.exec();
}
```

**程序结构分解：**

```
QApplication         ← 管理整个应用的"生命周期"
    └── QWidget      ← 窗口容器（根组件）
        └── QPushButton ← 子控件（退出按钮）
```

**构建方式（qmake）：**

```pro
# 文件名：myapp.pro
QT       += widgets          # 声明使用 Widgets 模块
TARGET = myapp               # 输出文件名
SOURCES = main.cpp           # 源代码文件
```

**构建方式（CMake，Qt 6 推荐）：**

```cmake
# 文件名：CMakeLists.txt
cmake_minimum_required(VERSION 3.16)
project(myapp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 REQUIRED COMPONENTS Widgets)

qt_add_executable(myapp main.cpp)
target_link_libraries(myapp PRIVATE Qt6::Widgets)
```

### 示例二：带有计数功能的交互程序

这个例子展示：自定义信号与槽、状态管理、控件布局。

```cpp
#include <QApplication>
#include <QWidget>
#include <QPushButton>
#include <QLabel>
#include <QVBoxLayout>   // 垂直布局管理器

// 自定义计数器类
// 继承 QWidget，获得窗口能力 + 信号槽机制
class CounterWidget : public QWidget
{
    Q_OBJECT               // 宏：启用信号、槽、属性系统
                          // 这是所有 Qt 信号槽类的标配

public:
    CounterWidget(QWidget *parent = nullptr) : QWidget(parent)
    {
        // --- 创建界面元素 ---
        // QLabel：显示文字的标签控件
        countLabel = new QLabel("计数：0", this);

        // 两个按钮
        addButton = new QPushButton("+ 加 1", this);
        resetButton = new QPushButton("重置", this);

        // --- 布局：把控件组织在一起 ---
        // QVBoxLayout：垂直排列子控件
        auto *layout = new QVBoxLayout(this);
        layout->addWidget(countLabel);      // 标签放上面
        layout->addStretch();               // 弹性空间，把按钮推到下面
        layout->addWidget(addButton);       // 加号按钮
        layout->addWidget(resetButton);     // 重置按钮

        // 设置标题和大小
        setWindowTitle("计数器");
        resize(250, 150);

        // --- 连接信号和槽 ---
        // 点击"加 1"按钮 → 调用 increment() 函数
        connect(addButton, &QPushButton::clicked,
                this, &CounterWidget::increment);

        // 点击"重置"按钮 → 调用 reset() 函数
        connect(resetButton, &QPushButton::clicked,
                this, &CounterWidget::reset);
    }

    // 槽函数：计数器 +1
    // slots 不是关键字，是 moc 识别的标记（Qt 6 中可以省略）
    void increment()
    {
        currentCount++;                     // 状态 +1
        countLabel->setText("计数：" + QString::number(currentCount));
    }

    // 槽函数：计数器归零
    void reset()
    {
        currentCount = 0;
        countLabel->setText("计数：0");
    }

private:
    QLabel *countLabel;        // 显示标签
    QPushButton *addButton;    // 加号按钮
    QPushButton *resetButton;  // 重置按钮
    int currentCount = 0;      // 计数状态（普通成员变量）
};

#include "main.moc"           // moc 需要看到信号/槽声明

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);

    CounterWidget widget;
    widget.show();

    return app.exec();
}
```

**这个程序做了什么：**

```
用户点击 "+ 加 1"
    ↓
QPushButton::clicked 信号被发射
    ↓
Qt 框架调用 CounterWidget::increment() 槽函数
    ↓
currentCount 加 1
    ↓
countLabel 的显示文字更新为 "计数：N"
```

## 四、Qt 5 vs Qt 6 关键区别

| 特性 | Qt 5 | Qt 6 |
|------|------|------|
| 构建系统 | qmake 为主 | CMake 为主（qmake 已标记为废弃） |
| 渲染引擎 | OpenGL / Direct3D 11 | OpenGL / Vulkan / Direct3D 12 |
| C++ 标准 | C++11 | C++17 |
| QML | QtQuick 2.x | QtQuick 3.x（支持 3D） |
| 模块拆分 | 部分模块独立发布 | 更多模块被拆分 |

**对初学者的建议：** 直接用 Qt 6 + CMake，这是未来的方向。

## 五、学习路线建议

1. **第一周：环境搭建 + Hello World**
   - 安装 Qt Creator（官方 IDE，自带编译器和调试器）
   - 跑通示例一，理解 `QApplication` → `QWidget` → `show()` → `exec()` 的完整流程

2. **第二周：控件与布局**
   - 学习常用控件：`QPushButton`、`QLabel`、`QLineEdit`、`QCheckBox`、`QComboBox`
   - 学习布局管理器：`QVBoxLayout`、`QHBoxLayout`、`QGridLayout`

3. **第三周：信号与槽深入**
   - 自定义类和信号
   - Lambda 表达式作为槽（Qt 5.0 起支持，写法更简洁）
   - 跨线程信号槽

4. **第四周：实战小项目**
   - 做一个计算器、记事本、或者待办事项列表
   - 尝试加入文件读写（`QFile`、`QTextStream`）

## 六、常见问题

**Q：Qt 是 C++ 专属吗？**
A：不是。Qt 也有 Python 绑定（PySide6 / PyQt6），但 C++ 是「一等公民」，所有新特性最先在 C++ 上实现。

**Q：和 Electron 有什么区别？**
A：Electron = 浏览器内核 + Node.js，打包体积大（通常 100MB+）。Qt 是原生编译，打包体积小（通常几 MB），运行时性能好。

**Q：Qt 是开源的吗？**
A：是，采用双许可：LGPL（开源）和商业许可。LGPL 允许你在闭源软件中使用 Qt，但需要满足一定条件（动态链接等）。

**Q：moc 是什么？**
A：Meta-Object Compiler 的缩写。Qt 在标准 `g++` / `clang++` 之前跑一层预处理，把 `signals:`、`slots:`、`Q_OBJECT` 这些非标准关键字翻译成普通 C++ 代码。你不需要手动运行它——Qt 的构建系统（qmake 或 CMake）会自动调用。

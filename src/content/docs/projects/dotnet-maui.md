---
title: ".NET MAUI — 微软跨平台应用框架"
来源: https://github.com/dotnet/maui
日期: 2026-06-13
分类: 其他
子分类: mobile-cross-platform
provenance: pipeline-v3
---

# .NET MAUI — 微软跨平台应用框架

## 什么是 .NET MAUI？

先说一个类比。想象你要开一家连锁店，在东京、纽约、伦敦各开一家店。传统方式下，每家店需要完全独立的装修、员工培训、运营系统——因为每个地方的规矩和习惯都不一样。而 .NET MAUI 就像是一套"智能连锁方案"：核心厨房、收银系统、员工手册全部共用一份，但在每家店落地时，它会自动把装修改成当地风格——东京用日式设计，纽约用现代简约，伦敦用英伦复古。

这就是 .NET MAUI 做的事情。它的全称是 **.NET Multi-platform App UI**（.NET 跨平台应用界面），是微软推出的一个框架，让你用 **C# 语言** 和 **XAML 标记语言** 写一套代码，就能同时生成跑在以下四个平台上的原生应用：

- Android（手机/平板）
- iOS / iPadOS（iPhone/iPad）
- Windows（桌面）
- macOS（桌面）

它是 Xamarin.Forms 的升级版。Xamarin 是微软之前推出的跨平台方案，只能做 Android 和 iOS 移动应用。.NET MAUI 把它扩展到了桌面平台，并且做了全面重构。

> GitHub 仓库：https://github.com/dotnet/maui，目前 23,000+ star，最新稳定版为 10.0（基于 .NET 10）。

## 核心概念

### 1. 单一代码库（Single Codebase）

传统开发中，iOS 用 Swift、Android 用 Kotlin、Windows 用 C++/C#，每个平台一套代码。使用 .NET MAUI 后，你只需要写一次 C# 和 XAML，就能在所有平台上运行。

这并不意味着每个平台的体验都一样粗糙。MAUI 会在运行时调用各个平台的 **原生控件**——在 iOS 上它调用 UIKit 按钮，在 Android 上它调用 Material Design 按钮。所以用户看到的、感受到的，和用原生方式开发的效果几乎一样。

### 2. XAML + C# 双文件模式

XAML 是一种基于 XML 的标记语言，类似 HTML，但用来描述应用的界面。C# 负责处理逻辑（点击按钮后做什么）。

类比：XAML 是房子的 **装修图纸**，C# 是 **水电工程师**。图纸画好房间布局，工程师负责让灯能亮、开关能控。

### 3. 平台服务（Handlers）

虽然代码是共享的，但有些功能是平台特有的。比如"读取手机摄像头"——Windows 和 Android 调用的系统 API 完全不同。MAUI 用 **Handler（处理器）** 机制来解决：你写一段通用代码，MAUI 在不同平台上自动切换调用对应的原生 API。

## 项目结构

创建一个 MAUI 项目后，你会看到这样的文件结构：

- `MauiProgram.cs` — 应用的入口和初始化配置
- `MainPage.xaml` + `MainPage.xaml.cs` — 主界面（XAML 是界面，C# 是逻辑）
- `App.xaml` + `App.xaml.cs` — 应用级别配置
- `Platforms/` — 各平台专属代码（如 AndroidManifest.xml、Info.plist）
- `Resources/` — 图片、字体、样式等静态资源

## 代码示例

### 示例 1：一个计数器应用

这是 MAUI 中最经典的入门示例——点击按钮计数。它展示了 XAML 界面声明和 C# 事件处理的配合。

**MainPage.xaml（界面部分）**

```xml
<?xml version="1.0" encoding="utf-8" ?>
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui"
             xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml"
             x:Class="MyApp.MainPage">

    <ScrollView>
        <VerticalStackLayout Spacing="25" Padding="30" VerticalOptions="Center">

            <!-- 标题文字 -->
            <Label Text="欢迎使用 .NET MAUI!"
                   FontSize="32"
                   HorizontalOptions="Center" />

            <!-- 显示计数 -->
            <Label x:Name="CounterLabel"
                   Text="你点了 0 次"
                   FontSize="18"
                   HorizontalOptions="Center" />

            <!-- 点击按钮 -->
            <Button x:Name="CounterButton"
                    Text="点我！"
                    Clicked="OnCounterClicked"
                    HorizontalOptions="Center" />

        </VerticalStackLayout>
    </ScrollView>

</ContentPage>
```

**MainPage.xaml.cs（逻辑部分）**

```csharp
namespace MyApp;

public partial class MainPage : ContentPage
{
    int count = 0;

    public MainPage()
    {
        InitializeComponent();
    }

    private void OnCounterClicked(object sender, EventArgs e)
    {
        count++;

        if (count == 1)
            CounterLabel.Text = $"你点了 {count} 次";
        else
            CounterLabel.Text = $"你点了 {count} 次";

        CounterButton.IsEnabled = false;
    }
}
```

这个例子中，XAML 定义了三个控件：一个 `Label`（文字标签）、另一个带 `x:Name` 的 `Label`（方便 C# 中引用）、一个 `Button`（按钮）。按钮的 `Clicked` 属性绑定到了 C# 中的 `OnCounterClicked` 方法。

### 示例 2：读取设备传感器（平台服务）

MAUI 内置了 **Essentials** 库，可以直接访问设备功能，无需写平台专属代码。

```csharp
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Controls;

namespace MyApp;

public partial class SensorPage : ContentPage
{
    public SensorPage()
    {
        InitializeComponent();

        // 获取设备信息
        var info = DeviceInfo.Platform;
        var version = DeviceInfo.VersionString;
        var model = DeviceInfo.Model;

        Label infoLabel = new()
        {
            Text = $"平台: {info}, 型号: {model}, 系统版本: {version}",
            FontSize = 16,
            HorizontalOptions = LayoutOptions.Center
        };

        // 获取电池状态
        var battery = Battery.Default;
        Label batteryLabel = new()
        {
            Text = $"电量: {battery.ChargeLevel * 100}%（状态: {battery.State}）",
            FontSize = 16,
            HorizontalOptions = LayoutOptions.Center
        };

        // 监听电量变化
        battery.ChargeLevelChanged += (s, e) =>
        {
            batteryLabel.Text = $"电量: {s.ChargeLevel * 100}%（实时）";
        };

        Content = new VerticalStackLayout
        {
            Children = { infoLabel, batteryLabel },
            Spacing = 20,
            Padding = 30
        };
    }
}
```

这段代码不需要区分 Android 还是 iOS。`DeviceInfo` 和 `Battery` 类在 MAUI 内部已经做了平台适配。同样的代码在手机上运行时会自动调用对应的原生 API 获取信息。

### 示例 3：绑定数据与页面导航

```csharp
// 数据模型
public class Contact
{
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
}

// 页面 A：显示联系人列表
public partial class ContactsPage : ContentPage
{
    public ObservableCollection<Contact> Contacts { get; }

    public ContactsPage()
    {
        Contacts = new ObservableCollection<Contact>
        {
            new() { Name = "张三", Phone = "138-0000-1111" },
            new() { Name = "李四", Phone = "139-0000-2222" }
        };

        var listView = new ListView
        {
            ItemsSource = Contacts,
            ItemTemplate = new DataTemplate(() =>
            {
                var cell = new TextCell();
                cell.TextProperty.Bind(Contact => cell.Text)
                    .To(c => c.Name);
                cell.DetailProperty.Bind(Contact => c.Detail)
                    .To(c => c.Phone);
                return cell;
            })
        };

        Content = new StackLayout { Children = { listView } };
    }
}
```

## 开发工具

| 工具 | 平台 | 说明 |
|------|------|------|
| **Visual Studio 2022** | Windows/macOS | 微软官方 IDE，完整 MAUI 支持 |
| **Visual Studio Code** | Windows/macOS/Linux | 轻量级编辑器 + C# Dev Kit 扩展 |
| **Android Emulator** | Windows/macOS | 内置安卓模拟器 |
| **iOS Simulator** | macOS（或 Mac Build Host） | iOS 模拟器 |
| **Windows Machine** | Windows | 直接在本机 Windows 运行 |

创建新项目只需一条命令：

```bash
dotnet new maui -n MyApp
dotnet new maui -n MyApp -sc   # 包含社区工具和 Syncfusion 控件的模板
dotnet run -f net10.0-android   # 指定平台运行
```

## MAUI  vs  其他跨平台方案

| 方案 | 语言 | 界面类型 | 平台覆盖 |
|------|------|---------|---------|
| **.NET MAUI** | C# / XAML | 原生控件 | Android, iOS, Windows, macOS |
| **React Native** | JavaScript/TS | 原生控件 | Android, iOS |
| **Flutter** | Dart | 自绘引擎 | Android, iOS, Windows, macOS, Linux, Web |
| **Xamarin.Forms** | C# / XAML | 原生控件 | Android, iOS（已停止新功能） |

MAUI 的优势在于：微软生态整合紧密（与 Azure、Blazor、.NET 后端无缝对接），C# 类型安全，且直接调用原生控件而非自绘。

## 学习路径建议

1. 先了解 C# 基础语法（变量、类、方法、事件）
2. 理解 XAML 的基本结构（标签、属性、绑定）
3. 用 Visual Studio 创建一个 MAUI 项目并跑起来
4. 尝试修改 MainPage，添加更多控件
5. 学习页面导航和数据绑定
6. 进阶：平台专属功能（摄像头、GPS、推送通知）

## 总结

.NET MAUI 让一个开发者用一套代码就能覆盖四个主流平台。它的核心思路是 **"写一次，到处跑"**，同时通过 Handler 和 Essentials 保证每个平台的原生体验。对于已有 C#/.NET 背景的开发者来说，学习曲线比较平缓；对于零基础学习者，建议从 MAUI 自带的模板项目开始，边改边学。

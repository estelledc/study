---
title: Valdi — Snapchat 跨平台原生 UI 框架
来源: https://github.com/Snapchat/Valdi
日期: 2026-06-13
分类: 其他
子分类: mobile-cross-platform
provenance: pipeline-v3
---

# Valdi — 写一次 TypeScript，跑在 iOS、Android、macOS

## 一句话理解 Valdi

想象一下：你想做一栋房子。传统做法是分别请泥瓦匠（iOS）、木工（Android）各盖一层，材料不同、工法不同。Valdi 的做法是——你画一张图纸（TypeScript），然后有一个"翻译工厂"自动把这张图纸变成两份施工说明书，一份给泥瓦匠，一份给木工。最终建出来的两栋房子看起来一模一样，而且都是真正的砖木结构，不是临时搭的纸板房。

这里的"纸板房"指的是 React Native 那种通过 JavaScript 桥接来操作原生控件的方案——中间有一层通信延迟。Valdi 不走这条路，它在你写代码的时候就直接翻译成原生视图。

## 它是怎么来的

Valdi 是 Snapchat 内部用了 8 年以上的跨平台 UI 框架。2024 年左右开源，目前处于 Beta 状态。注意这个 Beta 不是说功能不稳定，而是说"我们内部一直在用，但开源工具和文档还需要更多外部打磨"。

## 核心概念

### 1. 声明式组件（Declarative Components）

Valdi 的核心写法跟 React 很像——你用一种类似 HTML 的语法（叫 TSX）来描述界面长什么样：

```tsx
import { Component } from 'valdi_core/src/Component';

class HelloWorld extends Component {
  onRender() {
    const message = 'Hello World!';
    <view backgroundColor='#FFFC00' padding={30}>
      <label color='black' value={message} />
    </view>;
  }
}
```

这里 `<view>` 是一个容器（类似 CSS 里的 div），`<label>` 是文字标签。它们都会被编译成 iOS 的 `UIView` 和 Android 的 `android.view.View`，不是 WebView。

### 2. Flexbox 布局

Valdi 用 Flexbox 来做布局，跟网页开发用的 CSS Flexbox 基本一样。如果你学过一点 CSS，这部分几乎零门槛：

- `flexDirection`：决定子元素是横着排（row）还是竖着排（column）
- `justifyContent`：沿着主轴对齐（row 模式下是水平，column 模式下是垂直）
- `alignItems`：沿着交叉轴对齐

```tsx
class CenteredRow extends Component {
  onRender() {
    <view
      flexDirection='row'        // 子元素横向排列
      justifyContent='center'    // 水平居中
      alignItems='flex-end'     // 垂直靠底部对齐
      backgroundColor='lightblue'
      height={100}
    >
      <image src='photo.jpg' height={64} width={64} border='1 solid red' />
      <image src='photo.jpg' height={64} width={64} border='1 solid red' />
      <image src='photo.jpg' height={64} width={64} border='1 solid red' />
    </view>;
  }
}
```

这三个小图就会横着排在蓝色区域的底部中央。

### 3. 自动视图回收（View Recycling）

这是 Valdi 性能的关键。想象一个很长的商品列表——如果每次滚动都要新建和销毁视图，手机很快就会卡。Valdi 做了一个全局的"视图游泳池"：当一个视图不需要显示了，它不会被销毁，而是被清洗后放回池子里；下次需要同类视图时直接从池子里拿，重新设置属性就行。

这意味着你用简单的 `<scroll>` + `for-each` 就能流畅地渲染成千上万个条目，不需要像原生开发那样去配置 `RecyclerView` 或 `UITableView` 的复用逻辑。

### 4. 热重载（Hot Reload）

改完代码保存，几毫秒内就能看到设备上的变化。不需要重新编译整个应用，也不需要刷新页面。这对开发体验的提升非常大——你可以边改边看效果，像画画一样。

## 代码示例

### 示例一：带状态的计数器

Valdi 提供了 `StatefulComponent` 来处理界面中的数据变化：

```tsx
import { StatefulComponent } from 'valdi_core/src/Component';

class Counter extends StatefulComponent<{ initialValue?: number }, { count: number }> {
  state: { count: number } = { count: this.props.initialValue || 0 };

  onRender() {
    <view flexDirection='column' alignItems='center' padding={40}>
      <label
        value={String(this.state.count)}
        font='System-Bold 48 unscaled 48'
        color='black'
      />
      <view flexDirection='row' marginTop={20}>
        <view
          backgroundColor='#FFFC00'
          padding={16}
          borderRadius={12}
          onTap={this.increment}
        >
          <label value='+' color='black' font='System-Bold 24 unscaled 24' />
        </view>
        <view
          backgroundColor='#FFFC00'
          padding={16}
          borderRadius={12}
          marginLeft={16}
          onTap={this.decrement}
        >
          <label value='-' color='black' font='System-Bold 24 unscaled 24' />
        </view>
      </view>
    </view>;
  }

  increment = () => {
    this.setState({ count: this.state.count + 1 });
  };

  decrement = () => {
    this.setState({ count: this.state.count - 1 });
  };
}
```

点击 + 或 - 按钮，数字会实时更新。`setState` 触发后 Valdi 只会重新渲染受影响的视图，不会整页刷新。

### 示例二：可滚动的商品列表

展示 Valdi 如何处理真实场景中的列表：

```tsx
import { StatefulComponent } from 'valdi_core/src/Component';

interface Product {
  name: string;
  price: string;
  image: string;
}

class ProductList extends StatefulComponent<{}, { products: Product[] }> {
  state: { products: Product[] } = {
    products: [
      { name: '相机', price: '$299', image: 'camera.png' },
      { name: '耳机', price: '$149', image: 'headphone.png' },
      { name: '手表', price: '$199', image: 'watch.png' },
      { name: '键盘', price: '$99', image: 'keyboard.png' },
      { name: '鼠标', price: '$59', image: 'mouse.png' },
    ],
  };

  onRender() {
    <view width='100%' height='100%' backgroundColor='white'>
      <label value='商品列表' font='System-Bold 22 unscaled 22' color='black' padding={16} />
      <scroll>
        {this.state.products.map((product, index) => (
          <view
            flexDirection='row'
            padding={16}
            borderBottom='1 solid #eee'
          >
            <image src={product.image} width={60} height={60} borderRadius={8} />
            <view marginLeft={16} flexGrow={1}>
              <label value={product.name} font='System-Bold 17 unscaled 17' color='black' />
              <label value={product.price} font='System 15 unscaled 15' color='#666' marginTop={4} />
            </view>
          </view>
        ))}
      </scroll>
    </view>;
  }
}
```

这个列表用 `<scroll>` 包裹，每个商品项是一个 `<view>` 行。Valdi 的视图回收机制会自动处理滚动时的视图复用，即使有上千条数据也能保持流畅。

## 与其他方案的对比

| 特性 | Valdi | React Native | Flutter |
|------|-------|-------------|---------|
| 渲染方式 | 编译为原生视图 | JS 桥接原生视图 | 自绘引擎（Skia） |
| 语言 | TypeScript | JavaScript/TypeScript | Dart |
| 布局 | Flexbox | Flexbox（自定义实现） | 自定义布局树 |
| 热重载 | 毫秒级 | 秒级 | 秒级 |
| 背后公司 | Snapchat | Meta | Google |

关键区别在于：React Native 运行时通过桥接通信，有性能瓶颈；Flutter 自己画每一个像素，包体积大；Valdi 直接在编译期生成原生视图，性能和原生一样好。

## 怎么开始

```bash
# 安装 Valdi 命令行工具
npm install -g @snap/valdi

# 一键搭建开发环境
valdi dev_setup

# 创建新项目并安装 iOS 平台
mkdir my_project && cd my_project
valdi bootstrap
valdi install ios
```

Valdi 还支持嵌入到已有的原生项目中——你可以先在某个页面用 Valdi 写一个小模块试试水，不需要整个 App 重写。

## 小结

Valdi 解决了一个核心矛盾：跨平台开发的"开发效率"和"运行性能"往往不可兼得。它的思路很直接——在编译期就把你的 TypeScript 代码变成真正的原生视图，绕开运行时桥接。对于已经熟悉 React 风格的开发者来说，上手曲线比较平缓。

不过要注意，这是一个还在 Beta 阶段的开源项目，社区生态不如 React Native 成熟。如果你是 Snapchat 的用户或者团队正在做跨平台原生 App，值得重点关注。

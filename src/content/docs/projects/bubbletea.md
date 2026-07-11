---
title: Bubble Tea — 用 Elm 架构写终端 UI 的 Go 框架
来源: https://github.com/charmbracelet/bubbletea
日期: 2026-05-31
分类: CLI
难度: 中级
---

## 是什么

Bubble Tea 是 charm 出品的 **Go TUI 框架**：把"画一个能键盘交互的终端界面"这件事，强制按 **Elm 架构（TEA：Model-View-Update）** 拆成三块。日常类比：像把"看电视"和"按遥控器"分开——遥控器（Update）只负责"把按键变成新台号"，电视屏幕（View）只负责"按当前台号画画面"，两边互不抢饭碗。

最小可跑程序：

```go
type model struct{ count int }
func (m model) Init() tea.Cmd { return nil }
func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    if k, ok := msg.(tea.KeyMsg); ok && k.String() == "+" { m.count++ }
    return m, nil
}
func (m model) View() string { return fmt.Sprintf("count=%d", m.count) }
func main() { tea.NewProgram(model{}).Run() }
```

不用循环、不用 `select`、不用手动重画——按一下 `+`，框架把 `tea.KeyMsg` 投进 Update，拿到新 model 后调 View 重画。所有副作用（HTTP / 读文件 / 计时器）打包成 `tea.Cmd`，在 goroutine 里跑完再以新 msg 回流。

## 为什么重要

不理解 Bubble Tea 这套 TEA 强约束，下面这些事都解释不清：

- 为什么 `gh dash`（GitHub CLI 仪表盘）/ `glow`（终端 markdown）/ `soft-serve`（git over SSH）这一批 27k stars 量级的 Go TUI 工具，长得像同一个家族——都用了 charm 全家桶
- 为什么 Go 圈早期写 TUI 都用 [tcell/tview]，命令式 `AddItem` / `SetText`，但近三年新项目几乎全切到 Bubble Tea——TEA 让"状态变化 = 屏幕变化"变得可推理
- 为什么 React / Redux / Elm / SwiftUI / Compose 这些前端框架的"单向数据流"思想，其实在终端里更纯粹（输入只有键盘，输出只有字符串）
- 为什么"View 是纯函数"听起来抽象，但只要写过一次 Bubble Tea 就忘不掉——重画错乱、闪烁、状态不一致这些 TUI 老 bug 几乎被消灭

## 核心要点

Bubble Tea 的设计可以拆成 **四件套**：

1. **Model（值类型的状态）**：一个 struct 装下应用所有状态。值传递不是性能问题——每次 Update 返回新 model，框架内部只比较和替换。状态太大就拆子模型嵌套（list 里嵌 textinput 是常见做法）。

2. **Update（消息分派）**：函数签名 `Update(tea.Msg) (tea.Model, tea.Cmd)`。所有变化的入口——键盘、窗口 resize、HTTP 回包、计时器 tick——都化成 `tea.Msg`。Update 用 `switch msg.(type)` 分派。**Update 不能阻塞**，长任务必须包进 Cmd。

3. **View（纯函数渲染）**：`View() string` 把当前 model 翻译成"屏幕上要画的字符串"。配 `lipgloss` 加边框、颜色、padding。**View 里别做 IO**——它每帧都跑，读文件就 60 次/秒地读。

4. **Cmd（副作用单元）**：`tea.Cmd = func() tea.Msg`。要发 HTTP？写个返回 `httpDoneMsg{}` 的闭包，从 Update 返回它。框架在 goroutine 里跑，结果当成新 msg 回到 Update。`tea.Batch(...)` 并发组合，`tea.Sequence(...)` 串行。

## 实践案例

### 案例 1：键盘驱动的计数器

```go
func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {
    case tea.KeyMsg:
        switch msg.String() {
        case "q", "ctrl+c": return m, tea.Quit
        case "+":           m.count++
        case "-":           m.count--
        }
    }
    return m, nil
}
```

`tea.Quit` 是框架内置的特殊 Cmd，告诉 Program 退出。注意 `m.count++` 修改的是值副本，return 时返回出去，框架接住——没有共享可变状态，goroutine race 天生不存在。

### 案例 2：HTTP 请求作为 Cmd

```go
func fetchUser(id int) tea.Cmd {
    return func() tea.Msg {
        resp, err := http.Get(fmt.Sprintf("/users/%d", id))
        if err != nil { return errMsg{err} }
        return userMsg{decode(resp.Body)}
    }
}
// Update 里触发：
case tea.KeyMsg:
    if msg.String() == "r" { return m, fetchUser(m.id) }
// userMsg 回流时：
case userMsg: m.user = msg.user; return m, nil
```

请求在框架管理的 goroutine 里跑，**Update 永不阻塞**——TUI 不会因为网络慢就卡住键盘。

### 案例 3：用 bubbles + lipgloss 拼真实界面

```go
import ("github.com/charmbracelet/bubbles/textinput"; "github.com/charmbracelet/lipgloss")

ti := textinput.New(); ti.Placeholder = "搜索..."; ti.Focus()
style := lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).Padding(0, 1)
view := style.Render(ti.View())  // 圆角边框包住一个输入框
```

`bubbles` 子库提供 textinput / spinner / list / viewport / table / progress 七八个常用组件，每个都自己实现 Model/Update/View——你 wrap 进自己的 model，把它们的 Update 调用代理出去就能组合。

## 踩过的坑

1. **View 里做 IO 让 CPU 飙到 100%**：把 `os.ReadFile` 写在 View 里——TUI 每秒至少 30 帧就读 30 次磁盘。改成在 Update 里通过 Cmd 异步读，结果存进 model。

2. **Update 阻塞导致 UI 冻住**：`http.Get` 直接写在 Update 分支里，按下键就卡 3 秒。必须包成 Cmd。新人最爱犯。

3. **AltScreen 模式忘记关**：`tea.WithAltScreen()` 开了独立缓冲区（vim 那种"进入"和"退出"切屏），程序崩了没退出会让用户终端卡住。用 `defer` 配 `Program.Quit()` 兜底。

4. **truecolor 在 SSH / tmux 下降级**：lipgloss 颜色用 `#FF6600` 在本地 iTerm2 完美，登 SSH 就变成 256 色逼近。要用 `lipgloss.AdaptiveColor{Light:..., Dark:...}` 或 `CompleteAdaptiveColor` 兼容多档色深。

5. **窗口 resize 没处理界面错位**：`tea.WindowSizeMsg` 在初始化也会发一次，要在 Update 里存下宽高，View 里按宽度算布局。漏处理 resize 是 bug 大头。

6. **测试要用 teatest 而不是直接调 Update**：`teatest.NewTestModel` 能录回放，断言"输入这串键之后屏幕长什么样"，比单测 Update 函数更稳。

## 适用 vs 不适用场景

**适用**：

- 中长生命周期的开发者工具（dashboard / log viewer / DB client / git client）
- 需要键盘驱动的交互式 CLI（向导式安装、配置编辑器）
- 想让 TUI 通过 SSH 暴露（搭 `wish` 库直接变远程服务）
- 团队偏好 Go + 想要"前端式"心智模型的项目

**不适用**：

- 一次性脚本输出（`fmt.Println` 就够，别上框架）
- 需要复杂图形（图表、像素艺术）→ 用 [[ratatui]] 的 canvas 或直接 ANSI escape
- 极致低延迟（高频交易终端、游戏）→ TEA 的"全量重画"模型有开销，用立即模式
- 不想吃 Go 语法的团队 → JS 圈用 [Ink]，Rust 圈用 [[ratatui]]，Python 圈用 [Textual]

## 历史小故事（可跳过）

- **2019-2020 年**：Charmbracelet 团队把 Elm 架构搬进 Go 终端世界，Bubble Tea 早期版本先解决"键盘消息进来、字符串画出去"这个最小闭环。
- **2021 年**：`bubbles` 和 `lipgloss` 逐渐成型，常见组件与样式系统从主框架里拆出来，Bubble Tea 从"能写 demo"变成"能拼真实工具"。
- **2022-2023 年**：`glow`、`soft-serve`、`gh dash` 等项目把 Bubble Tea 带到更多开发者面前，Charm 的 TUI 全家桶开始形成统一审美。
- **2024 年以后**：Go TUI 圈把 TEA 当成主流选择之一，新项目常在 Bubble Tea、[[ratatui]]、[Textual]、[Ink] 之间按语言和团队栈做取舍。

## 学到什么

1. **TEA 在终端里比在浏览器更纯粹**——输入只有 KeyMsg，输出只有字符串，没有 DOM diff，没有 CSS 复杂度。这是学单向数据流最好的入门场地
2. **副作用包成值（Cmd）再交还给框架** 是函数式 + 并发的优雅交叉点——goroutine 没暴露给业务代码
3. **小核心 + 周边库（bubbles / lipgloss / wish / glamour）** 的"乐高式生态"是 charm 的成功模式，比一个上帝框架更易演化
4. **Go 也能写出函数式风格的代码**——值类型 model + 纯函数 View 把 OOP 习惯的"对象方法改自己"扳过来

## 延伸阅读

- 官方教程系列：[Bubble Tea Tutorials](https://github.com/charmbracelet/bubbletea/tree/master/tutorials)（4 个 example 从计数器到 HTTP）
- charm 全家桶官网：[charm.sh](https://charm.sh)（lipgloss / bubbles / wish / glow / soft-serve 一站式）
- 真实项目源码：[gh dash](https://github.com/dlvhdr/gh-dash)（GitHub CLI 扩展，27k stars 的项目自身用 bubbletea 写）
- Elm 架构原文：[The Elm Architecture](https://guide.elm-lang.org/architecture/)（TEA 思想原产地，比 Bubble Tea 文档更系统）

## 关联

- [[ratatui]] —— Rust 的 TUI 库，立即模式（immediate-mode），不强制 TEA，对照看能理解两种范式
- [[textual]] —— Python TUI 框架，吸收了 CSS-like 样式和组件化思路
- [[gsap]] —— Web 动画库，和 harmonica（charm 的弹簧库）共享"easing + 时间线"心智
- [[lipgloss]] —— Bubble Tea 的样式伙伴，CSS-like 边框 / 颜色 / padding
- [[glow]] —— charm 自家终端 markdown 阅读器，用 Bubble Tea 写
- [[wish]] —— 把 Bubble Tea 应用通过 SSH 暴露的库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[gum]] —— gum — 把 TUI 组件搬进 shell 脚本
- [[ratatui]] —— ratatui — Rust 的立即模式 TUI 库，tui-rs 弃坑后社区接住
- [[textual]] —— Textual — 用 CSS 写终端界面的 Python 框架
- [[wails]] —— Wails — 用 Go + 网页技术打成单个桌面应用

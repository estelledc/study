# CPR 数据平台视觉设计系统

> 调性：**Editorial Minimalism**（编辑级极简）
> 灵感来源：open-design `web-prototype-taste-editorial` + `clinical-case-report` 的医学严谨感
> 适用：所有 19 个页面 + API 文档站

---

## 一、设计哲学

| 原则 | 决定 | 反面 |
|---|---|---|
| 这是**学术档案**，不是 SaaS | 衬线大标题 / 暖白底 / 1px 发丝线 | 不要 SaaS 蓝 / 不要装饰 emoji / 不要营销文案 |
| 这是**医生 + 工程师**共用 | 信息密度高 + 留白充足 + 印刷质感 | 不要拟物 / 不要图标过载 / 不要圆角太大 |
| 这是**vea 的数据集** | 数据本身是主角，UI 是衬纸 | 不要 dashboard 花哨配色 / 不要图表抢戏 |

**类比**：Notion 的文档美学 + 《柳叶刀》的版面克制 + Linear 的工具理性。

---

## 二、色彩 Color tokens

### 中性
```
--canvas:    #FBFBFA   /* 暖白底，不用纯白 */
--surface:   #FFFFFF   /* 卡片纸面 */
--ink:       #1A1A19   /* 正文 off-black，不用 #000 */
--muted:     #787774   /* 次要文字 */
--hairline:  #EAEAEA   /* 1px 发丝边 */
--ink-soft:  #2A2A28   /* hover 态 */
```

### 状态色（仅用于 chip / 行内标签，永不做大块背景）
```
draft / pending:    bg #FBF3DB / fg #956400      (sepia 米黄)
approved:           bg #EDF3EC / fg #346538      (青苔绿)
rejected:           bg #FDEBEC / fg #9F2F2D      (浅砖红)
deprecated:         bg #F2F1EE / fg #787774      (灰沙)
unsure / 不确定:    bg #E1F3FE / fg #1F6C9F      (淡天蓝)
gap / 缺口告警:     bg #FBF3DB / fg #956400      (同 pending，提示意味)
```

### 数据可视化（覆盖率热力图专用色阶）
```
heat-0:  #F2F1EE  (无样本，灰沙)
heat-1:  #F4EFE3  (1-2 个，淡米)
heat-2:  #EDE7CF  (3-5 个，米)
heat-3:  #DCD2A8  (6-10 个，沉米)
heat-4:  #B5A66D  (>10 个，橄榄米)

/* 强调色仅一处：当前选中的 step / 高亮命中 */
--accent:    #5C4A2A   (暖深棕，比黑稍亮)
```

**禁止**：饱和原色（#0066FF 之类的 SaaS 蓝）、霓虹、玻璃拟态、彩虹渐变。

---

## 三、字体 Typography

### 字体族
```
--display:  'Instrument Serif', 'Newsreader', 'Lyon Text', Georgia, serif;
--sans:     'Inter Tight', 'Switzer', 'SF Pro Display', system-ui, sans-serif;
--mono:     'JetBrains Mono', 'Geist Mono', ui-monospace, monospace;
```

中文：
- 衬线（display）→ 思源宋体 / Source Han Serif
- 无衬线（sans）→ 思源黑体 / Source Han Sans
- 等宽（mono）→ Sarasa Mono / JetBrains Mono Chinese

### 字号阶梯
```
--display-xl:  clamp(48px, 7vw, 96px)   /* hero h1，serif italic 部分 */
--display-l:   40px                      /* 页面级 h1 */
--display-m:   28px                      /* 区域 h2 */
--body-l:      18.5px                    /* lede 引言 */
--body:        15px                      /* 正文 */
--body-s:      13.5px                    /* 表格 / 元信息 */
--micro:       11px                      /* eyebrow / mono 元信息 */
```

### 排版规则
- 大标题 `letter-spacing: -0.025em`，`line-height: 1.05`
- display 偏好 `font-weight: 400` + 个别 italic 段，**不堆 weight**
- eyebrow（小标）走 mono 大写 + `letter-spacing: 0.18em`
- 等宽字体仅用于：step_id（D2S5）/ E_code（E10）/ checksum / timestamp / 键盘快捷键

---

## 四、间距 + 容器

### 基本单位
- 4px grid，常用 8 / 12 / 16 / 24 / 32 / 48 / 72 / 96
- 区块上下间距 ≥ 72px（hero ≥ 96px）

### 圆角
- 卡片 / 输入框：8px
- chip / pill：999px（仅小元素）
- **不要** 16px+ 大圆角，不要 rounded-full 在卡片上

### 边
- **唯一边**：`1px solid var(--hairline)`
- 不允许多边宽 / 不允许虚线
- Drop shadow 上限：`0 1px 2px rgba(0,0,0,0.04)`

### 容器
```
.wrap          max-width: 1120px; margin: 0 auto; padding: 0 32px
.wrap-narrow   max-width: 720px (文档 / 表单)
.wrap-wide     max-width: 1280px (热力图 / 表格)
```

---

## 五、组件规范

### 5.1 Sticky pill 导航（顶部）
- `position: sticky; top: 16px`
- 半透明 `rgba(251,251,250,0.78)` + `backdrop-filter: blur(16px)`
- 1px hairline 边 + `border-radius: 999px`
- 左：品牌字 serif display；中：链接 sans 13.5px；右：CTA 暗底 pill

### 5.2 状态 chip（贡献状态 / 易错点 E_code）
```html
<span class="chip chip-approved">approved</span>
<span class="chip chip-mono">E10</span>
```
- 高 24px / 圆角 999px / mono 11px / 横向 padding 10px
- 仅状态 + E_code + step_id 可用 chip，**不要标题用 chip**

### 5.3 数据表格
- 无外框，行间 1px hairline
- 表头：mono 11px uppercase `letter-spacing: 0.18em` + `color: var(--muted)`
- 数字列右对齐 mono 13px
- 文本列左对齐 sans 13.5px
- 行 hover：`background: rgba(0,0,0,0.02)`，无其他变化

### 5.4 覆盖率热力图（核心组件）
- 每格：32×32px 方块，无圆角，1px hairline 分隔
- 填色用 `--heat-0..4` 五阶
- 鼠标悬停弹出 mono 元信息卡片
- 列头 / 行头 mono 11px

### 5.5 视频时间轴
- 高 48px，背景 `var(--surface)`，1px hairline
- 已标注区间用半透明 chip 色（approved 绿 / unsure 蓝）
- 错误时间戳用 4px 竖线 + tooltip
- 当前播放位置：`accent` 色 1px 竖线

### 5.6 媒体卡片（contribution 列表用）
- 缩略图比例 16:9，`border-bottom: 1px solid hairline`
- 标题 serif italic 18px
- 元信息行：作者 mono / kind chip / 时间 mono
- 整卡 1px hairline 边，`border-radius: 8px`

### 5.7 按钮
```
btn-primary    bg: var(--ink); color: var(--canvas); 圆角 8px
btn-ghost      bg: transparent; border: 1px solid hairline
btn-link       带 → 箭头，无边框
```
不允许第 4 种按钮形态。

### 5.8 表单
- 输入框 1px hairline，背景 surface，圆角 8px
- focus 态：边变 `var(--ink)` + 无 outline
- 标签：mono 11px uppercase，置于输入框上方

---

## 六、动效

### 唯一允许的过渡
```css
transition: 200ms cubic-bezier(0.16, 1, 0.3, 1);  /* 进入 */
transition: 140ms cubic-bezier(0.4, 0, 1, 1);     /* 退出 */
```

### 允许的动画
- Scroll entry：`translateY(12px) → 0` + opacity，IntersectionObserver 触发
- Hover：`box-shadow` 从 `0` 到 `0 2px 8px rgba(0,0,0,0.04)`
- Stagger：列表 `--index * 60ms`
- 仅 animate `transform` + `opacity`，永不 animate `width/height/background`

### 禁止
- 旋转 / 翻转 / 闪烁
- `scale(0)` 入场（最小 `scale(0.96)`）
- 弹簧 / 过冲（妙在严谨克制）

---

## 七、写作规范（UI copy）

| 场景 | 这样写 | 不这样写 |
|---|---|---|
| 按钮 | 「上传贡献」「打 snapshot」 | "立即开始" / "Get Started" |
| 状态 | 「待审 · 提交于 6 月 8 日」 | "Pending review" / 营销腔 |
| 错误 | 「校验失败：error_codes 必须 ∈ rubric.E10」 | "Oops! Something went wrong" |
| 空态 | 「该 step 暂无 reference_negative」 | "Nothing here yet 🌱" |

中英文规则：
- 中英文之间空格（`vea 项目` 不是 `vea项目`）
- 数字 / 单位间空格（`52 分钟` 不是 `52分钟`）
- 全角标点，引号用 `「」` 而非 `""`
- 永不使用 emoji（包括状态、按钮、celebration）

---

## 八、AI 文案禁词

不要在任何地方出现：
```
Elevate / Seamless / Unleash / Next-Gen / Game-changing
释放 / 赋能 / 颠覆 / 一站式 / 全方位
```

---

## 九、暗色模式

**MVP 不做**。理由：
- 医学场景默认明亮环境
- 老师上传的视频缩略图色彩在亮底更准
- 教研员审视缩略图色阶在亮底更可靠

留口子：tokens 用 CSS 变量已分离，未来加 `[data-theme="dark"]` 覆盖。

---

## 十、19 个页面的视觉差异维度

| 页面族 | 主调 | 标志元素 |
|---|---|---|
| 首页 / step 详情 / E_code 详情（学习模式） | 文档型 | 大 serif 标题 + 长正文区 |
| 贡献向导 / 我的贡献（生产者） | 表单型 | 步进器 + 表单卡片 + 实时预览 |
| 审核队列 / 数据集管理（运营） | 表格型 | 多列数据表 + 过滤器 + 操作列 |
| 视频详情 / 对比页 | 媒体型 | 大缩略图 + 时间轴 + 标注图层 |
| API 文档 | 印刷型 | 全幅 mono + 代码块 + 命令行风格 |

每族遵循同一组 tokens，仅版式差异。

---

## 十一、Pre-flight 自检（每个页面 ship 前）

- [ ] Canvas 是 `#FBFBFA`，foreground 是 `#1A1A19`，无纯黑
- [ ] 所有边都是 `1px solid #EAEAEA`
- [ ] 至少一处 serif italic 标题（页头 / 区段 h2）
- [ ] mono 字体只出现在 step_id / E_code / 时间 / checksum
- [ ] 状态 chip 只在小元素上，不做块背景
- [ ] 区块上下 padding ≥ 72px
- [ ] 无 emoji / 无 AI 文案 / 无装饰边框
- [ ] 中英文间有空格
- [ ] 圆角 ≤ 12px（chip 除外）
- [ ] accent 色（暖棕）每页 ≤ 2 处使用

---

## 十二、参考与延伸

- open-design 模板：`design-templates/web-prototype-taste-editorial/example.html`
- 排版灵感：The New York Times 学术专栏、Linear 文档、《柳叶刀》PDF 排版
- 不参考：Stripe（太蓝）/ Notion 移动版（太圆）/ Vercel（太黑底）

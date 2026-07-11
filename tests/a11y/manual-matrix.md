# 手工无障碍验收矩阵

关联任务：STUDY-T016。自动 axe 不能证明屏幕阅读器体验；未实际运行的项目保持 `UNKNOWN`。

Owner scope（2026-07-11）：VoiceOver 已由仓库 owner 明确移出当前与后续默认验收范围，只有 owner 主动重开时才执行。下表保留这些场景用于追踪历史 acceptance boundary，但 `OWNER_DEFERRED` 不等于 `PASS`，也不阻塞非 VoiceOver 门禁。

判定依据（均于 2026-07-10 核对）：[WCAG 2.2 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)、[Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)、[Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) 与 [Reflow failure F102](https://www.w3.org/WAI/WCAG22/Techniques/failures/F102)。

自动化基线由 `npm run test:a11y` 记录：Chromium axe、320/375 CSS px、深浅色、文本间距、减少动态效果、目标尺寸、键盘路线和 Pagefind 搜索。它不替代下表的真实辅助技术验收。

| 场景 | 操作 | 期望 | 当前状态 |
|---|---|---|---|
| VoiceOver 首页 | macOS VoiceOver 依次浏览导航、H1、三 CTA | 顺序与视觉阅读顺序一致，按钮/链接名称明确 | OWNER_DEFERRED；未执行，只有 owner 主动重开时恢复 |
| VoiceOver 搜索 | 打开搜索、输入、浏览结果、Escape 关闭 | 焦点进入对话框，结果数量可感知，关闭后回到触发器 | OWNER_DEFERRED；未执行，只有 owner 主动重开时恢复 |
| VoiceOver broken wikilink | 浏览一处未解析 wikilink | 可听到“未解析链接”状态和显示名称，不只依赖 title | OWNER_DEFERRED；未执行，只有 owner 主动重开时恢复 |
| 200%/400% reflow 等价布局 | 以 375/320 CSS px 覆盖首页、开始页、主题页、React/ReAct | 无内容丢失或页面级横向滚动；代码块局部滚动 | AUTOMATED_PASS（2026-07-11）；由 `site.spec.mjs` 覆盖 |
| 文本间距 | 应用 WCAG text-spacing 参数 | 文本不重叠、不截断，CTA 仍可操作 | AUTOMATED_PASS（2026-07-11）；由 `site.spec.mjs` 覆盖 |
| 键盘 | Tab/Shift+Tab 遍历首页、搜索、Atlas | 焦点清晰、顺序稳定、无键盘陷阱 | AUTOMATED_PASS（2026-07-11）；由 `site.spec.mjs` 与 `product-contract.spec.mjs` 覆盖 |
| 减少动态效果 | 系统开启 Reduce Motion | 非必要动效关闭，内容和反馈不丢失 | AUTOMATED_PASS（2026-07-11）；由 `site.spec.mjs` 覆盖 |

记录时只写设备/浏览器/辅助技术版本、步骤和脱敏结果；不把“未发现”写成通用保证。上述自动项来自规范 Node/npm 环境中的 23/23 Playwright suite；它们不外推为 VoiceOver 结果。

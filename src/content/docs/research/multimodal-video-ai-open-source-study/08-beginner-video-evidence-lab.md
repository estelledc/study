# 零基础实验：让视频回答带着可回看的证据

## 1. 先建立直觉

想象老师要判断学生是否完成三个操作：

1. 准备工作台；
2. 放入样品；
3. 盖上盖子。

最不可靠的做法是让 AI 看完整段录像后只回答“做完了”。老师不知道：

- AI 在哪一秒看到了；
- 是画面看到，还是只听到学生说“我做了”；
- 三步是否按顺序；
- 第二步是否被遮挡；
- 重新查看原片后是否仍成立。

更可靠的链路像侦查：

```text
先粗看全片
  -> 保存带时间戳的线索
  -> 按具体问题选择时间窗
  -> 回看原帧
  -> 按 rubric 判断
  -> 冲突时交给复核
```

类比边界：本实验用三种纯色代表三个动作，只验证证据控制流，不训练或评测
真实动作识别模型。

## 2. 技术目标

运行后得到：

```text
MP4
  -> metadata + video hash
  -> global frames
  -> question-driven focus window
  -> focused frame
  -> rubric result
  -> report.json
```

关键对象：

| 对象 | 含义 |
|---|---|
| `VideoMetadata` | 视频身份、时长、分辨率、音轨 |
| `FrameEvidence` | 某时间戳的帧、步骤、原因和 hash |
| `FocusDecision` | 这个问题需要回看哪个时间窗 |
| `TranscriptClaim` | ASR 声称某一步在何时发生 |
| `RubricResult` | 步骤覆盖、顺序、冲突与最终状态 |

## 3. 运行

前提：

```bash
ffmpeg -version
ffprobe -version
```

实验只使用 Python 标准库与本机 FFmpeg：

```bash
cd explorations/research/multimodal-video-ai-open-source-study/labs
PYTHONDONTWRITEBYTECODE=1 \
  python3 video_evidence_lab.py \
  --output /tmp/video-evidence-lab
```

预期：

```text
video: duration=12.0s size=160x120 audio=True
global: prepare@1.0s, add_sample@5.0s, close_lid@9.0s
focus: add_sample 4.0-6.0s
rubric=passed contradiction=needs_review
artifacts=/tmp/video-evidence-lab
```

测试：

```bash
PYTHONDONTWRITEBYTECODE=1 \
  python3 -m unittest -v test_video_evidence_lab.py
```

## 4. 第一步：生成真实视频

实验不是伪造三条内存记录。`build_sample_video()` 调用 FFmpeg：

```text
red 4s
  -> yellow 4s
  -> green 4s
  + 12s sine audio
  -> H.264/AAC MP4
```

三色语义固定为：

| 画面 | 教学步骤 |
|---|---|
| red | `prepare` |
| yellow | `add_sample` |
| green | `close_lid` |

这让测试知道 ground truth，同时仍然真实经过视频编码和解码。

## 5. 第二步：先验证输入合同

`probe_video()` 使用 `ffprobe` 读取：

- duration；
- width / height；
- 是否含 audio stream。

同时计算视频 SHA-256。

为什么先做这一步：

- 0 秒视频不应进入模型；
- 分辨率异常会改变帧成本；
- 没有音轨时不能假装执行 ASR；
- 文件变了，旧证据不应继续挂到新视频上。

## 6. 第三步：全局扫描

实验在 1、5、9 秒各解码一帧：

```text
1s -> prepare
5s -> add_sample
9s -> close_lid
```

每个 `FrameEvidence` 保存：

```text
step
color
timestamp
reason
video_sha256
frame_path
frame_sha256
```

`reason="global"` 表示它来自全局扫描，不是后续按问题补取的证据。

错误认知：

> 保存三张图片就够了。

正确理解：

> 图片必须能回答“来自哪个视频、哪一秒、为何抽取、之后是否被改过”。

## 7. 第四步：按问题选时间窗

问题：

```text
When was the sample added to the tray?
```

`focus_for_question()` 把问题词与步骤 alias 匹配，选出 `add_sample@5s`，得到
4-6 秒窗口。

这里故意使用确定性词表，不使用 LLM。目标是验证：

- focus 选择是显式决定；
- 未命中问题返回 `no_match`；
- 系统不会为了显得聪明而编造时间戳。

真实系统可以把这一步替换为向量检索或 LLM tool selection，但 `no_match`
和可审计 decision 仍应保留。

## 8. 第五步：回看原帧

`focused_review()` 不直接复用“全局扫描说第二步发生了”的文字，而是再次从
原 MP4 的 5 秒位置解码帧，标记：

```text
reason="focused"
```

这对应：

- DeepVideoDiscovery 的 `frame_inspect_tool`；
- OmAgent 的 `Rewinder`；
- watch-skill 的 `frames_near()`；
- ReAgent-V 的重新取证。

共同原则：

> 检索负责定位，原始媒体负责确认。

## 9. 第六步：rubric gate

`evaluate_rubric()` 分开检查：

1. `Coverage`：三个步骤是否都观察到；
2. `Order`：首次出现时间是否递增；
3. `Contradiction`：高置信 ASR 与附近视觉证据是否冲突。

状态：

| 条件 | 状态 |
|---|---|
| 全部步骤、顺序正确、无冲突 | `passed` |
| 缺步骤 | `incomplete` |
| 乱序或跨模态冲突 | `needs_review` |

例如 ASR 声称 `close_lid@5s`，但视觉证据是 `add_sample@5s`，系统不会选择
其中一个偷偷通过，而是输出：

```text
needs_review
```

## 10. provenance gate

`verify_evidence()` 重新计算：

- 当前视频 hash；
- 当前 frame hash。

任一不一致就失败。

它防止：

- 视频替换后仍引用旧帧；
- 人工改图后证据看似仍有效；
- 不同提交或实验复用同一个模糊文件名。

它不能证明帧的语义判断正确。Provenance 只证明来源链没有被静默换掉。

## 11. 九个测试在保护什么

| 测试 | 防止的错误 |
|---|---|
| 真实 probe | 把内存假数据冒充视频运行 |
| 三场景解码 | 没有真实经过 FFmpeg decode |
| 问题聚焦 | 每个问题都重跑完整视频 |
| 未命中不编造 | 无证据仍强行给时间窗 |
| 完整顺序通过 | 正常控制流不可用 |
| 缺步骤 incomplete | “没看到”被当成“做了” |
| 乱序 review | 只查 presence，不查时序 |
| 跨模态冲突 review | ASR 自动压过视觉证据 |
| hash 篡改检测 | 证据文件被换后仍通过 |

## 12. 与 9 个项目的对应关系

| 实验机制 | 对应项目 |
|---|---|
| video metadata / source identity | Director、watch-skill、multimodal-rag |
| global scan | DVD、OmAgent、ReAgent-V |
| persistent evidence | watch-skill、VidMentor、multimodal-rag |
| question-driven focus | DVD、OmAgent、ReAgent-V |
| focused review | DVD、OmAgent |
| protocol/rubric | proteomics_lab_agent |
| explicit tool decision | Director、VideoAgent |
| contradiction gate | 对各项目机制的综合补强 |

实验不是 9 个项目的共同代码，也不声称它们都已经实现全部 gate。

## 13. 证据等级

| 内容 | 等级 |
|---|---|
| FFmpeg 生成/探测/解码真实 MP4 | E2 |
| 9 个控制流测试 | E2 |
| 9 项目源码对应机制 | E1 |
| 颜色到步骤的映射 | 合成 ground truth |
| VLM/ASR 能力 | 未验证 |
| 真实课程评分增益 | 未验证 |

## 14. 常见误区

1. **错误认知：抽到关键帧就证明动作完成。**
   正确理解：单帧可能只显示开始或结束状态，动作方向和过程仍需时间窗。

2. **错误认知：ASR 说“我盖好了”就等于画面完成。**
   正确理解：语音是定位线索，视觉步骤需要画面证据；冲突应复核。

3. **错误认知：模型给出 0.92 confidence 就是 92% 正确率。**
   正确理解：未校准的自报分数不是统计概率，只能参与路由，不能直接定分。

4. **错误认知：多一次反思必然更准确。**
   正确理解：第二轮必须获得新证据或独立视角，否则只是重新措辞。

## 15. 自测

1. 如果全局扫描没看到 `add_sample`，系统应直接判缺失，还是先补什么证据？
2. ASR 在 5 秒说“盖上盖子”，画面却显示放入样品，为什么不能平均两个置信度？
3. 视频 hash 相同、frame hash 不同，最可能发生了什么？
4. 为什么本实验是真视频 E2，却不是 VLM 效果 E2？
5. 要把实验迁移到全智评，第一批人工标注应包含哪些字段？

## 16. 建议答案

1. 先围绕 ASR、相邻步骤或检索命中做 focused review；仍看不到再标
   `not_observed`，不要把 absence 直接等同于 missed。
2. 两种模态可能描述不同对象或时间；未经校准的 confidence 也不可相加，应回看
   原片或进入人工复核。
3. 帧文件被重新编码、替换或篡改，原 provenance 已失效。
4. E2 覆盖媒体 I/O 和控制流；语义来自预先定义的颜色，不来自视觉模型。
5. 至少需要视频 hash、step、ground-truth 时间窗、可见性、ASR 线索、预测证据、
   状态、人工覆写和原因。

## 17. 下一步

完成实验后，从
[项目上手卡](09-beginner-project-onboarding-cards.md)
选择一个项目，追踪“全局表示如何回到原始时间戳”。不要先安装九套重型依赖。

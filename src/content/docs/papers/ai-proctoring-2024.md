---
title: AI-Based Proctoring: Fairness and Effectiveness
来源: https://arxiv.org/abs/2401.00048
日期: 2026-06-13
分类: 其他
子分类: educational-tech
provenance: pipeline-v3
---

# AI-Based Proctoring: 公平性和有效性 — 零基础学习笔记

## 一、什么是 "监考"？从日常场景开始

想象你在学校参加考试。教室里坐着一位监考老师，他来回走动，看看你有没有翻小抄、有没有和别人说话。这叫 **现场监考（invigilation）**。

现在想象你在家里上网课，学校要你参加线上考试。没有老师在旁边，怎么办？于是出现了 **AI监考系统**：你的电脑摄像头对着你，麦克风开着，屏幕共享着，AI 算法实时判断你是否在作弊。

这就叫 **AI-Based Proctoring（基于人工智能的监考）**。

---

## 二、核心概念

### 2.1 AI监考系统是什么

AI监考系统利用以下技术来监控远程考试：

| 技术手段 | 作用 |
|---------|------|
| 计算机视觉（摄像头分析） | 检测人脸、视线方向、是否有人出现在画面中 |
| 语音分析（麦克风监听） | 检测是否有他人说话的声音 |
| 行为分析（键盘/鼠标操作） | 检测异常操作模式，如频繁切换窗口 |
| 浏览器锁定 | 禁止打开新标签页或访问其他应用 |

### 2.2 为什么"公平性"是个大问题

公平性（Fairness）指的是：AI监考系统对所有考生是否一视同仁，不会因为某些人的外貌、肤色、口音、文化习惯等因素而产生误判。

举个简单类比：

> 如果一个人脸识别系统，对深色皮肤的人识别错误率更高，那用它来做考试监考时，深色皮肤的考生就会比浅色皮肤的考生更容易被系统标记为"可疑"。这对深色皮肤的考生公平吗？

这不只是假设问题，而是**真实存在的偏见（bias）**。

### 2.3 公平性的四个维度

1. **种族/肤色偏见**：面部识别算法在不同肤色上的准确率差异
2. **年龄偏见**：年轻人和老年人面部特征差异导致误判
3. **残障偏见**：有面部特征差异或行动不便的考生可能被误判
4. **文化/地域偏见**：不同文化中的正常表情或行为可能被AI误读为"可疑"

---

## 三、关键技术拆解

### 3.1 计算机视觉检测

AI监考系统最常用的技术是计算机视觉（Computer Vision）。它的核心任务是：从视频图像中找出"异常"。

下面是一个简化的示例，展示如何用人脸检测来判断画面中是否只有一个人：

```python
import cv2

def count_faces_in_frame(frame):
    """
    检测画面中的人脸数量
    frame: OpenCV读取的视频帧 (BGR格式)
    返回: 检测到的人脸数量
    """
    # 加载预训练的人脸检测模型
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    )
    
    # 转换为灰度图（人脸检测在灰度图上更准确）
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # 检测人脸
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)
    
    return len(faces)

# 使用示例：检查摄像头画面
cap = cv2.VideoCapture(0)  # 打开摄像头
while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    num_faces = count_faces_in_frame(frame)
    
    if num_faces == 0:
        print("警告：画面中未检测到人脸！考生可能离开了座位")
    elif num_faces > 1:
        print("警告：画面中检测到多个人脸！可能有他人协助")
    
    # 在画面上画出检测到的人脸框
    for (x, y, w, h) in face_cascade.detectMultiScale(
        gray, 1.1, 4
    ):
        cv2.rectangle(frame, (x, y), (x + w, y + h), (255, 0, 0), 2)
    
    cv2.imshow('Exam Monitoring', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

**逐行解释：**

- `cv2.VideoCapture(0)` — 打开电脑的默认摄像头（编号0）
- `face_cascade.detectMultiScale()` — 调用人脸检测模型，在整张图片上扫描所有可能的人脸区域
- `detectMultiScale` 返回的 `faces` 是一个列表，每个元素包含 `(x, y, 宽度, 高度)`，代表检测到的一张脸的位置
- 如果检测到0张脸或超过1张脸，系统就会发出警告

### 3.2 视线追踪与注意力分析

视线追踪（Gaze Tracking）是另一个关键功能。AI通过摄像头分析你的眼球方向，判断你是否在看屏幕以外的地方。

下面是一个简化的伪代码示例：

```python
import dlib  # 人脸识别和关键点检测库

def analyze_attention(frame, model):
    """
    分析考生的注意力状态
    返回: 'focused'（专注）、'looking_away'（看别处）、'suspicious'（可疑）
    """
    # 1. 检测人脸关键点（68个特征点）
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    detector = dlib.get_frontal_face_detector()
    predictor = dlib.shape_predictor('shape_predictor_68_face_landmarks.dat')
    
    faces = detector(gray)
    if len(faces) == 0:
        return 'no_face_detected'
    
    face = faces[0]
    shape = predictor(gray, face)
    
    # 2. 提取左右眼的关键点（索引36-47对应6只眼的关键点）
    left_eye = shape_to_points(shape, 36, 42)
    right_eye = shape_to_points(shape, 42, 48)
    
    # 3. 计算瞳孔方向（简化版：比较上下眼睑的位置关系）
    left_gaze = calculate_gaze_direction(left_eye)
    right_gaze = calculate_gaze_direction(right_eye)
    
    # 4. 判断注意力
    if gaze_off_screen(left_gaze, right_gaze):
        return 'looking_away'
    else:
        return 'focused'

def shape_to_points(shape, start, end):
    """从dlib形状对象中提取指定范围的关键点坐标"""
    return [(shape[i].x, shape[i].y) for i in range(start, end)]

def calculate_gaze_direction(eye_points):
    """简化版视线方向计算"""
    # 计算眼睛的纵横比（EAR），判断眼睛睁开程度和方向
    vertical_avg = sum(p[1] for p in eye_points[1:5]) / 4.0
    horizontal_avg = sum(p[0] for p in [eye_points[0], eye_points[4]]) / 2.0
    # 这里用简化的逻辑，实际系统会用到更复杂的眼球追踪模型
    return vertical_avg / max(horizontal_avg, 1.0)

def gaze_off_screen(gaze_l, gaze_r):
    """判断视线是否偏离屏幕"""
    # 如果视线方向超出屏幕范围，认为在偷看
    return gaze_l < 0.2 or gaze_r < 0.2  # 简化阈值
```

**逐行解释：**

- `dlib` 是一个人脸识别库，`shape_predictor` 能定位人脸上的68个关键点，包括眼睛的轮廓
- 眼睛的68个关键点索引是36到47，其中左眼是36-41，右眼是42-47
- `EAR`（Eye Aspect Ratio）是判断眼睛开合和方向的关键指标：当这个值发生变化时，说明眼睛可能在看向不同方向
- 如果视线方向超出屏幕范围，系统就判定考生"在看别处"，可能是在偷看参考资料

### 3.3 公平性评估示例

下面这个示例展示如何评估一个面部检测算法在不同人群中的公平性：

```python
import numpy as np

def evaluate_fairness(detection_results):
    """
    评估AI监考系统的公平性
    detection_results: 列表，每个元素是
      {'group': 'group_A', 'total': 1000, 'false_positives': 50}
    false positive = 无辜考生被误判为作弊
    """
    print("=" * 50)
    print("AI监考系统公平性评估报告")
    print("=" * 50)
    
    results = []
    for group in detection_results:
        group_name = group['group']
        total = group['total']
        fp = group['false_positives']
        false_positive_rate = fp / total * 100
        
        result = {
            'group': group_name,
            'total_tested': total,
            'false_positives': fp,
            'false_positive_rate': false_positive_rate
        }
        results.append(result)
        
        print(f"\n群体: {group_name}")
        print(f"  测试人数: {total}")
        print(f"  误判人数: {fp}")
        print(f"  误判率:   {false_positive_rate:.2f}%")
    
    # 检查是否存在显著的不公平
    rates = [r['false_positive_rate'] for r in results]
    max_rate = max(rates)
    min_rate = min(rates)
    
    print(f"\n{'=' * 50}")
    if max_rate - min_rate > 5.0:  # 差异超过5%认为不公平
        print(f"⚠ 发现显著的公平性问题！")
        print(f"最高误判率: {max_rate:.2f}%")
        print(f"最低误判率: {min_rate:.2f}%")
        print(f"差异:       {max_rate - min_rate:.2f}%")
    else:
        print("✓ 各群体之间的误判率差异在可接受范围内")
    print(f"{'=' * 50}")
    
    return results

# 模拟数据：不同肤色群体的检测结果
fake_results = [
    {'group': '浅色皮肤考生', 'total': 500, 'false_positives': 10},
    {'group': '中等肤色考生', 'total': 500, 'false_positives': 25},
    {'group': '深色皮肤考生', 'total': 500, 'false_positives': 75},
]

evaluate_fairness(fake_results)
```

运行结果类似：

```
==================================================
AI监考系统公平性评估报告
==================================================

群体: 浅色皮肤考生
  测试人数: 500
  误判人数: 10
  误判率:   2.00%

群体: 中等肤色考生
  测试人数: 500
  误判人数: 25
  误判率:   5.00%

群体: 深色皮肤考生
  测试人数: 500
  误判人数: 75
  误判率:   15.00%

==================================================
⚠ 发现显著的公平性问题！
最高误判率: 15.00%
最低误判率: 2.00%
差异:       13.00%
==================================================
```

这个例子清晰展示了一个问题：如果训练数据中深色皮肤的人少，AI对深色皮肤的识别就不准确，导致误判率高出很多倍。这就好比一个只对"某一种人"训练过的安检门，其他类型的人经常误报。

---

## 四、有效性 vs 公平性：一个两难问题

研究中最核心的发现是：**提高有效性往往会损害公平性，反之亦然。**

### 4.1 有效性（Effectiveness）

有效性指的是：AI监考系统能不能真正抓出作弊行为。

- **检测率**：实际作弊中能被系统发现的比例
- **误报率**：没有作弊却被标记为可疑的比例

### 4.2 公平性与有效性的权衡

| 策略 | 对有效性的影响 | 对公平性的影响 |
|------|--------------|--------------|
| 降低检测阈值（更敏感） | 提高检测率，抓出更多作弊 | 误报增加，某些群体受影响更大 |
| 提高检测阈值（更宽松） | 降低检测率，漏掉作弊 | 误报减少，看起来更公平 |
| 使用多模态融合（摄像头+麦克风+键盘） | 显著提高有效性 | 需要更多数据，隐私风险增加 |
| 引入人工复核 | 提高准确性 | 成本高，无法规模化 |

这个两难问题的核心在于：**一个对所有人"一视同仁"的严格标准，可能对条件不同的群体产生不同的影响。**

---

## 五、AI监考的三个关键争议

### 5.1 隐私问题

AI监考系统需要收集：
- 实时视频画面（包括考生背景环境）
- 音频数据
- 浏览器使用记录
- 键盘敲击模式

这些数据如何存储？谁可以访问？用完后怎么处理？这些问题目前没有统一的答案。

### 5.2 算法透明度

很多商业AI监考系统使用的是"黑箱"算法——考生和被标记为作弊的人，不知道系统为什么判定自己可疑。这就好比：

> 餐厅告诉你"这道菜太咸了"，但不告诉你为什么觉得咸，也不让你看厨师怎么做的。你无法证明自己是对的，也无法让餐厅改进。

### 5.3 心理影响

研究表明，AI监考可能增加考生的焦虑和压力，尤其是：
- 对技术不熟悉的考生
- 来自低收入家庭的考生（设备较差，网络不稳）
- 有社交焦虑的候选人

---

## 六、总结：一句话记住核心结论

> AI监考系统能有效提高远程考试的安全性，但其**公平性（尤其是对少数群体的公平性）需要被认真对待**，否则可能把技术进步变成对特定人群的系统性歧视。

---

## 七、延伸思考

1. 如果你是一位大学的教务处长，你会选择使用AI监考吗？
2. 如果AI系统的误报率是5%，意味着每100名没作弊的考生中有5人被标记。这公平吗？
3. 你觉得"人工监考"真的比"AI监考"更公平吗？为什么？

---
title: 'Keras 3 — 一份模型代码跑三套后端'
来源: 'https://github.com/keras-team/keras'
日期: '2026-05-30'
分类: '数据科学与 AI'
难度: '入门'
---

## 是什么

Keras 是一个**让你用最少代码搭起神经网络**的高层 API。日常类比：像**乐高积木的总装说明书**——你不用关心每块塑料怎么压模出来，只要把"卷积层"、"激活层"、"池化层"按顺序拼起来，按下 `fit()`，模型就开始训练。

你写：

```python
import keras
from keras import layers

model = keras.Sequential([
    layers.Dense(64, activation='relu'),
    layers.Dense(10, activation='softmax'),
])
model.compile(optimizer='adam', loss='sparse_categorical_crossentropy')
model.fit(x_train, y_train, epochs=5)
```

12 行代码训练一个分类网络。**过去十年它是深度学习教学里最常见的入门接口之一**——许多公开课和教材用它当第一周作业。

Keras 3（2023.11 重写后）多了一个杀手锏：**同一份代码可以选 TensorFlow / JAX / PyTorch 三个后端跑**，靠 `KERAS_BACKEND` 环境变量切换。

## 为什么重要

不理解 Keras，下面这些事都没法解释：

- 为什么 2015-2018 年深度学习教程几乎全是 Keras——它把"建网络"从 50 行 TF 1.x 压到 5 行
- 为什么 2019 年 TensorFlow 2.0 直接把 Keras 收编成官方 `tf.keras`
- 为什么 2023 年 Keras 团队又决定**和 TensorFlow 解绑**，重写成多后端版本
- 为什么 PyTorch 用户也开始关注 Keras 3——因为它能在 PyTorch 后端上提供 `fit()` 这种"开箱即用训练循环"

## 核心要点

Keras 的能力可以拆成 **四件事**：

1. **三种建模风格**：`Sequential`（一条直线串起来）/ `Functional API`（图状，分支合并都能写）/ `Model Subclassing`（继承类，最灵活但代码最多）。新手先用 Sequential，复杂网络用 Functional。

2. **三段式训练**：`compile()` 绑定优化器和损失函数 → `fit()` 跑训练循环 → `evaluate()` / `predict()` 出结果。这套接口是 sklearn 风格在深度学习里的复刻，对统计背景的人友好。

3. **keras.ops 抽象层**：所有张量运算（matmul、conv、softmax）走 `keras.ops`，底层 dispatch 到选定的后端。这是多后端能成立的关键——你的代码不直接调 `tf.matmul` 也不调 `torch.matmul`。

4. **回调系统（Callbacks）**：`EarlyStopping`、`ModelCheckpoint`、`TensorBoard` 等钩子挂到 `fit()` 上。不用改训练循环就能加日志、保存、提前停止。

## 实践案例

### 案例 1：切换后端只改一个环境变量

```python
import os
os.environ['KERAS_BACKEND'] = 'jax'  # 或 'tensorflow' / 'torch'
import keras  # 这行必须在设环境变量之后
```

**同一个 model 定义、同一份训练代码**，三个后端都能跑。Chollet 的卖点：让研究员选最适合实验的后端，不用换框架。

### 案例 2：Functional API 写一个分支网络

```python
inputs = keras.Input(shape=(28, 28, 1))
x = layers.Conv2D(32, 3, activation='relu')(inputs)
x = layers.MaxPooling2D()(x)
x = layers.Flatten()(x)
outputs = layers.Dense(10, activation='softmax')(x)
model = keras.Model(inputs, outputs)
```

**逐部分解释**：

- `Input` 先声明张量形状，后面每层像函数一样接上一段输出。
- 这种写法比 Sequential 灵活，能描述 ResNet 那种**残差连接**：`x = layers.Add()([x, residual])`。
- 最后用 `keras.Model(inputs, outputs)` 把整张计算图封成可 `compile` / `fit` 的模型。

### 案例 3：用 callback 加早停和 checkpoint

```python
callbacks = [
    keras.callbacks.EarlyStopping(patience=3, restore_best_weights=True),
    keras.callbacks.ModelCheckpoint('best.keras', save_best_only=True),
    keras.callbacks.TensorBoard(log_dir='./logs'),
]
model.fit(x, y, epochs=100, validation_split=0.2, callbacks=callbacks)
```

**逐部分解释**：

- `EarlyStopping`：验证集连续 3 轮不降就停，并恢复最好权重。
- `ModelCheckpoint`：每次出现新最优就存盘，避免训完才发现中间更好。
- 不改训练循环就能挂上这些钩子；PyTorch 原生通常要自己写同等逻辑。

### 案例 4：自定义训练循环（绕过 fit）

```python
optimizer = keras.optimizers.Adam()
for epoch in range(epochs):
    for x, y in dataset:
        with tf.GradientTape() as tape:  # TF 后端
            logits = model(x)
            loss = loss_fn(y, logits)
        grads = tape.gradient(loss, model.trainable_weights)
        optimizer.apply_gradients(zip(grads, model.trainable_weights))
```

当 `fit()` 不够灵活（比如 GAN 里要交替训练两个网络），降到这一层。**注意**：这段代码用了 `tf.GradientTape`，**只能在 TF 后端跑**——这就是多后端的边界。

## 踩过的坑

1. **Keras 2 vs Keras 3 是两套**：包名都叫 `keras`，但 Keras 3 必须 `pip install keras>=3`，老的 `tf.keras` 是 Keras 2。导入路径相同但 API 微妙不同，在公司环境里切换要看 `keras.__version__`。

2. **后端切换必须在 import 之前**：`os.environ['KERAS_BACKEND'] = 'jax'` 必须在 `import keras` 之前执行，否则后端已锁定。新手常把它写在文件中间，调试半天。

3. **fit() 隐藏太多细节**：自定义 loss 用了 NumPy 而不是 `keras.ops.*`，训练时不会报错但梯度断了，loss 不下降——因为 NumPy 不在自动微分图里。

4. **多后端不代表零成本**：写自定义层时调了 `tf.signal.fft`，这层就锁死在 TF 后端。要写真正"多后端"的层必须只用 `keras.ops` 提供的算子。

5. **.keras 新格式 vs .h5 老格式**：`model.save('m.keras')` 是新推荐格式（zip 包，含配置 + 权重 + 优化器状态）；老的 `.h5` 还能用但不支持自定义对象的完整序列化。

6. **mixed precision 要显式开**：`keras.mixed_precision.set_global_policy('mixed_float16')` 一行搞定 FP16 训练，能省一半显存、提速 2 倍。新手默认 FP32 跑大模型，OOM 还以为是模型太大。

## 适用 vs 不适用场景

**适用**：

- 教学和原型——5 行代码搞定 MLP / CNN / RNN，新人能立刻看到结果
- 标准任务（图像分类、文本分类、回归）——`fit()` + `compile()` 就够
- 团队混用 TF / JAX / PyTorch 的场景——Keras 3 当统一前端
- 想在 sklearn 风格 pipeline 里包一层深度模型——Keras 3 需借助 `scikeras` 等包装，而不是核心包自带 `KerasClassifier`

**不适用**：

- 论文里复现 SOTA 模型——研究界已经几乎全用 PyTorch 原生
- 需要细粒度控制每一个梯度步骤（GAN / RL / meta-learning）——直接写 PyTorch / JAX 更顺
- 部署到非常受限的边缘设备——TFLite / ONNX 直接接 PyTorch 也能省一层

## 历史小故事（可跳过）

- **2015**：Francois Chollet 在 Google 内部为自己做实验造的工具，开源后爆红——比 TF 1.x 易用 10 倍
- **2017**：TensorFlow 把它收编为 `tf.keras`，成 TF 官方高层 API
- **2019**：TF 2.0 全面 Keras 化，eager 模式默认开启
- **2023.11**：Keras 3.0 发布，**和 TF 解绑**，重写为多后端架构。原因是 PyTorch 在研究界胜出后，"只能跑 TF"成了减分项。

## 学到什么

1. **高层 API 的核心价值**是把 80% 的常见任务压到 5 行——这套思路在 [[fastai]]、[[pytorch-lightning]] 都能看到
2. **抽象层的代价**永远是"灵活性"，所以高层 API 都会留逃生口（subclassing / 自定义循环）
3. **后端无关化**是 2020 年代的趋势，[[jax]]、ONNX、Keras 3 都在试不同的解
4. **教学事实标准** vs **研究事实标准** vs **生产事实标准** 是三件事，Keras 占第一格

## 延伸阅读

- 官方教程：[Keras 3 Getting Started](https://keras.io/getting_started/)（30 分钟过完核心 API）
- 多后端原理：[Keras 3 Announcement](https://keras.io/keras_3/)（Chollet 解释为什么重写）
- 深度学习入门书：[Deep Learning with Python, 2nd ed](https://www.manning.com/books/deep-learning-with-python-second-edition)（Chollet 亲自写，几乎是 Keras 教科书）
- [[tensorflow]] —— Keras 3 的默认后端，2017-2023 是它的官方高层 API
- [[pytorch]] —— Keras 3 现在能跑在它上面，研究界事实标准
- [[fastai]] —— 同样定位"低代码 DL"，但建在 PyTorch 上、风格更激进

## 关联

- [[tensorflow]] —— 长期宿主，Keras 2 = tf.keras
- [[pytorch]] —— Keras 3 新增后端，研究界主力
- [[jax]] —— Keras 3 第三套后端，偏研究向函数式与加速
- [[fastai]] —— 另一条"高层 DL API"路线，和 Keras 思路相似但拥抱 PyTorch
- [[pytorch-lightning]] —— PyTorch 阵营的训练循环抽象，对标 Keras 的 `fit()`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adam-2014]] —— Adam — 让深度学习自己挑步长的优化器
- [[cudnn-2014]] —— cuDNN — 把卷积写成矩阵乘，让所有深度学习框架共享底层加速
- [[papers/mlflow]] —— MLflow — 给机器学习实验装上「记账本和身份证」
- [[tensorflow-osdi-2016]] —— TensorFlow — 把神经网络拆成数据流图再跑到任何机器上
- [[papers/wandb]] —— Weights & Biases — 几行 init 把指标系统代码自动入库
- [[dlib]] —— dlib — C++ 机器学习 / CV 工具箱
- [[fastai]] —— fastai — 三行代码做迁移学习
- [[flax]] —— Flax — JAX 上的神经网络库
- [[insightface]] —— InsightFace — 人脸识别 / 检测 SOTA 工具箱
- [[jax]] —— JAX — Google 函数式数值计算
- [[mediapipe]] —— MediaPipe — Google ML 多模态流水线
- [[ncnn]] —— ncnn — 腾讯开源的端侧神经网络推理框架
- [[optax]] —— Optax — JAX 优化器组合库
- [[projects/optuna]] —— Optuna — 超参搜索框架
- [[tflite-micro]] —— TensorFlow Lite Micro — 把小模型塞进微控制器
- [[projects/wandb]] —— Weights & Biases — 几行 init 把指标系统代码自动入库

---
title: Rasa — 自己造一个能记住上下文的对话机器人
来源: https://github.com/RasaHQ/rasa
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 中级
provenance: pipeline-v3
---

## 是什么

Rasa 是一个**用 Python 写的开源对话式 AI 框架**，让你能在自己的机器上从零搭一个聊天机器人。日常类比：像一台带菜谱的中央厨房——你给它食材（训练数据）和菜单（对话剧本），它就能稳定地做出"客户问 A，我答 B"这种反应。

它解决的是这种问题：

```
用户：我想订下周三去上海的机票
机器人：好的，请问您从哪个城市出发？
用户：北京
机器人：已为您查到北京到上海周三 5 个航班...
```

这种**多轮、记得住前文、能查数据库、能调外部 API** 的对话，普通 LLM 一次性 prompt 很难搞稳。Rasa 给了一整套确定性工具。

## 为什么重要

不了解 Rasa，下面这些场景没法解释：

- 为什么很多银行 / 医院的客服机器人不直接接 GPT，而是自己训一个本地系统——**数据合规**让对话不能出公司
- 为什么 LLM 时代后 Rasa 还活着——**确定性 + 可审计** 是 LLM 难给的
- 为什么"意图识别"+"槽位填充"是 NLP 工程师面试的高频题——它们是 Rasa 的两根支柱
- 为什么 19k star 的开源项目在 2023 后转型做 CALM（LLM 增强）——**纯规则太死，纯 LLM 太飘**，要中间路线

## 核心要点

Rasa 把一次对话拆成**两个独立模型**：

1. **NLU（理解）**：用户说"我想订机票"→ 翻译成 `{意图: book_flight, 实体: {目的地: 上海}}`。日常类比：耳朵。
2. **Core（决策）**：根据当前对话状态 + 历史，决定"下一步说什么、做什么"。日常类比：大脑。

中间用 **Tracker（轨迹器）** 记住整轮对话发生过的事——意图、槽位值、上一步动作。这是它"记得住"的秘诀。

训练时你要写三类 YAML 文件：

- **`nlu.yml`**：例句 → 意图标注
- **`stories.yml`**：典型对话剧本
- **`domain.yml`**：清单（有哪些意图、槽位、动作、回复模板）

跑起来后，对话流是这样：

```
用户消息 → NLU → Tracker 更新 → Policy 选 next_action → 回复或调外部 API
```

## 实践案例

### 案例 1：DIET 一个网络做两件事

DIET（Dual Intent and Entity Transformer）是 Rasa 2020 推出的核心 NLU 模型。它**同时**预测：

- 意图（这句话整体想干嘛）
- 实体（句子里哪些词是关键信息）

```yaml
# nlu.yml 训练样本
- intent: book_flight
  examples: |
    - 我想订[下周三](date)去[上海](city)的机票
    - 帮我查[明天](date)到[北京](city)的航班
```

DIET 会把**意图损失 + 实体损失** 一起反传，让两件事互相帮忙学。比单独训两个模型省一半参数，准确率还更高。

### 案例 2：Forms 循环问到所有槽位填完

订机票需要 4 个槽位：出发地、目的地、日期、人数。任何一个没填，机器人就接着问。这个循环用 **Form** 实现：

```yaml
# domain.yml
forms:
  book_flight_form:
    required_slots:
      - departure_city
      - destination_city
      - travel_date
      - passenger_count
```

Rasa Core 的 FormPolicy 会自动判断"还有哪个槽没填"，去找对应的 `utter_ask_<slot>` 模板问出来。**用户每答一句，Tracker 更新一次，循环到全填完才退出。**

### 案例 3：Custom Action 调外部 API

机器人要查实时航班，必须出框架——这就是 Custom Action：

```python
# actions.py
from rasa_sdk import Action

class ActionSearchFlight(Action):
    def name(self):
        return "action_search_flight"

    def run(self, dispatcher, tracker, domain):
        dep = tracker.get_slot("departure_city")
        dst = tracker.get_slot("destination_city")
        # 这里调你的航班 API
        flights = search_api(dep, dst)
        dispatcher.utter_message(f"查到 {len(flights)} 个航班")
        return []
```

Rasa 跑一个独立的 **Action Server**（默认 5055 端口），主进程通过 HTTP 调它。这样**业务逻辑和对话逻辑解耦**，业务变了不用重训模型。

## 踩过的坑

1. **训练数据少时 DIET 过拟合**：每个意图至少写 10-15 个不同写法的例子。少于 5 句，模型基本只能记住原话。

2. **Story 路径爆炸**：你以为写 50 个 story 够了，实际用户会走 500 种你没想到的分支。**用 Rules 锁死必走路径**（如"问候必回问候"），Stories 只用来教对话趋势。

3. **槽位映射写错 → 一直问同一个问题**：Form 检查槽位是不是 `None` 来决定问不问，如果你 `slot_mappings` 里没正确从消息抓值，槽永远是空，机器人就**死循环**。

4. **版本断裂**：Rasa 1.x → 2.x → 3.x 配置文件格式变过两次。升级前先 `rasa data validate`，否则训练不报错但跑起来全错。

5. **中文分词坑**：默认 tokenizer 是空格切词，中文必须换 `JiebaTokenizer` 或预训练的 `LanguageModelFeaturizer`，否则"我想订机票"被当成一个词。

## 适用 vs 不适用场景

**适用**：

- 客服 / 工单 / 预约这种**有限场景** + **多轮** 的机器人
- 数据敏感，必须**私有部署**（医疗 / 金融 / 政务）
- 需要**审计每一步决策**的合规场景
- 已有大量历史对话日志，可以挖出意图分类训练数据

**不适用**：

- 通用闲聊 / 开放域问答 → 直接接 LLM 更省力
- 一次性单轮场景（"翻译这句话"）→ 杀鸡用牛刀
- 训练数据极少（< 50 条/意图）→ 没法训
- 纯文档问答 → RAG + LLM 比 Rasa 短平快

## 历史小故事（可跳过）

- **2016**：Alan Nichol 和 Alex Weidauer 在柏林创立 Rasa；最早只有 NLU 一个库
- **2017**：发布 Rasa Core，把 NLU 和对话管理拼成完整框架
- **2020**：DIET 模型论文 + 2.0 大版本，奠定到今天的核心架构
- **2023**：推出 Rasa Pro CALM（Conversational AI with Language Models），让 LLM 接管"理解"，规则系统接管"动作"——**用 LLM 听懂，用规则做事**

## 学到什么

1. **理解 + 决策分离** 是对话系统的基本架构——一个网络管"听懂"，另一个管"该说啥"
2. **Tracker 记忆** 让多轮对话稳定——纯 LLM 没这个外置状态，记忆就靠 context window
3. **YAML 训练数据** 比代码训练更适合让产品经理和工程师一起改——降低协作门槛
4. **LLM 没杀死 Rasa**：确定性 + 私有部署 + 审计是 LLM 给不了的，反而催生 CALM 这种混合方案

## 延伸阅读

- 官方 Playground（不用装就能玩）：[Rasa Playground](https://rasa.com/docs/rasa/playground)
- DIET 论文：[Bunk et al. 2020 — DIET: Lightweight Language Understanding](https://arxiv.org/abs/2004.09936)
- 教程视频：[Rasa Masterclass YouTube 系列](https://www.youtube.com/playlist?list=PL75e0qA87dlG-za8eLI6t0_Pbxafk-cxb)（12 集，从零搭一个机器人）
- 中文资料：[Rasa 官方中文文档](https://rasachatbot.com/)（社区维护）
- [[langchain-tutorial]] —— LLM 时代另一种对话编排思路
- [[transformers-attention]] —— DIET 的底层是 Transformer

## 关联

- [[langchain-tutorial]] —— LLM 编排框架，与 Rasa 是两条对话技术路线
- [[transformers-attention]] —— DIET 的网络骨架
- [[fastapi]] —— Custom Action Server 常用 FastAPI 实现
- [[spacy]] —— Rasa 早期默认的 NLU pipeline 后端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[errbot]] —— Errbot — 用 Python 类写一个能进 Slack/Discord 的聊天机器人
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API


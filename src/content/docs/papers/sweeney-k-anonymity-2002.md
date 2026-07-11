---
title: Sweeney k-Anonymity 2002 — 删除姓名还不够的匿名化基线
来源: 'Latanya Sweeney, "k-Anonymity: A Model for Protecting Privacy", International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems 2002'
日期: 2026-07-07
分类: security-privacy
难度: 初级
---

## 是什么

k-Anonymity 是一套**发布表格数据前，先让每个人藏进至少 k 个人小组里**的隐私模型。
日常类比：老师公布成绩时，不写姓名也不够安全；如果只公布“身高 181、生日 7 月 3、住某小区”的学生成绩，全班可能还是知道是谁。
k-anonymity 要求每一行的“可被外部资料对上的特征组合”，至少有 k 行长得一模一样。

论文要解决的问题很朴素：医院、银行、政府想把个人级数据交给研究者，但不能让研究者把行重新对回真人。
Sweeney 指出，**删除姓名、电话、地址只是第一步**，生日、性别、ZIP 这种普通字段组合起来，也可能像指纹。

一句话定义：如果发布表里每个准标识符组合都至少出现 k 次，这张发布表就满足 k-anonymity。
这里的“准标识符”就是那些本身不一定是姓名，但能和外部表一起把人找出来的字段。

## 为什么重要

不理解 k-anonymity，下面这些事都没法解释：

- 为什么“去掉姓名”的医疗数据，仍然能被选民登记表重新识别
- 为什么隐私保护不是只靠权限控制；数据一旦发出去，接收方能做联表分析
- 为什么匿名化要先定义“攻击者可能拿到哪些外部字段”，而不是凭感觉糊掉几列
- 为什么差分隐私出现后，k-anonymity 仍是很多数据发布规范的入门基线

这篇论文的价值在于把“看起来匿名”改成了“可以检查的表格约束”。
它不是现代隐私保护的终点，但它是很多人第一次意识到：**匿名化是数据建模问题，不是删字段问题**。

## 核心要点

1. **准标识符：外部表里的钩子**。
   类比：快递单上的姓名被涂掉了，但楼栋、手机号后四位、取件时间还能把包裹对上人。
   论文里的钩子是 ZIP、出生日期、性别；它们能把医疗表和选民表连起来。

2. **等价类：每个人要有同伴**。
   类比：你站在队伍里，别人只能看见“蓝衣服、短发、背包”，如果同样特征有 5 个人，就不能只指向你。
   k-anonymity 要求每个准标识符组合至少有 k 行，k 越大，单纯联表越难。

3. **泛化和抑制：用信息损失换模糊度**。
   类比：把“02138”改成“0213*”，把“1965-02-14”改成“1965”，细节少了，但能凑出同组。
   这就是论文相关系统 Datafly、µ-Argus、k-Similar 的基本方向：少放一点细节，换来更少再识别。

## 实践案例

### 案例 1：检查一张表是否满足 k=2

```python
rows = [
    {"race": "Black", "birth": "1965", "gender": "m", "zip": "0214*"},
    {"race": "Black", "birth": "1965", "gender": "m", "zip": "0214*"},
    {"race": "White", "birth": "1967", "gender": "m", "zip": "0213*"},
]
qi = ["race", "birth", "gender", "zip"]
groups = {}
for row in rows:
    key = tuple(row[c] for c in qi)
    groups[key] = groups.get(key, 0) + 1
print(all(count >= 2 for count in groups.values()))
```

**逐部分解释**：

- `qi` 是准标识符，论文例子里就是 Race、Birth、Gender、ZIP
- `key` 是一行在外部表里可能被匹配的组合
- 只要有一个组合出现次数小于 2，这张表就不满足 k=2

### 案例 2：把细字段泛化成粗字段

```python
def generalize(row):
    return {
        "birth": row["birth"][:4],      # 1965-02-14 -> 1965
        "zip": row["zip"][:4] + "*",   # 02138 -> 0213*
        "gender": row["gender"],
    }
```

**逐部分解释**：

- 出生日期从“天”变成“年”，会让更多人落进同一组
- ZIP 从 5 位变成前 4 位，也是在扩大人群
- 代价是研究者不能再做非常细的年龄或地理分析

### 案例 3：为什么删除姓名还会被重新识别

```sql
SELECT voter.name, medical.diagnosis
FROM medical
JOIN voter
ON medical.zip = voter.zip
AND medical.birth_date = voter.birth_date
AND medical.gender = voter.gender;
```

**逐部分解释**：

- `medical` 表没有姓名，但有 ZIP、生日、性别
- `voter` 表有姓名，也有 ZIP、生日、性别
- 两张表一连，诊断记录就可能回到具体姓名上

Sweeney 的著名演示就是这种思路：她购买 Cambridge 选民登记数据，用 ZIP、出生日期、性别把 Massachusetts GIC 医疗数据和当时州长 William Weld 对上。

## 踩过的坑

1. **以为“删姓名”就匿名**：姓名只是显式标识符，准标识符组合才是再识别攻击的主要入口。

2. **忘记外部数据会变化**：今天没有公开的表，明天可能被购买、泄露或开放；准标识符判断永远带不确定性。

3. **只做一次发布，不管后续版本**：论文专门提醒 temporal attack，后续发布如果不尊重旧版本，两个版本相减也会泄漏。

4. **把 k 当成隐私万能旋钮**：k-anonymity 主要防“身份被联表找回”，不能自动防敏感属性在组内太一致的问题。

## 适用 vs 不适用场景

**适用**：

- 发布结构化表格数据，尤其是医疗、人口、金融这类一行对应一个人的数据
- 攻击模型主要是“外部公开表 + 准标识符联表”
- 需要给业务、法务、研究者一个容易解释的匿名化最低线

**不适用**：

- 需要严格数学隐私预算的统计发布：更适合看差分隐私
- 组内敏感值高度一致的数据：即使 k=20，20 人都同一种病也会泄漏
- 文本、轨迹、图数据这类高维数据：准标识符太多，很难靠简单泛化解决
- 连续多次发布且没有版本策略的场景：容易被互相补全

## 历史小故事（可跳过）

- **1997 年**：Sweeney 在 Datafly 系统里开始处理医疗数据匿名化，问题来自真实数据共享需求。
- **2000 年**：她用美国人口普查摘要数据估计，ZIP、性别、出生日期组合能让美国大量人口近似唯一。
- **2002 年**：这篇 IJUFKS 论文正式提出 k-anonymity 模型，并把准标识符、k 次出现、配套发布策略放到一个框架里。
- **2006-2007 年**：l-diversity、t-closeness 等后续模型补上“组内敏感属性太集中”的漏洞。
- **2006 年以后**：差分隐私兴起，隐私研究重心从“发布表不容易联表”走向“查询结果对单个人不敏感”。

## 学到什么

- **匿名不是删除列，而是控制可链接性**：攻击者关心的是能不能把多张表接起来。
- **准标识符是威胁模型的一部分**：选错准标识符，k 再大也可能保护错地方。
- **隐私和可用性互相拉扯**：泛化越粗，越安全；泛化越细，数据越有用。
- **算法之外还有政策**：论文明确说合同、法律、发布流程要配套，否则模型本身会被连续发布打穿。

## 延伸阅读

- 论文 PDF：[Sweeney 2002 — k-Anonymity: A Model for Protecting Privacy](https://dataprivacylab.org/dataprivacy/projects/kanonymity/kanonymity.pdf)
- 后续算法：LeFevre, DeWitt & Ramakrishnan, "Mondrian Multidimensional K-Anonymity", ICDE 2006
- 后续模型：Machanavajjhala et al., "l-Diversity: Privacy Beyond k-Anonymity", ICDE 2007
- 后续模型：Li, Li & Venkatasubramanian, "t-Closeness: Privacy Beyond k-Anonymity and l-Diversity", ICDE 2007
- [[dwork-dp-icalp-2006]] —— 差分隐私把问题从“发布表怎么模糊”改成“输出对单个人多敏感”

## 关联

- [[dwork-dp-icalp-2006]] —— DP 是 k-anonymity 之后最重要的隐私定义路线
- [[abadi-dpsgd-2016]] —— 把差分隐私推进到深度学习训练，解决的是模型训练泄漏
- [[duchi-local-dp-2013]] —— 本地差分隐私把噪声放到用户设备上，比发布表更靠前
- [[dwork-our-data-ourselves-2006]] —— 分布式噪声回答了多方协作时怎样不暴露单个人
- [[codd-1970]] —— k-anonymity 的对象是关系表；没有关系模型，很难讲清准标识符投影
- [[saltzer-schroeder-1975]] —— 安全原则强调最小权限；本篇说明“有权限拿到数据”仍可能泄漏隐私
- [[selinux-2001]] —— SELinux 管访问控制，k-anonymity 管数据发布后的可链接性，边界不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dwork-dp-2006]] —— Dwork DP 2006 — 用相邻数据集定义隐私
- [[li-t-closeness-2007]] —— Li t-closeness 2007 — 用整体分布约束匿名分组
- [[machanavajjhala-l-diversity-2007]] —— Machanavajjhala l-Diversity 2007 — 给匿名分组补上敏感值多样性

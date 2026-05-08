---
title: AnyShare Agentic WorkFlow 最佳实践
date: 2025-05-08 10:00:00
categories:
  - 技术解读
tags:
  - AnyShare
  - 知识助手
  - Agentic WorkFlow
  - 智能体
  - 工作流
  - 最佳实践
---

# AnyShare Agentic WorkFlow 最佳实践

Agentic WorkFlow（智能体工作流）是 AnyShare 实现智能业务流的核心能力，通过将多个智能体（Agent）串联协作，配合工作流引擎实现复杂的业务场景自动化。本文以课程讲解评估场景为例，详细介绍 Agentic WorkFlow 的配置与实践方法。

## 6.3.1 课程讲解评估场景

本场景基于 Agentic WorkFlow 构建完整的智能化课程评估流程：通过对授课音频的文字转换，结合课程内容知识要点与多维评价标准，运用大模型能力实现智能化课程评估，系统最终通过邮件自动生成包含详细点评、优缺点分析和量化评分的评估报告，实现高效、精准的教学质量评估与反馈。

### 场景价值

- **自动化**：从音视频转文字到评估报告生成全程自动化处理
- **标准化**：基于统一评价标准确保评估结果的一致性
- **高效性**：相比人工评估大幅缩短评估周期
- **可追溯**：评估报告完整保留参考依据，支持后续复盘

### 6.3.1.1 课程讲解评估流程图

```
音视频上传 → 音视频转文字 → 用户 token 获取 →
→ 调用课程讲解评估 Agent → 生成评估报告 → 发送邮件通知
```

## 6.3.1.2 课程讲解评估 Agent 配置方案

课程讲解评估 Agent 是通过用户给定的课程讲解内容，从「参考答案库」中自动匹配对应的参考答案，并根据参考答案对讲解内容进行评估，最终生成评估报告。

### Agent 输入参数

| 参数 | 说明 |
|------|------|
| query | 用户问题（如：帮我生成一份课程讲解评估报告） |
| as_ctx | 传递过来的用户身份验证等信息 |
| user_doc_content | 用户输入的课程讲解内容全文 |

### 核心处理流程

**Step 1: 参考答案召回**

基于输入的文本内容，从数据源中召回候选文档集（文档切片）。

```python
# 输入：query（用户输入）
# 输出：retrievers_block_content1（召回的文档切片）

async def recall_reference_docs(query):
    # 调用文档召回 Agent
    results = await document_recall_agent(query)
    return results
```

**Step 2: 获取召回文档 object_id**

获取召回文档集中所有文档的 object_id。

```python
# 输入：retrievers_block_content1（召回的文档集）
# 输出：object_ids（召回文档的 object_id）

def main(retrievers_block_content):
    object_ids = []
    for i in retrievers_block_content["text"]:
        if i.get("retrieve_source_type") == "DOC_LIB":
            object_ids.append(i.get("meta", {})["object_id"])
            break
    return object_ids
```

**Step 3: 提取召回文档的全文**

通过上一步骤提取的文档 object_ids，获取步骤 1 中召回的文档集中文档的全文。

```python
# 输入：object_ids, as_ctx
# 输出：function_answer1（文档全文）

async def extract_full_text_of_document_recall(object_ids, as_ctx):
    max_workers = 10
    query_token_list = [(q, as_ctx["authorization"]) for q in object_ids]

    connector = aiohttp.TCPConnector(limit=max_workers, ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [call_api(session, args) for args in query_token_list]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        processed_results = {}
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                processed_results.update({query_token_list[i][0]: str(result)})
            else:
                processed_results.update(result)

        return processed_results

async def call_api(session, args):
    query, token = args
    url = 'https://anyshare.aishu.cn:8444/api/agent-factory/v2/agent/1953000801936867328'
    headers = {'Appid': 'O6UbuyEwaBVOhw5lP7-'}

    data = {"query": query, "token": token}

    async with session.post(url, json=data, headers=headers, ssl=False, timeout=60) as response:
        response_text = await response.text()
        parsed_response = parse_sse_response(response_text)
        return {query: parsed_response["answer"]["answer"]}
```

**Step 4: 重写召回文档**

将上一步骤中召回的文档全文重新写入步骤 1 的召回结果中。

```python
# 输入：full_text_data, retrievers_block_content1
# 输出：retrievers_block_content（包含全文信息的召回结果）

def rewrite_recalled_doc(full_text_data, retrievers_block_content):
    for index, i in enumerate(retrievers_block_content["text"]):
        if i.get("retrieve_source_type") == "DOC_LIB":
            retrievers_block_content["text"][index]["content"] = \
                full_text_data[i.get("meta", {})["object_id"]]
    return retrievers_block_content
```

**Step 5: 自动匹配参考答案**

基于用户输入的课程讲解内容，自动从所有召回结果中匹配最相关的文档作为课程讲解评估的参考答案。

```python
/prompt/
# 角色及适用场景
你是一个高度专业化的文档检索与匹配专家。你的唯一任务是分析用户上传的文档，并精准地找出内容最相关、主题最匹配的文档。

# 任务指令
从以下文档中选择符合要求的文档

待选择文档：{{retrievers_block_content}}
用户问题：{{query}}
参考内容：{{user_doc_content}}

回答要求：
1、解析参考文档：全面理解用户文档的核心主题、关键论点、涉及的具体实体（如产品名称、地点、技术术语）、文档名称等信息。
2、从待选择文档中推荐与参考内容相匹配最合适的文档，如果待选择文档中没有文档，则输出"未找到参考答案"
3、推荐文档的排序按照版本排序，版本越新，越靠前。
4、创建时间显示格式按照 年-月-日 时:分:秒
5、如果匹配到多个文档，则仅输出一个最相关的文档。
6、输出文档名和文档全文，结尾不要出现除推荐文档名和正文之外的不相关的文字和字符。

回答格式：
文档名：xxxxx
文档正文：xxxxx
```

**Step 6: 生成课程讲解评估报告**

根据用户输入的课程讲解内容与参考答案，生成专业的评估报告。

```python
/prompt/
# 角色及适用场景
你是一位经验丰富的教育学专家和资深课程评审员。你的任务是对比分析用户上传的文档和标准的参考答案，并从内容完整性、表达逻辑性、教学有效性等维度进行专业、公正的评估，最终生成一份内容翔实、具有建设性的评估报告，以 html 格式呈现。

# 任务指令
用户的参考内容：{{user_doc_content}}
标准答案：{{reference_answer}}

以标准答案{{reference_answer}}为参考依据，从以下四个核心维度对用户的参考内容{{user_doc_content}}进行逐项评估：

1、关键点覆盖度 (40分)：
   * 仔细解析参考答案中所有核心论点、关键步骤、重要概念和必备知识点。

2、语言逻辑与通顺度 (30分)：
   * 评估讲解的条理性：是否有清晰的引入、展开和总结？
   * 评估语言的流畅性：句子是否通顺？转折是否自然？
   * 评估连贯性：观点与观点之间、段落与段落之间的衔接是否平滑？

3、案例引用与实证支持 (20分)：
   * 检查用户是否使用了具体案例、事例、数据或故事来阐释抽象概念或复杂理论。
   * 评估所引用案例的相关性和有效性。

4、讲解结构与吸引力 (10分)：
   * 评估开场是否吸引人？结尾是否有总结和升华？
   * 整体节奏是否得当？语言风格是否适合目标听众？

# 综合评分与报告生成：
1、为每个维度打分（括号内为权重），并计算一个百分制的总分。
2、在报告的结尾必须标注本次评估所引用的参考答案文件名。
3、生成一份全面的评估报告，报告必须采用以下结构：
   一、总体评价
   二、分维度详细分析
   三、总结与改进建议
   四、评分汇总（表格形式）

# 输出风格要求
- 报告语言：专业、中立、鼓励式。既要指出问题，也要肯定优点。
- 反馈要求：非常具体。避免"讲得不好"这类模糊评价。
- 请严格参考标准答案来进行评估，不要随意发挥。
- 若 reference_answer 返回的答案为"未找到参考答案"，则直接输出"因未找到匹配的参考答案，无法进行有效评估。"

# 输出格式要求
- 请以 html 格式输出，不要使用 markdown 格式。
- 开头和结尾不要出现 ```html``` 这种无意义的标识。
```

## 6.3.1.3 课程讲解评估工作流配置

通过工作流，对用户上传的课程讲解视频进行语音转文字等预处理，并调用课程讲解评估 Agent 生成评估报告，最后通过邮件将评估报告发送给相关人员。

### 工作流核心处理流程

```
1. 设置工作流触发逻辑
2. 获取流程执行者的用户信息
3. 音视频转文字
4. 获取用户 token
5. 用户 token 处理
6. 生成课程讲解评估报告
7. 获取课程讲解音视频文件的信息
8. 获取课程讲解音视频文件的 ShareLink 地址
9. 生成邮件正文
10. 预处理收件人信息
11-14. 生成邮件标题
15. 发送邮件
```

### 各步骤详细说明

**1. 设置工作流触发逻辑**

选择针对所选文件触发，并配置触发范围为指定的文档库/文件夹。用户只需将课程讲解音视频上传至指定文档库/文件夹下，右键发起工作流即可开始执行。

**2. 获取流程执行者的用户信息**

获取工作流发起人的用户信息，用于后续邮件通知。

**3. 音视频转文字**

将用户上传的课程讲解音视频文件转换成文本，为后续评估提供输入内容。

**4. 获取用户 token**

获取用户 token 信息，作为后续课程讲解评估 Agent 中 as_ctx 的传入参数。

**5. 用户 token 处理**

将获取到的用户 token，转换成课程讲解评估 Agent 中 as_ctx 可以识别的参数格式。

**6. 生成课程讲解评估报告**

调用课程讲解评估 Agent 生成评估报告。

| 参数 | 说明 |
|------|------|
| user_doc_content | 步骤 3 中语音转文字的结果 |
| query | 固定输入"生成报告" |
| as_ctx | 步骤 5 中处理过的用户 token |

**7. 获取课程讲解音视频文件信息**

通过用户上传的课程讲解音视频文件的路径，获取课程的 docid 信息。

**8. 获取课程讲解音视频文件的 ShareLink 地址**

通过上一步骤中获取的 docid，获取课程音视频文件的 ShareLink 地址，供评估报告引用。

**9. 生成邮件正文**

将以下信息合并成课程讲解评估报告邮件的正文：
- 步骤 6 中生成的课程讲解评估报告
- 步骤 8 中获取的课程讲解音视频文件的 ShareLink 地址
- 步骤 7 中获取的文件名
- 步骤 1 中上传的课程讲解音视频文件路径

**10. 预处理收件人信息**

将步骤 2 中获取的流程发起者邮箱地址、和指定的邮件接收者邮箱拼接在一起，多个邮箱地址之间用英文逗号隔开。

**11-14. 生成邮件标题**

自动获取课程名称 + 用户姓名，作为邮件的标题。例如："爱数智能知识管理产品介绍 - Sherry"

邮件标题生成逻辑示例：

```python
# 分割课程讲解音视频的文件路径
# 示例路径：AnyShare://数据智能产品BG/12-2025年产品及方案讲解评估/01-爱数智能知识管理产品介绍/爱数智能知识管理产品介绍-Sherry.mp4
# 分割结果：["AnyShare://数据智能产品BG/12", "2025年产品及方案讲解评估/01", "爱数智能知识管理产品介绍/爱数智能知识管理产品介绍", "Sherry.mp4"]

# 获取课程名：从分割的文本中提取课程名称
# 课程名称存在于第三个值中，即"爱数智能知识管理产品介绍/爱数智能知识管理产品介绍"
# 以"/"为分割，取前半段"爱数智能知识管理产品介绍"作为课程名称
```

### 工作流配置要点

1. **触发条件**：配置为"上传文件时"触发，目标文件夹指向指定文档库
2. **并发处理**：音视频转文字和 Agent 调用支持异步并发，提升处理效率
3. **邮件通知**：通过邮件发送评估报告，支持自动发送给相关人员
4. **标题生成**：邮件标题自动包含课程名称和用户姓名，便于识别

## 核心概念补充（6.4 节及以后内容）

### 智能体（Data Agent）核心要素

**人设及回复逻辑**：定义智能体在对话中扮演的角色、职责、回复风格，以及技能使用规则。支持手动填写和智能生成两种配置方式。

**模型及参数**：

| 参数 | 说明 | 默认值 | 可设范围 |
|------|------|--------|----------|
| 随机性 (temperature) | 控制生成文本的随机性和创造性 | 0.0 | 0.0-2.0 |
| 采样样本 (top_p) | 动态选择概率累积超过 p 的最小词集 | 1.0 | 0.0-1.0 |
| 单词回复限制 (max_tokens) | 模型输出的 Tokens 长度上限 | 3000 | 10-32000 |
| 前K采样 (top_k) | 控制候选词数量 | 1 | 1-1000 |
| 话题新鲜度 (presence_penalty) | 控制引入新话题的倾向 | 0 | -2-2 |
| 频率惩罚度 (frequency_penalty) | 降低高频词汇重复出现 | 0 | -1-2 |

### 工具（Tool）

工具是被设计用于执行特定任务或有限功能的被动资源/器具，本身不具备自主决策能力，必须在 Agent 或用户创建的智能体（Data Agent）调用时，才会执行预设的明确操作。

### 技能编排模板

从 AnyShare 7.0.6.4 版本开始，每个创建的智能体都采用技能编排模板。这代表每个智能体都有一个主控 Agent 负责协调所有其他 Agent，整合最终结果并返回。

## 总结

Agentic WorkFlow 通过将多个 Agent 与工作流引擎结合，能够实现复杂的业务场景自动化。课程讲解评估场景展示了完整的实现路径：

1. **流程编排**：通过工作流串联各个处理环节，实现自动化
2. **Agent 协作**：多个 Agent 分工协作，各司其职
3. **智能评估**：基于大模型实现标准化的课程评估
4. **自动通知**：评估完成后自动发送邮件通知相关人员

在实际应用中，可根据业务需求调整 Agent 配置和工作流逻辑，实现各种复杂的智能业务流程。

---

**参考来源**：[AnyShare Family 7 知识助手技术原理解读及最佳实践 - 第6章 最佳实践](https://www.aishu.cn)
---
title: AnyShare 问答智能体最佳实践
date: 2025-05-08 10:00:00
categories:
  - 最佳实践
tags:
  - AnyShare
  - QA Agent
  - 智能问答
  - RAG
  - 问答
  - RAG
  - 最佳实践
---

# AnyShare 问答智能体最佳实践

AnyShare 问答智能体是基于检索增强生成（RAG）技术构建的智能问答系统，通过结合企业私域知识库与大语言模型能力，实现精准、可解释的知识问答服务。本文将从工作流程、FAQ匹配、文档检索、Agent配置、性能优化等方面，详细介绍问答智能体的最佳实践。

## 6.1.1 工作流程

问答智能体的核心工作流程涵盖从用户 query 输入到最终答案输出的完整链路。系统通过多模块协同，实现高效准确的智能问答。

**整体流程架构：**

1. **Query 预处理**：接收用户问题，进行意图识别与关键词提取
2. **知识召回**：基于向量检索与关键词检索双路召回，获取候选文档切片
3. **重排序处理**：通过 Rerank 模型对召回结果进行相关性排序
4. **答案生成**：将排序后的文档切片作为上下文，输入大语言模型生成最终答案
5. **结果输出**：返回答案及对应的文档来源信息

```
用户 query → 预处理 → 向量检索 + 关键词检索 → 结果融合 → Rerank 重排 → LLM 生成 → 答案输出
```

**关键技术要点：**

- **混合检索策略**：结合稀疏检索（关键词匹配）与稠密检索（语义向量），兼顾召回率与精准度
- **切片上下文扩展**：根据召回切片的前后相邻切片补充上下文信息，提升答案完整性
- **流式输出优化**：调整 LLM 块输出模式，避免阻塞实现实时流式返回

## 6.1.2 FAQ 匹配实现和调优

FAQ 匹配是问答智能体的核心能力之一，通过结构化的问题答案对实现精准匹配。

### FAQ 匹配原理

FAQ 匹配基于相似度计算实现：系统将用户问题与 FAQ 库中的问题进行匹配，计算语义相似度并返回最匹配的答案。

### FAQ 配置流程

1. **FAQ 库构建**：整理业务场景中的常见问题与标准答案
2. **问题向量化**：将 FAQ 问题通过 Embedding 模型转换为向量表示
3. **相似度匹配**：用户 query 向量化后与 FAQ 向量库进行相似度计算
4. **阈值过滤**：设置相似度阈值，过滤低匹配度结果

### 调优策略

**同义词扩展**：将用户 query 中的同义词进行替换扩展，提升召回覆盖率。

```python
# 同义词查询函数异步化优化示例
async def synonym_query_async(query):
    synonyms = await get_synonyms(query)
    expanded_query = query + " " + " ".join(synonyms)
    return expanded_query
```

**答案提取优化**：对 FAQ 匹配中的正文答案提取函数进行异步化重构，避免 I/O 阻塞。

**匹配阈值调整**：根据业务场景调整相似度阈值平衡精准度与召回率。

## 6.1.3 文档检索实现和调优

文档检索是问答智能体的另一核心能力，通过从文档库中召回相关文档切片为 LLM 提供问答依据。

### 文档检索流程

1. **Query 向量化**：将用户问题转换为语义向量
2. **多路召回**：
   - 向量召回：通过向量相似度检索获取语义相关切片
   - 关键词召回：通过倒排索引获取字面匹配切片
3. **结果融合**：合并多路召回结果，按权重计算综合得分
4. **Rerank 重排**：对融合结果进行相关性重排序
5. **上下文补充**：根据需要补充相邻切片上下文信息

### 关键配置参数

| 参数 | 说明 | 建议值 |
|------|------|--------|
| top_n | 召回切片数量上限 | 50 |
| dense_min_score | 向量召回分数阈值 | 根据实际效果调整 |
| sparse_min_score | 关键词召回分数阈值 | 根据实际效果调整 |
| min_score | Rerank 后最终分数阈值 | 0.2 |
| slice_max_num | 最后使用的最大切片数量 | 30 |
| before_slice_num | 向前召回的切片数 | 1 |
| after_slice_num | 向后召回的切片数 | 1 |

### 切片召回实现

```python
async def f1_main(as_ctx: dict, query: str, query_slices: list) -> Union[list, str]:
    """
    关键字向量双路召回+权重过滤
    1. 获取query向量
    2. 带向量和关键字调用slice-search
    3. 按权重过滤
    4. 仅保留文本，去除无关信息
    """
    # 获取query向量
    embeddings = await embedding(query)

    # 构建搜索请求
    data = {
        "limit": top_n,
        "text": query,
        "embedding": embeddings,
        "ranges": ranges,
        "item_output_type": ["doc"],
    }

    # 执行切片搜索
    search_res = await slice_search(data)

    # 获取稠密和稀疏结果
    dense_results = search_res["doc"].get("dense_results", [])
    sparse_results = search_res["doc"].get("sparse_results", [])

    # 融合结果
    res = merge_result(dense_results, sparse_results)

    return res
```

### 上下文补充策略

```python
async def f3_main(as_ctx: dict, slices: list) -> Union[list, str]:
    """
    补充切片上下文（调用大模型前最后一个节点）
    1. 计算上下文切片数量
    2. 调用 slicefetch
    3. 组装大模型文本
    """
    if not slices:
        return ""

    slices.sort(key=lambda x: x["score"], reverse=True)

    # 如果切片数量足够，直接使用
    if len(slices) >= slice_max_num:
        return gen_llm_content(slices[:slice_max_num], [])

    # 计算需要补充的上下文数量
    diff = slice_max_num - len(slices)
    add_num_per_slice = before_slice_num + after_slice_num

    if add_num_per_slice == 0:
        return gen_llm_content(slices, [])

    add_num = int(diff / add_num_per_slice)

    # 调用 slicefetch 获取上下文
    data = {
        "index": "anyshare_bot",
        "doc_info": [
            {
                "docid": x["belong_doc_id"],
                "segmentid": x["segment_id"],
                "before_step": before_slice_num,
                "after_step": after_slice_num,
            }
            for x in slices[:add_num]
        ],
    }

    fetch_res = await slice_fetch(data)
    content_slices = fetch_res.get("result", [])

    return gen_llm_content(slices, content_slices)
```

## 6.1.4 Agent 输入输出规范

在 AnyShare 智能体配置中，Agent 的输入输出需遵循规范格式以确保正确显示和交互。

### 主控 Agent 返回结构

若想在 AnyShare 智能体中正确显示主控 Agent 的返回结果，需注意其返回结构：

```python
{
    "answer": "具体答案内容",
    "source_docs": ["文档1", "文档2"]  # 可选的来源信息
}
```

### 技能 Agent 返回结构

技能 Agent 被主控 Agent 调用以协助完成特定任务，其返回结构需与主控 Agent 的预期格式一致：

```python
{
    "result": "技能执行结果",
    "status": "success"  # 或 "failed"
}
```

## 6.1.5 功能场景配置实现

### 场景分类配置

根据业务需求，可配置不同类型的问答场景：

1. **通用问答**：覆盖各类常见问题的智能问答
2. **专业领域问答**：针对特定业务领域的深度问答
3. **FAQ 匹配问答**：基于结构化问题答案对的精准匹配

### 主题域过滤 Agent

对于需要区分业务主题的场景，可配置主题域过滤 Agent：

```python
async def theme_filter_agent(query, as_ctx, query_slices):
    """
    根据主题域关键词过滤召回文档
    """
    res = []
    for v in query_slices:
        has = True
        for vv in theme_keywords:
            if vv not in v["belong_doc_path"]:
                has = False
                break
        if has:
            res.append(v)

    return res
```

### 反问策略

当无法确定用户意图时，智能体可主动反问澄清：

```python
# 根据有无关键词进行反问
if not has_clear_intent:
    ask_user_clarify()  # 简短礼貌地反问用户，让用户说明具体场景
```

## 6.1.6 智能体性能优化实践

### 同步函数异步化

为提升系统并发处理能力，对关键函数进行异步化改造：

**同义词查询函数优化**：

```python
# 修改之前（同步）
def get_synonyms(query):
    # 同步调用
    return synonyms

# 修改之后（异步）
async def get_synonyms_async(query):
    # 异步调用
    return await async_get_synonyms(query)
```

**FAQ 答案提取函数优化**：

```python
# 修改之前（同步）
def extract_answer_from_faq(faq_content):
    return answer

# 修改之后（异步）
async def extract_answer_from_faq_async(faq_content):
    return await async_extract(faq_content)
```

### LLM 块输出模式优化

**文档检索 LLM 块优化**：从专家模式调整为 Basic 模式，支持答案内容的实时流式返回。

```python
# 修改之前：专家模式
LLM_Expert_Block: config={"mode": "expert"}

# 修改之后：Basic 模式（支持流式输出）
LLM_Basic_Block: config={"mode": "basic"}
```

### 流式输出阻塞问题解决

LLM 块后的函数会等待 LLM 块执行完毕后才会进行执行，这将阻塞 LLM 块的流式返回。务必去除此类函数块以确保流畅的用户体验。

**问题场景**：在 LLM 块之后配置了同步函数，导致流式输出被阻塞。

**解决方案**：移除 LLM 块后的阻塞性函数，或将其移至异步处理流程中。

## 总结

问答智能体的最佳实践涵盖从工作流程设计到性能优化的完整环节。通过合理的 FAQ 匹配策略、文档检索调优、规范的 Agent 配置以及性能优化措施，可以构建高效、准确的智能问答系统。在实际应用中，需根据业务场景特点灵活调整各项参数，持续迭代优化以提升用户体验。

---

**参考来源**：[AnyShare Family 7 知识助手技术原理解读及最佳实践 - 第6章 最佳实践](https://www.aishu.cn)
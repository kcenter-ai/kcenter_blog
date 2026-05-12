---
title: AnyShare 图谱增强（Graph RAG）问答最佳实践
date: 2025-05-08 10:00:00
categories:
  - 最佳实践
tags:
  - AnyShare
  - Graph RAG
  - 知识图谱
  - RAG
  - 召回
  - 知识图谱
  - 最佳实践
---

# AnyShare 图谱增强（Graph RAG）问答最佳实践

图谱增强型（Graph Retrieval-Augmented Generation）知识问答是一种结合知识图谱结构化知识与文档切片精准检索的智能问答方案。该技术通过图谱关系召回候选文档集，并基于文档内容进行切片级检索，从而为复杂查询提供更精准、可靠的答案。

## 6.2.1 图谱增强问答流程

### 整体流程架构

图谱增强问答包含前期知识化准备工作与在线问答增强流程两个阶段：

**前期知识化准备工作：**
1. 对文档进行元数据处理
2. 构建文档图谱
3. 自动提取文档编目和标签
4. 内容索引和向量化

**在线问答增强流程：**
1. 利用知识图谱召回候选文档集，对拼接后的文档编目和标签重排打分
2. 取得分 Top N（可自定义 N 的大小数量）相关文档，交由大模型组织并返回答案
3. 在返回答案中明确标注回答的参考来源（文档）

```
文档上传 → 元数据处理 → 图谱构建 → 编目/标签提取 → 向量化索引
                                      ↓
用户 query → 图谱召回候选文档 → 文档范围确定 → 精准切片检索 → 特征融合重排 → LLM 答案生成 → 返回答案及来源
```

### 效果评估体系

Benchmark 是一套可衡量问答准确度的标准数据集，能够支持多维度评价指标的统计和分析，系统基于此评估机制保障问答质量。

## 6.2.2 自动构建文档图谱

自动构建文档图谱是图谱增强问答的基础，通过工作流机制实现文档上传时自动提取编目和标签并写入图谱。

### 6.2.2.1 数据准备

为确保图谱构建流程顺利进行，请保持文档库名称、编目模板名称和图谱名称的一致性。

**创建文档库：**
进入 AnyShare 管理控制台 > 组织管理 > 文档管理 > 自定义文档库，创建文档库。

**创建编目模板：**
进入 AnyShare 管理控制台 > 安全管理 > 文档策略 > 文档编目策略，点击【+新建编目模版】进行创建配置。

> 提示：在添加属性时，需在属性说明中清晰描述属性含义，便于模型准确理解语义。

**创建图谱：**
进入 AnyDATA 知识网络 > 知识图谱，点击导入按钮，导入"图谱.json文件"。

> 注意：修改名称与文档库名称保持一致。

### 6.2.2.2 工具箱导入函数

进入 AnyDATA 智能体工厂 > 工具箱 > 导入，将以下三个 yaml 文件导入到工具箱，导入前需修改每个 yaml 文件中 servers URL 的 IP 地址：

1. **编目.yaml**：编目信息提取相关函数
2. **opendoc.yaml**：文档打开相关函数
3. **graph_data.yaml**：图谱数据写入相关函数

### 6.2.2.3 创建自动提取文档编目和标签 Agent

**Agent 1: get_fulltext_agent**

获取文档全文内容，用于后续编目和标签提取。

**Agent 2: get_catalog_templates_agent**

获取编目模板列表，为编目提取提供模板信息。

**Agent 3: catalog_agent**

核心编目提取 Agent，根据文档内容与编目模板提取编目信息：

```python
/prompt/
请根据下面的文本内容提取编目关键信息，编目的key值包括$catalog_names。
编目的key值的解释如下:
$catalog_desc
输入内容：
$full_text
只提取关键内容$catalog_names, 不要生成任何解释！
返回结果按照格式按照$catalog_keys返回
编目提取内容：
-> llm_answer
```

**Agent 4: labels_agent**

标签提取 Agent，根据文档内容生成内容主题标签：

```python
/prompt/
请根据文本内容提取内容主题标签。
文本内容：$full_text

1、生成4个内容标签。
2、响应结果格式按照列表格式返回。
3、严格按照文本内容生成标签，不生成任何解释，不胡说八道。

结果示例：
["标签1"，"标签2"，"标签3"，"标签4"]
-> labels
```

**Agent 5: write_graph**

图谱数据写入 Agent，将编目和标签信息写入知识图谱：

```python
import urllib.request
import json
import ssl
from urllib.parse import quote

payload = {}
headers = {
    'appid': 'xxx'  # 替换为对应 AnyDATA 环境的 appid
}
host = 'xx.xx.xx.xx'  # 替换为对应 AnyDATA 环境 ip

def main(graph_name):
    encoded_graph_name = quote(graph_name)
    url = f'https://{host}:8444/api/builder/v1/knw/get_graph_by_knw?name={encoded_graph_name}&knw_id=1&page=1&size=1&order=desc&rule=create'
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers=headers, method='GET')
    try:
        with urllib.request.urlopen(req, context=context) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                graph_id = data['res']['df'][0]['id']
                return graph_id
    except urllib.error.HTTPError as e:
        print(f'请求出错，状态码: {e.code}')
    except Exception as e:
        print(f'发生未知错误: {e}')
```

### 6.2.2.4 创建主控 Agent

创建主控 Agent catalog_prompt，负责协调编目和标签提取流程：

```python
# 获取文档 ID
get_docid: 将 GNS 路径转换为 doc_id

# 编目提取主逻辑
llm:
  import Agent.write_graph
  @write_graph(graph_data=$catalog_graph_data, data_type="entity", name="catalog", graph_name=$graph_name, action="upsert") -> res
  @write_graph(graph_data=$graph_edge, data_type="edge", name="catalog_2_document", graph_name=$graph_name, action="upsert") -> res_edge
  @write_graph(graph_data=$labels_graph_data, data_type="entity", name="labels", graph_name=$graph_name, action="upsert") -> res_label
  @write_graph(graph_data=$labels_graph_edge, data_type="edge", name="labels_2_document", graph_name=$graph_name, action="upsert") -> res_labels_edge
  @write_graph(graph_data=$file_data, data_type="entity", name="document", graph_name=$graph_name, action="upsert") -> res_file
```

### 6.2.2.5 创建自动删除图谱数据 Agent

当文档删除时，需要同步清理图谱中的相关数据：

```python
get_delete_graph_data:
  def main(doc_id):
      graph_data = [{
          "doc_id": doc_id
      }]
      return graph_data
```

### 6.2.2.6 创建自动构建图谱工作流

进入 AnyShare 工作中心，点击【新建】>【事件触发】创建自动构建图谱工作流。

**操作步骤：**

1. **文件动作选择**：选择"上传文件时"，目标文件夹选择数据准备阶段创建的文档库后，点击【保存】。

2. **执行操作**：选择"Python 代码执行"，主要代码逻辑如下：

```python
import re
import ast
import requests
import json
import urllib3
import urllib.request
import ssl
import time
from datetime import datetime

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 获取 AnyShare 连接信息
from aishu_anyshare_api import ApiClient

def get_info():
    token = ApiClient.get_global_access_token()
    host = ApiClient.get_global_host()
    return host, token

host, token = get_info()

# Agent 配置
agent_id = "xxx"  # 主控 agent 的 id
ad_host = "xxx"   # 修改为对应 AD 环境 ip
agent_url = f"{ad_host}/api/agent-factory/v2/agent/{agent_id}"
appId = "xxx"     # 修改为对应 AD 环境的 APPID

# 获取文件信息
def get_file_data(object_id):
    url = f"{host}/api/efast/v2/items/{object_id}/name,rev,size,security_classification,created_at,modified_at,path"
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    req = urllib.request.Request(url, headers=headers, method='GET')
    with urllib.request.urlopen(req, context=context) as response:
        return json.loads(response.read().decode('utf-8'))

# 获取文件摘要
def get_file_abstract(object_id):
    url = f"{host}/api/open-doc/v1/subdoc/abstract"
    data = {
        "doc_id": object_id,
        "version": "",
        "format": "raw",
        "doc_md_type": "abstract"
    }
    # 异步等待完成，最长 30 分钟
    # ...

# 调用 Agent 执行图谱构建
def agent_run(gns, graph_name, file_graph_data):
    data = {
        "query": gns,
        "graph_name": graph_name,
        "file_graph_data": file_graph_data,
        "token": token,
        "_options": {"stream": False}
    }
    response = requests.post(headers=ad_header, url=agent_url, json=data, verify=False)
    return response.json()

# 写入编目
def write_catalog(catalog_content, graph_name, object_id):
    # 获取所有编目模板
    url = f"{host}/api/metadata/v1/templates"
    # ...
    # 写入编目信息

# 写入标签
def write_label(labels_content, object_id):
    url = f"{host}/api/metadata/v1/item/{object_id}/tag"
    # ...

def main(file_gns, file_path):
    graph_name = file_path.split('/')[0]
    object_id = file_gns.split('/')[-1]

    # 获取文件信息
    file_data = get_file_data(object_id)
    file_abstract = get_file_abstract(object_id)
    file_graph_data = get_file_graph_data(file_data)
    file_graph_data['abstract'] = file_abstract

    # 调用 Agent
    res = agent_run(file_gns, graph_name, file_graph_data)

    # 写入编目和标签
    catalog_content = res['res']['answer']['answer']['catalog_content']
    # ... 写入编目

    labels_content = res['res']['answer']['answer']['labels_content']
    # ... 写入标签
```

## 6.2.3 图谱召回 Agent 配置方案

图谱召回 Agent 是通过结构化知识图谱召回候选文档集，并在指定文档集范围内召回与问题相关文档切片的核心模块。

### 核心处理流程

**1. 图谱引导召回**

基于文档、编目和自定义标签集三类实体类型，从知识图谱中召回候选文档集合。

```python
import aiohttp
import json
import asyncio
import numpy as np
from urllib import request, parse
import ssl

context = ssl._create_unverified_context()
as_token = ""
server = "https://IP地址"  # Anyshare 服务器地址，需要配置
min_score = -5.0
max_gns_num = 10

def main(graph_retivers, as_ctx):
    global as_token
    as_token = as_ctx.get("authorization", "")

    object_ids = []
    gns_list = set()
    gns_catalog = {}

    for item in graph_retivers:
        score = item.get("score", 0)
        content = item.get("content", "")
        if 'meta' in item and 'sub_graph' in item['meta']:
            nodes = item['meta']['sub_graph']['nodes']
            for node in nodes:
                if 'properties' in node:
                    for prop_group in node['properties']:
                        if 'props' in prop_group:
                            for prop in prop_group['props']:
                                if prop['name'] == 'doc_id':
                                    object_id = prop['value']
        if object_id:
            if object_id not in object_ids:
                object_ids.append(object_id)
            if object_id not in gns_list and len(gns_list) <= max_gns_num:
                gns = get_doc_gns(object_id).get("doc_id", "")
                if gns:
                    gns_list.add(gns)
                    gns_catalog[gns] = content

    return {"nums": (len(object_ids), len(gns_list)),
            "object_ids": object_ids,
            "gns_list": list(gns_list),
            "gns_catalog": gns_catalog}
```

**2. 文档范围确定**

根据召回的候选文档集内容获取对应的文档 GNS 范围列表。

```python
def get_doc_gns(object_id):
    fields = 'doc_id'
    headers = {"Content-Type": "application/json",
               "Authorization": f"Bearer {as_token}"}
    url = f"{server}/api/efast/v2/items/{object_id}/{fields}"
    req = request.Request(url, headers=headers, method='GET')
    with request.urlopen(req, context=context) as response:
        return json.loads(response.read().decode('utf-8'))
```

**3. 精准切片检索**

在指定的文档 GNS 列表范围内，根据用户查询召回相关文档段落（切片）。

```python
async def main(query, gns_list, as_ctx):
    global as_token
    as_token = as_ctx.get("authorization", "")
    if len(gns_list) < 1:
        raise Exception("文档范围列表为空，无法召回内容")

    embeddings = await embedding(query)

    data = {
        "limit": top_n,
        "text": query,
        "embedding": embeddings,
        "ranges": gns_list,
        "item_output_type": ["doc"]
    }

    retrival_res = await slice_search(data)

    # 去重并排序
    sorted_retrival_res = deduplicate_by_highest_score(
        retrival_res['doc']['sparse_results'] + retrival_res['doc']['dense_results']
    )

    return sorted_retrival_res[:max_slices] if len(sorted_retrival_res) > max_slices else sorted_retrival_res
```

**4. 特征融合重排**

将召回的文档段落（切片）与对应编目、自定义标签信息拼接，通过重排算法获取 Top N 个最相关段落（切片）。

```python
async def main(query, retrival_res, gns_catalog):
    _source = []
    doc_ids = []
    concat_results = []

    for item in retrival_res:
        content = item.get("raw_text", "")
        doc_id = item.get("belong_doc_id", "")
        doc_name = item.get("belong_doc_name", "") + item.get("belong_doc_ext_type", "")
        concat_results.append({
            "doc_id": doc_id,
            "doc_name": doc_name,
            "doc_content": content,
            "score": round(item['score'], 2)
        })

        if doc_id and doc_id not in doc_ids:
            new_item = {
                "content": "",
                "meta": {
                    "ext_type": item.get("belong_doc_ext_type", ""),
                    "doc_id": doc_id,
                    "doc_name": doc_name,
                    "doc_path": item.get("belong_doc_path", ""),
                    "parent_path": item.get("belong_doc_parent_path", ""),
                    "doc_lib_type": item.get("doc_lib_type", ""),
                    "type": item.get("type", "document"),
                    "size": item.get("belong_doc_size", 0),
                    "object_id": item.get("belong_doc_id", "").split('/')[-1],
                },
                "retrieve_source_type": "DOC_LIB",
                "score": 0
            }
            doc_ids.append(doc_id)
            _source.append(new_item)

    # 参与重排的文档 content 和文档编目-标签内容拼接
    rerank_texts = [content['doc_content'] + gns_catalog.get(content['doc_id'])
                    for content in concat_results]

    # 调用 rerank 服务
    scores = await ado_rerank(query, rerank_texts)

    # 按分数降序排序
    sorted_zipped = sorted(zip(scores, concat_results), key=lambda x: x[0], reverse=True)
    for score, d in sorted_zipped:
        d['rerank_score'] = round(score, 2)

    return {"nums": (len(retrival_res), len(accuracy_ranked_data), len(_source)),
            "accuracy_ranked_data": accuracy_ranked_data,
            "data_source_answer": data_source_answer}
```

## 6.2.4 图谱增强问答功能场景配置

### 效果展示

智能体作为部署在 AnyShare 知识助手内的智能问答助手，是图谱增强问答功能的主要对话入口。

### 主控 Agent 配置方法

**1. 图谱召回执行**

调用图谱召回 Agent 完成文档段落（切片）召回，返回若干文档段落（切片），提供给大模型进一步问答。

**2. 答案组织生成**

基于用户查询，由大模型从召回的文档段落（切片）中匹配并组织最佳答案：

```python
/prompt/
# 角色及适用场景
你是一位专业的 RAG 文档问答助手，经验丰富、专业权威的文档专家，能够运用深厚的专业知识和丰富的实践经验，高效精准地解决各类文档相关的复杂问题。

请根据要求回答用户问题，如用户问题不明确，请返回相应提示。不知道答案时，请回复"抱歉，您的问题我暂时无法处理。"

# 任务指令
根据参考文档列表回答问题，每个文档对象中包括文档ID,文档名和文档段落和 rerank 重排打分。

问题: $query
参考文档列表: $llm_rerank_answer["rerank_res"]["answer"]["answer"]["accuracy_ranked_data"]

回答需满足要求:
1、第一步先回答引用参考文档的名称。
2、然后请一步一步的思考来回答问题。
3、只能根据相关的检索结果或者知识回答，禁止编造。
4、如果没有相关结果，请回答"抱歉，在您有权限的数据中并没有找到此问题的答案。"
5、这个问题对我至关重要，请认真作答。
6、建议用参考文档的原文描述回答，但不适合所有问题。

无须任何解释，直接 markdown 的格式返回答案
-> tool_answer
```

**3. 相似问题扩展**

利用大模型生成与该用户提问相关的相似问题及对应答案，丰富问答体验：

```python
/prompt/
**角色及适用场景：**
你是一个经验丰富、专业权威的文档专家，能够运用深厚的专业知识和丰富的实践经验，高效精准地解决各类文档相关的复杂问题。

**任务指令：**
请根据原始用户问题和上下文信息，更进一步的生成3个问题和答案对。所生成的3个问题与原始用户问题呈递进关系，3个问题之间则相互独立，用户可以使用这些问题深入挖掘上下文中的话题。

原始用户问题为：$query
参考信息为：$llm_rerank_answer["rerank_res"]["answer"]["answer"]["data_source_answer"]

**要求：**
1. 根据上下文信息生成问题答案对，禁止推测；若上下文信息为空，则直接返回空。
2. 生成的问题不要和原始用户问题重复。
3. 确保生成的问题主谓宾完整，长度不超过 25 个字。
4. 输出格式为：
   问题1:
   答案1:
   问题2:
   答案2:
   问题3:
   答案3:
5. 不要输出多余的内容。

原始用户问题：$query
你的回答：
-> relqs_answer
```

**4. 结果格式标准化**

处理成智能体主控所需的标准化问答格式，包含答案内容及对应来源信息：

```python
def main(res_result, llm_rerank_answer, llm_relqs_answer):
    data_source_answer = llm_rerank_answer["rerank_res"]["answer"]["answer"]["data_source_answer"]
    res_result_text = res_result["tool_answer"]["answer"]
    llm_relqs_answer_content = llm_relqs_answer["relqs_answer"]

    return {
        "data_source_answer": {
            "block_answer": {
                "llm_answer": {"answer": res_result_text},
                "llm_relqs_answer": llm_relqs_answer_content,
                "retrievers_block_content": data_source_answer["block_answer"]["retrievers_block_content"]
            }
        }
    }
```

## 总结

图谱增强问答通过结合知识图谱的结构化知识与文档切片的精准检索，实现了比传统 RAG 更精准、更可解释的智能问答体验。关键要点包括：

1. **自动图谱构建**：通过工作流实现文档上传时自动提取编目和标签，实时更新图谱
2. **图谱引导召回**：利用图谱关系快速定位候选文档集，提升召回效率
3. **精准切片检索**：在确定范围内进行切片级检索，确保答案精准度
4. **特征融合重排**：将文档内容与编目标签拼接后重排，进一步提升相关性

在实际应用中，需注意文档库、编目模板、图谱三者的命名一致性，并根据业务场景调整召回参数与重排策略。

---

**参考来源**：[AnyShare Family 7 知识助手技术原理解读及最佳实践 - 第6章 最佳实践](https://www.aishu.cn)
---
title: ChatFlow 用户配置使用指南
date: 2026-04-14
categories:
  - 技术文档
tags:
  - Chatflow
  - 工作流
  - 知识助手
description: ChatFlow是一种面向对话场景的工作流编排模式，专为需要多步逻辑处理的交互式应用设计。通过工作流与知识助手的结合，实现复杂的对话智能体编排能力。
---

# ChatFlow 用户配置使用指南

## 功能背景

1. 在As和Ad的bot/agent创建和使用过程中，一些复杂的场景，Dolphin不支持 if else类型的agent，也不好做一些复杂的agent。  在社区的产品中，dify,coze, n8n等产品，都有利用工作流的方式，来解决复杂场景中agent的编排。故我们将利用现在的工作流来补充这一部分。我们通过现有的【工作流】+【知识助手】两个模块来实现chatflow场景


## 名词解释：Chatflow
对话流是一种面向对话场景的工作流编排模式，专为需要多步逻辑处理的交互式应用设计。
在知识助手中通过用户问答的方式，来调用工作中心配置的工作流，叫做Chatflow类型。

## 环境部署要求
需要Sailor模块和工作中心模块

## 如何创建chatflow对话流智能体

### 1. 创建chatflow对话工作流

登录客户端进入工作中心——**我的流程**页面，选择触发类型**对话流触发**点击，页面如下：
![alt text](/kcenter_blog/assets/chatflow/image.png)
![alt text](/kcenter_blog/assets/chatflow/image-1.png)

对话流创建页面点击**确定**添加触发器成功
![alt text](/kcenter_blog/assets/chatflow/image-2.png)

节点添加执行操作(**基于工作流内置RAG节点**进行操作)，先添加**召回节点**
![alt text](/kcenter_blog/assets/chatflow/image-3.png)
![alt text](/kcenter_blog/assets/chatflow/image-6.png)

填写**召回节点**详细设置信息
![alt text](/kcenter_blog/assets/chatflow/image-7.png)
![alt text](/kcenter_blog/assets/chatflow/image-8.png)

点击**确定**按钮添加**召回节点**成功
![alt text](/kcenter_blog/assets/chatflow/image-9.png)

再次添加操作节点**大模型节点**
![alt text](/kcenter_blog/assets/chatflow/image-10.png)
![alt text](/kcenter_blog/assets/chatflow/image-11.png)
填写**大模型节点**详细设置，其中base_url和apikey为模型的API访问地址和密钥，此处以deepseek为示例
![alt text](/kcenter_blog/assets/chatflow/image-12.png)
填写完成节点信息后保存工作流
![alt text](/kcenter_blog/assets/chatflow/image-13.png)

**至此chatflow对话工作流创建成功**

### 2.创建chatflow对话流智能体
进入智能体创建页面,创建智能体，智能体模式选择**对话流创建**
![alt text](/kcenter_blog/assets/chatflow/image-14.png)
填写对话流智能体信息，保存智能体
![alt text](/kcenter_blog/assets/chatflow/image-15.png)

### 3.使用对话流智能体进行问答
输入query和临时区文件
![alt text](/kcenter_blog/assets/chatflow/image-16.png)

查看chatflow工作流任务运行结果
![alt text](/kcenter_blog/assets/chatflow/image-17.png)

查看智能体对话输出(**智能体的问答输出结果来源于智能体绑定的工作流的最后一个大模型节点的输出结果**)
![alt text](/kcenter_blog/assets/chatflow/image-18.png)

## 用户自定义节点实现大模型召回和编排能力
文档中示例的节点为当前内置的示例RAG节点，用户可根据自身需求，创建工作流自定义节点实现大模型的召回和编排能力，最后再和智能体相结合使用。

用户可以使用内置的召回节点，或者参考召回节点的代码，实现自己的召回操作。
用户可以通过添加python节点进行额外自定义步骤操作。但是chatflow暂时只支持最后一个节点按照OpenAI的LLM对话的方式进行返回，其他格式暂不支持，请务必按照此步骤操作，且chatflow暂不支持流式返回。

两个内置节点代码如下：

### 1.Retrieval召回节点

```python
import requests
import json
import urllib3
from typing import List, Dict, Any
import logging

logging.basicConfig(level=logging.INFO)

requests.packages.urllib3.disable_warnings()
from aishu_anyshare_api import ApiClient
token = ApiClient.get_global_access_token()
host = ApiClient.get_global_host()

retrieval_url = "/api/intelli-search/v1/mf/retrieval"

DEFAULT_TOP_K = 10
DEFAULT_SCORE_THRESHOLD = 0.1
DEFAULT_TIMEOUT_TIMEOUT = 30000

def retrieval(query, source_ranges, history, lib_ranges, top_k=DEFAULT_TOP_K, score_threshold=DEFAULT_SCORE_THRESHOLD, timeout=DEFAULT_TIMEOUT_TIMEOUT):
    if not query:
        return []
    params = build_recall_params(query, source_ranges, lib_ranges, top_k, score_threshold, timeout)
    logging.info(f"召回参数: {params}")
    if not params:
        logging.error("召回参数为空")
        return []
    records = _retrieval(params)
    logging.info(f"召回结果: {records}")
    all_records = _deduplicate_and_sort(records)
    logging.info(f"去重排序后结果: {all_records}")
    return all_records

def build_recall_params(query, source_ranges, lib_ranges, top_k, score_threshold, timeout=DEFAULT_TIMEOUT_TIMEOUT):
    doc_params = {"top_k": top_k, "score_threshold": score_threshold, "ids": [], "ranges": [], "search_method": "vector_search", "weight_filters": []}
    wiki_params = {"top_k": top_k, "score_threshold": score_threshold, "ranges": [], "ids": [], "search_method": "hybrid_search", "weight_filters": []}
    faq_params = {"top_k": top_k, "score_threshold": score_threshold, "ranges": [], "id": [], "search_method": "hybrid_search", "weight_filters": [], "item_output_detail": {"field": "content"}}

    for source in source_ranges:
        id = source.get("id")
        if source.get("type") == "doc":
            if id and id not in doc_params["ranges"]:
                doc_params["ranges"].append(id)
        elif source.get("type") == "wiki":
            if id and id not in wiki_params["ids"]:
                wiki_params["ids"].append(id)
        elif source.get("type") == "faq":
            if id and id not in faq_params["id"]:
                faq_params["id"].append(id)

    params = {"text": query, "doc": doc_params, "wiki": wiki_params, "faq": faq_params, "timeout": timeout}
    return params

def _retrieval(params):
    url = f"{host}{retrieval_url}"
    try:
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        logging.info(f"请求URL: {url}")
        response = requests.post(url=url, json=params, headers=headers, timeout=DEFAULT_TIMEOUT_TIMEOUT, verify=False)
        logging.info(f"响应状态码: {response.status_code}, body={response.text}")
        if response.ok:
            try:
                result = response.json()
                return result.get("records", [])
            except json.JSONDecodeError:
                logging.error(f"JSON解析失败: {response.text}")
                return []
        else:
            logging.error(f"请求失败: status={response.status_code}, body={response.text}")
            return []
    except requests.exceptions.RequestException:
        import traceback; traceback.print_exc()
        return []

def _deduplicate_and_sort(records):
    seen = {}
    for record in records:
        record_id = record.get("id")
        if record_id and record_id not in seen:
            seen[record_id] = record
        elif record_id:
            existing = seen.get(record_id)
            if existing and record.get("score", 0) > existing.get("score", 0):
                seen[record_id] = record
    unique_records = list(seen.values())
    unique_records.sort(key=lambda x: x.get("score", 0), reverse=True)
    return unique_records

def main(query, source_ranges, history, lib_ranges):
    result = retrieval(query=query, source_ranges=source_ranges, history=history, lib_ranges=lib_ranges)
    logging.info(f"召回结果: {result}")
    rst = ""
    for record in result:
        rst += record.get("content", " ")
    logging.info(f"合并后结果: {rst}")
    return rst
```



### 2.Deepseekchat大模型输出节点


```python
import requests

def chat_with_deepseek(
    query: str,
    history: list,
    rst: str,
    base_url: str,
    apikey: str
):
    """
    调用 DeepSeek API 进行对话（带参考资料）
    :param query: 用户当前问题
    :param history: 历史对话列表
    :param rst: 参考资料内容（字符串）
    :param base_url: API 地址，如 https://api.deepseek.com
    :param apikey: API Key
    :return: AI 回答内容
    """
    # 拼接接口地址
    url = f"{base_url.rstrip('/')}/chat/completions"

    headers = {
        "Authorization": f"Bearer {apikey}",
        "Content-Type": "application/json"
    }

    # 复制历史消息
    messages = history.copy()

    # ============== 关键：拼接参考资料 + 用户问题 ==============
    if rst and rst.strip():
        # 有参考资料时，把资料放进prompt
        prompt = f"参考资料：\n{rst}\n\n用户问题：{query}"
    else:
        # 无参考资料
        prompt = query

    messages.append({"role": "user", "content": prompt})

    # 请求体
    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.3,  # 参考资料建议低温度
        "max_tokens": 3000,
        "stream": False
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        result = resp.json()
        return result

    except Exception as e:
        return f"API调用失败：{str(e)}"


def main(query,history,rst,base_url,apikey):

    # 调用函数
    answer = chat_with_deepseek(query, history, rst, base_url, apikey)
    return answer


if __name__ == "__main__":
    rst = main("anyshare 是什么？",[], "anyshare 是内容管理系统", "https://api.deepseek.com/v1", "sk-28fcd933dfa24f0584b7b039c75b07b2")
    print(rst)
```
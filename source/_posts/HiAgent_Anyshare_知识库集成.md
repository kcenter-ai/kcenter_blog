---
title: HiAgent集成AnyShare知识库集成开发
date: 2026-05-12 23:40:00
categories:
  - 开放集成
tags:
  - HiAgent
  - AnyShare
  - 知识库
  - API
  - 集成
---

## 1. 文档说明

### 1.1 文档目标

本文档用于指导 HiAgent 对接 AnyShare 检索接口，实现 AnyShare 作为外挂知识库接入 HiAgent 的能力。

完成集成后，HiAgent 可通过 API 调用 AnyShare 的知识召回能力，实现：

- 基于 AnyShare 的知识检索
- AI 问答增强
- 企业知识复用与验证

---

### 1.2 适用场景

适用于以下场景：

- HiAgent 接入企业已有 AnyShare 知识体系
- 使用 AnyShare 作为统一知识源
- 验证 API 模式下的知识召回能力

---

### 1.3 当前方案说明

当前方案基于：

- HiAgent API 数据源模式 + AnyShare 提供的集成的召回接口intelli-search/v1/mf/retrieval

---

# 2. 集成架构

## 2.1 架构说明

HiAgent 通过 API 调用 AnyShare 提供的知识召回接口，实现外挂知识库接入。

整体调用流程如下：

```text
用户提问
   ↓
HiAgent
   ↓（API调用）
AnyShare Retrieval API
   ↓
返回召回结果
   ↓
HiAgent生成回答
```

---

## 2.2 AnyShare 召回接口

AnyShare 提供的接口如下：

```text
intelli-search/v1/mf/retrieval
```

该接口用于完成知识检索与内容召回。

---

# 3. 前置准备

在开始配置前，请确认以下内容已完成。

|项目|要求|
|---|---|
|AnyShare 服务|已正常部署并可访问|
|HiAgent 服务|已正常部署|
|Retrieval API|已开放访问|
|应用账户|已创建|
|长期 Token|已生成|
|文档目录权限|已授权给应用账户|

---

## 3.1 应用账户说明

示例中在AnyShare召回接口的"请求头"中配置的是AnyShare应用账号（账号类型为：令牌认证账户）的长期token

该账户需要具备：
- 检索目录访问权限
- 文档读取权限
否则可能导致召回结果为空。

---

# 4. HiAgent 配置步骤

## 4.1 新建知识库数据源

### 4.1.1 新建数据源

进入：HiAgent → 数据源管理 → 新建数据源

---

### 4.1.2 配置 AnyShare 召回接口

#### （1）请求地址配置

填写 AnyShare 召回接口地址，例如：

```text
http://{AnyShare地址}/api/intelli-search/v1/mf/retrieval
```

#### （2）请求头配置

在"请求头"中配置鉴权信息。示例：

```json
{
  "Authorization": "Bearer xxxxxxxxx",
  "Content-Type": "application/json"
}
```

说明：

| 参数            | 说明                |
| ------------- | ----------------- |
| Authorization | AnyShare 长期 Token |
| Content-Type  | 请求格式              |

![请求头配置](/kcenter_blog/assets/images/HiAgent_Anyshare/image1.png)

#### （3）目标文档库授权

在目标文档库的路径上需要授权应用账户，如：

![目标文档库授权](/kcenter_blog/assets/images/HiAgent_Anyshare/image2.png)

#### （4）请求体配置

配置请求体，其中"API接口认证配置.类型"选"无认证"，因在"请求头"中已经配置了AnyShare 的长期账户 token，这里就不需要再配置认证信息。
请求体示例：

```json
{
  "text": "路应该怎么修",
  "doc":{
	  "top_k":3,
	  "score+threshold":0.5
  },
  "timeout": 30000
}
```

![请求体配置](/kcenter_blog/assets/images/HiAgent_Anyshare/image3.png)

---

### 4.1.3 接口测试

使用页面上的"测试"测试接口是否正常。

![接口测试](/kcenter_blog/assets/images/HiAgent_Anyshare/image4.png)

满足以下条件即表示接口配置成功：
- 页面上测试结果显示"成功"
- 返回结果中包含召回数据
- 无鉴权失败信息
- 无参数格式错误

验证通过后点击："确定"，完成数据源创建。

---

## 4.2 新建知识库

### 4.2.1 知识库"基本配置"

进入知识库新建页面，在"基本配置"中，填写"知识库名称"、"知识库描述"、上传"知识库logo"等，并选择"类型"为"API接口"

![知识库基本配置](/kcenter_blog/assets/images/HiAgent_Anyshare/image5.png)

---

### 4.2.2 知识库"设置类型"

在"设置类型"中完成以下配置：

| 配置项    | 配置说明            |
| ------ | --------------- |
| 数据源    | 选择前面创建的数据源      |
| 请求参数映射 | 为数据源API请求配置参数映射 |
![设置类型](/kcenter_blog/assets/images/HiAgent_Anyshare/image6.png)

完成后点击：提交

*注意：由于 HiAgent 与 AnyShare 的参数结构可能存在差异，数据源API参数与HiAgent参数结构不兼容时，需要另外开发参数适配工具。*

---

### 4.2.3 知识库测试

知识库创建完成后，可通过 HiAgent 发起测试问题。

例如：

```text
"合同审批流程是什么？"
```

验证：

- 是否能够正常召回知识
- 是否能够生成回答
- 返回内容是否符合预期

![知识库测试](/kcenter_blog/assets/images/HiAgent_Anyshare/image7.png)

---

# 5. 常见问题（FAQ）

## 5.1 接口返回 401

请检查：

- Token 是否失效
- Authorization 格式是否正确
- 应用账户是否存在

---

## 5.2 无召回结果

请检查：

- 应用账户是否具备目录权限
- 检索目录中是否存在文档
- 文档是否已建立索引

---

## 5.3 接口测试失败

请检查：

- API 地址是否可访问
- 网络是否连通
- 请求参数格式是否正确

---

## 5.4 参数映射失败

当前 HiAgent 与 AnyShare 的参数结构可能存在差异。

复杂场景下建议增加：
- 参数转换服务
- 中间适配层
---
title: AnyShare MCP 集成开发使用指南
date: 2026-04-15
categories:
  - 集成开发
tags:
  - AnyShare
  - MCP
  - AI
  - API
description: AnyShare MCP 集成开发使用文档，面向需要把 asmcp 集成到 Agent、网关或业务系统中的开发者，提供最小可用接入步骤与联调建议。
---

# asmcp 集成开发使用文档

面向需要把 `asmcp` 集成到 Agent、网关或业务系统中的开发者，本文档提供最小可用接入步骤与联调建议。

## 0. 先看这里：Cursor `mcp.json` 调用方式（置顶）

示例（可直接参考）：

```json
{
  "mcpServers": {
    "asmcp": {
      "type": "streamableHttp",
      "url": "https://anyshare.aishu.cn/asmcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

配置 JSON 参数说明（逐项）：

- `mcpServers`：MCP 服务集合。键是服务名（你自定义），值是该服务的连接配置。
- `asmcp`：远端 `streamableHttp` 服务配置项名称，可自定义。
- `type`：连接类型。`streamableHttp` 表示通过 HTTP 流式协议连接远端 MCP 服务。
- `url`：远端 MCP 服务入口地址（线上环境使用 `https://anyshare.aishu.cn/asmcp/`）。
- `headers`：请求远端 MCP 服务时附加的 HTTP 头。
- `Authorization`：鉴权头，通常使用 `Bearer <token>` 格式。

## 1. MCP 客户端接入

### 1.1 HTTP 集成（远程）

客户端将 MCP Server URL 指向：

```text
https://anyshare.aishu.cn/asmcp
```

如果你希望每个请求使用调用方自己的 AnyShare Token，可在请求头透传：

```text
Authorization: Bearer <access_token>
```

注意：拿到新 token 后，需要及时更新到 MCP 配置的 `headers.Authorization` 中（例如 `Bearer <access_token>`）。
如果接入方是"虾"且已开启自动鉴权能力，可由其自动刷新并回填 token，无需手动改配置。

## 2. 认证与 Token 流程（推荐）

优先使用一站式登录工具：

1. 推荐：`auth_get_user_token`
  - 入参：`account`（client_id）、`password`（client_secret）、`user_id`、`scope`（可选，默认 `all`）
  - 内部自动完成：应用 token -> user assertion -> 用户 token
2. 备选：`auth_access_token_by_account`
  - 直接调用 `POST /api/authentication/v1/access_token`
  - 入参：`account`（用户账号）、`client_id`、`client_secret`
3. 需要分步排障时再使用原子工具：
  - `auth_oauth2_app_token`
  - `auth_oauth2_user_assertion`
  - `auth_oauth2_user_token`

## 3. 常用工具分组

认证：

- `auth_get_user_token`
- `auth_access_token_by_account`
- `auth_oauth2_app_token`
- `auth_oauth2_user_assertion`
- `auth_oauth2_user_token`

文档库/文件：

- `doc_lib_list`
- `doc_lib_owned`
- `doc_lib_quota`
- `doc_lib_user_quota`
- `folder_sub_objects`
- `dir_create`
- `file_osdownload`
- `file_osbeginupload`
- `file_osendupload`
- `file_upload`
- `file_convert_path`
- `file_sharedlink_realname`
- `file_sharedlink_realname_create`
- `file_share_path`
- `sharedlink_parse`

检索/问答：

- `retrieval`
- `rerank_hybrid`
- `slicefetch`
- `ecosearch_slice_search`
- `kc_search_wiki_docs`
- `intelli_all_search`
- `file_search`
- `search_both`
- `chat_send`
- `smart_assistant`

Bot 管理：

- `bot_config_v1_list`
- `bot_config_delete`
- `bot_config_publish`
- `bot_config_unpublish`
- `bot_manager_add`
- `bot_manager_delete`
- `bot_manager_list`
- `bot_transfer_by_config`
- `bot_transfer_from_user`

## 4. 联调建议

- 保证 token 签发环境与业务 API 校验环境一致（同一 `host/protocol`）。
- 先用 `auth_get_user_token`（或 `auth_access_token_by_account`）+ `doc_lib_owned` 做最小联调，再扩展复杂工具。
- 业务异常优先看 MCP 返回中的 `code/endpoint/message` 字段。
- 批量请求时建议在调用侧做超时与重试，避免单点抖动放大。

## 5. 操作截图

![](/assets/asmcp-use-step-01.jpg)
图 1：在 Cursor 中打开 `mcp.json` 配置文件，准备新增或调整 `mcpServers` 配置。

![](/assets/asmcp-use-step-02.jpg)
图 2：进入 Cursor `Settings > Tools & MCPs`，确认 `asmcp` 服务已启用，并可通过编辑按钮维护配置。

![](/assets/asmcp-use-step-03.jpg)
图 3：`mcp.json` 示例展示两种接入方式：本地启动 `asmcp`（`command/args/env`）与远程 `streamableHttp` 直连。

![](/assets/asmcp-use-step-04.jpg)
图 4：配置生效后，在 Agent 侧可看到 `asmcp` 已连接且工具列表（如 34 个工具）已成功加载。

![](/assets/asmcp-use-step-05.jpg)
图 5：在对话中调用 `auth_get_user_token` 完成认证，返回 `access_token`、`expires_in` 等关键字段用于后续 API 调用。
操作提醒：拿到新 token 后，请同步更新到 MCP 配置的 `headers.Authorization`；若接入方是"虾"且已启用自动鉴权能力，可由其自动刷新并更新 token。

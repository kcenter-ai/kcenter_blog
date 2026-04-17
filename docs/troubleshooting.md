# 问题排查与修复记录

## GitHub Pages 图片 404 问题

### 问题描述
文章中的图片在 GitHub 上无法显示，请求返回 404。

### 问题原因
图片路径错误，路径中多了一层 `kcenter_blog` 目录。

**错误路径：**
```
/kcenter_blog/assets/chatflow/image.png
```

**正确路径：**
```
/assets/chatflow/image.png
```

由于仓库名就是 `kcenter_blog`，如果图片路径写成 `/kcenter_blog/assets/...`，实际请求会变成：
```
github.com/用户名/kcenter_blog/kcenter_blog/assets/...
```
导致多了一层不存在的路径。

### 修复过程
1. 发现问题：用户反馈 ChatFlow 文章图片无法显示
2. 定位文件：`source/_posts/chatflow工作流.md`
3. 检查图片目录：确认图片实际位于 `source/assets/chatflow/`
4. 批量替换路径：将所有 `/kcenter_blog/assets/chatflow/` 替换为 `/assets/chatflow/`
5. 重新部署：`hexo clean && hexo deploy`

### 预防措施
- 编写图片路径时，直接使用 `/assets/...`，不要包含仓库名
- 部署前在本地预览确认图片正常显示
- 注意 Hexo 博客图片路径规则：`source/assets/` 目录对应网站根路径 `/assets/`

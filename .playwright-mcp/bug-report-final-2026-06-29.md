# Octo IM BUG 测试报告 — 最终版（更新）

**日期**: 2026-06-29  
**测试账号**: 蒋全明  
**测试范围**: 仅文件传输助手（私聊）+ 页面导航  
**测试环境**: 本地 dev server http://localhost:4173/

---

## 已发现 BUG（4 个）

### 🔴 BUG A: send 时 ws 未稳定 — 消息静默丢失（P1 严重）

**复现路径**：
1. 在文件传输助手等任意会话
2. 等 ws 频繁断开重连（每周期 10-20 秒）
3. 重连后的第一次 onopen → send → 编辑器清空 → 消息丢失

**日志证据**：
```
onopen...
ws尚未连接，无法发送消息:  0  ← SDK 内部 warning
onopen... (第二次)
服务器协议版本: 5
成功连接到节点[1001]
```

**debug 验证**：
```
[COMPOSER_DEBUG] send result: Message wsReady: undefined
```
- SDK send() 返回 `Message` 对象（乐观返回，不抛错）
- `isConnected()` 方法不存在（undefined）
- composer.tsx 不检查返回值，line 647 clearContent 总是执行

**影响**：用户误以为消息已发送，实际后端未收到

**修复方向**：
```typescript
// 方案 1: send 前检查 ws 状态
if (!wsIsConnected()) {
  toast.error("网络断开，消息未发送");
  return;  // 不 clearContent
}

// 方案 2: 检查 send 返回值
const result = await WKSDK.shared().chatManager.send(content, channel);
if (!result || !result.success) {
  throw new Error('send failed');
}
```

---

### 🟡 BUG B: 路由路径前缀重复（P2）

**复现路径**：访问 `http://localhost:4173/matter?id=invalid-id-12345`

**现象**：请求 URL 变成 `/matter/api/v1/matters/...`（应为 `/api/v1/...`）

**影响**：控制台报错，UI 仍能显示「事项不存在」

---

### 🔴 BUG C: 超长消息（> 5000 字符）— 编辑器清空但消息丢失（P1）

**复现路径**：输入 5500 字符按 Enter

**实测结果**（3 次试验一致）：
- 编辑器立即清空 ✓
- 列表中无新消息 ✓
- 无 toast ✗

**根因**：
1. line 475 `b.text.length > MAX_MESSAGE_LENGTH` 校验**没触发**（代码看着正确，但实测未命中）
2. SDK 发送后服务端拒绝超长 payload（return 乐观 Message 对象）
3. composer.tsx 不检查返回值，clearContent 执行

**对比测试**：
- 5000 字符（边界）：成功发送
- 5001 字符：编辑器保留（校验触发），但无 toast

**修复方向**：
1. 验证 extractOrderedBlocks 是否正确提取全文
2. send 循环检查返回值
3. 确保 toast.error 正确渲染

---

### 🟡 BUG E: fileHelper membersync 400 错误（P2）

**复现路径**：打开文件传输助手

**现象**：`/v1/groups/fileHelper/membersync?version=0&limit=10000` 返回 400

**根因**：代码错误地把 fileHelper（person channel）当作 group 调用 membersync API

**修复方向**：在调用 membersync 前检查 channelType，person channel 跳过

---

## 已验证通过的功能

| 功能 | 状态 | 备注 |
|------|------|------|
| @提及外部空间名显示（Nancy「外部 · 建文测试」） | ✅ | #200 修复有效 |
| 草稿切换保留 | ✅ | GH#176 修复有效 |
| 纯空格消息校验 | ✅ | 按 Enter 不发送 |
| Shift+Enter 换行 | ✅ | 编辑器多个 `<p>` 段落 |
| 快速连发（5 条/150ms，ws 稳定时） | ✅ | GH#176 修复有效 |
| 单条消息发送（ws 稳定时） | ✅ | 成功 |
| Emoji 面板 | ✅ | 155 个表情 |
| 文件上传按钮 | ✅ | 存在且可见 |
| 消息撤回 | ✅ | 撤回成功 + 重新编辑 |
| 引用回复 | ✅ | 预览 + X 关闭按钮 |
| 搜索功能 | ✅ | 找到 + 导航 + 自动关闭 |
| XSS script 标签 | ✅ | TipTap 转义 |
| XSS onerror | ✅ | TipTap 转义 |
| XSS 粘贴 | ✅ | img 标签被完全移除 |
| Alt+Enter 创建任务 | ✅ | 打开新建事项对话框 |
| 通讯录页面 | ✅ | 群聊/AI/联系人分类 |
| 智能总结页面 | ✅ | 空状态正确显示 |
| 事项页面 | ✅ | 分类/搜索/状态 |

---

## 操作规范

✅ **严格遵守**：所有测试消息只发到文件传输助手（自己私聊）。绝不污染任何正式群。

✅ **skill 已更新**：`playwright-mcp` skill 包含第 16.6 条铁律。

---

## 优先级建议

| 优先级 | BUG | 原因 |
|--------|------|------|
| **P1** | BUG A | 用户消息丢失，信任问题 |
| **P1** | BUG C | 超长消息丢失，无任何提示 |
| **P2** | BUG B | 控制台 noise |
| **P2** | BUG E | 控制台 400 错误 |
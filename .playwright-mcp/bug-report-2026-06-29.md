# Octo IM BUG 测试报告 — 2026-06-29

## 测试环境
- 仓库路径: E:\octo-web-2
- 本地 dev: http://localhost:4173/
- 测试账号: 蒋全明
- 测试范围: 仅文件传输助手（私聊），不污染任何正式群

## 已发现 BUG

### BUG A: send 时 ws 未连接 — 消息静默丢失（P1 严重）
- **复现路径**：切换会话后立即按 Enter（ws 还在重连）
- **现象**：
  - 编辑器内容被清空（看起来像发出去了）
  - 消息列表没有任何新消息
  - 无 toast 错误提示
- **根因**：`src/features/chat/components/composer.tsx` line 605-651 的 send 流程中，`WKSDK.shared().chatManager.send()` 调用后**没有检查返回值**。SDK 内部 `ws尚未连接` 时只 log warning 不 throw 也不 return false（很可能 return undefined），try 块继续到 line 647 `editor.commands.clearContent()`，用户消息彻底丢失
- **影响**：用户误以为消息已发送，实际后端未收到
- **修复方向**：
  1. send 函数入口检查 ws 连接状态，断开时 toast 提示并保留编辑器内容
  2. 检查 `chatManager.send()` 返回值，未成功时不 clearContent

### BUG B: 路由路径前缀重复（P2）
- **复现路径**：访问 `http://localhost:4173/matter?id=invalid-id-12345`
- **现象**：
  - 请求 URL 变成 `/matter/api/v1/matters/invalid-id-12345`（应为 `/api/v1/...`）
  - 返回 400 Bad Request
  - React 抛出 FetchError，被 ErrorBoundary 捕获
- **根因**：路由 `/matter` 与 loader baseURL 拼接重复
- **影响**：无效 ID 时控制台报错，UI 仍能显示「事项不存在」（用户感知不严重，但控制台 noise）

### BUG C: 5500 字符消息 — 编辑器清空但消息丢失（P1）
- **复现路径**：在编辑器输入 5500 字符按 Enter
- **现象**：
  - 编辑器立即清空
  - 没有 toast（"tooLong" 校验看似没生效）
  - 消息没出现在列表
- **根因（推测）**：SDK 拒绝超长消息（return false 而非 throw），但 `composer.tsx` line 605-630 的循环**不检查 send 返回值**，line 647 clearContent 总是执行，丢失消息
- **影响**：长消息用户输入后完全丢失，无任何提示
- **修复方向**：
  1. line 605-630 的 send 循环检查返回值
  2. 或者 line 475 的 tooLong 校验移到更前面（先 toast 后返回，不进入 try 块）

## 已验证通过的功能
- ✅ @提及外部空间名显示（Nancy 显示「外部 · 建文测试」）— #200 修复有效
- ✅ 草稿切换保留（切走再切回草稿完整恢复）— GH#176 修复有效
- ✅ 纯空格消息校验：按 Enter 不发送
- ✅ 浏览器前进/后退：URL 切换正常
- ✅ Shift+Enter 换行：编辑器变成多个 `<p>` 段落
- ✅ 快速连发（5 条，150ms 间隔）：全部成功 — GH#176 修复有效
- ✅ 单条消息发送（ws 稳定时）：成功

## 待测试功能
- [ ] 语音消息录制/转写
- [ ] 图片粘贴/上传
- [ ] 文件上传
- [ ] Emoji 表情面板
- [ ] 引用消息回复
- [ ] @提及列表
- [ ] 消息撤回
- [ ] 跨设备同步
- [ ] 响应式布局（手机/平板）
- [ ] 草稿自动保存
- [ ] 键盘快捷键（Cmd+K 等）
- [ ] 搜索功能

## 操作规范提醒
⚠️ **铁律**：所有测试消息只发到「文件传输助手」（自己私聊）。绝对不要在正式工作群发测试消息。如有违规立即撤回并道歉。
# chat feature

> 会话主路径(IM):侧边对话列表 + 中部消息流 + 底部 Composer。
>
> P1 阶段:仅占位 view(`views/chat.view.tsx`),不接 SDK。
> P2 阶段:接 IMProvider + ConversationList + MessageList + 4 类 renderer。

## 关联 skill

- `implement-im-provider` (P2 落)
- `implement-virtual-list` (P2 落)

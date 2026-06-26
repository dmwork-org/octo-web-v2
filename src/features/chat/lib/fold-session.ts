import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * AI 协作 fold session 数据层(对齐旧 dmworkbase vm.ts:306-457 buildRenderItems):
 *
 * **核心规则**:
 * - bot 消息(`channelInfo.orgData.robot === 1`)连续 ≥ 2 条且相邻间隔 < 120s
 *   → 聚合成 fold session
 * - 非 bot 消息 / 间隔超时 → 关闭当前 session,正常单条渲染
 * - 单 bot 消息(只有 1 条)不折叠,作为普通 message 渲染
 *
 * **simplification(对齐旧但未实现)**:
 * - 不做 active typing 实时合并(typing 消息会作为 summary 替代 lastMessage)
 * - 不做 isActive 120s 后自动失活定时器
 * - 不做 highlightSummary / shouldMergeFlash 动效
 * - active 态简化:lastBotMsg 距现在 < 120s 视为 active(展开提示用)
 */

export interface FoldSessionParticipant {
  uid: string;
  name: string;
}

export interface FoldSession {
  /** 稳定 id(基于第一条消息),展开收起 state 用它做 key。 */
  sessionId: string;
  /** session 包含的所有消息(按时间顺序)。 */
  messages: Message[];
  /** 参与的 bot 列表(去重,顺序按首次出现)。 */
  participants: FoldSessionParticipant[];
  /** 折叠态显示的摘要消息(取最后一条)。 */
  lastMessage: Message;
  /** session 是否仍"活跃"(最后一条 bot 消息距现在 < 120s)— 仅作 UI 提示。 */
  isActive: boolean;
}

export type RenderItem =
  | { type: "message"; message: Message }
  | { type: "foldSession"; session: FoldSession };

/** AI bot 判定(对齐旧 vm.ts:isBotMessage):channelInfo.orgData.robot === 1 + 排除系统/typing/historySplit。 */
function isBotMessage(m: Message): boolean {
  const t = m.contentType;
  if (
    t === MessageContentTypeConst.typing ||
    t === MessageContentTypeConst.historySplit ||
    (t >= 1000 && t < 2000)
  ) {
    return false;
  }
  if (!m.fromUID) return false;
  const info = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(m.fromUID, ChannelTypePerson),
  );
  return (info?.orgData as { robot?: number } | undefined)?.robot === 1;
}

function hasFileAttachment(m: Message): boolean {
  switch (m.contentType) {
    case MessageContentTypeConst.image:
    case MessageContentTypeConst.gif:
    case MessageContentTypeConst.smallVideo:
    case MessageContentTypeConst.file:
    case MessageContentTypeConst.richText:
      return true;
    default:
      return false;
  }
}

/** Person channelInfo title fallback uid(对齐旧 getSessionParticipants)。 */
function nameOfUid(uid: string): string {
  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  return info?.title || uid;
}

/** 去重收集 participants(对齐旧 getSessionParticipants line 278-297)。 */
function collectParticipants(messages: Message[]): FoldSessionParticipant[] {
  const seen = new Set<string>();
  const out: FoldSessionParticipant[] = [];
  for (const m of messages) {
    if (!m.fromUID || seen.has(m.fromUID)) continue;
    seen.add(m.fromUID);
    out.push({ uid: m.fromUID, name: nameOfUid(m.fromUID) });
  }
  return out;
}

/**
 * 稳定 sessionId:基于第一条消息的 messageSeq(或 clientMsgNo fallback)。
 * 同一 session 重建后 id 不变,前端展开收起 state 不丢。
 * 对齐旧 vm.ts:299-304 getFoldSessionId。
 */
function sessionIdOf(firstMessage: Message): string {
  if (firstMessage.messageSeq > 0) return `fold-session-${firstMessage.messageSeq}`;
  return `fold-session-${firstMessage.clientMsgNo}`;
}

/** 旧 vm.ts:379 阈值,bot 消息相邻 120s 内才算同一 session。 */
const SESSION_GAP_SEC = 120;

/**
 * 把 messages 切成 renderItems:连续 ≥2 条 bot 消息 + 间隔 <120s → foldSession,
 * 否则 plain message(对齐旧 vm.ts:306-457 buildRenderItems 核心逻辑)。
 *
 * 简化:typing 消息归到 messages 列表里普通处理,不做 typing-summary 替代;
 * 不做 active 超时后自动 rebuild(组件层 useEffect setTimeout 可补,本期略)。
 */
export function buildRenderItems(messages: Message[]): RenderItem[] {
  const out: RenderItem[] = [];
  let pending: Message[] = [];

  const flush = (isActive: boolean) => {
    if (pending.length === 0) return;
    if (pending.length >= 2) {
      const first = pending[0];
      const last = pending[pending.length - 1];
      out.push({
        type: "foldSession",
        session: {
          sessionId: sessionIdOf(first),
          messages: [...pending],
          participants: collectParticipants(pending),
          lastMessage: last,
          isActive,
        },
      });
    } else {
      for (const m of pending) out.push({ type: "message", message: m });
    }
    pending = [];
  };

  for (const m of messages) {
    if (isBotMessage(m)) {
      if (hasFileAttachment(m)) {
        flush(false);
        out.push({ type: "message", message: m });
        continue;
      }
      if (pending.length > 0) {
        const prev = pending[pending.length - 1];
        if (m.timestamp - prev.timestamp < SESSION_GAP_SEC) {
          pending.push(m);
          continue;
        }
        // 间隔超时 → 关上一个 session
        flush(false);
      }
      pending.push(m);
      continue;
    }
    // 非 bot → 关 pending session,本条普通渲染
    flush(false);
    out.push({ type: "message", message: m });
  }

  // 末尾 pending:判 active(最后一条 bot 距现在 < 120s)
  const nowSec = Math.floor(Date.now() / 1000);
  const lastPending = pending.length > 0 ? pending[pending.length - 1] : null;
  const isActive = lastPending !== null && nowSec - lastPending.timestamp < SESSION_GAP_SEC;
  flush(isActive);

  return out;
}

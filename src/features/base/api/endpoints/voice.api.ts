import { api } from "@/features/base/api/client";

/**
 * 语音相关 API(对应旧 dmworkbase Service/VoiceService)。
 *
 * 发送侧"语音消息"(旧 amr 文件)在新项目**不再支持发送**,只接收态保留:
 * mic 按钮的语义是**语音输入 → ASR 转写成文本 → 插入 editor**,用户可再编辑。
 *
 * - GET    /v1/voice/config              voice 总开关 + 反馈 URL + 本地 ASR 默认配置
 * - POST   /v1/voice/transcribe          FormData(audio + context_text + ...)→ { text, m, request_id }
 * - GET    /v1/voice/local-config        本地 ASR 用户自定义配置(对齐上游 ed5bc4bd)
 * - PUT    /v1/voice/local-config        body { enabled, probe_url, transcribe_url, timeout_ms }
 * - DELETE /v1/voice/local-config        删除自定义(deprecated, 改用 /reset)
 * - POST   /v1/voice/local-config/reset  恢复默认(对齐上游 c4fd2a13)
 */

export interface VoiceConfig {
  enabled: boolean;
  max_duration?: number;
  max_file_size?: number;
  /** 本地 ASR 默认开关(server 下发) */
  local_enabled?: boolean;
  /** 本地 ASR 默认超时(ms) */
  local_timeout_ms?: number;
  /** 本地 ASR 默认 probe URL */
  local_probe_url?: string;
  /** 本地 ASR 默认 transcribe URL */
  local_transcribe_url?: string;
  /** 反馈上报 base URL(VoiceFeedback service 用,POST {base}/local 和 {base}/final) */
  feedback_url?: string;
  /** 反馈隐私政策链接 */
  feedback_privacy_url?: string;
  /** 反馈用户协议链接 */
  feedback_user_agreement_url?: string;
  /** 默认引擎名(展示用) */
  engine?: string;
  /** 默认转写模式 */
  edit_mode?: string;
}

export async function getVoiceConfig(): Promise<VoiceConfig> {
  return api<VoiceConfig>("voice/config");
}

export interface VoiceLocalConfig {
  enabled: boolean;
  probe_url?: string;
  transcribe_url?: string;
  timeout_ms?: number;
}

/** 用户本地 ASR 配置(覆盖 voice config 默认值)。 */
export async function getVoiceLocalConfig(): Promise<VoiceLocalConfig> {
  return api<VoiceLocalConfig>("voice/local-config");
}

export async function putVoiceLocalConfig(body: VoiceLocalConfig): Promise<void> {
  await api("voice/local-config", { method: "PUT", body });
}

/**
 * 恢复本地 ASR 配置默认值(对齐上游 c4fd2a13 — DELETE 改 POST /reset)。
 * 后端 reset 把字段清零,下次 GET 拿到的就是 voice/config 默认值。
 */
export async function resetVoiceLocalConfig(): Promise<void> {
  await api("voice/local-config/reset", { method: "POST" });
}

/**
 * Voice 服务文档(对齐上游 c0a6f1ea getDocument):
 * GET /v1/voice/document/:doc_type → { doc_type, title, content, version, updated_at }
 *
 * 当前 docType 值:
 *   - "asr_service_doc":ASR 服务隐私 / 反馈说明(VoiceFeedbackNotice 内显示)
 */
export interface VoiceDocumentResponse {
  doc_type: string;
  title: string;
  /** content 是 server 受信任的富文本(markdown);本仓走 Markdown 组件渲染 */
  content: string;
  version: string;
  updated_at: string;
}

export async function getVoiceDocument(docType: string): Promise<VoiceDocumentResponse> {
  return api<VoiceDocumentResponse>(`voice/document/${encodeURIComponent(docType)}`);
}

export interface TranscribeResult {
  text: string;
  /** 后端返回的模型名(短),前端不消费 */
  m?: string;
  /** 反馈追踪 ID(VoiceFeedback uploadFinal 时回传) */
  request_id?: string;
}

/** 转写模式 — 对齐旧 dmworktodo VoiceService.VoiceMode 简化版。 */
export type VoiceMode = "append_only" | "edit_only" | "smart";

export async function transcribeVoice(
  audio: Blob,
  opts: {
    contextText?: string;
    memberContext?: string;
    selfName?: string;
    chatContext?: string;
    personalContext?: string;
    channelType?: number;
    mode?: VoiceMode;
  } = {},
): Promise<TranscribeResult> {
  const fd = new FormData();
  const ext = audio.type.includes("mp4") ? "mp4" : "webm";
  fd.append("audio", audio, `recording.${ext}`);
  if (opts.contextText) fd.append("context_text", opts.contextText);
  if (opts.memberContext) fd.append("member_context", opts.memberContext);
  if (opts.selfName) fd.append("self_name", opts.selfName);
  if (opts.chatContext) fd.append("chat_context", opts.chatContext);
  if (opts.personalContext) fd.append("personal_context", opts.personalContext);
  fd.append("mode", opts.mode ?? "smart");
  if (opts.channelType !== undefined) fd.append("channel_type", String(opts.channelType));
  return api<TranscribeResult>("voice/transcribe", { method: "POST", body: fd });
}

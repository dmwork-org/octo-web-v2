import { api } from "@/features/base/api/client";

/**
 * 语音相关 API(对应旧 dmworkbase Service/VoiceService)。
 *
 * 发送侧"语音消息"(旧 amr 文件)在新项目**不再支持发送**,只接收态保留:
 * mic 按钮的语义是**语音输入 → ASR 转写成文本 → 插入 editor**,用户可再编辑。
 *
 * - GET  /v1/voice/config       voice 总开关 + max_duration / max_file_size
 * - POST /v1/voice/transcribe   FormData(audio + context_text + chat_context + ...)
 *                               → { text, m }
 *
 * 简化:不接 LocalModelService(本地模型 fallback),纯走后端;mode 默认 "smart";
 * voice context(/voice/context)P3+ 接(用于个性化转写)。
 */

export interface VoiceConfig {
  enabled: boolean;
  max_duration?: number;
  max_file_size?: number;
}

export async function getVoiceConfig(): Promise<VoiceConfig> {
  return api<VoiceConfig>("voice/config");
}

export interface TranscribeResult {
  text: string;
  /** 后端返回的模型名(短),前端不消费 */
  m?: string;
}

export async function transcribeVoice(
  audio: Blob,
  opts: { contextText?: string; channelType?: number } = {},
): Promise<TranscribeResult> {
  const fd = new FormData();
  const ext = audio.type.includes("mp4") ? "mp4" : "webm";
  fd.append("audio", audio, `recording.${ext}`);
  if (opts.contextText) fd.append("context_text", opts.contextText);
  fd.append("mode", "smart");
  if (opts.channelType !== undefined) fd.append("channel_type", String(opts.channelType));
  return api<TranscribeResult>("voice/transcribe", { method: "POST", body: fd });
}

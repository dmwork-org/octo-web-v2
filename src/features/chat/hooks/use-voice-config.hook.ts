import { useQuery } from "@tanstack/react-query";
import { getVoiceConfig, type VoiceConfig } from "@/features/base/api/endpoints/voice.api";

/**
 * Voice 全局配置(对齐上游 c0a6f1ea sharedVoiceConfig + ensureVoiceFeedbackLoaded)。
 *
 * GET /v1/voice/config 是 user 维度全局配置(不随 Space 变),staleTime=Infinity
 * 在 session 内永久缓存;空 reactQuery key 让所有 voice 设置面板共用一份数据。
 *
 * **关键字段**:
 *   - feedback_url:VoiceFeedback service init 用(为空则无反馈上报功能)
 *   - local_enabled / local_*:本地 ASR 默认配置,被用户 voice_local-config 覆盖
 *   - engine / edit_mode:UI 展示(VoiceSettingsPanel)
 */

export const voiceConfigQueryKey = ["voice", "config"] as const;

export function useVoiceConfig() {
  return useQuery<VoiceConfig>({
    queryKey: voiceConfigQueryKey,
    queryFn: getVoiceConfig,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

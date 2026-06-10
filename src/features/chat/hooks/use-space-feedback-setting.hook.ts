import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import {
  getSpaceSetting,
  updateSpaceSetting,
  type SpaceSetting,
} from "@/features/base/api/endpoints/space-setting.api";
import { spaceStore } from "@/features/base/stores/space";
import { useVoiceConfig } from "@/features/chat/hooks/use-voice-config.hook";
import { VoiceFeedback } from "@/features/chat/services/voice-feedback";

/**
 * Space-level voice 隐私设置 + VoiceFeedback singleton 生命周期(对齐上游 c0a6f1ea
 * useSpaceFeedbackSetting + ensureVoiceFeedbackLoaded + toggleVoiceFeedback)。
 *
 * **逻辑**:
 *   1. 拉 spaceSetting(GET /v1/user/space/setting,按 spaceId 缓存)
 *   2. effect 监听 (voiceConfig.feedback_url + voice_input_enabled + voice_feedback_on):
 *      - 都满足 → VoiceFeedback.enable(feedbackUrl)(创建 singleton + 允许上报)
 *      - 否则 → VoiceFeedback.disable()(已存在 singleton 时调用,no-op 安全)
 *   3. spaceId 切走 → effect cleanup 自动 disable,下个 space 重新评估
 *
 * **mutations**:
 *   - toggleVoiceFeedback(on):toggle voice_feedback_on,成功后 invalidate query
 *   - acceptVoiceInput(feedbackOn):首次接受隐私 notice,一次性 set
 *     voice_input_enabled=1 + voice_feedback_notice_acked=1 + voice_feedback_on=feedbackOn
 *   - disableVoiceInput():关闭 voice 录音,顺便 voice_feedback_on=0
 *
 * **不复刻上游 shared listeners**:本仓走 React Query 自动多组件同步,不需要 sharedState。
 */

export const spaceSettingQueryKey = (spaceId: string | null) =>
  ["space-setting", spaceId] as const;

export function useSpaceFeedbackSetting() {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data: voiceConfig } = useVoiceConfig();

  const settingQuery = useQuery<SpaceSetting>({
    queryKey: spaceSettingQueryKey(spaceId),
    queryFn: getSpaceSetting,
    enabled: !!spaceId,
    staleTime: 60 * 1000,
    // 404 兜底(老 space 无 row):后端约定首次 GET 自动 ensure;若仍 404,本仓 fallback
    // 由 query.error 处理,UI 层把 spaceSetting 视为默认全 0
  });

  // VoiceFeedback singleton 生命周期同步(对齐上游 fetchAndApplySpaceSetting 的 enable/disable)
  useSyncVoiceFeedback(
    voiceConfig?.feedback_url,
    settingQuery.data?.voice_input_enabled === 1,
    settingQuery.data?.voice_feedback_on === 1,
  );

  const updateMu = useMutation({
    mutationFn: (body: Partial<SpaceSetting>) => updateSpaceSetting(body),
    onSuccess: (_void, vars) => {
      // 乐观更新:把新字段合并进 cache,避免等下次 refetch 的网络往返
      qc.setQueryData<SpaceSetting>(spaceSettingQueryKey(spaceId), (prev) =>
        prev ? { ...prev, ...vars } : prev,
      );
      // 同时正式 invalidate,后台拉一次确认(staleTime=60s 内不会真请求)
      void qc.invalidateQueries({ queryKey: spaceSettingQueryKey(spaceId) });
    },
  });

  return {
    spaceSetting: settingQuery.data ?? null,
    loaded: settingQuery.isSuccess || settingQuery.isError,
    voiceConfig: voiceConfig ?? null,
    toggleVoiceFeedback: (on: boolean) => updateMu.mutateAsync({ voice_feedback_on: on ? 1 : 0 }),
    acceptVoiceInput: (feedbackOn: boolean) =>
      updateMu.mutateAsync({
        voice_input_enabled: 1,
        voice_feedback_notice_acked: 1,
        voice_feedback_on: feedbackOn ? 1 : 0,
      }),
    disableVoiceInput: () =>
      updateMu.mutateAsync({ voice_input_enabled: 0, voice_feedback_on: 0 }),
    isPending: updateMu.isPending,
  };
}

/**
 * 抽到命名 hook(no-useeffect-in-component 规则):根据 (feedbackUrl + voiceInputOn + feedbackOn)
 * 三态同步 VoiceFeedback singleton 状态。
 */
function useSyncVoiceFeedback(
  feedbackUrl: string | undefined,
  voiceInputOn: boolean,
  feedbackOn: boolean,
): void {
  useEffect(() => {
    if (feedbackUrl && voiceInputOn && feedbackOn) {
      const existing = VoiceFeedback.shared();
      if (existing) existing.enable(feedbackUrl);
      else VoiceFeedback.init(feedbackUrl);
    } else {
      VoiceFeedback.shared()?.disable();
    }
    // 不在 cleanup 里 destroy — 多 hook 实例共享 singleton,cleanup 仅由 useEffect
    // 卸载/参数变化时重跑;destroy 只在 IMProvider unmount(整个登出)时触发,留外层
  }, [feedbackUrl, voiceInputOn, feedbackOn]);
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { message } from "@/components/ui/message";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getVoiceConfig,
  getVoiceLocalConfig,
  putVoiceLocalConfig,
  resetVoiceLocalConfig,
  type VoiceLocalConfig,
} from "@/features/base/api/endpoints/voice.api";
import { voiceConfigQueryKey } from "@/features/chat/hooks/use-voice-config.hook";
import { useSpaceFeedbackSetting } from "@/features/chat/hooks/use-space-feedback-setting.hook";
import { VoiceFeedbackNotice } from "@/features/chat/components/voice-feedback-notice";
import { useT } from "@/lib/i18n/use-t";

interface VoiceSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Voice 设置面板(对齐上游 aec22081 VoiceSettingsPanel + ed5bc4bd 本地 ASR + c4fd2a13 reset)。
 *
 * **包含**:
 *   - 语音转写总开关(voice_input_enabled):点开关 → 弹 VoiceFeedbackNotice(首次)
 *   - ASR 反馈开关(voice_feedback_on):voice config 有 feedback_url 才显
 *   - 本地 ASR(voice_local_config):toggle + timeout / probe URL / transcribe URL +
 *     Test Connection + Save + Restore Defaults(POST /v1/voice/local-config/reset)
 *   - 隐私协议 / 用户协议链接
 *
 * 数据:useSpaceFeedbackSetting(space-setting + voice-config 合并)+ 本地 ASR 独立 query。
 */
export function VoiceSettingsModal({ open, onClose }: VoiceSettingsModalProps) {
  const tt = useT();
  const qc = useQueryClient();
  const {
    spaceSetting,
    loaded,
    voiceConfig,
    toggleVoiceFeedback,
    acceptVoiceInput,
    disableVoiceInput,
    isPending,
  } = useSpaceFeedbackSetting();

  const [showNotice, setShowNotice] = useState(false);

  const isVoiceEnabled = spaceSetting?.voice_input_enabled === 1;
  const isFeedbackOn = spaceSetting?.voice_feedback_on === 1;
  const apiAvailable = !!spaceSetting;
  const privacyUrl = voiceConfig?.feedback_privacy_url;
  const agreementUrl = voiceConfig?.feedback_user_agreement_url;

  const handleVoiceToggle = async (checked: boolean) => {
    if (isPending) return;
    if (checked) {
      setShowNotice(true);
    } else {
      try {
        await disableVoiceInput();
      } catch {
        message.error(tt("navRail.voiceSettings.operationFailed"));
      }
    }
  };

  const handleNoticeAccept = async (feedbackOn: boolean) => {
    try {
      await acceptVoiceInput(feedbackOn);
      setShowNotice(false);
    } catch {
      message.error(tt("navRail.voiceSettings.operationFailed"));
    }
  };

  const handleFeedbackToggle = async (checked: boolean) => {
    if (isPending) return;
    try {
      await toggleVoiceFeedback(checked);
    } catch {
      message.error(tt("navRail.voiceSettings.operationFailed"));
    }
  };

  return (
    <>
      <BaseDialog
        open={open && !showNotice}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        size="md"
        height="sm"
        title={tt("navRail.voiceSettings.title")}
      >
        <div className="flex flex-col gap-3 px-4 py-3">
          {loaded && !apiAvailable ? (
            <div className="rounded-md bg-warning/10 px-3 py-2 text-[12px] text-warning">
              {tt("navRail.voiceSettings.serviceUnavailable")}
            </div>
          ) : null}

          <SectionGroup>
            <SettingRow
              title={tt("navRail.voiceSettings.transcription")}
              checked={isVoiceEnabled}
              disabled={isPending || !apiAvailable}
              onChange={handleVoiceToggle}
            />
            {isVoiceEnabled && voiceConfig?.feedback_url ? (
              <SettingRow
                title={tt("navRail.voiceSettings.feedback")}
                tooltip={tt("navRail.voiceSettings.feedbackTooltip")}
                checked={isFeedbackOn}
                disabled={isPending || !apiAvailable}
                onChange={handleFeedbackToggle}
              />
            ) : null}
          </SectionGroup>

          {isVoiceEnabled && voiceConfig?.local_enabled !== undefined ? (
            <LocalAsrSection qc={qc} />
          ) : null}

          {privacyUrl || agreementUrl ? (
            <div className="flex gap-3 px-2 pt-2 text-[12px]">
              {privacyUrl ? (
                <a
                  href={privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline"
                >
                  {tt("navRail.voiceSettings.privacyPolicy")}
                </a>
              ) : null}
              {agreementUrl ? (
                <a
                  href={agreementUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline"
                >
                  {tt("navRail.voiceSettings.userAgreement")}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </BaseDialog>

      <VoiceFeedbackNotice
        open={showNotice}
        onAccept={handleNoticeAccept}
        onCancel={() => setShowNotice(false)}
        feedbackPrivacyUrl={privacyUrl}
        feedbackUserAgreementUrl={agreementUrl}
      />
    </>
  );
}

/** 一行 toggle + 可选 tooltip 帮助。 */
function SettingRow({
  title,
  tooltip,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  tooltip?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="flex items-center gap-1.5 text-sm text-text-primary">
        {title}
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-text-tertiary">
                <HelpCircle size={13} />
              </span>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-success" : "bg-bg-elevated"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/** 本地 ASR 配置块(toggle + URL/timeout + Test Connection + Save + Reset)。 */
function LocalAsrSection({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const tt = useT();

  const localQ = useQuery({
    queryKey: ["voice", "local-config"] as const,
    queryFn: getVoiceLocalConfig,
    staleTime: 60 * 1000,
  });

  const [enabled, setEnabled] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState("");
  const [probeUrl, setProbeUrl] = useState("");
  const [transcribeUrl, setTranscribeUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [probeStatus, setProbeStatus] = useState<"idle" | "loading" | "success" | "fail">("idle");

  // 拉到 / 切到不同 local config 时,同步 state(命名 hook 满足 no-useeffect-in-component)
  useSyncLocalConfigToState(
    localQ.data,
    setEnabled,
    setTimeoutMs,
    setProbeUrl,
    setTranscribeUrl,
    setDirty,
  );

  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: ["voice", "local-config"] });
    const newConfig = await getVoiceConfig();
    qc.setQueryData(voiceConfigQueryKey, newConfig);
  };

  const saveMu = useMutation({
    mutationFn: (body: VoiceLocalConfig) => putVoiceLocalConfig(body),
    onSuccess: async () => {
      await refreshAll();
      setDirty(false);
      message.success(tt("navRail.voiceSettings.saved"));
    },
    onError: () => message.error(tt("navRail.voiceSettings.saveFailed")),
  });

  const resetMu = useMutation({
    mutationFn: resetVoiceLocalConfig,
    onSuccess: async () => {
      await refreshAll();
      setDirty(false);
      message.success(tt("navRail.voiceSettings.defaultsRestored"));
    },
    onError: () => message.error(tt("navRail.voiceSettings.operationFailed")),
  });

  const handleToggle = (next: boolean) => {
    const prev = enabled;
    setEnabled(next);
    saveMu.mutate(
      { enabled: next },
      {
        onError: () => setEnabled(prev),
      },
    );
  };

  const handleSave = () => {
    const body: VoiceLocalConfig = { enabled };
    const ms = parseInt(timeoutMs, 10);
    if (!isNaN(ms) && ms > 0) body.timeout_ms = ms;
    if (probeUrl.trim()) body.probe_url = probeUrl.trim();
    if (transcribeUrl.trim()) body.transcribe_url = transcribeUrl.trim();
    saveMu.mutate(body);
  };

  const handleTestProbe = async () => {
    if (!probeUrl.trim() || probeStatus === "loading") return;
    setProbeStatus("loading");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      await fetch(probeUrl.trim(), { signal: controller.signal, redirect: "manual" });
      clearTimeout(timer);
      setProbeStatus("success");
    } catch {
      setProbeStatus("fail");
    }
    setTimeout(() => setProbeStatus("idle"), 3000);
  };

  if (!localQ.data) return null;

  return (
    <SectionGroup>
      <SettingRow
        title={tt("navRail.voiceSettings.localTranscription")}
        tooltip={tt("navRail.voiceSettings.localTranscriptionTooltip")}
        checked={enabled}
        disabled={saveMu.isPending || resetMu.isPending}
        onChange={handleToggle}
      />
      {enabled ? (
        <div className="flex flex-col gap-2 border-t border-border-subtle px-3 py-3">
          <Field label={tt("navRail.voiceSettings.localTimeoutMs")}>
            <input
              type="number"
              value={timeoutMs}
              placeholder="10000"
              onChange={(e) => {
                setTimeoutMs(e.target.value);
                setDirty(true);
              }}
              className="w-full rounded-md border border-border-default bg-bg-base px-2 py-1.5 text-[13px] text-text-primary focus:border-brand focus:outline-none"
            />
          </Field>
          <Field label={tt("navRail.voiceSettings.localProbeUrl")}>
            <div className="flex gap-2">
              <input
                type="url"
                value={probeUrl}
                placeholder="http://localhost:8787/"
                onChange={(e) => {
                  setProbeUrl(e.target.value);
                  setDirty(true);
                }}
                className="min-w-0 flex-1 rounded-md border border-border-default bg-bg-base px-2 py-1.5 text-[13px] text-text-primary focus:border-brand focus:outline-none"
              />
              <Button
                type="tertiary"
                theme="borderless"
                size="small"
                disabled={probeStatus === "loading" || !probeUrl.trim()}
                onClick={() => void handleTestProbe()}
              >
                {probeStatus === "idle"
                  ? tt("navRail.voiceSettings.testConnection")
                  : probeStatus === "loading"
                    ? tt("navRail.voiceSettings.testingConnection")
                    : probeStatus === "success"
                      ? tt("navRail.voiceSettings.connectionSuccess")
                      : tt("navRail.voiceSettings.connectionFailed")}
              </Button>
            </div>
          </Field>
          <Field label={tt("navRail.voiceSettings.localTranscribeUrl")}>
            <input
              type="url"
              value={transcribeUrl}
              placeholder="http://localhost:8787/v1/voice/transcribe"
              onChange={(e) => {
                setTranscribeUrl(e.target.value);
                setDirty(true);
              }}
              className="w-full rounded-md border border-border-default bg-bg-base px-2 py-1.5 text-[13px] text-text-primary focus:border-brand focus:outline-none"
            />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="tertiary"
              theme="borderless"
              size="small"
              disabled={resetMu.isPending || saveMu.isPending}
              onClick={() => resetMu.mutate()}
            >
              {tt("navRail.voiceSettings.restoreDefaults")}
            </Button>
            <Button
              type="primary"
              theme="solid"
              size="small"
              disabled={!dirty || saveMu.isPending || resetMu.isPending}
              loading={saveMu.isPending}
              onClick={handleSave}
            >
              {tt("navRail.voiceSettings.save")}
            </Button>
          </div>
        </div>
      ) : null}
    </SectionGroup>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-text-tertiary">{label}</label>
      {children}
    </div>
  );
}

/** local config 拉到 / 切换时同步 state(命名 hook,no-useeffect-in-component)。 */
function useSyncLocalConfigToState(
  data: VoiceLocalConfig | undefined,
  setEnabled: (v: boolean) => void,
  setTimeoutMs: (v: string) => void,
  setProbeUrl: (v: string) => void,
  setTranscribeUrl: (v: string) => void,
  setDirty: (v: boolean) => void,
): void {
  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setTimeoutMs(data.timeout_ms != null ? String(data.timeout_ms) : "");
    setProbeUrl(data.probe_url ?? "");
    setTranscribeUrl(data.transcribe_url ?? "");
    setDirty(false);
    // setter 是稳定函数,不入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}

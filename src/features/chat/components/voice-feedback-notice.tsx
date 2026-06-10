import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/semi-bridge/button";
import { Markdown } from "@/components/ui/markdown";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { getVoiceDocument } from "@/features/base/api/endpoints/voice.api";
import { useT } from "@/lib/i18n/use-t";

interface VoiceFeedbackNoticeProps {
  open: boolean;
  /** 接受时回调:feedbackOn 为用户是否同意 ASR 反馈上报(默认 false,可选) */
  onAccept: (feedbackOn: boolean) => Promise<void> | void;
  onCancel: () => void;
  feedbackPrivacyUrl?: string;
  feedbackUserAgreementUrl?: string;
}

/**
 * Voice 隐私 notice(对齐上游 c0a6f1ea VoiceFeedbackNotice.tsx):
 * 首次启用 voice 录音时弹此 modal,展示后端 asr_service_doc 内容 + 一个
 * "允许 ASR 反馈上报" 可选 checkbox。接受后 acceptVoiceInput(feedbackOn) 一次写
 * voice_input_enabled=1 + voice_feedback_notice_acked=1 + voice_feedback_on=feedbackOn。
 *
 * **简化**:不接 DOMPurify 复刻上游(后端 doc 受信任);用本仓 Markdown 组件渲染
 * doc.content(假设后端返回 markdown 格式),markdown.tsx 已 rehypeSanitize 兜底。
 */
export function VoiceFeedbackNotice({
  open,
  onAccept,
  onCancel,
  feedbackPrivacyUrl,
  feedbackUserAgreementUrl,
}: VoiceFeedbackNoticeProps) {
  const tt = useT();
  const [feedbackChecked, setFeedbackChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const docQ = useQuery({
    queryKey: ["voice", "document", "asr_service_doc"],
    queryFn: () => getVoiceDocument("asr_service_doc"),
    enabled: open,
    staleTime: 60 * 60 * 1000,
  });

  const acceptDisabled =
    docQ.isLoading || submitting || (docQ.isError && !feedbackPrivacyUrl && !feedbackUserAgreementUrl);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await onAccept(feedbackChecked);
    } finally {
      setSubmitting(false);
    }
  };

  const hasLinks = feedbackPrivacyUrl || feedbackUserAgreementUrl;

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      size="lg"
      height="md"
      title={tt("navRail.voiceNotice.title")}
      footer={
        <div className="flex w-full flex-col gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={feedbackChecked}
              onChange={(e) => setFeedbackChecked(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-brand"
            />
            <span>{tt("navRail.voiceNotice.feedbackConsent")}</span>
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button type="tertiary" theme="borderless" onClick={onCancel}>
              {tt("base.common.cancel")}
            </Button>
            <Button
              type="primary"
              theme="solid"
              loading={submitting}
              disabled={acceptDisabled}
              onClick={() => void handleAccept()}
            >
              {tt("navRail.voiceNotice.accept")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="px-6 py-4 text-sm leading-relaxed text-text-secondary">
        {docQ.isLoading ? (
          <div className="flex justify-center py-4 text-text-tertiary">
            {tt("base.common.loading")}
          </div>
        ) : docQ.isError ? (
          <div className="py-2 text-warning">{tt("navRail.voiceNotice.loadFailed")}</div>
        ) : docQ.data?.content ? (
          // doc.content 是后端受信任的 markdown,本仓 Markdown 组件 rehypeSanitize 兜底
          <Markdown content={docQ.data.content} />
        ) : null}

        {hasLinks ? (
          <p className="mt-3">
            {tt("navRail.voiceNotice.detailsPrefix")}
            {feedbackPrivacyUrl ? (
              <a
                href={feedbackPrivacyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                {tt("navRail.voiceSettings.privacyPolicy")}
              </a>
            ) : null}
            {feedbackPrivacyUrl && feedbackUserAgreementUrl
              ? tt("navRail.voiceNotice.and")
              : null}
            {feedbackUserAgreementUrl ? (
              <a
                href={feedbackUserAgreementUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                {tt("navRail.voiceSettings.userAgreement")}
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
    </BaseDialog>
  );
}

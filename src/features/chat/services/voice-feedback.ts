/**
 * VoiceFeedback — ASR 反馈上报服务(1:1 复刻上游 c0a6f1ea VoiceFeedback.ts)。
 *
 * **作用**:用户用 voice 录音 → ASR 转写出 modelText → 用户可能编辑 → 发送 userText。
 * 把 (modelText, userText) 配对 + 原始 audio 上报给后端 `feedback_url`,用于改进 ASR 模型。
 *
 * **生命周期**:
 *   1. init(feedbackUrl):从 voice config 拿 `feedback_url` 初始化 singleton
 *   2. onTranscribeResult({utteranceId, modelText, source, audioBlob, asrParams}):
 *      - 转写完成时调用,记录 pending 项
 *      - source="local" + 有 audioBlob → 立即 uploadLocal(送 audio + metadata,供 server
 *        训练本地模型);source="remote" 不送 audio(remote 后端自己有)
 *   3. submitAll(userText):用户实际"采纳"的最终文本 → 给每个 pending 项 uploadFinal,
 *      送 modelText vs userText 对照(server 据此评估 ASR 准确率)
 *   4. disable():用户关闭"允许上报"时调,abort 进行中请求 + 清 pending
 *
 * **隐私**:VoiceFeedback 是否启用由 useSpaceFeedbackSetting hook 控制
 *   (voice_feedback_on=1 才调 enable);未启用时所有方法 no-op。
 *
 * **依赖**:仅 fetch + AbortController,无 React/SDK 依赖,纯 service。
 */

export interface AsrParams {
  contextText?: string;
  chatContext?: string;
  personalContext?: string;
  memberContext?: string;
  mode?: string;
  channelType?: number;
  model?: string;
  allowFeedback?: boolean;
}

interface PendingUtterance {
  utteranceId: string;
  modelText: string;
  source: "local" | "remote";
  requestId?: string;
  scene?: string;
  audioBlob?: Blob;
  timestamp: number;
  asrParams?: AsrParams;
}

export class VoiceFeedback {
  private static instance: VoiceFeedback | null = null;
  private feedbackUrl: string;
  private pending = new Map<string, PendingUtterance>();
  private readonly EXPIRE_MS = 120_000;
  private disabled = false;
  private abortControllers = new Set<AbortController>();

  private constructor(feedbackUrl: string) {
    this.feedbackUrl = feedbackUrl;
  }

  static init(feedbackUrl?: string): void {
    if (!feedbackUrl) {
      VoiceFeedback.instance = null;
      return;
    }
    VoiceFeedback.instance = new VoiceFeedback(feedbackUrl.replace(/\/+$/, ""));
  }

  static shared(): VoiceFeedback | null {
    return VoiceFeedback.instance;
  }

  static destroy(): void {
    if (VoiceFeedback.instance) {
      VoiceFeedback.instance.disable();
      VoiceFeedback.instance = null;
    }
  }

  disable(): void {
    this.disabled = true;
    this.pending.clear();
    for (const c of this.abortControllers) c.abort();
    this.abortControllers.clear();
  }

  enable(url?: string): void {
    if (!VoiceFeedback.instance) {
      if (url) VoiceFeedback.init(url);
      return;
    }
    if (url) VoiceFeedback.instance.feedbackUrl = url.replace(/\/+$/, "");
    VoiceFeedback.instance.disabled = false;
  }

  onTranscribeResult(params: {
    utteranceId: string;
    modelText: string;
    source: "local" | "remote";
    requestId?: string;
    scene?: string;
    audioBlob?: Blob;
    asrParams?: AsrParams;
  }): void {
    if (this.disabled) return;
    this.pending.set(params.utteranceId, { ...params, timestamp: Date.now() });
    if (params.source === "local" && params.audioBlob) {
      this.uploadLocal(this.pending.get(params.utteranceId)!).catch(() => {});
    }
    this.cleanExpired();
  }

  submitAll(userText: string): void {
    for (const entry of this.pending.values()) {
      this.uploadFinal(entry, userText).catch(() => {});
    }
    this.pending.clear();
  }

  private async uploadLocal(u: PendingUtterance): Promise<void> {
    if (!u.audioBlob) return;
    const controller = new AbortController();
    this.abortControllers.add(controller);
    try {
      const form = new FormData();
      form.append("audio", u.audioBlob, `${u.utteranceId}.webm`);
      // metadata 包含 ASR 参数(对齐上游 9d1fa159):server 训练本地模型时知道当时
      // 用户的 context / mode / channel 等,有助于场景化优化
      form.append(
        "metadata",
        JSON.stringify({
          utterance_id: u.utteranceId,
          text: u.modelText,
          source: u.source,
          scene: u.scene || "",
          context_text: u.asrParams?.contextText || "",
          chat_context: u.asrParams?.chatContext || "",
          personal_context: u.asrParams?.personalContext || "",
          member_context: u.asrParams?.memberContext || "",
          mode: u.asrParams?.mode || "",
          channel_type: u.asrParams?.channelType ?? 0,
          model: u.asrParams?.model || "",
          allow_feedback: u.asrParams?.allowFeedback ?? false,
        }),
      );
      await fetch(`${this.feedbackUrl}/local`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    } finally {
      this.abortControllers.delete(controller);
    }
  }

  private async uploadFinal(u: PendingUtterance, userText: string): Promise<void> {
    const controller = new AbortController();
    this.abortControllers.add(controller);
    try {
      await fetch(`${this.feedbackUrl}/final`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utterance_id: u.utteranceId,
          model_text: u.modelText,
          user_text: userText,
          source: u.source,
          request_id: u.requestId || "",
          scene: u.scene || "",
          ts: Date.now(),
        }),
        signal: controller.signal,
      });
    } finally {
      this.abortControllers.delete(controller);
    }
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.pending) {
      if (now - entry.timestamp > this.EXPIRE_MS) {
        this.pending.delete(id);
      }
    }
  }
}

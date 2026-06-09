import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Camera, Check, Edit2, MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { userDetailQueryKey, userDetailQueryOptions } from "@/features/base/queries/user.query";
import { applyFriend, setUserRemark } from "@/features/contacts/api/friends.api";
import {
  getAgentReportStatus,
  setBotDescription,
  uploadUserAvatar,
} from "@/features/base/api/endpoints/robot.api";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { InlineEditRow } from "@/features/base/components/section-form/inline-edit-row";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface BotDetailModalProps {
  uid: string | null;
  onClose: () => void;
}

/**
 * AI bot 名片弹窗(对应旧 dmworkbase Components/BotDetailModal),1:1 复刻 + Phase C 走 BaseDialog。
 *
 * - 头部:头像(Owner hover 显 camera overlay,click 上传) + name + AiBadge +
 *   @username + **OctoPush 上报状态 chip**(Owner 才显示)
 * - 简介:Owner hover 显 ✏️ inline 编辑
 * - **备注名**(对齐上游 ee4275b4 / #220):已加好友(isFriend)时显示备注名 inline 编辑,
 *   走 setUserRemark API + invalidate userDetailQuery + 刷 SDK channelInfo cache(让群消息
 *   senderDisplay 即时反映新备注,跟 user-info-modal 同款模式)
 * - 创建者 / 命令(若有)
 * - 底部:已加好友 → 已添加 + 发消息;未加好友 → "添加"按钮 + inline applyRemark Input
 */
export function BotDetailModal({ uid, onClose }: BotDetailModalProps) {
  const t = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery(userDetailQueryOptions(uid));

  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [showApplyInput, setShowApplyInput] = useState(false);
  const [applyRemark, setApplyRemark] = useState("");
  const [remarkEditing, setRemarkEditing] = useState(false);

  const invalidate = () => {
    if (uid) void qc.invalidateQueries({ queryKey: userDetailQueryKey(uid) });
  };

  const isOwner = !!data?.bot_creator_uid && !!myUid && data.bot_creator_uid === myUid;

  const { data: reported } = useQuery({
    queryKey: ["agent-card", "report-status", uid ?? "_"],
    queryFn: () => getAgentReportStatus(uid!),
    enabled: !!uid && isOwner,
    staleTime: 30 * 1000,
  });

  const uploadAvatarMu = useMutation({
    mutationFn: (file: File) => uploadUserAvatar(uid!, file),
    onSuccess: () => {
      void WKSDK.shared().channelManager.fetchChannelInfo(new Channel(uid!, ChannelTypePerson));
      invalidate();
      toast.success(t("base.botDetail.avatarUpdated"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("base.botDetail.avatarUploadFailedRetry")),
  });

  const updateDescMu = useMutation({
    mutationFn: (desc: string) => setBotDescription(uid!, desc),
    onSuccess: () => {
      invalidate();
      toast.success(t("base.botDetail.descUpdated"));
      setEditingDesc(false);
      setDescDraft("");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("base.botDetail.descUpdateFailed")),
  });

  const applyMu = useMutation({
    mutationFn: () =>
      applyFriend({
        to_uid: uid!,
        remark: applyRemark.trim(),
        vercode: data?.vercode ?? "",
      }),
    onSuccess: () => {
      invalidate();
      toast.success(t("base.botDetail.applySent"));
      setShowApplyInput(false);
      setApplyRemark("");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("base.botDetail.applyFailed")),
  });

  // remark 编辑(对齐上游 ee4275b4):save 后 invalidate user query + 刷 SDK channelInfo
  // cache,让群消息 senderDisplay 即时反映新备注(跟 user-info-modal 同款模式)
  const remarkMu = useMutation({
    mutationFn: (remark: string) => setUserRemark(uid!, remark),
    onSuccess: () => {
      invalidate();
      if (uid) {
        void WKSDK.shared().channelManager.fetchChannelInfo(new Channel(uid, ChannelTypePerson));
      }
      toast.success(t("base.botDetail.remarkUpdated"));
      setRemarkEditing(false);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("base.botDetail.remarkUpdateFailed")),
  });

  const channel = uid ? new Channel(uid, ChannelTypePerson) : null;
  const name = data?.name || uid || "";
  const username = data?.username;
  const noDescription = t("base.botDetail.noDescription");
  const description = data?.bot_description || data?.description || data?.bio || noDescription;
  const isFriend = data?.follow === 1;

  const handleAvatarClick = () => {
    if (!isOwner || uploadAvatarMu.isPending) return;
    fileInputRef.current?.click();
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadAvatarMu.mutate(file);
  };

  const handleStartEditDesc = () => {
    if (!isOwner) return;
    setDescDraft(description === noDescription ? "" : description);
    setEditingDesc(true);
  };

  const handleShowApply = () => {
    setApplyRemark(t("base.botDetail.applyToBotMessage", { values: { name } }));
    setShowApplyInput(true);
  };

  const handleSubmitApply = () => {
    if (applyRemark.trim() && !applyMu.isPending) {
      applyMu.mutate();
    }
  };
  void currentSpaceId; // 旧版申请会携带 space_id,新版 ofetch 端可在拦截器加,这里 reserved

  const handleMessage = () => {
    if (!channel) return;
    chatSelectedActions.select(channel);
    onClose();
  };

  // OctoPush chip(对齐旧 BotDetailModal.render JSX 行 410-437)
  const chip =
    reported === true
      ? {
          cls: "bg-[rgba(34,197,94,0.1)] text-[#16a34a]",
          icon: "✅",
          text: t("base.botDetail.reported"),
          showHelp: false,
        }
      : reported === false
        ? {
            cls: "bg-[rgba(148,163,184,0.15)] text-[#64748b]",
            icon: "🔌",
            text: t("base.botDetail.notReported"),
            showHelp: true,
          }
        : null;

  return (
    <BaseDialog
      open={!!uid}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="md"
      description={
        name ? t("base.botDetail.cardOf", { values: { name } }) : t("base.botDetail.cardFallback")
      }
    >
      {isLoading || !channel ? (
        <div className="flex h-64 items-center justify-center text-sm text-text-tertiary">
          {t("base.common.loading")}
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2 px-6 pt-2 pb-4">
            <div
              role={isOwner ? "button" : undefined}
              tabIndex={isOwner ? 0 : undefined}
              onClick={handleAvatarClick}
              onKeyDown={(e) => {
                if (isOwner && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  handleAvatarClick();
                }
              }}
              className={`group relative ${isOwner ? "cursor-pointer" : ""}`}
            >
              <ChannelAvatar channel={channel} size={64} title={name} />
              {isOwner ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
                  {uploadAvatarMu.isPending ? (
                    <span className="text-xs text-white">{t("base.botDetail.uploading")}</span>
                  ) : (
                    <Camera size={20} className="text-white" />
                  )}
                </div>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileChange}
              onClick={(e) => ((e.target as HTMLInputElement).value = "")}
            />
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">{name}</h2>
              <AiBadge size="small" />
            </div>
            {username ? (
              <span className="font-mono text-xs text-text-tertiary">@{username}</span>
            ) : null}
            {isOwner && chip ? (
              <span
                className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium tracking-[0.3px] ${chip.cls}`}
              >
                <span className="text-[11px] leading-none">{chip.icon}</span>
                {chip.text}
                {chip.showHelp ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t("base.common.help")}
                        className="ml-1 inline-flex h-[14px] w-[14px] items-center justify-center rounded-full border border-[#cbd5e1] text-[10px] font-semibold leading-none text-[#64748b] hover:bg-white"
                      >
                        ?
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("base.botDetail.reportHelp")}</TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
            ) : null}
          </div>

          <div className="border-t border-border-subtle px-6 py-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-xs font-medium text-text-tertiary">
                {t("base.botDetail.intro")}
              </h3>
              {isOwner && !editingDesc ? (
                <button
                  type="button"
                  onClick={handleStartEditDesc}
                  aria-label={t("base.botDetail.editIntro")}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <Edit2 size={12} />
                </button>
              ) : null}
            </div>
            {editingDesc ? (
              <div className="flex flex-col gap-2">
                <textarea
                  autoFocus
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  rows={4}
                  placeholder={t("base.botDetail.introPlaceholder")}
                  className="resize-none rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="tertiary"
                    theme="borderless"
                    size="small"
                    onClick={() => {
                      setEditingDesc(false);
                      setDescDraft("");
                    }}
                  >
                    {t("base.common.cancel")}
                  </Button>
                  <Button
                    type="primary"
                    theme="solid"
                    size="small"
                    loading={updateDescMu.isPending}
                    onClick={() => updateDescMu.mutate(descDraft)}
                  >
                    {t("base.common.save")}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                {description}
              </p>
            )}
          </div>

          {isFriend ? (
            <div className="px-4 py-3">
              <SectionGroup>
                <InlineEditRow
                  title={t("base.botDetail.remark")}
                  value={data?.remark ?? ""}
                  placeholder={t("base.botDetail.remarkPlaceholder")}
                  canEdit
                  maxLength={20}
                  pending={remarkMu.isPending}
                  editing={remarkEditing}
                  onEnterEdit={() => setRemarkEditing(true)}
                  onCancel={() => setRemarkEditing(false)}
                  onSave={(v) => remarkMu.mutate(v)}
                />
              </SectionGroup>
            </div>
          ) : null}

          {data?.bot_creator_name || data?.bot_commands ? (
            <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 border-t border-border-subtle px-6 py-4 text-xs">
              {data?.bot_creator_name ? (
                <>
                  <dt className="text-text-tertiary">{t("base.botDetail.creator")}</dt>
                  <dd className="text-text-primary">{data.bot_creator_name}</dd>
                </>
              ) : null}
              {data?.bot_commands ? (
                <>
                  <dt className="text-text-tertiary">{t("base.botDetail.commands")}</dt>
                  <dd className="font-mono whitespace-pre-wrap text-text-primary">
                    {data.bot_commands}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}

          <div className="flex shrink-0 flex-col gap-2 border-t border-border-subtle px-6 py-4">
            {isFriend ? (
              <div className="flex items-center justify-center gap-2">
                <Button type="tertiary" theme="borderless" disabled>
                  <Check size={14} />
                  {t("base.botDetail.added")}
                </Button>
                <Button type="primary" theme="solid" onClick={handleMessage}>
                  <MessageCircle size={14} />
                  {t("base.botDetail.sendMessageShort")}
                </Button>
              </div>
            ) : showApplyInput ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={applyRemark}
                  onChange={(e) => setApplyRemark(e.target.value)}
                  placeholder={t("base.botDetail.applyPlaceholder")}
                  className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="tertiary"
                    theme="borderless"
                    size="small"
                    onClick={() => {
                      setShowApplyInput(false);
                      setApplyRemark("");
                    }}
                  >
                    {t("base.common.cancel")}
                  </Button>
                  <Button
                    type="primary"
                    theme="solid"
                    size="small"
                    loading={applyMu.isPending}
                    disabled={!applyRemark.trim()}
                    onClick={handleSubmitApply}
                  >
                    {t("base.botDetail.sendApply")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <Button type="primary" theme="solid" onClick={handleShowApply}>
                  <Plus size={14} />
                  {t("base.botDetail.add")}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </BaseDialog>
  );
}

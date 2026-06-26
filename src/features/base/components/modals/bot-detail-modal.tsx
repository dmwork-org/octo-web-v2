import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Camera, Check, ChevronRight, Edit2, MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { message } from "@/components/ui/message";
import { useT } from "@/lib/i18n/use-t";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ImagePreviewModal } from "@/features/chat/components/image-preview-modal";
import { useChannelAvatarUrl } from "@/features/chat/hooks/use-channel-avatar-url.hook";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { ClawInfoModal } from "@/features/base/components/claw/claw-info-modal";
import { userDetailQueryKey, userDetailQueryOptions } from "@/features/base/queries/user.query";
import { applyFriend, setUserRemark } from "@/features/contacts/api/friends.api";
import {
  getAgentReportStatus,
  setBotDescription,
  uploadUserAvatar,
} from "@/features/base/api/endpoints/robot.api";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import {
  DrilldownDialog,
  type DrilldownDialogPage,
} from "@/features/base/components/overlay/drilldown-dialog";
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { NavRow } from "@/features/base/components/section-form/nav-row";
import { InlineEditRow } from "@/features/base/components/section-form/inline-edit-row";
import {
  BotManageMenuPage,
  MentionFreeListPage,
} from "@/features/chat/components/bot-manage-pages";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface BotDetailModalProps {
  uid: string | null;
  onClose: () => void;
}

/**
 * AI bot 名片弹窗 — **三页同容器下钻**(对齐上游 e7c5e0be / #235,本仓用通用
 * DrilldownDialog 替代老仓 WKModal+RoutePage,避免"中央 dialog + 右侧抽屉"形态割裂):
 *
 *   detail(根)── owner-only ⚙ Bot 管理 ──▶ manage 菜单 ──▶ mention-free 群列表
 *
 * 切 bot uid 时 DrilldownDialog `resetKey={uid}` 自动复位栈到 detail 根页,
 * 避免上个 bot 的下钻状态串台。
 */

type BotDetailPage = "detail" | "manage" | "mention-free";

export function BotDetailModal({ uid, onClose }: BotDetailModalProps) {
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const handleClose = () => {
    setAvatarPreviewOpen(false);
    onClose();
  };

  return (
    <DrilldownDialog<BotDetailPage>
      open={!!uid}
      onClose={handleClose}
      size="md"
      closeOnMask={!avatarPreviewOpen}
      rootKey="detail"
      resetKey={uid}
      pages={buildPages(uid, handleClose, avatarPreviewOpen, setAvatarPreviewOpen)}
    />
  );
}

function buildPages(
  uid: string | null,
  onClose: () => void,
  avatarPreviewOpen: boolean,
  setAvatarPreviewOpen: (open: boolean) => void,
): Record<BotDetailPage, DrilldownDialogPage<BotDetailPage>> {
  return {
    detail: {
      title: <BotDetailTitle uid={uid} />,
      render: (nav) => (
        <BotDetailContent
          uid={uid}
          onClose={onClose}
          onOpenManage={() => nav.push("manage")}
          avatarPreviewOpen={avatarPreviewOpen}
          setAvatarPreviewOpen={setAvatarPreviewOpen}
        />
      ),
    },
    manage: {
      title: <BotManageTitle />,
      render: (nav) => <BotManageMenuPage onPickMentionFree={() => nav.push("mention-free")} />,
    },
    "mention-free": {
      title: <MentionFreeTitle />,
      height: "sm",
      contentClassName: "overflow-hidden",
      render: () => (uid ? <MentionFreeListPage robotId={uid} /> : null),
    },
  };
}

function BotDetailTitle({ uid }: { uid: string | null }) {
  const t = useT();
  const { data } = useQuery(userDetailQueryOptions(uid));
  return <>{data?.name || uid || t("base.botDetail.cardFallback")}</>;
}

function BotManageTitle() {
  const t = useT();
  return <>{t("base.botManage.title")}</>;
}

function MentionFreeTitle() {
  const t = useT();
  return <>{t("base.botManage.mentionFree.title")}</>;
}

interface BotDetailContentProps {
  uid: string | null;
  onClose: () => void;
  onOpenManage: () => void;
  avatarPreviewOpen: boolean;
  setAvatarPreviewOpen: (open: boolean) => void;
}

function BotDetailContent({
  uid,
  onClose,
  onOpenManage,
  avatarPreviewOpen,
  setAvatarPreviewOpen,
}: BotDetailContentProps) {
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
  const [showClawInfo, setShowClawInfo] = useState(false);

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
      message.success(t("base.botDetail.avatarUpdated"));
    },
    onError: (err) =>
      message.error(
        err instanceof Error ? err.message : t("base.botDetail.avatarUploadFailedRetry"),
      ),
  });

  const updateDescMu = useMutation({
    mutationFn: (desc: string) => setBotDescription(uid!, desc),
    onSuccess: () => {
      invalidate();
      message.success(t("base.botDetail.descUpdated"));
      setEditingDesc(false);
      setDescDraft("");
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("base.botDetail.descUpdateFailed")),
  });

  const applyMu = useMutation({
    mutationFn: () =>
      applyFriend({ to_uid: uid!, remark: applyRemark.trim(), vercode: data?.vercode ?? "" }),
    onSuccess: () => {
      invalidate();
      message.success(t("base.botDetail.applySent"));
      setShowApplyInput(false);
      setApplyRemark("");
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("base.botDetail.applyFailed")),
  });

  const remarkMu = useMutation({
    mutationFn: (remark: string) => setUserRemark(uid!, remark),
    onSuccess: () => {
      invalidate();
      if (uid) {
        void WKSDK.shared().channelManager.fetchChannelInfo(new Channel(uid, ChannelTypePerson));
      }
      message.success(t("base.botDetail.remarkUpdated"));
      setRemarkEditing(false);
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("base.botDetail.remarkUpdateFailed")),
  });

  const channel = uid ? new Channel(uid, ChannelTypePerson) : null;
  const botName = data?.name || uid || "";
  const remark = data?.remark?.trim() ?? "";
  const name = remark || botName;
  const noDescription = t("base.botDetail.noDescription");
  const description = data?.bot_description || data?.description || data?.bio || noDescription;
  const isFriend = data?.follow === 1;
  const avatarUrl = useChannelAvatarUrl(channel);

  void currentSpaceId;

  if (isLoading || !channel) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-text-tertiary">
        {t("base.common.loading")}
      </div>
    );
  }

  const handleAvatarUploadClick = () => {
    if (uploadAvatarMu.isPending) return;
    fileInputRef.current?.click();
  };

  return (
    <>
      <div className="flex shrink-0 items-start gap-4 px-6 pt-2 pb-4">
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label={t("imageRenderer.viewLargeImage")}
            disabled={!avatarUrl}
            onClick={() => {
              if (avatarUrl) setAvatarPreviewOpen(true);
            }}
            className="block cursor-zoom-in rounded-full focus:outline-none focus:ring-2 focus:ring-brand/35 disabled:cursor-default"
          >
            <ChannelAvatar channel={channel} size={64} title={name} />
          </button>
          {isOwner ? (
            <button
              type="button"
              aria-label={t("base.botDetail.editAvatar")}
              title={t("base.botDetail.editAvatar")}
              onClick={(e) => {
                e.stopPropagation();
                handleAvatarUploadClick();
              }}
              className="absolute right-[-2px] bottom-[-2px] flex h-6 w-6 items-center justify-center rounded-full border border-bg-surface bg-black/65 text-white shadow-sm transition-colors hover:bg-black/80"
            >
              {uploadAvatarMu.isPending ? (
                <span className="text-[9px] leading-none">{t("base.botDetail.uploading")}</span>
              ) : (
                <Camera size={13} />
              )}
            </button>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) uploadAvatarMu.mutate(file);
          }}
          onClick={(e) => ((e.target as HTMLInputElement).value = "")}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-text-primary">{name}</h2>
            <AiBadge size="small" />
          </div>
          {isOwner ? (
            <ReportChip reported={reported} onViewClaw={() => setShowClawInfo(true)} />
          ) : null}
        </div>
      </div>

      <SectionGroup>
        <InlineEditRow
          title={t("base.botDetail.remark")}
          value={data?.remark ?? ""}
          placeholder={t("base.botDetail.remarkPlaceholder")}
          canEdit
          maxLength={30}
          pending={remarkMu.isPending}
          editing={remarkEditing}
          onEnterEdit={() => setRemarkEditing(true)}
          onCancel={() => setRemarkEditing(false)}
          onSave={(v) => remarkMu.mutate(v)}
        />
        {remark ? (
          <div className="flex w-full items-center gap-2 px-4 py-2.5">
            <span className="flex-1 truncate text-[13px] text-text-primary">
              {t("base.botDetail.nickname")}
            </span>
            <span className="shrink-0 max-w-[60%] truncate text-[12px] text-text-tertiary">
              {botName}
            </span>
          </div>
        ) : null}
      </SectionGroup>

      <SectionGroup>
        <div className="px-4 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] text-text-tertiary">{t("base.botDetail.intro")}</span>
            {isOwner && !editingDesc ? (
              <button
                type="button"
                onClick={() => {
                  setDescDraft(description === noDescription ? "" : description);
                  setEditingDesc(true);
                }}
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
            <div className="max-h-[120px] overflow-y-auto">
              <p className="break-words whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">
                {description}
              </p>
            </div>
          )}
        </div>
      </SectionGroup>

      {data?.bot_creator_name || data?.bot_commands ? (
        <SectionGroup>
          {data?.bot_creator_name ? (
            <NavRow title={t("base.botDetail.creator")} subTitle={data.bot_creator_name} />
          ) : null}
          {data?.bot_commands ? (
            <NavRow title={t("base.botDetail.commands")} subTitle={data.bot_commands} />
          ) : null}
        </SectionGroup>
      ) : null}

      {isOwner ? (
        <SectionGroup>
          <NavRow
            title={t("base.botManage.entry")}
            right={<ChevronRight size={16} className="text-text-tertiary" />}
            onClick={onOpenManage}
          />
        </SectionGroup>
      ) : null}

      <div className="flex shrink-0 flex-col gap-2 border-t border-border-subtle px-6 py-4">
        {isFriend ? (
          <div className="flex items-center justify-center gap-2">
            <Button type="tertiary" theme="borderless" disabled>
              <Check size={14} />
              {t("base.botDetail.added")}
            </Button>
            <Button
              type="primary"
              theme="solid"
              onClick={() => {
                if (channel) {
                  chatSelectedActions.select(channel);
                  onClose();
                }
              }}
            >
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
                onClick={() => {
                  if (applyRemark.trim() && !applyMu.isPending) applyMu.mutate();
                }}
              >
                {t("base.botDetail.sendApply")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <Button
              type="primary"
              theme="solid"
              onClick={() => {
                setApplyRemark(t("base.botDetail.applyToBotMessage", { values: { name } }));
                setShowApplyInput(true);
              }}
            >
              <Plus size={14} />
              {t("base.botDetail.add")}
            </Button>
          </div>
        )}
      </div>

      {avatarPreviewOpen && avatarUrl ? (
        <ImagePreviewModal src={avatarUrl} onClose={() => setAvatarPreviewOpen(false)} />
      ) : null}
      {uid && showClawInfo ? (
        <ClawInfoModal
          botId={uid}
          botName={data?.remark || data?.name || undefined}
          open={showClawInfo}
          onClose={() => setShowClawInfo(false)}
        />
      ) : null}
    </>
  );
}

/** OctoPush 上报状态 chip + 查看龙虾信息按钮(owner-only,reported=true 时按钮可点) */
function ReportChip({
  reported,
  onViewClaw,
}: {
  reported: boolean | null | undefined;
  onViewClaw: () => void;
}) {
  const t = useT();
  if (reported === true) {
    return (
      <div className="mt-1.5 inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-[rgba(34,197,94,0.1)] px-2 py-0.5 text-[11px] font-medium tracking-[0.3px] text-[#16a34a]">
          <span className="text-[11px] leading-none">✅</span>
          {t("base.botDetail.reported")}
        </span>
        <button
          type="button"
          onClick={onViewClaw}
          className="inline-flex items-center gap-1 rounded-md border border-border-default px-2 py-0.5 text-[11px] font-medium text-text-primary hover:bg-bg-hover"
        >
          <span className="text-[11px] leading-none">🦞</span>
          {t("base.botDetail.viewClawInfo")}
        </button>
      </div>
    );
  }
  if (reported === false) {
    return (
      <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-[rgba(148,163,184,0.15)] px-2 py-0.5 text-[11px] font-medium tracking-[0.3px] text-[#64748b]">
        <span className="text-[11px] leading-none">🔌</span>
        {t("base.botDetail.notReported")}
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
      </span>
    );
  }
  return null;
}

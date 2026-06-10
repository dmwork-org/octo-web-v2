import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Camera, Check, ChevronRight, Edit2, MessageCircle, Plus, Settings } from "lucide-react";
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
import {
  DrilldownDialog,
  type DrilldownDialogPage,
} from "@/features/base/components/overlay/drilldown-dialog";
import { SectionGroup } from "@/features/base/components/section-form/section-group";
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
  return (
    <DrilldownDialog<BotDetailPage>
      open={!!uid}
      onClose={onClose}
      size="md"
      rootKey="detail"
      resetKey={uid}
      pages={buildPages(uid, onClose)}
    />
  );
}

function buildPages(
  uid: string | null,
  onClose: () => void,
): Record<BotDetailPage, DrilldownDialogPage<BotDetailPage>> {
  return {
    detail: {
      title: <BotDetailTitle uid={uid} />,
      render: (nav) => (
        <BotDetailContent uid={uid} onClose={onClose} onOpenManage={() => nav.push("manage")} />
      ),
    },
    manage: {
      title: <BotManageTitle />,
      render: (nav) => (
        <BotManageMenuPage onPickMentionFree={() => nav.push("mention-free")} />
      ),
    },
    "mention-free": {
      title: <MentionFreeTitle />,
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
}

function BotDetailContent({ uid, onClose, onOpenManage }: BotDetailContentProps) {
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
      applyFriend({ to_uid: uid!, remark: applyRemark.trim(), vercode: data?.vercode ?? "" }),
    onSuccess: () => {
      invalidate();
      toast.success(t("base.botDetail.applySent"));
      setShowApplyInput(false);
      setApplyRemark("");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("base.botDetail.applyFailed")),
  });

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

  void currentSpaceId;

  if (isLoading || !channel) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-text-tertiary">
        {t("base.common.loading")}
      </div>
    );
  }

  const handleAvatarClick = () => {
    if (!isOwner || uploadAvatarMu.isPending) return;
    fileInputRef.current?.click();
  };

  return (
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
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) uploadAvatarMu.mutate(file);
          }}
          onClick={(e) => ((e.target as HTMLInputElement).value = "")}
        />
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-primary">{name}</h2>
          <AiBadge size="small" />
        </div>
        {username ? (
          <span className="font-mono text-xs text-text-tertiary">@{username}</span>
        ) : null}
        {isOwner ? <ReportChip reported={reported} /> : null}
      </div>

      <div className="border-t border-border-subtle px-6 py-4">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-xs font-medium text-text-tertiary">{t("base.botDetail.intro")}</h3>
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

      {isOwner ? (
        <div className="border-t border-border-subtle px-6 py-3">
          <button
            type="button"
            onClick={onOpenManage}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-bg-hover"
          >
            <Settings size={16} className="shrink-0 text-text-tertiary" />
            <span className="flex-1 text-sm text-text-primary">{t("base.botManage.entry")}</span>
            <ChevronRight size={14} className="shrink-0 text-text-tertiary" />
          </button>
        </div>
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
    </>
  );
}

/** OctoPush 上报状态 chip(owner-only,根据 reported 渲染) */
function ReportChip({ reported }: { reported: boolean | null | undefined }) {
  const t = useT();
  if (reported === true) {
    return (
      <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-[rgba(34,197,94,0.1)] px-2 py-0.5 text-[11px] font-medium tracking-[0.3px] text-[#16a34a]">
        <span className="text-[11px] leading-none">✅</span>
        {t("base.botDetail.reported")}
      </span>
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

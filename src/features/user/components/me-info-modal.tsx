import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Check, CheckCircle2, QrCode } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { userDetailQueryKey, userDetailQueryOptions } from "@/features/base/queries/user.query";
import { useSsoProviders } from "@/features/login/hooks/use-sso-providers.hook";
import { useUpdateCurrentUserMutation, useUploadAvatarMutation } from "@/features/user/mutations";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { QrcodeMy } from "@/features/user/components/qrcode-my";
import { PersonaListModal } from "@/features/persona/components/persona-list-modal";
import { isRealnameVerified } from "@/features/base/lib/display-name";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
// section-form 共享原语
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { NavRow } from "@/features/base/components/section-form/nav-row";
import { InlineEditRow } from "@/features/base/components/section-form/inline-edit-row";
import { useT } from "@/lib/i18n/use-t";

interface MeInfoModalProps {
  open: boolean;
  onClose: () => void;
}

function getSexLabel(sex: number, t: (k: string) => string): string {
  if (sex === 1) return t("user.me.sex1");
  if (sex === 2) return t("user.me.sex2");
  return t("user.me.sex0");
}

/** open 翻转时 reset 子面板 + inline 编辑态。 */
function useResetOnClose(
  open: boolean,
  setEditing: (v: string | null) => void,
  setSubpage: (v: Subpage | null) => void,
) {
  useEffect(() => {
    if (!open) {
      setEditing(null);
      setSubpage(null);
    }
  }, [open, setEditing, setSubpage]);
}

type Subpage = "qrcode" | "sex" | "persona";

/**
 * 个人信息弹层 — 主面板 inline 编辑 + 二级独立 modal 模式(对齐 channel-setting-modal)。
 *
 * 浮动元素壳层统一规范 Phase C2 — 走 BaseDialog,**mask='interactive'**(无 mask + 卡片悬浮,
 * 对齐老仓 mask:false 模式)。二级 modal 在 React tree 内自动 z-dialog-secondary。
 *
 * 容器:固定 420×500(老仓 wk-main-sider-meinfo 同款),size=fit + className 控尺寸。
 */
export function MeInfoModal({ open, onClose }: MeInfoModalProps) {
  const t = useT();
  const user = useStore(authStore, (s) => s.user);
  const uid = user?.uid ?? "";
  const [editing, setEditing] = useState<string | null>(null);
  const [subpage, setSubpage] = useState<Subpage | null>(null);
  useResetOnClose(open, setEditing, setSubpage);

  if (!uid) return null;

  return (
    <>
      <BaseDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        size="fit"
        mask="interactive"
        title={t("user.me.title")}
        className="h-[500px] w-[420px]"
      >
        <RootPanel uid={uid} editing={editing} setEditing={setEditing} setSubpage={setSubpage} />
      </BaseDialog>

      <QrcodeMyModal open={subpage === "qrcode"} uid={uid} onClose={() => setSubpage(null)} />
      <SexSelectModal open={subpage === "sex"} uid={uid} onClose={() => setSubpage(null)} />
      <PersonaListModal open={subpage === "persona"} onClose={() => setSubpage(null)} />
    </>
  );
}

// ─── 主面板 row 列表 ──────────────────────────────────────

interface RootPanelProps {
  uid: string;
  editing: string | null;
  setEditing: (v: string | null) => void;
  setSubpage: (v: Subpage | null) => void;
}

function RootPanel({ uid, editing, setEditing, setSubpage }: RootPanelProps) {
  const t = useT();
  const qc = useQueryClient();
  const { data: detail } = useQuery(userDetailQueryOptions(uid));
  const uploadMu = useUploadAvatarMutation(uid);
  const updateMu = useUpdateCurrentUserMutation(uid);
  const { primaryProvider } = useSsoProviders();

  const channel = useMemo(() => new Channel(uid, ChannelTypePerson), [uid]);
  const fileRef = useRef<HTMLInputElement>(null);

  const displayName = detail?.name ?? "";
  const shortNo = detail?.short_no ?? "";
  const sex = detail?.sex ?? 0;
  const realnameVerified = isRealnameVerified({
    real_name: detail?.real_name,
    realname_verified: detail?.realname_verified,
  });

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadMu.mutateAsync(file);
      void qc.invalidateQueries({ queryKey: userDetailQueryKey(uid) });
    } catch {
      // 静默(老仓也无 toast,UI 回滚显旧头像)
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const onSaveName = async (next: string) => {
    try {
      await updateMu.mutateAsync({ name: next });
      setEditing(null);
    } catch {
      // 保持编辑态
    }
  };

  const goVerification = () => {
    if (!primaryProvider?.accountUrl) return;
    const back = encodeURIComponent(window.location.href);
    const url = `${primaryProvider.accountUrl}/profile/info?anchor=verification&return_to=${back}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <SectionGroup>
        <NavRow
          title={t("user.me.avatarRow")}
          right={<ChannelAvatar channel={channel} size={32} title={displayName || uid} />}
          onClick={onPickFile}
        />
        <InlineEditRow
          title={t("user.me.nameRow")}
          value={displayName}
          placeholder={t("user.me.namePlaceholder")}
          canEdit
          maxLength={20}
          pending={updateMu.isPending && editing === "name"}
          editing={editing === "name"}
          onEnterEdit={() => setEditing("name")}
          onCancel={() => setEditing(null)}
          onSave={(v) => void onSaveName(v)}
        />
        <NavRow title={t("user.me.octoIdRow")} subTitle={shortNo || "—"} />
        <NavRow
          title={t("user.me.qrcodeRow")}
          right={<QrCode size={16} className="text-text-tertiary" />}
          onClick={() => setSubpage("qrcode")}
        />
      </SectionGroup>

      <SectionGroup>
        <NavRow
          title={t("user.me.sexRow")}
          subTitle={getSexLabel(sex, t)}
          onClick={() => setSubpage("sex")}
        />
      </SectionGroup>

      <SectionGroup>
        {realnameVerified ? (
          <NavRow
            title={t("user.me.realnameRow")}
            subTitle={(() => {
              const ts = detail?.realname_verified_at;
              if (!ts || ts <= 0) return t("user.me.realnameVerified");
              const ms = ts > 10_000_000_000 ? ts : ts * 1000;
              const d = new Date(ms);
              if (Number.isNaN(d.getTime())) return t("user.me.realnameVerified");
              const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              return t("user.me.realnameVerifiedAt", { values: { date: dateStr } });
            })()}
            right={<CheckCircle2 size={14} className="text-success" />}
          />
        ) : (
          <NavRow
            title={t("user.me.realnameRow")}
            subTitle={
              primaryProvider?.accountUrl ? t("user.me.goVerify") : t("user.me.noVerifyEntry")
            }
            onClick={primaryProvider?.accountUrl ? goVerification : undefined}
          />
        )}
      </SectionGroup>

      <SectionGroup>
        <NavRow title={t("user.me.personaRow")} onClick={() => setSubpage("persona")} />
      </SectionGroup>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => void onFileChange(e)}
        className="hidden"
      />
    </>
  );
}

// ─── 二级 modal:我的二维码 ────────────────────────────────

interface SecondaryModalProps {
  open: boolean;
  uid: string;
  onClose: () => void;
}

function QrcodeMyModal({ open, uid, onClose }: SecondaryModalProps) {
  const t = useT();
  const { data: detail } = useQuery(userDetailQueryOptions(uid));
  const name = detail?.name ?? uid;
  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="fit"
      title={t("user.me.qrcodeTitle")}
      className="w-[360px]"
    >
      <div className="flex flex-col items-center justify-center p-6">
        <QrcodeMy uid={uid} name={name} />
      </div>
    </BaseDialog>
  );
}

// ─── 二级 modal:性别选择 ──────────────────────────────────

function SexSelectModal({ open, uid, onClose }: SecondaryModalProps) {
  const t = useT();
  const { data: detail } = useQuery(userDetailQueryOptions(uid));
  const updateMu = useUpdateCurrentUserMutation(uid);
  const current = detail?.sex ?? 0;

  const onPick = async (v: number) => {
    if (v === current) {
      onClose();
      return;
    }
    try {
      await updateMu.mutateAsync({ sex: v });
      onClose();
    } catch {
      // 失败保持(后端会回拉)
    }
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="fit"
      title={t("user.me.selectSex")}
      className="w-[320px]"
    >
      <div className="py-2">
        <SectionGroup>
          {[0, 1, 2].map((v) => (
            <NavRow
              key={v}
              title={getSexLabel(v, t)}
              right={v === current ? <Check size={16} className="text-brand" /> : null}
              onClick={() => void onPick(v)}
            />
          ))}
        </SectionGroup>
      </div>
    </BaseDialog>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Check, CheckCircle2, QrCode, X } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { userDetailQueryKey, userDetailQueryOptions } from "@/features/base/queries/user.query";
import { useSsoProviders } from "@/features/login/hooks/use-sso-providers.hook";
import { useUpdateCurrentUserMutation, useUploadAvatarMutation } from "@/features/user/mutations";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { QrcodeMy } from "@/features/user/components/qrcode-my";
import { PersonaListModal } from "@/features/persona/components/persona-list-modal";
import { isRealnameVerified } from "@/features/base/lib/display-name";
// section-form 共享原语
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { NavRow } from "@/features/base/components/section-form/nav-row";
import { InlineEditRow } from "@/features/base/components/section-form/inline-edit-row";

interface MeInfoModalProps {
  open: boolean;
  onClose: () => void;
}

const SEX_LABEL: Record<number, string> = { 0: "未设置", 1: "男", 2: "女" };

/** ESC 关闭主面板;抽出命名 hook 满足 no-useeffect-in-component。 */
function useCloseOnEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
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

/** 二级面板 token(对齐 channel-setting-modal 的 subpage 模式)。 */
type Subpage = "qrcode" | "sex" | "persona";

/**
 * 个人信息弹层 — 主面板 inline 编辑 + 二级独立 modal 模式(对齐 channel-setting-modal):
 *
 * **容器**:无 mask 中央卡片 420×500(老仓 wk-main-sider-meinfo `mask: false` + height 500px)。
 *
 * **主面板 7 row**(对齐老仓 MeInfo vm.tsx sections):
 *   Section 1:头像(右侧头像图,点击触发隐藏 file picker → 上传)
 *             名字(InlineEditRow inline 展开 input,maxLength=20;已实名右侧 ✓)
 *             OCTO号(只读 subTitle)
 *             我的二维码(右侧 QrCode icon,点开二级 modal)
 *   Section 2:性别(subTitle 显当前值,点开二级 modal)
 *   Section 3:实名认证(已认证 subTitle 显 `已认证 · YYYY-MM`;未认证点击外跳 IdP)
 *   Section 4:我的分身(点开二级 modal,**不跳路由**)
 *
 * **二级 modal**(独立组件 z-60 盖在主面板 z-50 上,对齐 channel-setting 的二级抽屉):
 *   - `<QrcodeMyModal>`:中央二维码 + 名字
 *   - `<SexSelectModal>`:3 个 NavRow + checkmark,点选自动保存 + 关二级
 *   - `<PersonaListModal>`:分身列表(active toggle + 删除 + 新建);管理 Scope 关本 modal +
 *     跳 /personadetail(详情整页 modal 嵌不下)
 *
 * 头像 / 实名 还是不开二级 modal(file picker / 新窗外跳,语义已等价老仓)。
 */
export function MeInfoModal({ open, onClose }: MeInfoModalProps) {
  const user = useStore(authStore, (s) => s.user);
  const uid = user?.uid ?? "";
  const [editing, setEditing] = useState<string | null>(null);
  const [subpage, setSubpage] = useState<Subpage | null>(null);
  useCloseOnEscape(open, onClose);
  useResetOnClose(open, setEditing, setSubpage);

  if (!open || !uid) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="pointer-events-auto flex h-[500px] w-[420px] flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
          <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
            <h2 className="text-sm font-semibold text-text-primary">个人信息</h2>
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex flex-1 flex-col overflow-y-auto py-2">
            <RootPanel
              uid={uid}
              editing={editing}
              setEditing={setEditing}
              setSubpage={setSubpage}
            />
          </div>
        </div>
      </div>

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
      {/* Section 1:头像 / 名字 / OCTO 号 / 二维码 */}
      <SectionGroup>
        <NavRow
          title="头像"
          right={<ChannelAvatar channel={channel} size={32} title={displayName || uid} />}
          onClick={onPickFile}
        />
        <InlineEditRow
          title="名字"
          value={displayName}
          placeholder="未设置"
          canEdit
          maxLength={20}
          pending={updateMu.isPending && editing === "name"}
          editing={editing === "name"}
          onEnterEdit={() => setEditing("name")}
          onCancel={() => setEditing(null)}
          onSave={(v) => void onSaveName(v)}
        />
        <NavRow title="OCTO号" subTitle={shortNo || "—"} />
        <NavRow
          title="我的二维码"
          right={<QrCode size={16} className="text-text-tertiary" />}
          onClick={() => setSubpage("qrcode")}
        />
      </SectionGroup>

      {/* Section 2:性别 */}
      <SectionGroup>
        <NavRow
          title="性别"
          subTitle={SEX_LABEL[sex] ?? "未设置"}
          onClick={() => setSubpage("sex")}
        />
      </SectionGroup>

      {/* Section 3:实名认证 — 对齐老仓 vm.tsx formatVerifiedAtLabel L319-333:
          显示 `已认证 · YYYY-MM`(来自 realname_verified_at 秒级时间戳);**不显示 real_name**
          (后端字段语义不稳定,曾出现存日期的情况;老仓也只用 verified_at)。 */}
      <SectionGroup>
        {realnameVerified ? (
          <NavRow
            title="实名认证"
            subTitle={(() => {
              const ts = detail?.realname_verified_at;
              if (!ts || ts <= 0) return "已认证";
              const ms = ts > 10_000_000_000 ? ts : ts * 1000;
              const d = new Date(ms);
              if (Number.isNaN(d.getTime())) return "已认证";
              return `已认证 · ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            })()}
            right={<CheckCircle2 size={14} className="text-success" />}
          />
        ) : (
          <NavRow
            title="实名认证"
            subTitle={primaryProvider?.accountUrl ? "去认证" : "未配置认证入口"}
            onClick={primaryProvider?.accountUrl ? goVerification : undefined}
          />
        )}
      </SectionGroup>

      {/* Section 4:我的分身 — 点开二级 modal,不跳路由 */}
      <SectionGroup>
        <NavRow title="我的分身" onClick={() => setSubpage("persona")} />
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

/** ESC 关二级。 */
function useSecondaryEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
}

function QrcodeMyModal({ open, uid, onClose }: SecondaryModalProps) {
  const { data: detail } = useQuery(userDetailQueryOptions(uid));
  useSecondaryEscape(open, onClose);
  if (!open) return null;
  const name = detail?.name ?? uid;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-[360px] flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">我的二维码</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex flex-col items-center justify-center p-6">
          <QrcodeMy uid={uid} name={name} />
        </div>
      </div>
    </div>
  );
}

// ─── 二级 modal:性别选择 ──────────────────────────────────

function SexSelectModal({ open, uid, onClose }: SecondaryModalProps) {
  const { data: detail } = useQuery(userDetailQueryOptions(uid));
  const updateMu = useUpdateCurrentUserMutation(uid);
  useSecondaryEscape(open, onClose);
  if (!open) return null;
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-[320px] flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">选择性别</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>
        <div className="py-2">
          <SectionGroup>
            {[0, 1, 2].map((v) => (
              <NavRow
                key={v}
                title={SEX_LABEL[v]!}
                right={v === current ? <Check size={16} className="text-brand" /> : null}
                onClick={() => void onPick(v)}
              />
            ))}
          </SectionGroup>
        </div>
      </div>
    </div>
  );
}

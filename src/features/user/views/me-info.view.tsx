import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { CheckCircle2 } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { userDetailQueryOptions } from "@/features/base/queries/user.query";
import { useSsoProviders } from "@/features/login/hooks/use-sso-providers.hook";
import { useUpdateCurrentUserMutation } from "@/features/user/mutations";
import { AvatarUpload } from "@/features/user/components/avatar-upload";
import { InlineEditField } from "@/features/user/components/inline-edit-field";
import { SexSelect } from "@/features/user/components/sex-select";
import { QrcodeMy } from "@/features/user/components/qrcode-my";
import { Button } from "@/components/semi-bridge/button";

/**
 * 个人信息页 MeInfo(对齐老仓 dmworkbase Components/MeInfo):
 *
 * **个人资料**:头像 / 昵称(行内编辑,20 限)/ 号码(只读)/ 二维码
 * **偏好设置**:性别(0/1/2)
 * **账号安全**:实名状态(已认证显 ✓ + 真名 + 时间;未认证显跳转按钮)
 *   - 跳转 URL = `{provider.accountUrl}/profile/info?anchor=verification&return_to={current}`
 *   - 回跳后 `?verified=1`,后端 sync_worker 15min 自动同步,前端 invalidate 即可
 */
export function MeInfoView() {
  const user = useStore(authStore, (s) => s.user);
  const uid = user?.uid ?? null;
  const { data: detail } = useQuery(userDetailQueryOptions(uid));
  const updateMu = useUpdateCurrentUserMutation(uid);
  const { primaryProvider } = useSsoProviders();

  const displayName = detail?.name ?? user?.name ?? "";
  const shortNo = detail?.short_no ?? user?.short_no ?? "";
  const avatar = detail?.avatar;

  const realnameVerified = useMemo(() => {
    const v = detail?.realname_verified;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    if (typeof v === "string") return v === "1" || v === "true";
    return false;
  }, [detail?.realname_verified]);

  const onSaveName = async (next: string) => {
    await updateMu.mutateAsync({ name: next });
  };
  const onChangeSex = async (next: number) => {
    await updateMu.mutateAsync({ sex: next });
  };

  const goVerification = () => {
    if (!primaryProvider?.accountUrl) return;
    const back = encodeURIComponent(window.location.href);
    const url = `${primaryProvider.accountUrl}/profile/info?anchor=verification&return_to=${back}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!uid) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        未登录
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-lg font-semibold text-text-primary">个人资料</h1>
      </header>

      <section className="flex flex-col gap-4 rounded-md border border-border-subtle p-4">
        <h2 className="text-xs font-semibold text-text-tertiary">个人资料</h2>
        <AvatarUpload uid={uid} currentAvatar={avatar} name={displayName} />
        <InlineEditField
          label="昵称"
          value={displayName}
          maxLength={20}
          placeholder="点击编辑"
          onSave={onSaveName}
        />
        <div className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-sm text-text-tertiary">号码</span>
          <span className="flex-1 truncate text-sm text-text-primary">{shortNo}</span>
        </div>
        <div>
          <span className="block text-sm text-text-tertiary">我的二维码</span>
          <div className="mt-2">
            <QrcodeMy uid={uid} name={displayName} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-md border border-border-subtle p-4">
        <h2 className="text-xs font-semibold text-text-tertiary">偏好设置</h2>
        <SexSelect value={detail?.sex} onChange={onChangeSex} />
      </section>

      <section className="flex flex-col gap-4 rounded-md border border-border-subtle p-4">
        <h2 className="text-xs font-semibold text-text-tertiary">账号安全</h2>
        <div className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-sm text-text-tertiary">实名认证</span>
          {realnameVerified ? (
            <div className="flex flex-1 items-center gap-2 text-sm text-success">
              <CheckCircle2 size={16} />
              <span>已认证 · {detail?.real_name ?? "已实名"}</span>
            </div>
          ) : (
            <div className="flex flex-1 items-center gap-3">
              <span className="text-sm text-text-tertiary">未认证</span>
              {primaryProvider?.accountUrl ? (
                <Button onClick={goVerification} type="primary" theme="light">
                  去认证
                </Button>
              ) : (
                <span className="text-xs text-text-tertiary">未配置认证入口</span>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

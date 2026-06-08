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
import { useT } from "@/lib/i18n/use-t";

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
  const t = useT();
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
        {t("user.meinfo.notLoggedIn")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-lg font-semibold text-text-primary">{t("user.meinfo.profile")}</h1>
      </header>

      <section className="flex flex-col gap-4 rounded-md border border-border-subtle p-4">
        <h2 className="text-xs font-semibold text-text-tertiary">{t("user.meinfo.profile")}</h2>
        <AvatarUpload uid={uid} currentAvatar={avatar} name={displayName} />
        <InlineEditField
          label={t("user.meinfo.nickname")}
          value={displayName}
          maxLength={20}
          placeholder={t("user.meinfo.nicknamePlaceholder")}
          onSave={onSaveName}
        />
        <div className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-sm text-text-tertiary">
            {t("user.meinfo.shortNo")}
          </span>
          <span className="flex-1 truncate text-sm text-text-primary">{shortNo}</span>
        </div>
        <div>
          <span className="block text-sm text-text-tertiary">{t("user.meinfo.qrcode")}</span>
          <div className="mt-2">
            <QrcodeMy uid={uid} name={displayName} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-md border border-border-subtle p-4">
        <h2 className="text-xs font-semibold text-text-tertiary">{t("user.meinfo.preferences")}</h2>
        <SexSelect value={detail?.sex} onChange={onChangeSex} />
      </section>

      <section className="flex flex-col gap-4 rounded-md border border-border-subtle p-4">
        <h2 className="text-xs font-semibold text-text-tertiary">{t("user.meinfo.security")}</h2>
        <div className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-sm text-text-tertiary">
            {t("user.meinfo.realname")}
          </span>
          {realnameVerified ? (
            <div className="flex flex-1 items-center gap-2 text-sm text-success">
              <CheckCircle2 size={16} />
              <span>
                {t("user.meinfo.verifiedWithName", {
                  values: { name: detail?.real_name ?? t("user.meinfo.verifiedFallback") },
                })}
              </span>
            </div>
          ) : (
            <div className="flex flex-1 items-center gap-3">
              <span className="text-sm text-text-tertiary">{t("user.meinfo.notVerified")}</span>
              {primaryProvider?.accountUrl ? (
                <Button onClick={goVerification} type="primary" theme="light">
                  {t("user.meinfo.goVerify")}
                </Button>
              ) : (
                <span className="text-xs text-text-tertiary">{t("user.meinfo.noVerifyEntry")}</span>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

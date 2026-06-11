import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { useT } from "@/lib/i18n/use-t";

interface LoginMigrationModalProps {
  open: boolean;
  /** 派生自 provider.accountUrl 的 Aegis 注册页 URL;为 undefined 时隐藏注册 CTA。 */
  registerUrl?: string;
  /** 用户点"我已了解,继续登录"→ 触发 onContinue 回调(由 caller 写 ack + 起 SSO)。 */
  onContinue: () => void;
  /** mask / X / Esc 关闭 → 仅关 modal,不写 ack,下次仍弹。 */
  onClose: () => void;
}

/**
 * Aegis 账号迁移公告 modal(对齐上游 7de93ff1 LoginMigrationNoticeModal):
 *
 *   ┌─────────────────────────────────────┐
 *   │  登录方式变更公告              ×   │
 *   ├─────────────────────────────────────┤
 *   │  账号迁移提示 · Aegis              │
 *   │  登录认证方式已切换为 Aegis 统一认证 │
 *   │  Web 端已下线原"Octo 邮箱+密码"... │
 *   │                                    │
 *   │  ⚠ 重要:你原有的 Octo 账号密码... │
 *   │                                    │
 *   │  老用户迁移步骤                    │
 *   │  ① 注册统一认证账号 ...           │
 *   │  ② 回到 Octo 登录 ...             │
 *   │  ③ 系统识别原账号                  │
 *   │      ✓ 邮箱一致 / ⚠ 邮箱不一致    │
 *   │  ⚠ 不要跳过绑定 ...               │
 *   ├─────────────────────────────────────┤
 *   │      [去注册 Aegis 账号] [我已了解] │
 *   └─────────────────────────────────────┘
 *
 * UI 用本仓 BaseDialog + tailwind tokens,业务结构对齐上游(3 步 + 2 邮箱场景 + 警告)。
 */
export function LoginMigrationModal({
  open,
  registerUrl,
  onContinue,
  onClose,
}: LoginMigrationModalProps) {
  const t = useT();

  const footer = (
    <div className="flex w-full items-center justify-end gap-2">
      {registerUrl ? (
        <a
          href={registerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center rounded-md border border-border-default bg-bg-surface px-3 text-[13px] font-medium text-text-primary hover:bg-bg-hover"
        >
          {t("login.migration.registerAegis")}
        </a>
      ) : null}
      <button
        type="button"
        onClick={onContinue}
        className="inline-flex h-8 items-center rounded-md bg-[#5b5be5] px-4 text-[13px] font-semibold text-white hover:bg-[#4848d4]"
      >
        {t("login.migration.continueLogin")}
      </button>
    </div>
  );

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="lg"
      height="auto"
      title={t("login.migration.title")}
      footer={footer}
    >
      <div className="flex flex-col gap-5 px-5 py-4 text-[14px] leading-[1.6] text-text-primary">
        <section className="flex flex-col gap-1">
          <div className="text-[11px] font-medium tracking-wide text-[#5b5be5] uppercase">
            {t("login.migration.kicker")}
          </div>
          <div className="text-[17px] font-semibold text-text-primary">
            {t("login.migration.summaryTitle")}
          </div>
          <p className="text-[13px] text-text-secondary">{t("login.migration.summaryBody")}</p>
        </section>

        <section className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px]">
          <span className="shrink-0 font-semibold text-warning">
            {t("login.migration.importantTitle")}
          </span>
          <span className="text-text-secondary">{t("login.migration.importantBody")}</span>
        </section>

        <section className="flex flex-col gap-3">
          <div className="text-[13px] font-semibold text-text-primary">
            {t("login.migration.stepsTitle")}
          </div>
          <StepRow index={1} label={t("login.migration.step1Label")} body={t("login.migration.step1")}>
            <div className="mt-1 text-[12px] text-text-tertiary">{t("login.migration.step1Hint")}</div>
          </StepRow>
          <StepRow index={2} label={t("login.migration.step2Label")} body={t("login.migration.step2")} />
          <StepRow index={3} label={t("login.migration.step3Label")} body={t("login.migration.step3")}>
            <div className="mt-2 flex flex-col gap-2">
              <CaseRow
                variant="success"
                badge={t("login.migration.sameEmailBadge")}
                label={t("login.migration.sameEmailLabel")}
                body={t("login.migration.sameEmail")}
              />
              <CaseRow
                variant="warning"
                badge={t("login.migration.differentEmailBadge")}
                label={t("login.migration.differentEmailLabel")}
                body={t("login.migration.differentEmail")}
              />
            </div>
          </StepRow>
        </section>

        <section className="flex gap-2 rounded-md border border-error/30 bg-error/[0.06] px-3 py-2.5 text-[13px]">
          <span className="shrink-0 font-semibold text-error">
            {t("login.migration.bindWarningTitle")}：
          </span>
          <span className="text-text-secondary">{t("login.migration.bindWarning")}</span>
        </section>
      </div>
    </BaseDialog>
  );
}

interface StepRowProps {
  index: number;
  label: string;
  body: string;
  children?: React.ReactNode;
}

function StepRow({ index, label, body, children }: StepRowProps) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5b5be5] text-[12px] font-semibold text-white">
        {index}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-text-primary">{label}</div>
        <p className="text-[13px] text-text-secondary">{body}</p>
        {children}
      </div>
    </div>
  );
}

interface CaseRowProps {
  variant: "success" | "warning";
  badge: string;
  label: string;
  body: string;
}

function CaseRow({ variant, badge, label, body }: CaseRowProps) {
  const tone =
    variant === "success"
      ? "border-[#34C759]/30 bg-[#34C759]/[0.08]"
      : "border-warning/30 bg-warning/[0.08]";
  const badgeTone =
    variant === "success" ? "bg-[#34C759]/15 text-[#1f7a3a]" : "bg-warning/15 text-warning";
  return (
    <div className={`flex flex-col gap-1 rounded-md border ${tone} px-3 py-2`}>
      <div className="flex items-center gap-2">
        <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${badgeTone}`}>
          {badge}
        </span>
        <span className="text-[13px] font-semibold text-text-primary">{label}</span>
      </div>
      <p className="text-[12px] leading-[1.55] text-text-secondary">{body}</p>
    </div>
  );
}

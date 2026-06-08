import { Building2 } from "lucide-react";
import type { Message } from "wukongimjssdk";
import { toast } from "@/components/semi-bridge/toast";
import { JoinOrganizationContent } from "@/features/base/im/join-organization-content";
import { useT } from "@/lib/i18n/use-t";

/**
 * 邀请加入组织(对应旧 dmworkbase Messages/JoinOrganization JoinOrganizationCell):
 * 组织名 + 邀请人,click → 旧版调 WKApp.shared.baseContext.showJoinOrgInfo
 * (跨 feature 需要 organization feature 配合),本期 click toast P3+ 占位。
 */
export function JoinOrganizationRenderer({ message }: { message: Message }) {
  const t = useT();
  const content = message.content as JoinOrganizationContent;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toast.info(t("joinOrganization.viewInfoNotImplemented"));
      }}
      className="flex w-72 items-center gap-3 rounded-md border border-border-subtle bg-bg-elevated px-3 py-2.5 text-left transition-colors hover:bg-bg-hover"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Building2 size={20} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-text-primary">
          {t("joinOrganization.inviteJoin", {
            values: { org: content.orgName || t("joinOrganization.fallbackOrgName") },
          })}
        </span>
        <span className="truncate text-[11px] text-text-tertiary">
          {content.inviterName
            ? t("joinOrganization.fromInviter", { values: { name: content.inviterName } })
            : t("joinOrganization.viewDetails")}
        </span>
      </div>
    </button>
  );
}

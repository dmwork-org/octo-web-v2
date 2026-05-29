import { MessageContent } from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * 邀请加入组织消息(对应旧 dmworkbase Messages/JoinOrganization):
 * 接收方看到组织名 + 邀请人,click → 旧版调 showJoinOrgInfo(P3+ 跨 feature),
 * 本期 click noop(toast 占位)。
 */
export class JoinOrganizationContent extends MessageContent {
  code = "";
  inviter = "";
  inviterName = "";
  orgId = "";
  orgName = "";

  decodeJSON(content: Record<string, unknown>): void {
    this.code = typeof content.code === "string" ? content.code : "";
    this.inviter = typeof content.inviter === "string" ? content.inviter : "";
    this.inviterName = typeof content.inviter_name === "string" ? content.inviter_name : "";
    this.orgId = typeof content.org_id === "string" ? content.org_id : "";
    this.orgName = typeof content.org_name === "string" ? content.org_name : "";
  }

  encodeJSON(): Record<string, unknown> {
    return {
      code: this.code,
      inviter: this.inviter,
      inviter_name: this.inviterName,
      org_id: this.orgId,
      org_name: this.orgName,
    };
  }

  get contentType(): number {
    return MessageContentTypeConst.joinOrganization;
  }

  get conversationDigest(): string {
    return "[邀请加入组织]";
  }
}

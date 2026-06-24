import { MessageContentTypeConst } from "@/features/base/im/content-types";

export function shouldRenderBareContentType(contentType: number, revoked = false): boolean {
  if (revoked) return true;
  if (contentType === MessageContentTypeConst.screenshot) return true;
  if (contentType === MessageContentTypeConst.threadCreated) return false;
  if (contentType >= 1000 && contentType <= 2000) return true;
  return false;
}

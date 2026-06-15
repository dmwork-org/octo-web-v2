export const INCOMING_WEBHOOK_UID_PREFIX = "iwh_";

export const IncomingWebhookStatus = {
  disabled: 0,
  enabled: 1,
  deleted: 2,
} as const;

export interface IncomingWebhook {
  webhook_id: string;
  group_no: string;
  name: string;
  avatar: string;
  creator_uid: string;
  status: number;
  last_used_at: number;
  call_count: number;
  created_at: number;
}

export interface IncomingWebhookUrls {
  native?: string;
  github?: string;
  wecom?: string;
}

export interface IncomingWebhookCreateResp extends IncomingWebhook {
  token: string;
  url: string;
  urls?: IncomingWebhookUrls;
}

export interface IncomingWebhookUpsertReq {
  name?: string;
  avatar?: string;
  status?: number;
}

export function canManageIncomingWebhook(
  item: Pick<IncomingWebhook, "creator_uid">,
  opts: { isManager: boolean; myUid?: string },
): boolean {
  if (opts.isManager) return true;
  return !!opts.myUid && item.creator_uid === opts.myUid;
}

export function canTestWebhook(item: Pick<IncomingWebhook, "status">): boolean {
  return item.status === IncomingWebhookStatus.enabled;
}

export function buildWebhookUpsertReq(opts: {
  isEdit: boolean;
  isManager: boolean;
  name: string;
  avatar: string;
  webhook?: Pick<IncomingWebhook, "name" | "avatar">;
}): IncomingWebhookUpsertReq | null {
  const trimmedName = opts.name.trim();
  const trimmedAvatar = opts.avatar.trim();
  const req: IncomingWebhookUpsertReq = {};

  if (opts.isEdit && opts.webhook) {
    if (trimmedName && trimmedName !== opts.webhook.name) req.name = trimmedName;
    if (opts.isManager && trimmedAvatar !== (opts.webhook.avatar || "")) {
      req.avatar = trimmedAvatar;
    }
    return Object.keys(req).length === 0 ? null : req;
  }

  if (trimmedName) req.name = trimmedName;
  if (opts.isManager && trimmedAvatar) req.avatar = trimmedAvatar;
  return req;
}

export function buildIncomingWebhookUrl(
  relativeUrl: string,
  apiURL: string,
  origin: string,
): string {
  if (!relativeUrl) return "";
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  let abs: URL;
  try {
    abs = new URL(apiURL || "/", origin);
  } catch {
    return "";
  }
  let basePath = abs.pathname.replace(/\/v1\/?$/, "/");
  if (basePath.endsWith("/")) basePath = basePath.slice(0, -1);
  const rel = relativeUrl.startsWith("/") ? relativeUrl : `/${relativeUrl}`;
  return `${abs.origin}${basePath}${rel}`;
}

export interface WebhookUrlRow {
  key: "native" | "github" | "wecom";
  labelKey: string;
  url: string;
}

export function buildWebhookUrlRows(
  resp: Pick<IncomingWebhookCreateResp, "url" | "urls">,
  apiURL: string,
  origin: string,
): WebhookUrlRow[] {
  const abs = (rel?: string) => (rel ? buildIncomingWebhookUrl(rel, apiURL || "/", origin) : "");
  return [
    {
      key: "native" as const,
      labelKey: "channelWebhook.url.native",
      url: abs(resp.urls?.native || resp.url),
    },
    {
      key: "github" as const,
      labelKey: "channelWebhook.url.github",
      url: abs(resp.urls?.github),
    },
    {
      key: "wecom" as const,
      labelKey: "channelWebhook.url.wecom",
      url: abs(resp.urls?.wecom),
    },
  ].filter((row) => !!row.url);
}

export interface WebhookMessageFrom {
  kind?: string;
  webhook_id?: string;
  name?: string;
  avatar?: string;
}

export function isIncomingWebhookSender(fromUID?: string): boolean {
  return !!fromUID && fromUID.startsWith(INCOMING_WEBHOOK_UID_PREFIX);
}

export function webhookFromOfMessage(message: {
  fromUID?: string;
  content?: { contentObj?: { from?: unknown } };
}): WebhookMessageFrom | undefined {
  if (!isIncomingWebhookSender(message?.fromUID)) return undefined;
  const from = message?.content?.contentObj?.from as WebhookMessageFrom | undefined;
  if (from && typeof from === "object" && from.kind === "webhook") return from;
  return { kind: "webhook" };
}

export const INCOMING_WEBHOOK_DEFAULT_AVATAR =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg width="50" height="50" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="50" height="50" rx="12" fill="#6B3DD8"/>` +
      `<path d="M20 30 L30 20 M27 17 a5 5 0 0 1 7 7 l-2.5 2.5 M23 33 a5 5 0 0 1 -7 -7 l2.5 -2.5" ` +
      `stroke="white" stroke-width="2.6" stroke-linecap="round" fill="none"/>` +
      `</svg>`,
  );

export function buildWebhookCurlExample(
  key: "native" | "wecom",
  url: string,
  sampleContent: string,
): string {
  const body =
    key === "wecom"
      ? { msgtype: "text", text: { content: sampleContent } }
      : { content: sampleContent };
  const shellQuote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  return [
    `curl -X POST ${shellQuote(url)} \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d ${shellQuote(JSON.stringify(body))}`,
  ].join("\n");
}

export interface BotAdminSubmitResult {
  succeeded: string[];
  failed: { uid: string; reason: unknown }[];
}

export async function submitBotAdmins(
  uids: string[],
  setBotAdmin: (uid: string) => Promise<void>,
): Promise<BotAdminSubmitResult> {
  const results = await Promise.allSettled(uids.map((uid) => setBotAdmin(uid)));
  const succeeded: string[] = [];
  const failed: { uid: string; reason: unknown }[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") succeeded.push(uids[index]);
    else failed.push({ uid: uids[index], reason: result.reason });
  });
  return { succeeded, failed };
}

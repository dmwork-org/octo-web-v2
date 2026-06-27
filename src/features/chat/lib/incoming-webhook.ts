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
  allow_mention_all?: number | boolean | string;
  allow_mention_bots?: number | boolean | string;
  mention_uids?: string[];
  thread_short_id?: string;
}

export interface IncomingWebhookUrls {
  native?: string;
  github?: string;
  wecom?: string;
  gitlab?: string;
  feishu?: string;
  multica?: string;
}

export interface IncomingWebhookAdapterAuth {
  type: string;
  header?: string;
  value_source?: string;
}

export interface IncomingWebhookAdapterExample {
  key: string;
  title: string;
  description: string;
  url: string;
  content_type: string;
  auth: IncomingWebhookAdapterAuth;
  steps: string[];
}

export interface IncomingWebhookCreateResp extends IncomingWebhook {
  token: string;
  url: string;
  urls?: IncomingWebhookUrls;
  adapter_examples?: IncomingWebhookAdapterExample[];
}

export interface IncomingWebhookUpsertReq {
  name?: string;
  avatar?: string;
  status?: number;
  allow_mention_all?: boolean;
  allow_mention_bots?: boolean;
  mention_uids?: string[];
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

export const MENTION_UIDS_MAX = 50;
export const MENTION_UID_MAX_LENGTH = 40;

export function isFlagOn(value: unknown): boolean {
  return value === 1 || value === true || value === "1" || value === "true";
}

export function normalizeMentionUids(uids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of uids) {
    const uid = raw.trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

export function validateMentionUids(
  uids: readonly string[],
): { ok: true; uids: string[] } | { ok: false; reason: "tooMany" | "tooLong" } {
  const normalized = normalizeMentionUids(uids);
  if (normalized.length > MENTION_UIDS_MAX) return { ok: false, reason: "tooMany" };
  if (normalized.some((uid) => uid.length > MENTION_UID_MAX_LENGTH)) {
    return { ok: false, reason: "tooLong" };
  }
  return { ok: true, uids: normalized };
}

function sameMentionUids(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const uid of sa) {
    if (!sb.has(uid)) return false;
  }
  return true;
}

export function buildWebhookUpsertReq(opts: {
  isEdit: boolean;
  isManager: boolean;
  name: string;
  avatar: string;
  mentionAll?: boolean;
  mentionBots?: boolean;
  mentionUids?: string[];
  webhook?: Pick<
    IncomingWebhook,
    "name" | "avatar" | "allow_mention_all" | "allow_mention_bots" | "mention_uids"
  >;
}): IncomingWebhookUpsertReq | null {
  const trimmedName = opts.name.trim();
  const trimmedAvatar = opts.avatar.trim();
  const mentionAll = !!opts.mentionAll;
  const mentionBots = !!opts.mentionBots;
  const mentionUids = normalizeMentionUids(opts.mentionUids ?? []);
  const req: IncomingWebhookUpsertReq = {};

  if (opts.isEdit && opts.webhook) {
    if (trimmedName && trimmedName !== opts.webhook.name) req.name = trimmedName;
    if (opts.isManager && trimmedAvatar !== (opts.webhook.avatar || "")) {
      req.avatar = trimmedAvatar;
    }
    if (mentionAll !== isFlagOn(opts.webhook.allow_mention_all)) {
      req.allow_mention_all = mentionAll;
    }
    if (mentionBots !== isFlagOn(opts.webhook.allow_mention_bots)) {
      req.allow_mention_bots = mentionBots;
    }
    const originalUids = normalizeMentionUids(opts.webhook.mention_uids ?? []);
    if (!sameMentionUids(mentionUids, originalUids)) {
      req.mention_uids = mentionUids;
    }
    return Object.keys(req).length === 0 ? null : req;
  }

  if (trimmedName) req.name = trimmedName;
  if (opts.isManager && trimmedAvatar) req.avatar = trimmedAvatar;
  if (mentionAll) req.allow_mention_all = true;
  if (mentionBots) req.allow_mention_bots = true;
  if (mentionUids.length > 0) req.mention_uids = mentionUids;
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

const CANONICAL_WEBHOOK_SEGMENT = "/v1/incoming-webhooks/";
const SHORT_WEBHOOK_SEGMENT = "/v1/webhooks/";

export function toShortWebhookAlias(url: string): string {
  if (!url) return url;
  const idx = url.indexOf(CANONICAL_WEBHOOK_SEGMENT);
  if (idx < 0) return url;
  return (
    url.slice(0, idx) + SHORT_WEBHOOK_SEGMENT + url.slice(idx + CANONICAL_WEBHOOK_SEGMENT.length)
  );
}

export interface WebhookUrlRow {
  key: "native" | "github" | "wecom" | "gitlab" | "feishu" | "multica";
  labelKey: string;
  url: string;
}

export function buildWebhookUrlRows(
  resp: Pick<IncomingWebhookCreateResp, "url" | "urls">,
  apiURL: string,
  origin: string,
): WebhookUrlRow[] {
  const abs = (rel?: string) =>
    rel ? buildIncomingWebhookUrl(toShortWebhookAlias(rel), apiURL || "/", origin) : "";
  const rows: WebhookUrlRow[] = [
    {
      key: "native",
      labelKey: "channelWebhook.url.native",
      url: abs(resp.urls?.native || resp.url),
    },
    {
      key: "github",
      labelKey: "channelWebhook.url.github",
      url: abs(resp.urls?.github),
    },
    {
      key: "gitlab",
      labelKey: "channelWebhook.url.gitlab",
      url: abs(resp.urls?.gitlab),
    },
    {
      key: "wecom",
      labelKey: "channelWebhook.url.wecom",
      url: abs(resp.urls?.wecom),
    },
    {
      key: "feishu",
      labelKey: "channelWebhook.url.feishu",
      url: abs(resp.urls?.feishu),
    },
    {
      key: "multica",
      labelKey: "channelWebhook.url.multica",
      url: abs(resp.urls?.multica),
    },
  ];
  return rows.filter((row) => !!row.url);
}

export interface WebhookAdapterExampleRow {
  key: string;
  title: string;
  description: string;
  url: string;
  contentType: string;
  auth: IncomingWebhookAdapterAuth;
  steps: string[];
}

export function buildWebhookAdapterExamples(
  resp: Pick<IncomingWebhookCreateResp, "adapter_examples">,
  apiURL: string,
  origin: string,
): WebhookAdapterExampleRow[] {
  const examples = resp.adapter_examples;
  if (!Array.isArray(examples) || examples.length === 0) return [];
  const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
  return examples
    .filter(
      (example): example is IncomingWebhookAdapterExample =>
        !!example && typeof example.key === "string" && example.key.length > 0,
    )
    .map((example) => ({
      key: example.key,
      title: text(example.title),
      description: text(example.description),
      url:
        typeof example.url === "string" && example.url
          ? buildIncomingWebhookUrl(toShortWebhookAlias(example.url), apiURL || "/", origin)
          : "",
      contentType: typeof example.content_type === "string" ? example.content_type : "",
      auth: example.auth && typeof example.auth === "object" ? example.auth : { type: "" },
      steps: Array.isArray(example.steps)
        ? example.steps.map(text).filter((step) => step.length > 0)
        : [],
    }))
    .filter((row) => !!row.url);
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
    `<svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="50" height="50" rx="12" fill="#6B3DD8"/>` +
      `<path d="M25 11v5" stroke="white" stroke-width="2.5" stroke-linecap="round"/>` +
      `<circle cx="25" cy="10" r="2" fill="white"/>` +
      `<rect x="14" y="17" width="22" height="20" rx="6" fill="none" stroke="white" stroke-width="2.8"/>` +
      `<circle cx="21" cy="27" r="2.2" fill="white"/>` +
      `<circle cx="29" cy="27" r="2.2" fill="white"/>` +
      `<path d="M20 33h10" stroke="white" stroke-width="2.5" stroke-linecap="round"/>` +
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

import { api } from "@/features/base/api/client";

/**
 * 更新日志 / 版本检查(对齐老仓 NavSettingsPanel.fetchChangelog 的接口契约)。
 *
 * 老仓直接 `fetch(${apiURL}common/updater/web/1.0)`,绕开 apiClient 拦截 — 因为
 * 更新日志通常匿名可访问。新仓为统一拦截链(baseURL / token / X-Space-Id)走
 * 同一个 `api`,后端应允许该路径无 token 访问(若需要 token 也能正常带)。
 *
 * **响应字段**(必填 `notes`,其余可选,缺失时 UI 降级):
 *   - notes:    多行 markdown / 纯文本 changelog
 *   - version:  目标版本号
 *   - pub_date: 发布时间(ISO 字符串或后端可解析格式)
 */
export interface ChangelogResp {
  notes: string;
  version?: string;
  pub_date?: string;
}

export async function getChangelog(): Promise<ChangelogResp | null> {
  try {
    const resp = await api<ChangelogResp | null>("common/updater/web/1.0");
    if (!resp || typeof resp.notes !== "string") return null;
    return resp;
  } catch {
    return null;
  }
}

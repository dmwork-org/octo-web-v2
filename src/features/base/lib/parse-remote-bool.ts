/**
 * 解析后端 appconfig 里的 bool 字段(对齐上游 43e7d354 remoteConfig.parseRemoteBool)。
 *
 * 接受 number `1` / boolean `true` / string `"1"|"true"`(忽略大小写和首尾空格)→ true,
 * 其余(0、缺、false、空串、null 等)→ false。
 *
 * 设计目的:后端不同部署可能用 int 或 string 表达布尔,前端统一规整,避免业务侧写
 * `if (config.foo === 1 || config.foo === "1")` 散落各处。
 */
export function parseRemoteBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
  }
  return false;
}

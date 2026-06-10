/**
 * 全局 Message 通知系统 — 类型定义(参考 antd message API)。
 *
 * 5 种状态:
 *   - success:操作成功(绿,自动 3s 消失)
 *   - error:操作失败(红,自动 3s 消失)
 *   - info:提示信息(蓝,自动 3s 消失)
 *   - warning:警告(黄,自动 3s 消失)
 *   - loading:加载中(灰,**不自动消失**,需手动 dismiss)
 *
 * `key` 去重:同 key 多次调用更新现有 item(content + 重置 timer),
 * 不堆叠新条;无 key 每次新建独立条目(用自增 id 区分)。
 */

export type MessageType = "success" | "error" | "info" | "warning" | "loading";

export interface MessageItem {
  /** 内部自增 id,无论是否传 key 都唯一。 */
  id: number;
  /** 用户提供的去重 key(可选);相同 key 的后续调用会更新本 item。 */
  key?: string;
  type: MessageType;
  content: string;
  /**
   * 自动消失毫秒数。
   * - undefined → 走类型默认值(success/error/info/warning 3000ms,loading 0)
   * - 0 → 永不自动消失(等手动 dismiss)
   */
  duration?: number;
  /** 可选右侧 action 按钮(对齐 sonner action 用例:5s 撤销归档等)。 */
  action?: { label: string; onClick: () => void };
}

export interface MessageOptions {
  /** 去重 key,相同 key 的现有 item 会被更新而不是新增。 */
  key?: string;
  /** override 自动消失时长(ms);0 = 不自动消失。 */
  duration?: number;
  /** 右侧 action 按钮(罕用,主要给"撤销"场景);click 后自动 dismiss 当前 item。 */
  action?: { label: string; onClick: () => void };
}

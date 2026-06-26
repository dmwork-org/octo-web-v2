/**
 * NavRow — 导航式表单行(title 左 + subTitle/right 右 + 整行可点)。
 *
 * 来源:`src/features/chat/components/channel-setting-modal.tsx` L126-162;
 * 同时合并 `src/features/base/components/modals/user-info-modal.tsx` L35-66 的 SectionRow
 * (后者是 NavRow 的纯子集 — 已天然兼容)。Phase B 抽到共享层。
 *
 * **行结构**:
 * - title 左(`flex-1 truncate text-[13px]`,可 `danger` 红字 / `center` 居中)
 * - subTitle 右(`text-[12px] text-text-tertiary`,可选)
 * - right 槽位(右侧任意自定义 React node,可选)
 * - onClick 缺省 → 整行 disabled;有 onClick → `hover:bg-bg-hover`
 *
 * **典型用法**:
 * - "设置备注 →"(点开 InputDialog)
 * - "我的二维码"(点开二维码弹层)
 * - "解除好友"(`danger`,点开 ConfirmDialog)
 * - "返回群聊「父群名」"(`center`,无 subTitle)
 *
 * **规范字号**:title `13px`,subTitle `12px`(对应老仓 ListItem)。
 */
export function NavRow({
  title,
  subTitle,
  right,
  danger,
  center,
  onClick,
}: {
  title: string;
  subTitle?: React.ReactNode;
  right?: React.ReactNode;
  danger?: boolean;
  /** 标题居中(无 subTitle/right 的纯文字按钮场景,如"返回群聊「父群名」")。 */
  center?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors ${
        onClick ? "hover:bg-bg-hover" : "cursor-default"
      }`}
    >
      <span
        className={`${center ? "text-center" : "flex-1 truncate text-left"} text-[13px] ${danger ? "text-error" : "text-text-primary"} ${center ? "w-full" : ""}`}
      >
        {title}
      </span>
      {subTitle ? (
        <span className="shrink-0 truncate text-[12px] text-text-tertiary">{subTitle}</span>
      ) : null}
      {right ? <span className="shrink-0">{right}</span> : null}
    </button>
  );
}

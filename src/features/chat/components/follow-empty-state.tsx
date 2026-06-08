import { useT } from "@/lib/i18n/use-t";

interface FollowEmptyStateProps {
  /** true = 用户连任何群聊都没;false = 有群聊但没建分组 */
  noGroups: boolean;
  onCreateCategory: () => void;
  onStartGroup?: () => void;
}

/**
 * 关注 tab 空态(对齐老仓 dmworkbase CategoryEmptyState):
 *
 * 两种空态:
 * - `noGroups=true`(刚加入团队/无任何会话):chat 气泡 icon + "还没有群聊" +
 *   "发起群聊"主按钮
 * - `noGroups=false`(有会话但未建分组):文件夹 icon + "整理你的群聊" +
 *   "新建分组"主按钮
 *
 * 样式参照老仓 `.wk-category-empty-state*`:
 * - 48×48 圆角 14 icon 容器 / brand 浅 bg / icon 24 stroke 1.6
 * - title 14 weight 600 / desc 12 line 1.6 max-w 200
 * - 主按钮:rounded-full 胶囊 / padding 8 20 / brand 黑 bg / 13 weight 500
 */
export function FollowEmptyState({
  noGroups,
  onCreateCategory,
  onStartGroup,
}: FollowEmptyStateProps) {
  const t = useT();
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-brand/[0.08]">
        {noGroups ? <ChatBubbleIcon /> : <FolderIcon />}
      </div>
      <p className="mb-2 text-[14px] font-semibold text-text-primary">
        {noGroups ? t("followEmpty.noGroupsTitle") : t("followEmpty.organizeTitle")}
      </p>
      <p className="mx-auto mb-5 max-w-[200px] text-[12px] leading-[1.6] text-text-secondary">
        {noGroups ? t("followEmpty.noGroupsDesc") : t("followEmpty.organizeDesc")}
      </p>
      {noGroups ? (
        onStartGroup ? (
          <button
            type="button"
            onClick={onStartGroup}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-brand px-5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <PlusIcon />
            {t("followEmpty.startGroup")}
          </button>
        ) : null
      ) : (
        <button
          type="button"
          onClick={onCreateCategory}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-brand px-5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
        >
          <PlusIcon />
          {t("followEmpty.createCategory")}
        </button>
      )}
    </div>
  );
}

function ChatBubbleIcon() {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-brand"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-brand"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

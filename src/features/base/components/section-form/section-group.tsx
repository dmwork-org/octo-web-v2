/**
 * SectionGroup — 表单分节卡片容器。
 *
 * 来源:`src/features/chat/components/channel-setting-modal.tsx` 内嵌实现(L118-124),
 * 与 `src/features/base/components/modals/user-info-modal.tsx` 内嵌的 SectionGroup
 * 完全等价。Phase B 抽到共享层。
 *
 * 样式规范(对齐老仓 Section/index.css):
 * - 卡片间距:`mx-4 mb-2`(横向 16px,纵向间隔 8px)
 * - 圆角:`rounded-md`
 * - 边框:`border border-border-subtle`
 * - 背景:`bg-bg-base`
 *
 * 容器内通常放若干 `<NavRow>` / `<ToggleRow>` / `<InlineEditRow>` 行。
 */
export function SectionGroup({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-4 mb-2 flex shrink-0 flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-base">
      {children}
    </section>
  );
}

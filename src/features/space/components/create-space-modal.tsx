import { useState } from "react";
import { useCreateSpaceMutation } from "@/features/space/mutations";
import { spaceActions } from "@/features/base/stores/space";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { Button } from "@/components/semi-bridge/button";
import { X } from "lucide-react";

interface CreateSpaceModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 创建空间 modal(对齐老仓 SpaceCreate):
 *
 * - 名称(必填,32 字符限制)
 * - 描述(可选,200 字符限制)
 * - 加入审批 toggle:false=直接加入(join_mode=0)/ true=审批加入(join_mode=1)
 * - 创建成功 → invalidate my spaces → 切到新 space → close
 */
export function CreateSpaceModal({ open, onClose }: CreateSpaceModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [approval, setApproval] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const createMu = useCreateSpaceMutation();

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError(null);
    if (!name.trim()) return setInlineError("请输入空间名称");
    if (name.length > 32) return setInlineError("名称最多 32 字符");
    if (description.length > 200) return setInlineError("描述最多 200 字符");
    try {
      const sp = await createMu.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        join_mode: approval ? 1 : 0,
      });
      spaceActions.setSpace(sp.space_id);
      setName("");
      setDescription("");
      setApproval(false);
      onClose();
    } catch (err) {
      setInlineError(extractSafeErrorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className="flex w-96 flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-6 shadow-xl"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">创建空间</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="text-text-tertiary hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <label className="block text-sm text-text-secondary">
          名称
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            placeholder="空间名(必填,最多 32 字符)"
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
            required
          />
        </label>

        <label className="block text-sm text-text-secondary">
          描述(可选)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="最多 200 字符"
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={approval}
            onChange={(e) => setApproval(e.target.checked)}
          />
          加入需要审批
        </label>

        {inlineError ? <p className="text-xs text-error">{inlineError}</p> : null}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button htmlType="submit" type="primary" theme="solid" loading={createMu.isPending}>
            创建
          </Button>
        </div>
      </form>
    </div>
  );
}

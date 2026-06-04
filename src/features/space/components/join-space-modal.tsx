import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { spaceActions } from "@/features/base/stores/space";
import { useJoinSpaceMutation } from "@/features/space/mutations";
import { getInviteInfo, type SpaceInviteInfo } from "@/features/base/api/endpoints/space.api";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { Button } from "@/components/semi-bridge/button";
import { X } from "lucide-react";

interface JoinSpaceModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 加入空间 modal(对齐老仓 JoinSpaceModal):
 *
 * - 输入邀请码 → 拉 GET /space/invite/{code} 实时校验 + 显示空间名 / 人数
 * - 加入按钮 → POST /space/join → invalidate my spaces → 切到新 space → close
 *
 * 失败(邀请码非法 / 已加入 / 满员)走 extractSafeErrorMessage 白名单。
 */
export function JoinSpaceModal({ open, onClose }: JoinSpaceModalProps) {
  const [code, setCode] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const joinMu = useJoinSpaceMutation();

  // 防止用户输入到一半就请求(只在格式合法时查 invite info)
  const codeValid = /^[a-zA-Z0-9_-]+$/.test(code) && code.length >= 4;
  const { data: info } = useQuery({
    queryKey: ["base", "spaces", "invite", code],
    queryFn: (): Promise<SpaceInviteInfo> => getInviteInfo(code),
    enabled: open && codeValid,
    retry: 0,
    staleTime: 60 * 1000,
  });

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError(null);
    if (!codeValid) return setInlineError("邀请码格式不正确");
    try {
      await joinMu.mutateAsync(code);
      // 加入成功后自动切到新 space(用户立即看到内容)
      if (info?.space_id) spaceActions.setSpace(info.space_id);
      setCode("");
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
          <h2 className="text-base font-semibold text-text-primary">加入空间</h2>
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
          邀请码
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            placeholder="输入或粘贴邀请码"
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
            required
          />
        </label>

        {info ? (
          <div className="rounded-md bg-brand-tint px-3 py-2 text-xs text-text-primary">
            将加入 <strong>{info.space_name}</strong>
            {typeof info.member_count === "number" && typeof info.max_users === "number" ? (
              <span className="text-text-tertiary">
                {" "}
                ({info.member_count}/{info.max_users})
              </span>
            ) : null}
          </div>
        ) : null}

        {inlineError ? <p className="text-xs text-error">{inlineError}</p> : null}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button
            htmlType="submit"
            type="primary"
            theme="solid"
            loading={joinMu.isPending}
            disabled={!codeValid}
          >
            加入
          </Button>
        </div>
      </form>
    </div>
  );
}

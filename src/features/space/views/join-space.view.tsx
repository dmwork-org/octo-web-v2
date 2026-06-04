import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { authActions, authStore } from "@/features/base/stores/auth";
import { spaceActions } from "@/features/base/stores/space";
import { getInviteInfo, type SpaceInviteInfo } from "@/features/base/api/endpoints/space.api";
import { useJoinSpaceMutation } from "@/features/space/mutations";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { toast } from "@/components/semi-bridge/toast";

const INVITE_CODE_REGEX = /^[a-zA-Z0-9_-]+$/;
const ACCENT_COLORS = ["#667eea", "#764ba2", "#f093fb", "#4facfe", "#43e97b", "#fa709a"];

type View = "home" | "join" | "confirm";

/**
 * 加入空间引导页(对齐老仓 apps/web JoinSpacePage,Wave 2):
 *
 * **3 view 状态机**:
 *  - `home`:欢迎页 + "📩 输入邀请码加入" 按钮
 *  - `join`:输入邀请码 + "验证邀请码" 按钮(Enter 触发)
 *  - `confirm`:显示空间信息(icon 字母 + 空间名 + 人数)+ "确认加入"
 *
 * **何时来到这里**:无空间用户登录后 `useFinalizeLogin` navigate("/joinspace")。
 *
 * **加入成功**:setSpace 新 space_id → navigate("/") 回主页(此时主区按
 * space 上下文加载)。失败(满员/已加入/邀请码错)按 toast 文案分支提示。
 *
 * **未登录**:无 token → 跳 /login(本页 require token,getInviteInfo /
 * joinSpace 都要 token)。
 */
export function JoinSpaceView() {
  const navigate = useNavigate();
  const token = useStore(authStore, (s) => s.token);
  const [view, setView] = useState<View>("home");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<SpaceInviteInfo | null>(null);
  const [verifying, setVerifying] = useState(false);
  const joinMu = useJoinSpaceMutation();

  // 无 token → /login(防直接访问)
  if (!token) {
    void navigate({ to: "/login" });
    return null;
  }

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (!trimmed) return toast.warning("请输入邀请码");
    if (!INVITE_CODE_REGEX.test(trimmed)) return toast.error("邀请码格式不正确");
    setVerifying(true);
    try {
      const i = await getInviteInfo(trimmed);
      setInfo(i);
      setView("confirm");
    } catch (e) {
      const msg = extractSafeErrorMessage(e);
      if (msg.includes("已满")) {
        toast.error("该空间已满，无法加入");
      } else {
        toast.error("邀请码无效或已过期");
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleJoin = async () => {
    if (!info) return;
    try {
      await joinMu.mutateAsync(info.invite_code);
      spaceActions.setSpace(info.space_id);
      toast.success(`已加入 ${info.space_name}`);
      void navigate({ to: "/" });
    } catch (e) {
      const msg = extractSafeErrorMessage(e);
      if (msg.includes("已满")) {
        toast.error("空间已满，无法加入");
      } else if (msg.includes("已是成员") || msg.includes("already")) {
        spaceActions.setSpace(info.space_id);
        void navigate({ to: "/" });
      } else {
        toast.error(msg || "加入失败，请重试");
      }
    }
  };

  const onLogout = () => {
    authActions.signOut();
    void navigate({ to: "/login" });
  };

  const spaceColor = info
    ? ACCENT_COLORS[info.space_name.charCodeAt(0) % ACCENT_COLORS.length]
    : "#1C1C23";
  const isFull =
    !!info &&
    typeof info.max_users === "number" &&
    info.max_users > 0 &&
    (info.member_count ?? 0) >= info.max_users;

  return (
    <div className="absolute top-0 left-0 flex min-h-screen w-full items-center justify-center bg-[#f5f6fa] px-4">
      <div className="relative flex w-full max-w-[420px] flex-col items-center gap-4 rounded-[16px] bg-white px-8 py-10 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        {/* 右上"退出登录"小链接 — 让用户能退出换号 */}
        <button
          type="button"
          onClick={onLogout}
          className="absolute top-3 right-4 cursor-pointer text-[12px] text-[#8a8fa8] transition-colors hover:text-[#1C1C23]"
        >
          退出登录
        </button>

        {view === "home" ? (
          <>
            <div className="text-[48px]">👋</div>
            <h2 className="text-center text-[22px] font-bold text-[#1a1a2e]">欢迎使用 Octo!</h2>
            <p className="text-center text-[14px] text-[#8a8fa8]">输入邀请码加入你的团队</p>
            <button
              type="button"
              onClick={() => setView("join")}
              className="mt-4 h-[46px] w-full cursor-pointer rounded-[10px] !bg-brand text-[15px] font-semibold tracking-[0.3px] text-white transition-colors hover:!bg-brand-hover"
            >
              📩 输入邀请码加入
            </button>
          </>
        ) : null}

        {view === "join" ? (
          <>
            <button
              type="button"
              onClick={() => {
                setView("home");
                setCode("");
              }}
              className="self-start cursor-pointer text-[13px] text-[#8a8fa8] transition-colors hover:text-[#1C1C23]"
            >
              ← 返回
            </button>
            <h2 className="text-center text-[22px] font-bold text-[#1a1a2e]">输入邀请码</h2>
            <p className="text-center text-[14px] text-[#8a8fa8]">粘贴邀请码以查看并加入团队</p>
            <input
              type="text"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleVerify();
              }}
              placeholder="输入邀请码"
              className="h-[46px] w-full rounded-[10px] border-[1.5px] border-[#e4e6ef] bg-[#fafbfc] px-4 text-[15px] text-[#1a1a2e] transition-all outline-none placeholder:text-[#b0b4c8] focus:border-[#1C1C23] focus:bg-white focus:shadow-[0_0_0_3px_rgba(28,28,35,0.12)]"
            />
            <button
              type="button"
              onClick={() => void handleVerify()}
              disabled={verifying}
              className="h-[46px] w-full cursor-pointer rounded-[10px] !bg-brand text-[15px] font-semibold tracking-[0.3px] text-white transition-colors hover:!bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verifying ? "验证中…" : "验证邀请码"}
            </button>
          </>
        ) : null}

        {view === "confirm" && info ? (
          <>
            <div
              className="flex h-[64px] w-[64px] items-center justify-center rounded-[16px] text-[28px] font-bold text-white"
              style={{ backgroundColor: spaceColor }}
            >
              {info.space_name.charAt(0).toUpperCase()}
            </div>
            <div className="text-center text-[18px] font-semibold text-[#1a1a2e]">
              {info.space_name}
            </div>
            <div className="text-center text-[13px] text-[#8a8fa8]">邀请你加入</div>
            <div className="text-center text-[13px] text-[#8a8fa8]">
              {typeof info.max_users === "number" && info.max_users > 0
                ? `${info.member_count ?? 0} / ${info.max_users} 人`
                : `${info.member_count ?? 0} 位成员`}
            </div>
            <button
              type="button"
              onClick={() => void handleJoin()}
              disabled={joinMu.isPending || isFull}
              className="h-[46px] w-full cursor-pointer rounded-[10px] !bg-brand text-[15px] font-semibold tracking-[0.3px] text-white transition-colors hover:!bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isFull ? "空间已满" : joinMu.isPending ? "加入中…" : "确认加入"}
            </button>
            <button
              type="button"
              onClick={() => {
                setView("join");
                setInfo(null);
              }}
              className="cursor-pointer text-[13px] text-[#8a8fa8] transition-colors hover:text-[#1C1C23]"
            >
              ← 重新输入邀请码
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { authActions, authStore } from "@/features/base/stores/auth";
import { spaceActions } from "@/features/base/stores/space";
import { getInviteInfo, type SpaceInviteInfo } from "@/features/base/api/endpoints/space.api";
import { useJoinSpaceMutation } from "@/features/space/mutations";
import { extractSafeErrorMessage } from "@/features/login/lib/sanitize-error";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t as tInst } from "@/lib/i18n/instance";

const INVITE_CODE_REGEX = /^[a-zA-Z0-9_-]+$/;
const SPACE_ICON_COLORS = ["#667eea", "#764ba2", "#f093fb", "#4facfe", "#43e97b", "#fa709a"];

type View = "home" | "join" | "confirm";

/**
 * 加入空间引导页 — 1:1 对齐老仓 apps/web JoinSpacePage 视觉:
 *
 * **3 view 状态机**:
 *  - `home`:emoji 👋 + 欢迎标题 + "📩 输入邀请码加入"
 *  - `join`:返回链接 + 标题 + 邀请码 input(Enter 触发)+ "验证邀请码"
 *  - `confirm`:空间字母 icon(72×72 hash 色)+ 名字 + 人数 + "确认加入" /
 *    "空间已满"
 *
 * **样式 1:1 老仓**(JoinSpacePage/index.css):
 *  - 全屏 bg = linear-gradient(135deg, #667eea 0%, #764ba2 100%)
 *  - card = white + 圆角 16 + padding 48 顶 / 40 左右下 + shadow 0 20px 60px rgba(0,0,0,0.2)
 *  - title 22 weight 700 / subtitle 16 #666 / members 14 #999
 *  - 主按钮 44h / 圆角 8 / font 16 / brand 黑
 *  - 输入框 44h / 1.5px border / 圆角 8
 *
 * **右上角"退出登录"**:让用户能换号(本仓新加,老仓无)。
 *
 * **行为**:
 *  - 验证邀请码 → getInviteInfo(失败 toast 分支:满员 / 无效)
 *  - 确认加入 → joinSpace + setSpace(新 space_id) + 跳 /
 *  - 已是成员 → 静默 setSpace + 跳 /
 */
export function JoinSpaceView() {
  const t = useT();
  const navigate = useNavigate();
  const token = useStore(authStore, (s) => s.token);
  const [view, setView] = useState<View>("home");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<SpaceInviteInfo | null>(null);
  const [verifying, setVerifying] = useState(false);
  const joinMu = useJoinSpaceMutation();

  if (!token) {
    void navigate({ to: "/login" });
    return null;
  }

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (!trimmed) return toast.warning(tInst("space.join.welcomePrompt"));
    if (!INVITE_CODE_REGEX.test(trimmed)) return toast.error(tInst("space.join.invalidCode"));
    setVerifying(true);
    try {
      const i = await getInviteInfo(trimmed);
      setInfo(i);
      setView("confirm");
    } catch (e) {
      const msg = extractSafeErrorMessage(e);
      if (msg.includes("已满")) {
        toast.error(tInst("space.join.spaceFullVerify"));
      } else {
        toast.error(tInst("space.join.codeInvalidOrExpired"));
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
      toast.success(tInst("space.join.joined", { values: { name: info.space_name } }));
      void navigate({ to: "/" });
    } catch (e) {
      const msg = extractSafeErrorMessage(e);
      if (msg.includes("已满")) {
        toast.error(tInst("space.join.spaceFull"));
      } else if (msg.includes("已是成员") || msg.includes("already")) {
        spaceActions.setSpace(info.space_id);
        void navigate({ to: "/" });
      } else {
        toast.error(msg || tInst("space.join.joinFailed"));
      }
    }
  };

  const onLogout = () => authActions.signOut();

  const spaceColor = info
    ? SPACE_ICON_COLORS[info.space_name.charCodeAt(0) % SPACE_ICON_COLORS.length]
    : "#667eea";
  const isFull =
    !!info &&
    typeof info.max_users === "number" &&
    info.max_users > 0 &&
    (info.member_count ?? 0) >= info.max_users;

  return (
    <div
      className="absolute top-0 left-0 flex min-h-screen w-full items-center justify-center"
      style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
    >
      <div
        className="relative w-full text-center text-[#333]"
        style={{
          background: "white",
          borderRadius: 16,
          padding: "48px 40px 40px",
          minWidth: 340,
          maxWidth: 420,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        {/* 右上 "退出登录" — 让用户能换号(本仓新加) */}
        <button
          type="button"
          onClick={onLogout}
          className="absolute top-3 right-4 cursor-pointer text-[12px] text-[#999] transition-colors hover:text-[#1a1a1a]"
        >
          {t("space.joinView.logout")}
        </button>

        {view === "home" ? (
          <>
            <div className="mb-3 text-[40px] leading-none">👋</div>
            <h2 className="mb-2 text-[22px] font-bold text-[#1a1a1a]">
              {t("space.joinView.welcome")}
            </h2>
            <p className="mb-1 text-[16px] text-[#666]">{t("space.joinView.welcomeHint")}</p>
            <div className="mt-7 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setView("join")}
                className="h-[44px] w-full cursor-pointer rounded-[8px] !bg-brand text-[16px] font-semibold text-white transition-colors hover:!bg-brand-hover"
              >
                {t("space.joinView.enterCodeBtn")}
              </button>
            </div>
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
              className="mb-5 inline-flex cursor-pointer items-center bg-transparent text-[13px] text-[#888] transition-colors hover:text-[#1a1a1a]"
            >
              {t("space.joinView.back")}
            </button>
            <h2 className="mb-2 text-[22px] font-bold text-[#1a1a1a]">
              {t("space.joinView.title")}
            </h2>
            <p className="mb-1 text-[16px] text-[#666]">{t("space.joinView.subtitle")}</p>
            <input
              type="text"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleVerify();
              }}
              placeholder={t("space.joinView.placeholder")}
              className="mt-5 mb-1 h-[44px] w-full rounded-[8px] border-[1.5px] border-[#e4e6ef] bg-white px-4 text-[16px] text-[#1a1a1a] transition-all outline-none placeholder:text-[#b0b4c8] focus:border-[#1C1C23] focus:shadow-[0_0_0_3px_rgba(28,28,35,0.12)]"
            />
            <button
              type="button"
              onClick={() => void handleVerify()}
              disabled={verifying}
              className="mt-4 h-[44px] w-full cursor-pointer rounded-[8px] !bg-brand text-[16px] font-semibold text-white transition-colors hover:!bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verifying ? t("space.joinView.verifying") : t("space.joinView.verifyBtn")}
            </button>
          </>
        ) : null}

        {view === "confirm" && info ? (
          <>
            <div
              className="mx-auto mb-5 inline-flex h-[72px] w-[72px] items-center justify-center rounded-[16px] text-[32px] font-bold text-white"
              style={{ backgroundColor: spaceColor }}
            >
              {info.space_name.charAt(0).toUpperCase()}
            </div>
            <div className="mb-2 text-[24px] font-bold text-[#1a1a1a]">{info.space_name}</div>
            <p className="mb-1 text-[16px] text-[#666]">{t("space.joinView.inviteSubtitle")}</p>
            <div className="mb-8 text-[14px] text-[#999]">
              {typeof info.max_users === "number" && info.max_users > 0
                ? t("space.joinView.memberCountFull", {
                    values: { count: info.member_count ?? 0, max: info.max_users },
                  })
                : t("space.joinView.memberCount", { values: { count: info.member_count ?? 0 } })}
            </div>
            <button
              type="button"
              onClick={() => void handleJoin()}
              disabled={joinMu.isPending || isFull}
              className="h-[44px] w-full cursor-pointer rounded-[8px] !bg-brand text-[16px] font-semibold text-white transition-colors hover:!bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isFull
                ? t("space.joinView.isFull")
                : joinMu.isPending
                  ? t("space.joinView.joining")
                  : t("space.joinView.confirmJoin")}
            </button>
            <button
              type="button"
              onClick={() => {
                setView("join");
                setInfo(null);
              }}
              className="mt-5 inline-flex cursor-pointer items-center bg-transparent text-[13px] text-[#888] transition-colors hover:text-[#1a1a1a]"
            >
              {t("space.joinView.reEnterCode")}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

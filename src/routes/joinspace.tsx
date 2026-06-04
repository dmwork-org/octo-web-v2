import { createFileRoute } from "@tanstack/react-router";
import { JoinSpaceView } from "@/features/space/views/join-space.view";

/**
 * 加入空间引导页 `/joinspace`(对齐老仓 JoinSpacePage,onNeedJoinSpace 触发):
 *
 * 用户登录但未加入任何空间时,`useFinalizeLogin` navigate 到这里(对齐老仓
 * `checkSpaceAndLogin` → `onNeedJoinSpace`)。3 view 状态机引导用户输入
 * 邀请码加入。
 *
 * 不在 _auth layout 下 — 进 _auth.index 要求有 space 上下文,而这里就是
 * 用来"先解决没 space" 的过渡页。组件内自己 guard token(无 token 跳 /login)。
 */
export const Route = createFileRoute("/joinspace")({
  component: () => <JoinSpaceView />,
});

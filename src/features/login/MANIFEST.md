# login feature

> 登录 / 登出 / token 刷新等鉴权流程。

## 当前(P0)

- `mutations.ts` 暴露 `loginMutation()`(useMutation factory)
- 配合 `routes/login.tsx` 完成登录闭环

## 后续(P1+)

- 短信验证码 / OIDC / 绑定二级账号(从旧 `@octo/dmworklogin` 迁)

## 关联 skill

- [`implement-auth-guard`](../../../.claude/skills/implement-auth-guard/SKILL.md)
- [`implement-mutation-with-invalidate`](../../../.claude/skills/implement-mutation-with-invalidate/SKILL.md)

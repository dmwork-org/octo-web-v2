# base feature

> 项目所有 feature 的依赖根。提供:
>
> - 全局 store 单例(`stores/{auth,space,endpoint}.ts`)
> - HTTP 客户端 + 拦截器(`api/client.ts` + `api/interceptors/*`)
> - API endpoints 集合(`api/endpoints/*`,后续 P1 迁旧 APIClient)
> - Layout / Provider 栈(P1 落)
> - 通用 hooks(`hooks/{useAuth,useSpace}.ts`,P1 落)

## 边界

- 任何其他 `features/<x>/` 可以 `import { authStore, api, ... } from "@/features/base/..."`
- 但 `features/base` **不能** 反向 `import` 任何具体业务 feature

## 关联 skill

- [`implement-auth-guard`](../../../.claude/skills/implement-auth-guard/SKILL.md)
- [`implement-ofetch-interceptor`](../../../.claude/skills/implement-ofetch-interceptor/SKILL.md)

# components/

`src/components/` 只允许:

- `ui/` — shadcn 组件(`pnpm dlx shadcn add ...` 落地处,可直接改源文件)
- `README.md` — 本文件

## 业务组件不放这里

业务组件按 feature 切片,放在:

```
src/features/<feat>/views/<name>.view.tsx
```

理由(structure-lint):`components/` 顶层只准放设计系统层(shadcn ui);业务组件按功能域归属,不靠"按类型分组"放。

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /**
   * Dev server proxy target — 仅 `pnpm dev` 时 vite.config.ts 读取使用,
   * 不暴露给客户端运行时(客户端代码不应直接读)。
   */
  readonly VITE_API_URL?: string;
  readonly VITE_ENABLE_ENTERPRISE_SSO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

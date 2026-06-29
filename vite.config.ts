import { defineConfig, loadEnv } from "vite-plus";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { cwd } from "node:process";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 读取 .env / .env.local / .env.{mode} 三层(dev 时跟 import.meta.env 一致)。
  // 这里把 VITE_API_URL 拿出来给 dev server proxy 用。生产 build 出来的静态
  // 文件不带 proxy,部署到哪个网关由部署环境决定,跟此处无关。
  // **必填**:不提供时直接抛错(避免无声 fallback 到一个错误目标导致联调误判)。
  const env = loadEnv(mode, cwd(), "");
  const apiTarget = env.VITE_API_URL;
  if (!apiTarget) {
    throw new Error(
      "VITE_API_URL 未设置。请在 .env.local 里加 `VITE_API_URL=https://your-host.example.com` 后再启动 dev。",
    );
  }

  return {
    fmt: {
      ignorePatterns: ["src/routeTree.gen.ts"],
    },
    lint: {
      plugins: ["oxc", "typescript", "unicorn", "react"],
      jsPlugins: ["./.ai/taste/oxlint-plugin/index.js"],
      categories: {
        correctness: "warn",
      },
      env: {
        builtin: true,
      },
      ignorePatterns: ["dist", ".ai", ".claude", "scripts", ".specify", "docs"],
      overrides: [
        {
          files: ["**/*.{ts,tsx}"],
          rules: {
            "constructor-super": "error",
            "for-direction": "error",
            "getter-return": "error",
            "no-async-promise-executor": "error",
            "no-case-declarations": "error",
            "no-class-assign": "error",
            "no-compare-neg-zero": "error",
            "no-cond-assign": "error",
            "no-const-assign": "error",
            "no-constant-binary-expression": "error",
            "no-constant-condition": "error",
            "no-control-regex": "error",
            "no-debugger": "error",
            "no-delete-var": "error",
            "no-dupe-class-members": "error",
            "no-dupe-else-if": "error",
            "no-dupe-keys": "error",
            "no-duplicate-case": "error",
            "no-empty": "error",
            "no-empty-character-class": "error",
            "no-empty-pattern": "error",
            "no-empty-static-block": "error",
            "no-ex-assign": "error",
            "no-extra-boolean-cast": "error",
            "no-fallthrough": "error",
            "no-func-assign": "error",
            "no-global-assign": "error",
            "no-import-assign": "error",
            "no-invalid-regexp": "error",
            "no-irregular-whitespace": "error",
            "no-loss-of-precision": "error",
            "no-misleading-character-class": "error",
            "no-new-native-nonconstructor": "error",
            "no-nonoctal-decimal-escape": "error",
            "no-obj-calls": "error",
            "no-prototype-builtins": "error",
            "no-redeclare": "error",
            "no-regex-spaces": "error",
            "no-self-assign": "error",
            "no-setter-return": "error",
            "no-shadow-restricted-names": "error",
            "no-sparse-arrays": "error",
            "no-this-before-super": "error",
            "no-unassigned-vars": "error",
            "no-undef": "error",
            "no-unexpected-multiline": "error",
            "no-unreachable": "error",
            "no-unsafe-finally": "error",
            "no-unsafe-negation": "error",
            "no-unsafe-optional-chaining": "error",
            "no-unused-labels": "error",
            "no-unused-private-class-members": "error",
            "no-unused-vars": "error",
            "no-useless-assignment": "error",
            "no-useless-backreference": "error",
            "no-useless-catch": "error",
            "no-useless-escape": "error",
            "no-with": "error",
            "preserve-caught-error": "error",
            "require-yield": "error",
            "use-isnan": "error",
            "valid-typeof": "error",
            "no-array-constructor": "error",
            "no-unused-expressions": "error",
            "typescript/ban-ts-comment": "error",
            "typescript/no-duplicate-enum-values": "error",
            "typescript/no-empty-object-type": "error",
            "typescript/no-explicit-any": "error",
            "typescript/no-extra-non-null-assertion": "error",
            "typescript/no-misused-new": "error",
            "typescript/no-namespace": "error",
            "typescript/no-non-null-asserted-optional-chain": "error",
            "typescript/no-require-imports": "error",
            "typescript/no-this-alias": "error",
            "typescript/no-unnecessary-type-constraint": "error",
            "typescript/no-unsafe-declaration-merging": "error",
            "typescript/no-unsafe-function-type": "error",
            "typescript/no-wrapper-object-types": "error",
            "typescript/prefer-as-const": "error",
            "typescript/prefer-namespace-keyword": "error",
            "typescript/triple-slash-reference": "error",
            "react/rules-of-hooks": "error",
            "react/exhaustive-deps": "warn",
            "react/only-export-components": [
              "error",
              {
                allowConstantExport: true,
              },
            ],
            "taste/no-useeffect-fetch": "error",
            "taste/no-useeffect-in-component": "error",
          },
          env: {
            browser: true,
          },
        },
        {
          // shadcn copy-in 组件:variants 工厂(cva)与组件同文件导出是官方约定,
          // 不走 only-export-components(此目录已列 generatedDirs,视作生成产物)
          files: ["src/components/ui/**/*.{ts,tsx}"],
          rules: {
            "react/only-export-components": "off",
          },
        },
      ],
      options: {
        typeAware: true,
        typeCheck: true,
      },
    },
    plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
    server: {
      proxy: {
        // Matter service — dev 默认 fallback 到主 API 网关,由网关把
        // /matter/api/v1/* 路由到对应服务。
        "/matter/api/v1": {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
        },
        // Summary service — 同路由策略,由网关转发到 summary service。
        "/summary/api/v1": {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
        },
        // agent-card-server 独立服务,endpoint 实际带 `/api/v1/` 前缀(线上
        // `/api/v1/agent-cards/...`)。**必须排在通用 `/api` rule 前面**,且
        // 不能 rewrite(否则 `/api/v1/agent-cards/...` → `/v1/v1/agent-cards/...`
        // 仍 404)。issue #30 复现:本地 `/v1/agent-cards/...` 404,线上
        // `/api/v1/agent-cards/...` 200,差异定位到此 proxy 前缀。
        "/api/v1/agent-cards": {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
        },
        "/v1": {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
        },
        // 兼容老配置:VITE_API_BASE_URL=/api 时把 /api/* rewrite 成 /v1/*
        // (后端契约是 /v1 前缀)。新配置推荐直接 VITE_API_BASE_URL=/v1。
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path: string) => path.replace(/^\/api/, "/v1"),
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  };
});

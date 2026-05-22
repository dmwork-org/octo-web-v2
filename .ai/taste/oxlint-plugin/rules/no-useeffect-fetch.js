/**
 * taste/oxlint-plugin/rules/no-useeffect-fetch.js
 *
 * 规则: 任何 useEffect 回调内不允许出现 fetch / ofetch 调用。
 * 和 no-useeffect-in-component 正交:即使 useEffect 被抽进 `useFetchPosts()` 也错
 * (数据拉取应该走 TanStack Query / Router loader,不走 effect)。
 *
 * 规则定义: .ai/taste/rules.md#no-useeffect-fetch
 * 机器注册: .ai/taste/rules.ts -> 'no-useeffect-fetch'
 *
 * 抗 bypass 已覆盖:
 *   - useEffect / React.useEffect
 *   - fetch / ofetch / window.fetch / globalThis.fetch / self.fetch
 */

const FETCH_IDENTIFIERS = new Set(["fetch", "ofetch"]);
const FETCH_GLOBAL_OWNERS = new Set(["window", "globalThis", "self"]);

function isFetchCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (!callee) return false;
  if (callee.type === "Identifier" && FETCH_IDENTIFIERS.has(callee.name)) return true;
  if (
    callee.type === "MemberExpression" &&
    callee.property &&
    callee.property.type === "Identifier" &&
    callee.property.name === "fetch" &&
    callee.object &&
    callee.object.type === "Identifier" &&
    FETCH_GLOBAL_OWNERS.has(callee.object.name)
  )
    return true;
  return false;
}

function isUseEffectCall(node) {
  const callee = node.callee;
  if (!callee) return false;
  if (callee.type === "Identifier" && callee.name === "useEffect") return true;
  if (
    callee.type === "MemberExpression" &&
    callee.property &&
    callee.property.type === "Identifier" &&
    callee.property.name === "useEffect"
  )
    return true;
  return false;
}

function walkForFetch(node, report) {
  if (!node || typeof node !== "object") return;
  if (isFetchCall(node)) report(node);
  for (const k in node) {
    if (k === "parent" || k === "loc" || k === "range" || k === "start" || k === "end") continue;
    const v = node[k];
    if (Array.isArray(v)) {
      for (const c of v) walkForFetch(c, report);
    } else if (v && typeof v === "object" && typeof v.type === "string") {
      walkForFetch(v, report);
    }
  }
}

export default {
  create(context) {
    return {
      CallExpression(node) {
        if (!isUseEffectCall(node)) return;
        const firstArg = node.arguments && node.arguments[0];
        if (!firstArg) return;
        if (firstArg.type !== "ArrowFunctionExpression" && firstArg.type !== "FunctionExpression")
          return;
        walkForFetch(firstArg.body, (fetchNode) => {
          context.report({
            message:
              "no-useeffect-fetch: 数据拉取用 TanStack Router loader / useQuery,不在 useEffect 里 fetch/ofetch",
            node: fetchNode,
          });
        });
      },
    };
  },
};

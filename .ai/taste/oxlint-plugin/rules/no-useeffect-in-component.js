/**
 * taste/oxlint-plugin/rules/no-useeffect-in-component.js
 *
 * 规则: useEffect 不允许出现在 component 本体内。
 * 必须封装到命名的 `use*` hook(例: useSyncSelectionToUrl / useScrollRestoration)。
 *
 * 规则定义: .ai/taste/rules.md#no-useeffect-in-component
 * 机器注册: .ai/taste/rules.ts -> 'no-useeffect-in-component'
 *
 * 分类(Option C,项目负责人拍板):
 *   - hook:         函数名 /^use[A-Z]/   → useEffect 合法
 *   - component:    函数名首字母大写 AND 函数体含 JSX → useEffect 禁止
 *   - other:        都不匹配 → 本规则放过(RoH 会抓)
 *
 * 抗 bypass 已覆盖:
 *   - memo(forwardRef(fn)) / React.memo(React.forwardRef(fn)) 任意层 wrapper
 *   - React.useEffect 成员访问
 *   - component 内 .map/callback 中的 useEffect (用 stack 回溯)
 *
 * 零例外: 哪怕只用一次,也抽到命名 hook。
 */

const WRAPPER_CALLEES = new Set(["forwardRef", "memo", "observer"]);

function isWrapperCall(node) {
  if (!node || node.type !== "CallExpression" || !node.callee) return false;
  const callee = node.callee;
  if (callee.type === "Identifier" && WRAPPER_CALLEES.has(callee.name)) return true;
  if (
    callee.type === "MemberExpression" &&
    callee.property &&
    callee.property.type === "Identifier" &&
    WRAPPER_CALLEES.has(callee.property.name)
  )
    return true;
  return false;
}

function findFunctionName(node) {
  if (node.id && node.id.name) return node.id.name;
  let p = node.parent;
  // 穿过任意层 wrapper: memo(forwardRef(fn)) / React.memo(React.forwardRef(fn))
  while (p && isWrapperCall(p)) {
    p = p.parent;
  }
  if (!p) return null;
  if (p.type === "VariableDeclarator" && p.id && p.id.type === "Identifier") return p.id.name;
  if (p.type === "AssignmentExpression" && p.left && p.left.type === "Identifier")
    return p.left.name;
  if (p.type === "Property" && p.key && p.key.type === "Identifier") return p.key.name;
  return null;
}

function bodyHasJsx(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "JSXElement" || node.type === "JSXFragment") return true;
  for (const k in node) {
    if (k === "parent" || k === "loc" || k === "range" || k === "start" || k === "end") continue;
    const v = node[k];
    if (Array.isArray(v)) {
      for (const c of v) if (bodyHasJsx(c)) return true;
    } else if (v && typeof v === "object" && typeof v.type === "string") {
      if (bodyHasJsx(v)) return true;
    }
  }
  return false;
}

function classify(node) {
  const name = findFunctionName(node);
  if (!name) return "other";
  if (/^use[A-Z]/.test(name)) return "hook";
  if (/^[A-Z]/.test(name) && bodyHasJsx(node.body)) return "component";
  return "other";
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

function nearestMeaningful(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] !== "other") return stack[i];
  }
  return "other";
}

export default {
  create(context) {
    const stack = [];
    const enter = (node) => stack.push(classify(node));
    const exit = () => stack.pop();
    return {
      FunctionDeclaration: enter,
      FunctionExpression: enter,
      ArrowFunctionExpression: enter,
      "FunctionDeclaration:exit": exit,
      "FunctionExpression:exit": exit,
      "ArrowFunctionExpression:exit": exit,
      CallExpression(node) {
        if (!isUseEffectCall(node)) return;
        if (nearestMeaningful(stack) === "component") {
          context.report({
            message:
              "no-useeffect-in-component: 把 useEffect 抽到命名 use* hook(例 useSyncSelectionToUrl),component 本体禁止裸 useEffect",
            node,
          });
        }
      },
    };
  },
};

/**
 * taste 规则聚合入口
 *
 * .oxlintrc.json 的 jsPlugins 只应指向本文件,不要直接指向单条规则。
 * 新加规则:写在 ./rules/<id>.js,在此 import + 合并 rules 即可。
 */

import noUseEffectInComponent from "./rules/no-useeffect-in-component.js";
import noUseEffectFetch from "./rules/no-useeffect-fetch.js";

export default {
  meta: { name: "taste" },
  rules: {
    "no-useeffect-in-component": noUseEffectInComponent,
    "no-useeffect-fetch": noUseEffectFetch,
  },
};

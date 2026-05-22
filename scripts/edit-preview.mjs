// scripts/edit-preview.mjs
// 给 pre-tool-use hook 用:读 stdin JSON {file_path, old_string, new_string, replace_all},
// 输出 Edit 应用后的预期内容到 stdout。
// 退出码 0=预览成功,1=预览失败(调用方应 fail-open 让 Edit 工具自己报错)。
import { readFileSync } from "node:fs";

const raw = readFileSync(0, "utf8");
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.stderr.write("edit-preview: bad json\n");
  process.exit(1);
}

const { file_path, old_string, new_string, replace_all } = input;
if (
  typeof file_path !== "string" ||
  typeof old_string !== "string" ||
  typeof new_string !== "string"
) {
  process.stderr.write("edit-preview: missing fields\n");
  process.exit(1);
}

let current;
try {
  current = readFileSync(file_path, "utf8");
} catch {
  process.stderr.write("edit-preview: cannot read target\n");
  process.exit(1);
}

let next;
if (replace_all) {
  next = current.split(old_string).join(new_string);
} else {
  const idx = current.indexOf(old_string);
  if (idx < 0) {
    process.stderr.write("edit-preview: old_string not found\n");
    process.exit(1);
  }
  next = current.slice(0, idx) + new_string + current.slice(idx + old_string.length);
}

process.stdout.write(next);

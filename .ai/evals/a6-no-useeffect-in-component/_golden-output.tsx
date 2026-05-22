// _golden-output.tsx — eval a6 的期望产出样式 (模拟 CC 理想输出)
//
// Step 4 MVP: runner 的 taste-rule / vp-check 断言对本文件跑
// Step 5 live: CC 会真实写 `src/routes/orders/index.tsx`,对齐本文件风格
//
// 关键点:
//   - OrdersIndex(component) 本体零裸 useEffect
//   - 副作用抽成命名 hook useSyncSelectionToUrl
//   - 无 fetch(mock 数据内联)

import { useState } from "react";
import { useSyncSelectionToUrl } from "./_use-sync-selection-to-url";

interface Order {
  id: string;
  customer: string;
  total: number;
}

const MOCK_ORDERS: Order[] = [
  { id: "o-1", customer: "Alice", total: 120 },
  { id: "o-2", customer: "Bob", total: 80 },
  { id: "o-3", customer: "Carol", total: 240 },
];

function readSelectionFromUrl(): string[] {
  if (typeof window === "undefined") return [];
  const sel = new URL(window.location.href).searchParams.get("sel");
  return sel ? sel.split(",").filter(Boolean) : [];
}

export function OrdersIndex() {
  const [selection, setSelection] = useState<string[]>(readSelectionFromUrl);
  useSyncSelectionToUrl(selection);

  const toggle = (id: string) => {
    setSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Customer</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {MOCK_ORDERS.map((o) => (
          <tr key={o.id}>
            <td>
              <input
                type="checkbox"
                checked={selection.includes(o.id)}
                onChange={() => toggle(o.id)}
              />
            </td>
            <td>{o.customer}</td>
            <td>{o.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

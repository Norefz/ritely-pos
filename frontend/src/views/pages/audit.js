import { heading } from "./common.js";

export function audit() {
  return {
    rows: [
      heading(
        "Log audit",
        "Riwayat aktivitas akan tersedia setelah backend tersambung.",
      ),
    ],
  };
}

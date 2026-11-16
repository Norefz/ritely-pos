const SHEET_ROW_START = {
  MNM: 0,
  MKN: 5,
  BPO: 10,
  RMH: 15,
  PRD: 20,
};

export function productImageStyle(sku) {
  const match = /^(MNM|MKN|BPO|RMH|PRD)-(\d{3})$/.exec(String(sku || ""));
  if (!match) return "";
  const rowStart = SHEET_ROW_START[match[1]];
  const categoryIndex = Number(match[2]) - 1;
  if (categoryIndex < 0 || categoryIndex > 4) return "";
  const index = rowStart + categoryIndex;
  const column = index % 5;
  const row = Math.floor(index / 5);
  return `--product-image-x:${column * 25}%;--product-image-y:${row * 25}%;`;
}

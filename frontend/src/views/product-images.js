const SHEET_ROW_START = {
  MNM: 0,
  MKN: 5,
  BPO: 10,
  RMH: 15,
  PRD: 20,
};

export function productImageUrl(sku) {
  const match = /^(MNM|MKN|BPO|RMH|PRD)-(\d{3})$/.exec(String(sku || ""));
  if (!match) return "";
  const rowStart = SHEET_ROW_START[match[1]];
  const skuIndex = Number(match[2]) - 1;
  if (skuIndex < 0 || skuIndex > 9) return "";
  const sheet = Math.floor(skuIndex / 5);
  const categoryIndex = skuIndex % 5;
  const index = sheet * 25 + rowStart + categoryIndex;
  return `/assets/images/product-tiles/product-${String(index).padStart(2, "0")}.webp`;
}

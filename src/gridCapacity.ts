export function computeGridCapacity({
  width,
  height,
  itemWidth,
  itemHeight,
  gap,
}: {
  width: number;
  height: number;
  itemWidth: number;
  itemHeight: number;
  gap: number;
}): number {
  const usableWidth = Math.max(width, itemWidth);
  const usableHeight = Math.max(height, itemHeight);

  const effectiveGap = Math.max(0, gap);
  const columns = Math.max(1, Math.floor((usableWidth + effectiveGap) / (itemWidth + effectiveGap)));
  const minRows = 3;
  const rows = Math.max(minRows, Math.ceil((usableHeight + effectiveGap) / (itemHeight + effectiveGap)));

  return Math.max(1, columns * rows);
}

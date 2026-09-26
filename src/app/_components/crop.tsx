/** A detection's bounding box shown as a thumbnail, without distorting the photo. */
export function Crop({
  src,
  photoWidth,
  photoHeight,
  box,
  height = 72,
}: {
  src: string;
  photoWidth: number;
  photoHeight: number;
  box: { xMin: number; yMin: number; xMax: number; yMax: number };
  height?: number;
}) {
  const w = Math.max(box.xMax - box.xMin, 20);
  const h = Math.max(box.yMax - box.yMin, 20);
  const aspect = photoWidth && photoHeight ? (w * photoWidth) / (h * photoHeight) : 1;
  // Clamped only at extremes, so ordinary boxes keep their true proportions.
  const width = Math.min(Math.max(height * aspect, 24), height * 2.5);
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-xl bg-canvas"
      style={{ width, height }}
      aria-hidden
    >
      <img
        src={src}
        alt=""
        className="absolute max-w-none"
        style={{
          width: `${(1000 / w) * 100}%`,
          height: `${(1000 / h) * 100}%`,
          left: `${(-box.xMin / w) * 100}%`,
          top: `${(-box.yMin / h) * 100}%`,
        }}
      />
    </div>
  );
}

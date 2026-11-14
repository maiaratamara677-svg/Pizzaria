import React, { useMemo } from 'react';

interface PixQrSvgProps {
  value: string;
  size?: number;
}

/**
 * Deterministic high-contrast QR-style SVG matrix seeded from the PIX BR Code string.
 */
export const PixQrSvg: React.FC<PixQrSvgProps> = ({ value, size = 128 }) => {
  const grid = useMemo(() => {
    const dim = 21;
    const cells: boolean[][] = Array.from({ length: dim }, () => Array(dim).fill(false));

    // Draw standard 7x7 finder patterns in top-left, top-right, bottom-left
    const drawFinder = (startR: number, startC: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          cells[startR + r][startC + c] = isBorder || isCore;
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, dim - 7);
    drawFinder(dim - 7, 0);

    // Seed pseudo-random data modules from PIX payload
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    for (let r = 0; r < dim; r++) {
      for (let c = 0; c < dim; c++) {
        const inTopLeft = r < 8 && c < 8;
        const inTopRight = r < 8 && c >= dim - 8;
        const inBottomLeft = r >= dim - 8 && c < 8;
        if (inTopLeft || inTopRight || inBottomLeft) continue;

        hash ^= (r * 31 + c * 17) & 0xff;
        hash = Math.imul(hash, 16777619);
        cells[r][c] = (hash >>> 28) % 2 === 0;
      }
    }
    return cells;
  }, [value]);

  const dim = grid.length;
  const cellSize = 100 / dim;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="bg-white p-1.5 rounded-lg border border-slate-200 shrink-0"
      role="img"
      aria-label="QR Code PIX"
    >
      <rect width="100" height="100" fill="#FFFFFF" />
      {grid.map((row, r) =>
        row.map((filled, c) =>
          filled ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize + 0.12}
              height={cellSize + 0.12}
              fill="#0F172A"
            />
          ) : null
        )
      )}
    </svg>
  );
};

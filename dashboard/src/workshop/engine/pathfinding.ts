import { TileType, type OfficeLayout } from './types';

export function isWalkable(col: number, row: number, layout: OfficeLayout): boolean {
  if (row < 0 || row >= layout.rows || col < 0 || col >= layout.cols) return false;
  const t = layout.tiles[row][col];
  if (t === TileType.WALL || t === TileType.VOID) return false;
  if (layout.blocked.has(`${col},${row}`)) return false;
  return true;
}

/** BFS pathfinding on 4-connected grid. Returns path excluding start, including end. */
export function findPath(
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  layout: OfficeLayout,
  /** If true, allow ending on a non-walkable tile (e.g., assigned seat that's marked blocked). */
  allowEndOnBlocked = false,
): Array<{ col: number; row: number }> {
  if (startCol === endCol && startRow === endRow) return [];
  const key = (c: number, r: number) => `${c},${r}`;
  const startKey = key(startCol, startRow);
  const endKey = key(endCol, endRow);

  if (!allowEndOnBlocked && !isWalkable(endCol, endRow, layout)) return [];

  const visited = new Set<string>([startKey]);
  const parent = new Map<string, string>();
  const queue: Array<{ col: number; row: number }> = [{ col: startCol, row: startRow }];

  const dirs = [
    { dc: 0, dr: -1 },
    { dc: 0, dr: 1 },
    { dc: -1, dr: 0 },
    { dc: 1, dr: 0 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currKey = key(curr.col, curr.row);
    if (currKey === endKey) {
      const path: Array<{ col: number; row: number }> = [];
      let k = endKey;
      while (k !== startKey) {
        const [c, r] = k.split(',').map(Number);
        path.unshift({ col: c, row: r });
        k = parent.get(k)!;
      }
      return path;
    }
    for (const d of dirs) {
      const nc = curr.col + d.dc;
      const nr = curr.row + d.dr;
      const nk = key(nc, nr);
      if (visited.has(nk)) continue;
      const isEnd = nc === endCol && nr === endRow;
      if (isEnd && allowEndOnBlocked) {
        visited.add(nk);
        parent.set(nk, currKey);
        queue.push({ col: nc, row: nr });
        continue;
      }
      if (!isWalkable(nc, nr, layout)) continue;
      visited.add(nk);
      parent.set(nk, currKey);
      queue.push({ col: nc, row: nr });
    }
  }
  return [];
}

export function dirFromDelta(dc: number, dr: number): 0 | 1 | 2 | 3 {
  if (dr < 0) return 3;
  if (dr > 0) return 0;
  if (dc < 0) return 1;
  return 2;
}

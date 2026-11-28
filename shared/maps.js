// Cartes originales décrites en ASCII.
// Légende : '#' ou ' ' mur | '.' sol | 'c' caisse basse | 'C' caisse haute
//           'A' / 'B' zone de pose | 'T' spawn attaquants | 'D' spawn défenseurs | 'H' coffre (Battle Royale)
export const CELL = 4;
export const WALL_H = 9;
export const CRATE_LOW = 1.2;
export const CRATE_HIGH = 2.6;

const RAW = {
  // Battle Royale (1.53) : vallée agricole, 176 m de côté, ferme, hameau, chapelle, entrepôt, haies et silos, 28 coffres
  vallee: {
    name: 'VALLÉE', subtitle: 'Champs et fermes (Battle Royale)',
    theme: { sky: '#a9cbe0', fog: '#b9d2c0', fogNear: 70, fogFar: 260, wall: 'temple', floor: 'moss', crate: 'stonecrate', sun: '#fff1cf', sunInt: 2.4, hemiSky: '#e4f3d6', hemiGround: '#4d6a3a', hemiInt: 1.05, accent: '#ffd36b', night: false },
    disp: [[10, 10], [33, 10], [10, 33], [33, 25], [22, 16], [24, 40]],
    grid: [
      '############################################',
      '#..........................................#',
      '#.......................................H..#',
      '#...........#######........................#',
      '#...######..#.....#...CC......#####........#',
      '#...#c...#...Hc.......CC......#..c#..#####.#',
      '#...#.......#...c.#...........#...#....c...#',
      '#...#..Hc#..#.H...#...........#cH.#...c.H#.#',
      '#...##.###..###.###...........##.##..#...#.#',
      '#....................................#####.#',
      '#...................H.....##.............#.#',
      '#..........................................#',
      '#....##.##.....................##.###......#',
      '#....#...#.....................#....#......#',
      '#....#.........c.........H.....#.cHc.......#',
      '#....#..c#.....c...............#....#......#',
      '#....#cH.#...H.................######......#',
      '#....#####.....c............H..............#',
      '#..............c...######..................#',
      '#..............c...#.cH.#...............#..#',
      '#......................c#...............#..#',
      '#.......#......c...#....#..................#',
      '#.H............c...#..............CC.......#',
      '#..............c...#H...#..........C.......#',
      '#..........CC......##.###..................#',
      '#..............c.........cc.cc.cc.cc.cH....#',
      '#...cc.cc.cc...c...........................#',
      '#..........................................#',
      '#.........H................######.######...#',
      '#..........................#.........H.#...#',
      '#...##.###........#..H.....#...H....c..#...#',
      '#...#..c.#............c.......C..c..C..#...#',
      '#...#c................c....#...........#...#',
      '#...#..HH#.................#..C.....C......#',
      '#...#....#............c.............H.H#...#',
      '#...######...##.##....c....#...........#...#',
      '#............#..H#.........######.######...#',
      '#............#.c.#....c....................#',
      '#............#..c#....c....................#',
      '#............#####.......#...............H.#',
      '#..#.........................H.............#',
      '#................H...................#.....#',
      '#..........................................#',
      '############################################'
    ],
  },
  // Battle Royale (1.42) : petite ville, 160 m de côté, rues, maisons ouvertes, place centrale, 32 coffres
  ville: {
    name: 'BOURG', subtitle: 'Petite ville au crépuscule (Battle Royale)',
    theme: { sky: '#f3a46b', fog: '#e9a27a', fogNear: 60, fogFar: 230, wall: 'sand', floor: 'sandfloor', crate: 'crate', sun: '#ffd1a1', sunInt: 2.3, hemiSky: '#ffc8a0', hemiGround: '#6b4a3a', hemiInt: 1.05, accent: '#ff7a3d', night: false },
    grid: [
      '########################################',
      '#......................................#',
      '#.######.......#####H.......#####......#',
      '#.#............#............#..........#',
      '#.#..H.#..c....#.H.#...c....#.H.#...c..#',
      '#.#....#.......#...#........#...#......#',
      '#.###.##.....H.##.##......H.##.##.##.#.#',
      '#......##.##........##.##.........#..#.#',
      '#......#...#........#...#.........#..#.#',
      '#........H.#..........H.#...........H#.#',
      '#..C...#...#....C...#...#....C....#..#.#',
      '#......#####........#####.........####.#',
      '#......................................#',
      '#.....H.............C............H.....#',
      '#......................................#',
      '#.######....................######.....#',
      '#.#.............H......H....#..........#',
      '#.#..H.#..c.......c.........#..H.#..c..#',
      '#.#....#..............c.....#....#.....#',
      '#.###.##...........CC.......###.##.....#',
      '#.H.....##.#.C.....CC.....C.......##.H.#',
      '#.......#..#.....c................#..#.#',
      '#.........H#.........c..............H#.#',
      '#..C....#..#....H......H.....C....#..#.#',
      '#.......####......................####.#',
      '#......................................#',
      '#.....H.............C............H.....#',
      '#......................................#',
      '#.#####........#####........#####......#',
      '#.#............#............#..........#',
      '#.#...#...c....#.H.#...c....#.H.#...c..#',
      '#.#.H.#........#...#........#...#......#',
      '#.#...#........##.####.##...##.##......#',
      '#.##.##.##.#.H......#...#.H......##.##.#',
      '#.......#..#........#...#........#...#.#',
      '#.........H#..........H.#..........H.#.#',
      '#..C....#..#....C...#...#....C...#...#.#',
      '#.......####........H####........#####.#',
      '#......................................#',
      '########################################'
    ],
  },
  dune: {
    name: 'DUNE', subtitle: 'Avant-poste désertique',
    theme: { sky: '#f0c290', fog: '#efc79c', fogNear: 50, fogFar: 190, wall: 'sand', floor: 'sandfloor', crate: 'crate', sun: '#fff0d6', sunInt: 2.6, hemiSky: '#ffe4bf', hemiGround: '#9a6c43', hemiInt: 1.0, accent: '#ff9d3b', night: false },
    grid: [
      '################################',
      '#AAAAAAA#####DDDDDD####BBBBBBBB#',
      '#AAcAAAA#####DDDDDD####BBBCBBBB#',
      '#AAAAAAA.....DDDDDD.....BBBBBBB#',
      '#AAACAAA.....DDDDDD.....BBBBcBB#',
      '#AAAAAAA##.....c.....###BBBBBBB#',
      '##..######.........#####BB######',
      '##..######...####..#####..######',
      '##..#####....####...####..######',
      '##..#####.C..####..C####..######',
      '#.......#....####.......#......#',
      '#..c....#............c..#..c...#',
      '#.......####...C.....####......#',
      '#.......####.........####......#',
      '####..######...####..######..###',
      '####..######...####..######..###',
      '####...........####..........###',
      '####..c........####......c...###',
      '#######..####........####..#####',
      '#######..####........####..#####',
      '#######..####TTTTTTTT####..#####',
      '#######......TTTTTTTT......#####',
      '#######......TTTTTTTT......#####',
      '################################',
    ],
  },
  neon: {
    name: 'NÉON', subtitle: 'Quartier cyberpunk',
    theme: { sky: '#0a0720', fog: '#120a2e', fogNear: 30, fogFar: 150, wall: 'neon', floor: 'neonfloor', crate: 'neoncrate', sun: '#8f7cff', sunInt: 1.1, hemiSky: '#5b4bd1', hemiGround: '#1a0f33', hemiInt: 1.3, accent: '#00e5ff', night: true },
    grid: [
      '##################################',
      '##DDDDDD########......############',
      '##DDDDDD########......####BBBBBBB#',
      '##DDDDDD..............####BBBcBBB#',
      '##DDDDDD..............C...BBBBBBB#',
      '######..####..######......BBCBBBB#',
      '#AAAAA..####..######..#####BBBBBB#',
      '#AAcAA......c.........#####BBB####',
      '#AAAAAAC..............#####...####',
      '#AAAAAA...######..C.....##....####',
      '#AACAAA...######........##.c..####',
      '##..####..######..####..##....####',
      '##..####..........####........####',
      '##..####....c.....####..c.....####',
      '##......######..########..########',
      '##......######..########..########',
      '##..c...######....TTTTTT......####',
      '######............TTTTTT..c...####',
      '######............TTTTTT......####',
      '##################################',
    ],
  },
  glacier: {
    name: 'GLACIER', subtitle: 'Station polaire',
    theme: { sky: '#bcd9ef', fog: '#d7e9f6', fogNear: 35, fogFar: 160, wall: 'ice', floor: 'snow', crate: 'icecrate', sun: '#ffffff', sunInt: 2.3, hemiSky: '#dff1ff', hemiGround: '#7f9bb3', hemiInt: 1.1, accent: '#5ad1ff', night: false },
    grid: [
      '####################################',
      '#########AAAAAAAA########.....DDDDD#',
      '#..######AAAcAAAA####.........DDDDD#',
      '#........AAAAAAAA####..c......DDDDD#',
      '#..c.....AAAACAAA.............DDDDD#',
      '#........AAAAAAAA....##########..###',
      '####..#######..#######.......##..###',
      '####..#######..###.......C...##..###',
      '#TTT.....###.....###.........##..###',
      '#TTT.....###..c..###..####.......###',
      '#TTT..C........C......####..c....###',
      '#TTT.....###..c..###..####.......###',
      '#TTT.....###.....###.........##..###',
      '####..#######..###.......C...##..###',
      '####..#######..#######.......##..###',
      '#........BBBBBBBB....##########..###',
      '#..c.....BBBBCBBB.............DDDDD#',
      '#........BBBBBBBB####..c......DDDDD#',
      '#..######BBBcBBBB####.........DDDDD#',
      '#########BBBBBBBB########.....DDDDD#',
      '####################################',
    ],
  },
  temple: {
    name: 'TEMPLE', subtitle: 'Ruines de la jungle',
    theme: { sky: '#9fc7a8', fog: '#a9c9a3', fogNear: 30, fogFar: 150, wall: 'temple', floor: 'moss', crate: 'stonecrate', sun: '#fff5d0', sunInt: 2.2, hemiSky: '#d8f2c9', hemiGround: '#3c5a34', hemiInt: 1.0, accent: '#7dff8a', night: false },
    grid: [
      '##################################',
      '#############DDDDDDDD#############',
      '#######......DDDDDDDD......#######',
      '#######..c...DDDDDDDD...c..#######',
      '#AAAAAA......................BBBBB#',
      '#AAAAAA###..####....####..###BBBBB#',
      '#AAcAAA###..####....####..###BcBBB#',
      '#AAAAAA.......##....##.......BBBBB#',
      '#AAACAA.......##....##.......BBCBB#',
      '#AAAAAA###....##.C..##....###BBBBB#',
      '###..#####..............#####..####',
      '###..#####...C......C...#####..####',
      '###..######....####....######..####',
      '#.........#....####....#.........##',
      '#..c......#....####....#......c..##',
      '#....C.........####.........C....##',
      '#.........###........###.........##',
      '######..#####...TT...#####..#######',
      '######..#####TTTTTTTT#####..#######',
      '######.......TTTTTTTT.......#######',
      '######.......TTTTTTTT.......#######',
      '##################################',
    ],
  },
  // ---------- petites cartes (Duel 1v1) ----------
  fosse: {
    name: 'FOSSE', subtitle: 'Arène de duel — ruines', small: true,
    theme: { sky: '#9fc7a8', fog: '#a9c9a3', fogNear: 30, fogFar: 120, wall: 'temple', floor: 'moss', crate: 'stonecrate', sun: '#fff5d0', sunInt: 2.2, hemiSky: '#d8f2c9', hemiGround: '#3c5a34', hemiInt: 1.0, accent: '#7dff8a', night: false },
    grid: [
      '##################',
      '#TT...#....#...DD#',
      '#TT.c.#.c..#.c.DD#',
      '#TT.......C....DD#',
      '#.....##..##.....#',
      '#.C...#....#...C.#',
      '#.....#.cc.#.....#',
      '#.C...#....#...C.#',
      '#.....##..##.....#',
      '#TT....C.......DD#',
      '#TT.c.#..c.#.c.DD#',
      '#TT...#....#...DD#',
      '##################',
    ],
  },
  cube: {
    name: 'CUBE', subtitle: 'Arène de duel — néon', small: true,
    theme: { sky: '#0a0720', fog: '#120a2e', fogNear: 25, fogFar: 110, wall: 'neon', floor: 'neonfloor', crate: 'neoncrate', sun: '#8f7cff', sunInt: 1.1, hemiSky: '#5b4bd1', hemiGround: '#1a0f33', hemiInt: 1.3, accent: '#ff3fa4', night: true },
    grid: [
      '################',
      '#TTT...##...c..#',
      '#TTT.c.##.C....#',
      '#TTT...........#',
      '#...####..####.#',
      '#.c.#......#...#',
      '#...#..CC..#.c.#',
      '#.c.#..CC..#...#',
      '#...#......#.c.#',
      '#.####..####...#',
      '#...........DDD#',
      '#....C.##.c.DDD#',
      '#..c...##...DDD#',
      '################',
    ],
  },
  igloo: {
    name: 'IGLOO', subtitle: 'Arène de duel — banquise', small: true,
    theme: { sky: '#bcd9ef', fog: '#d7e9f6', fogNear: 30, fogFar: 120, wall: 'ice', floor: 'snow', crate: 'icecrate', sun: '#ffffff', sunInt: 2.3, hemiSky: '#dff1ff', hemiGround: '#7f9bb3', hemiInt: 1.1, accent: '#5ad1ff', night: false },
    grid: [
      '####################',
      '#TT....c....c....DD#',
      '#TT.####....####.DD#',
      '#TT.#..C....C..#.DD#',
      '#...#..........#...#',
      '#.c....##..##....c.#',
      '#...#..........#...#',
      '#TT.#..C....C..#.DD#',
      '#TT.####....####.DD#',
      '#TT....c....c....DD#',
      '####################',
    ],
  },
};

export const MAP_ORDER = ['dune', 'neon', 'glacier', 'temple', 'fosse', 'cube', 'igloo'];
export const LARGE_MAPS = ['dune', 'neon', 'glacier', 'temple'];
export const SMALL_MAPS = ['fosse', 'cube', 'igloo'];
export const BR_MAPS = ['ville', 'vallee'];
export const mapsForMode = mode => mode === 'br' ? BR_MAPS : mode === 'duel' ? SMALL_MAPS : mode === 'assault' ? LARGE_MAPS : MAP_ORDER;
export const MAP_INFO = Object.fromEntries([...MAP_ORDER, ...BR_MAPS].map(id => [id, { id, name: RAW[id].name, subtitle: RAW[id].subtitle, theme: RAW[id].theme, small: !!RAW[id].small }]));

const FLOORISH = new Set(['.', 'A', 'B', 'T', 'D', 'H']);
const cache = {};

export function parseMap(id) {
  if (cache[id]) return cache[id];
  const raw = RAW[id] || RAW.dune;
  const h = raw.grid.length;
  const w = Math.max(...raw.grid.map(r => r.length));
  const grid = raw.grid.map(r => r.padEnd(w, '#'));
  // bordures forcées en mur
  for (let j = 0; j < h; j++) {
    const row = grid[j].split('');
    for (let i = 0; i < w; i++) if (i === 0 || j === 0 || i === w - 1 || j === h - 1) row[i] = '#';
    grid[j] = row.join('');
  }
  const ch = (i, j) => (i < 0 || j < 0 || i >= w || j >= h) ? '#' : grid[j][i];
  const isWall = c => !(FLOORISH.has(c) || c === 'c' || c === 'C');

  // Fusion gloutonne des murs en rectangles
  const boxes = [];
  const used = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (used[j * w + i] || !isWall(ch(i, j))) continue;
      let i2 = i;
      while (i2 + 1 < w && !used[j * w + i2 + 1] && isWall(ch(i2 + 1, j))) i2++;
      let j2 = j;
      outer: while (j2 + 1 < h) {
        for (let k = i; k <= i2; k++) if (used[(j2 + 1) * w + k] || !isWall(ch(k, j2 + 1))) break outer;
        j2++;
      }
      for (let jj = j; jj <= j2; jj++) for (let k = i; k <= i2; k++) used[jj * w + k] = 1;
      boxes.push({ min: [i * CELL, 0, j * CELL], max: [(i2 + 1) * CELL, WALL_H, (j2 + 1) * CELL], kind: 'wall' });
    }
  }
  const crates = [];
  const spawns = { atk: [], def: [] };
  const sites = { A: [], B: [] };
  const floor = [];
  const chests = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = ch(i, j);
    const cx = (i + 0.5) * CELL, cz = (j + 0.5) * CELL;
    if (c === 'c' || c === 'C') {
      const ins = 0.35, ht = c === 'c' ? CRATE_LOW : CRATE_HIGH;
      const box = { min: [i * CELL + ins, 0, j * CELL + ins], max: [(i + 1) * CELL - ins, ht, (j + 1) * CELL - ins], kind: c === 'c' ? 'crate' : 'crateHigh' };
      boxes.push(box); crates.push(box);
    }
    if (FLOORISH.has(c)) floor.push([i, j]);
    if (c === 'T') spawns.atk.push([cx, cz]);
    if (c === 'D') spawns.def.push([cx, cz]);
    if (c === 'A') sites.A.push([i, j]);
    if (c === 'B') sites.B.push([i, j]);
    if (c === 'H') chests.push([cx, cz]);
  }
  const center = cells => {
    if (!cells.length) return null;
    let x = 0, z = 0;
    for (const [i, j] of cells) { x += (i + 0.5) * CELL; z += (j + 0.5) * CELL; }
    return [x / cells.length, z / cells.length];
  };
  const map = {
    id, name: raw.name, subtitle: raw.subtitle, theme: raw.theme, small: !!raw.small, w, h, grid, boxes, crates, spawns, floor, chests, disp: raw.disp || null,
    sites: { A: { cells: sites.A, center: center(sites.A) }, B: { cells: sites.B, center: center(sites.B) } },
    size: [w * CELL, h * CELL],
    cellAt(x, z) { return ch(Math.floor(x / CELL), Math.floor(z / CELL)); },
    walkable(i, j) { return FLOORISH.has(ch(i, j)); },
  };
  cache[id] = map;
  return map;
}

// A* sur la grille (pour les bots)
export function findPath(map, from, to) {
  const { w, h } = map;
  const si = Math.floor(from[0] / CELL), sj = Math.floor(from[1] / CELL);
  const ti = Math.floor(to[0] / CELL), tj = Math.floor(to[1] / CELL);
  if (!map.walkable(ti, tj)) return null;
  const key = (i, j) => j * w + i;
  const g = new Map(), came = new Map();
  const open = [[si, sj, 0]];
  g.set(key(si, sj), 0);
  const hfn = (i, j) => Math.hypot(i - ti, j - tj);
  const closed = new Set();
  let guard = 0;
  while (open.length && guard++ < 5000) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][2] < open[bi][2]) bi = k;
    const [ci, cj] = open.splice(bi, 1)[0];
    const ck = key(ci, cj);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (ci === ti && cj === tj) {
      const path = [];
      let k = ck;
      while (k !== undefined) { const i = k % w, j = (k - i) / w; path.unshift([(i + 0.5) * CELL, (j + 0.5) * CELL]); k = came.get(k); }
      return path;
    }
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (!map.walkable(ni, nj)) continue;
      if (di && dj && (!map.walkable(ci + di, cj) || !map.walkable(ci, cj + dj))) continue;
      const nk = key(ni, nj);
      const ng = g.get(ck) + (di && dj ? 1.414 : 1);
      if (ng < (g.has(nk) ? g.get(nk) : Infinity)) {
        g.set(nk, ng); came.set(nk, ck);
        open.push([ni, nj, ng + hfn(ni, nj)]);
      }
    }
  }
  return null;
}

// Genera los iconos PWA de la app: fondo con el color de marca + placa de Petri con
// colonias, usando la paleta de la app (agar, violeta, verde, amarillo, coral). No añade
// dependencias (sharp/canvas) -- dibuja píxel a píxel en un búfer y escribe un PNG válido
// solo con `zlib`. Se usa supersampling 3x para bordes suaves.
// Uso: node scripts/generate-pwa-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Paleta (del CSS/tokens de la app). RGB 0-255.
const COLORS = {
  bg:        [0x24, 0x1e, 0x3d], // --ink (#241E3D) fondo de marca
  agar:      [0xff, 0xf6, 0xe7], // --agar (#FFF6E7) placa
  agarRim:   [0xf0, 0xde, 0xbe], // --dish-line (#F0DEBE) borde
  colonyG:   [0x1B, 0x7A, 0x50], // --colony (#1B7A50) verde
  colonyR:   [0xC1, 0x3A, 0x2C], // --contam (#C13A2C) coral
  colonyY:   [0xF4, 0xA3, 0x40], // --amber (#F4A340) amarillo
  violet:    [0x6D, 0x45, 0xD3], // --violet (#6D45D3) violeta
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function writePng(size, pixels) {
  // pixels: Uint8Array de tamaño size*size*3 (RGB truecolor opaco).
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowBytes = 1 + size * 3;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filtro: none
    const src = y * size * 3;
    pixels.copy(raw, y * rowBytes + 1, src, src + size * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Composición de la escena en coordenadas normalizadas (0..1, con el centro en 0.5,0.5).
// Cada "elemento" es un círculo relleno; el orden importa (primero fondo, encima colonias).
// La placa cubre casi todo el icono (radio grande) para que quede reconocible incluso a
// tamaños pequeños. Las colonias están colocadas a mano para que compongan bien y no se
// solapen mucho.
const SCENE = [
  // Placa de Petri (agar) con un pequeño reborde
  { cx: 0.50, cy: 0.50, r: 0.395, color: COLORS.agarRim },
  { cx: 0.50, cy: 0.50, r: 0.380, color: COLORS.agar },
  // Colonias (radios relativos al icono)
  { cx: 0.38, cy: 0.40, r: 0.070, color: COLORS.colonyG },
  { cx: 0.63, cy: 0.36, r: 0.048, color: COLORS.violet },
  { cx: 0.58, cy: 0.55, r: 0.085, color: COLORS.colonyG },
  { cx: 0.36, cy: 0.62, r: 0.055, color: COLORS.colonyR },
  { cx: 0.68, cy: 0.63, r: 0.038, color: COLORS.colonyY },
];

// Muestrea cuántos sub-píxeles caen dentro de cada círculo -> valor de cobertura 0..1
// (anti-aliasing simple). Devuelve el búfer RGB del tamaño pedido.
function renderScene(size) {
  const SS = 3; // supersampling
  const total = size * size * 3;
  const buf = Buffer.alloc(total);

  // Prepara círculos en coordenadas absolutas (px del icono final).
  const shapes = SCENE.map(s => ({
    cx: s.cx * size,
    cy: s.cy * size,
    r: s.r * size,
    r2: (s.r * size) ** 2,
    color: s.color,
  }));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // color arranca en fondo
      let r = COLORS.bg[0], g = COLORS.bg[1], b = COLORS.bg[2];

      for (const s of shapes) {
        // Rechazo rápido: si el centro está lejos del círculo, pasa.
        const dx = x + 0.5 - s.cx;
        const dy = y + 0.5 - s.cy;
        const d2 = dx * dx + dy * dy;
        const rOut = s.r + 1;
        if (d2 > rOut * rOut) continue;

        // Cobertura por supersampling.
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const px = x + (sx + 0.5) / SS - s.cx;
            const py = y + (sy + 0.5) / SS - s.cy;
            if (px * px + py * py <= s.r2) hits++;
          }
        }
        if (hits === 0) continue;
        const cov = hits / (SS * SS);
        r = Math.round(r * (1 - cov) + s.color[0] * cov);
        g = Math.round(g * (1 - cov) + s.color[1] * cov);
        b = Math.round(b * (1 - cov) + s.color[2] * cov);
      }

      const i = (y * size + x) * 3;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
    }
  }
  return buf;
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of targets) {
  const pixels = renderScene(size);
  fs.writeFileSync(path.join(outDir, name), writePng(size, pixels));
  console.log(`generado ${name} (${size}x${size})`);
}

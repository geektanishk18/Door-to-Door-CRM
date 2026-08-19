const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

function drawMark(size, { maskable = false, bg = true, radiusPct = 0.22 } = {}) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');

  // background
  if (bg) {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#6366F1');
    grad.addColorStop(1, '#3730D9');
    ctx.fillStyle = grad;
    if (maskable) {
      ctx.fillRect(0, 0, size, size);
    } else {
      const r = size * radiusPct;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(size, 0, size, size, r);
      ctx.arcTo(size, size, 0, size, r);
      ctx.arcTo(0, size, 0, 0, r);
      ctx.arcTo(0, 0, size, 0, r);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.clearRect(0, 0, size, size);
  }

  // subtle top-light sheen
  const sheen = ctx.createRadialGradient(size*0.32, size*0.22, size*0.02, size*0.5, size*0.5, size*0.75);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  // glyph: a signal/target ring motif standing in for "Ground Control"
  const scale = maskable ? 0.52 : 0.62;
  const cx = size / 2, cy = size / 2 + size * (maskable ? 0.01 : 0.015);
  const R = size * scale * 0.5;

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';

  // outer ring (open arc, like a locator ping)
  ctx.lineWidth = size * 0.085;
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI * 0.85, Math.PI * 2.55, false);
  ctx.stroke();

  // center dot (the "pin")
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.078, 0, Math.PI * 2);
  ctx.fill();

  return c;
}

const targets = [
  { name: 'icon-512.png', size: 512, opts: {} },
  { name: 'icon-384.png', size: 384, opts: {} },
  { name: 'icon-192.png', size: 192, opts: {} },
  { name: 'icon-152.png', size: 152, opts: {} },
  { name: 'icon-144.png', size: 144, opts: {} },
  { name: 'icon-128.png', size: 128, opts: {} },
  { name: 'icon-96.png', size: 96, opts: {} },
  { name: 'icon-72.png', size: 72, opts: {} },
  { name: 'icon-48.png', size: 48, opts: {} },
  { name: 'favicon-32.png', size: 32, opts: {} },
  { name: 'favicon-16.png', size: 16, opts: {} },
  { name: 'apple-touch-icon.png', size: 180, opts: { radiusPct: 0 } }, // iOS applies its own mask
  { name: 'maskable-512.png', size: 512, opts: { maskable: true } },
  { name: 'maskable-192.png', size: 192, opts: { maskable: true } },
];

for (const t of targets) {
  const canvas = drawMark(t.size, t.opts);
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(OUT, t.name), buf);
  console.log('wrote', t.name, buf.length, 'bytes');
}

// splash-ish social/OG image (not part of PWA icons but handy)
console.log('done');

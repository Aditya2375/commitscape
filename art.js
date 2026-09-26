/* Commitscape art — render a repo's commit history as a generative print.
   Deterministic: the same history always produces the same piece. */

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function prng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const PALETTES = {
  nocturne: { bg: "#0a0d12", cols: ["#e8b23a", "#3da87a", "#5aa3d0", "#e06c5a", "#8a7fd4", "#e8e6df"] },
  phosphor: { bg: "#0b120d", cols: ["#39d98a", "#7fd4ab", "#2c5c46", "#e8b23a", "#d0f4e0", "#1e3a2e"] },
  ember: { bg: "#120c0a", cols: ["#e06c5a", "#e8b23a", "#d4915e", "#8a7fd4", "#f0dcc8", "#5f3a30"] }
};

function renderCommitscape(canvas, commits, styleName, paletteName, onCaption) {
  const W = 1400, H = 800;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const pal = PALETTES[paletteName] || PALETTES.nocturne;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, H);

  const sorted = [...commits].sort((a, b) => a.date.localeCompare(b.date));
  const items = sorted.map((c, i) => {
    const h = hashStr(c.sha + c.msg);
    const r = prng(h);
    const d = new Date(c.date);
    return {
      c, i, r,
      hour: d.getHours() + d.getMinutes() / 60,
      dow: d.getDay(),
      msgLen: c.msg.length,
      col: pal.cols[h % pal.cols.length],
      col2: pal.cols[(h >> 3) % pal.cols.length]
    };
  });

  const painters = {
    river(ctx) {
      const lanes = 7;
      const laneH = (H - 120) / lanes;
      items.forEach((it, i) => {
        const x = 60 + (i / Math.max(items.length - 1, 1)) * (W - 120);
        const yBase = 60 + it.dow * laneH + laneH / 2;
        const y = yBase + (it.r() - 0.5) * laneH * 0.7;
        const size = 3 + (it.msgLen / 60) * 9 + it.r() * 4;
        ctx.globalAlpha = 0.28 + it.r() * 0.6;
        ctx.strokeStyle = it.col;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = it.col;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.32, 0, Math.PI * 2);
        ctx.fill();
        if (i > 0) {
          ctx.globalAlpha = 0.12;
          ctx.strokeStyle = it.col2;
          ctx.beginPath();
          ctx.moveTo(60 + ((i - 1) / Math.max(items.length - 1, 1)) * (W - 120), 60 + items[i - 1].dow * laneH + laneH / 2);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
      return "Each ring is a commit. Lanes are days of the week; size follows the message length; left to right is time.";
    },
    bloom(ctx) {
      const cx = W / 2, cy = H / 2;
      const golden = Math.PI * (3 - Math.sqrt(5));
      items.forEach((it, i) => {
        const angle = i * golden + it.r() * 0.12;
        const rad = 14 * Math.sqrt(i) + it.r() * 8;
        const x = cx + Math.cos(angle) * rad;
        const y = cy + Math.sin(angle) * rad * 0.62;
        const petals = 3 + (hashStr(it.c.sha) % 4);
        const size = 5 + (it.hour / 24) * 14 + it.r() * 6;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.globalAlpha = 0.35 + it.r() * 0.55;
        ctx.fillStyle = it.col;
        for (let p = 0; p < petals; p++) {
          ctx.rotate((Math.PI * 2) / petals);
          ctx.beginPath();
          ctx.ellipse(size * 0.7, 0, size * 0.7, size * 0.26, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = pal.bg;
        ctx.beginPath(); ctx.arc(0, 0, size * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      return "A phyllotactic bloom: each flower is a commit, petal size follows the hour it was written. Night commits grow largest.";
    },
    static(ctx) {
      // scatter-static: TV-noise field, commits as bright interruptions
      const cols = Math.ceil(Math.sqrt(items.length * (W / H)));
      const rows = Math.ceil(items.length / cols);
      const cw = (W - 120) / cols, ch = (H - 120) / rows;
      items.forEach((it, i) => {
        const gx = 60 + (i % cols) * cw + cw / 2;
        const gy = 60 + Math.floor(i / cols) * ch + ch / 2;
        const n = 4 + Math.floor(it.r() * 10);
        for (let k = 0; k < n; k++) {
          ctx.globalAlpha = 0.14 + it.r() * 0.7;
          ctx.fillStyle = k === 0 ? it.col : it.col2;
          const ox = (it.r() - 0.5) * cw * 0.8, oy = (it.r() - 0.5) * ch * 0.8;
          const s = 1.5 + it.r() * (2 + it.msgLen / 12);
          ctx.fillRect(gx + ox, gy + oy, s, s);
        }
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = it.col;
        ctx.fillRect(gx - 1.5, gy - 1.5, 3, 3);
      });
      ctx.globalAlpha = 1;
      return "Signal in static: every bright cell is a commit, noise density follows how much was said about it.";
    }
  };

  const caption = (painters[styleName] || painters.river)(ctx);

  // frame
  ctx.strokeStyle = "rgba(232,230,223,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(24.5, 24.5, W - 49, H - 49);
  ctx.fillStyle = "rgba(232,230,223,0.55)";
  ctx.font = "12px 'IBM Plex Mono', monospace";
  ctx.textAlign = "left";
  ctx.fillText("COMMITSCAPE — " + items.length + " commits", 40, H - 38);
  ctx.textAlign = "right";
  const first = items[0] ? new Date(items[0].c.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const last = items[items.length - 1] ? new Date(items[items.length - 1].c.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  ctx.fillText(first + " → " + last, W - 40, H - 38);
  if (onCaption) onCaption(caption);
}

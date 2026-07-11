import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const width = 1200;
const height = 630;
const output = fileURLToPath(new URL('../public/og-study.png', import.meta.url));

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a1a" stroke-opacity="0.055"/>
    </pattern>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fffdf8"/>
      <stop offset="1" stop-color="#f1ece4"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#paper)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <path d="M 836 0 V630 M 1000 0 V630" stroke="#c4452d" stroke-opacity="0.2"/>
  <circle cx="1000" cy="204" r="214" fill="none" stroke="#c4452d" stroke-width="2" stroke-opacity="0.5"/>
  <circle cx="1000" cy="204" r="116" fill="none" stroke="#285f73" stroke-width="2" stroke-dasharray="7 9" stroke-opacity="0.6"/>
  <path d="M 786 418 L 1184 20" stroke="#285f73" stroke-width="2" stroke-opacity="0.35"/>

  <g font-family="Helvetica Neue, PingFang SC, Noto Sans CJK SC, Arial, sans-serif">
    <text x="72" y="96" fill="#285f73" font-size="18" font-weight="600" letter-spacing="4">JASON / WORKS  ·  LEARNING SYSTEM</text>
    <text x="72" y="270" fill="#1a1a1a" font-family="Georgia, Songti SC, serif" font-size="104" font-weight="600" letter-spacing="-4">Study</text>
    <text x="76" y="342" fill="#1a1a1a" font-size="34" font-weight="600">从真实项目和经典论文里</text>
    <text x="76" y="390" fill="#1a1a1a" font-size="34" font-weight="600">建立工程判断力</text>
    <text x="76" y="446" fill="#6f6a61" font-size="20">Source code × foundational papers × explicit evidence</text>
    <g transform="translate(72 516)" font-size="16" font-weight="600" letter-spacing="1.2">
      <rect width="166" height="44" rx="22" fill="#285f73" fill-opacity="0.11" stroke="#285f73" stroke-opacity="0.42"/>
      <text x="83" y="28" text-anchor="middle" fill="#285f73">MAINTAINED</text>
      <rect x="180" width="194" height="44" rx="22" fill="#c4452d" fill-opacity="0.08" stroke="#c4452d" stroke-opacity="0.35"/>
      <text x="277" y="28" text-anchor="middle" fill="#a83a26">3 STARTER PATHS</text>
    </g>
  </g>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(output);
console.log(`Generated public/og-study.png (${width}×${height})`);

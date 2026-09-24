import * as THREE from "three";
import { canvasTexture, rng } from "./utils.js";

const JP_FONT = "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif CJK JP', 'Noto Serif JP', 'IPAexMincho', 'MS Mincho', serif";
const JP_SANS = "'Hiragino Sans', 'Yu Gothic', 'Meiryo', 'Noto Sans CJK JP', 'Noto Sans JP', sans-serif";

function woodGrainTexture() {
  return canvasTexture(256, 256, (context, width, height) => {
    const random = rng(404);
    context.fillStyle = "#b08a64";
    context.fillRect(0, 0, width, height);
    for (let line = 0; line < 90; line += 1) {
      const x = random() * width;
      const shade = random() > 0.5 ? "rgba(70,44,26," : "rgba(210,176,136,";
      context.strokeStyle = `${shade}${0.08 + random() * 0.22})`;
      context.lineWidth = 0.6 + random() * 2.2;
      context.beginPath();
      context.moveTo(x, 0);
      for (let y = 0; y <= height; y += 16) context.lineTo(x + Math.sin(y * 0.03 + line) * 3 + (random() - 0.5) * 1.5, y);
      context.stroke();
    }
    for (let knot = 0; knot < 3; knot += 1) {
      const x = random() * width;
      const y = random() * height;
      context.strokeStyle = "rgba(60,36,20,0.35)";
      for (let ring = 1; ring < 5; ring += 1) {
        context.beginPath();
        context.ellipse(x, y, ring * 2.2, ring * 5.5, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }, { repeat: 1, anisotropy: 4 });
}

function concreteTexture() {
  return canvasTexture(256, 256, (context, width, height) => {
    const image = context.createImageData(width, height);
    const random = rng(505);
    for (let index = 0; index < width * height; index += 1) {
      const value = 150 + random() * 28 - (random() > 0.985 ? 60 : 0);
      image.data[index * 4] = value;
      image.data[index * 4 + 1] = value;
      image.data[index * 4 + 2] = value + 4;
      image.data[index * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    for (let index = 0; index < 30; index += 1) {
      const x = random() * width;
      const gradient = context.createLinearGradient(x, 0, x + 8, height);
      gradient.addColorStop(0, "rgba(40,40,44,0.0)");
      gradient.addColorStop(0.5, `rgba(40,40,44,${0.05 + random() * 0.12})`);
      gradient.addColorStop(1, "rgba(40,40,44,0.0)");
      context.fillStyle = gradient;
      context.fillRect(x, 0, 3 + random() * 10, height);
    }
  }, { repeat: 1, anisotropy: 4 });
}

/** Soft, billowy alpha mask for clouds and mist. */
function cloudTexture() {
  return canvasTexture(256, 256, (context, width) => {
    const random = rng(71);
    context.clearRect(0, 0, width, width);
    for (let puff = 0; puff < 34; puff += 1) {
      const angle = random() * Math.PI * 2;
      const distance = Math.pow(random(), 0.8) * width * 0.26;
      const x = width / 2 + Math.cos(angle) * distance * 1.25;
      const y = width / 2 + Math.sin(angle) * distance * 0.7 + 10;
      const radius = width * (0.09 + random() * 0.13);
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(255,255,255,0.42)");
      gradient.addColorStop(0.55, "rgba(255,255,255,0.2)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }, { srgb: false, anisotropy: 1 });
}

/** Cluster of five-petal cherry blossoms on a transparent card. */
function blossomTexture() {
  return canvasTexture(128, 128, (context, width) => {
    const random = rng(1717);
    context.clearRect(0, 0, width, width);
    const drawFlower = (x, y, radius, tint) => {
      context.save();
      context.translate(x, y);
      context.rotate(random() * Math.PI);
      for (let petal = 0; petal < 5; petal += 1) {
        context.rotate((Math.PI * 2) / 5);
        const gradient = context.createRadialGradient(0, -radius * 0.2, 0, 0, -radius * 0.55, radius * 0.7);
        gradient.addColorStop(0, "#fff7fa");
        gradient.addColorStop(0.6, tint);
        gradient.addColorStop(1, "#e889ad");
        context.fillStyle = gradient;
        context.beginPath();
        context.moveTo(0, 0);
        context.bezierCurveTo(radius * 0.55, -radius * 0.3, radius * 0.4, -radius * 1.05, radius * 0.08, -radius);
        context.lineTo(0, -radius * 0.86);
        context.lineTo(-radius * 0.08, -radius);
        context.bezierCurveTo(-radius * 0.4, -radius * 1.05, -radius * 0.55, -radius * 0.3, 0, 0);
        context.fill();
      }
      context.fillStyle = "#c2336a";
      context.beginPath();
      context.arc(0, 0, radius * 0.17, 0, Math.PI * 2);
      context.fill();
      context.restore();
    };
    for (let flower = 0; flower < 11; flower += 1) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * width * 0.3;
      drawFlower(width / 2 + Math.cos(angle) * distance, width / 2 + Math.sin(angle) * distance, 11 + random() * 9, random() > 0.5 ? "#ffd3e2" : "#f9b8cf");
    }
  }, { anisotropy: 2 });
}

function stainedGlassTexture() {
  return canvasTexture(128, 256, (context, width, height) => {
    const random = rng(333);
    const palette = ["#1f4fb8", "#c8232c", "#e2a817", "#2c8a4a", "#7a2fa0", "#f0e2b0"];
    context.fillStyle = "#1a1410";
    context.fillRect(0, 0, width, height);
    const cells = 7;
    for (let row = 0; row < 14; row += 1) {
      for (let col = 0; col < cells; col += 1) {
        context.fillStyle = palette[Math.floor(random() * palette.length)];
        context.fillRect(col * (width / cells) + 2, row * (height / 14) + 2, width / cells - 4, height / 14 - 4);
      }
    }
    // A central golden cross motif.
    context.fillStyle = "#ffe6a0";
    context.fillRect(width / 2 - 8, height * 0.22, 16, height * 0.46);
    context.fillRect(width / 2 - 34, height * 0.34, 68, 16);
    context.strokeStyle = "#140f0c";
    context.lineWidth = 4;
    context.strokeRect(2, 2, width - 4, height - 4);
  }, { anisotropy: 2 });
}

function shojiTexture() {
  return canvasTexture(128, 128, (context, width) => {
    const gradient = context.createRadialGradient(width / 2, width / 2, 10, width / 2, width / 2, width * 0.7);
    gradient.addColorStop(0, "#fff4d8");
    gradient.addColorStop(1, "#f2b56b");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, width);
    context.fillStyle = "#3a1810";
    for (let line = 0; line <= 4; line += 1) {
      context.fillRect(line * (width / 4) - 2, 0, 4, width);
      context.fillRect(0, line * (width / 4) - 2, width, 4);
    }
    context.fillRect(0, width / 8 - 1, width, 2);
    context.fillRect(0, (width * 5) / 8 - 1, width, 2);
  }, { anisotropy: 2 });
}

function clockTexture() {
  return canvasTexture(128, 128, (context, width) => {
    const c = width / 2;
    context.fillStyle = "#1d2a3c";
    context.beginPath();
    context.arc(c, c, c - 2, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#e7c46a";
    context.lineWidth = 5;
    context.stroke();
    context.fillStyle = "#e7c46a";
    for (let hour = 0; hour < 12; hour += 1) {
      const angle = (hour / 12) * Math.PI * 2;
      context.save();
      context.translate(c + Math.sin(angle) * (c - 16), c - Math.cos(angle) * (c - 16));
      context.rotate(angle);
      context.fillRect(-2, -7, 4, 14);
      context.restore();
    }
    context.strokeStyle = "#e7c46a";
    context.lineCap = "round";
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(c, c);
    context.lineTo(c + 22, c - 16);
    context.stroke();
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(c, c);
    context.lineTo(c - 8, c - 40);
    context.stroke();
  }, { anisotropy: 2 });
}

function doorTexture() {
  return canvasTexture(128, 256, (context, width, height) => {
    context.fillStyle = "#4a2a17";
    context.fillRect(0, 0, width, height);
    const random = rng(21);
    for (let plank = 0; plank < 6; plank += 1) {
      const x = (plank * width) / 6;
      context.fillStyle = `rgba(${90 + random() * 30},${52 + random() * 16},${28 + random() * 10},1)`;
      context.fillRect(x + 1, 0, width / 6 - 2, height);
      context.fillStyle = "rgba(20,10,4,0.6)";
      context.fillRect(x, 0, 2, height);
    }
    context.fillStyle = "#1b1714";
    for (const y of [height * 0.2, height * 0.72]) {
      context.fillRect(8, y, width - 16, 10);
      for (let nail = 0; nail < 6; nail += 1) {
        context.beginPath();
        context.arc(16 + nail * ((width - 32) / 5), y + 5, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.fillStyle = "#c9a45a";
    context.beginPath();
    context.arc(width * 0.78, height * 0.52, 6, 0, Math.PI * 2);
    context.fill();
  }, { anisotropy: 4 });
}

/** Japanese hon-gawara roof tiles: rounded vertical ridges. */
function japaneseRoofTexture() {
  return canvasTexture(128, 128, (context, width) => {
    const gradient = context.createLinearGradient(0, 0, width / 8, 0);
    gradient.addColorStop(0, "#15181d");
    gradient.addColorStop(0.35, "#56606b");
    gradient.addColorStop(0.55, "#3a424b");
    gradient.addColorStop(1, "#101317");
    context.fillStyle = gradient;
    for (let ridge = 0; ridge < 8; ridge += 1) {
      context.save();
      context.translate((ridge * width) / 8, 0);
      context.fillRect(0, 0, width / 8, width);
      context.restore();
    }
    context.fillStyle = "rgba(0,0,0,0.35)";
    for (let row = 0; row < 4; row += 1) context.fillRect(0, (row * width) / 4, width, 3);
  }, { repeat: 1, anisotropy: 4 });
}

/** Four vertical neon signs in one atlas. */
function kanjiSignTexture() {
  const signs = [
    { text: "電脳", bg: "#1b0a14", fg: "#ff4f8b" },
    { text: "記憶", bg: "#06161b", fg: "#3fe6ff" },
    { text: "夢", bg: "#1a1206", fg: "#ffc34d" },
    { text: "思考", bg: "#12081c", fg: "#c78bff" },
  ];
  return canvasTexture(512, 512, (context, width, height) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    signs.forEach((sign, index) => {
      const x = index * 128;
      context.fillStyle = sign.bg;
      context.fillRect(x + 6, 6, 116, height - 12);
      context.strokeStyle = sign.fg;
      context.lineWidth = 5;
      context.shadowColor = sign.fg;
      context.shadowBlur = 14;
      context.strokeRect(x + 14, 14, 100, height - 28);
      context.fillStyle = "#fff6fb";
      context.font = `700 ${sign.text.length > 1 ? 104 : 150}px ${JP_SANS}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const chars = [...sign.text];
      chars.forEach((char, charIndex) => {
        const y = height / 2 + (charIndex - (chars.length - 1) / 2) * 150;
        context.shadowBlur = 22;
        context.fillText(char, x + 64, y);
      });
      context.shadowBlur = 0;
    });
  }, { anisotropy: 4 });
}

function billboardTexture() {
  return canvasTexture(512, 256, (context, width, height) => {
    context.fillStyle = "#050308";
    context.fillRect(0, 0, width, height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `800 150px ${JP_SANS}`;
    context.fillStyle = "#ffffff";
    context.fillText("電脳", width / 2, height / 2 - 12);
    context.font = "600 26px 'Share Tech Mono', monospace";
    context.fillText("GEHIRN // 思考の未来", width / 2, height - 30);
  }, { anisotropy: 4, srgb: false });
}

function vendingTexture() {
  return canvasTexture(128, 256, (context, width, height) => {
    const random = rng(8);
    context.fillStyle = "#f4f6f8";
    context.fillRect(0, 0, width, height);
    const colors = ["#e3342f", "#2e7de1", "#f6c343", "#3fb46b", "#f28c28", "#9b59b6", "#ffffff"];
    for (let row = 0; row < 4; row += 1) {
      const y = 18 + row * 36;
      context.fillStyle = "#cfd6de";
      context.fillRect(8, y + 26, width - 16, 3);
      for (let col = 0; col < 6; col += 1) {
        context.fillStyle = colors[Math.floor(random() * colors.length)];
        context.fillRect(12 + col * 18, y + 2, 11, 24);
        context.fillStyle = "rgba(255,255,255,0.55)";
        context.fillRect(13 + col * 18, y + 4, 3, 18);
      }
    }
    context.fillStyle = "#1f2733";
    context.fillRect(8, 168, width - 16, 30);
    context.fillStyle = "#39e0ff";
    context.font = `600 16px ${JP_SANS}`;
    context.fillText("つめた〜い", 16, 188);
    context.fillStyle = "#11151b";
    context.fillRect(18, 210, width - 36, 34);
  }, { anisotropy: 2 });
}

function lanternTexture() {
  return canvasTexture(128, 128, (context, width) => {
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#9e1010");
    gradient.addColorStop(0.5, "#ff5a36");
    gradient.addColorStop(1, "#9e1010");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, width);
    context.strokeStyle = "rgba(60,0,0,0.5)";
    for (let rib = 0; rib < 12; rib += 1) {
      context.beginPath();
      context.moveTo(0, (rib * width) / 12);
      context.lineTo(width, (rib * width) / 12);
      context.stroke();
    }
    context.fillStyle = "#1a0505";
    context.font = `700 54px ${JP_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("祭", width / 2, width / 2);
  }, { anisotropy: 2 });
}

function glowSpriteTexture() {
  return canvasTexture(64, 64, (context, width) => {
    const gradient = context.createRadialGradient(width / 2, width / 2, 0, width / 2, width / 2, width / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.25, "rgba(255,255,255,0.6)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, width);
  }, { srgb: false, anisotropy: 1 });
}

/** Soft pool of light for the ground: smooth, almost Gaussian falloff. */
function lightPoolTexture() {
  return canvasTexture(128, 128, (context, width) => {
    const image = context.createImageData(width, width);
    for (let y = 0; y < width; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = (x + 0.5) / width * 2 - 1;
        const dy = (y + 0.5) / width * 2 - 1;
        const r = Math.min(1, Math.hypot(dx, dy));
        const alpha = Math.exp(-r * r * 4.2) * (1 - r * r);
        const index = (y * width + x) * 4;
        image.data[index] = image.data[index + 1] = image.data[index + 2] = 255;
        image.data[index + 3] = Math.round(alpha * 255);
      }
    }
    context.putImageData(image, 0, 0);
  }, { srgb: false, anisotropy: 1 });
}

export function createProceduralTextures(textures) {
  textures.lightPool = lightPoolTexture();
  textures.woodGrain = woodGrainTexture();
  textures.concrete = concreteTexture();
  textures.cloud = cloudTexture();
  textures.blossom = blossomTexture();
  textures.stainedGlass = stainedGlassTexture();
  textures.shoji = shojiTexture();
  textures.clock = clockTexture();
  textures.door = doorTexture();
  textures.japaneseRoof = japaneseRoofTexture();
  textures.kanji = kanjiSignTexture();
  textures.billboard = billboardTexture();
  textures.vending = vendingTexture();
  textures.lantern = lanternTexture();
  textures.glow = glowSpriteTexture();
  for (const texture of [textures.woodGrain, textures.concrete, textures.japaneseRoof]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  }
}

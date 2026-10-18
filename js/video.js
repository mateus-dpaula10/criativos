// Leitura de vídeo no próprio navegador (nada é enviado): duração, tamanho, miniatura e quadros para a IA.
import { FORMATOS } from './domain.js';

function esperar(el, evento, ms = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { limpar(); reject(new Error('O navegador demorou demais para ler o vídeo.')); }, ms);
    const ok = () => { limpar(); resolve(); };
    const erro = () => { limpar(); reject(new Error('Este navegador não consegue ler esse vídeo (tente exportar em MP4 H.264).')); };
    const limpar = () => { clearTimeout(t); el.removeEventListener(evento, ok); el.removeEventListener('error', erro); };
    el.addEventListener(evento, ok, { once: true });
    el.addEventListener('error', erro, { once: true });
  });
}

/** Abre o arquivo num <video> invisível e chama fn(video). Libera o arquivo no fim. */
async function comVideo(file, fn) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await esperar(v, 'loadedmetadata');
    return await fn(v);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function quadro(v, segundo, largura) {
  v.currentTime = segundo;
  await esperar(v, 'seeked');
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = Math.round((largura * v.videoHeight) / v.videoWidth);
  canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Duração, tamanho e miniatura (JPEG 360 px de largura). */
export function lerVideo(file) {
  return comVideo(file, async (v) => {
    const { duration: dur, videoWidth: w, videoHeight: h } = v;
    let blob = null;
    if (w && h) {
      const c = await quadro(v, Math.min(1.5, (dur || 3) / 3), 360);
      blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    }
    return { dur, w, h, blob };
  });
}

/** N quadros espalhados pelo vídeo (o primeiro bem no começo, para avaliar o gancho), como data URL JPEG. */
export function extrairQuadros(file, { n = 8, largura = 540 } = {}) {
  return comVideo(file, async (v) => {
    const { duration: dur, videoWidth: w, videoHeight: h } = v;
    if (!w || !h || !dur) throw new Error('Não deu para ler as imagens desse vídeo.');
    const tempos = [Math.min(0.5, dur / 10), ...Array.from({ length: n - 1 }, (_, i) => (dur * (i + 1)) / n)];
    const quadros = [];
    for (const t of tempos) {
      const c = await quadro(v, Math.min(t, Math.max(0, dur - 0.05)), largura);
      quadros.push({ segundo: Math.round(t * 10) / 10, imagem: c.toDataURL('image/jpeg', 0.72) });
    }
    return { quadros, dur, w, h };
  });
}

/** Formato mais próximo da proporção do vídeo (null se nenhum chega perto). */
export function formatoDe(w, h) {
  const r = w / h;
  let melhor = null;
  for (const [k, f] of Object.entries(FORMATOS)) {
    const d = Math.abs(f.w / f.h - r);
    if (d < 0.04 && (!melhor || d < melhor.d)) melhor = { k, d };
  }
  return melhor?.k || null;
}

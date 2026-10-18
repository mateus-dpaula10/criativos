// Regras do negócio, sem tocar em tela nem banco (testadas em tests/domain.test.js):
// etapas, nome padrão do anúncio, métricas de tráfego, legenda .srt, leitura do CSV do Gerenciador
// de Anúncios e o script de render (ffmpeg) das variações.
import { normalize, parseDecimal, todayISO } from './utils.js';

// ---------- Cadastros fixos ----------

export const ETAPAS = [
  { id: 'ideia', label: 'Ideia' },
  { id: 'roteiro', label: 'Roteiro' },
  { id: 'gravacao', label: 'Gravação' },
  { id: 'edicao', label: 'Edição' },
  { id: 'revisao', label: 'Revisão' },
  { id: 'aprovado', label: 'Aprovado' },
  { id: 'no_ar', label: 'No ar' },
  { id: 'pausado', label: 'Pausado' },
];
export const ETAPA = Object.fromEntries(ETAPAS.map((e, i) => [e.id, { ...e, ordem: i }]));
/** Etapas em que o criativo ainda está sendo produzido (contam para prazo atrasado). */
export const EM_PRODUCAO = ['ideia', 'roteiro', 'gravacao', 'edicao', 'revisao'];

export const VEREDITOS = { teste: 'Em teste', vencedor: 'Vencedor', perdedor: 'Perdedor' };

export const FORMATOS = {
  '9x16': { w: 1080, h: 1920, label: '9:16', uso: 'Reels e Stories' },
  '4x5': { w: 1080, h: 1350, label: '4:5', uso: 'Feed' },
  '1x1': { w: 1080, h: 1080, label: '1:1', uso: 'Feed' },
  '16x9': { w: 1920, h: 1080, label: '16:9', uso: 'In-stream / YouTube' },
};

export const FERRAMENTAS = { capcut: 'CapCut', premiere: 'Premiere', outra: 'Outra' };

export const TIPOS_BLOCO = { gancho: 'Gancho', corpo: 'Corpo', cta: 'CTA', outro: 'Outro' };

export const CHECKLIST = [
  { id: 'gancho', label: 'Gancho prende nos 3 primeiros segundos' },
  { id: 'legenda', label: 'Legenda legível e sem erro de português' },
  { id: 'zona', label: 'Textos fora da área coberta pela interface (topo e rodapé no 9:16)' },
  { id: 'audio', label: 'Áudio limpo e no volume certo (funciona também sem som)' },
  { id: 'cta', label: 'Chamada para ação clara no final' },
  { id: 'formato', label: 'Exportado em 1080p nos formatos marcados' },
  { id: 'marca', label: 'Marca/organização identificada' },
];

// ---------- Nome padrão ----------

export const MODELO_PADRAO = '{campanha}_{codigo}_{angulo}_{data}';
export const VARIAVEIS_MODELO = {
  campanha: 'sigla da campanha',
  codigo: 'código único (C0042)',
  angulo: 'ângulo/tema',
  data: 'data de criação (AAAAMMDD)',
  editor: 'iniciais do responsável',
  formato: 'formato principal (9x16)',
  titulo: 'título',
};

export const codigo = (numero) => (numero == null ? 'C????' : `C${String(numero).padStart(4, '0')}`);

/** Acha o código C0042 dentro de um nome de anúncio. Devolve o número (42) ou null. */
export function extrairNumero(nome) {
  const m = String(nome ?? '').match(/(?:^|[^A-Za-z0-9])C(\d{3,7})(?![0-9])/i);
  return m ? Number(m[1]) : null;
}

/** Trecho seguro para nome de arquivo/anúncio: sem acento, maiúsculo, só letras, números e hífen. */
export function trecho(valor, max = 24) {
  return String(valor ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

function iniciaisDe(nomeOuEmail) {
  const base = String(nomeOuEmail || '').split('@')[0];
  const partes = base.split(/[\s._-]+/).filter(Boolean);
  if (!partes.length) return '';
  return partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2);
}

/**
 * Nome do anúncio pelo modelo. O código mantém o formato C0042 (é por ele que o CSV do Meta casa
 * com o criativo); o resto vira trecho seguro. Separadores repetidos de campos vazios são recolhidos.
 */
export function nomeAnuncio(criativo, { campanha, modelo = MODELO_PADRAO, responsavelNome } = {}) {
  const criado = String(criativo.criado_em || todayISO()).slice(0, 10).replace(/-/g, '');
  const vars = {
    campanha: trecho(campanha?.sigla, 12),
    codigo: codigo(criativo.numero),
    angulo: trecho(criativo.angulo, 24),
    data: criado,
    editor: trecho(iniciaisDe(responsavelNome || criativo.responsavel), 3),
    formato: (criativo.formatos && criativo.formatos[0]) || '',
    titulo: trecho(criativo.titulo, 28),
  };
  return String(modelo || MODELO_PADRAO)
    .replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/([_-])[_-]+/g, '$1')
    .replace(/^[_-]+|[_-]+$/g, '');
}

/** Nome do arquivo de vídeo de um formato: nome do anúncio + formato (sem repetir se o modelo já tiver). */
export function nomeArquivo(nome, formato) {
  return nome.includes(formato) ? nome : `${nome}_${formato}`;
}

// ---------- Métricas ----------

const CAMPOS_SOMA = ['gasto_cents', 'impressoes', 'cliques', 'views_3s', 'thruplays', 'resultados', 'receita_cents'];

/** Soma linhas de métricas. Campos ausentes em TODAS as linhas ficam null (não viram zero falso). */
export function somarMetricas(linhas) {
  const tot = Object.fromEntries(CAMPOS_SOMA.map((k) => [k, null]));
  for (const l of linhas) {
    for (const k of CAMPOS_SOMA) {
      const v = l[k];
      if (v == null || v === '') continue;
      tot[k] = (tot[k] ?? 0) + Number(v);
    }
  }
  return tot;
}

const div = (a, b) => (a == null || b == null || !Number(b) ? null : Number(a) / Number(b));

/**
 * Indicadores derivados. Taxa de gancho = views de 3 s ÷ impressões; retenção = ThruPlays ÷ views de 3 s.
 * CPA/CPC/CPM em centavos.
 */
export function indicadores(m) {
  return {
    ctr: div(m.cliques, m.impressoes),
    cpc: div(m.gasto_cents, m.cliques),
    cpm: m.impressoes ? div(m.gasto_cents, m.impressoes) * 1000 : null,
    gancho: div(m.views_3s, m.impressoes),
    retencao: div(m.thruplays, m.views_3s),
    cpa: div(m.gasto_cents, m.resultados),
    roas: div(m.receita_cents, m.gasto_cents),
  };
}

/** Linhas cujo período cabe inteiro dentro de [de, ate] (datas ISO; vazios = sem limite). */
export function noPeriodo(linhas, de, ate) {
  return linhas.filter((l) => (!de || l.inicio >= de) && (!ate || l.fim <= ate));
}

// ---------- Roteiro → legenda ----------

/** Palavras por segundo de uma locução em português num ritmo de anúncio. */
export const PALAVRAS_POR_SEGUNDO = 2.6;

export function estimarSegundos(texto) {
  const palavras = String(texto ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (!palavras) return 0;
  return Math.max(1.2, Math.round((palavras / PALAVRAS_POR_SEGUNDO) * 10) / 10);
}

/** Acrescenta início/fim a cada bloco (usa os segundos informados; sem eles, estima pela fala). */
export function cronometrar(blocos) {
  let t = 0;
  return (blocos || []).map((b) => {
    const informado = Number(b.segundos);
    const dur = informado > 0 ? informado : estimarSegundos(b.texto);
    const out = { ...b, inicio: t, fim: t + dur, duracao: dur, estimado: !(informado > 0) };
    t += dur;
    return out;
  });
}

/** Quebra um texto em legendas de até `linhas` linhas com até `max` caracteres cada. */
export function quebrarLegenda(texto, { max = 32, linhas = 2 } = {}) {
  const palavras = String(texto ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const linhasOut = [];
  let atual = '';
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (tentativa.length > max && atual) { linhasOut.push(atual); atual = p; } else atual = tentativa;
  }
  if (atual) linhasOut.push(atual);
  const cues = [];
  for (let i = 0; i < linhasOut.length; i += linhas) cues.push(linhasOut.slice(i, i + linhas).join('\n'));
  return cues;
}

export function tempoSRT(seg) {
  const ms = Math.max(0, Math.round(seg * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** Gera o .srt do roteiro (CapCut e Premiere importam). O tempo de cada bloco é dividido pelo tamanho das falas. */
export function gerarSRT(blocos, opcoes) {
  const out = [];
  let n = 1;
  for (const b of cronometrar(blocos)) {
    const cues = quebrarLegenda(b.texto, opcoes);
    if (!cues.length) continue;
    const totalChars = cues.reduce((a, c) => a + c.length, 0);
    let t = b.inicio;
    cues.forEach((c, i) => {
      const fim = i === cues.length - 1 ? b.fim : t + (b.duracao * c.length) / totalChars;
      out.push(`${n++}\n${tempoSRT(t)} --> ${tempoSRT(fim)}\n${c}\n`);
      t = fim;
    });
  }
  return out.join('\n');
}

/** Texto corrido para locução/teleprompter, com a marcação de cada bloco. */
export function gerarTextoLocucao(blocos, titulo = '') {
  const linhas = titulo ? [titulo, ''] : [];
  for (const b of cronometrar(blocos)) {
    if (!String(b.texto || '').trim()) continue;
    linhas.push(`[${(TIPOS_BLOCO[b.tipo] || 'Bloco').toUpperCase()} · ~${Math.round(b.duracao)}s]`, b.texto.trim(), '');
  }
  return linhas.join('\n');
}

// ---------- CSV do Gerenciador de Anúncios ----------

/** Lê CSV (vírgula, ponto e vírgula ou tab; aspas no padrão RFC 4180). Devolve { cabecalho, linhas }. */
export function lerCSV(texto) {
  const src = String(texto ?? '').replace(/^﻿/, '');
  const primeira = src.split(/\r?\n/, 1)[0] || '';
  const conta = (ch) => primeira.split(ch).length - 1;
  const sep = [',', ';', '\t'].sort((a, b) => conta(b) - conta(a))[0];
  const rows = [];
  let row = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (aspas) {
      if (c === '"') {
        if (src[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { row.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(campo); campo = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else campo += c;
  }
  row.push(campo);
  if (row.some((v) => v !== '')) rows.push(row);
  const [cabecalho = [], ...linhas] = rows;
  return { cabecalho: cabecalho.map((h) => h.trim()), linhas };
}

/** Campos que o painel entende e os nomes de coluna do Meta (pt-BR e inglês) que correspondem a cada um. */
export const CAMPOS_CSV = {
  nome: { label: 'Nome do anúncio', obrigatorio: true, nomes: ['nome do anuncio', 'ad name'] },
  dia: { label: 'Dia', nomes: ['dia', 'day', 'data'] },
  inicio: { label: 'Início do período', nomes: ['inicio dos relatorios', 'reporting starts', 'inicio'] },
  fim: { label: 'Fim do período', nomes: ['termino dos relatorios', 'reporting ends', 'termino', 'fim'] },
  gasto: { label: 'Valor usado', obrigatorio: true, nomes: ['valor usado (brl)', 'valor usado', 'amount spent (brl)', 'amount spent', 'gasto'] },
  impressoes: { label: 'Impressões', nomes: ['impressoes', 'impressions'] },
  cliques: { label: 'Cliques no link', nomes: ['cliques no link', 'link clicks', 'cliques (todos)', 'clicks (all)'] },
  views_3s: { label: 'Reproduções de 3 s', nomes: ['reproducoes de video de 3 segundos', 'reproducoes do video por 3 segundos', '3-second video plays', '3 segundos', '3-second'] },
  thruplays: { label: 'ThruPlays', nomes: ['thruplays', 'thruplay'] },
  resultados: { label: 'Resultados / conversões', nomes: ['resultados', 'results', 'compras', 'purchases', 'conversoes'] },
  receita: { label: 'Valor de conversão', nomes: ['valor de conversao de compras', 'purchases conversion value', 'purchase conversion value', 'valor de conversao'] },
};

/**
 * Sugere qual coluna do CSV vai para cada campo. Primeiro todos os nomes exatos, depois "contém"
 * (senão "Purchases conversion value" seria tomada por "purchases"). Cada coluna é usada uma vez.
 */
export function mapearColunas(cabecalho) {
  const norm = cabecalho.map(normalize);
  const usado = new Set();
  const mapa = {};
  const passada = (casa) => {
    for (const [campo, def] of Object.entries(CAMPOS_CSV)) {
      if (campo in mapa) continue;
      for (const nome of def.nomes) {
        const idx = norm.findIndex((h, i) => !usado.has(i) && casa(h, nome));
        if (idx > -1) { mapa[campo] = idx; usado.add(idx); break; }
      }
    }
  };
  passada((h, nome) => h === nome);
  passada((h, nome) => nome.length >= 4 && h.includes(nome)); // "dia"/"fim" soltos dariam falso positivo
  return mapa;
}

/** "2026-10-18", "18/10/2026" ou "10/18/2026" (só se o dia > 12) → ISO. Null se não reconhecer. */
export function lerData(valor) {
  const s = String(valor ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    let [d, mes] = [Number(m[1]), Number(m[2])];
    if (mes > 12 && d <= 12) [d, mes] = [mes, d];
    return `${m[3]}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

const numCSV = (v) => {
  const s = String(v ?? '').replace(/[R$%\s]/g, '');
  if (!s || s === '-' || s === '--') return null;
  const n = parseDecimal(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * Agrupa as linhas do CSV por criativo e período (vários anúncios com o mesmo código são somados).
 * numeroParaId: Map(numero → id do criativo). Devolve as linhas prontas para gravar e o que não casou.
 */
export function agregarCSV(linhas, mapa, numeroParaId, { hoje = todayISO() } = {}) {
  const grupos = new Map();
  const naoReconhecidos = new Map();
  let semData = false;
  let min = null;
  let max = null;
  const col = (row, campo) => (mapa[campo] == null ? undefined : row[mapa[campo]]);
  for (const row of linhas) {
    const nome = String(col(row, 'nome') ?? '').trim();
    if (!nome || /^total/i.test(nome)) continue;
    const numero = extrairNumero(nome);
    const id = numero != null ? numeroParaId.get(numero) : undefined;
    if (!id) { naoReconhecidos.set(nome, (naoReconhecidos.get(nome) || 0) + 1); continue; }
    let inicio = lerData(col(row, 'dia'));
    let fim = inicio;
    if (!inicio) { inicio = lerData(col(row, 'inicio')); fim = lerData(col(row, 'fim')) || inicio; }
    if (!inicio) { inicio = hoje; fim = hoje; semData = true; }
    if (fim < inicio) [inicio, fim] = [fim, inicio];
    min = !min || inicio < min ? inicio : min;
    max = !max || fim > max ? fim : max;
    const chave = `${id}|${inicio}|${fim}`;
    const g = grupos.get(chave) || { criativo_id: id, inicio, fim, gasto_cents: 0, impressoes: null, cliques: null, views_3s: null, thruplays: null, resultados: null, receita_cents: null, fonte: 'csv' };
    const gasto = numCSV(col(row, 'gasto'));
    g.gasto_cents += gasto == null ? 0 : Math.round(gasto * 100);
    for (const k of ['impressoes', 'cliques', 'views_3s', 'thruplays', 'resultados']) {
      const v = numCSV(col(row, k));
      if (v != null) g[k] = (g[k] ?? 0) + v;
    }
    const rec = numCSV(col(row, 'receita'));
    if (rec != null) g.receita_cents = (g.receita_cents ?? 0) + Math.round(rec * 100);
    grupos.set(chave, g);
  }
  return { linhas: [...grupos.values()], naoReconhecidos, semData, periodo: { de: min, ate: max } };
}

/** Uma linha nova sobrepõe uma existente do mesmo criativo se os períodos se cruzam (a importação substitui). */
export const sobrepoe = (a, b) => a.criativo_id === b.criativo_id && a.inicio <= b.fim && b.inicio <= a.fim;

// ---------- IA: custo estimado ----------

/** Preço por milhão de tokens [entrada, saída] em dólar (tabela da Anthropic, out/2026). */
export const PRECOS_IA = {
  'claude-haiku-5-5': [0.10, 0.50],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};

/** Custo aproximado em dólar; null se o modelo não estiver na tabela. */
export function custoIA(modelo, entrada, saida) {
  const chave = Object.keys(PRECOS_IA).find((k) => String(modelo || '').startsWith(k));
  if (!chave) return null;
  const [pe, ps] = PRECOS_IA[chave];
  return ((Number(entrada) || 0) * pe + (Number(saida) || 0) * ps) / 1e6;
}

// ---------- Variações e render com ffmpeg ----------

/** Lista de arquivos digitada (um por linha), sem vazios nem repetidos. */
export function listaArquivos(texto) {
  return [...new Set(String(texto ?? '').split(/\r?\n/).map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean))];
}

/** Rótulo curto de um arquivo para o título ("gancho_02_dor.mp4" → "gancho_02_dor"). */
export const rotuloArquivo = (f) => String(f).split(/[\\/]/).pop().replace(/\.[^.]+$/, '');

/** Todas as combinações gancho × corpo × CTA (CTA opcional). */
export function combinar(ganchos, corpos, ctas = []) {
  const out = [];
  const listaCtas = ctas.length ? ctas : [null];
  for (const g of ganchos) for (const c of corpos) for (const a of listaCtas) out.push({ gancho: g, corpo: c, cta: a });
  return out;
}

const caminhoAbsoluto = (p) => /^[A-Za-z]:[\\/]|^\\\\/.test(p);
/** Junta pasta + arquivo no estilo Windows. */
export function juntarCaminho(pasta, arquivo) {
  if (caminhoAbsoluto(arquivo) || !pasta) return arquivo.replace(/\//g, '\\');
  return `${pasta.replace(/[\\/]+$/, '')}\\${arquivo}`.replace(/\//g, '\\');
}

/** Escapa texto para dentro de aspas num .bat (o % precisa ser dobrado; aspas não são aceitas). */
export function escBat(s) {
  if (String(s).includes('"')) throw new Error(`Caminho com aspas não é aceito: ${s}`);
  return String(s).replace(/%/g, '%%');
}

/** Filtro do ffmpeg que padroniza cada clipe no formato e junta tudo em sequência. */
export function filtroConcat(qtd, formato, { ajuste = 'cortar', audio = true, fps = 30 } = {}) {
  const { w, h } = FORMATOS[formato];
  const enquadra = ajuste === 'barras'
    ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`
    : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  const partes = [];
  let entradas = '';
  for (let i = 0; i < qtd; i++) {
    partes.push(`[${i}:v]${enquadra},setsar=1,fps=${fps},format=yuv420p[v${i}]`);
    if (audio) partes.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
    entradas += audio ? `[v${i}][a${i}]` : `[v${i}]`;
  }
  partes.push(`${entradas}concat=n=${qtd}:v=1:a=${audio ? 1 : 0}${audio ? '[v][a]' : '[v]'}`);
  return partes.join(';');
}

/**
 * Script .bat (Windows) que renderiza as variações com o ffmpeg.
 * itens: [{ nome, formato, clipes: [arquivo, ...] }]. Os arquivos relativos são lidos de `pasta`.
 */
export function gerarBat(itens, { pasta, saida, ajuste = 'cortar', audio = true, fps = 30, crf = 20, geradoEm = new Date().toISOString() } = {}) {
  const pastaSaida = saida || juntarCaminho(pasta, 'render');
  const L = [
    '@echo off',
    'chcp 65001 >nul',
    `rem Gerado pelo painel Criativos em ${geradoEm}`,
    `rem ${itens.length} video(s). Pode rodar de novo: os arquivos de saida sao sobrescritos.`,
    'where ffmpeg >nul 2>nul',
    'if errorlevel 1 goto semffmpeg',
    `set "SAIDA=${escBat(pastaSaida)}"`,
    'if not exist "%SAIDA%" mkdir "%SAIDA%"',
    'set FALHAS=0',
    '',
  ];
  itens.forEach((it, i) => {
    const entradas = it.clipes.map((c) => `-i "${escBat(juntarCaminho(pasta, c))}"`).join(' ');
    const mapas = audio ? '-map "[v]" -map "[a]"' : '-map "[v]"';
    const codecAudio = audio ? '-c:a aac -b:a 160k' : '-an';
    L.push(`echo [${i + 1}/${itens.length}] ${escBat(it.nome)}`);
    L.push(`ffmpeg -hide_banner -loglevel error -stats -y ${entradas} -filter_complex "${filtroConcat(it.clipes.length, it.formato, { ajuste, audio, fps })}" ${mapas} -c:v libx264 -preset medium -crf ${crf} -profile:v high ${codecAudio} -movflags +faststart "%SAIDA%\\${escBat(it.nome)}.mp4"`);
    L.push('if errorlevel 1 set /a FALHAS+=1');
    L.push('');
  });
  L.push(
    'echo.',
    'if not "%FALHAS%"=="0" goto falhou',
    `echo Pronto: ${itens.length} video(s) em "%SAIDA%"`,
    'pause',
    'exit /b 0',
    ':falhou',
    'echo Terminou com %FALHAS% falha(s). Veja as mensagens acima (arquivo nao encontrado, clipe sem audio...).',
    'pause',
    'exit /b 1',
    ':semffmpeg',
    'echo O ffmpeg nao foi encontrado. Instale (winget install Gyan.FFmpeg) e abra este arquivo de novo.',
    'pause',
    'exit /b 1',
    '',
  );
  return L.join('\r\n');
}

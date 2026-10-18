// Acesso a dados e conta. Duas implementações com a mesma interface:
//  - Supabase (equipe, tempo real, login), quando js/config.js tem URL e chave;
//  - local (localStorage deste navegador, com dados de exemplo), para conhecer o painel antes de configurar.
//
// Decisões (as mesmas da Caderneta):
//  - supabase-js empacotado em js/vendor/ e carregado só quando precisa;
//  - flowType 'implicit' + detectSessionInUrl desligado: o link do e-mail volta com os tokens no hash e o app
//    lê e limpa esse hash ANTES do roteador (capturarRetornoEmail).
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_LIB, AUTH_STORAGE_KEY, MODO_LOCAL } from './config.js';
import { uid, todayISO, addDays } from './utils.js';
import { sobrepoe } from './domain.js';

export { MODO_LOCAL };

// ---------- Mensagens de erro em português ----------

export function mensagemErro(error) {
  const msg = String(error?.message || error || '');
  const code = String(error?.code || '');
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/already registered|already been registered/i.test(msg)) return 'Esse e-mail já tem conta. Use “Entrar” ou “Esqueci a senha”.';
  if (/password should be at least|weak password/i.test(msg)) return 'A senha precisa ter pelo menos 8 caracteres, misturando letras e números.';
  if (/rate limit|too many|over_email_send_rate_limit/i.test(msg + code)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (/failed to fetch|network|load failed/i.test(msg)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (/row-level security|permission denied|sem permissão/i.test(msg) || code === '42501') return 'Sem permissão. Seu e-mail precisa estar na equipe (peça a um admin).';
  if (code === '23505' || /duplicate key/i.test(msg)) return 'Já existe um registro igual.';
  if (code === '23514' || /check constraint/i.test(msg)) return 'Algum campo está fora do permitido (tamanho ou formato).';
  if (/payload too large|exceeded the maximum/i.test(msg)) return 'Arquivo grande demais.';
  return msg || 'Algo deu errado. Tente de novo.';
}

const falhar = (error) => { const e = new Error(mensagemErro(error)); e.original = error; throw e; };

// ---------- Supabase ----------

let clientPromise = null;

function carregarLib() {
  if (globalThis.supabase?.createClient) return Promise.resolve(globalThis.supabase);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL(SUPABASE_LIB, import.meta.url).href;
    s.async = true;
    s.onload = () => (globalThis.supabase?.createClient ? resolve(globalThis.supabase) : reject(new Error('supabase-js não carregou')));
    s.onerror = () => { s.remove(); reject(new Error('Não foi possível carregar o módulo de conexão.')); };
    document.head.appendChild(s);
  });
}

function cliente() {
  if (!clientPromise) {
    clientPromise = carregarLib().then((lib) => lib.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'implicit' },
    })).catch((err) => { clientPromise = null; throw err; });
  }
  return clientPromise;
}

const appUrl = () => `${location.origin}${location.pathname}`;

const supa = {
  async listar(tabela, { ordem, onde } = {}) {
    const c = await cliente();
    let q = c.from(tabela).select('*');
    if (onde) for (const [k, v] of Object.entries(onde)) q = q.eq(k, v);
    if (ordem) q = q.order(ordem, { ascending: true });
    const { data, error } = await q;
    if (error) falhar(error);
    return data;
  },
  async inserir(tabela, linhas) {
    const c = await cliente();
    const { data, error } = await c.from(tabela).insert(linhas).select();
    if (error) falhar(error);
    return data;
  },
  async atualizar(tabela, chave, valor, patch) {
    const c = await cliente();
    const { data, error } = await c.from(tabela).update(patch).eq(chave, valor).select().single();
    if (error) falhar(error);
    return data;
  },
  async apagar(tabela, chave, valor) {
    const c = await cliente();
    const { error } = await c.from(tabela).delete().eq(chave, valor);
    if (error) falhar(error);
  },
  async importarMetricas(linhas, de, ate) {
    const c = await cliente();
    const { data, error } = await c.rpc('importar_metricas', { p_linhas: linhas, p_de: de, p_ate: ate });
    if (error) falhar(error);
    return data;
  },
  async enviarThumb(caminho, blob) {
    const c = await cliente();
    const { error } = await c.storage.from('thumbs').upload(caminho, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error) falhar(error);
  },
  async apagarThumb(caminho) {
    const c = await cliente();
    await c.storage.from('thumbs').remove([caminho]);
  },
  /** URLs assinadas (1 h) das miniaturas, num pedido só. */
  async urlsThumbs(caminhos) {
    if (!caminhos.length) return new Map();
    const c = await cliente();
    const { data, error } = await c.storage.from('thumbs').createSignedUrls(caminhos, 3600);
    if (error) falhar(error);
    return new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  },
  /** Chama a Edge Function "ia". Devolve { resultado, modelo, uso }. */
  async ia(acao, dados) {
    const c = await cliente();
    const { data, error } = await c.functions.invoke('ia', { body: { acao, dados } });
    if (error) {
      let msg = '';
      try { msg = (await error.context?.json?.())?.erro || ''; } catch { /* resposta sem JSON */ }
      if (!msg) msg = /fetch|send a request|relay/i.test(error.message || '')
        ? 'A IA não respondeu. A função "ia" já foi publicada no Supabase?'
        : (error.message || 'A IA falhou.');
      throw new Error(msg);
    }
    return data;
  },
  /** Uso da IA desde uma data (ISO). */
  async usoIA(desde) {
    const c = await cliente();
    const { data, error } = await c.from('ia_uso').select('acao, modelo, tokens_entrada, tokens_saida, criado_em').gte('criado_em', desde);
    if (error) falhar(error);
    return data;
  },
  /** Avisa quando outra pessoa mexe em criativos/comentários. Devolve função para parar. */
  async ouvir(aoMudar) {
    const c = await cliente();
    const canal = c.channel('painel-criativos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'criativos' }, (p) => aoMudar('criativos', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comentarios' }, (p) => aoMudar('comentarios', p))
      .subscribe();
    return () => c.removeChannel(canal);
  },

  // Conta
  async usuario() {
    const c = await cliente();
    const { data } = await c.auth.getSession();
    return data.session?.user || null;
  },
  async entrar(email, senha) {
    const c = await cliente();
    const { data, error } = await c.auth.signInWithPassword({ email, password: senha });
    if (error) falhar(error);
    return data.user;
  },
  async cadastrar(email, senha) {
    const c = await cliente();
    const { data, error } = await c.auth.signUp({ email, password: senha, options: { emailRedirectTo: appUrl() } });
    if (error) falhar(error);
    // Com confirmação de e-mail ligada, não vem sessão: a pessoa precisa clicar no link.
    return { user: data.user, precisaConfirmar: !data.session };
  },
  async recuperar(email) {
    const c = await cliente();
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    if (error) falhar(error);
  },
  async novaSenha(senha) {
    const c = await cliente();
    const { error } = await c.auth.updateUser({ password: senha });
    if (error) falhar(error);
  },
  async sair() {
    const c = await cliente();
    await c.auth.signOut({ scope: 'local' });
  },
  async aoMudarSessao(cb) {
    const c = await cliente();
    c.auth.onAuthStateChange((evento, sessao) => cb(evento, sessao?.user || null));
  },
  async aplicarRetorno(cb) {
    const c = await cliente();
    const { error } = await c.auth.setSession({ access_token: cb.access_token, refresh_token: cb.refresh_token });
    if (error) falhar(error);
  },
};

// ---------- Local (localStorage) ----------

const CHAVE_LOCAL = 'criativos:local';
const CHAVE_THUMB = 'criativos:thumb:';
const EU_LOCAL = 'voce@modo-local';

function exemplo() {
  const hoje = todayISO();
  const ts = (dias) => `${addDays(hoje, dias)}T12:00:00.000Z`;
  const sah = uid();
  const shh = uid();
  const cr = (numero, campanha_id, titulo, etapa, extra = {}) => ({
    id: uid(), numero, campanha_id, parent_id: null, titulo, etapa, veredito: null, angulo: '', formatos: ['9x16'],
    ferramenta: 'capcut', responsavel: EU_LOCAL, prazo: null, duracao_s: null, link_arquivo: '', link_projeto: '',
    thumb_path: null, roteiro: [], checklist: {}, montagem: null, notas: '', tags: [], criado_por: EU_LOCAL,
    criado_em: ts(-12 + numero), atualizado_em: ts(-12 + numero), ...extra,
  });
  const criativos = [
    cr(1, sah, 'Resgate da Mel: antes e depois', 'no_ar', { angulo: 'Transformação', veredito: 'vencedor', formatos: ['9x16', '4x5'], duracao_s: 34,
      roteiro: [
        { tipo: 'gancho', texto: 'Ela foi encontrada assim, sozinha, debaixo da chuva.', segundos: 3 },
        { tipo: 'corpo', texto: 'A Mel passou três semanas em tratamento. Hoje ela corre, brinca e espera uma família. Mas outros cães ainda estão nas ruas esperando por ajuda.' },
        { tipo: 'cta', texto: 'Doe agora e ajude o próximo resgate. Qualquer valor faz diferença.', segundos: 4 },
      ] }),
    cr(2, sah, 'Depoimento da voluntária', 'no_ar', { angulo: 'Prova social', veredito: 'teste', ferramenta: 'premiere', duracao_s: 41 }),
    cr(3, sah, 'Dor do abandono — versão curta', 'pausado', { angulo: 'Dor', veredito: 'perdedor', duracao_s: 18 }),
    cr(4, shh, 'Cesta básica: 1 minuto na rotina', 'revisao', { angulo: 'Bastidores', prazo: addDays(hoje, 1), ferramenta: 'premiere' }),
    cr(5, sah, 'Gatinhos no inverno', 'edicao', { angulo: 'Urgência', prazo: addDays(hoje, -1) }),
    cr(6, shh, 'Família atendida conta a história', 'gravacao', { angulo: 'Depoimento', prazo: addDays(hoje, 4) }),
    cr(7, sah, 'Quanto custa um resgate?', 'roteiro', { angulo: 'Transparência', prazo: addDays(hoje, 6) }),
    cr(8, shh, 'Ideia: trend de antes e depois da doação', 'ideia', { angulo: 'Trend' }),
  ];
  const metricas = [];
  const dia = (n) => addDays(hoje, -n);
  const linhaDia = (c, n, g, imp, cl, v3, tp, res, rec) => ({ id: uid(), criativo_id: c.id, inicio: dia(n), fim: dia(n), gasto_cents: g, impressoes: imp, cliques: cl, views_3s: v3, thruplays: tp, resultados: res, receita_cents: rec, fonte: 'csv', registrado_por: EU_LOCAL, registrado_em: ts(-n) });
  for (let n = 1; n <= 10; n++) {
    metricas.push(linhaDia(criativos[0], n, 18000 + n * 700, 21000 + n * 900, 310 + n * 9, 8100 + n * 200, 2100 + n * 40, 9 + (n % 4), 52000 + n * 2500));
    metricas.push(linhaDia(criativos[1], n, 12000 + n * 400, 16000 + n * 500, 160 + n * 5, 4300 + n * 90, 900 + n * 20, 4 + (n % 3), 21000 + n * 900));
    if (n > 5) metricas.push(linhaDia(criativos[2], n, 9000, 15000, 70, 2400, 300, 1, 4000));
  }
  return {
    membros: [{ email: EU_LOCAL, nome: 'Você', papel: 'admin', criado_em: ts(-30) }],
    campanhas: [
      { id: sah, nome: 'SOS Animal Help', sigla: 'SAH', cor: '#b42318', ativa: true, criado_em: ts(-30) },
      { id: shh, nome: 'SOS Human Help', sigla: 'SHH', cor: '#1d4ed8', ativa: true, criado_em: ts(-30) },
    ],
    criativos,
    metricas,
    comentarios: [{ id: uid(), criativo_id: criativos[3].id, autor: EU_LOCAL, texto: 'Legenda do segundo 12 cobre o rosto. Subir um pouco.', criado_em: ts(-1) }],
    ajustes: [{ id: 1, modelo_nome: '{campanha}_{codigo}_{angulo}_{data}', pasta_clipes: 'D:\\Criativos\\brutos', atualizado_em: ts(-30) }],
  };
}

function lerLocal() {
  try {
    const raw = localStorage.getItem(CHAVE_LOCAL);
    if (raw) return JSON.parse(raw);
  } catch { /* sem armazenamento ou corrompido: recomeça com o exemplo */ }
  const db = exemplo();
  gravarLocal(db);
  return db;
}
function gravarLocal(db) {
  try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(db)); } catch { /* só não persiste */ }
}

const local = {
  async listar(tabela, { ordem, onde } = {}) {
    let linhas = structuredClone(lerLocal()[tabela] || []);
    if (onde) linhas = linhas.filter((l) => Object.entries(onde).every(([k, v]) => l[k] === v));
    if (ordem) linhas.sort((a, b) => (a[ordem] > b[ordem] ? 1 : a[ordem] < b[ordem] ? -1 : 0));
    return linhas;
  },
  async inserir(tabela, linhas) {
    const db = lerLocal();
    const agora = new Date().toISOString();
    const lista = db[tabela] || (db[tabela] = []);
    let numero = Math.max(0, ...lista.map((c) => c.numero || 0));
    const novos = (Array.isArray(linhas) ? linhas : [linhas]).map((l) => {
      const n = { id: uid(), criado_em: agora, ...l };
      if (tabela === 'criativos') {
        n.numero = ++numero;
        n.atualizado_em = agora;
        n.criado_por = n.criado_por || EU_LOCAL;
      }
      if (tabela === 'comentarios') n.autor = EU_LOCAL;
      if (tabela === 'metricas') { n.registrado_em = agora; n.registrado_por = EU_LOCAL; }
      if (tabela === 'metricas' && lista.some((m) => m.criativo_id === n.criativo_id && m.inicio === n.inicio && m.fim === n.fim)) {
        falhar({ code: '23505', message: 'duplicate key' });
      }
      return n;
    });
    lista.push(...novos);
    gravarLocal(db);
    return structuredClone(novos);
  },
  async atualizar(tabela, chave, valor, patch) {
    const db = lerLocal();
    const l = (db[tabela] || []).find((x) => x[chave] === valor);
    if (!l) falhar('Registro não encontrado.');
    Object.assign(l, patch);
    if (tabela === 'criativos') l.atualizado_em = new Date().toISOString();
    gravarLocal(db);
    return structuredClone(l);
  },
  async apagar(tabela, chave, valor) {
    const db = lerLocal();
    db[tabela] = (db[tabela] || []).filter((x) => x[chave] !== valor);
    if (tabela === 'criativos') {
      db.metricas = db.metricas.filter((m) => m.criativo_id !== valor);
      db.comentarios = db.comentarios.filter((m) => m.criativo_id !== valor);
      db.criativos.forEach((c) => { if (c.parent_id === valor) c.parent_id = null; });
    }
    if (tabela === 'campanhas') db.criativos.forEach((c) => { if (c.campanha_id === valor) c.campanha_id = null; });
    gravarLocal(db);
  },
  async importarMetricas(linhas, de, ate) {
    const db = lerLocal();
    const ids = new Set(linhas.map((l) => l.criativo_id));
    const periodo = { inicio: de, fim: ate };
    db.metricas = db.metricas.filter((m) => !(ids.has(m.criativo_id) && sobrepoe({ ...periodo, criativo_id: m.criativo_id }, m)));
    const agora = new Date().toISOString();
    db.metricas.push(...linhas.map((l) => ({ id: uid(), ...l, fonte: 'csv', registrado_em: agora, registrado_por: EU_LOCAL })));
    gravarLocal(db);
    return linhas.length;
  },
  async enviarThumb(caminho, blob) {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    try { localStorage.setItem(CHAVE_THUMB + caminho, dataUrl); } catch { falhar('Sem espaço no navegador para a miniatura.'); }
  },
  async apagarThumb(caminho) {
    try { localStorage.removeItem(CHAVE_THUMB + caminho); } catch { /* nada */ }
  },
  async urlsThumbs(caminhos) {
    const m = new Map();
    for (const c of caminhos) {
      try { const u = localStorage.getItem(CHAVE_THUMB + c); if (u) m.set(c, u); } catch { /* nada */ }
    }
    return m;
  },
  async ia() { falhar('A IA só funciona com o painel conectado ao Supabase.'); },
  async usoIA() { return []; },
  async ouvir(aoMudar) {
    const fn = (e) => { if (e.key === CHAVE_LOCAL) aoMudar('tudo'); };
    window.addEventListener('storage', fn);
    return () => window.removeEventListener('storage', fn);
  },
  async usuario() { return { id: 'local', email: EU_LOCAL }; },
  async entrar() { return { id: 'local', email: EU_LOCAL }; },
  async cadastrar() { return { precisaConfirmar: false }; },
  async recuperar() {},
  async novaSenha() {},
  async sair() {},
  async aoMudarSessao() {},
  async aplicarRetorno() {},
  /** Volta os dados de exemplo (só no modo local). */
  restaurarExemplo() {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(CHAVE_THUMB)).forEach((k) => localStorage.removeItem(k));
    } catch { /* nada */ }
    gravarLocal(exemplo());
  },
};

export const api = MODO_LOCAL ? local : supa;

// ---------- Retorno de link de e-mail ----------

let retornoCapturado = null;

/**
 * Lê o retorno de um link de e-mail (confirmação, convite, recuperação de senha) e LIMPA a URL na hora,
 * para os tokens não ficarem no histórico nem confundirem o roteador por hash. Chamar no início do boot.
 */
export function capturarRetornoEmail() {
  const hash = location.hash.replace(/^#/, '');
  const query = new URLSearchParams(location.search);
  const hp = new URLSearchParams(hash.startsWith('/') ? '' : hash);
  const tem = (k) => hp.has(k) || query.has(k);
  if (!tem('access_token') && !tem('error_description') && !tem('error_code')) return null;
  const val = (k) => hp.get(k) ?? query.get(k);
  retornoCapturado = tem('access_token')
    ? { tipo: 'sessao', evento: val('type') || 'signup', access_token: val('access_token'), refresh_token: val('refresh_token') }
    : { tipo: 'erro', codigo: val('error_code') || val('error') || '', descricao: val('error_description') || '' };
  for (const k of ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type', 'error', 'error_code', 'error_description', 'provider_token', 'sb']) query.delete(k);
  const qs = query.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}#/painel`);
  return retornoCapturado;
}

export const pegarRetornoEmail = () => { const r = retornoCapturado; retornoCapturado = null; return r; };

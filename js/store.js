// Estado do painel em memória + ações que gravam no banco (api.js) e avisam as telas.
// Fonte da verdade é o banco: cada ação grava primeiro e só então atualiza o estado local.
import { api } from './api.js';
import { MODELO_PADRAO, nomeAnuncio } from './domain.js';
import { debounce } from './utils.js';

export const state = {
  usuario: null, // { id, email }
  membro: null, // linha de membros do usuário (null = ainda não liberado)
  membros: [],
  campanhas: [],
  criativos: [],
  metricas: [],
  ajustes: { modelo_nome: MODELO_PADRAO, pasta_clipes: '' },
  thumbs: new Map(), // thumb_path → URL exibível
  carregado: false,
};

const ouvintes = new Set();
/** motivo: 'carga' | 'local' | 'remoto' | 'comentarios:<id>' */
export const onChange = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = (motivo) => ouvintes.forEach((fn) => fn(motivo));

const porNumero = (a, b) => (b.numero || 0) - (a.numero || 0);

async function buscarThumbs(caminhos) {
  const faltando = caminhos.filter((p) => p && !state.thumbs.has(p));
  if (!faltando.length) return;
  try {
    const urls = await api.urlsThumbs(faltando);
    urls.forEach((u, p) => state.thumbs.set(p, u));
  } catch (err) {
    console.warn('[criativos] miniaturas:', err.message);
  }
}

export async function carregarTudo() {
  const [membros, campanhas, criativos, metricas, ajustes] = await Promise.all([
    api.listar('membros', { ordem: 'nome' }),
    api.listar('campanhas', { ordem: 'nome' }),
    api.listar('criativos'),
    api.listar('metricas'),
    api.listar('ajustes'),
  ]);
  const email = String(state.usuario?.email || '').toLowerCase();
  state.membros = membros;
  state.membro = membros.find((m) => m.email === email) || null;
  state.campanhas = campanhas;
  state.criativos = criativos.sort(porNumero);
  state.metricas = metricas;
  if (ajustes[0]) state.ajustes = ajustes[0];
  state.thumbs = new Map();
  await buscarThumbs(criativos.map((c) => c.thumb_path));
  state.carregado = true;
  avisar('carga');
}

// Mudanças feitas por outras pessoas (tempo real): recarrega a tabela afetada, com um respiro
// para juntar várias mudanças seguidas (ex.: criar 12 variações de uma vez).
const recarregarCriativos = debounce(async () => {
  try {
    state.criativos = (await api.listar('criativos')).sort(porNumero);
    await buscarThumbs(state.criativos.map((c) => c.thumb_path));
    avisar('remoto');
  } catch (err) { console.warn('[criativos] tempo real:', err.message); }
}, 500);

let pararDeOuvir = null;
export async function ouvirMudancas() {
  pararDeOuvir?.();
  pararDeOuvir = await api.ouvir((tabela, payload) => {
    if (tabela === 'tudo') { carregarTudo().catch(() => {}); return; }
    if (tabela === 'criativos') recarregarCriativos();
    if (tabela === 'comentarios') {
      const id = payload?.new?.criativo_id || payload?.old?.criativo_id;
      avisar(`comentarios:${id || ''}`);
    }
  });
}
export function pararTempoReal() { pararDeOuvir?.(); pararDeOuvir = null; }

// ---------- Consultas ----------

export const criativo = (id) => state.criativos.find((c) => c.id === id) || null;
export const campanha = (id) => state.campanhas.find((c) => c.id === id) || null;
export const membroPorEmail = (email) => state.membros.find((m) => m.email === email) || null;
export const nomeMembro = (email) => membroPorEmail(email)?.nome || String(email || '').split('@')[0] || '—';
export const metricasDe = (id) => state.metricas.filter((m) => m.criativo_id === id);
export const ehAdmin = () => state.membro?.papel === 'admin';
export const thumbUrl = (c) => (c?.thumb_path ? state.thumbs.get(c.thumb_path) || null : null);

/** Nome padrão do anúncio de um criativo (pelo modelo da equipe). */
export function nomeDe(c) {
  return nomeAnuncio(c, { campanha: campanha(c.campanha_id), modelo: state.ajustes.modelo_nome, responsavelNome: nomeMembro(c.responsavel) });
}

// ---------- Criativos ----------

export async function criarCriativos(lista) {
  const novos = await api.inserir('criativos', lista);
  state.criativos = [...novos, ...state.criativos].sort(porNumero);
  avisar('local');
  return novos;
}

export async function atualizarCriativo(id, patch) {
  const linha = await api.atualizar('criativos', 'id', id, patch);
  state.criativos = state.criativos.map((c) => (c.id === id ? linha : c));
  avisar('local');
  return linha;
}

export async function excluirCriativo(id) {
  const c = criativo(id);
  await api.apagar('criativos', 'id', id);
  if (c?.thumb_path) api.apagarThumb(c.thumb_path).catch(() => {});
  state.criativos = state.criativos.filter((x) => x.id !== id).map((x) => (x.parent_id === id ? { ...x, parent_id: null } : x));
  state.metricas = state.metricas.filter((m) => m.criativo_id !== id);
  avisar('local');
}

/** Troca a miniatura: envia a nova, grava o caminho e apaga a antiga. */
export async function definirThumb(id, blob) {
  const anterior = criativo(id)?.thumb_path;
  const caminho = `${id}/${Date.now()}.jpg`;
  await api.enviarThumb(caminho, blob);
  const urls = await api.urlsThumbs([caminho]);
  urls.forEach((u, p) => state.thumbs.set(p, u));
  const linha = await atualizarCriativo(id, { thumb_path: caminho });
  if (anterior) api.apagarThumb(anterior).catch(() => {});
  return linha;
}

// ---------- Campanhas, equipe e ajustes ----------

export async function salvarCampanha(dados) {
  if (dados.id) {
    const { id, ...patch } = dados;
    const linha = await api.atualizar('campanhas', 'id', id, patch);
    state.campanhas = state.campanhas.map((c) => (c.id === id ? linha : c));
  } else {
    const [linha] = await api.inserir('campanhas', dados);
    state.campanhas = [...state.campanhas, linha].sort((a, b) => a.nome.localeCompare(b.nome));
  }
  avisar('local');
}

export async function excluirCampanha(id) {
  await api.apagar('campanhas', 'id', id);
  state.campanhas = state.campanhas.filter((c) => c.id !== id);
  state.criativos = state.criativos.map((c) => (c.campanha_id === id ? { ...c, campanha_id: null } : c));
  avisar('local');
}

export async function salvarMembro(dados, { novo = false } = {}) {
  const email = dados.email.trim().toLowerCase();
  if (novo) {
    const [linha] = await api.inserir('membros', { ...dados, email });
    state.membros = [...state.membros, linha];
  } else {
    const linha = await api.atualizar('membros', 'email', email, { nome: dados.nome, papel: dados.papel });
    state.membros = state.membros.map((m) => (m.email === email ? linha : m));
    if (state.membro?.email === email) state.membro = linha;
  }
  state.membros.sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email));
  avisar('local');
}

/** Cria o login (senha inicial, já confirmado) e coloca a pessoa na equipe. { loginExistia } se ela já tinha login. */
export async function adicionarNaEquipe({ email, nome, papel, senha }) {
  const r = await api.equipe('adicionar', { email: email.trim().toLowerCase(), nome, papel, senha });
  state.membros = await api.listar('membros', { ordem: 'nome' });
  avisar('local');
  return r;
}

/** Admin define uma senha nova para alguém da equipe. */
export const definirSenha = (email, senha) => api.equipe('senha', { email, senha });

/** Tira da equipe (perde o acesso na hora) e, se pedido, apaga o login também. */
export async function removerDaEquipe(email, apagarLogin = false) {
  const r = await api.equipe('remover', { email, apagarLogin });
  state.membros = state.membros.filter((m) => m.email !== email);
  avisar('local');
  return r;
}

export async function salvarAjustes(patch) {
  state.ajustes = await api.atualizar('ajustes', 'id', 1, patch);
  avisar('local');
}

// ---------- Resultados ----------

export async function adicionarMetrica(linha) {
  const [nova] = await api.inserir('metricas', { ...linha, fonte: 'manual' });
  state.metricas = [...state.metricas, nova];
  avisar('local');
}

export async function excluirMetrica(id) {
  await api.apagar('metricas', 'id', id);
  state.metricas = state.metricas.filter((m) => m.id !== id);
  avisar('local');
}

export async function importarMetricas(linhas, de, ate) {
  const n = await api.importarMetricas(linhas, de, ate);
  state.metricas = await api.listar('metricas');
  avisar('local');
  return n;
}

// ---------- Comentários (carregados sob demanda, por criativo) ----------

export const listarComentarios = (criativoId) => api.listar('comentarios', { onde: { criativo_id: criativoId }, ordem: 'criado_em' });
export const comentar = (criativoId, texto) => api.inserir('comentarios', { criativo_id: criativoId, texto });
export const apagarComentario = (id) => api.apagar('comentarios', 'id', id);

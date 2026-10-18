// Ponto de entrada: conta, carga dos dados, rotas por hash e atualização em tempo real.
import { state, carregarTudo, ouvirMudancas, pararTempoReal, onChange } from './store.js';
import { api, MODO_LOCAL, capturarRetornoEmail, pegarRetornoEmail } from './api.js';
import { aplicarTema, lerTema } from './tema.js';
import { toast, rascunho } from './ui.js';
import { esc } from './utils.js';
import { icon } from './icons.js';
import * as painel from './views/painel.js';
import * as quadro from './views/quadro.js';
import * as detalhe from './views/criativo.js';
import * as variacoes from './views/variacoes.js';
import * as resultados from './views/resultados.js';
import * as ajustes from './views/ajustes.js';
import { telaEntrar, telaPendente, pedirNovaSenha } from './views/entrar.js';
import { abrirNovoCriativo } from './views/novo.js';
import { iniciarTour, tourVisto } from './tour.js';
import { registrarSW, vigiarConexao } from './pwa.js';

// Retorno de link de e-mail (confirmação/convite/recuperação): lê os tokens e limpa a URL ANTES do roteador.
capturarRetornoEmail();

const ROTAS = {
  painel: { view: painel, label: 'Início', icon: 'home', fab: true },
  quadro: { view: quadro, label: 'Quadro', icon: 'board', fab: true, largo: true },
  variacoes: { view: variacoes, label: 'Variações', icon: 'layers' },
  resultados: { view: resultados, label: 'Resultados', icon: 'chart', largo: true },
  ajustes: { view: ajustes, label: 'Ajustes', icon: 'settings' },
  criativo: { view: detalhe, label: 'Criativo', oculto: true },
};

const main = document.getElementById('main');
const shell = document.getElementById('shell');
const fab = document.getElementById('fab');
const authRoot = document.getElementById('auth-root');
let ultimaRota = '';
let avisoPendente = null;
let pedirSenhaPendente = false; // voltou de um link de convite/recuperação: a senha vem antes do tour

function lerHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [nome, sub = ''] = path.split('/');
  const rota = ROTAS[nome] ? nome : 'painel';
  return { rota, sub: decodeURIComponent(sub), params: new URLSearchParams(query) };
}

function montarNav() {
  document.getElementById('nav-list').innerHTML = Object.entries(ROTAS).filter(([, r]) => !r.oculto).map(([key, r]) => `
    <li><a href="#/${key}" data-route="${key}">${icon(r.icon)}<span>${r.label}</span></a></li>`).join('');
}

function render({ manterRolagem = false } = {}) {
  if (!state.carregado || !state.membro) return;
  const { rota, sub, params } = lerHash();
  const def = ROTAS[rota];
  const chave = `${rota}/${sub}`;
  const novaRota = chave !== ultimaRota;
  const y = window.scrollY;
  const focoId = main.contains(document.activeElement) ? document.activeElement.id : '';
  if (novaRota) rascunho.clear();
  const ctx = { params, sub, rerender: () => render({ manterRolagem: true }) };
  main.classList.toggle('largo', Boolean(def.largo));
  // Contêiner novo a cada desenho: os ouvintes que a tela registra nele morrem junto (não acumulam).
  const vista = document.createElement('div');
  vista.className = 'vista';
  vista.innerHTML = def.view.render(ctx);
  main.replaceChildren(vista);
  def.view.mount?.(vista, ctx);
  // Devolve o que estava digitado e não salvo, e o foco do teclado.
  rascunho.forEach((valor, id) => {
    const el = main.querySelector(`#${CSS.escape(id)}`);
    if (!el) return;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = valor; else el.value = valor;
  });
  if (focoId && !novaRota) main.querySelector(`#${CSS.escape(focoId)}`)?.focus({ preventScroll: true });
  avisoPendente?.remove();
  avisoPendente = null;
  const atual = rota === 'criativo' ? 'quadro' : rota;
  document.querySelectorAll('[data-route]').forEach((a) => {
    if (a.dataset.route === atual) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  fab.hidden = !def.fab;
  document.title = `${def.label} | Criativos`;
  if (novaRota) {
    ultimaRota = chave;
    window.scrollTo(0, 0);
    if (document.activeElement && document.activeElement !== document.body && !document.querySelector('dialog[open]')) {
      main.focus({ preventScroll: true });
    }
  } else if (manterRolagem) {
    window.scrollTo(0, y);
  }
}

function eventos() {
  window.addEventListener('hashchange', () => render());
  const guardar = (e) => {
    const el = e.target;
    if (!el.id || el.type === 'file' || el.closest('[data-nao-suja]')) return;
    rascunho.set(el.id, el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value);
  };
  main.addEventListener('input', guardar);
  main.addEventListener('change', guardar);
  fab.innerHTML = icon('plus', { size: 26 });
  fab.addEventListener('click', () => abrirNovoCriativo());
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-novo-criativo]')) abrirNovoCriativo();
  });

  onChange((motivo) => {
    if (motivo.startsWith('comentarios:')) {
      const { rota, sub } = lerHash();
      if (rota === 'criativo' && motivo === `comentarios:${sub}`) detalhe.recarregarComentarios?.(main);
      return;
    }
    const digitando = main.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (motivo === 'remoto' && (digitando || document.querySelector('dialog[open]'))) {
      // Não tira o cursor de quem está digitando: avisa e deixa a pessoa escolher a hora.
      if (!avisoPendente) {
        avisoPendente = toast('A equipe atualizou criativos.', { timeout: 0, action: { label: 'Atualizar', run: () => render({ manterRolagem: true }) } });
      }
      return;
    }
    render({ manterRolagem: true });
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => aplicarTema(lerTema()));
}

function mostrarEntrar(opcoes) {
  pararTempoReal();
  shell.hidden = true;
  fab.hidden = true;
  Object.assign(state, { usuario: null, membro: null, carregado: false });
  telaEntrar(authRoot, opcoes);
}

async function sair() {
  await api.sair();
  mostrarEntrar();
}

async function entrarNoApp(usuario) {
  state.usuario = usuario;
  authRoot.innerHTML = '<p class="carregando" role="status">Carregando os criativos…</p>';
  try {
    await carregarTudo();
  } catch (err) {
    console.error('[criativos] carga', err);
    authRoot.innerHTML = `<main class="auth"><div class="auth-card"><h1 class="auth-title">Não foi possível carregar</h1>
      <p>${esc(err.message)}</p><div class="actions left"><button class="btn primary" type="button" data-tentar>Tentar de novo</button>
      <button class="btn ghost" type="button" data-sair>Sair</button></div></div></main>`;
    authRoot.querySelector('[data-tentar]').addEventListener('click', () => entrarNoApp(usuario));
    authRoot.querySelector('[data-sair]').addEventListener('click', sair);
    return;
  }
  if (!state.membro) {
    shell.hidden = true;
    telaPendente(authRoot, { email: usuario.email, onSair: sair, onTentar: () => entrarNoApp(usuario) });
    return;
  }
  authRoot.innerHTML = '';
  shell.hidden = false;
  ultimaRota = '';
  render();
  ouvirMudancas().catch((err) => console.warn('[criativos] tempo real indisponível:', err.message));
  // Atalho do app instalado ("Novo criativo", segurando o ícone): ?acao=novo abre o formulário direto.
  const params = new URLSearchParams(location.search);
  if (params.get('acao') === 'novo') {
    history.replaceState(null, '', `${location.pathname}${location.hash || '#/quadro'}`);
    abrirNovoCriativo();
    return;
  }
  if (!tourVisto() && !pedirSenhaPendente) setTimeout(iniciarTour, 400);
}

async function boot() {
  aplicarTema(lerTema());
  montarNav();
  eventos();
  if (MODO_LOCAL) document.getElementById('faixa-local').hidden = false;
  vigiarConexao(toast);
  registrarSW((aplicar) => toast('Nova versão do painel disponível.', { timeout: 0, action: { label: 'Atualizar', run: aplicar } }));

  const retorno = pegarRetornoEmail();
  if (retorno?.tipo === 'erro') {
    toast(/expired|invalid/i.test(retorno.descricao) ? 'O link do e-mail expirou ou já foi usado. Peça outro.' : esc(retorno.descricao || 'Link inválido.'), { tone: 'alert', timeout: 9000 });
  } else if (retorno?.tipo === 'sessao') {
    try {
      await api.aplicarRetorno(retorno);
      pedirSenhaPendente = retorno.evento === 'recovery' || retorno.evento === 'invite';
      if (retorno.evento === 'signup') toast('E-mail confirmado.');
    } catch (err) {
      toast(esc(err.message), { tone: 'alert', timeout: 9000 });
    }
  }

  let usuario = null;
  try { usuario = await api.usuario(); } catch (err) { toast(esc(err.message), { tone: 'alert', timeout: 0 }); }
  state.usuario = usuario; // antes de ouvir a sessão: o evento inicial não pode abrir o painel em dobro

  await api.aoMudarSessao((evento, user) => {
    if (evento === 'SIGNED_OUT') { if (state.usuario) mostrarEntrar(); return; }
    if (evento === 'PASSWORD_RECOVERY') { pedirNovaSenha(); return; }
    if (evento === 'SIGNED_IN' && user && user.email !== state.usuario?.email) entrarNoApp(user);
  });

  if (!usuario) { mostrarEntrar(); return; }
  await entrarNoApp(usuario);
  if (pedirSenhaPendente) { pedirSenhaPendente = false; pedirNovaSenha({ titulo: 'Defina sua senha' }); }
}

boot();

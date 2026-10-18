// Tour guiado: destaca cada parte do painel com uma explicação curta. Abre sozinho no primeiro acesso
// de cada pessoa neste aparelho e pode ser refeito em Ajustes. Navega entre as telas sozinho.
import { state } from './store.js';
import { esc } from './utils.js';

const VERSAO = 1; // suba para mostrar o tour de novo a todos depois de uma mudança grande
const chave = () => `criativos:tour:${state.membro?.email || 'anon'}`;

export function tourVisto() {
  try { return Number(localStorage.getItem(chave())) >= VERSAO; } catch { return true; }
}
function marcarVisto() {
  try { localStorage.setItem(chave(), String(VERSAO)); } catch { /* sem armazenamento: só não lembra */ }
}

/**
 * Passos. `rota` = tela onde o passo acontece (o tour navega até lá); `alvo` = seletores em ordem de
 * preferência (o primeiro visível vale); sem alvo = cartão no centro.
 */
function passos() {
  const primeiro = state.criativos[0];
  const lista = [
    { titulo: 'Bem-vindo ao painel de Criativos', texto: 'Aqui a equipe acompanha cada vídeo de anúncio da ideia até o resultado no Meta. Este tour mostra cada parte em 1 minuto.' },
    { rota: 'painel', alvo: ['[data-route="painel"]'], titulo: 'Início', texto: 'O resumo do dia: o que está em produção, o que atrasou, o que está no ar e quem está performando.' },
    { rota: 'painel', alvo: ['.kpis'], titulo: 'Indicadores', texto: 'Em produção, para revisar, no ar e atrasados. Clique em qualquer um para abrir o quadro já filtrado.' },
    { rota: 'painel', alvo: ['.esteira'], titulo: 'Esteira', texto: 'Quantos criativos há em cada uma das 8 etapas, da Ideia ao Pausado.' },
    { rota: 'painel', alvo: ['#h-meus'], titulo: 'Minhas entregas', texto: 'Os criativos em que você é responsável, do prazo mais próximo ao mais distante.' },
    { rota: 'painel', alvo: ['.head-actions [data-novo-criativo]', '#fab'], titulo: 'Novo criativo', texto: 'Comece por aqui: título, campanha, ângulo, responsável e prazo. Cada criativo ganha um código único (C0001).' },
    { rota: 'quadro', alvo: ['[data-route="quadro"]'], titulo: 'Quadro', texto: 'A esteira de produção: uma coluna por etapa, um cartão por criativo. Atualiza na hora para toda a equipe.' },
    { rota: 'quadro', alvo: ['#board .cartao', '#board'], titulo: 'Mover entre etapas', texto: 'Arraste o cartão para outra coluna, ou use as setas ‹ › no pé dele. Clique no cartão para abrir o criativo.' },
    { rota: 'quadro', alvo: ['.filtros'], titulo: 'Buscar e filtrar', texto: 'Busque por código, título ou ângulo, e filtre por campanha ou responsável.' },
  ];
  if (primeiro) {
    const r = `criativo/${primeiro.id}`;
    lista.push(
      { rota: r, alvo: ['#h-nome'], bloco: true, titulo: 'Nome do anúncio', texto: 'Copie e use este nome no anúncio do Meta. É pelo código nele que os resultados voltam para cá. Abaixo, o nome dos arquivos para exportar.' },
      { rota: r, alvo: ['.barra-etapa'], titulo: 'Etapa e veredito', texto: 'Mudam na hora. Ao entrar “No ar”, o veredito vira “Em teste”; depois marque Vencedor ou Perdedor.' },
      { rota: r, alvo: ['#h-video'], bloco: true, titulo: 'Vídeo', texto: '“Ler vídeo exportado” pega duração, formato e miniatura do .mp4 (o vídeo não é enviado). “Revisar com IA” avalia o checklist pelas imagens do vídeo.' },
      { rota: r, alvo: ['#h-rot'], bloco: true, titulo: 'Roteiro e legenda', texto: 'Gancho, corpo e CTA com o tempo de cada um. “Sugerir com IA” escreve opções; “Legenda .srt” vai direto para o CapCut ou Premiere.' },
      { rota: r, alvo: ['#h-check'], bloco: true, titulo: 'Checklist de revisão', texto: 'O que conferir antes de aprovar. Cada marcação grava na hora.' },
      { rota: r, alvo: ['#h-com'], bloco: true, titulo: 'Comentários', texto: 'Pedidos de ajuste e aprovações da equipe, em tempo real.' },
    );
  } else {
    lista.push({ titulo: 'Página do criativo', texto: 'Ao abrir um criativo você encontra o nome do anúncio, o vídeo, o roteiro com legenda .srt, o checklist de revisão, os resultados e os comentários. Crie o primeiro para ver.' });
  }
  lista.push(
    { rota: 'variacoes', alvo: ['[data-route="variacoes"]'], titulo: 'Variações', texto: 'Junte ganchos, corpos e CTAs exportados: o painel cria um criativo por combinação e um script (.bat) que renderiza todos no seu PC.' },
    { rota: 'variacoes', alvo: ['.passos'], titulo: 'Como usar', texto: 'Exporte as partes numa pasta, liste os arquivos, marque os formatos e dê duplo clique no .bat baixado.' },
    { rota: 'resultados', alvo: ['[data-route="resultados"]'], titulo: 'Resultados', texto: 'O ranking dos criativos: investido, custo por resultado, ROAS, CTR, taxa de gancho e retenção.' },
    { rota: 'resultados', alvo: ['.head-actions .file-btn'], titulo: 'Importar CSV do Meta', texto: 'Exporte a tabela do Gerenciador de Anúncios (por dia) e importe aqui. Reimportar o mesmo período não duplica.' },
    { rota: 'ajustes', alvo: ['[data-route="ajustes"]'], titulo: 'Ajustes', texto: 'Tema, nome padrão dos anúncios, campanhas, equipe e uso da IA. Aqui também dá para refazer este tour.' },
    { titulo: 'Pronto!', texto: 'Comece criando um criativo. Em dúvida, refaça o tour em Ajustes ou consulte o guia da equipe.' },
  );
  return lista;
}

let ativo = null;

const visivel = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

/** Elemento do passo: o primeiro alvo visível; em passos de bloco, a seção inteira em volta do título. */
function acharAlvo(p) {
  for (const sel of p.alvo || []) {
    let el = document.querySelector(sel);
    if (p.bloco) el = el?.closest('section') || el;
    if (visivel(el)) return el;
  }
  return null;
}

const esperarAlvo = (p) => new Promise((resolve) => {
  if (!p.alvo) { resolve(null); return; }
  const fim = Date.now() + 2000;
  const tentar = () => {
    const el = acharAlvo(p);
    if (el || Date.now() > fim) resolve(el); else setTimeout(tentar, 60);
  };
  tentar();
});

function irPara(rota) {
  if (!rota) return;
  const atual = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (atual !== rota) location.hash = `#/${rota}`;
}

function posicionar() {
  if (!ativo) return;
  const { foco, cartao, alvo } = ativo;
  const el = alvo && document.contains(alvo) ? alvo : (ativo.passo.alvo ? acharAlvo(ativo.passo) : null);
  ativo.alvo = el;
  const margem = 8;
  if (!el) {
    foco.style.cssText = 'left:50%;top:50%;width:0;height:0';
    cartao.classList.add('centro');
    cartao.style.left = ''; cartao.style.top = '';
    return;
  }
  cartao.classList.remove('centro');
  const r = el.getBoundingClientRect();
  const vh = innerHeight; const vw = innerWidth;
  const top = Math.max(4, r.top - margem); const left = Math.max(4, r.left - margem);
  const w = Math.min(vw - 8, r.width + margem * 2); const h = Math.min(vh - 8 - top, r.height + margem * 2);
  foco.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${Math.max(0, h)}px`;
  if (vw < 640) { // no celular o cartão fica preso embaixo, ou em cima quando o destaque está na metade de baixo
    cartao.style.left = ''; cartao.style.top = '';
    cartao.classList.toggle('topo', r.top + r.height / 2 > vh / 2);
    return;
  }
  const cw = cartao.offsetWidth; const ch = cartao.offsetHeight;
  const abaixo = top + h + 12; const acima = top - ch - 12;
  let y = abaixo + ch <= vh - 8 ? abaixo : acima >= 8 ? acima : Math.max(8, Math.min(vh - ch - 8, top));
  let x = Math.min(Math.max(8, left), vw - cw - 8);
  // Alvo alto (coluna do menu, quadro inteiro) sem espaço acima/abaixo: cartão ao lado.
  if (y === top && left + w + cw + 20 < vw) { x = left + w + 12; y = Math.max(8, Math.min(vh - ch - 8, top)); }
  cartao.style.left = `${x}px`; cartao.style.top = `${y}px`;
}

async function mostrar(i) {
  const lista = ativo.lista;
  ativo.i = i;
  const p = lista[i];
  ativo.passo = p;
  irPara(p.rota);
  ativo.cartao.setAttribute('aria-busy', 'true');
  const el = await esperarAlvo(p);
  if (!ativo || ativo.i !== i) return; // pulou/fechou enquanto esperava
  ativo.alvo = el;
  el?.scrollIntoView({ block: 'center', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const ultimo = i === lista.length - 1;
  ativo.cartao.innerHTML = `
    <p class="tour-passo">${i + 1} de ${lista.length}</p>
    <h2 id="tour-titulo" class="tour-titulo">${esc(p.titulo)}</h2>
    <p id="tour-texto" class="tour-texto">${esc(p.texto)}</p>
    <div class="tour-acoes">
      ${ultimo ? '' : '<button type="button" class="btn link small" data-tour-pular>Pular tour</button>'}
      <span class="tour-nav">
        ${i > 0 ? '<button type="button" class="btn ghost small" data-tour-voltar>Voltar</button>' : ''}
        <button type="button" class="btn primary small" data-tour-proximo>${ultimo ? 'Concluir' : i === 0 ? 'Começar' : 'Próximo'}</button>
      </span>
    </div>`;
  ativo.cartao.removeAttribute('aria-busy');
  posicionar();
  setTimeout(posicionar, 350); // depois da rolagem suave
  ativo.cartao.querySelector('[data-tour-proximo]').focus({ preventScroll: true });
}

export function encerrarTour() {
  if (!ativo) return;
  marcarVisto();
  cancelAnimationFrame(ativo.raf);
  removeEventListener('resize', posicionar);
  document.removeEventListener('keydown', ativo.teclas, true);
  ativo.raiz.remove();
  const voltarFoco = ativo.focoAnterior;
  ativo = null;
  voltarFoco?.focus?.({ preventScroll: true });
}

export function iniciarTour() {
  if (ativo) return;
  const raiz = document.createElement('div');
  raiz.className = 'tour';
  raiz.innerHTML = `<div class="tour-foco" aria-hidden="true"></div>
    <div class="tour-cartao" role="dialog" aria-modal="true" aria-labelledby="tour-titulo" aria-describedby="tour-texto"></div>`;
  document.body.appendChild(raiz);
  const teclas = (e) => {
    if (!ativo) return;
    if (e.key === 'Escape') { e.preventDefault(); encerrarTour(); return; }
    if (e.key === 'Tab') { // foco preso no cartão
      const bts = [...ativo.cartao.querySelectorAll('button')];
      if (!bts.length) return;
      const i = bts.indexOf(document.activeElement);
      e.preventDefault();
      bts.at(e.shiftKey ? (i <= 0 ? -1 : i - 1) : (i + 1) % bts.length).focus();
    }
  };
  ativo = {
    raiz, foco: raiz.querySelector('.tour-foco'), cartao: raiz.querySelector('.tour-cartao'),
    lista: passos(), i: 0, teclas, focoAnterior: document.activeElement,
  };
  ativo.cartao.addEventListener('click', (e) => {
    if (e.target.closest('[data-tour-pular]')) encerrarTour();
    else if (e.target.closest('[data-tour-voltar]')) mostrar(ativo.i - 1);
    else if (e.target.closest('[data-tour-proximo]')) {
      if (ativo.i === ativo.lista.length - 1) encerrarTour(); else mostrar(ativo.i + 1);
    }
  });
  // Clique fora do cartão não faz nada (evita sair do tour sem querer); a tela por baixo fica bloqueada.
  document.addEventListener('keydown', teclas, true);
  addEventListener('resize', posicionar);
  // Acompanha rolagem e redesenhos da tela (o alvo pode ser trocado por um igual).
  const seguir = () => { posicionar(); if (ativo) ativo.raf = requestAnimationFrame(seguir); };
  ativo.raf = requestAnimationFrame(seguir);
  mostrar(0);
}

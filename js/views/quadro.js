// Quadro: uma coluna por etapa. Arrastar e soltar no computador; setas ‹ › em cada cartão (toque e teclado).
import { state, campanha, nomeMembro, thumbUrl, atualizarCriativo, criativo } from '../store.js';
import { ETAPAS, ETAPA, EM_PRODUCAO, CHECKLIST, codigo, FORMATOS } from '../domain.js';
import { esc, todayISO, normalize, plural } from '../utils.js';
import { toast, enquanto, campanhaTag, prazoBadge, thumbBox, vereditoBadge, avatar } from '../ui.js';
import { icon } from '../icons.js';
import { opcoesCampanha, opcoesMembro } from './campos.js';
import { abrirNovoCriativo } from './novo.js';

const filtro = { campanha: '', responsavel: '', busca: '' };

function passa(c, { atrasados }) {
  if (filtro.campanha && c.campanha_id !== filtro.campanha) return false;
  if (filtro.responsavel && c.responsavel !== filtro.responsavel) return false;
  if (atrasados && !(c.prazo && c.prazo < todayISO() && EM_PRODUCAO.includes(c.etapa))) return false;
  return true;
}

const textoBusca = (c) => normalize(`${codigo(c.numero)} ${c.titulo} ${c.angulo} ${campanha(c.campanha_id)?.sigla || ''} ${(c.tags || []).join(' ')}`);

function cartao(c) {
  const i = ETAPA[c.etapa].ordem;
  const ant = ETAPAS[i - 1];
  const prox = ETAPAS[i + 1];
  return `<li class="cartao" draggable="true" data-id="${c.id}" data-busca="${esc(textoBusca(c))}">
    <a class="cartao-link" href="#/criativo/${c.id}">
      ${thumbBox(thumbUrl(c), { classe: 'cartao-thumb' })}
      <span class="cartao-txt">
        <span class="item-top"><span class="codigo">${codigo(c.numero)}</span>${campanhaTag(campanha(c.campanha_id))}</span>
        <span class="cartao-titulo">${esc(c.titulo)}</span>
        ${c.angulo ? `<span class="cartao-angulo">${esc(c.angulo)}</span>` : ''}
        <span class="item-meta">${prazoBadge(c)}${vereditoBadge(c.veredito)}<span class="formatos">${(c.formatos || []).map((f) => FORMATOS[f]?.label || f).join(' · ')}</span></span>
      </span>
    </a>
    <div class="cartao-pe">
      ${c.responsavel ? avatar(nomeMembro(c.responsavel)) : '<span class="avatar vazio" title="Sem responsável">?</span>'}
      <span class="cartao-mover">
        <button type="button" class="icon-btn small" data-mover="${ant?.id || ''}" ${ant ? '' : 'disabled'} aria-label="${ant ? `Voltar para ${ant.label}` : 'Primeira etapa'}">${icon('left', { size: 18 })}</button>
        <button type="button" class="icon-btn small" data-mover="${prox?.id || ''}" ${prox ? '' : 'disabled'} aria-label="${prox ? `Avançar para ${prox.label}` : 'Última etapa'}">${icon('right', { size: 18 })}</button>
      </span>
    </div>
  </li>`;
}

export function render({ params }) {
  const atrasados = params.get('atrasados') === '1';
  const lista = state.criativos.filter((c) => passa(c, { atrasados }));
  return `
    <header class="page-head">
      <div><h1 class="page-title">Quadro</h1><p class="page-sub">${plural(lista.length, 'criativo', 'criativos')}${atrasados ? ' atrasados' : ''}</p></div>
      <div class="head-actions"><button type="button" class="btn primary only-desktop" data-novo-criativo>${icon('plus')}Novo criativo</button></div>
    </header>
    <div class="filtros" role="search">
      <label class="busca">${icon('search', { size: 18 })}<span class="sr-only">Buscar</span>
        <input type="search" id="q-busca" placeholder="Buscar por código, título, ângulo…" value="${esc(filtro.busca)}" data-nao-suja></label>
      <label><span class="sr-only">Campanha</span><select class="compact" id="q-camp" data-nao-suja>${opcoesCampanha(filtro.campanha, { vazio: 'Todas as campanhas', soAtivas: false })}</select></label>
      <label><span class="sr-only">Responsável</span><select class="compact" id="q-resp" data-nao-suja>${opcoesMembro(filtro.responsavel, { vazio: 'Todos os responsáveis' })}</select></label>
      ${atrasados ? '<a class="chip ativo" href="#/quadro">Só atrasados ✕</a>' : ''}
    </div>
    <div class="board" id="board">
      ${ETAPAS.map((e) => {
        const cs = lista.filter((c) => c.etapa === e.id);
        return `<section class="coluna etapa-${e.id}" data-etapa="${e.id}" aria-labelledby="col-${e.id}">
          <header class="coluna-head">
            <h2 id="col-${e.id}"><span class="ponto" aria-hidden="true"></span>${e.label} <span class="coluna-n">${cs.length}</span></h2>
            <button type="button" class="icon-btn small" data-add="${e.id}" aria-label="Novo criativo em ${e.label}">${icon('plus', { size: 18 })}</button>
          </header>
          <ul class="cartoes">${cs.map(cartao).join('')}</ul>
        </section>`;
      }).join('')}
    </div>`;
}

async function mover(id, etapa) {
  const c = criativo(id);
  if (!c || !etapa || c.etapa === etapa) return;
  const patch = { etapa };
  // Entrou no ar sem veredito: começa como "em teste".
  if (etapa === 'no_ar' && !c.veredito) patch.veredito = 'teste';
  const ok = await enquanto(null, () => atualizarCriativo(id, patch));
  if (!ok) return;
  if (etapa === 'aprovado') {
    const feitos = CHECKLIST.filter((i) => c.checklist?.[i.id]).length;
    if (feitos < CHECKLIST.length) {
      toast(`${codigo(c.numero)} aprovado com o checklist de revisão em ${feitos}/${CHECKLIST.length}.`, {
        tone: 'alert', action: { label: 'Abrir', run: () => { location.hash = `#/criativo/${id}`; } },
      });
      return;
    }
  }
  toast(`${codigo(c.numero)} → ${ETAPA[etapa].label}`, { timeout: 2500 });
}

export function mount(root, { params, rerender }) {
  const board = root.querySelector('#board');
  const foco = params.get('etapa');
  if (foco) {
    const col = board.querySelector(`[data-etapa="${CSS.escape(foco)}"]`);
    col?.classList.add('destaque');
    col?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  const busca = root.querySelector('#q-busca');
  const aplicarBusca = () => {
    const q = normalize(busca.value);
    filtro.busca = busca.value;
    board.querySelectorAll('.cartao').forEach((el) => { el.hidden = Boolean(q) && !el.dataset.busca.includes(q); });
    board.querySelectorAll('.coluna').forEach((col) => {
      col.querySelector('.coluna-n').textContent = col.querySelectorAll('.cartao:not([hidden])').length;
    });
  };
  busca.addEventListener('input', aplicarBusca);
  if (filtro.busca) aplicarBusca();

  root.querySelector('#q-camp').addEventListener('change', (e) => { filtro.campanha = e.target.value; rerender(); });
  root.querySelector('#q-resp').addEventListener('change', (e) => { filtro.responsavel = e.target.value; rerender(); });

  board.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mover]');
    if (m) { mover(m.closest('.cartao').dataset.id, m.dataset.mover); return; }
    const add = e.target.closest('[data-add]');
    if (add) abrirNovoCriativo({ etapa: add.dataset.add, campanha_id: filtro.campanha });
  });

  // Arrastar e soltar entre colunas.
  let arrastando = null;
  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.cartao');
    if (!card) return;
    arrastando = card.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', arrastando);
    requestAnimationFrame(() => card.classList.add('arrastando'));
  });
  board.addEventListener('dragend', (e) => {
    e.target.closest('.cartao')?.classList.remove('arrastando');
    board.querySelectorAll('.alvo').forEach((c) => c.classList.remove('alvo'));
    arrastando = null;
  });
  board.addEventListener('dragover', (e) => {
    const col = e.target.closest('.coluna');
    if (!col || !arrastando) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    board.querySelectorAll('.alvo').forEach((c) => c !== col && c.classList.remove('alvo'));
    col.classList.add('alvo');
  });
  board.addEventListener('drop', (e) => {
    const col = e.target.closest('.coluna');
    if (!col) return;
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || arrastando;
    col.classList.remove('alvo');
    mover(id, col.dataset.etapa);
  });
}

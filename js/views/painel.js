// Início: o que está em produção, o que está atrasado, minhas entregas e quem está performando.
import { state, campanha, nomeMembro, thumbUrl } from '../store.js';
import { ETAPAS, EM_PRODUCAO, codigo, somarMetricas, indicadores, noPeriodo } from '../domain.js';
import { esc, todayISO, addDays, fmtBRL, fmtX, fmtPct, plural } from '../utils.js';
import { emptyState, etapaBadge, campanhaTag, prazoBadge, thumbBox, vereditoBadge } from '../ui.js';
import { icon } from '../icons.js';

export function itemCriativo(c, { extra = '' } = {}) {
  return `<li><a class="item-criativo" href="#/criativo/${c.id}">
    ${thumbBox(thumbUrl(c), { classe: 'mini' })}
    <span class="item-txt">
      <span class="item-top"><span class="codigo">${codigo(c.numero)}</span>${campanhaTag(campanha(c.campanha_id))}${vereditoBadge(c.veredito)}</span>
      <span class="item-titulo">${esc(c.titulo)}</span>
      <span class="item-meta">${etapaBadge(c.etapa)}${prazoBadge(c)}${extra}</span>
    </span>
  </a></li>`;
}

export function render() {
  const hoje = todayISO();
  const cs = state.criativos;
  const producao = cs.filter((c) => EM_PRODUCAO.includes(c.etapa));
  const atrasados = producao.filter((c) => c.prazo && c.prazo < hoje);
  const revisao = cs.filter((c) => c.etapa === 'revisao');
  const noAr = cs.filter((c) => c.etapa === 'no_ar');
  const meus = producao.filter((c) => c.responsavel === state.membro.email)
    .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'))
    .slice(0, 6);

  // Últimos 7 dias completos (até ontem: o dia de hoje ainda não fechou no Gerenciador).
  const de = addDays(hoje, -7);
  const ate = addDays(hoje, -1);
  const linhas7 = noPeriodo(state.metricas, de, ate);
  const tot = somarMetricas(linhas7);
  const ind = indicadores(tot);
  const porCriativo = new Map();
  for (const l of linhas7) (porCriativo.get(l.criativo_id) || porCriativo.set(l.criativo_id, []).get(l.criativo_id)).push(l);
  const destaques = [...porCriativo.entries()]
    .map(([id, ls]) => { const t = somarMetricas(ls); return { c: cs.find((x) => x.id === id), t, i: indicadores(t) }; })
    .filter((d) => d.c && d.t.gasto_cents > 0)
    .sort((a, b) => (a.i.cpa ?? Infinity) - (b.i.cpa ?? Infinity))
    .slice(0, 5);

  const nome = state.membro.nome || nomeMembro(state.membro.email);
  return `
    <header class="page-head">
      <div><p class="page-kicker">Olá, ${esc(nome)}</p><h1 class="page-title">Criativos</h1></div>
      <div class="head-actions"><button type="button" class="btn primary only-desktop" data-novo-criativo>${icon('plus')}Novo criativo</button></div>
    </header>

    <section class="kpis" aria-label="Resumo">
      <a class="kpi" href="#/quadro"><span class="kpi-label">Em produção</span><span class="kpi-valor">${producao.length}</span></a>
      <a class="kpi" href="#/quadro?etapa=revisao"><span class="kpi-label">Para revisar</span><span class="kpi-valor">${revisao.length}</span></a>
      <a class="kpi" href="#/quadro?etapa=no_ar"><span class="kpi-label">No ar</span><span class="kpi-valor">${noAr.length}</span></a>
      <a class="kpi ${atrasados.length ? 'kpi-alerta' : ''}" href="#/quadro?atrasados=1"><span class="kpi-label">Atrasados</span><span class="kpi-valor">${atrasados.length}</span></a>
    </section>

    <section class="block" aria-labelledby="h-funil">
      <div class="block-head"><h2 id="h-funil">Esteira</h2><a class="link" href="#/quadro">Abrir quadro</a></div>
      <ol class="esteira">
        ${ETAPAS.map((e) => {
          const n = cs.filter((c) => c.etapa === e.id).length;
          return `<li><a href="#/quadro?etapa=${e.id}" class="esteira-passo etapa-${e.id} ${n ? '' : 'zero'}"><span class="esteira-n">${n}</span><span>${e.label}</span></a></li>`;
        }).join('')}
      </ol>
    </section>

    <div class="cols">
      <section class="block" aria-labelledby="h-meus">
        <div class="block-head"><h2 id="h-meus">Minhas entregas</h2><span class="muted small">${plural(meus.length, 'criativo', 'criativos')}</span></div>
        ${meus.length ? `<ul class="lista-criativos">${meus.map((c) => itemCriativo(c)).join('')}</ul>`
          : emptyState({ title: 'Nada com você agora', text: 'Os criativos em produção em que você é responsável aparecem aqui.' })}
      </section>

      <section class="block" aria-labelledby="h-dest">
        <div class="block-head"><h2 id="h-dest">Melhor custo por resultado · 7 dias</h2><a class="link" href="#/resultados">Resultados</a></div>
        ${destaques.length ? `
          <dl class="mini-kpis">
            <div><dt>Investido</dt><dd>${fmtBRL(tot.gasto_cents)}</dd></div>
            <div><dt>Custo por resultado</dt><dd>${fmtBRL(ind.cpa)}</dd></div>
            <div><dt>Retorno</dt><dd>${fmtX(ind.roas)}</dd></div>
          </dl>
          <ul class="lista-criativos">${destaques.map((d) => itemCriativo(d.c, {
            extra: `<span class="metrica-inline">CPA <strong>${fmtBRL(d.i.cpa)}</strong> · gancho ${fmtPct(d.i.gancho)}</span>`,
          })).join('')}</ul>`
          : emptyState({ title: 'Sem resultados na semana', text: 'Importe o relatório do Gerenciador de Anúncios para ver quem está performando.', action: '<a class="btn ghost small" href="#/resultados">Importar relatório</a>' })}
      </section>
    </div>`;
}

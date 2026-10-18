// Resultados: importa o CSV do Gerenciador de Anúncios (casa pelo código C0042 no nome do anúncio)
// e mostra o ranking dos criativos no período.
import { state, campanha, thumbUrl, importarMetricas } from '../store.js';
import { CAMPOS_CSV, lerCSV, mapearColunas, agregarCSV, somarMetricas, indicadores, noPeriodo, codigo } from '../domain.js';
import { esc, fmtBRL, fmtNum, fmtPct, fmtX, fmtDate, todayISO, addDays, plural } from '../utils.js';
import { toast, enquanto, emptyState, campanhaTag, thumbBox, vereditoBadge } from '../ui.js';
import { icon } from '../icons.js';
import { opcoesCampanha } from './campos.js';

const PERIODOS = [
  { id: '7', label: '7 dias' }, { id: '14', label: '14 dias' }, { id: '30', label: '30 dias' }, { id: '90', label: '90 dias' }, { id: 'tudo', label: 'Tudo' },
];
const filtro = { periodo: '14', campanha: '' };
let ordem = { col: 'gasto', desc: true };
let importacao = null; // { arquivo, cabecalho, linhas, mapa }

const COLUNAS = [
  { id: 'gasto', label: 'Investido', val: (r) => r.t.gasto_cents, fmt: fmtBRL },
  { id: 'impressoes', label: 'Impressões', val: (r) => r.t.impressoes, fmt: fmtNum },
  { id: 'ctr', label: 'CTR', val: (r) => r.i.ctr, fmt: fmtPct, dica: 'Cliques no link ÷ impressões' },
  { id: 'gancho', label: 'Gancho', val: (r) => r.i.gancho, fmt: fmtPct, dica: 'Reproduções de 3 s ÷ impressões' },
  { id: 'retencao', label: 'Retenção', val: (r) => r.i.retencao, fmt: fmtPct, dica: 'ThruPlays ÷ reproduções de 3 s' },
  { id: 'cpm', label: 'CPM', val: (r) => r.i.cpm, fmt: fmtBRL },
  { id: 'resultados', label: 'Result.', val: (r) => r.t.resultados, fmt: fmtNum },
  { id: 'cpa', label: 'Custo/result.', val: (r) => r.i.cpa, fmt: fmtBRL, menorMelhor: true },
  { id: 'roas', label: 'ROAS', val: (r) => r.i.roas, fmt: fmtX },
];

function intervalo() {
  const hoje = todayISO();
  return filtro.periodo === 'tudo' ? { de: null, ate: null } : { de: addDays(hoje, -Number(filtro.periodo)), ate: hoje };
}

// ---------- Importação ----------

function resumoImportacao() {
  const numeroParaId = new Map(state.criativos.map((c) => [Number(c.numero), c.id]));
  return agregarCSV(importacao.linhas, importacao.mapa, numeroParaId);
}

function painelImportacao() {
  if (!importacao) return '';
  const { cabecalho, mapa } = importacao;
  const faltando = Object.entries(CAMPOS_CSV).filter(([k, d]) => d.obrigatorio && mapa[k] == null).map(([, d]) => d.label);
  const r = faltando.length ? null : resumoImportacao();
  const criativos = r ? new Set(r.linhas.map((l) => l.criativo_id)).size : 0;
  const nao = r ? [...r.naoReconhecidos.entries()].sort((a, b) => b[1] - a[1]) : [];
  return `
    <div class="importacao" id="importacao">
      <h3>${icon('upload', { size: 18 })} ${esc(importacao.arquivo)} <span class="muted small">${plural(importacao.linhas.length, 'linha', 'linhas')}</span></h3>
      <details class="detalhes" ${faltando.length ? 'open' : ''}>
        <summary>Colunas do arquivo</summary>
        <div class="mapa-colunas">
          ${Object.entries(CAMPOS_CSV).map(([k, d]) => `<label class="field" for="map-${k}"><span class="field-label">${esc(d.label)}${d.obrigatorio ? ' *' : ''}</span>
            <select id="map-${k}" data-mapa="${k}" data-nao-suja><option value="">— não usar —</option>
              ${cabecalho.map((h, i) => `<option value="${i}" ${mapa[k] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('')}
        </div>
      </details>
      ${faltando.length ? `<p class="callout alert">Escolha a coluna de: ${faltando.map(esc).join(', ')}.</p>` : `
        <ul class="resumo-import">
          <li><strong>${plural(criativos, 'criativo reconhecido', 'criativos reconhecidos')}</strong>, ${plural(r.linhas.length, 'registro', 'registros')}${r.periodo.de ? ` de ${fmtDate(r.periodo.de)} a ${fmtDate(r.periodo.ate)}` : ''}.</li>
          ${r.semData ? '<li class="aviso">O arquivo não tem coluna de data: os números entram com a data de hoje. Prefira exportar com detalhamento por Dia.</li>' : ''}
          ${nao.length ? `<li class="aviso">${plural(nao.length, 'anúncio sem código de criativo ficou de fora', 'anúncios sem código de criativo ficaram de fora')}:
            <span class="muted small">${nao.slice(0, 8).map(([n]) => esc(n)).join(' · ')}${nao.length > 8 ? ' …' : ''}</span></li>` : ''}
          <li class="muted small">Para esses criativos, o que já havia entre essas datas é substituído (reimportar o mesmo relatório não duplica).</li>
        </ul>`}
      <div class="actions left">
        <button type="button" class="btn primary" data-importar ${faltando.length || !r?.linhas.length ? 'disabled' : ''}>Importar</button>
        <button type="button" class="btn ghost" data-cancelar>Cancelar</button>
      </div>
    </div>`;
}

// ---------- Página ----------

export function render() {
  const { de, ate } = intervalo();
  const ids = new Set(state.criativos.filter((c) => !filtro.campanha || c.campanha_id === filtro.campanha).map((c) => c.id));
  const linhas = noPeriodo(state.metricas, de, ate).filter((l) => ids.has(l.criativo_id));
  const grupos = new Map();
  for (const l of linhas) (grupos.get(l.criativo_id) || grupos.set(l.criativo_id, []).get(l.criativo_id)).push(l);
  const linhasTabela = [...grupos.entries()].map(([id, ls]) => {
    const t = somarMetricas(ls);
    return { c: state.criativos.find((x) => x.id === id), t, i: indicadores(t) };
  }).filter((r) => r.c);
  const col = COLUNAS.find((x) => x.id === ordem.col) || COLUNAS[0];
  linhasTabela.sort((a, b) => {
    const va = col.val(a); const vb = col.val(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return ordem.desc ? vb - va : va - vb;
  });
  const tot = somarMetricas(linhas);
  const ind = indicadores(tot);
  const comCpa = linhasTabela.filter((r) => r.i.cpa != null && r.t.gasto_cents > 0);
  const melhor = comCpa.length > 1 ? comCpa.reduce((a, b) => (b.i.cpa < a.i.cpa ? b : a)) : null;

  return `
    <header class="page-head">
      <div><h1 class="page-title">Resultados</h1>
        <p class="page-sub">${de ? `${fmtDate(de)} a ${fmtDate(ate)}` : 'Todo o histórico'}${filtro.campanha ? ` · ${esc(campanha(filtro.campanha)?.nome || '')}` : ''}</p></div>
      <div class="head-actions">
        <label class="btn primary file-btn">${icon('upload', { size: 18 })}Importar CSV
          <input type="file" accept=".csv,text/csv,text/plain" id="arquivo-csv" class="sr-only" data-nao-suja></label>
      </div>
    </header>

    ${painelImportacao()}

    <details class="detalhes como-exportar" ${state.metricas.length ? '' : 'open'}>
      <summary>Como exportar do Gerenciador de Anúncios</summary>
      <ol>
        <li>No Gerenciador, abra a aba <strong>Anúncios</strong> e escolha o período.</li>
        <li>Em <strong>Detalhamento → Por tempo → Dia</strong> (assim dá para ver a evolução).</li>
        <li>Inclua as colunas: valor usado, impressões, cliques no link, reproduções de vídeo de 3 segundos, ThruPlays, resultados (ou compras) e valor de conversão.</li>
        <li><strong>Relatórios → Exportar dados da tabela → .csv</strong> e importe aqui.</li>
      </ol>
      <p class="muted small">O painel reconhece o anúncio pelo código do criativo no nome (C0042). Por isso use o nome padrão que aparece em cada criativo.</p>
    </details>

    <div class="filtros">
      <div class="chips" role="radiogroup" aria-label="Período">
        ${PERIODOS.map((p) => `<button type="button" class="chip" role="radio" aria-checked="${filtro.periodo === p.id}" data-periodo="${p.id}">${p.label}</button>`).join('')}
      </div>
      <label><span class="sr-only">Campanha</span><select class="compact" id="r-camp" data-nao-suja>${opcoesCampanha(filtro.campanha, { vazio: 'Todas as campanhas', soAtivas: false })}</select></label>
    </div>

    ${linhasTabela.length ? `
      <section class="kpis kpis-6" aria-label="Totais do período">
        <div class="kpi"><span class="kpi-label">Investido</span><span class="kpi-valor">${fmtBRL(tot.gasto_cents)}</span></div>
        <div class="kpi"><span class="kpi-label">Resultados</span><span class="kpi-valor">${fmtNum(tot.resultados)}</span></div>
        <div class="kpi"><span class="kpi-label">Custo por resultado</span><span class="kpi-valor">${fmtBRL(ind.cpa)}</span></div>
        <div class="kpi"><span class="kpi-label">ROAS</span><span class="kpi-valor">${fmtX(ind.roas)}</span></div>
        <div class="kpi"><span class="kpi-label">CTR (link)</span><span class="kpi-valor">${fmtPct(ind.ctr)}</span></div>
        <div class="kpi"><span class="kpi-label">Taxa de gancho</span><span class="kpi-valor">${fmtPct(ind.gancho)}</span></div>
      </section>

      <section class="block" aria-labelledby="h-rank">
        <div class="block-head"><h2 id="h-rank">Criativos no período</h2><span class="muted small">${plural(linhasTabela.length, 'criativo', 'criativos')}</span></div>
        <div class="table-wrap"><table class="tabela ranking">
          <thead><tr>
            <th scope="col">Criativo</th>
            ${COLUNAS.map((c) => `<th scope="col" class="num" aria-sort="${ordem.col === c.id ? (ordem.desc ? 'descending' : 'ascending') : 'none'}">
              <button type="button" class="ordenar" data-ordem="${c.id}" ${c.dica ? `title="${esc(c.dica)}"` : ''}>${c.label}${ordem.col === c.id ? (ordem.desc ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}
          </tr></thead>
          <tbody>${linhasTabela.map((r) => `<tr class="${r === melhor ? 'melhor' : ''}">
            <th scope="row"><a class="celula-criativo" href="#/criativo/${r.c.id}">${thumbBox(thumbUrl(r.c), { classe: 'mini' })}
              <span><span class="item-top"><span class="codigo">${codigo(r.c.numero)}</span>${campanhaTag(campanha(r.c.campanha_id))}${r === melhor ? `<span class="veredito veredito-vencedor">${icon('trophy', { size: 14 })}Menor custo</span>` : vereditoBadge(r.c.veredito)}</span>
              <span class="celula-titulo">${esc(r.c.titulo)}</span></span></a></th>
            ${COLUNAS.map((c) => `<td class="num">${c.fmt(c.val(r))}</td>`).join('')}
          </tr>`).join('')}</tbody>
        </table></div>
      </section>`
      : emptyState({
        title: state.metricas.length ? 'Nada neste período' : 'Nenhum resultado importado',
        text: state.metricas.length ? 'Escolha um período maior ou outra campanha.' : 'Importe o CSV do Gerenciador de Anúncios para comparar os criativos.',
      })}`;
}

export function mount(root, { rerender }) {
  root.querySelector('#arquivo-csv').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast('Arquivo grande demais (máx. 15 MB). Exporte um período menor.', { tone: 'alert' }); return; }
    if (/\.xlsx?$/i.test(file.name)) { toast('Exporte como .csv (o .xlsx não é lido aqui).', { tone: 'alert' }); return; }
    const texto = await file.text();
    const { cabecalho, linhas } = lerCSV(texto);
    if (!cabecalho.length || !linhas.length) { toast('Não encontrei linhas nesse arquivo.', { tone: 'alert' }); return; }
    importacao = { arquivo: file.name, cabecalho, linhas, mapa: mapearColunas(cabecalho) };
    rerender();
    root.querySelector('#importacao')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  root.addEventListener('change', (e) => {
    const k = e.target.dataset.mapa;
    if (k) {
      if (e.target.value === '') delete importacao.mapa[k]; else importacao.mapa[k] = Number(e.target.value);
      rerender();
    }
    if (e.target.id === 'r-camp') { filtro.campanha = e.target.value; rerender(); }
  });

  root.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-periodo]');
    if (p) { filtro.periodo = p.dataset.periodo; rerender(); return; }
    const o = e.target.closest('[data-ordem]');
    if (o) {
      const col = COLUNAS.find((x) => x.id === o.dataset.ordem);
      ordem = ordem.col === col.id ? { col: col.id, desc: !ordem.desc } : { col: col.id, desc: !col.menorMelhor };
      rerender();
      return;
    }
    if (e.target.closest('[data-cancelar]')) { importacao = null; rerender(); return; }
    const imp = e.target.closest('[data-importar]');
    if (imp) {
      const r = resumoImportacao();
      if (!r.linhas.length) return;
      const linhas = r.linhas.map((l) => ({
        ...l,
        impressoes: l.impressoes == null ? null : Math.round(l.impressoes),
        cliques: l.cliques == null ? null : Math.round(l.cliques),
        views_3s: l.views_3s == null ? null : Math.round(l.views_3s),
        thruplays: l.thruplays == null ? null : Math.round(l.thruplays),
      }));
      const n = await enquanto(imp, () => importarMetricas(linhas, r.periodo.de, r.periodo.ate));
      if (n === undefined) return;
      importacao = null;
      // Mostra o período importado inteiro.
      const dias = Math.ceil((Date.parse(todayISO()) - Date.parse(r.periodo.de)) / 86400000);
      filtro.periodo = PERIODOS.find((x) => x.id !== 'tudo' && Number(x.id) >= dias)?.id || 'tudo';
      rerender();
      toast(`${plural(n, 'registro importado', 'registros importados')}.`);
    }
  });
}

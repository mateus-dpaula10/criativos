// IA no criativo: sugerir ganchos/roteiros e revisar o vídeo exportado (via Edge Function "ia" no Supabase).
import { state, campanha, metricasDe, atualizarCriativo, comentar } from '../store.js';
import { api } from '../api.js';
import { CHECKLIST, TIPOS_BLOCO, codigo, somarMetricas, indicadores, noPeriodo, custoIA, estimarSegundos } from '../domain.js';
import { esc, fmtBRL, fmtPct, fmtX, todayISO, addDays } from '../utils.js';
import { openDialog, sheetHeader, toast, enquanto } from '../ui.js';
import { icon } from '../icons.js';
import { extrairQuadros, formatoDe } from '../video.js';

const fmtUSD = (v) => (v == null ? '' : `≈ US$ ${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`);
const rodapeCusto = (r) => `<p class="ia-custo">${esc(r.modelo || '')} · ${r.uso?.entrada ?? 0} + ${r.uso?.saida ?? 0} tokens ${fmtUSD(custoIA(r.modelo, r.uso?.entrada, r.uso?.saida))}</p>`;

/** Até 3 criativos com roteiro e melhor custo por resultado nos últimos 30 dias (mesma campanha primeiro). */
function referencias(c) {
  const de = addDays(todayISO(), -30);
  return state.criativos
    .filter((x) => x.id !== c.id && (x.roteiro || []).length)
    .map((x) => {
      const t = somarMetricas(noPeriodo(metricasDe(x.id), de, null));
      return { x, t, i: indicadores(t) };
    })
    .filter((r) => r.t.gasto_cents > 0 && r.i.cpa != null)
    .sort((a, b) => (Number(b.x.campanha_id === c.campanha_id) - Number(a.x.campanha_id === c.campanha_id)) || a.i.cpa - b.i.cpa)
    .slice(0, 3)
    .map(({ x, i }) => ({
      titulo: `${codigo(x.numero)} ${x.titulo}`,
      desempenho: [`custo por resultado ${fmtBRL(i.cpa)}`, i.gancho != null ? `taxa de gancho ${fmtPct(i.gancho)}` : '', i.roas != null ? `ROAS ${fmtX(i.roas)}` : ''].filter(Boolean).join(', '),
      blocos: x.roteiro,
    }));
}

const carregando = (txt) => `<div class="ia-carregando" role="status"><span class="spinner" aria-hidden="true"></span>${esc(txt)}</div>`;

// ---------- Sugerir roteiro ----------

/**
 * blocosAtuais: roteiro em edição. aoUsarRoteiro(blocos) troca o roteiro inteiro; aoUsarGancho(texto) troca só o gancho.
 */
export function sugerirRoteiro(c, { blocosAtuais = [], aoUsarRoteiro, aoUsarGancho }) {
  const refs = referencias(c);
  const camp = campanha(c.campanha_id);
  const rascunho = blocosAtuais.filter((b) => String(b.texto || '').trim()).map((b) => `[${b.tipo}] ${b.texto.trim()}`).join('\n');
  const dlg = openDialog(`
    <div class="sheet-body ia">
      ${sheetHeader('Sugerir roteiro com IA')}
      <form id="ia-form" novalidate>
        <p class="muted small">${esc(codigo(c.numero))} · ${esc(c.titulo)}${c.angulo ? ` · ângulo ${esc(c.angulo)}` : ''}${camp ? ` · ${esc(camp.nome)}` : ''}</p>
        <label class="field" for="ia-contexto"><span class="field-label">Contexto <small>(a história, a oferta, o que tem de material gravado)</small></span>
          <textarea id="ia-contexto" name="contexto" rows="4" maxlength="2000" autofocus placeholder="Ex.: cachorra resgatada na chuva, 3 semanas de tratamento, hoje está para adoção. Temos vídeo do resgate e dela brincando."></textarea></label>
        <div class="grid-2">
          <label class="field" for="ia-publico"><span class="field-label">Público <small>(opcional)</small></span>
            <input id="ia-publico" name="publico" maxlength="300" placeholder="Ex.: mulheres 30-55 que amam animais"></label>
          <label class="field" for="ia-duracao"><span class="field-label">Duração alvo</span>
            <select id="ia-duracao" name="duracao">${[15, 30, 45, 60].map((s) => `<option value="${s}" ${s === 30 ? 'selected' : ''}>${s} segundos</option>`).join('')}</select></label>
        </div>
        <p class="field-hint">${refs.length ? `Vai usar como referência ${refs.length === 1 ? 'o criativo' : `os ${refs.length} criativos`} de menor custo por resultado: ${refs.map((r) => esc(r.titulo.split(' ')[0])).join(', ')}.` : 'Ainda não há criativos com roteiro e resultado para usar de referência.'}
          ${rascunho ? ' O rascunho atual do roteiro também vai junto.' : ''}</p>
        <div class="actions"><button type="submit" class="btn primary">${icon('bulb', { size: 18 })}Gerar sugestões</button></div>
      </form>
      <div id="ia-resultado" aria-live="polite"></div>
    </div>`);
  const form = dlg.querySelector('#ia-form');
  const saida = dlg.querySelector('#ia-resultado');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saida.innerHTML = carregando('Escrevendo ganchos e roteiros…');
    const r = await enquanto(e.submitter, () => api.ia('roteiros', {
      campanha: camp ? `${camp.nome} (${camp.sigla})` : '', titulo: c.titulo, angulo: c.angulo,
      publico: form.publico.value, contexto: form.contexto.value, duracao: Number(form.duracao.value),
      rascunho, referencias: refs,
    }));
    if (!r) { saida.innerHTML = ''; return; }
    const { ganchos = [], roteiros = [] } = r.resultado || {};
    saida.innerHTML = `
      <h3 class="ia-titulo">Ganchos</h3>
      <ul class="ia-ganchos">${ganchos.map((g, i) => `<li>
        <div><p class="ia-gancho">${esc(g.texto)}</p><p class="muted small">${esc(g.por_que)}</p></div>
        <button type="button" class="btn ghost small" data-gancho="${i}">Usar</button></li>`).join('')}</ul>
      <h3 class="ia-titulo">Roteiros</h3>
      ${roteiros.map((ro, i) => {
        const total = ro.blocos.reduce((a, b) => a + (Number(b.segundos) || estimarSegundos(b.texto)), 0);
        return `<article class="ia-roteiro">
          <header><strong>${esc(ro.titulo)}</strong> <span class="muted small">~${Math.round(total)} s</span></header>
          <p class="muted small">${esc(ro.ideia)}</p>
          <ol>${ro.blocos.map((b) => `<li class="bloco-${esc(b.tipo)}"><span class="ia-tipo">${esc(TIPOS_BLOCO[b.tipo] || b.tipo)}</span> ${esc(b.texto)}</li>`).join('')}</ol>
          <div class="actions left"><button type="button" class="btn primary small" data-roteiro="${i}">Usar este roteiro</button></div>
        </article>`;
      }).join('')}
      ${rodapeCusto(r)}`;
    saida.querySelectorAll('[data-gancho]').forEach((b) => b.addEventListener('click', () => {
      aoUsarGancho(ganchos[Number(b.dataset.gancho)].texto);
      toast('Gancho aplicado no roteiro. Salve quando estiver bom.');
      b.textContent = 'Aplicado';
    }));
    saida.querySelectorAll('[data-roteiro]').forEach((b) => b.addEventListener('click', () => {
      const ro = roteiros[Number(b.dataset.roteiro)];
      aoUsarRoteiro(ro.blocos.map((x) => ({ tipo: x.tipo, texto: x.texto, segundos: Number(x.segundos) > 0 ? Math.round(x.segundos * 10) / 10 : null })));
      dlg.close();
      toast('Roteiro aplicado. Revise e clique em “Salvar roteiro”.');
    }));
  });
}

// ---------- Revisar vídeo ----------

export async function revisarVideo(c, file, { blocosAtuais = [], aoComentar } = {}) {
  const dlg = openDialog(`
    <div class="sheet-body ia">
      ${sheetHeader('Revisão do vídeo com IA')}
      <p class="muted small">${esc(file.name)}</p>
      <div id="ia-resultado" aria-live="polite">${carregando('Tirando quadros do vídeo…')}</div>
    </div>`);
  const saida = dlg.querySelector('#ia-resultado');
  let lido;
  try {
    lido = await extrairQuadros(file);
  } catch (err) {
    saida.innerHTML = `<p class="callout alert">${esc(err.message)}</p>`;
    return;
  }
  saida.innerHTML = `<div class="ia-quadros">${lido.quadros.map((q) => `<figure><img src="${q.imagem}" alt="Quadro aos ${q.segundo} s"><figcaption>${q.segundo}s</figcaption></figure>`).join('')}</div>
    ${carregando('A IA está olhando os quadros…')}`;
  const formato = formatoDe(lido.w, lido.h) || `${lido.w}x${lido.h}`;
  let r;
  try {
    r = await api.ia('revisar', {
      titulo: c.titulo, formato, duracao: lido.dur, quadros: lido.quadros,
      roteiro: blocosAtuais.filter((b) => String(b.texto || '').trim()),
    });
  } catch (err) {
    saida.querySelector('.ia-carregando')?.remove();
    saida.insertAdjacentHTML('beforeend', `<p class="callout alert">${esc(err.message)}</p>`);
    return;
  }
  const { itens = [], resumo = '', sugestoes = [] } = r.resultado || {};
  const rotulo = (id) => CHECKLIST.find((x) => x.id === id)?.label || id;
  saida.querySelector('.ia-carregando')?.remove();
  saida.insertAdjacentHTML('beforeend', `
    <p class="ia-resumo">${esc(resumo)}</p>
    <ul class="ia-itens">${itens.map((it) => `<li class="${it.ok ? 'ok' : 'nao'}">
      <span class="ia-marca" aria-hidden="true">${icon(it.ok ? 'check' : 'alert', { size: 18 })}</span>
      <div><strong>${esc(rotulo(it.id))}</strong><span class="sr-only">${it.ok ? ': ok' : ': ajustar'}</span><p class="small">${esc(it.observacao)}</p></div></li>`).join('')}</ul>
    ${sugestoes.length ? `<h3 class="ia-titulo">Sugestões</h3><ul class="ia-sugestoes">${sugestoes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <p class="field-hint">O áudio não é avaliado (a IA vê só as imagens). Confira o som você mesmo.</p>
    <div class="actions left">
      <button type="button" class="btn primary small" data-marcar>Marcar os aprovados no checklist</button>
      <button type="button" class="btn ghost small" data-comentar>${icon('message', { size: 18 })}Salvar como comentário</button>
    </div>
    ${rodapeCusto(r)}`);

  saida.querySelector('[data-marcar]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const atual = state.criativos.find((x) => x.id === c.id) || c;
    const checklist = { ...(atual.checklist || {}) };
    itens.filter((it) => it.ok).forEach((it) => { checklist[it.id] = true; });
    if (await enquanto(btn, () => atualizarCriativo(c.id, { checklist }))) {
      toast(`${itens.filter((it) => it.ok).length} ${itens.filter((it) => it.ok).length === 1 ? 'item marcado' : 'itens marcados'} no checklist.`);
      btn.disabled = true;
    }
  });
  saida.querySelector('[data-comentar]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const texto = [
      `Revisão por IA (${file.name}): ${resumo}`,
      ...itens.filter((it) => !it.ok).map((it) => `• ${rotulo(it.id)}: ${it.observacao}`),
      ...sugestoes.map((s) => `→ ${s}`),
    ].join('\n').slice(0, 4000);
    if (await enquanto(btn, () => comentar(c.id, texto))) {
      toast('Revisão salva nos comentários.');
      btn.disabled = true;
      aoComentar?.();
    }
  });
}

// Diálogo "Novo criativo": o mínimo para entrar no quadro; o resto se completa na página do criativo.
import { state, criarCriativos } from '../store.js';
import { openDialog, sheetHeader, toast, enquanto } from '../ui.js';
import { esc } from '../utils.js';
import { opcoesCampanha, opcoesMembro, opcoesEtapa, opcoesFerramenta, checksFormatos, marcados } from './campos.js';

export function abrirNovoCriativo({ etapa = 'ideia', campanha_id = '' } = {}) {
  const ultimaCampanha = campanha_id || state.criativos[0]?.campanha_id || '';
  const dlg = openDialog(`
    <form class="sheet-body" id="novo-criativo" novalidate>
      ${sheetHeader('Novo criativo')}
      <label class="field" for="nc-titulo"><span class="field-label">Título</span>
        <input id="nc-titulo" name="titulo" maxlength="160" required autofocus placeholder="Ex.: Resgate da Mel, antes e depois"></label>
      <div class="grid-2">
        <label class="field" for="nc-campanha"><span class="field-label">Campanha</span>
          <select id="nc-campanha" name="campanha_id">${opcoesCampanha(ultimaCampanha)}</select></label>
        <label class="field" for="nc-angulo"><span class="field-label">Ângulo <small>(tema da mensagem)</small></span>
          <input id="nc-angulo" name="angulo" maxlength="80" placeholder="Ex.: Dor, Prova social, Urgência" list="angulos-usados"></label>
        <label class="field" for="nc-etapa"><span class="field-label">Etapa</span>
          <select id="nc-etapa" name="etapa">${opcoesEtapa(etapa)}</select></label>
        <label class="field" for="nc-resp"><span class="field-label">Responsável</span>
          <select id="nc-resp" name="responsavel">${opcoesMembro(state.membro?.email)}</select></label>
        <label class="field" for="nc-ferr"><span class="field-label">Editado no</span>
          <select id="nc-ferr" name="ferramenta">${opcoesFerramenta('capcut')}</select></label>
        <label class="field" for="nc-prazo"><span class="field-label">Prazo</span>
          <input id="nc-prazo" name="prazo" type="date"></label>
      </div>
      ${checksFormatos(['9x16'])}
      <datalist id="angulos-usados">${[...new Set(state.criativos.map((c) => c.angulo).filter(Boolean))].map((a) => `<option value="${esc(a)}">`).join('')}</datalist>
      <div class="actions">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Criar</button>
      </div>
    </form>`);
  const form = dlg.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = form.titulo.value.trim();
    if (!titulo) { form.titulo.focus(); toast('Dê um título ao criativo.', { tone: 'alert' }); return; }
    const formatos = marcados(form, 'formatos');
    const novos = await enquanto(e.submitter, () => criarCriativos({
      titulo,
      campanha_id: form.campanha_id.value || null,
      angulo: form.angulo.value.trim(),
      etapa: form.etapa.value,
      responsavel: form.responsavel.value || null,
      ferramenta: form.ferramenta.value,
      prazo: form.prazo.value || null,
      formatos: formatos.length ? formatos : ['9x16'],
    }));
    if (!novos) return;
    dlg.close();
    location.hash = `#/criativo/${novos[0].id}`;
  });
}

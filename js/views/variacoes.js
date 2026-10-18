// Montador de variações: ganchos × corpos × CTAs já exportados viram N criativos (com nome padrão) e um
// script .bat que renderiza todos com o ffmpeg no PC de quem edita, nos formatos marcados.
import { state, criativo, criarCriativos, nomeDe, salvarAjustes, campanha } from '../store.js';
import { FORMATOS, codigo, listaArquivos, combinar, rotuloArquivo, gerarBat, nomeArquivo, escBat } from '../domain.js';
import { esc, plural } from '../utils.js';
import { toast, enquanto, downloadFile, limparRascunho } from '../ui.js';
import { icon } from '../icons.js';
import { opcoesCampanha, opcoesMembro, checksFormatos, marcados } from './campos.js';

const LIMITE = 60;

function campoLista(id, rotulo, dica, opcional = false) {
  return `<div class="field lista-arquivos">
    <label class="field-label" for="${id}">${rotulo} ${opcional ? '<small>(opcional)</small>' : ''}</label>
    <textarea id="${id}" rows="4" spellcheck="false" placeholder="${esc(dica)}"></textarea>
    <label class="btn ghost small file-btn">${icon('film', { size: 18 })}Escolher arquivos
      <input type="file" multiple accept="video/*" class="sr-only" data-para="${id}" data-nao-suja></label>
  </div>`;
}

export function render({ params }) {
  const base = params.get('base') ? criativo(params.get('base')) : null;
  const opcoesBase = state.criativos.map((c) => `<option value="${c.id}" ${c.id === base?.id ? 'selected' : ''}>${codigo(c.numero)} · ${esc(c.titulo)}</option>`).join('');
  return `
    <header class="page-head">
      <div><h1 class="page-title">Variações</h1>
        <p class="page-sub">Junte ganchos, corpos e CTAs e gere todas as combinações de uma vez, já com o nome padrão.</p></div>
    </header>

    <ol class="passos">
      <li><strong>Exporte as partes separadas</strong> no CapCut ou no Premiere (cada gancho, corpo e CTA um arquivo) numa mesma pasta.</li>
      <li><strong>Liste os arquivos aqui</strong> e marque os formatos. O painel cria um criativo para cada combinação.</li>
      <li><strong>Rode o script baixado</strong> (duplo clique no .bat). Os vídeos saem prontos na pasta de saída, com o nome de cada criativo.</li>
    </ol>

    <form id="form-var" class="block" novalidate>
      <div class="grid-2">
        <label class="field" for="v-base"><span class="field-label">A partir do criativo <small>(opcional)</small></span>
          <select id="v-base" name="base"><option value="">Nenhum (variações novas)</option>${opcoesBase}</select></label>
        <label class="field" for="v-camp"><span class="field-label">Campanha</span>
          <select id="v-camp" name="campanha_id">${opcoesCampanha(base?.campanha_id || '')}</select></label>
        <label class="field" for="v-ang"><span class="field-label">Ângulo</span>
          <input id="v-ang" name="angulo" maxlength="80" value="${esc(base?.angulo || '')}"></label>
        <label class="field" for="v-resp"><span class="field-label">Responsável</span>
          <select id="v-resp" name="responsavel">${opcoesMembro(base?.responsavel || state.membro.email)}</select></label>
      </div>

      <label class="field" for="v-pasta"><span class="field-label">Pasta dos clipes no PC</span>
        <input id="v-pasta" name="pasta" value="${esc(state.ajustes.pasta_clipes || '')}" placeholder="D:\\Criativos\\brutos" spellcheck="false">
        <span class="field-hint">Copie o endereço da pasta no Explorador de Arquivos. Arquivos com caminho completo também valem.</span></label>
      <label class="field" for="v-saida"><span class="field-label">Pasta de saída <small>(opcional)</small></span>
        <input id="v-saida" name="saida" placeholder="Em branco: subpasta “render” dentro da pasta dos clipes" spellcheck="false"></label>

      <div class="grid-3">
        ${campoLista('v-ganchos', 'Ganchos', 'gancho_01.mp4\ngancho_02.mp4')}
        ${campoLista('v-corpos', 'Corpos', 'corpo_a.mp4')}
        ${campoLista('v-ctas', 'CTAs', 'cta_doe_agora.mp4', true)}
      </div>

      ${checksFormatos(base?.formatos?.length ? base.formatos : ['9x16', '4x5'], 'vformatos')}

      <fieldset class="segmented small"><legend class="field-label">Quando a proporção do clipe for diferente do formato</legend>
        <label><input type="radio" name="ajuste" id="v-aj-cortar" value="cortar" checked><span>Cortar e preencher</span></label>
        <label><input type="radio" name="ajuste" id="v-aj-barras" value="barras"><span>Barras pretas</span></label>
      </fieldset>
      <label class="check"><input type="checkbox" id="v-audio" name="audio" checked><span>Os clipes têm áudio <small>(desmarque se forem mudos: sem isso o ffmpeg falha)</small></span></label>

      <div class="previa" id="previa" aria-live="polite"></div>
      <div class="actions left">
        <button type="submit" class="btn primary" id="v-gerar">${icon('layers', { size: 18 })}Criar e baixar script</button>
      </div>
    </form>`;
}

function ler(form) {
  const ganchos = listaArquivos(form.querySelector('#v-ganchos').value);
  const corpos = listaArquivos(form.querySelector('#v-corpos').value);
  const ctas = listaArquivos(form.querySelector('#v-ctas').value);
  const formatos = marcados(form, 'vformatos');
  const combos = ganchos.length && corpos.length ? combinar(ganchos, corpos, ctas) : [];
  return { ganchos, corpos, ctas, formatos, combos };
}

function tituloCombo(prefixo, k) {
  return [prefixo, [k.gancho, k.corpo, k.cta].filter(Boolean).map(rotuloArquivo).join(' + ')].filter(Boolean).join(' · ').slice(0, 160);
}

export function mount(root) {
  const form = root.querySelector('#form-var');
  const previa = root.querySelector('#previa');
  const botao = root.querySelector('#v-gerar');

  const atualizar = () => {
    const { combos, formatos } = ler(form);
    const base = criativo(form.base.value);
    const prefixo = base?.titulo || form.angulo.value.trim() || 'Variação';
    if (!combos.length) {
      previa.innerHTML = '<p class="muted">Liste pelo menos um gancho e um corpo para ver as combinações.</p>';
      botao.disabled = true;
      return;
    }
    const videos = combos.length * Math.max(1, formatos.length);
    botao.disabled = combos.length > LIMITE || !formatos.length;
    previa.innerHTML = `
      <p class="previa-total"><strong>${plural(combos.length, 'combinação', 'combinações')}</strong> × ${plural(formatos.length, 'formato', 'formatos')} = <strong>${plural(videos, 'vídeo', 'vídeos')}</strong></p>
      ${combos.length > LIMITE ? `<p class="callout alert">Máximo de ${LIMITE} combinações por vez. Divida em lotes.</p>` : ''}
      ${!formatos.length ? '<p class="callout alert">Marque pelo menos um formato.</p>' : ''}
      <ol class="previa-lista">${combos.slice(0, 12).map((k) => `<li>${esc(tituloCombo(prefixo, k))}</li>`).join('')}
        ${combos.length > 12 ? `<li class="muted">e mais ${combos.length - 12}…</li>` : ''}</ol>`;
  };
  form.addEventListener('input', atualizar);
  form.addEventListener('change', atualizar);

  // Base escolhida: puxa campanha, ângulo e responsável dela.
  form.base.addEventListener('change', () => {
    const b = criativo(form.base.value);
    if (!b) return;
    form.campanha_id.value = b.campanha_id || '';
    form.angulo.value = b.angulo || '';
    if (b.responsavel) form.responsavel.value = b.responsavel;
  });

  // "Escolher arquivos": o navegador só entrega o nome, que é o que basta (a pasta vem do campo acima).
  root.querySelectorAll('input[type=file][data-para]').forEach((inp) => inp.addEventListener('change', () => {
    const ta = root.querySelector(`#${inp.dataset.para}`);
    const nomes = [...inp.files].map((f) => f.name);
    ta.value = listaArquivos(`${ta.value}\n${nomes.join('\n')}`).join('\n');
    inp.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { combos, formatos } = ler(form);
    const pasta = form.pasta.value.trim();
    const saida = form.saida.value.trim();
    const ajuste = form.ajuste.value;
    const audio = form.audio.checked;
    if (!combos.length || !formatos.length || combos.length > LIMITE) return;
    if (!pasta && combos.some((k) => [k.gancho, k.corpo, k.cta].some((f) => f && !/^[A-Za-z]:[\\/]|^\\\\/.test(f)))) {
      toast('Informe a pasta dos clipes (ou use caminhos completos).', { tone: 'alert' });
      form.pasta.focus();
      return;
    }
    try { [pasta, saida, ...combos.flatMap((k) => [k.gancho, k.corpo, k.cta].filter(Boolean))].forEach(escBat); } catch (err) {
      toast(esc(err.message), { tone: 'alert' });
      return;
    }
    const base = criativo(form.base.value);
    const prefixo = base?.titulo || form.angulo.value.trim() || 'Variação';
    const linhas = combos.map((k) => ({
      titulo: tituloCombo(prefixo, k),
      campanha_id: form.campanha_id.value || null,
      parent_id: base?.id || null,
      angulo: form.angulo.value.trim(),
      etapa: 'edicao',
      responsavel: form.responsavel.value || null,
      ferramenta: base?.ferramenta || 'capcut',
      formatos,
      roteiro: base?.roteiro || [],
      tags: [...new Set([...(base?.tags || []), 'variação'])],
      montagem: { pasta, saida, clipes: [k.gancho, k.corpo, k.cta].filter(Boolean), ajuste, audio },
    }));
    // Ao criar, a tela é redesenhada (formulário limpo). Se falhar, não há redesenho e o que foi digitado fica.
    limparRascunho(form);
    const novos = await enquanto(e.submitter, async () => {
      const criados = await criarCriativos(linhas);
      if (pasta && pasta !== state.ajustes.pasta_clipes) salvarAjustes({ pasta_clipes: pasta }).catch(() => {});
      return criados;
    });
    if (!novos) return;
    const itens = novos.sort((a, b) => a.numero - b.numero).flatMap((c) => formatos.map((f) => ({
      nome: nomeArquivo(nomeDe(c), f), formato: f, clipes: c.montagem.clipes,
    })));
    const camp = campanha(form.campanha_id.value);
    const faixa = `${codigo(novos[0].numero)}-${codigo(novos[novos.length - 1].numero)}`;
    downloadFile(`render_${camp ? `${camp.sigla}_` : ''}${faixa}.bat`, gerarBat(itens, { pasta, saida, ajuste, audio }), 'application/x-bat');
    toast(`${plural(novos.length, 'criativo criado', 'criativos criados')} (${faixa}) em Edição. Rode o .bat baixado para renderizar.`, {
      timeout: 9000, action: { label: 'Ver no quadro', run: () => { location.hash = '#/quadro?etapa=edicao'; } },
    });
  });

  atualizar();
}

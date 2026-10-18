// Página do criativo: dados, nome padrão do anúncio, vídeo (lê o arquivo exportado), roteiro → legenda .srt,
// checklist de revisão, resultados, variações e comentários da equipe.
import {
  state, criativo, campanha, nomeDe, nomeMembro, metricasDe, thumbUrl, ehAdmin,
  atualizarCriativo, excluirCriativo, criarCriativos, definirThumb, adicionarMetrica, excluirMetrica,
  listarComentarios, comentar, apagarComentario,
} from '../store.js';
import {
  ETAPA, FORMATOS, CHECKLIST, TIPOS_BLOCO, codigo, nomeArquivo, cronometrar, estimarSegundos,
  gerarSRT, gerarTextoLocucao, somarMetricas, indicadores, gerarBat,
} from '../domain.js';
import {
  esc, fmtBRL, fmtNum, fmtPct, fmtX, fmtDuracao, fmtDate, fmtDateTime, parseMoney, parseDecimal,
  todayISO, addDays, copiar, plural,
} from '../utils.js';
import {
  toast, enquanto, confirmDialog, downloadFile, emptyState, campanhaTag, thumbBox, etapaBadge, avatar, limparRascunho,
} from '../ui.js';
import { icon } from '../icons.js';
import { opcoesCampanha, opcoesMembro, opcoesEtapa, opcoesFerramenta, opcoesVeredito, checksFormatos, marcados } from './campos.js';
import { itemCriativo } from './painel.js';
import { lerVideo, formatoDe } from '../video.js';
import { sugerirRoteiro, revisarVideo } from './ia.js';

let blocos = []; // roteiro em edição (só vira dado ao salvar)
let rascunhoRoteiro = null; // { id, blocos }: edição não salva, sobrevive a redesenhos da página

// ---------- Pedaços ----------

function linhaBloco(b, i, crono) {
  const est = estimarSegundos(b.texto);
  return `<li class="bloco bloco-${esc(b.tipo)}" data-i="${i}">
    <div class="bloco-head">
      <label><span class="sr-only">Tipo do bloco ${i + 1}</span>
        <select class="compact" data-campo="tipo">${Object.entries(TIPOS_BLOCO).map(([k, v]) => `<option value="${k}" ${k === b.tipo ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <span class="bloco-tempo">${fmtDuracao(crono.inicio)}–${fmtDuracao(crono.fim)}</span>
      <label class="bloco-seg"><span class="sr-only">Segundos do bloco ${i + 1}</span>
        <input type="text" inputmode="decimal" data-campo="segundos" value="${b.segundos ? esc(String(b.segundos).replace('.', ',')) : ''}" placeholder="~${String(est).replace('.', ',')}" aria-describedby="seg-hint"><span aria-hidden="true">s</span></label>
      <button type="button" class="icon-btn small" data-remover="${i}" aria-label="Remover bloco ${i + 1}">${icon('trash', { size: 18 })}</button>
    </div>
    <label><span class="sr-only">Texto do bloco ${i + 1}</span>
      <textarea rows="3" data-campo="texto" placeholder="O que é falado/escrito na tela neste trecho">${esc(b.texto)}</textarea></label>
  </li>`;
}

function listaBlocos() {
  const crono = cronometrar(blocos);
  return blocos.map((b, i) => linhaBloco(b, i, crono[i])).join('');
}

const duracaoRoteiro = () => { const c = cronometrar(blocos); return c.length ? c[c.length - 1].fim : 0; };

function blocoResultados(c) {
  const linhas = metricasDe(c.id).sort((a, b) => b.inicio.localeCompare(a.inicio));
  const t = somarMetricas(linhas);
  const i = indicadores(t);
  const ontem = addDays(todayISO(), -1);
  return `
    <section class="block" aria-labelledby="h-res">
      <div class="block-head"><h2 id="h-res">Resultados</h2><a class="link" href="#/resultados">Importar CSV</a></div>
      ${linhas.length ? `
        <dl class="metricas-grid">
          <div><dt>Investido</dt><dd>${fmtBRL(t.gasto_cents)}</dd></div>
          <div><dt>Resultados</dt><dd>${fmtNum(t.resultados)}</dd></div>
          <div><dt>Custo por resultado</dt><dd>${fmtBRL(i.cpa)}</dd></div>
          <div><dt>Retorno (ROAS)</dt><dd>${fmtX(i.roas)}</dd></div>
          <div><dt>CTR (link)</dt><dd>${fmtPct(i.ctr)}</dd></div>
          <div><dt>CPM</dt><dd>${fmtBRL(i.cpm)}</dd></div>
          <div><dt title="Reproduções de 3 s ÷ impressões">Taxa de gancho</dt><dd>${fmtPct(i.gancho)}</dd></div>
          <div><dt title="ThruPlays ÷ reproduções de 3 s">Retenção</dt><dd>${fmtPct(i.retencao)}</dd></div>
        </dl>
        <details class="detalhes">
          <summary>${plural(linhas.length, 'registro', 'registros')}</summary>
          <div class="table-wrap"><table class="tabela compacta">
            <thead><tr><th>Período</th><th class="num">Investido</th><th class="num">Impressões</th><th class="num">Resultados</th><th>Origem</th><th><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>${linhas.map((l) => `<tr>
              <td>${l.inicio === l.fim ? fmtDate(l.inicio) : `${fmtDate(l.inicio)} a ${fmtDate(l.fim)}`}</td>
              <td class="num">${fmtBRL(l.gasto_cents)}</td><td class="num">${fmtNum(l.impressoes)}</td><td class="num">${fmtNum(l.resultados)}</td>
              <td>${l.fonte === 'csv' ? 'CSV' : 'Manual'}</td>
              <td><button type="button" class="icon-btn small" data-apagar-metrica="${l.id}" aria-label="Apagar registro">${icon('trash', { size: 16 })}</button></td>
            </tr>`).join('')}</tbody>
          </table></div>
        </details>` : '<p class="muted">Sem números ainda. Importe o CSV do Gerenciador de Anúncios ou lance à mão.</p>'}
      <details class="detalhes">
        <summary>Lançar à mão</summary>
        <form id="form-metrica" class="form-metrica" novalidate>
          <div class="grid-2">
            <label class="field" for="m-ini"><span class="field-label">De</span><input id="m-ini" name="inicio" type="date" value="${ontem}" required></label>
            <label class="field" for="m-fim"><span class="field-label">Até</span><input id="m-fim" name="fim" type="date" value="${ontem}" required></label>
            <label class="field" for="m-gasto"><span class="field-label">Valor usado (R$)</span><input id="m-gasto" name="gasto" inputmode="decimal" placeholder="0,00" required></label>
            <label class="field" for="m-imp"><span class="field-label">Impressões</span><input id="m-imp" name="impressoes" inputmode="numeric"></label>
            <label class="field" for="m-cli"><span class="field-label">Cliques no link</span><input id="m-cli" name="cliques" inputmode="numeric"></label>
            <label class="field" for="m-v3"><span class="field-label">Reproduções de 3 s</span><input id="m-v3" name="views_3s" inputmode="numeric"></label>
            <label class="field" for="m-tp"><span class="field-label">ThruPlays</span><input id="m-tp" name="thruplays" inputmode="numeric"></label>
            <label class="field" for="m-res"><span class="field-label">Resultados</span><input id="m-res" name="resultados" inputmode="decimal"></label>
            <label class="field" for="m-rec"><span class="field-label">Valor de conversão (R$)</span><input id="m-rec" name="receita" inputmode="decimal" placeholder="0,00"></label>
          </div>
          <div class="actions left"><button type="submit" class="btn ghost small">Adicionar</button></div>
        </form>
      </details>
    </section>`;
}

function blocoVariacoes(c) {
  const pai = c.parent_id ? criativo(c.parent_id) : null;
  const filhos = state.criativos.filter((x) => x.parent_id === c.id);
  return `
    <section class="block" aria-labelledby="h-var">
      <div class="block-head"><h2 id="h-var">Variações</h2>
        <a class="btn ghost small" href="#/variacoes?base=${c.id}">${icon('layers', { size: 18 })}Gerar variações</a></div>
      ${pai ? `<p class="small muted">Variação de</p><ul class="lista-criativos">${itemCriativo(pai)}</ul>` : ''}
      ${filhos.length ? `<p class="small muted">${plural(filhos.length, 'variação', 'variações')} deste criativo</p><ul class="lista-criativos">${filhos.map((f) => itemCriativo(f)).join('')}</ul>` : ''}
      ${!pai && !filhos.length ? '<p class="muted">Combine ganchos, corpos e CTAs para testar mais versões deste vídeo.</p>' : ''}
      ${c.montagem ? `<div class="montagem"><p class="small"><strong>Montado de:</strong> ${c.montagem.clipes.map(esc).join(' + ')}</p>
        <button type="button" class="btn ghost small" data-baixar-bat>${icon('terminal', { size: 18 })}Baixar script de render (.bat)</button></div>` : ''}
    </section>`;
}

function formDados(c) {
  return `
    <section class="block" aria-labelledby="h-dados">
      <div class="block-head"><h2 id="h-dados">Dados</h2></div>
      <form id="form-dados" novalidate>
        <label class="field" for="d-titulo"><span class="field-label">Título</span><input id="d-titulo" name="titulo" maxlength="160" required value="${esc(c.titulo)}"></label>
        <label class="field" for="d-camp"><span class="field-label">Campanha</span><select id="d-camp" name="campanha_id">${opcoesCampanha(c.campanha_id || '')}</select></label>
        <label class="field" for="d-ang"><span class="field-label">Ângulo</span><input id="d-ang" name="angulo" maxlength="80" value="${esc(c.angulo)}"></label>
        <div class="grid-2">
          <label class="field" for="d-resp"><span class="field-label">Responsável</span><select id="d-resp" name="responsavel">${opcoesMembro(c.responsavel || '')}</select></label>
          <label class="field" for="d-prazo"><span class="field-label">Prazo</span><input id="d-prazo" name="prazo" type="date" value="${esc(c.prazo || '')}"></label>
        </div>
        <label class="field" for="d-ferr"><span class="field-label">Editado no</span><select id="d-ferr" name="ferramenta">${opcoesFerramenta(c.ferramenta)}</select></label>
        ${checksFormatos(c.formatos || [])}
        <label class="field" for="d-arq"><span class="field-label">Link do vídeo final <small>(Drive, Dropbox…)</small></span><input id="d-arq" name="link_arquivo" type="url" value="${esc(c.link_arquivo)}" placeholder="https://"></label>
        <label class="field" for="d-proj"><span class="field-label">Projeto de edição <small>(link ou caminho do .prproj / pasta do CapCut)</small></span><input id="d-proj" name="link_projeto" value="${esc(c.link_projeto)}"></label>
        <label class="field" for="d-tags"><span class="field-label">Etiquetas <small>(separe por vírgula)</small></span><input id="d-tags" name="tags" value="${esc((c.tags || []).join(', '))}" placeholder="ugc, narração, trend"></label>
        <label class="field" for="d-notas"><span class="field-label">Notas</span><textarea id="d-notas" name="notas" rows="4" maxlength="8000">${esc(c.notas)}</textarea></label>
        <div class="actions left"><button type="submit" class="btn primary">Salvar dados</button></div>
      </form>
    </section>`;
}

function blocoChecklist(c) {
  const feitos = CHECKLIST.filter((i) => c.checklist?.[i.id]).length;
  return `
    <section class="block" aria-labelledby="h-check">
      <div class="block-head"><h2 id="h-check">Checklist de revisão</h2><span class="muted small" id="check-n">${feitos}/${CHECKLIST.length}</span></div>
      <div id="checklist" data-nao-suja>
        ${CHECKLIST.map((i) => `<label class="check"><input type="checkbox" id="chk-${i.id}" value="${i.id}" ${c.checklist?.[i.id] ? 'checked' : ''}><span>${esc(i.label)}</span></label>`).join('')}
      </div>
    </section>`;
}

function blocoComentarios() {
  return `
    <section class="block" aria-labelledby="h-com">
      <div class="block-head"><h2 id="h-com">Comentários</h2></div>
      <ul class="comentarios" id="comentarios" aria-live="polite"><li class="muted small">Carregando…</li></ul>
      <form id="form-comentario" class="form-comentario" novalidate>
        <label class="sr-only" for="com-texto">Novo comentário</label>
        <textarea id="com-texto" name="texto" rows="2" maxlength="4000" placeholder="Ajuste pedido, ideia, aprovação…"></textarea>
        <button type="submit" class="btn ghost small">${icon('message', { size: 18 })}Comentar</button>
      </form>
    </section>`;
}

// ---------- Página ----------

export function render({ sub }) {
  const c = criativo(sub);
  if (!c) {
    return emptyState({ title: 'Criativo não encontrado', text: 'Ele pode ter sido excluído por alguém da equipe.', action: '<a class="btn ghost" href="#/quadro">Voltar ao quadro</a>' });
  }
  if (rascunhoRoteiro?.id === c.id) blocos = rascunhoRoteiro.blocos;
  else {
    blocos = structuredClone(c.roteiro || []);
    if (!blocos.length) blocos = [{ tipo: 'gancho', texto: '' }, { tipo: 'corpo', texto: '' }, { tipo: 'cta', texto: '' }];
  }
  const nome = nomeDe(c);
  const formatos = c.formatos?.length ? c.formatos : ['9x16'];
  const url = thumbUrl(c);
  return `
    <a class="voltar" href="#/quadro">${icon('back', { size: 18 })}Quadro</a>
    <header class="page-head criativo-head">
      <div>
        <p class="page-kicker"><span class="codigo">${codigo(c.numero)}</span>${campanhaTag(campanha(c.campanha_id))}${etapaBadge(c.etapa)}</p>
        <h1 class="page-title">${esc(c.titulo)}</h1>
        <p class="page-sub">Criado por ${esc(nomeMembro(c.criado_por))} em ${fmtDate(c.criado_em)}${c.responsavel ? ` · com ${esc(nomeMembro(c.responsavel))}` : ''}</p>
      </div>
      <div class="head-actions">
        <button type="button" class="btn ghost small" data-duplicar>${icon('copy', { size: 18 })}Duplicar</button>
        <button type="button" class="icon-btn" data-excluir aria-label="Excluir criativo">${icon('trash')}</button>
      </div>
    </header>

    <div class="barra-etapa" data-nao-suja>
      <label class="field inline-field" for="c-etapa"><span class="field-label">Etapa</span><select id="c-etapa">${opcoesEtapa(c.etapa)}</select></label>
      <label class="field inline-field" for="c-veredito"><span class="field-label">Veredito</span><select id="c-veredito">${opcoesVeredito(c.veredito || '')}</select></label>
    </div>

    <div class="detalhe">
      <div class="detalhe-principal">
        <section class="block" aria-labelledby="h-nome">
          <div class="block-head"><h2 id="h-nome">Nome do anúncio</h2><a class="link small" href="#/ajustes">Modelo</a></div>
          <div class="copiavel"><code id="nome-anuncio">${esc(nome)}</code>
            <button type="button" class="btn ghost small" data-copiar="${esc(nome)}">${icon('copy', { size: 18 })}Copiar</button></div>
          <p class="field-hint">Use este nome no anúncio do Meta: é pelo código ${codigo(c.numero)} que os resultados do CSV voltam para cá.</p>
          <p class="sub-title">Arquivos de exportação</p>
          <ul class="arquivos">${formatos.map((f) => {
            const n = `${nomeArquivo(nome, f)}.mp4`;
            return `<li><span class="formato-tag">${FORMATOS[f]?.label || f}</span><code>${esc(n)}</code><button type="button" class="icon-btn small" data-copiar="${esc(n.replace(/\.mp4$/, ''))}" aria-label="Copiar nome do arquivo ${FORMATOS[f]?.label || f}">${icon('copy', { size: 16 })}</button></li>`;
          }).join('')}</ul>
        </section>

        <section class="block" aria-labelledby="h-video">
          <div class="block-head"><h2 id="h-video">Vídeo</h2></div>
          <div class="video-box">
            ${thumbBox(url, { classe: 'grande' })}
            <div class="video-info">
              <dl class="dl-linha">
                <div><dt>Duração</dt><dd>${fmtDuracao(c.duracao_s)}</dd></div>
                <div><dt>Editado no</dt><dd>${esc({ capcut: 'CapCut', premiere: 'Premiere', outra: 'Outra' }[c.ferramenta] || '—')}</dd></div>
              </dl>
              <div class="links-video">
                ${c.link_arquivo ? `<a class="btn ghost small" href="${esc(c.link_arquivo)}" target="_blank" rel="noopener noreferrer">${icon('external', { size: 18 })}Vídeo final</a>` : ''}
                ${c.link_projeto ? (/^https?:/i.test(c.link_projeto)
                  ? `<a class="btn ghost small" href="${esc(c.link_projeto)}" target="_blank" rel="noopener noreferrer">${icon('external', { size: 18 })}Projeto</a>`
                  : `<button type="button" class="btn ghost small" data-copiar="${esc(c.link_projeto)}">${icon('copy', { size: 18 })}Copiar caminho do projeto</button>`) : ''}
              </div>
              <div class="links-video">
                <label class="btn primary small file-btn">${icon('upload', { size: 18 })}Ler vídeo exportado
                  <input type="file" accept="video/*" id="arquivo-video" class="sr-only" data-nao-suja></label>
                <label class="btn ghost small file-btn">${icon('eye', { size: 18 })}Revisar com IA
                  <input type="file" accept="video/*" id="arquivo-revisao" class="sr-only" data-nao-suja></label>
              </div>
              <p class="field-hint">“Ler” só pega a duração, o formato e a miniatura; nada é enviado. “Revisar com IA” envia 8 quadros (imagens) do vídeo para a IA avaliar o checklist.</p>
            </div>
          </div>
        </section>

        <section class="block" aria-labelledby="h-rot">
          <div class="block-head"><h2 id="h-rot">Roteiro</h2><span class="muted small" id="rot-total">${fmtDuracao(duracaoRoteiro())}</span></div>
          <ol class="blocos" id="blocos">${listaBlocos()}</ol>
          <p class="field-hint" id="seg-hint">Sem segundos informados, o tempo é estimado pela fala (~2,6 palavras por segundo).</p>
          <div class="actions left">
            <button type="button" class="btn ghost small" data-add-bloco="gancho">${icon('plus', { size: 18 })}Gancho</button>
            <button type="button" class="btn ghost small" data-add-bloco="corpo">${icon('plus', { size: 18 })}Corpo</button>
            <button type="button" class="btn ghost small" data-add-bloco="cta">${icon('plus', { size: 18 })}CTA</button>
            <button type="button" class="btn ghost small" data-ia-roteiro>${icon('bulb', { size: 18 })}Sugerir com IA</button>
          </div>
          <div class="actions left">
            <button type="button" class="btn primary small" data-salvar-roteiro>Salvar roteiro</button>
            <button type="button" class="btn ghost small" data-srt>${icon('caption', { size: 18 })}Legenda .srt</button>
            <button type="button" class="btn ghost small" data-locucao>${icon('script', { size: 18 })}Texto de locução</button>
          </div>
          <p class="field-hint">A legenda abre no CapCut (Texto → Legendas → Importar) e no Premiere (Arquivo → Importar).</p>
        </section>

        ${blocoResultados(c)}
        ${blocoVariacoes(c)}
      </div>

      <aside class="detalhe-lateral">
        ${formDados(c)}
        ${blocoChecklist(c)}
        ${blocoComentarios()}
      </aside>
    </div>`;
}

// ---------- Comentários ----------

export async function recarregarComentarios(root) {
  const ul = root.querySelector('#comentarios');
  const id = root.querySelector('[data-criativo]')?.dataset.criativo;
  if (!ul || !id) return;
  try {
    const lista = await listarComentarios(id);
    const eu = state.membro.email;
    ul.innerHTML = lista.length ? lista.map((m) => `<li class="comentario">
      ${avatar(nomeMembro(m.autor))}
      <div><p class="comentario-meta"><strong>${esc(nomeMembro(m.autor))}</strong> · ${fmtDateTime(m.criado_em)}
        ${m.autor === eu || ehAdmin() ? `<button type="button" class="btn link small" data-apagar-com="${m.id}">Apagar</button>` : ''}</p>
      <p class="comentario-texto">${esc(m.texto)}</p></div></li>`).join('')
      : '<li class="muted small">Nenhum comentário ainda.</li>';
  } catch (err) {
    ul.innerHTML = `<li class="muted small">Não foi possível carregar os comentários (${esc(err.message)}).</li>`;
  }
}

// ---------- Eventos ----------

export function mount(root, { sub, rerender }) {
  const c = criativo(sub);
  if (!c) return;
  root.firstElementChild.dataset.criativo = c.id;
  const listaEl = root.querySelector('#blocos');
  const totalEl = root.querySelector('#rot-total');
  const marcarRoteiro = () => { rascunhoRoteiro = { id: c.id, blocos }; };
  const redesenharBlocos = () => { marcarRoteiro(); listaEl.innerHTML = listaBlocos(); totalEl.textContent = fmtDuracao(duracaoRoteiro()); };
  recarregarComentarios(root);

  // Roteiro: edição local; o tempo é recalculado sem redesenhar o texto (não perde o cursor).
  listaEl.addEventListener('input', (e) => {
    const li = e.target.closest('[data-i]');
    const campo = e.target.dataset.campo;
    if (!li || !campo) return;
    const b = blocos[Number(li.dataset.i)];
    marcarRoteiro();
    b[campo] = campo === 'segundos' ? (parseDecimal(e.target.value) > 0 ? parseDecimal(e.target.value) : null) : e.target.value;
    const crono = cronometrar(blocos);
    listaEl.querySelectorAll('[data-i]').forEach((el) => {
      const k = crono[Number(el.dataset.i)];
      el.querySelector('.bloco-tempo').textContent = `${fmtDuracao(k.inicio)}–${fmtDuracao(k.fim)}`;
      el.querySelector('[data-campo="segundos"]').placeholder = `~${String(estimarSegundos(blocos[Number(el.dataset.i)].texto)).replace('.', ',')}`;
    });
    totalEl.textContent = fmtDuracao(duracaoRoteiro());
  });
  listaEl.addEventListener('change', (e) => {
    if (e.target.dataset.campo !== 'tipo') return;
    marcarRoteiro();
    blocos[Number(e.target.closest('[data-i]').dataset.i)].tipo = e.target.value;
    e.target.closest('.bloco').className = `bloco bloco-${e.target.value}`;
  });

  const nomeBase = () => nomeDe(criativo(c.id) || c);

  root.addEventListener('click', async (e) => {
    const alvo = e.target.closest('button, [data-copiar]');
    if (!alvo) return;
    const d = alvo.dataset;

    if (d.copiar != null) { if (await copiar(d.copiar)) toast('Copiado.', { timeout: 1800 }); return; }
    if (d.addBloco) { blocos.push({ tipo: d.addBloco, texto: '' }); redesenharBlocos(); listaEl.lastElementChild?.querySelector('textarea')?.focus(); return; }
    if (d.remover != null) { blocos.splice(Number(d.remover), 1); redesenharBlocos(); return; }
    if ('salvarRoteiro' in d) {
      const roteiro = blocos.filter((b) => String(b.texto || '').trim()).map((b) => ({ tipo: b.tipo, texto: b.texto.trim(), ...(b.segundos ? { segundos: b.segundos } : {}) }));
      const salvar = rascunhoRoteiro;
      rascunhoRoteiro = null; // o redesenho que vem com o salvamento já carrega o roteiro gravado
      if (await enquanto(alvo, () => atualizarCriativo(c.id, { roteiro }))) toast('Roteiro salvo.');
      else rascunhoRoteiro = salvar;
      return;
    }
    if ('srt' in d) {
      const srt = gerarSRT(blocos);
      if (!srt) { toast('Escreva o roteiro antes de gerar a legenda.', { tone: 'alert' }); return; }
      downloadFile(`${nomeBase()}.srt`, `﻿${srt.replace(/\n/g, '\r\n')}`, 'application/x-subrip;charset=utf-8');
      return;
    }
    if ('locucao' in d) {
      const txt = gerarTextoLocucao(blocos, `${codigo(c.numero)} · ${c.titulo}`);
      downloadFile(`${nomeBase()}_locucao.txt`, `﻿${txt.replace(/\n/g, '\r\n')}`, 'text/plain;charset=utf-8');
      return;
    }
    if ('baixarBat' in d) {
      const atual = criativo(c.id);
      const m = atual.montagem;
      const itens = (atual.formatos?.length ? atual.formatos : ['9x16']).map((f) => ({ nome: nomeArquivo(nomeBase(), f), formato: f, clipes: m.clipes }));
      try {
        downloadFile(`render_${codigo(atual.numero)}.bat`, gerarBat(itens, { pasta: m.pasta, saida: m.saida, ajuste: m.ajuste, audio: m.audio }), 'application/x-bat');
      } catch (err) { toast(esc(err.message), { tone: 'alert' }); }
      return;
    }
    if ('apagarMetrica' in d) {
      if (await confirmDialog({ title: 'Apagar registro?', text: 'Os números desse período saem do criativo.', confirmLabel: 'Apagar', danger: true })) {
        await enquanto(null, () => excluirMetrica(d.apagarMetrica));
      }
      return;
    }
    if ('apagarCom' in d) {
      if (await enquanto(alvo, async () => { await apagarComentario(d.apagarCom); return true; })) recarregarComentarios(root);
      return;
    }
    if ('duplicar' in d) {
      const atual = criativo(c.id);
      const novos = await enquanto(alvo, () => criarCriativos({
        titulo: `${atual.titulo} (variação)`.slice(0, 160), campanha_id: atual.campanha_id, parent_id: atual.id, etapa: 'roteiro',
        angulo: atual.angulo, formatos: atual.formatos, ferramenta: atual.ferramenta, responsavel: atual.responsavel,
        roteiro: atual.roteiro, tags: atual.tags, notas: atual.notas,
      }));
      if (novos) { toast(`Criada a variação ${codigo(novos[0].numero)}.`); location.hash = `#/criativo/${novos[0].id}`; }
      return;
    }
    if ('iaRoteiro' in d) {
      // As sugestões viram rascunho do roteiro e a página é redesenhada a partir dele (vale mesmo se a
      // página foi redesenhada enquanto a IA escrevia).
      sugerirRoteiro(criativo(c.id) || c, {
        blocosAtuais: blocos,
        aoUsarRoteiro: (novos) => { rascunhoRoteiro = { id: c.id, blocos: novos }; rerender(); },
        aoUsarGancho: (texto) => {
          const base = rascunhoRoteiro?.id === c.id ? rascunhoRoteiro.blocos : blocos;
          const lista = base.map((b) => ({ ...b }));
          const i = lista.findIndex((b) => b.tipo === 'gancho');
          if (i > -1) lista[i] = { ...lista[i], texto, segundos: null }; else lista.unshift({ tipo: 'gancho', texto });
          rascunhoRoteiro = { id: c.id, blocos: lista };
          rerender();
        },
      });
      return;
    }
    if ('excluir' in d) {
      const ok = await confirmDialog({
        title: `Excluir ${codigo(c.numero)}?`,
        text: `“${esc(c.titulo)}” sai do quadro junto com os resultados e comentários. Não dá para desfazer.`,
        confirmLabel: 'Excluir', danger: true,
      });
      if (ok && await enquanto(alvo, async () => { await excluirCriativo(c.id); return true; })) {
        toast(`${codigo(c.numero)} excluído.`);
        location.hash = '#/quadro';
      }
    }
  });

  // Etapa e veredito: gravam na hora.
  root.querySelector('#c-etapa').addEventListener('change', async (e) => {
    const patch = { etapa: e.target.value };
    if (e.target.value === 'no_ar' && !criativo(c.id).veredito) patch.veredito = 'teste';
    if (await enquanto(e.target, () => atualizarCriativo(c.id, patch))) toast(`Etapa: ${ETAPA[e.target.value].label}.`, { timeout: 2000 });
  });
  root.querySelector('#c-veredito').addEventListener('change', async (e) => {
    await enquanto(e.target, () => atualizarCriativo(c.id, { veredito: e.target.value || null }));
  });

  // Checklist: grava cada marcação.
  root.querySelector('#checklist').addEventListener('change', async (e) => {
    const checklist = { ...(criativo(c.id).checklist || {}), [e.target.value]: e.target.checked };
    const ok = await enquanto(null, () => atualizarCriativo(c.id, { checklist }));
    if (!ok) e.target.checked = !e.target.checked;
  });

  // Vídeo exportado: duração, formato e miniatura.
  root.querySelector('#arquivo-video').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const aviso = toast('Lendo o vídeo…', { timeout: 0 });
    try {
      const info = await lerVideo(file);
      const atual = criativo(c.id);
      const f = formatoDe(info.w, info.h);
      const patch = { duracao_s: Math.round(info.dur * 100) / 100 };
      if (f && !(atual.formatos || []).includes(f)) patch.formatos = [...(atual.formatos || []), f];
      if (info.blob) await definirThumb(c.id, info.blob);
      await atualizarCriativo(c.id, patch);
      const avisos = [];
      if (!f) avisos.push(`proporção ${info.w}×${info.h} fora dos formatos do Meta`);
      else if (Math.min(info.w, info.h) < 1080) avisos.push(`resolução ${info.w}×${info.h}: exporte em 1080p`);
      toast(`Vídeo lido: ${fmtDuracao(info.dur)}${f ? `, ${FORMATOS[f].label}` : ''}.${avisos.length ? ` Atenção: ${avisos.join('; ')}.` : ''}`, { tone: avisos.length ? 'alert' : 'info', timeout: 7000 });
    } catch (err) {
      toast(esc(err.message), { tone: 'alert', timeout: 7000 });
    } finally {
      aviso.remove();
    }
  });

  // Revisão com IA: quadros do vídeo + roteiro → checklist sugerido.
  root.querySelector('#arquivo-revisao').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    revisarVideo(criativo(c.id) || c, file, {
      blocosAtuais: rascunhoRoteiro?.id === c.id ? rascunhoRoteiro.blocos : blocos,
      aoComentar: () => recarregarComentarios(document.getElementById('main')),
    });
  });

  // Dados.
  root.querySelector('#form-dados').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const titulo = f.titulo.value.trim();
    if (!titulo) { toast('O título não pode ficar vazio.', { tone: 'alert' }); f.titulo.focus(); return; }
    const link = f.link_arquivo.value.trim();
    if (link && !/^https?:\/\//i.test(link)) { toast('O link do vídeo precisa começar com https://', { tone: 'alert' }); f.link_arquivo.focus(); return; }
    const formatos = marcados(f, 'formatos');
    const ok = await enquanto(e.submitter, () => atualizarCriativo(c.id, {
      titulo, campanha_id: f.campanha_id.value || null, angulo: f.angulo.value.trim(), responsavel: f.responsavel.value || null,
      prazo: f.prazo.value || null, ferramenta: f.ferramenta.value, formatos: formatos.length ? formatos : ['9x16'],
      link_arquivo: link, link_projeto: f.link_projeto.value.trim(),
      tags: [...new Set(f.tags.value.split(',').map((t) => t.trim()).filter(Boolean))], notas: f.notas.value,
    }));
    if (ok) { limparRascunho(f); toast('Dados salvos.'); }
  });

  // Métrica manual.
  root.querySelector('#form-metrica').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const gasto = parseMoney(f.gasto.value);
    if (!f.inicio.value || !f.fim.value || f.fim.value < f.inicio.value) { toast('Confira o período.', { tone: 'alert' }); return; }
    if (!Number.isFinite(gasto) || gasto < 0) { toast('Informe o valor usado.', { tone: 'alert' }); f.gasto.focus(); return; }
    const num = (v) => { const n = parseDecimal(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null; };
    const res = parseDecimal(f.resultados.value);
    const rec = parseMoney(f.receita.value);
    limparRascunho(f); // se falhar, o formulário continua preenchido (não há redesenho)
    await enquanto(e.submitter, () => adicionarMetrica({
      criativo_id: c.id, inicio: f.inicio.value, fim: f.fim.value, gasto_cents: gasto,
      impressoes: num(f.impressoes.value), cliques: num(f.cliques.value), views_3s: num(f.views_3s.value), thruplays: num(f.thruplays.value),
      resultados: Number.isFinite(res) && res >= 0 ? res : null, receita_cents: Number.isFinite(rec) && rec >= 0 ? rec : null,
    }));
  });

  // Comentário.
  root.querySelector('#form-comentario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = e.target.texto.value.trim();
    if (!texto) return;
    const ok = await enquanto(e.submitter, () => comentar(c.id, texto));
    if (ok) { e.target.texto.value = ''; limparRascunho(e.target); recarregarComentarios(root); }
  });
}

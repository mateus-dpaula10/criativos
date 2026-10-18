// Ajustes: conta e tema, modelo do nome dos anúncios, campanhas e equipe (só admin mexe na equipe).
import {
  state, ehAdmin, salvarAjustes, salvarCampanha, excluirCampanha, salvarMembro, removerMembro, carregarTudo,
} from '../store.js';
import { api, MODO_LOCAL } from '../api.js';
import { VARIAVEIS_MODELO, MODELO_PADRAO, nomeAnuncio, custoIA } from '../domain.js';
import { esc, plural, fmtNum } from '../utils.js';
import { toast, enquanto, confirmDialog, openDialog, sheetHeader, limparRascunho } from '../ui.js';
import { icon } from '../icons.js';
import { aplicarTema, lerTema } from '../tema.js';
import { iniciarTour } from '../tour.js';

const PAPEIS = { admin: 'Admin', editor: 'Edição', trafego: 'Tráfego' };

function previaNome(modelo) {
  const exemplo = state.criativos[0] || { numero: 42, angulo: 'Dor', titulo: 'Exemplo', formatos: ['9x16'] };
  const camp = state.campanhas.find((c) => c.id === exemplo.campanha_id) || state.campanhas[0];
  return nomeAnuncio(exemplo, { campanha: camp, modelo });
}

export function render() {
  const tema = lerTema();
  const admin = ehAdmin();
  return `
    <header class="page-head"><div><h1 class="page-title">Ajustes</h1></div></header>

    ${MODO_LOCAL ? `
      <section class="block destaque-local" aria-labelledby="h-local">
        <div class="block-head"><h2 id="h-local">Modo local</h2></div>
        <p>Os dados estão só neste navegador, com exemplos para você conhecer o painel. Para usar com a equipe,
          crie o projeto no Supabase, rode <code>supabase/schema.sql</code> e preencha <code>js/config.js</code> (passo a passo no README).</p>
        <div class="actions left"><button type="button" class="btn ghost small" data-restaurar>Restaurar dados de exemplo</button></div>
      </section>` : ''}

    <div class="cols">
      <section class="block" aria-labelledby="h-conta">
        <div class="block-head"><h2 id="h-conta">Sua conta</h2></div>
        <p><strong>${esc(state.membro.nome || state.membro.email)}</strong><br><span class="muted">${esc(state.membro.email)} · ${PAPEIS[state.membro.papel]}</span></p>
        <fieldset class="segmented small" data-nao-suja><legend class="field-label">Tema</legend>
          ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => `<label><input type="radio" name="tema" value="${v}" ${tema === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </fieldset>
        <div class="actions left">
          <button type="button" class="btn ghost small" data-tour>Refazer o tour</button>
          ${MODO_LOCAL ? '' : `<button type="button" class="btn ghost small" data-senha>Trocar senha</button>
          <button type="button" class="btn ghost small" data-sair>${icon('logout', { size: 18 })}Sair</button>`}</div>
      </section>

      <section class="block" aria-labelledby="h-nome">
        <div class="block-head"><h2 id="h-nome">Nome dos anúncios</h2></div>
        <form id="form-modelo" novalidate>
          <label class="field" for="a-modelo"><span class="field-label">Modelo</span>
            <input id="a-modelo" name="modelo" value="${esc(state.ajustes.modelo_nome)}" spellcheck="false" required>
            <span class="field-hint">Exemplo: <code id="previa-nome">${esc(previaNome(state.ajustes.modelo_nome))}</code></span></label>
          <ul class="variaveis">${Object.entries(VARIAVEIS_MODELO).map(([k, v]) => `<li><button type="button" class="chip" data-var="${k}">{${k}}</button> <span class="muted small">${esc(v)}</span></li>`).join('')}</ul>
          <p class="field-hint">O <code>{codigo}</code> é obrigatório: é ele que liga o anúncio do Meta ao criativo na importação do CSV.</p>
          <label class="field" for="a-pasta"><span class="field-label">Pasta padrão dos clipes <small>(para o montador de variações)</small></span>
            <input id="a-pasta" name="pasta" value="${esc(state.ajustes.pasta_clipes || '')}" placeholder="D:\\Criativos\\brutos" spellcheck="false"></label>
          <div class="actions left">
            <button type="submit" class="btn primary small">Salvar</button>
            <button type="button" class="btn link small" data-padrao>Voltar ao padrão</button>
          </div>
        </form>
      </section>
    </div>

    ${MODO_LOCAL ? '' : `<section class="block" aria-labelledby="h-ia">
      <div class="block-head"><h2 id="h-ia">IA neste mês</h2></div>
      <div id="ia-uso" aria-live="polite"><p class="muted small">Carregando…</p></div>
      <p class="field-hint">Custo estimado pela tabela de preços da Anthropic; a cobrança real fica no console da sua conta (console.anthropic.com). O modelo é escolhido no secret <code>IA_MODELO</code> da função (padrão: claude-haiku-5-5).</p>
    </section>`}

    <section class="block" aria-labelledby="h-camp">
      <div class="block-head"><h2 id="h-camp">Campanhas</h2><button type="button" class="btn ghost small" data-nova-campanha>${icon('plus', { size: 18 })}Nova</button></div>
      ${state.campanhas.length ? `<ul class="lista-simples">${state.campanhas.map((c) => {
        const n = state.criativos.filter((x) => x.campanha_id === c.id).length;
        return `<li class="${c.ativa ? '' : 'inativa'}">
          <span class="camp-tag" style="--camp:${esc(c.cor)}">${esc(c.sigla)}</span>
          <span class="lista-txt"><strong>${esc(c.nome)}</strong> <span class="muted small">${plural(n, 'criativo', 'criativos')}${c.ativa ? '' : ' · arquivada'}</span></span>
          <button type="button" class="icon-btn small" data-editar-campanha="${c.id}" aria-label="Editar ${esc(c.nome)}">${icon('edit', { size: 18 })}</button>
        </li>`;
      }).join('')}</ul>` : '<p class="muted">Cadastre os abrigos, ofertas ou produtos que recebem criativos. A sigla entra no nome dos anúncios.</p>'}
    </section>

    <section class="block" aria-labelledby="h-equipe">
      <div class="block-head"><h2 id="h-equipe">Equipe</h2>${admin ? `<button type="button" class="btn ghost small" data-novo-membro>${icon('plus', { size: 18 })}Adicionar</button>` : ''}</div>
      <ul class="lista-simples">${state.membros.map((m) => `<li>
        <span class="avatar">${esc((m.nome || m.email).slice(0, 2).toUpperCase())}</span>
        <span class="lista-txt"><strong>${esc(m.nome || m.email)}</strong> <span class="muted small">${esc(m.email)} · ${PAPEIS[m.papel]}</span></span>
        ${admin ? `<button type="button" class="icon-btn small" data-editar-membro="${esc(m.email)}" aria-label="Editar ${esc(m.nome || m.email)}">${icon('edit', { size: 18 })}</button>` : ''}
      </li>`).join('')}</ul>
      ${admin ? '<p class="field-hint">A pessoa entra pelo “Primeiro acesso” com o mesmo e-mail cadastrado aqui. Papel é só informativo, exceto Admin (gerencia a equipe).</p>' : ''}
    </section>`;
}

function dialogoCampanha(c) {
  const dlg = openDialog(`
    <form class="sheet-body" novalidate>
      ${sheetHeader(c ? 'Editar campanha' : 'Nova campanha')}
      <label class="field" for="cp-nome"><span class="field-label">Nome</span><input id="cp-nome" name="nome" maxlength="80" required value="${esc(c?.nome || '')}" autofocus placeholder="SOS Animal Help"></label>
      <div class="grid-2">
        <label class="field" for="cp-sigla"><span class="field-label">Sigla <small>(vai no nome do anúncio)</small></span><input id="cp-sigla" name="sigla" maxlength="12" required value="${esc(c?.sigla || '')}" placeholder="SAH"></label>
        <label class="field" for="cp-cor"><span class="field-label">Cor</span><input id="cp-cor" name="cor" type="color" value="${esc(c?.cor || '#b42318')}"></label>
      </div>
      ${c ? `<label class="check"><input type="checkbox" name="ativa" ${c.ativa ? 'checked' : ''}><span>Ativa <small>(arquivadas somem das listas de escolha)</small></span></label>` : ''}
      <div class="actions">
        ${c ? '<button type="button" class="btn link danger-text" data-apagar>Excluir</button>' : ''}
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Salvar</button>
      </div>
    </form>`);
  const f = dlg.querySelector('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = f.nome.value.trim();
    const sigla = f.sigla.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!nome || !sigla) { toast('Preencha nome e sigla (letras e números).', { tone: 'alert' }); return; }
    const ok = await enquanto(e.submitter, async () => {
      await salvarCampanha({ ...(c ? { id: c.id, ativa: f.ativa.checked } : {}), nome, sigla, cor: f.cor.value });
      return true;
    });
    if (ok) dlg.close();
  });
  dlg.querySelector('[data-apagar]')?.addEventListener('click', async () => {
    const n = state.criativos.filter((x) => x.campanha_id === c.id).length;
    const ok = await confirmDialog({
      title: `Excluir ${esc(c.nome)}?`,
      text: n ? `${plural(n, 'criativo fica', 'criativos ficam')} sem campanha (e o nome do anúncio deles muda). Para só esconder, desmarque “Ativa”.` : 'A campanha não tem criativos.',
      confirmLabel: 'Excluir', danger: true,
    });
    if (ok) await enquanto(null, () => excluirCampanha(c.id));
  });
}

function dialogoMembro(m) {
  const eu = m?.email === state.membro.email;
  const dlg = openDialog(`
    <form class="sheet-body" novalidate>
      ${sheetHeader(m ? 'Editar membro' : 'Adicionar à equipe')}
      <label class="field" for="mb-email"><span class="field-label">E-mail</span><input id="mb-email" name="email" type="email" required value="${esc(m?.email || '')}" ${m ? 'readonly' : 'autofocus'}></label>
      <label class="field" for="mb-nome"><span class="field-label">Nome</span><input id="mb-nome" name="nome" maxlength="60" value="${esc(m?.nome || '')}" ${m ? 'autofocus' : ''}></label>
      <label class="field" for="mb-papel"><span class="field-label">Papel</span><select id="mb-papel" name="papel" ${eu ? 'disabled' : ''}>
        ${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${(m?.papel || 'editor') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        ${eu ? '<span class="field-hint">Você não pode tirar o seu próprio acesso de admin.</span>' : ''}</label>
      <div class="actions">
        ${m && !eu ? '<button type="button" class="btn link danger-text" data-remover>Remover da equipe</button>' : ''}
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Salvar</button>
      </div>
    </form>`);
  const f = dlg.querySelector('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = f.email.value.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast('Digite um e-mail válido.', { tone: 'alert' }); return; }
    const ok = await enquanto(e.submitter, async () => {
      await salvarMembro({ email, nome: f.nome.value.trim(), papel: eu ? 'admin' : f.papel.value }, { novo: !m });
      return true;
    });
    if (ok) { dlg.close(); if (!m) toast(`${esc(email)} pode entrar pelo “Primeiro acesso”.`, { timeout: 7000 }); }
  });
  dlg.querySelector('[data-remover]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Remover da equipe?', text: `${esc(m.email)} perde o acesso ao painel na hora. Os criativos dele continuam.`, confirmLabel: 'Remover', danger: true });
    if (ok) await enquanto(null, () => removerMembro(m.email));
  });
}

async function mostrarUsoIA(el) {
  const hoje = new Date();
  const desde = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
  try {
    const linhas = await api.usoIA(desde);
    if (!linhas.length) { el.innerHTML = '<p class="muted small">Nenhum uso da IA neste mês.</p>'; return; }
    const soma = (f) => linhas.reduce((a, l) => a + (Number(l[f]) || 0), 0);
    const custo = linhas.reduce((a, l) => a + (custoIA(l.modelo, l.tokens_entrada, l.tokens_saida) || 0), 0);
    const por = (acao) => linhas.filter((l) => l.acao === acao).length;
    el.innerHTML = `<dl class="mini-kpis">
      <div><dt>Chamadas</dt><dd>${linhas.length}</dd></div>
      <div><dt>Tokens</dt><dd>${fmtNum(soma('tokens_entrada') + soma('tokens_saida'))}</dd></div>
      <div><dt>Custo estimado</dt><dd>US$ ${custo.toFixed(2)}</dd></div>
    </dl><p class="muted small">${por('roteiros')} de roteiros · ${por('revisar')} de revisão</p>`;
  } catch (err) {
    el.innerHTML = `<p class="muted small">Não foi possível ler o uso (${esc(err.message)}).</p>`;
  }
}

export function mount(root) {
  const usoEl = root.querySelector('#ia-uso');
  if (usoEl) mostrarUsoIA(usoEl);
  const form = root.querySelector('#form-modelo');
  const previa = root.querySelector('#previa-nome');
  form.modelo.addEventListener('input', () => { previa.textContent = previaNome(form.modelo.value); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const modelo = form.modelo.value.trim();
    if (!modelo.includes('{codigo}')) { toast('O modelo precisa ter {codigo}.', { tone: 'alert' }); form.modelo.focus(); return; }
    const ok = await enquanto(e.submitter, async () => {
      await salvarAjustes({ modelo_nome: modelo, pasta_clipes: form.pasta.value.trim() });
      return true;
    });
    if (ok) { limparRascunho(form); toast('Ajustes salvos.'); }
  });

  root.addEventListener('change', (e) => {
    if (e.target.name === 'tema') aplicarTema(e.target.value);
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.var) {
      const inp = form.modelo;
      const pos = inp.selectionStart ?? inp.value.length;
      inp.value = `${inp.value.slice(0, pos)}{${d.var}}${inp.value.slice(inp.selectionEnd ?? pos)}`;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.focus();
    } else if ('padrao' in d) {
      form.modelo.value = MODELO_PADRAO;
      form.modelo.dispatchEvent(new Event('input', { bubbles: true }));
    } else if ('novaCampanha' in d) dialogoCampanha(null);
    else if (d.editarCampanha) dialogoCampanha(state.campanhas.find((c) => c.id === d.editarCampanha));
    else if ('novoMembro' in d) dialogoMembro(null);
    else if (d.editarMembro) dialogoMembro(state.membros.find((m) => m.email === d.editarMembro));
    else if ('tour' in d) iniciarTour();
    else if ('sair' in d) { await api.sair(); location.reload(); }
    else if ('senha' in d) {
      const ok = await enquanto(b, async () => { await api.recuperar(state.membro.email); return true; });
      if (ok) toast(`Enviamos um link para ${esc(state.membro.email)} criar a senha nova.`, { timeout: 7000 });
    } else if ('restaurar' in d) {
      const ok = await confirmDialog({ title: 'Restaurar exemplos?', text: 'Tudo o que você fez no modo local é apagado e os dados de exemplo voltam.', confirmLabel: 'Restaurar', danger: true });
      if (ok) { api.restaurarExemplo(); await carregarTudo(); toast('Exemplos restaurados.'); }
    }
  });
}

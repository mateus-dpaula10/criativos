// Peças de interface compartilhadas: avisos (toasts), diálogos, download e pedaços de HTML repetidos.
import { esc, fmtDateShort, todayISO, iniciais } from './utils.js';
import { icon } from './icons.js';
import { ETAPA, EM_PRODUCAO, VEREDITOS } from './domain.js';

// Rascunho: valores digitados e ainda não salvos na tela atual (id do campo → valor). Sobrevivem aos
// redesenhos (alguém da equipe moveu um criativo, uma marcação do checklist foi gravada) e são
// descartados ao trocar de tela. Depois de salvar um formulário, chame limparRascunho(form).
export const rascunho = new Map();
export function limparRascunho(form) {
  form.querySelectorAll('[id]').forEach((el) => rascunho.delete(el.id));
}

export function toast(message, { tone = 'info', action, timeout = 4500 } = {}) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.innerHTML = `<span>${message}</span>`;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { action.run(); el.remove(); });
    el.appendChild(btn);
  }
  root.appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

/** Abre um <dialog> genérico com o HTML informado. Retorna o elemento. */
export function openDialog(html, { id = 'generic-dialog', onClose } = {}) {
  const dlg = document.getElementById(id);
  if (!dlg._wired) {
    // Um único ouvinte permanente; o handler da vez fica em dlg._onClose. O evento 'close' chega depois
    // (tarefa na fila): se o diálogo já foi reaberto com outro conteúdo, o evento atrasado é ignorado.
    dlg.addEventListener('close', () => {
      if (dlg.open) return;
      const fn = dlg._onClose; dlg._onClose = null; fn?.();
    });
    dlg._wired = true;
  }
  if (dlg._onClose) { const prev = dlg._onClose; dlg._onClose = null; prev(); }
  dlg._onClose = onClose || null;
  dlg.innerHTML = html;
  const close = () => dlg.close();
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  dlg.onclick = (e) => { if (e.target === dlg) close(); };
  if (!dlg.open) dlg.showModal();
  const first = dlg.querySelector('[autofocus]') || dlg.querySelector('input, select, textarea, button:not([data-close])');
  first?.focus();
  return dlg;
}

export function sheetHeader(title, id = 'generic-dialog-title') {
  return `<header class="sheet-head">
    <h2 id="${id}">${esc(title)}</h2>
    <button type="button" class="icon-btn" data-close aria-label="Fechar">${icon('x')}</button>
  </header>`;
}

/** Confirmação acessível (substitui window.confirm). */
export function confirmDialog({ title, text, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const dlg = openDialog(`
      <form method="dialog" class="sheet-body confirm">
        ${sheetHeader(title)}
        <p>${text}</p>
        <div class="actions">
          <button type="button" class="btn ghost" data-close ${danger ? 'autofocus' : ''}>Cancelar</button>
          <button type="submit" class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirmLabel)}</button>
        </div>
      </form>`, { onClose: () => resolve(answer) });
    dlg.querySelector('[data-ok]').addEventListener('click', () => { answer = true; });
  });
}

/** Baixa um arquivo gerado no aparelho (texto ou binário). */
export function downloadFile(filename, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function emptyState({ title, text, action }) {
  return `<div class="empty">
    <p class="empty-title">${esc(title)}</p>
    <p>${text}</p>
    ${action || ''}
  </div>`;
}

/** Trava o botão enquanto a ação roda e mostra o erro em toast. Devolve o resultado (ou undefined se falhou). */
export async function enquanto(botao, fn) {
  const antes = botao?.disabled;
  if (botao) { botao.disabled = true; botao.setAttribute('aria-busy', 'true'); }
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    toast(esc(err.message || 'Algo deu errado.'), { tone: 'alert', timeout: 7000 });
    return undefined;
  } finally {
    if (botao) { botao.disabled = antes; botao.removeAttribute('aria-busy'); }
  }
}

// ---------- Pedaços de HTML dos criativos ----------

export const etapaBadge = (etapa) => `<span class="etapa etapa-${esc(etapa)}">${esc(ETAPA[etapa]?.label || etapa)}</span>`;

export const vereditoBadge = (v) => (v ? `<span class="veredito veredito-${esc(v)}">${v === 'vencedor' ? icon('trophy', { size: 14 }) : ''}${esc(VEREDITOS[v])}</span>` : '');

export function campanhaTag(camp) {
  if (!camp) return '<span class="camp-tag sem">Sem campanha</span>';
  return `<span class="camp-tag" style="--camp:${esc(camp.cor)}" title="${esc(camp.nome)}">${esc(camp.sigla)}</span>`;
}

/** Prazo com destaque quando atrasado (só conta enquanto o criativo está em produção). */
export function prazoBadge(c) {
  if (!c.prazo) return '';
  const hoje = todayISO();
  const atrasado = c.prazo < hoje && EM_PRODUCAO.includes(c.etapa);
  const hojeMesmo = c.prazo === hoje && EM_PRODUCAO.includes(c.etapa);
  const cls = atrasado ? 'prazo atrasado' : hojeMesmo ? 'prazo hoje' : 'prazo';
  const txt = atrasado ? `Atrasado · ${fmtDateShort(c.prazo)}` : hojeMesmo ? 'Entrega hoje' : fmtDateShort(c.prazo);
  return `<span class="${cls}">${icon('clock', { size: 14 })}${esc(txt)}</span>`;
}

export const avatar = (nome, title = nome) => `<span class="avatar" title="${esc(title)}" aria-label="${esc(title)}">${esc(iniciais(nome))}</span>`;

export function thumbBox(url, { classe = '' } = {}) {
  return url
    ? `<span class="thumb ${classe}"><img src="${esc(url)}" alt="" loading="lazy"></span>`
    : `<span class="thumb vazio ${classe}" aria-hidden="true">${icon('film', { size: 20 })}</span>`;
}

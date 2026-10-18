// Campos de formulário repetidos entre telas (opções de campanha, responsável, etapa, formatos).
import { state } from '../store.js';
import { esc } from '../utils.js';
import { ETAPAS, FORMATOS, FERRAMENTAS, VEREDITOS } from '../domain.js';

const opt = (valor, rotulo, sel) => `<option value="${esc(valor)}" ${String(valor) === String(sel ?? '') ? 'selected' : ''}>${esc(rotulo)}</option>`;

export function opcoesCampanha(sel, { vazio = 'Sem campanha', soAtivas = true } = {}) {
  const lista = state.campanhas.filter((c) => !soAtivas || c.ativa || c.id === sel);
  return opt('', vazio, sel) + lista.map((c) => opt(c.id, `${c.sigla} · ${c.nome}`, sel)).join('');
}

export function opcoesMembro(sel, { vazio = 'Ninguém' } = {}) {
  const lista = [...state.membros];
  if (sel && !lista.some((m) => m.email === sel)) lista.push({ email: sel, nome: `${sel} (fora da equipe)` });
  return opt('', vazio, sel) + lista.map((m) => opt(m.email, m.nome || m.email, sel)).join('');
}

export const opcoesEtapa = (sel) => ETAPAS.map((e) => opt(e.id, e.label, sel)).join('');
export const opcoesFerramenta = (sel) => Object.entries(FERRAMENTAS).map(([k, v]) => opt(k, v, sel)).join('');
export const opcoesVeredito = (sel) => opt('', 'Sem veredito', sel) + Object.entries(VEREDITOS).map(([k, v]) => opt(k, v, sel)).join('');

export function checksFormatos(selecionados = [], nome = 'formatos') {
  return `<fieldset class="checks-inline"><legend class="field-label">Formatos</legend>
    ${Object.entries(FORMATOS).map(([k, f]) => `<label class="check-pill"><input type="checkbox" id="${nome}-${k}" name="${nome}" value="${k}" ${selecionados.includes(k) ? 'checked' : ''}>
      <span>${f.label} <small>${f.uso}</small></span></label>`).join('')}
  </fieldset>`;
}

/** Lista de valores marcados de um grupo de checkboxes. */
export const marcados = (form, nome) => [...form.querySelectorAll(`input[name="${nome}"]:checked`)].map((i) => i.value);

// Testes das regras puras: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nomeAnuncio, nomeArquivo, extrairNumero, codigo, trecho, somarMetricas, indicadores, noPeriodo,
  cronometrar, quebrarLegenda, gerarSRT, tempoSRT, lerCSV, mapearColunas, agregarCSV, lerData, sobrepoe,
  combinar, listaArquivos, juntarCaminho, escBat, filtroConcat, gerarBat, custoIA,
} from '../js/domain.js';

test('custo estimado da IA', () => {
  assert.equal(custoIA('claude-haiku-5-5', 1_000_000, 1_000_000), 0.6);
  assert.ok(Math.abs(custoIA('claude-sonnet-5-5', 3000, 2000) - 0.026) < 1e-9);
  assert.equal(custoIA('outro-modelo', 10, 10), null);
});
import { parseDecimal, parseMoney } from '../js/utils.js';

test('código e extração do número no nome do anúncio', () => {
  assert.equal(codigo(42), 'C0042');
  assert.equal(codigo(12345), 'C12345');
  assert.equal(extrairNumero('SAH_C0042_DOR_20261018'), 42);
  assert.equal(extrairNumero('c0042 - teste'), 42);
  assert.equal(extrairNumero('[CBO] SAH_C0107_9x16'), 107);
  assert.equal(extrairNumero('ABC0042'), null, 'letra colada antes não é código');
  assert.equal(extrairNumero('C12'), null, 'precisa de 3+ dígitos');
  assert.equal(extrairNumero('Anúncio sem código'), null);
});

test('nome do anúncio pelo modelo', () => {
  const c = { numero: 42, angulo: 'Dor do animal / resgate', titulo: 'Cachorro na chuva', formatos: ['9x16'], criado_em: '2026-10-18T12:00:00Z', responsavel: 'ana.paula@x.com' };
  assert.equal(nomeAnuncio(c, { campanha: { sigla: 'sah' } }), 'SAH_C0042_DOR-DO-ANIMAL-RESGATE_20261018');
  assert.equal(nomeAnuncio({ ...c, angulo: '' }, { campanha: null }), 'C0042_20261018', 'campos vazios não deixam __');
  assert.equal(nomeAnuncio(c, { campanha: { sigla: 'SAH' }, modelo: '{codigo}-{editor}-{formato}' }), 'C0042-AP-9x16');
  assert.equal(nomeArquivo('SAH_C0042', '4x5'), 'SAH_C0042_4x5');
  assert.equal(nomeArquivo('SAH_C0042_9x16', '9x16'), 'SAH_C0042_9x16');
  assert.equal(trecho('Ação & reação!'), 'ACAO-REACAO');
});

test('números em pt-BR e inglês', () => {
  assert.equal(parseDecimal('1.234,56'), 1234.56);
  assert.equal(parseDecimal('1234.56'), 1234.56);
  assert.equal(parseDecimal('1,234.56'), 1234.56);
  assert.equal(parseDecimal('12,5'), 12.5);
  assert.equal(parseDecimal('1,234'), 1234);
  assert.equal(parseDecimal('1.234.567'), 1234567);
  assert.ok(Number.isNaN(parseDecimal('abc')));
  assert.equal(parseMoney('R$ 10,50'), 1050);
});

test('soma e indicadores não inventam zero', () => {
  const t = somarMetricas([
    { gasto_cents: 10000, impressoes: 5000, cliques: 50, views_3s: 1500, thruplays: 300, resultados: 4, receita_cents: null },
    { gasto_cents: 5000, impressoes: 2500, cliques: 25, views_3s: null, thruplays: null, resultados: 1, receita_cents: null },
  ]);
  assert.equal(t.gasto_cents, 15000);
  assert.equal(t.receita_cents, null);
  const i = indicadores(t);
  assert.equal(i.ctr, 75 / 7500);
  assert.equal(i.cpa, 3000);
  assert.equal(i.cpm, 2000);
  assert.equal(i.roas, null);
  assert.equal(indicadores({ gasto_cents: 100, resultados: 0 }).cpa, null);
});

test('filtro de período usa só linhas inteiras dentro', () => {
  const l = [{ inicio: '2026-10-01', fim: '2026-10-01' }, { inicio: '2026-09-25', fim: '2026-10-05' }, { inicio: '2026-10-10', fim: '2026-10-10' }];
  assert.equal(noPeriodo(l, '2026-10-01', '2026-10-09').length, 1);
  assert.equal(noPeriodo(l, null, null).length, 3);
});

test('legenda: quebra, tempos e SRT', () => {
  assert.deepEqual(quebrarLegenda('um dois três quatro cinco seis', { max: 10, linhas: 2 }), ['um dois\ntrês', 'quatro\ncinco seis']);
  assert.equal(tempoSRT(3725.5), '01:02:05,500');
  const c = cronometrar([{ tipo: 'gancho', texto: 'Olha isso', segundos: 3 }, { tipo: 'corpo', texto: 'a b c d e f g h i j k l m' }]);
  assert.equal(c[0].fim, 3);
  assert.equal(c[1].inicio, 3);
  assert.equal(c[1].estimado, true);
  const srt = gerarSRT([{ texto: 'Primeira fala curta', segundos: 2 }, { texto: '' }, { texto: 'Segunda', segundos: 1 }]);
  assert.equal(srt, '1\n00:00:00,000 --> 00:00:02,000\nPrimeira fala curta\n\n2\n00:00:02,000 --> 00:00:03,000\nSegunda\n');
});

test('CSV do Meta: separador, aspas, BOM e mapeamento', () => {
  const csv = '﻿"Nome do anúncio";"Dia";"Valor usado (BRL)";"Impressões";"Cliques no link";"Reproduções de vídeo de 3 segundos";"ThruPlays";"Resultados"\r\n'
    + '"SAH_C0042_DOR";"2026-10-17";"120,50";"10000";"150";"3200";"800";"6"\r\n'
    + '"SAH_C0042_DOR - cópia";"2026-10-17";"79,50";"5000";"50";"1800";"200";"2"\r\n'
    + '"Anúncio antigo; sem código";"2026-10-17";"10";"100";"";"";"";""\r\n'
    + '"SAH_C0043";"17/10/2026";"0";"0";"";"";"";""\r\n';
  const { cabecalho, linhas } = lerCSV(csv);
  assert.equal(cabecalho[0], 'Nome do anúncio');
  assert.equal(linhas.length, 4);
  assert.equal(linhas[2][0], 'Anúncio antigo; sem código');
  const mapa = mapearColunas(cabecalho);
  assert.deepEqual(mapa, { nome: 0, dia: 1, gasto: 2, impressoes: 3, cliques: 4, views_3s: 5, thruplays: 6, resultados: 7 });
  const r = agregarCSV(linhas, mapa, new Map([[42, 'id-42'], [43, 'id-43']]));
  assert.equal(r.linhas.length, 2);
  const a = r.linhas.find((x) => x.criativo_id === 'id-42');
  assert.equal(a.gasto_cents, 20000);
  assert.equal(a.impressoes, 15000);
  assert.equal(a.resultados, 8);
  assert.equal(a.receita_cents, null);
  assert.equal(r.linhas.find((x) => x.criativo_id === 'id-43').inicio, '2026-10-17');
  assert.deepEqual([...r.naoReconhecidos.keys()], ['Anúncio antigo; sem código']);
  assert.deepEqual(r.periodo, { de: '2026-10-17', ate: '2026-10-17' });
});

test('CSV em inglês com período (sem dia)', () => {
  const { cabecalho, linhas } = lerCSV('Reporting starts,Reporting ends,Ad name,Amount spent (BRL),Impressions,Link clicks,Purchases conversion value\n2026-10-01,2026-10-07,X_C0100,"1,234.50",90000,900,5000.00\n');
  const mapa = mapearColunas(cabecalho);
  assert.equal(mapa.inicio, 0);
  assert.equal(mapa.fim, 1);
  assert.equal(mapa.receita, 6);
  const r = agregarCSV(linhas, mapa, new Map([[100, 'x']]));
  assert.deepEqual([r.linhas[0].inicio, r.linhas[0].fim, r.linhas[0].gasto_cents, r.linhas[0].receita_cents], ['2026-10-01', '2026-10-07', 123450, 500000]);
});

test('datas e sobreposição', () => {
  assert.equal(lerData('18/10/2026'), '2026-10-18');
  assert.equal(lerData('10/18/2026'), '2026-10-18');
  assert.equal(lerData('ontem'), null);
  assert.ok(sobrepoe({ criativo_id: 'a', inicio: '2026-10-01', fim: '2026-10-07' }, { criativo_id: 'a', inicio: '2026-10-07', fim: '2026-10-07' }));
  assert.ok(!sobrepoe({ criativo_id: 'a', inicio: '2026-10-01', fim: '2026-10-07' }, { criativo_id: 'b', inicio: '2026-10-03', fim: '2026-10-03' }));
});

test('variações e script do ffmpeg', () => {
  assert.equal(combinar(['g1', 'g2'], ['c1'], ['a1', 'a2']).length, 4);
  assert.deepEqual(combinar(['g1'], ['c1'])[0], { gancho: 'g1', corpo: 'c1', cta: null });
  assert.deepEqual(listaArquivos(' a.mp4\n\n"b.mp4"\na.mp4 '), ['a.mp4', 'b.mp4']);
  assert.equal(juntarCaminho('D:\\Brutos\\', 'g1.mp4'), 'D:\\Brutos\\g1.mp4');
  assert.equal(juntarCaminho('D:\\Brutos', 'E:/outro/x.mp4'), 'E:\\outro\\x.mp4');
  assert.equal(escBat('100% real'), '100%% real');
  assert.throws(() => escBat('a"b'));
  assert.equal(filtroConcat(2, '4x5', { audio: false }),
    '[0:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,setsar=1,fps=30,format=yuv420p[v0];'
    + '[1:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,setsar=1,fps=30,format=yuv420p[v1];[v0][v1]concat=n=2:v=1:a=0[v]');
  const bat = gerarBat([{ nome: 'SAH_C0042_9x16', formato: '9x16', clipes: ['g1.mp4', 'c1.mp4'] }], { pasta: 'D:\\Brutos' });
  assert.ok(bat.includes('-i "D:\\Brutos\\g1.mp4" -i "D:\\Brutos\\c1.mp4"'));
  assert.ok(bat.includes('"%SAIDA%\\SAH_C0042_9x16.mp4"'));
  assert.ok(bat.includes('set "SAIDA=D:\\Brutos\\render"'));
  assert.ok(bat.split('\r\n').length > 10, 'quebra de linha do Windows');
});

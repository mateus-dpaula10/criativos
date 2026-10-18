// Edge Function "ia" do painel de Criativos (Supabase, Deno).
// Ações:
//  - roteiros: sugere ganchos e roteiros (gancho/corpo/CTA) para um criativo;
//  - revisar: olha quadros do vídeo exportado + roteiro e avalia o checklist de revisão.
// Só atende quem está logado E está na tabela "membros". A chave da Anthropic fica no cofre do
// Supabase (Edge Functions → Secrets → ANTHROPIC_API_KEY); nunca vai para o navegador.
// Modelo: secret IA_MODELO (padrão claude-haiku-5-5, o mais barato). Para trocar: claude-sonnet-5-5.
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const MODELO = Deno.env.get('IA_MODELO') || 'claude-haiku-5-5';
const MAX_CORPO = 6 * 1024 * 1024; // 8 quadros JPEG cabem com folga
const MAX_QUADROS = 8;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const erro = (status: number, mensagem: string) => json(status, { erro: mensagem });

const texto = (v: unknown, max = 2000) => String(v ?? '').slice(0, max).trim();

// ---------- Ação: roteiros ----------

const SISTEMA_ROTEIROS = `Você é roteirista sênior de anúncios em vídeo para Meta Ads (Reels, Stories e Feed), escrevendo em português do Brasil.
Os anúncios são de organizações e ofertas que vivem de resposta direta: o vídeo precisa parar a rolagem, criar conexão e levar à ação.

Regras de escrita:
- Gancho: no máximo 12 palavras, falado em até 3 segundos, concreto e visual. Nada de "Você sabia que...?" genérico.
- Fala natural, como alguém falando para a câmera; frases curtas; sem jargão de marketing.
- CTA: uma ação só, clara e direta.
- Respeite as políticas do Meta: nada de imagens ou promessas sensacionalistas, nada de afirmar atributos pessoais de quem assiste ("você que está deprimido..."), nada de números ou fatos inventados. Se precisar de um dado, escreva [DADO] para a equipe preencher.
- As referências (quando houver) são criativos da própria equipe que deram bom resultado: use o que funcionou como sinal de estilo e estrutura, sem copiar frases.
- "segundos" de cada bloco é uma estimativa realista de fala (cerca de 2,6 palavras por segundo).`;

const ESQUEMA_ROTEIROS = {
  type: 'object',
  properties: {
    ganchos: {
      type: 'array',
      items: {
        type: 'object',
        properties: { texto: { type: 'string' }, por_que: { type: 'string' } },
        required: ['texto', 'por_que'],
        additionalProperties: false,
      },
    },
    roteiros: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          ideia: { type: 'string' },
          blocos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tipo: { type: 'string', enum: ['gancho', 'corpo', 'cta'] },
                texto: { type: 'string' },
                segundos: { type: 'number' },
              },
              required: ['tipo', 'texto', 'segundos'],
              additionalProperties: false,
            },
          },
        },
        required: ['titulo', 'ideia', 'blocos'],
        additionalProperties: false,
      },
    },
  },
  required: ['ganchos', 'roteiros'],
  additionalProperties: false,
};

// deno-lint-ignore no-explicit-any
function pedidoRoteiros(d: any): Anthropic.MessageParam[] {
  const refs = (Array.isArray(d.referencias) ? d.referencias : []).slice(0, 3).map((r: any, i: number) => (
    `Referência ${i + 1}: "${texto(r.titulo, 160)}" (${texto(r.desempenho, 200)})\n` +
    (Array.isArray(r.blocos) ? r.blocos.slice(0, 8).map((b: any) => `  [${texto(b.tipo, 10)}] ${texto(b.texto, 600)}`).join('\n') : '')
  )).join('\n\n');
  const pedido = [
    `Campanha: ${texto(d.campanha, 120) || 'não informada'}`,
    `Título do criativo: ${texto(d.titulo, 160)}`,
    `Ângulo: ${texto(d.angulo, 80) || 'livre'}`,
    `Público: ${texto(d.publico, 300) || 'não informado'}`,
    `Contexto / oferta / história: ${texto(d.contexto, 2000) || 'não informado'}`,
    `Duração alvo: cerca de ${Math.min(90, Math.max(10, Number(d.duracao) || 30))} segundos`,
    d.rascunho ? `Rascunho atual da equipe (pode melhorar a partir dele):\n${texto(d.rascunho, 3000)}` : '',
    refs ? `Criativos de referência que performaram bem:\n${refs}` : '',
    '',
    'Entregue 8 ganchos diferentes entre si (variando a abordagem: curiosidade, cena, contraste, pergunta, número, depoimento...) e 3 roteiros completos, cada um com 1 gancho, 1 a 3 blocos de corpo e 1 CTA.',
  ].filter(Boolean).join('\n');
  return [{ role: 'user', content: pedido }];
}

// ---------- Ação: revisar ----------

const ITENS_REVISAO = ['gancho', 'legenda', 'zona', 'cta', 'marca', 'formato'] as const;

const SISTEMA_REVISAO = `Você revisa anúncios em vídeo para Meta Ads antes de irem ao ar. Você recebe quadros do vídeo (com o segundo de cada um), o formato e o roteiro.
Avalie só o que dá para ver nos quadros; quando não der para concluir, marque ok=false e diga o que conferir. Seja específico (cite o segundo do quadro) e curto. Responda em português do Brasil.

Itens:
- gancho: os primeiros segundos têm algo visual forte que prende (rosto, movimento, texto de impacto)?
- legenda: há legenda/texto na tela, legível (tamanho, contraste) e sem erro de português visível?
- zona: no 9:16, textos e elementos importantes evitam os ~14% de cima e os ~35% de baixo (áreas cobertas pela interface do Reels)? Em outros formatos, evitam as bordas?
- cta: o final mostra uma chamada para ação clara?
- marca: a organização/marca aparece de forma identificável?
- formato: o enquadramento ocupa bem o formato, sem barras pretas nem cortes estranhos?`;

const ESQUEMA_REVISAO = {
  type: 'object',
  properties: {
    itens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: [...ITENS_REVISAO] },
          ok: { type: 'boolean' },
          observacao: { type: 'string' },
        },
        required: ['id', 'ok', 'observacao'],
        additionalProperties: false,
      },
    },
    resumo: { type: 'string' },
    sugestoes: { type: 'array', items: { type: 'string' } },
  },
  required: ['itens', 'resumo', 'sugestoes'],
  additionalProperties: false,
};

// deno-lint-ignore no-explicit-any
function pedidoRevisao(d: any): Anthropic.MessageParam[] {
  const quadros = (Array.isArray(d.quadros) ? d.quadros : []).slice(0, MAX_QUADROS);
  if (!quadros.length) throw new Error('Nenhum quadro do vídeo foi enviado.');
  const conteudo: Anthropic.ContentBlockParam[] = [];
  for (const q of quadros) {
    const m = String(q.imagem || '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
    if (!m) throw new Error('Quadro em formato inválido.');
    conteudo.push({ type: 'text', text: `Quadro aos ${Number(q.segundo || 0).toFixed(1)} s:` });
    conteudo.push({ type: 'image', source: { type: 'base64', media_type: `image/${m[1]}` as 'image/jpeg', data: m[2] } });
  }
  const roteiro = (Array.isArray(d.roteiro) ? d.roteiro : []).slice(0, 12)
    .map((b: any) => `[${texto(b.tipo, 10)}] ${texto(b.texto, 600)}`).join('\n');
  conteudo.push({
    type: 'text',
    text: [
      `Formato: ${texto(d.formato, 10) || 'não informado'} · duração ${Number(d.duracao || 0).toFixed(1)} s · ${texto(d.titulo, 160)}`,
      roteiro ? `Roteiro planejado:\n${roteiro}` : 'Sem roteiro cadastrado.',
      'Avalie os 6 itens (um registro por item), faça um resumo de 1 a 2 frases e até 4 sugestões práticas de ajuste.',
    ].join('\n'),
  });
  return [{ role: 'user', content: conteudo }];
}

// ---------- Servidor ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro(405, 'Use POST.');

  // Quem está chamando: precisa estar logado e na equipe (mesma regra do banco).
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const chavePublica = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!token || !chavePublica) return erro(401, 'Entre no painel para usar a IA.');
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, chavePublica, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: usuario, error: erroUsuario } = await sb.auth.getUser(token);
  if (erroUsuario || !usuario?.user) return erro(401, 'Sessão expirada. Entre de novo.');
  const { data: membro } = await sb.rpc('eh_membro');
  if (membro !== true) return erro(403, 'Seu e-mail não está na equipe.');

  const chaveIA = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chaveIA) return erro(503, 'A IA ainda não foi ligada: falta colocar a chave da Anthropic no Supabase (secret ANTHROPIC_API_KEY).');

  const tamanho = Number(req.headers.get('content-length') || 0);
  if (tamanho > MAX_CORPO) return erro(413, 'Pedido grande demais.');
  // deno-lint-ignore no-explicit-any
  let corpo: any;
  try { corpo = await req.json(); } catch { return erro(400, 'Pedido inválido.'); }

  const acao = corpo?.acao;
  let sistema: string;
  let mensagens: Anthropic.MessageParam[];
  // deno-lint-ignore no-explicit-any
  let esquema: any;
  try {
    if (acao === 'roteiros') { sistema = SISTEMA_ROTEIROS; mensagens = pedidoRoteiros(corpo.dados || {}); esquema = ESQUEMA_ROTEIROS; }
    else if (acao === 'revisar') { sistema = SISTEMA_REVISAO; mensagens = pedidoRevisao(corpo.dados || {}); esquema = ESQUEMA_REVISAO; }
    else return erro(400, 'Ação desconhecida.');
  } catch (e) {
    return erro(400, (e as Error).message);
  }

  const client = new Anthropic({ apiKey: chaveIA });
  let resposta: Anthropic.Message;
  try {
    resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 16000,
      system: sistema,
      messages: mensagens,
      output_config: { format: { type: 'json_schema', schema: esquema } },
    });
  } catch (e) {
    console.error('[ia] erro da API', e);
    if (e instanceof Anthropic.AuthenticationError) return erro(502, 'A chave da IA é inválida. Confira o secret ANTHROPIC_API_KEY.');
    if (e instanceof Anthropic.PermissionDeniedError) return erro(502, 'A chave da IA não tem permissão para esse modelo.');
    if (e instanceof Anthropic.RateLimitError) return erro(429, 'Muitos pedidos à IA agora. Tente em um minuto.');
    if (e instanceof Anthropic.BadRequestError) {
      if (/credit balance/i.test(e.message)) return erro(402, 'A conta da IA está sem crédito. Coloque crédito em console.anthropic.com → Billing.');
      return erro(502, `A IA não aceitou o pedido: ${e.message}`);
    }
    if (e instanceof Anthropic.APIError) return erro(502, `A IA falhou (${e.status ?? 'sem status'}). Tente de novo.`);
    return erro(502, 'Não foi possível falar com a IA.');
  }

  // Registra o uso (para acompanhar o gasto em Ajustes). Aguardado: o runtime pode encerrar a função
  // logo após a resposta. Falha aqui não derruba a resposta.
  const uso = resposta.usage;
  const { error: erroUso } = await sb.from('ia_uso').insert({
    acao, modelo: resposta.model,
    tokens_entrada: (uso.input_tokens || 0) + (uso.cache_read_input_tokens || 0) + (uso.cache_creation_input_tokens || 0),
    tokens_saida: uso.output_tokens || 0,
  });
  if (erroUso) console.warn('[ia] uso não registrado', erroUso.message);

  if (resposta.stop_reason === 'refusal') return erro(422, 'A IA recusou esse pedido. Reescreva o contexto e tente de novo.');
  if (resposta.stop_reason === 'max_tokens') return erro(502, 'A resposta da IA veio cortada. Tente de novo.');
  const bloco = resposta.content.find((b) => b.type === 'text');
  if (!bloco || bloco.type !== 'text') return erro(502, 'A IA não devolveu conteúdo.');
  try {
    return json(200, { resultado: JSON.parse(bloco.text), modelo: resposta.model, uso: { entrada: uso.input_tokens, saida: uso.output_tokens } });
  } catch {
    return erro(502, 'A resposta da IA veio em formato inesperado. Tente de novo.');
  }
});

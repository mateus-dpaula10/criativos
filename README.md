# Criativos

Painel da equipe de tráfego para gerir os criativos de vídeo (Meta Ads): da ideia até o resultado.
Mesmo padrão da Caderneta: front em HTML/CSS/JS puro (sem build), back no Supabase (plano gratuito).

## O que faz

- **Quadro (kanban)** com as etapas Ideia → Roteiro → Gravação → Edição → Revisão → Aprovado → No ar → Pausado.
  Dá para arrastar os cartões ou usar as setas ‹ ›. Tem filtro por campanha e responsável, busca, prazo e aviso de atraso.
- **Nome padrão do anúncio** com código único (`SAH_C0042_DOR_20261018`), e o nome dos arquivos por formato.
  O modelo é configurável em Ajustes. O `{codigo}` é obrigatório, porque é por ele que os resultados voltam.
- **Ler vídeo exportado**: ao escolher o .mp4 final, o navegador lê a duração e o formato e tira a miniatura.
  O vídeo não é enviado; só a miniatura vai para o Storage.
- **Roteiro em blocos** (gancho, corpo, CTA) com tempo estimado, que vira **legenda .srt** (o CapCut e o Premiere
  importam) e **texto de locução**.
- **Montador de variações**: ganchos × corpos × CTAs já exportados viram N criativos e um **.bat** que renderiza
  tudo com o ffmpeg (9:16, 4:5, 1:1, 16:9, cortando ou com barras), já com o nome de cada criativo.
- **Resultados**: importa o CSV do Gerenciador de Anúncios e casa cada anúncio pelo código no nome. Mostra CTR,
  taxa de gancho (3 s ÷ impressões), retenção (ThruPlays ÷ 3 s), CPM, custo por resultado e ROAS, com ranking.
  Reimportar o mesmo período substitui os números em vez de duplicar.
- **Checklist de revisão**, **comentários** e **tempo real** (o quadro atualiza quando alguém mexe).

## Rodar

Sem configurar nada, o painel abre em **modo local**: os dados ficam no navegador e vêm exemplos.
Com o Laragon ligado, abra `http://localhost/criativos/` (ou `http://criativos.test` se os hosts automáticos
estiverem ativos). Qualquer servidor estático serve.

## Ligar ao Supabase (equipe)

1. Crie um projeto em supabase.com (plano Free, região São Paulo).
2. Em **SQL Editor**, cole e rode `supabase/schema.sql`. No fim do arquivo fica o e-mail do primeiro admin:
   troque antes de rodar, se for outro.
3. Em **Authentication → Sign In / Providers → Email**, deixe **Confirm email ligado**. A liberação da equipe
   depende do e-mail confirmado.
4. Em **Authentication → URL Configuration**, coloque o endereço onde o painel vai ficar em *Site URL* e em
   *Redirect URLs*. Os links de confirmação e de troca de senha voltam para lá.
5. Em **Project Settings → API Keys**, copie a URL e a chave **publishable** (nunca a secret/service_role) para
   `js/config.js`.
6. Entre com o e-mail admin em “Primeiro acesso”. Os outros membros você adiciona em **Ajustes → Equipe**,
   e cada um faz o “Primeiro acesso” com o mesmo e-mail.

Segurança: toda tabela tem RLS. Só quem está em `membros` lê ou grava; só admin mexe na equipe. Criar conta
sem estar na equipe não dá acesso a nada.

## IA (Claude, conta própria da Anthropic)

- **Sugerir com IA** (no roteiro): 8 ganchos e 3 roteiros, usando como referência os criativos de menor custo por resultado.
- **Revisar com IA** (no vídeo): 8 quadros do vídeo exportado + roteiro, avaliando o checklist; marca os aprovados e salva o parecer nos comentários.
- Roda na Edge Function `supabase/functions/ia/index.ts`. A chave fica só no Supabase:
  1. Em console.anthropic.com (conta da equipe), crie uma API key e coloque crédito.
  2. Supabase → **Edge Functions → Secrets**: `ANTHROPIC_API_KEY` = a chave. Opcional: `IA_MODELO`
     (padrão `claude-haiku-5-5`; `claude-sonnet-5-5` escreve melhor e custa mais).
  3. **Edge Functions → Deploy a new function → Via Editor**, nome `ia`, cole o `index.ts` e publique.
     Desligue a verificação de JWT da função: ela mesma confere o login e se a pessoa está na equipe.
- O uso do mês (chamadas, tokens, custo estimado) aparece em Ajustes.

## Publicar

Igual à Caderneta: suba a pasta como está (sem build) no Cloudflare Pages, ou sirva por qualquer host estático.
Fica de fora: `tests/`, `package.json`, `supabase/` (não fazem mal, mas não são usados pela página).

## Exportar o CSV do Meta

Gerenciador de Anúncios → aba **Anúncios** → período → **Detalhamento → Por tempo → Dia** → colunas: valor usado,
impressões, cliques no link, reproduções de vídeo de 3 segundos, ThruPlays, resultados/compras, valor de
conversão → **Relatórios → Exportar dados da tabela → .csv**. Se o Meta mudar o nome de alguma coluna, dá para
escolher a coluna certa na tela de importação.

## Testes

`npm test` testa as regras (nome, legenda, leitura do CSV pt-BR/inglês, script do ffmpeg). Precisa do Node 18 ou mais novo.

## Estrutura

```
index.html, css/styles.css, icons/, manifest.webmanifest
js/config.js      conexão (vazia = modo local)
js/api.js         Supabase ou localStorage, mesma interface; login
js/store.js       estado em memória + ações + tempo real
js/domain.js      regras puras (testadas)
js/views/*.js     telas: painel, quadro, criativo, variacoes, resultados, ajustes, entrar, novo
supabase/schema.sql
```

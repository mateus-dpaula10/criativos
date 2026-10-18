// Edge Function "equipe" do painel de Criativos (Supabase, Deno): o admin cria e cuida dos logins da equipe
// sem abrir o Supabase.
// Ações (todas só para quem é admin na tabela "membros"):
//  - adicionar: cria o login (e-mail + senha inicial, já confirmado) e coloca a pessoa na equipe;
//  - senha: define uma senha nova para alguém da equipe;
//  - remover: tira da equipe e, se pedido, apaga o login.
// A chave de administrador do Supabase vem das variáveis que o próprio Supabase injeta nas funções;
// ela nunca sai daqui. Publicar com a verificação de JWT desligada: a função confere o login sozinha.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const erro = (status: number, mensagem: string) => json(status, { erro: mensagem });

const PAPEIS = ['admin', 'editor', 'trafego'];
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

/** Chave de administrador: a legada (service_role) ou a nova (secret), conforme o projeto. */
function chaveAdmin(): string {
  const legada = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legada) return legada;
  try {
    const novas = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    return novas.default || Object.values(novas)[0] || '';
  } catch {
    return '';
  }
}

// deno-lint-ignore no-explicit-any
async function acharUsuario(admin: any, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    const u = data.users.find((x: any) => (x.email || '').toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 1000) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro(405, 'Use POST.');

  // Quem chama: logado e admin (mesma regra do banco).
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const chavePublica = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!token || !chavePublica) return erro(401, 'Entre no painel para gerenciar a equipe.');
  const url = Deno.env.get('SUPABASE_URL')!;
  const sb = createClient(url, chavePublica, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: quem, error: erroQuem } = await sb.auth.getUser(token);
  if (erroQuem || !quem?.user) return erro(401, 'Sessão expirada. Entre de novo.');
  const { data: ehAdmin } = await sb.rpc('eh_admin');
  if (ehAdmin !== true) return erro(403, 'Só um admin pode gerenciar a equipe.');

  const chave = chaveAdmin();
  if (!chave) return erro(500, 'A função não encontrou a chave de administrador do Supabase.');
  const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });

  // deno-lint-ignore no-explicit-any
  let corpo: any;
  try { corpo = await req.json(); } catch { return erro(400, 'Pedido inválido.'); }
  const acao = corpo?.acao;
  const email = String(corpo?.email || '').trim().toLowerCase();
  if (!emailValido(email)) return erro(400, 'E-mail inválido.');
  const meuEmail = (quem.user.email || '').toLowerCase();

  try {
    if (acao === 'adicionar') {
      const nome = String(corpo.nome || '').trim().slice(0, 60);
      const papel = PAPEIS.includes(corpo.papel) ? corpo.papel : 'editor';
      const senha = String(corpo.senha || '');
      if (senha.length < 8) return erro(400, 'A senha inicial precisa ter pelo menos 8 caracteres.');

      let loginExistia = false;
      const { error: erroCriar } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
      if (erroCriar) {
        // Já tinha login (criado antes no Supabase): segue só colocando na equipe, sem trocar a senha.
        if (erroCriar.status === 422 || /already|exists|registered/i.test(erroCriar.message)) loginExistia = true;
        else throw erroCriar;
      }
      // Pela sessão de quem chamou: a regra do banco (só admin mexe na equipe) vale de novo aqui.
      const { error: erroMembro } = await sb.from('membros').upsert({ email, nome, papel }, { onConflict: 'email' });
      if (erroMembro) throw erroMembro;
      return json(200, { ok: true, loginExistia });
    }

    if (acao === 'senha') {
      const senha = String(corpo.senha || '');
      if (senha.length < 8) return erro(400, 'A senha precisa ter pelo menos 8 caracteres.');
      const u = await acharUsuario(admin, email);
      if (!u) return erro(404, 'Essa pessoa ainda não tem login. Use “Adicionar” para criar.');
      const { error } = await admin.auth.admin.updateUserById(u.id, { password: senha });
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (acao === 'remover') {
      if (email === meuEmail) return erro(400, 'Você não pode remover a si mesmo.');
      const { error: erroMembro } = await sb.from('membros').delete().eq('email', email);
      if (erroMembro) throw erroMembro;
      let loginApagado = false;
      if (corpo.apagarLogin === true) {
        const u = await acharUsuario(admin, email);
        if (u) {
          const { error } = await admin.auth.admin.deleteUser(u.id);
          if (error) throw error;
          loginApagado = true;
        }
      }
      return json(200, { ok: true, loginApagado });
    }

    return erro(400, 'Ação desconhecida.');
  } catch (e) {
    console.error('[equipe]', acao, e);
    const msg = (e as Error)?.message || '';
    if (/password/i.test(msg) && /weak|short|least/i.test(msg)) return erro(400, 'Senha fraca: use pelo menos 8 caracteres, misturando letras e números.');
    return erro(500, `Não foi possível concluir (${msg || 'erro desconhecido'}).`);
  }
});

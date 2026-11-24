import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { setConfig } from '@/lib/config';
import { lerConfigWhatsapp, lerEstadoWorker, tokenDoWorker, MENSAGEM_PADRAO } from '@/lib/whatsapp';

// Tela "WhatsApp" do painel: configuração, estado da conexão (com QR) e últimas mensagens.
export async function GET() {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const [config, estado, token] = await Promise.all([lerConfigWhatsapp(), lerEstadoWorker(), tokenDoWorker()]);
  const online = !!estado.atualizadoEm && Date.now() - new Date(estado.atualizadoEm).getTime() < 90000;

  const { data: mensagens } = await supabaseAdmin()
    .from('csf_whatsapp_mensagens')
    .select('id, nome, telefone, texto, status, tentativas, erro, criado_em, enviado_em')
    .order('criado_em', { ascending: false })
    .limit(30);

  return Response.json({
    config,
    mensagemPadrao: MENSAGEM_PADRAO,
    estado: { ...estado, online },
    token,
    mensagens: mensagens || [],
  });
}

// Salva a configuração. Body: { ativo, linkGoogle, linkInstagram, mensagem }
export async function POST(request) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const body = await request.json().catch(() => ({}));
  const linkValido = (v) => v === '' || /^https?:\/\/\S+$/i.test(v);
  const linkGoogle = String(body?.linkGoogle || '').trim().slice(0, 500);
  const linkInstagram = String(body?.linkInstagram || '').trim().slice(0, 500);
  if (!linkValido(linkGoogle) || !linkValido(linkInstagram)) {
    return Response.json({ erro: 'Os links precisam começar com http:// ou https://' }, { status: 400 });
  }
  const mensagem = String(body?.mensagem || '').trim().slice(0, 1500);

  await Promise.all([
    setConfig('whatsapp_ativo', body?.ativo ? '1' : '0'),
    setConfig('whatsapp_link_google', linkGoogle),
    setConfig('whatsapp_link_instagram', linkInstagram),
    setConfig('whatsapp_mensagem', mensagem || MENSAGEM_PADRAO),
  ]);
  return Response.json({ ok: true });
}

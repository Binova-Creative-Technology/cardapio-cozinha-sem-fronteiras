import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenValido, lerConfigWhatsapp } from '@/lib/whatsapp';

export const runtime = 'nodejs';

// O programa do WhatsApp (whatsapp-worker) pede a próxima mensagem para enviar.
export async function GET(request) {
  if (!(await tokenValido(request))) return Response.json({ erro: 'Não autorizado.' }, { status: 401 });

  const config = await lerConfigWhatsapp();
  if (!config.ativo) return Response.json({ mensagem: null, ativo: false });

  const db = supabaseAdmin();

  // mensagem que ficou "enviando" por mais de 5 minutos (programa caiu no meio) volta para a fila
  const limite = new Date(Date.now() - 5 * 60000).toISOString();
  await db.from('csf_whatsapp_mensagens').update({ status: 'pendente' }).eq('status', 'enviando').lt('criado_em', limite);

  const { data: candidata } = await db
    .from('csf_whatsapp_mensagens')
    .select('id, telefone, texto, tentativas')
    .eq('status', 'pendente')
    .lt('tentativas', 3)
    .order('criado_em')
    .limit(1)
    .maybeSingle();
  if (!candidata) return Response.json({ mensagem: null, ativo: true });

  // "reserva" a mensagem (só uma cópia do programa consegue)
  const { data: reservada } = await db
    .from('csf_whatsapp_mensagens')
    .update({ status: 'enviando', tentativas: candidata.tentativas + 1 })
    .eq('id', candidata.id)
    .eq('status', 'pendente')
    .select('id, telefone, texto')
    .maybeSingle();

  return Response.json({ mensagem: reservada || null, ativo: true });
}

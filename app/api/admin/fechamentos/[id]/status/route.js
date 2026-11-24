import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enfileirarAgradecimento } from '@/lib/whatsapp';

export async function PATCH(request, { params }) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { status } = body || {};
  if (!['pendente', 'concluido'].includes(status)) {
    return Response.json({ erro: 'Status inválido.' }, { status: 400 });
  }

  // "Concluído" libera a mesa/comanda para o próximo cliente.
  const db = supabaseAdmin();
  const { data: anterior } = await db.from('csf_fechamentos').select('status').eq('id', id).maybeSingle();

  const concluidoEm = status === 'concluido' ? new Date().toISOString() : null;
  const { data: fechamento, error } = await db
    .from('csf_fechamentos')
    .update({ status, concluido_em: concluidoEm })
    .eq('id', id)
    .select('id, mesa, criado_em')
    .maybeSingle();
  if (error) return Response.json({ erro: error.message }, { status: 500 });

  // Conta paga e concluída: se o cliente deixou o WhatsApp, a mensagem de agradecimento entra na fila.
  // (Uma falha aqui nunca atrapalha o fechamento da conta.)
  let whatsapp = null;
  if (status === 'concluido' && anterior?.status !== 'concluido' && fechamento) {
    try {
      whatsapp = await enfileirarAgradecimento(fechamento);
    } catch {
      whatsapp = { enfileirada: false, motivo: 'erro' };
    }
  }

  return Response.json({ ok: true, whatsapp });
}

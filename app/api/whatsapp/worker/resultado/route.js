import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenValido } from '@/lib/whatsapp';

export const runtime = 'nodejs';

// O programa do WhatsApp conta se conseguiu enviar. Body: { id, ok, erro?, definitivo? }
// definitivo = true quando não adianta tentar de novo (ex: o número não tem WhatsApp).
export async function POST(request) {
  if (!(await tokenValido(request))) return Response.json({ erro: 'Não autorizado.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });

  const db = supabaseAdmin();
  if (body.ok) {
    await db.from('csf_whatsapp_mensagens').update({ status: 'enviada', enviado_em: new Date().toISOString(), erro: null }).eq('id', id);
    return Response.json({ ok: true });
  }

  const { data: atual } = await db.from('csf_whatsapp_mensagens').select('tentativas').eq('id', id).maybeSingle();
  const esgotou = body.definitivo === true || (atual?.tentativas ?? 3) >= 3;
  await db
    .from('csf_whatsapp_mensagens')
    .update({ status: esgotou ? 'erro' : 'pendente', erro: String(body.erro || 'Falha ao enviar').slice(0, 300) })
    .eq('id', id);
  return Response.json({ ok: true });
}

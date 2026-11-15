import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { devolverEstoqueDosItens, rebaixarEstoqueDosItens, itensDoPedido } from '@/lib/estoque';

const STATUS_VALIDOS = ['recebido', 'em preparo', 'pronto', 'entregue', 'cancelado'];

export async function PATCH(request, { params }) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { status } = body || {};
  if (!STATUS_VALIDOS.includes(status)) {
    return Response.json({ erro: 'Status inválido.' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: atual } = await db.from('csf_pedidos').select('status').eq('id', id).maybeSingle();
  if (!atual) return Response.json({ erro: 'Pedido não encontrado.' }, { status: 404 });

  const { error } = await db.from('csf_pedidos').update({ status }).eq('id', id);
  if (error) return Response.json({ erro: error.message }, { status: 500 });

  // Cancelar devolve os itens ao estoque; reabrir um pedido cancelado desconta de novo.
  if (atual.status !== 'cancelado' && status === 'cancelado') {
    await devolverEstoqueDosItens(await itensDoPedido(Number(id)));
  } else if (atual.status === 'cancelado' && status !== 'cancelado') {
    await rebaixarEstoqueDosItens(await itensDoPedido(Number(id)));
  }

  return Response.json({ ok: true });
}

import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { devolverEstoqueDosItens, itensDoPedido } from '@/lib/estoque';
import { atualizarFechamentoPendente, normalizarMesa } from '@/lib/contas';
import { emitir } from '@/lib/eventos';

// Exclui um pedido (os itens dele saem junto, pela chave estrangeira com "on delete cascade").
export async function DELETE(request, { params }) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const { id } = await params;
  const pedidoId = Number(id);
  if (!Number.isInteger(pedidoId)) return Response.json({ erro: 'Pedido inválido.' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: existente } = await db.from('csf_pedidos').select('id, status, mesa').eq('id', pedidoId).maybeSingle();
  if (!existente) return Response.json({ erro: 'Pedido não encontrado.' }, { status: 404 });

  // Pedido que ainda estava "valendo" devolve os itens ao estoque (os cancelados já devolveram).
  const itens = existente.status !== 'cancelado' ? await itensDoPedido(pedidoId) : [];

  const { error } = await db.from('csf_pedidos').delete().eq('id', pedidoId);
  if (error) return Response.json({ erro: error.message }, { status: 500 });

  if (itens.length) await devolverEstoqueDosItens(itens);
  await atualizarFechamentoPendente(existente.mesa);
  emitir('comanda', { mesa: normalizarMesa(existente.mesa) });

  return Response.json({ ok: true });
}

import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { atualizarFechamentoPendente, pedidoJaFechado } from '@/lib/contas';
import { devolverEstoqueDosItens } from '@/lib/estoque';

async function carregar(db, itemId) {
  const { data: item } = await db
    .from('csf_itens_pedido')
    .select('id, pedido_id, quantidade, preco_unitario, subtotal, baixas')
    .eq('id', itemId)
    .maybeSingle();
  if (!item) return {};
  const { data: pedido } = await db
    .from('csf_pedidos')
    .select('id, mesa, status, criado_em')
    .eq('id', item.pedido_id)
    .maybeSingle();
  return { item, pedido };
}

// Refaz o total do pedido; sem itens, o pedido é apagado. Devolve true se o pedido foi apagado.
async function refazerTotal(db, pedidoId) {
  const { data: restantes } = await db.from('csf_itens_pedido').select('subtotal').eq('pedido_id', pedidoId);
  if (!restantes || restantes.length === 0) {
    await db.from('csf_pedidos').delete().eq('id', pedidoId);
    return true;
  }
  const total = restantes.reduce((soma, i) => soma + Number(i.subtotal), 0);
  await db.from('csf_pedidos').update({ total }).eq('id', pedidoId);
  return false;
}

// Tira um prato do pedido (a linha toda). O estoque que ele tinha gasto volta.
export async function DELETE(request, { params }) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) return Response.json({ erro: 'Item inválido.' }, { status: 400 });

  const db = supabaseAdmin();
  const { item, pedido } = await carregar(db, itemId);
  if (!item || !pedido) return Response.json({ erro: 'Item não encontrado.' }, { status: 404 });
  if (await pedidoJaFechado(pedido)) {
    return Response.json({ erro: 'A conta deste pedido já foi fechada e não pode mais ser alterada.' }, { status: 409 });
  }

  const { error } = await db.from('csf_itens_pedido').delete().eq('id', itemId);
  if (error) return Response.json({ erro: error.message }, { status: 500 });
  if (pedido.status !== 'cancelado') await devolverEstoqueDosItens([item]);

  const pedidoRemovido = await refazerTotal(db, pedido.id);
  await atualizarFechamentoPendente(pedido.mesa);
  return Response.json({ ok: true, pedidoRemovido });
}

// Diminui 1 unidade do prato no pedido. Body: { delta: -1 }
export async function PATCH(request, { params }) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const { id } = await params;
  const itemId = Number(id);
  const body = await request.json().catch(() => ({}));
  if (!Number.isInteger(itemId) || body?.delta !== -1) {
    return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { item, pedido } = await carregar(db, itemId);
  if (!item || !pedido) return Response.json({ erro: 'Item não encontrado.' }, { status: 404 });
  if (item.quantidade <= 1) {
    return Response.json({ erro: 'Só resta 1 unidade. Use "Tirar" para remover o prato.' }, { status: 400 });
  }
  if (await pedidoJaFechado(pedido)) {
    return Response.json({ erro: 'A conta deste pedido já foi fechada e não pode mais ser alterada.' }, { status: 409 });
  }

  // 1 unidade do prato = fatia proporcional do que o item gastou do estoque
  const baixas = Array.isArray(item.baixas) ? item.baixas : [];
  const porUnidade = baixas.map((b) => ({ item_id: b.item_id, unidades: Math.round(Number(b.unidades) / item.quantidade) }));
  const baixasNovas = baixas.map((b, i) => ({ item_id: b.item_id, unidades: Number(b.unidades) - porUnidade[i].unidades }));

  const novaQtd = item.quantidade - 1;
  const novoSubtotal = Math.round(Number(item.preco_unitario) * novaQtd * 100) / 100;
  const { error } = await db
    .from('csf_itens_pedido')
    .update({ quantidade: novaQtd, subtotal: novoSubtotal, baixas: baixas.length ? baixasNovas : item.baixas })
    .eq('id', itemId);
  if (error) return Response.json({ erro: error.message }, { status: 500 });
  if (pedido.status !== 'cancelado' && porUnidade.length) await devolverEstoqueDosItens([{ baixas: porUnidade }]);

  await refazerTotal(db, pedido.id);
  await atualizarFechamentoPendente(pedido.mesa);
  return Response.json({ ok: true });
}

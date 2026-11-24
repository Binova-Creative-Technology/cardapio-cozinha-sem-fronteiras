import { requireAuth } from '@/lib/auth';
import { criarPedido } from '@/lib/pedidos';
import { atualizarFechamentoPendente, normalizarMesa } from '@/lib/contas';

// A equipe cria um pedido novo dentro de uma comanda (ex: cliente pediu mais uma coisa no balcão).
// Funciona mesmo com o restaurante fechado para pedidos. Body: { mesa, itens: [{ pratoId, quantidade, opcoes, observacao }], observacao }
export async function POST(request) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const body = await request.json().catch(() => ({}));
  const mesa = normalizarMesa(body?.mesa);
  if (!mesa) return Response.json({ erro: 'Informe a mesa ou comanda.' }, { status: 400 });

  const r = await criarPedido({ mesa, observacao: body?.observacao, itens: body?.itens });
  if (r.erro) return Response.json({ erro: r.erro }, { status: r.status });

  await atualizarFechamentoPendente(mesa);
  return Response.json({ pedidoId: r.pedidoId, total: r.total }, { status: 201 });
}

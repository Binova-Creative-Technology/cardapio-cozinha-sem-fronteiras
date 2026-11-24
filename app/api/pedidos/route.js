import { getConfig } from '@/lib/config';
import { criarPedido } from '@/lib/pedidos';

export async function POST(request) {
  const aberto = (await getConfig('loja_aberta')) !== '0';
  if (!aberto) {
    return Response.json({ erro: 'O restaurante não está aceitando pedidos no momento.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { mesa, observacao, itens, clienteNome, clienteWhatsapp } = body || {};

  const r = await criarPedido({ mesa, observacao, itens, clienteNome, clienteWhatsapp });
  if (r.erro) return Response.json({ erro: r.erro }, { status: r.status });
  return Response.json({ pedidoId: r.pedidoId, total: r.total, criadoEm: r.criadoEm }, { status: 201 });
}

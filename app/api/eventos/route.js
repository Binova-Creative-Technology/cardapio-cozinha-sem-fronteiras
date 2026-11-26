import { respostaSSE } from '@/lib/eventos';
import { normalizarMesa } from '@/lib/contas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cliente com a comanda aberta: recebe só o aviso "sua comanda mudou" (sem dados), e aí busca de novo.
export async function GET(request) {
  const mesa = normalizarMesa(new URL(request.url).searchParams.get('comanda'));
  if (!mesa) return Response.json({ erro: 'Informe a comanda.' }, { status: 400 });
  return respostaSSE(request, (ev) => ev.canal === 'comanda' && ev.mesa === mesa);
}

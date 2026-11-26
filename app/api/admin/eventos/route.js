import { requireAuth } from '@/lib/auth';
import { respostaSSE } from '@/lib/eventos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Painel: recebe na hora pedido novo, pedido de conta e mudanças do WhatsApp.
export async function GET(request) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;
  return respostaSSE(request, () => true);
}

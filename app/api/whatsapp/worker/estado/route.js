import { setConfig } from '@/lib/config';
import { tokenValido } from '@/lib/whatsapp';

export const runtime = 'nodejs';

const STATUS_VALIDOS = ['iniciando', 'aguardando_qr', 'conectado', 'desconectado'];

// O programa do WhatsApp avisa em que pé está (e manda o QR quando precisa conectar).
// Body: { status, qr?, numero? }. Também serve de "sinal de vida".
export async function POST(request) {
  if (!(await tokenValido(request))) return Response.json({ erro: 'Não autorizado.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (!STATUS_VALIDOS.includes(body?.status)) return Response.json({ erro: 'Status inválido.' }, { status: 400 });

  await setConfig(
    'whatsapp_estado',
    JSON.stringify({
      status: body.status,
      qr: body.status === 'aguardando_qr' ? String(body.qr || '').slice(0, 2000) : '',
      numero: String(body.numero || '').replace(/\D/g, '').slice(0, 20),
      atualizadoEm: new Date().toISOString(),
    }),
  );
  return Response.json({ ok: true });
}

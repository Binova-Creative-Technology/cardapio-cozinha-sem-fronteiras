import { baixarArquivo } from '@/lib/armazenamento';

// Entrega fotos e logo do bucket. O nome tem a data do envio e nunca muda de conteúdo,
// então o navegador e o cache da borda guardam por 1 ano.
export async function GET(request, { params }) {
  const { nome } = await params;
  const r = await baixarArquivo(nome).catch(() => null);
  if (!r) return new Response('Não encontrado', { status: 404 });
  return new Response(r.body, {
    headers: {
      'content-type': r.headers.get('content-type') || 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}

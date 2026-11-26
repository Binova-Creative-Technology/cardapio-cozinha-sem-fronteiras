import { EventEmitter } from 'node:events';

// Avisos em tempo real (SSE): a rota que grava algo chama emitir(); quem está com o painel ou a
// comanda aberta recebe na hora, sem ficar consultando o servidor em loop.
// shortcut: guardado na memória do processo, vale com 1 instância do app (Railway). Com mais de
// uma réplica, trocar por LISTEN/NOTIFY do Postgres.
const bus = (globalThis.__csfEventos ??= new EventEmitter());
bus.setMaxListeners(0);

// canal: 'pedido' (pedido novo), 'fechamento' (mesa pediu a conta), 'comanda' (algo mudou na
// comanda da mesa), 'whatsapp' (estado ou fila do WhatsApp)
export function emitir(canal, dados = {}) {
  bus.emit('evento', { canal, ...dados });
}

// Resposta SSE que repassa os eventos aceitos pelo filtro. Mantém a conexão viva com um
// comentário a cada 25 s (proxies derrubam conexões paradas).
export function respostaSSE(request, filtro) {
  const enc = new TextEncoder();
  let fechar = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const enviar = (texto) => {
        try {
          controller.enqueue(enc.encode(texto));
        } catch {
          fechar();
        }
      };
      const aoEvento = (ev) => {
        if (filtro(ev)) enviar(`data: ${JSON.stringify(ev)}\n\n`);
      };
      const batida = setInterval(() => enviar(': ok\n\n'), 25000);
      fechar = () => {
        clearInterval(batida);
        bus.off('evento', aoEvento);
        try {
          controller.close();
        } catch {}
      };
      bus.on('evento', aoEvento);
      enviar('retry: 3000\n\n');
      request.signal.addEventListener('abort', () => fechar());
    },
    cancel() {
      fechar();
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

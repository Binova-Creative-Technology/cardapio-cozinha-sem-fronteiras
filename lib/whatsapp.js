import crypto from 'node:crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { getConfig, setConfig } from './config';
import { pedidosDaComanda } from './contas';

// WhatsApp de agradecimento. O envio de verdade é feito pelo programa "whatsapp-worker"
// (roda no computador do restaurante); aqui só ficam a fila e as configurações.

export const MENSAGEM_PADRAO =
  'Olá, {nome}! 😊 Obrigado por escolher a {loja}! Foi um prazer receber você.\n\n' +
  '⭐ Se puder, avalie a gente no Google (leva 1 minuto):\n{google}\n\n' +
  '📸 E siga a gente no Instagram:\n{instagram}\n\n' +
  'Volte sempre! (Se não quiser mais receber mensagens, é só nos avisar por aqui.)';

// Número brasileiro: só dígitos, 10 ou 11 (DDD + número), com ou sem 55. Devolve "55DDDNÚMERO" ou null.
export function normalizarTelefone(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  return '55' + d;
}

export async function lerConfigWhatsapp() {
  const [ativo, google, instagram, mensagem] = await Promise.all([
    getConfig('whatsapp_ativo'),
    getConfig('whatsapp_link_google'),
    getConfig('whatsapp_link_instagram'),
    getConfig('whatsapp_mensagem'),
  ]);
  return {
    ativo: ativo === '1',
    linkGoogle: google || '',
    linkInstagram: instagram || '',
    mensagem: mensagem || MENSAGEM_PADRAO,
  };
}

export function montarTexto(modelo, { nome, loja, google, instagram }) {
  const primeiroNome = String(nome || '').trim().split(/\s+/)[0] || 'cliente';
  const texto = String(modelo || MENSAGEM_PADRAO)
    .replaceAll('{nome}', primeiroNome)
    .replaceAll('{loja}', loja || '')
    .replaceAll('{google}', google || '')
    .replaceAll('{instagram}', instagram || '');
  // sem links cadastrados, não deixa linhas soltas só com o emoji
  return texto.replace(/\n{3,}/g, '\n\n').trim();
}

// Token que o programa do WhatsApp usa para falar com este sistema (gerado na primeira vez).
export async function tokenDoWorker() {
  let token = await getConfig('whatsapp_token');
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    await setConfig('whatsapp_token', token);
  }
  return token;
}

export async function tokenValido(request) {
  const cabecalho = request.headers.get('authorization') || '';
  const enviado = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : '';
  const esperado = await getConfig('whatsapp_token');
  if (!esperado || !enviado) return false;
  const a = Buffer.from(enviado);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Webhook: avisa o programa do WhatsApp (serviço no Railway) que há mensagem na fila, para enviar na hora
// em vez de esperar a próxima checagem dele. Nunca trava nem derruba quem chamou.
export function acordarWorker() {
  const url = process.env.WHATSAPP_WORKER_URL;
  if (!url) return;
  getConfig('whatsapp_token')
    .then((token) =>
      fetch(url.replace(/\/+$/, '') + '/acordar', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(3000),
      }),
    )
    .catch(() => {});
}

export async function lerEstadoWorker() {
  try {
    const bruto = await getConfig('whatsapp_estado');
    return bruto ? JSON.parse(bruto) : { status: 'sem_programa' };
  } catch {
    return { status: 'sem_programa' };
  }
}

// Procura o contato do cliente nos pedidos da comanda e, se o WhatsApp estiver ligado,
// coloca a mensagem de agradecimento na fila (no máximo uma por conta).
export async function enfileirarAgradecimento(fechamento) {
  const config = await lerConfigWhatsapp();
  if (!config.ativo) return { enfileirada: false, motivo: 'desligado' };

  const pedidos = await pedidosDaComanda(fechamento.mesa, fechamento.criado_em);
  let contato = null;
  for (const p of [...pedidos].reverse()) {
    const tel = normalizarTelefone(p.cliente_whatsapp);
    if (tel) {
      contato = { telefone: tel, nome: p.cliente_nome || '' };
      break;
    }
  }
  if (!contato) return { enfileirada: false, motivo: 'sem_numero' };

  const loja = (await getConfig('nome_loja')) || 'Cozinha Sem Fronteiras';
  const texto = montarTexto(config.mensagem, {
    nome: contato.nome,
    loja,
    google: config.linkGoogle,
    instagram: config.linkInstagram,
  });

  const { error } = await supabaseAdmin().from('csf_whatsapp_mensagens').insert({
    fechamento_id: fechamento.id,
    nome: contato.nome,
    telefone: contato.telefone,
    texto,
  });
  if (error) {
    if (error.code === '23505') return { enfileirada: false, motivo: 'ja_enfileirada' };
    throw error;
  }
  return { enfileirada: true };
}

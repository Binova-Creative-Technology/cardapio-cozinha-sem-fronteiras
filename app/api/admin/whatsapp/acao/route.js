import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getConfig } from '@/lib/config';
import { lerConfigWhatsapp, montarTexto, normalizarTelefone } from '@/lib/whatsapp';

// Ações da tela WhatsApp. Body:
//  { acao: 'teste', telefone }      -> manda a mensagem de agradecimento para o número informado (teste)
//  { acao: 'reenviar', id }         -> volta uma mensagem com erro para a fila
//  { acao: 'cancelar', id }         -> tira uma mensagem pendente da fila
export async function POST(request) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const body = await request.json().catch(() => ({}));
  const db = supabaseAdmin();

  if (body?.acao === 'teste') {
    const telefone = normalizarTelefone(body.telefone);
    if (!telefone) return Response.json({ erro: 'Número inválido. Use DDD + número, ex: (11) 91234-5678.' }, { status: 400 });
    const config = await lerConfigWhatsapp();
    const loja = (await getConfig('nome_loja')) || 'Cozinha Sem Fronteiras';
    const texto = montarTexto(config.mensagem, {
      nome: 'Teste',
      loja,
      google: config.linkGoogle,
      instagram: config.linkInstagram,
    });
    const { error } = await db.from('csf_whatsapp_mensagens').insert({ nome: 'Teste', telefone, texto });
    if (error) return Response.json({ erro: error.message }, { status: 500 });
    return Response.json({ ok: true, avisoDesligado: !config.ativo });
  }

  const id = Number(body?.id);
  if (!Number.isInteger(id)) return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });

  if (body?.acao === 'reenviar') {
    await db.from('csf_whatsapp_mensagens').update({ status: 'pendente', tentativas: 0, erro: null }).eq('id', id).eq('status', 'erro');
    return Response.json({ ok: true });
  }
  if (body?.acao === 'cancelar') {
    await db.from('csf_whatsapp_mensagens').delete().eq('id', id).in('status', ['pendente', 'erro']);
    return Response.json({ ok: true });
  }
  return Response.json({ erro: 'Ação inválida.' }, { status: 400 });
}

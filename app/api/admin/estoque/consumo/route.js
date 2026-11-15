import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Define o que um prato (ou uma opção) consome do estoque por porção pedida.
// Body: { tipo: 'prato' | 'opcao', id, consumo: [{ itemId, unidades }] }  (lista vazia = não controla)
export async function PUT(request) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const body = await request.json().catch(() => ({}));
  const { tipo } = body || {};
  const id = Number(body?.id);
  if (!['prato', 'opcao'].includes(tipo) || !Number.isInteger(id) || !Array.isArray(body?.consumo)) {
    return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });
  }

  // junta repetidos do mesmo item
  const porItem = new Map();
  for (const c of body.consumo) {
    const itemId = Number(c?.itemId);
    const unidades = Number(c?.unidades);
    if (!Number.isInteger(itemId) || !Number.isInteger(unidades) || unidades < 1 || unidades > 1000) {
      return Response.json({ erro: 'Cada linha precisa de um item e de unidades (1 ou mais).' }, { status: 400 });
    }
    porItem.set(itemId, (porItem.get(itemId) || 0) + unidades);
  }

  const db = supabaseAdmin();
  const { error: erroApaga } = await db.from('csf_consumo').delete().eq('tipo', tipo).eq('ref_id', id);
  if (erroApaga) return Response.json({ erro: erroApaga.message }, { status: 500 });

  if (porItem.size) {
    const { error } = await db
      .from('csf_consumo')
      .insert([...porItem].map(([item_id, unidades]) => ({ tipo, ref_id: id, item_id, unidades })));
    if (error) return Response.json({ erro: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

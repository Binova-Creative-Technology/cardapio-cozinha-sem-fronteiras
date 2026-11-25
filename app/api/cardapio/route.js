import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { gruposDosPratos } from '@/lib/opcoes';
import { disponibilidade } from '@/lib/estoque';
import { CARDAPIO_RESERVA } from '@/lib/cardapio-reserva';

export async function GET() {
  try {
    const resultado = await cardapioDoBanco();
    // Guardado por 20 s na rede da Vercel: vários clientes ao mesmo tempo usam a mesma consulta ao banco.
    // (O pedido em si é sempre conferido no servidor, então não há risco de vender o que acabou.)
    return Response.json(resultado, { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' } });
  } catch (err) {
    // Banco fora do ar: o cliente vê a cópia do cardápio e mostra o pedido ao atendente.
    console.error('Cardápio de reserva em uso:', err?.message || err);
    return Response.json(CARDAPIO_RESERVA, {
      headers: { 'X-Modo-Reserva': '1', 'Cache-Control': 'public, s-maxage=30' },
    });
  }
}

async function cardapioDoBanco() {
  const db = supabaseAdmin();

  const { data: categorias, error: erroCat } = await db
    .from('csf_categorias')
    .select('id, nome')
    .order('ordem')
    .order('id');
  if (erroCat) throw erroCat;

  const { data: pratos, error: erroPratos } = await db
    .from('csf_pratos')
    .select('id, categoria_id, nome, descricao, preco, foto, tempo_preparo, peso, quantidade, observacao')
    .eq('ativo', true)
    .order('ordem')
    .order('id');
  if (erroPratos) throw erroPratos;

  const grupos = await gruposDosPratos(pratos.map((p) => p.id));
  const opcaoIds = Object.values(grupos).flatMap((gs) => gs.flatMap((g) => g.opcoes.map((o) => o.id)));
  const disp = await disponibilidade(pratos.map((p) => p.id), opcaoIds);

  // "estoque" que o cliente recebe = quantas PORÇÕES ainda dá para pedir (null = sem controle)
  return categorias
    .map((cat) => ({
      id: cat.id,
      nome: cat.nome,
      pratos: pratos
        .filter((p) => p.categoria_id === cat.id)
        .map((p) => ({
          ...p,
          estoque: disp.pratos.get(p.id) ?? null,
          grupos: (grupos[p.id] || []).map((g) => ({
            ...g,
            opcoes: g.opcoes.map((o) => ({ ...o, estoque: disp.opcoes.get(o.id) ?? null })),
          })),
        })),
    }))
    .filter((cat) => cat.pratos.length > 0);
}

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { gruposDosPratos } from '@/lib/opcoes';
import { disponibilidade } from '@/lib/estoque';

export async function GET() {
  const db = supabaseAdmin();

  const { data: categorias, error: erroCat } = await db
    .from('csf_categorias')
    .select('id, nome')
    .order('ordem')
    .order('id');
  if (erroCat) return Response.json({ erro: erroCat.message }, { status: 500 });

  const { data: pratos, error: erroPratos } = await db
    .from('csf_pratos')
    .select('id, categoria_id, nome, descricao, preco, foto, tempo_preparo, peso, quantidade, observacao')
    .eq('ativo', true)
    .order('ordem')
    .order('id');
  if (erroPratos) return Response.json({ erro: erroPratos.message }, { status: 500 });

  let grupos;
  let disp;
  try {
    grupos = await gruposDosPratos(pratos.map((p) => p.id));
    const opcaoIds = Object.values(grupos).flatMap((gs) => gs.flatMap((g) => g.opcoes.map((o) => o.id)));
    disp = await disponibilidade(pratos.map((p) => p.id), opcaoIds);
  } catch (err) {
    return Response.json({ erro: err.message }, { status: 500 });
  }

  // "estoque" que o cliente recebe = quantas PORÇÕES ainda dá para pedir (null = sem controle)
  const resultado = categorias
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

  // Guardado por 20 s na rede da Vercel: vários clientes ao mesmo tempo usam a mesma consulta ao banco.
  // (O pedido em si é sempre conferido no servidor, então não há risco de vender o que acabou.)
  return Response.json(resultado, { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' } });
}

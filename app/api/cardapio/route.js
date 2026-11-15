import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { gruposDosPratos } from '@/lib/opcoes';
import { unidadesPorPorcao } from '@/lib/estoque';

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
    .select('id, categoria_id, nome, descricao, preco, foto, tempo_preparo, peso, quantidade, observacao, estoque, unidades_porcao')
    .eq('ativo', true)
    .order('ordem')
    .order('id');
  if (erroPratos) return Response.json({ erro: erroPratos.message }, { status: 500 });

  let grupos;
  try {
    grupos = await gruposDosPratos(pratos.map((p) => p.id));
  } catch (err) {
    return Response.json({ erro: err.message }, { status: 500 });
  }

  const resultado = categorias
    .map((cat) => ({
      id: cat.id,
      nome: cat.nome,
      pratos: pratos
        .filter((p) => p.categoria_id === cat.id)
        .map(({ unidades_porcao, ...p }) => ({
          ...p,
          // O estoque do prato é em unidades; o cliente vê quantas PORÇÕES ainda dá para pedir.
          estoque:
            p.estoque === null || p.estoque === undefined
              ? null
              : Math.floor(p.estoque / unidadesPorPorcao({ quantidade: p.quantidade, unidades_porcao })),
          grupos: grupos[p.id] || [],
        })),
    }))
    .filter((cat) => cat.pratos.length > 0);

  return Response.json(resultado);
}

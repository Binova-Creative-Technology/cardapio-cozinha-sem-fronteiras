import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Lista o estoque de todos os pratos e de cada opção. estoque = null significa "sem controle".
export async function GET() {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const db = supabaseAdmin();
  const { data: categorias, error: erroCat } = await db.from('csf_categorias').select('id, nome').order('ordem').order('id');
  if (erroCat) return Response.json({ erro: erroCat.message }, { status: 500 });

  const { data: pratos, error: erroPratos } = await db
    .from('csf_pratos')
    .select('id, categoria_id, nome, estoque, ativo')
    .order('ordem')
    .order('id');
  if (erroPratos) return Response.json({ erro: erroPratos.message }, { status: 500 });

  const { data: grupos, error: erroGrupos } = await db
    .from('csf_grupos_opcao')
    .select('id, prato_id, nome')
    .order('ordem')
    .order('id');
  if (erroGrupos) return Response.json({ erro: erroGrupos.message }, { status: 500 });

  const { data: opcoes, error: erroOpcoes } = await db
    .from('csf_opcoes')
    .select('id, grupo_id, nome, estoque')
    .order('ordem')
    .order('id');
  if (erroOpcoes) return Response.json({ erro: erroOpcoes.message }, { status: 500 });

  const resultado = categorias
    .map((cat) => ({
      id: cat.id,
      nome: cat.nome,
      pratos: pratos
        .filter((p) => p.categoria_id === cat.id)
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          ativo: p.ativo,
          estoque: p.estoque,
          grupos: grupos
            .filter((g) => g.prato_id === p.id)
            .map((g) => ({
              id: g.id,
              nome: g.nome,
              opcoes: opcoes
                .filter((o) => o.grupo_id === g.id)
                .map((o) => ({ id: o.id, nome: o.nome, estoque: o.estoque })),
            })),
        })),
    }))
    .filter((cat) => cat.pratos.length > 0);

  return Response.json(resultado);
}

// Define o estoque de um prato ou de uma opção.
// Body: { tipo: 'prato' | 'opcao', id, estoque: número inteiro >= 0, ou null para "sem controle" }
export async function PATCH(request) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const body = await request.json().catch(() => ({}));
  const { tipo, id } = body || {};
  let { estoque } = body || {};

  if (!['prato', 'opcao'].includes(tipo) || !Number.isInteger(Number(id))) {
    return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });
  }
  if (estoque === '' || estoque === null || estoque === undefined) {
    estoque = null;
  } else {
    estoque = Number(estoque);
    if (!Number.isInteger(estoque) || estoque < 0 || estoque > 100000) {
      return Response.json({ erro: 'Informe um número inteiro de 0 a 100000.' }, { status: 400 });
    }
  }

  const { error } = await supabaseAdmin()
    .from(tipo === 'prato' ? 'csf_pratos' : 'csf_opcoes')
    .update({ estoque })
    .eq('id', Number(id));
  if (error) return Response.json({ erro: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

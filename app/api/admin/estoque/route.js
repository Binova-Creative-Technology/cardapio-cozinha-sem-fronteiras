import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Estoque: itens (o que existe na cozinha) e o que cada prato/opção consome.
export async function GET() {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const db = supabaseAdmin();
  const consultas = await Promise.all([
    db.from('csf_estoque_itens').select('id, nome, quantidade').order('nome'),
    db.from('csf_consumo').select('tipo, ref_id, item_id, unidades'),
    db.from('csf_categorias').select('id, nome').order('ordem').order('id'),
    db.from('csf_pratos').select('id, categoria_id, nome, ativo').order('ordem').order('id'),
    db.from('csf_grupos_opcao').select('id, prato_id, nome').order('ordem').order('id'),
    db.from('csf_opcoes').select('id, grupo_id, nome').order('ordem').order('id'),
  ]);
  const falha = consultas.find((c) => c.error);
  if (falha) return Response.json({ erro: falha.error.message }, { status: 500 });
  const [itens, consumo, categorias, pratos, grupos, opcoes] = consultas.map((c) => c.data);

  const consumoDe = (tipo, id) =>
    consumo
      .filter((c) => c.tipo === tipo && c.ref_id === id)
      .map((c) => ({ itemId: c.item_id, unidades: c.unidades }));

  const cardapio = categorias
    .map((cat) => ({
      id: cat.id,
      nome: cat.nome,
      pratos: pratos
        .filter((p) => p.categoria_id === cat.id)
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          ativo: p.ativo,
          consumo: consumoDe('prato', p.id),
          grupos: grupos
            .filter((g) => g.prato_id === p.id)
            .map((g) => ({
              id: g.id,
              nome: g.nome,
              opcoes: opcoes
                .filter((o) => o.grupo_id === g.id)
                .map((o) => ({ id: o.id, nome: o.nome, consumo: consumoDe('opcao', o.id) })),
            })),
        })),
    }))
    .filter((cat) => cat.pratos.length > 0);

  return Response.json({ itens, cardapio });
}

function lerQuantidade(valor) {
  if (valor === '' || valor === null || valor === undefined) return { ok: true, valor: null };
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0 || n > 1000000) return { ok: false };
  return { ok: true, valor: n };
}

// Cria um item de estoque. Body: { nome, quantidade (opcional; em branco = sem controle) }
export async function POST(request) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const body = await request.json().catch(() => ({}));
  const nome = String(body?.nome || '').trim().slice(0, 80);
  if (!nome) return Response.json({ erro: 'Dê um nome ao item.' }, { status: 400 });
  const q = lerQuantidade(body?.quantidade);
  if (!q.ok) return Response.json({ erro: 'Quantidade inválida (número inteiro, 0 ou mais).' }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from('csf_estoque_itens')
    .insert({ nome, quantidade: q.valor })
    .select('id')
    .single();
  if (error) return Response.json({ erro: error.message }, { status: 500 });
  return Response.json({ id: data.id }, { status: 201 });
}

// Muda um item. Body: { id, nome?, quantidade? (define o total), somar? (entrada: soma ao que já tem) }
export async function PATCH(request) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return Response.json({ erro: 'Item inválido.' }, { status: 400 });

  const db = supabaseAdmin();
  const atualizacao = {};

  if (body.nome !== undefined) {
    const nome = String(body.nome).trim().slice(0, 80);
    if (!nome) return Response.json({ erro: 'O nome não pode ficar vazio.' }, { status: 400 });
    atualizacao.nome = nome;
  }

  if (body.somar !== undefined) {
    const soma = Number(body.somar);
    if (!Number.isInteger(soma) || soma === 0 || Math.abs(soma) > 1000000) {
      return Response.json({ erro: 'Informe um número inteiro para somar.' }, { status: 400 });
    }
    const { data: atual } = await db.from('csf_estoque_itens').select('quantidade').eq('id', id).maybeSingle();
    if (!atual) return Response.json({ erro: 'Item não encontrado.' }, { status: 404 });
    atualizacao.quantidade = Math.max(0, (atual.quantidade ?? 0) + soma);
  } else if (body.quantidade !== undefined) {
    const q = lerQuantidade(body.quantidade);
    if (!q.ok) return Response.json({ erro: 'Quantidade inválida (número inteiro, 0 ou mais).' }, { status: 400 });
    atualizacao.quantidade = q.valor;
  }

  if (Object.keys(atualizacao).length === 0) return Response.json({ erro: 'Nada para alterar.' }, { status: 400 });

  const { error } = await db.from('csf_estoque_itens').update(atualizacao).eq('id', id);
  if (error) return Response.json({ erro: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

// Exclui um item de estoque (e o consumo ligado a ele). ?id=
export async function DELETE(request) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return Response.json({ erro: 'Item inválido.' }, { status: 400 });

  const { error } = await supabaseAdmin().from('csf_estoque_itens').delete().eq('id', id);
  if (error) return Response.json({ erro: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { gruposDosPratos } from '@/lib/opcoes';

export async function GET(request, { params }) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const { id } = await params;
  try {
    const grupos = await gruposDosPratos([Number(id)]);
    return Response.json(grupos[Number(id)] || []);
  } catch (err) {
    return Response.json({ erro: err.message }, { status: 500 });
  }
}

// Substitui todas as opções do prato pelas enviadas.
// Body: { grupos: [{ nome, tipo: 'unica'|'extra', opcoes: [{ nome, precoAdicional }] }] }
export async function PUT(request, { params }) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const { id } = await params;
  const pratoId = Number(id);
  const body = await request.json().catch(() => ({}));
  const entrada = Array.isArray(body?.grupos) ? body.grupos : null;
  if (!entrada) return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });
  if (entrada.length > 20) return Response.json({ erro: 'Grupos demais.' }, { status: 400 });

  const grupos = [];
  for (const g of entrada) {
    const nome = String(g?.nome || '').trim().slice(0, 60);
    if (!nome) return Response.json({ erro: 'Todo grupo precisa de um nome.' }, { status: 400 });
    const tipo = g?.tipo === 'extra' ? 'extra' : 'unica';
    const opcoes = (Array.isArray(g?.opcoes) ? g.opcoes : [])
      .map((o) => ({
        nome: String(o?.nome || '').trim().slice(0, 80),
        descricao: String(o?.descricao || '').trim().slice(0, 200),
        // id que a opção tinha antes (para não perder o que ela consome do estoque ao regravar)
        idAntigo: Number.isInteger(Number(o?.id)) && Number(o.id) > 0 ? Number(o.id) : null,
        precoAdicional: Number(String(o?.precoAdicional ?? 0).replace(',', '.')) || 0,
      }))
      .filter((o) => o.nome);
    if (opcoes.some((o) => o.precoAdicional < 0 || o.precoAdicional > 10000)) {
      return Response.json({ erro: 'Valor adicional inválido.' }, { status: 400 });
    }
    if (opcoes.length === 0) {
      return Response.json({ erro: `O grupo "${nome}" precisa de pelo menos uma opção.` }, { status: 400 });
    }
    if (opcoes.length > 60) return Response.json({ erro: `Opções demais em "${nome}".` }, { status: 400 });
    grupos.push({ nome, tipo, opcoes });
  }

  const db = supabaseAdmin();
  const { data: prato } = await db.from('csf_pratos').select('id').eq('id', pratoId).maybeSingle();
  if (!prato) return Response.json({ erro: 'Prato não encontrado.' }, { status: 404 });

  const { data: antigos, error: erroAntigos } = await db.from('csf_grupos_opcao').select('id').eq('prato_id', pratoId);
  if (erroAntigos) return Response.json({ erro: erroAntigos.message }, { status: 500 });

  const idsAntigosGrupos = (antigos || []).map((a) => a.id);
  let idsOpcoesAntigas = [];
  if (idsAntigosGrupos.length) {
    const { data: opcoesAntigas } = await db.from('csf_opcoes').select('id').in('grupo_id', idsAntigosGrupos);
    idsOpcoesAntigas = (opcoesAntigas || []).map((o) => o.id);
  }
  const antigasSet = new Set(idsOpcoesAntigas);
  const correspondencia = []; // [idAntigo, idNovo]

  // Cria os novos primeiro; só depois remove os antigos (se algo falhar, nada se perde).
  const criados = [];
  for (let gi = 0; gi < grupos.length; gi++) {
    const g = grupos[gi];
    const { data: grupo, error } = await db
      .from('csf_grupos_opcao')
      .insert({ prato_id: pratoId, nome: g.nome, tipo: g.tipo, ordem: gi })
      .select('id')
      .single();
    if (error) {
      if (criados.length) await db.from('csf_grupos_opcao').delete().in('id', criados);
      return Response.json({ erro: error.message }, { status: 500 });
    }
    criados.push(grupo.id);

    const { data: novas, error: erroOpcoes } = await db
      .from('csf_opcoes')
      .insert(
        g.opcoes.map((o, oi) => ({
          grupo_id: grupo.id,
          nome: o.nome,
          descricao: o.descricao,
          preco_adicional: o.precoAdicional,
          ordem: oi,
        })),
      )
      .select('id, ordem');
    if (erroOpcoes) {
      await db.from('csf_grupos_opcao').delete().in('id', criados);
      return Response.json({ erro: erroOpcoes.message }, { status: 500 });
    }
    for (const n of novas || []) {
      const antigo = g.opcoes[n.ordem]?.idAntigo;
      if (antigo && antigasSet.has(antigo)) correspondencia.push([antigo, n.id]);
    }
  }

  // A opção nova herda o que a antiga consumia do estoque
  if (correspondencia.length) {
    const { data: consumoAntigo } = await db
      .from('csf_consumo')
      .select('ref_id, item_id, unidades')
      .eq('tipo', 'opcao')
      .in('ref_id', correspondencia.map(([antigo]) => antigo));
    const linhas = [];
    for (const c of consumoAntigo || []) {
      for (const [antigo, novo] of correspondencia) {
        if (antigo === c.ref_id) linhas.push({ tipo: 'opcao', ref_id: novo, item_id: c.item_id, unidades: c.unidades });
      }
    }
    if (linhas.length) await db.from('csf_consumo').insert(linhas);
  }

  if (idsAntigosGrupos.length) await db.from('csf_grupos_opcao').delete().in('id', idsAntigosGrupos);
  if (idsOpcoesAntigas.length) await db.from('csf_consumo').delete().eq('tipo', 'opcao').in('ref_id', idsOpcoesAntigas);

  return Response.json({ ok: true });
}

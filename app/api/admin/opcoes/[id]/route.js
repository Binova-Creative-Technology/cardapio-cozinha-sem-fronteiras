import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Ativa ou desativa uma opção ("acabou") sem precisar excluir. Body: { ativo: true | false }
export async function PATCH(request, { params }) {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const { id } = await params;
  const opcaoId = Number(id);
  const body = await request.json().catch(() => ({}));
  if (!Number.isInteger(opcaoId) || typeof body?.ativo !== 'boolean') {
    return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from('csf_opcoes')
    .update({ ativo: body.ativo })
    .eq('id', opcaoId)
    .select('id');
  if (error) return Response.json({ erro: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ erro: 'Opção não encontrada.' }, { status: 404 });

  return Response.json({ ok: true });
}

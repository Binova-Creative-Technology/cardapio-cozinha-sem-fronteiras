import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { lerQuantidadesDoNome, chaveDeNome, palavrasDoNome } from '@/lib/estoque';

// Palavras de "modo de preparo" que não mudam qual é o item ("Kibe frito de carne" = "Kibe de carne")
const PREPARO = new Set(['frito', 'frita', 'assado', 'assada', 'fechado', 'fechada', 'aberto', 'aberta']);

function mesmaCoisa(nomePrato, nomeItem) {
  const doItem = palavrasDoNome(nomeItem);
  const doPrato = palavrasDoNome(nomePrato);
  if (doItem.size === 0) return false;
  for (const p of doItem) if (!doPrato.has(p)) return false;
  for (const p of doPrato) if (!doItem.has(p) && !PREPARO.has(p)) return false;
  return true;
}

// Lê os nomes do cardápio e monta o consumo:
//  - opção "3 kibe de carne" -> 3 un. do item "Kibe de carne"; "1 Espeto de Kafta e 1 Espeto de Frango" -> 1 de cada
//  - prato simples com "Qtd: 3 un" -> 3 un. de um item com o nome dele (ou do item que for a mesma coisa)
// Não mexe em prato/opção que já tem consumo definido. Itens novos nascem SEM CONTROLE (quantidade vazia),
// então nada aparece como esgotado até você digitar as quantidades.
export async function POST() {
  const naoAutenticado = await requireAuth();
  if (naoAutenticado) return naoAutenticado;

  const db = supabaseAdmin();
  const [rItens, rConsumo, rPratos, rGrupos, rOpcoes] = await Promise.all([
    db.from('csf_estoque_itens').select('id, nome'),
    db.from('csf_consumo').select('tipo, ref_id'),
    db.from('csf_pratos').select('id, nome, quantidade'),
    db.from('csf_grupos_opcao').select('id, prato_id'),
    db.from('csf_opcoes').select('id, grupo_id, nome'),
  ]);
  const falha = [rItens, rConsumo, rPratos, rGrupos, rOpcoes].find((r) => r.error);
  if (falha) return Response.json({ erro: falha.error.message }, { status: 500 });

  const itens = rItens.data.map((i) => ({ ...i, chave: chaveDeNome(i.nome) }));
  const jaTem = new Set(rConsumo.data.map((c) => `${c.tipo}:${c.ref_id}`));
  const pratosComGrupo = new Set(rGrupos.data.map((g) => g.prato_id));
  let itensCriados = 0;

  async function itemPorNome(nome) {
    const chave = chaveDeNome(nome);
    let achado = itens.find((i) => i.chave === chave);
    if (achado) return achado.id;
    const { data, error } = await db.from('csf_estoque_itens').insert({ nome, quantidade: null }).select('id').single();
    if (error) throw error;
    itens.push({ id: data.id, nome, chave });
    itensCriados += 1;
    return data.id;
  }

  const novasLinhas = [];
  const adicionar = (tipo, ref_id, item_id, unidades) => {
    const existente = novasLinhas.find((l) => l.tipo === tipo && l.ref_id === ref_id && l.item_id === item_id);
    if (existente) existente.unidades += unidades;
    else novasLinhas.push({ tipo, ref_id, item_id, unidades });
  };

  try {
    // 1) opções com número no nome
    for (const o of rOpcoes.data) {
      if (jaTem.has(`opcao:${o.id}`)) continue;
      for (const { unidades, nome } of lerQuantidadesDoNome(o.nome)) {
        adicionar('opcao', o.id, await itemPorNome(nome), unidades);
      }
    }

    // 2) pratos simples (sem grupos de opções)
    for (const p of rPratos.data) {
      if (jaTem.has(`prato:${p.id}`) || pratosComGrupo.has(p.id)) continue;
      const m = String(p.quantidade || '').match(/^\s*(\d{1,3})/);
      const unidades = m && Number(m[1]) >= 1 ? Number(m[1]) : 1;
      const igual = itens.find((i) => mesmaCoisa(p.nome, i.nome));
      const itemId = igual ? igual.id : await itemPorNome(p.nome.trim());
      adicionar('prato', p.id, itemId, unidades);
    }

    if (novasLinhas.length) {
      const { error } = await db.from('csf_consumo').upsert(novasLinhas, { onConflict: 'tipo,ref_id,item_id' });
      if (error) throw error;
    }
  } catch (err) {
    return Response.json({ erro: err.message }, { status: 500 });
  }

  return Response.json({ itensCriados, ligacoes: novasLinhas.length });
}

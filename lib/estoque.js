import { supabaseAdmin } from './supabaseAdmin';

// Estoque: coluna "estoque" em csf_pratos e csf_opcoes. null = sem controle; 0 = esgotado.
// Cada item de pedido consome 1 do prato e 1 de cada opção escolhida, por unidade pedida.

// Junta os itens em { pratos: Map(id -> qtd), opcoes: Map(id -> qtd) }
export function consumoDosItens(itens) {
  const pratos = new Map();
  const opcoes = new Map();
  for (const item of itens) {
    const qtd = Number(item.quantidade);
    if (item.prato_id) pratos.set(item.prato_id, (pratos.get(item.prato_id) || 0) + qtd);
    const ids = Array.isArray(item.opcoesIds)
      ? item.opcoesIds
      : String(item.opcoes_ids || '')
          .split(',')
          .map(Number)
          .filter(Boolean);
    for (const id of ids) opcoes.set(id, (opcoes.get(id) || 0) + qtd);
  }
  return { pratos, opcoes };
}

async function nomeEEstoque(tipo, id) {
  const db = supabaseAdmin();
  const { data } = await db
    .from(tipo === 'prato' ? 'csf_pratos' : 'csf_opcoes')
    .select('nome, estoque')
    .eq('id', id)
    .maybeSingle();
  return data || { nome: 'item', estoque: 0 };
}

// Desconta o estoque dos itens. Se algum não tiver o suficiente, desfaz o que já descontou
// e devolve { erro }. Devolve { ok: true, baixados } em caso de sucesso.
export async function baixarEstoque(itens) {
  const db = supabaseAdmin();
  const { pratos, opcoes } = consumoDosItens(itens);
  const baixados = []; // [tipo, id, qtd] que realmente saíram do estoque

  const tarefas = [
    ...[...pratos].map(([id, qtd]) => ['prato', id, qtd]),
    ...[...opcoes].map(([id, qtd]) => ['opcao', id, qtd]),
  ];

  for (const [tipo, id, qtd] of tarefas) {
    const { data, error } = await db.rpc('csf_baixar_estoque', { p_tipo: tipo, p_id: id, p_qtd: qtd, p_forcar: false });
    if (error) {
      await devolverLista(baixados);
      return { erro: error.message, status: 500 };
    }
    if (data === -2) {
      await devolverLista(baixados);
      const { nome, estoque } = await nomeEEstoque(tipo, id);
      const restam = Number(estoque) > 0 ? ` (restam ${estoque})` : '';
      return { erro: `"${nome.trim()}" está esgotado ou não tem a quantidade pedida${restam}.`, status: 409 };
    }
    if (data !== -1) baixados.push([tipo, id, qtd]);
  }
  return { ok: true, baixados };
}

async function devolverLista(lista) {
  const db = supabaseAdmin();
  for (const [tipo, id, qtd] of lista) {
    await db.rpc('csf_devolver_estoque', { p_tipo: tipo, p_id: id, p_qtd: qtd });
  }
}

// Devolve ao estoque os itens de um pedido (usado ao cancelar ou excluir o pedido).
export async function devolverEstoqueDosItens(itens) {
  const { pratos, opcoes } = consumoDosItens(itens);
  await devolverLista([
    ...[...pratos].map(([id, qtd]) => ['prato', id, qtd]),
    ...[...opcoes].map(([id, qtd]) => ['opcao', id, qtd]),
  ]);
}

// Desconta de novo (ao reabrir um pedido cancelado). Nunca recusa; para no zero.
export async function rebaixarEstoqueDosItens(itens) {
  const db = supabaseAdmin();
  const { pratos, opcoes } = consumoDosItens(itens);
  const tarefas = [
    ...[...pratos].map(([id, qtd]) => ['prato', id, qtd]),
    ...[...opcoes].map(([id, qtd]) => ['opcao', id, qtd]),
  ];
  for (const [tipo, id, qtd] of tarefas) {
    await db.rpc('csf_baixar_estoque', { p_tipo: tipo, p_id: id, p_qtd: qtd, p_forcar: true });
  }
}

export async function itensDoPedido(pedidoId) {
  const { data } = await supabaseAdmin()
    .from('csf_itens_pedido')
    .select('prato_id, quantidade, opcoes_ids')
    .eq('pedido_id', pedidoId);
  return data || [];
}

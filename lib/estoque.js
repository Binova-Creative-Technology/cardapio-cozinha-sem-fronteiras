import { supabaseAdmin } from './supabaseAdmin';

// Estoque: coluna "estoque" em csf_pratos (em UNIDADES) e em csf_opcoes. null = sem controle; 0 = esgotado.
// Um pedido de 1 porção consome "unidades por porção" do prato (ex: salgado = 3 un.)
// e 1 de cada opção escolhida, por porção pedida.

// Unidades que 1 porção do prato consome: valor cadastrado, ou o número do texto de "quantidade"
// (ex: "3 un" -> 3), ou 1.
export function unidadesPorPorcao(prato) {
  const explicito = Number(prato.unidades_porcao);
  if (Number.isInteger(explicito) && explicito >= 1) return explicito;
  const m = String(prato.quantidade || '').match(/^\s*(\d{1,3})\s*(un|unid|unids|unidade|unidades)?\.?\s*$/i);
  if (m && Number(m[1]) >= 1) return Number(m[1]);
  return 1;
}

// Itens já com baixa_estoque (unidades do prato). Opções consomem 1 por porção pedida.
// Item sem baixa_estoque (pedido antigo) não mexe em nada.
function consumoDosItens(itens) {
  const pratos = new Map();
  const opcoes = new Map();
  for (const item of itens) {
    if (item.baixa_estoque === null || item.baixa_estoque === undefined) continue;
    const qtd = Number(item.quantidade);
    if (item.prato_id) pratos.set(item.prato_id, (pratos.get(item.prato_id) || 0) + Number(item.baixa_estoque));
    const ids = Array.isArray(item.opcoesIds)
      ? item.opcoesIds
      : String(item.opcoes_ids || '')
          .split(',')
          .map(Number)
          .filter(Boolean);
    for (const id of ids) opcoes.set(id, (opcoes.get(id) || 0) + qtd);
  }
  return [
    ...[...pratos].map(([id, qtd]) => ['prato', id, qtd]),
    ...[...opcoes].map(([id, qtd]) => ['opcao', id, qtd]),
  ];
}

async function nomeEEstoque(tipo, id) {
  const { data } = await supabaseAdmin()
    .from(tipo === 'prato' ? 'csf_pratos' : 'csf_opcoes')
    .select(tipo === 'prato' ? 'nome, estoque, quantidade, unidades_porcao' : 'nome, estoque')
    .eq('id', id)
    .maybeSingle();
  return data || { nome: 'item', estoque: 0 };
}

async function devolverLista(lista) {
  const db = supabaseAdmin();
  for (const [tipo, id, qtd] of lista) {
    await db.rpc('csf_devolver_estoque', { p_tipo: tipo, p_id: id, p_qtd: qtd });
  }
}

// Desconta o estoque dos itens de um pedido novo e anota em cada item (baixa_estoque) quantas
// unidades saíram do prato. Se algo não tiver o suficiente, desfaz tudo e devolve { erro }.
export async function baixarEstoque(itens) {
  const db = supabaseAdmin();

  const ids = [...new Set(itens.map((i) => i.prato_id))];
  const { data: pratos, error: erroPratos } = await db
    .from('csf_pratos')
    .select('id, quantidade, unidades_porcao')
    .in('id', ids);
  if (erroPratos) return { erro: erroPratos.message, status: 500 };
  const porId = new Map(pratos.map((p) => [p.id, p]));

  for (const item of itens) {
    const prato = porId.get(item.prato_id);
    item.baixa_estoque = Number(item.quantidade) * (prato ? unidadesPorPorcao(prato) : 1);
  }

  const baixados = [];
  for (const [tipo, id, qtd] of consumoDosItens(itens)) {
    const { data, error } = await db.rpc('csf_baixar_estoque', { p_tipo: tipo, p_id: id, p_qtd: qtd, p_forcar: false });
    if (error) {
      await devolverLista(baixados);
      return { erro: error.message, status: 500 };
    }
    if (data === -2) {
      await devolverLista(baixados);
      const info = await nomeEEstoque(tipo, id);
      const nome = String(info.nome).trim();
      let detalhe = '';
      if (tipo === 'prato') {
        const un = unidadesPorPorcao(info);
        const porcoes = Math.floor(Number(info.estoque) / un);
        detalhe = porcoes > 0 ? ` (só restam ${porcoes} ${porcoes === 1 ? 'porção' : 'porções'})` : '';
      } else if (Number(info.estoque) > 0) {
        detalhe = ` (só restam ${info.estoque})`;
      }
      return { erro: `"${nome}" está esgotado ou não tem a quantidade pedida${detalhe}.`, status: 409 };
    }
    if (data !== -1) baixados.push([tipo, id, qtd]);
  }
  return { ok: true };
}

// Devolve ao estoque os itens de um pedido (ao cancelar ou excluir). Só os que realmente descontaram.
export async function devolverEstoqueDosItens(itens) {
  await devolverLista(consumoDosItens(itens));
}

// Desconta de novo (ao reabrir um pedido cancelado). Nunca recusa; para no zero.
export async function rebaixarEstoqueDosItens(itens) {
  const db = supabaseAdmin();
  for (const [tipo, id, qtd] of consumoDosItens(itens)) {
    await db.rpc('csf_baixar_estoque', { p_tipo: tipo, p_id: id, p_qtd: qtd, p_forcar: true });
  }
}

export async function itensDoPedido(pedidoId) {
  const { data } = await supabaseAdmin()
    .from('csf_itens_pedido')
    .select('prato_id, quantidade, opcoes_ids, baixa_estoque')
    .eq('pedido_id', pedidoId);
  return data || [];
}

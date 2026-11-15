import { supabaseAdmin } from './supabaseAdmin';

// ESTOQUE POR ITEM
// csf_estoque_itens: o que existe na cozinha, em unidades (ex: "Kibe de carne": 120).
//   quantidade null = ainda sem controle (o sistema ignora esse item).
// csf_consumo: o que cada prato e cada opção gasta POR PORÇÃO pedida
//   (ex: a opção "3 kibe de carne" gasta 3 un. de "Kibe de carne").
// Um item de pedido gasta (consumo do prato + consumo das opções escolhidas) × quantidade pedida.

// ---------------------------------------------------------------------------
// Consumo (o que cada prato/opção gasta)
// ---------------------------------------------------------------------------

// Devolve Map "tipo:id" -> [{ item_id, unidades }]
async function carregarConsumo(pratoIds, opcaoIds) {
  const db = supabaseAdmin();
  const mapa = new Map();
  const consultas = [];
  if (pratoIds.length) consultas.push(db.from('csf_consumo').select('tipo, ref_id, item_id, unidades').eq('tipo', 'prato').in('ref_id', pratoIds));
  if (opcaoIds.length) consultas.push(db.from('csf_consumo').select('tipo, ref_id, item_id, unidades').eq('tipo', 'opcao').in('ref_id', opcaoIds));
  for (const consulta of consultas) {
    const { data, error } = await consulta;
    if (error) throw error;
    for (const c of data) {
      const chave = `${c.tipo}:${c.ref_id}`;
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push({ item_id: c.item_id, unidades: c.unidades });
    }
  }
  return mapa;
}

function somarConsumo(lista) {
  const total = new Map();
  for (const { item_id, unidades } of lista) total.set(item_id, (total.get(item_id) || 0) + unidades);
  return total;
}

// ---------------------------------------------------------------------------
// Baixa / devolução ao fazer, cancelar ou excluir pedidos
// ---------------------------------------------------------------------------

async function devolverLista(lista) {
  const db = supabaseAdmin();
  for (const [itemId, qtd] of lista) {
    await db.rpc('csf_devolver_item', { p_item: itemId, p_qtd: qtd });
  }
}

// Desconta o estoque de um pedido novo. Cada item recebe .baixas (o que ele gastou).
// Se faltar qualquer coisa, nada fica descontado e devolve { erro }.
// itens: [{ prato_id, quantidade, opcoes_ids: "1,2,3" }]
export async function baixarEstoque(itens) {
  const db = supabaseAdmin();
  const idsOpcoes = [];
  for (const item of itens) {
    item._opcoesIds = String(item.opcoes_ids || '').split(',').map(Number).filter(Boolean);
    idsOpcoes.push(...item._opcoesIds);
  }

  let consumo;
  try {
    consumo = await carregarConsumo([...new Set(itens.map((i) => i.prato_id))], [...new Set(idsOpcoes)]);
  } catch (err) {
    return { erro: err.message, status: 500 };
  }

  const totalGeral = new Map();
  for (const item of itens) {
    const lista = [...(consumo.get(`prato:${item.prato_id}`) || [])];
    for (const oid of item._opcoesIds) lista.push(...(consumo.get(`opcao:${oid}`) || []));
    const porItem = somarConsumo(lista);
    item.baixas = [...porItem].map(([item_id, un]) => ({ item_id, unidades: un * Number(item.quantidade) }));
    for (const b of item.baixas) totalGeral.set(b.item_id, (totalGeral.get(b.item_id) || 0) + b.unidades);
    delete item._opcoesIds;
  }

  const baixados = [];
  for (const [itemId, qtd] of totalGeral) {
    const { data, error } = await db.rpc('csf_baixar_item', { p_item: itemId, p_qtd: qtd, p_forcar: false });
    if (error) {
      await devolverLista(baixados);
      return { erro: error.message, status: 500 };
    }
    if (data === -2) {
      await devolverLista(baixados);
      const { data: info } = await db.from('csf_estoque_itens').select('nome, quantidade').eq('id', itemId).maybeSingle();
      const nome = String(info?.nome || 'item').trim();
      const restam = Number(info?.quantidade) > 0 ? ` (só restam ${info.quantidade} un.)` : '';
      return { erro: `"${nome}" está esgotado ou não tem a quantidade necessária${restam}.`, status: 409 };
    }
    if (data !== -1) baixados.push([itemId, qtd]);
  }
  return { ok: true };
}

function baixasDosItens(itens) {
  const total = new Map();
  for (const item of itens) {
    for (const b of Array.isArray(item.baixas) ? item.baixas : []) {
      total.set(b.item_id, (total.get(b.item_id) || 0) + Number(b.unidades));
    }
  }
  return [...total];
}

// Devolve ao estoque exatamente o que os itens tiraram (ao cancelar ou excluir o pedido).
export async function devolverEstoqueDosItens(itens) {
  await devolverLista(baixasDosItens(itens));
}

// Desconta de novo (ao reabrir um pedido cancelado). Nunca recusa; para no zero.
export async function rebaixarEstoqueDosItens(itens) {
  const db = supabaseAdmin();
  for (const [itemId, qtd] of baixasDosItens(itens)) {
    await db.rpc('csf_baixar_item', { p_item: itemId, p_qtd: qtd, p_forcar: true });
  }
}

export async function itensDoPedido(pedidoId) {
  const { data } = await supabaseAdmin().from('csf_itens_pedido').select('baixas').eq('pedido_id', pedidoId);
  return data || [];
}

// ---------------------------------------------------------------------------
// Disponibilidade (para o cardápio do cliente)
// ---------------------------------------------------------------------------

// Quantas porções ainda dá para servir com este consumo (null = sem controle).
function porcoesPossiveis(consumoLista, estoquePorItem) {
  let minimo = null;
  for (const { item_id, unidades } of consumoLista) {
    const q = estoquePorItem.get(item_id);
    if (q === null || q === undefined) continue; // item sem controle
    const possiveis = Math.floor(q / Math.max(1, unidades));
    minimo = minimo === null ? possiveis : Math.min(minimo, possiveis);
  }
  return minimo;
}

// Devolve { pratos: Map(id -> porções|null), opcoes: Map(id -> porções|null) }
export async function disponibilidade(pratoIds, opcaoIds) {
  const db = supabaseAdmin();
  const consumo = await carregarConsumo(pratoIds, opcaoIds);
  const itemIds = [...new Set([...consumo.values()].flat().map((c) => c.item_id))];
  const estoquePorItem = new Map();
  if (itemIds.length) {
    const { data, error } = await db.from('csf_estoque_itens').select('id, quantidade').in('id', itemIds);
    if (error) throw error;
    for (const i of data) estoquePorItem.set(i.id, i.quantidade);
  }
  const pratos = new Map();
  const opcoes = new Map();
  for (const id of pratoIds) pratos.set(id, porcoesPossiveis(consumo.get(`prato:${id}`) || [], estoquePorItem));
  for (const id of opcaoIds) opcoes.set(id, porcoesPossiveis(consumo.get(`opcao:${id}`) || [], estoquePorItem));
  return { pratos, opcoes };
}

// ---------------------------------------------------------------------------
// Leitura dos nomes do cardápio para sugerir o consumo ("3 kibe de carne" = 3 un. de "Kibe de carne")
// ---------------------------------------------------------------------------

function semAcento(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// "Espetos" -> "espeto": tira o plural simples da primeira palavra
function singular(palavra) {
  return palavra.length > 3 && palavra.endsWith('s') ? palavra.slice(0, -1) : palavra;
}

function capitalizar(texto) {
  const t = texto.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// "1 Espeto de Kafta e 1 Espeto de Frango" -> [{ unidades: 1, nome: "Espeto de Kafta" }, { unidades: 1, nome: "Espeto de Frango" }]
// Texto sem número no começo (ex: "Arroz branco") -> []
export function lerQuantidadesDoNome(nomeOpcao) {
  const partes = String(nomeOpcao).split(/\s+e\s+(?=\d)|\s*\+\s*|,\s*(?=\d)/i);
  const achados = [];
  for (const parte of partes) {
    const m = parte.trim().match(/^(\d{1,3})\s*(?:x\s*)?(.+)$/i);
    if (!m) return []; // se alguma parte não tem número, não arrisca
    const palavras = m[2].trim().split(/\s+/);
    palavras[0] = singular(palavras[0]);
    achados.push({ unidades: Number(m[1]), nome: capitalizar(palavras.join(' ')) });
  }
  return achados;
}

export function chaveDeNome(nome) {
  return semAcento(nome).split(/\s+/).map(singular).join(' ');
}

// Palavras do nome (sem acento, singular) — para ver se "kibe de carne" está dentro de "Kibe frito de carne"
export function palavrasDoNome(nome) {
  return new Set(semAcento(nome).split(/\s+/).map(singular).filter((p) => p !== 'de'));
}

import { supabaseAdmin } from './supabaseAdmin';
import { gruposDosPratos } from './opcoes';
import { baixarEstoque, devolverEstoqueDosItens } from './estoque';

// Cria um pedido (usado pelo cliente e pela equipe no painel).
// itens: [{ pratoId, quantidade, opcoes: [ids], observacao }]
// Devolve { erro, status } ou { pedidoId, total, criadoEm }.
// Preço, nomes e opções vêm sempre do banco, nunca do navegador; o estoque é descontado aqui.
export async function criarPedido({ mesa, observacao, itens }) {
  if (!Array.isArray(itens) || itens.length === 0) {
    return { erro: 'O pedido precisa ter pelo menos um item.', status: 400 };
  }

  const db = supabaseAdmin();
  const idsPratos = [...new Set(itens.map((i) => i.pratoId))];
  const { data: pratos, error: erroPratos } = await db
    .from('csf_pratos')
    .select('id, nome, preco')
    .eq('ativo', true)
    .in('id', idsPratos);
  if (erroPratos) return { erro: erroPratos.message, status: 500 };

  let gruposPorPrato;
  try {
    gruposPorPrato = await gruposDosPratos(pratos.map((p) => p.id));
  } catch (err) {
    return { erro: err.message, status: 500 };
  }

  const itensValidos = [];
  let total = 0;

  for (const item of itens) {
    const qtd = Number(item.quantidade);
    if (!item.pratoId || !Number.isInteger(qtd) || qtd <= 0 || qtd > 99) {
      return { erro: 'Item de pedido inválido.', status: 400 };
    }
    const prato = pratos.find((p) => p.id === item.pratoId);
    if (!prato) {
      return { erro: `Prato não encontrado ou indisponível (id ${item.pratoId}).`, status: 400 };
    }

    const escolhidas = new Set(Array.isArray(item.opcoes) ? item.opcoes.map(Number) : []);
    const grupos = gruposPorPrato[prato.id] || [];
    const todasOpcoes = new Set(grupos.flatMap((g) => g.opcoes.map((o) => o.id)));
    for (const id of escolhidas) {
      if (!todasOpcoes.has(id)) {
        return { erro: `Opção inválida para "${prato.nome}".`, status: 400 };
      }
      // opção desativada pelo restaurante ("acabou")
      const desativada = grupos.flatMap((g) => g.opcoes).find((o) => o.id === id && o.ativo === false);
      if (desativada) {
        return { erro: `"${desativada.nome}" acabou. Escolha outra opção em ${prato.nome}.`, status: 409 };
      }
    }

    let adicional = 0;
    const textos = [];
    const idsMarcados = [];
    for (const g of grupos) {
      const marcadas = g.opcoes.filter((o) => escolhidas.has(o.id));
      if (g.tipo === 'unica' && marcadas.length !== 1) {
        return { erro: `Escolha uma opção de "${g.nome}" em ${prato.nome}.`, status: 400 };
      }
      if (marcadas.length) {
        idsMarcados.push(...marcadas.map((o) => o.id));
        adicional += marcadas.reduce((soma, o) => soma + o.precoAdicional, 0);
        textos.push(`${g.nome}: ${marcadas.map((o) => o.nome).join(', ')}`);
      }
    }

    const precoUnitario = Math.round((Number(prato.preco) + adicional) * 100) / 100;
    const subtotal = Math.round(precoUnitario * qtd * 100) / 100;
    total += subtotal;
    itensValidos.push({
      prato_id: prato.id,
      nome_prato: prato.nome,
      opcoes: textos.join(' · '),
      opcoes_ids: idsMarcados.join(','),
      observacao: String(item.observacao || '').trim().slice(0, 200),
      preco_unitario: precoUnitario,
      quantidade: qtd,
      subtotal,
    });
  }

  // Desconta do estoque (atômico). Se faltar algo, nada é descontado e o pedido não é criado.
  const baixa = await baixarEstoque(itensValidos);
  if (baixa.erro) return { erro: baixa.erro, status: baixa.status };

  const criadoEm = new Date().toISOString();
  const { data: pedido, error: erroPedido } = await db
    .from('csf_pedidos')
    .insert({
      mesa: String(mesa || '').slice(0, 80),
      observacao: String(observacao || '').slice(0, 500),
      status: 'recebido',
      total,
      criado_em: criadoEm,
    })
    .select('id')
    .single();
  if (erroPedido) {
    await devolverEstoqueDosItens(itensValidos);
    return { erro: erroPedido.message, status: 500 };
  }

  const { error: erroItens } = await db
    .from('csf_itens_pedido')
    .insert(itensValidos.map((item) => ({ ...item, pedido_id: pedido.id })));
  if (erroItens) {
    await db.from('csf_pedidos').delete().eq('id', pedido.id);
    await devolverEstoqueDosItens(itensValidos);
    return { erro: erroItens.message, status: 500 };
  }

  return { pedidoId: pedido.id, total, criadoEm };
}

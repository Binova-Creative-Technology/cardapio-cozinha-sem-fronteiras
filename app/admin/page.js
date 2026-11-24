'use client';

import { Fragment, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

function formatarMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function api(caminho, opcoes) {
  const resp = await fetch('/api/admin' + caminho, {
    headers: opcoes?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...opcoes,
  });
  let dados = null;
  try {
    dados = await resp.json();
  } catch (e) {
    /* sem corpo */
  }
  if (!resp.ok) throw new Error((dados && dados.erro) || 'Erro na requisição');
  return dados;
}

export default function PainelAdmin() {
  const [verificandoSessao, setVerificandoSessao] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [config, setConfig] = useState({ nomeLoja: 'Cozinha Sem Fronteiras', logoUrl: '' });

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => {
        setConfig(c);
        document.title = c.nomeLoja + ' — Painel';
      })
      .catch(() => {});

    api('/sessao')
      .then(({ autenticado }) => setAutenticado(autenticado))
      .finally(() => setVerificandoSessao(false));
  }, []);

  if (verificandoSessao) return null;

  if (!autenticado) {
    return <TelaLogin config={config} onLogin={() => setAutenticado(true)} />;
  }

  return <Painel config={config} onLogout={() => setAutenticado(false)} onConfigAtualizado={setConfig} />;
}

function TelaLogin({ config, onLogin }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function entrar() {
    setErro('');
    setEntrando(true);
    try {
      await api('/login', { method: 'POST', body: JSON.stringify({ senha }) });
      onLogin();
    } catch (err) {
      setErro(err.message);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        {config.logoUrl && <img src={config.logoUrl} className="logo-login" alt="Logo" />}
        <h1>{config.nomeLoja}</h1>
        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && entrar()}
        />
        <div className="erro">{erro}</div>
        <button onClick={entrar} disabled={entrando} type="button">
          Entrar
        </button>
      </div>
    </div>
  );
}

function tocarTom(frequencias, { tipo = 'sine', volume = 0.4, duracao = 0.3 } = {}) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    frequencias.forEach(([freq, atraso]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tipo;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + atraso);
      gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + atraso + 0.02);
      gain.gain.setValueAtTime(volume, ctx.currentTime + atraso + duracao - 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + atraso + duracao);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + atraso);
      osc.stop(ctx.currentTime + atraso + duracao + 0.02);
    });
  } catch (e) {
    /* navegador sem suporte a áudio */
  }
}

// Alarme de pedido novo: sirene alternando dois tons, ~6 segundos, volume máximo.
function tocarAlarmePedido() {
  const notas = [];
  for (let i = 0; i < 16; i++) notas.push([i % 2 === 0 ? 880 : 1175, i * 0.38]);
  tocarTom(notas, { tipo: 'square', volume: 1, duracao: 0.36 });
}

function Painel({ config, onLogout, onConfigAtualizado }) {
  const [aba, setAba] = useState('pedidos');
  const [lojaAberta, setLojaAberta] = useState(true);
  const [fechamentosPendentes, setFechamentosPendentes] = useState([]);
  const [reciboHtml, setReciboHtml] = useState(null);

  const ultimoIdPedido = useRef(null);
  const ultimoIdFechamento = useRef(null);
  const [gatilhoAtualizacao, setGatilhoAtualizacao] = useState(0);

  const carregarStatusLoja = useCallback(() => {
    api('/loja').then(({ aberto }) => setLojaAberta(aberto));
  }, []);

  const carregarFechamentos = useCallback(() => {
    api('/fechamentos?status=pendente').then(setFechamentosPendentes);
  }, []);

  useEffect(() => {
    carregarStatusLoja();
    carregarFechamentos();

    if (window.Notification && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const intervalo = setInterval(async () => {
      try {
        const { ultimoId } = await api('/pedidos/ultimo-id');
        if (ultimoIdPedido.current === null) {
          ultimoIdPedido.current = ultimoId;
        } else if (ultimoId > ultimoIdPedido.current) {
          tocarAlarmePedido();
          if (window.Notification && Notification.permission === 'granted') {
            const qtd = ultimoId - ultimoIdPedido.current;
            new Notification('Novo pedido recebido!', {
              body: qtd > 1 ? `${qtd} novos pedidos chegaram.` : 'Um novo pedido acabou de chegar.',
            });
          }
          ultimoIdPedido.current = ultimoId;
          setGatilhoAtualizacao((n) => n + 1);
        }
      } catch (e) {
        /* tenta de novo no próximo ciclo */
      }

      try {
        const { ultimoId } = await api('/fechamentos/ultimo-id');
        if (ultimoIdFechamento.current === null) {
          ultimoIdFechamento.current = ultimoId;
        } else if (ultimoId > ultimoIdFechamento.current) {
          const pendentes = await api('/fechamentos?status=pendente');
          const recentes = pendentes.filter((f) => f.id > ultimoIdFechamento.current);
          recentes.forEach((f) => {
            tocarTom([[520, 0], [520, 0.22], [520, 0.44]]);
            if (window.Notification && Notification.permission === 'granted') {
              new Notification('Pedido para fechar conta!', {
                body: `Mesa ${f.mesa} quer fechar a conta — ${formatarMoeda(f.total)}`,
              });
            }
          });
          ultimoIdFechamento.current = ultimoId;
          carregarFechamentos();
        }
      } catch (e) {
        /* tenta de novo no próximo ciclo */
      }
    }, 6000);

    return () => clearInterval(intervalo);
  }, [carregarFechamentos]);

  async function sair() {
    await api('/logout', { method: 'POST' });
    onLogout();
  }

  async function alternarLoja(aberto) {
    setLojaAberta(aberto);
    await api('/loja', { method: 'POST', body: JSON.stringify({ aberto }) });
  }

  async function imprimirConta(id) {
    const detalhe = await api(`/fechamentos/${id}/detalhe`);
    const hora = new Date(detalhe.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    setReciboHtml({ ...detalhe, hora, nomeLoja: config.nomeLoja });
  }

  function imprimirCozinha(pedido) {
    const hora = new Date(pedido.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    setReciboHtml({
      cozinha: true,
      pedidoId: pedido.id,
      mesa: pedido.mesa || '-',
      hora,
      observacao: pedido.observacao,
      itens: [...pedido.itens]
        .sort((a, b) => a.id - b.id)
        .map((i) => ({
        quantidade: i.quantidade,
        nome: i.nome_prato,
        porcao: i.porcao,
        opcoes: i.opcoes,
        observacao: i.observacao,
        notaPrato: i.notaPrato,
      })),
    });
  }

  useEffect(() => {
    if (!reciboHtml) return;
    document.body.classList.add('imprimindo-recibo');
    // Papel da impressora térmica: 50mm de largura. A altura da página é medida pelo
    // próprio cupom: com "auto" o navegador usa uma página curta e corta o final.
    // O texto fica com 44mm de largura (+2mm à esquerda): é o que cabe na área
    // impressa desta impressora sem cortar a direita. Margem 0 = sem cabeçalho do navegador.
    let alturaMm = 150;
    const recibo = document.getElementById('recibo-impressao');
    if (recibo) {
      const anterior = recibo.getAttribute('style');
      recibo.style.cssText = 'display:block;position:absolute;visibility:hidden;width:44mm;margin:0;padding:0;';
      alturaMm = Math.ceil((recibo.getBoundingClientRect().height * 25.4) / 96) + 10;
      if (anterior === null) recibo.removeAttribute('style');
      else recibo.setAttribute('style', anterior);
    }
    const estilo = document.createElement('style');
    estilo.textContent = `@page { size: 50mm ${alturaMm}mm; margin: 0; }`;
    document.head.appendChild(estilo);
    window.print();
    const limpar = () => {
      document.body.classList.remove('imprimindo-recibo');
      estilo.remove();
    };
    window.addEventListener('afterprint', limpar, { once: true });
    return () => {
      window.removeEventListener('afterprint', limpar);
      limpar();
    };
  }, [reciboHtml]);

  async function fecharContaManual(mesa) {
    try {
      const r = await api('/fechamentos', { method: 'POST', body: JSON.stringify({ mesa }) });
      carregarFechamentos();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (r.jaSolicitado) {
        alert(`A conta de "${mesa}" já está em "Contas para fechar" (${formatarMoeda(r.total)}).`);
      } else if (confirm(`Conta de "${mesa}" criada: ${formatarMoeda(r.total)} (com 10% de serviço).\n\nImprimir agora?`)) {
        imprimirConta(r.id);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function concluirFechamento(id) {
    await api(`/fechamentos/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'concluido' }) });
    carregarFechamentos();
  }

  return (
    <div className="painel">
      <header className="topo">
        <div className="topo-marca">
          {config.logoUrl && <img src={config.logoUrl} className="logo-topo-admin" alt="Logo" />}
          <h1>{config.nomeLoja}</h1>
        </div>
        <div className="topo-acoes">
          <label className="switch-loja">
            <input type="checkbox" checked={lojaAberta} onChange={(e) => alternarLoja(e.target.checked)} />
            <span>{lojaAberta ? 'Loja aberta' : 'Loja fechada'}</span>
          </label>
          <button onClick={sair} type="button">
            Sair
          </button>
        </div>
      </header>

      <nav className="abas">
        {[
          ['pedidos', 'Pedidos'],
          ['relatorio', 'Relatório'],
          ['cardapio', 'Cardápio'],
          ['estoque', 'Estoque'],
          ['qrcodes', 'QR Codes'],
          ['config', 'Configurações'],
        ].map(([id, rotulo]) => (
          <button key={id} className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)} type="button">
            {rotulo}
          </button>
        ))}
      </nav>

      <main>
        {aba === 'pedidos' && (
          <AbaPedidos
            fechamentosPendentes={fechamentosPendentes}
            onImprimirConta={imprimirConta}
            onConcluirFechamento={concluirFechamento}
            onFecharConta={fecharContaManual}
            onImprimirCozinha={imprimirCozinha}
            gatilhoAtualizacao={gatilhoAtualizacao}
          />
        )}
        {aba === 'relatorio' && <AbaRelatorio gatilhoAtualizacao={gatilhoAtualizacao} />}
        {aba === 'cardapio' && <AbaCardapio />}
        {aba === 'estoque' && <AbaEstoque gatilhoAtualizacao={gatilhoAtualizacao} />}
        {aba === 'qrcodes' && <AbaQrCodes />}
        {aba === 'config' && <AbaConfig config={config} onConfigAtualizado={onConfigAtualizado} />}
      </main>

      {reciboHtml && reciboHtml.cozinha && createPortal(
        <div id="recibo-impressao" className="recibo-cozinha">
          <h2>COZINHA — PEDIDO Nº {reciboHtml.pedidoId}</h2>
          <div className="recibo-mesa">
            {/^\d+$/.test(String(reciboHtml.mesa)) ? `MESA ${reciboHtml.mesa}` : String(reciboHtml.mesa).toUpperCase()}
          </div>
          <div className="recibo-subtitulo">{reciboHtml.hora}</div>
          <div className="recibo-linha-sep" />
          {reciboHtml.itens.map((i, idx) => (
            <div className="recibo-cozinha-item" key={idx}>
              <strong>
                {i.quantidade}x {i.nome}
                {i.porcao ? ` (${i.porcao})` : ''}
              </strong>
              {i.opcoes && (
                <div className="recibo-cozinha-opcoes">
                  {i.opcoes.split(' · ').map((o, k) => {
                    // "Arroz: Arroz branco" -> "• Arroz branco" (o nome do grupo só fica nos adicionais)
                    const [grupo, ...resto] = o.split(': ');
                    const valor = resto.join(': ');
                    const extra = /adicion|extra/i.test(grupo);
                    return <div key={k}>• {valor ? (extra ? `+ ${valor}` : valor) : o}</div>;
                  })}
                </div>
              )}
              {i.notaPrato && <div className="recibo-cozinha-opcoes">* {i.notaPrato}</div>}
              {i.observacao && <div className="recibo-cozinha-obs">OBS: {i.observacao}</div>}
            </div>
          ))}
          {reciboHtml.observacao && (
            <>
              <div className="recibo-linha-sep" />
              <div className="recibo-cozinha-obs">OBS: {reciboHtml.observacao}</div>
            </>
          )}
        </div>,
        document.body
      )}

      {reciboHtml && !reciboHtml.cozinha && createPortal(
        <div id="recibo-impressao">
          <h2>{reciboHtml.nomeLoja.toUpperCase()}</h2>
          <div className="recibo-subtitulo">
            Mesa {reciboHtml.mesa} — {reciboHtml.hora}
          </div>
          <div className="recibo-linha-sep" />
          {reciboHtml.itens.map((i, idx) => (
            <div className="recibo-item" key={idx}>
              <span>
                {i.quantidade}x {i.nome}
                {i.porcao ? ` (${i.porcao})` : ''}
                {i.opcoes && <small style={{ display: 'block', fontSize: '0.85em' }}>{i.opcoes}</small>}
              </span>
              <span>{formatarMoeda(i.subtotal)}</span>
            </div>
          ))}
          <div className="recibo-linha-sep" />
          <div className="recibo-total-linha">
            <span>Subtotal</span>
            <span>{formatarMoeda(reciboHtml.totalSemServico)}</span>
          </div>
          <div className="recibo-total-linha">
            <span>Serviço (10%)</span>
            <span>{formatarMoeda(reciboHtml.taxaServico)}</span>
          </div>
          <div className="recibo-total-linha destaque">
            <span>TOTAL A PAGAR</span>
            <span>{formatarMoeda(reciboHtml.totalComServico)}</span>
          </div>
          <div className="recibo-subtitulo" style={{ marginTop: 10 }}>
            Obrigado pela preferência!
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function formatarMesLabel(m) {
  const [ano, mes] = m.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

function AbaPedidos({
  fechamentosPendentes,
  onImprimirConta,
  onConcluirFechamento,
  onFecharConta,
  onImprimirCozinha,
  gatilhoAtualizacao,
}) {
  const [meses, setMeses] = useState([]);
  const [mes, setMes] = useState('');
  const [pedidos, setPedidos] = useState([]);
  const [resumo, setResumo] = useState({ totalPedidos: 0, faturamento: 0 });
  const [expandidoId, setExpandidoId] = useState(null);

  // Valores de vendas (faturamento do mês e total de cada dia) ficam tampados por padrão;
  // o botão mostra/esconde e a escolha fica lembrada neste computador.
  const [mostrarVendas, setMostrarVendas] = useState(false);
  useEffect(() => {
    try {
      setMostrarVendas(localStorage.getItem('csf_mostrar_vendas') === '1');
    } catch {}
  }, []);
  function alternarVendas() {
    setMostrarVendas((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem('csf_mostrar_vendas', novo ? '1' : '0');
      } catch {}
      return novo;
    });
  }
  const tampado = 'R$ ••••••';

  const carregarPedidos = useCallback((mesAtual) => {
    if (!mesAtual) return;
    api('/pedidos?mes=' + mesAtual).then(setPedidos);
    api('/resumo?mes=' + mesAtual).then(setResumo);
  }, []);

  useEffect(() => {
    api('/pedidos/meses-disponiveis').then((disponiveis) => {
      const mesAtual = diaBR(new Date().toISOString()).slice(0, 7);
      const lista = disponiveis.includes(mesAtual) ? disponiveis : [mesAtual, ...disponiveis];
      setMeses(lista);
      setMes(mesAtual);
    });
  }, []);

  useEffect(() => {
    carregarPedidos(mes);
  }, [mes, carregarPedidos, gatilhoAtualizacao]);

  // Contas já concluídas: o pedido feito antes do fechamento (na mesma comanda) aparece como "Fechado".
  const [concluidos, setConcluidos] = useState([]);
  useEffect(() => {
    api('/fechamentos?status=concluido').then(setConcluidos).catch(() => {});
  }, [fechamentosPendentes, gatilhoAtualizacao]);

  function contaFechada(p) {
    const criado = new Date(p.criado_em).getTime();
    return concluidos.some((f) => {
      const t = new Date(f.criado_em).getTime();
      return f.mesa === p.mesa && t >= criado && t - criado < 18 * 3600000;
    });
  }

  async function excluirPedido(p) {
    const resumoPedido = `Pedido nº ${p.id} — ${p.mesa || 'sem mesa'} — ${formatarMoeda(p.total)}`;
    if (!confirm(`Excluir este pedido?\n\n${resumoPedido}\n\nEle some do histórico e do relatório e NÃO pode ser recuperado.`)) return;
    try {
      await api(`/pedidos/${p.id}`, { method: 'DELETE' });
      setPedidos((atual) => atual.filter((x) => x.id !== p.id));
      setExpandidoId(null);
      api('/resumo?mes=' + mes).then(setResumo);
    } catch (err) {
      alert(err.message);
    }
  }

  async function alterarStatus(id, status) {
    await api(`/pedidos/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setPedidos((atual) => atual.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  return (
    <>
      {fechamentosPendentes.length > 0 && (
        <div className="cartao" id="cartao-fechamentos">
          <h3>Contas para fechar</h3>
          <div>
            {fechamentosPendentes.map((f) => {
              const hora = new Date(f.criado_em).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div className="fechamento-linha" key={f.id}>
                  <div className="info">
                    <strong>Mesa {f.mesa}</strong> às {hora} —{' '}
                    <span className="valor-destaque">{formatarMoeda(f.total)}</span> (já com 10% de serviço)
                  </div>
                  <div>
                    <button className="btn-secundario" onClick={() => onImprimirConta(f.id)} type="button">
                      Imprimir conta
                    </button>
                    <button className="btn" onClick={() => onConcluirFechamento(f.id)} type="button">
                      Concluído
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="linha-form">
        <select value={mes} onChange={(e) => setMes(e.target.value)}>
          {meses.map((m) => (
            <option key={m} value={m}>
              {formatarMesLabel(m)}
            </option>
          ))}
        </select>
        <button className="btn-secundario" type="button" onClick={alternarVendas}>
          {mostrarVendas ? '🙈 Tampar valor das vendas' : '👁 Mostrar valor das vendas'}
        </button>
      </div>

      <div className="resumo-grid">
        <div className="cartao">
          <div className="valor">{mostrarVendas ? formatarMoeda(resumo.faturamento) : tampado}</div>
          <div className="rotulo">Faturamento do mês</div>
        </div>
        <div className="cartao">
          <div className="valor">{resumo.totalPedidos}</div>
          <div className="rotulo">Pedidos no mês</div>
        </div>
      </div>

      <div className="cartao">
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Mesa</th>
              <th>Itens</th>
              <th>Total</th>
              <th>Status</th>
              <th>Cozinha</th>
              <th>Conta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#888' }}>
                  Nenhum pedido neste mês.
                </td>
              </tr>
            )}
            {pedidos.map((p, idxPedido) => {
              const hora = new Date(p.criado_em).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Sao_Paulo',
              });
              const dia = diaBR(p.criado_em);
              const novoDia = idxPedido === 0 || diaBR(pedidos[idxPedido - 1].criado_em) !== dia;
              const doDia = pedidos.filter((x) => diaBR(x.criado_em) === dia);
              const validosDoDia = doDia.filter((x) => x.status !== 'cancelado');
              const totalDoDia = validosDoDia.reduce((soma, x) => soma + Number(x.total), 0);
              const hojeBR = diaBR(new Date().toISOString());
              const aberto = expandidoId === p.id;
              const totalItens = p.itens.reduce((soma, i) => soma + i.quantidade, 0);
              const fechado = p.status !== 'cancelado' && contaFechada(p);
              // pedido novo pisca até a equipe mudar o status; se a conta já foi fechada, não pisca
              const piscando = p.status === 'recebido' && !fechado;
              return (
                <Fragment key={p.id}>
                  {novoDia && (
                    <tr className="linha-dia">
                      <td colSpan={8}>
                        <strong>
                          {dia === hojeBR ? 'Hoje — ' : ''}
                          {formatarDiaLabel(dia)}
                        </strong>
                        <span>
                          {' '}
                          · {validosDoDia.length} {validosDoDia.length === 1 ? 'pedido' : 'pedidos'} ·{' '}
                          {mostrarVendas ? formatarMoeda(totalDoDia) : tampado}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr
                    className={piscando ? 'pedido-novo' : undefined}
                    onClick={() => setExpandidoId(aberto ? null : p.id)}
                    style={{ cursor: 'pointer', background: aberto && !piscando ? '#faf7f2' : undefined }}
                  >
                    <td>
                      {piscando && <span className="selo-novo">NOVO</span>}
                      {hora}
                    </td>
                    <td>{p.mesa || '-'}</td>
                    <td>
                      {aberto ? '▾' : '▸'} {totalItens} {totalItens === 1 ? 'item' : 'itens'}
                      <span style={{ color: '#888' }}> — clique para ver</span>
                    </td>
                    <td>{formatarMoeda(p.total)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {fechado ? (
                        <strong style={{ color: '#2e7d32' }}>✔ Fechado</strong>
                      ) : (
                        <select value={p.status} onChange={(e) => alterarStatus(p.id, e.target.value)}>
                          {['recebido', 'em preparo', 'pronto', 'entregue', 'cancelado'].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {p.status !== 'cancelado' && (
                        <button className="btn-secundario" onClick={() => onImprimirCozinha(p)} type="button">
                          Imprimir
                        </button>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {!fechado && p.status !== 'cancelado' && p.mesa && (
                        <button className="btn-secundario" onClick={() => onFecharConta(p.mesa)} type="button">
                          Fechar conta
                        </button>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn-perigo" onClick={() => excluirPedido(p)} type="button">
                        Excluir
                      </button>
                    </td>
                  </tr>
                  {aberto && (
                    <tr style={{ background: '#faf7f2' }}>
                      <td colSpan={8}>
                        {p.itens.map((i) => (
                          <div
                            key={i.id}
                            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}
                          >
                            <span>
                              <strong>{i.quantidade}x</strong> {i.nome_prato}
                              {i.porcao ? ` (${i.porcao})` : ''}
                              {i.opcoes && <div style={{ color: '#7a5a12', fontSize: '0.85rem' }}>{i.opcoes}</div>}
                              {i.observacao && (
                                <div style={{ color: '#a3352b', fontSize: '0.85rem', fontWeight: 600 }}>
                                  Obs: {i.observacao}
                                </div>
                              )}
                            </span>
                            <span style={{ color: '#555' }}>
                              {formatarMoeda(i.preco_unitario)} cada — <strong>{formatarMoeda(i.subtotal)}</strong>
                            </span>
                          </div>
                        ))}
                        {p.observacao && (
                          <div style={{ marginTop: 6, color: '#7a5a12' }}>
                            <strong>Observação:</strong> {p.observacao}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatarDiaLabel(diaIso) {
  const [, mes, dia] = diaIso.split('-');
  const nomesDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dataObj = new Date(diaIso + 'T12:00:00');
  return `${dia}/${mes} (${nomesDias[dataObj.getDay()]})`;
}

// Dia (YYYY-MM-DD) no horário de Brasília — igual ao usado no servidor (lib/datas.js).
function diaBR(iso) {
  return new Date(new Date(iso).getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

function AbaRelatorio({ gatilhoAtualizacao }) {
  const [meses, setMeses] = useState([]);
  const [mes, setMes] = useState('');
  const [resumo, setResumo] = useState({ totalPedidos: 0, faturamento: 0, porDia: [] });
  const [pedidosDoMes, setPedidosDoMes] = useState([]);
  const [diaAberto, setDiaAberto] = useState(null);

  useEffect(() => {
    api('/pedidos/meses-disponiveis').then((disponiveis) => {
      const mesAtual = diaBR(new Date().toISOString()).slice(0, 7);
      const lista = disponiveis.includes(mesAtual) ? disponiveis : [mesAtual, ...disponiveis];
      setMeses(lista);
      setMes(mesAtual);
    });
  }, []);

  useEffect(() => {
    if (!mes) return;
    api('/resumo?mes=' + mes).then(setResumo);
    api('/pedidos?mes=' + mes).then(setPedidosDoMes);
  }, [mes, gatilhoAtualizacao]);

  useEffect(() => {
    setDiaAberto(null);
  }, [mes]);

  const ticketMedio = resumo.totalPedidos > 0 ? resumo.faturamento / resumo.totalPedidos : 0;
  const maiorFaturamento = Math.max(0, ...resumo.porDia.map((d) => d.faturamento));

  return (
    <>
      <div className="linha-form">
        <select value={mes} onChange={(e) => setMes(e.target.value)}>
          {meses.map((m) => (
            <option key={m} value={m}>
              {formatarMesLabel(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="resumo-grid">
        <div className="cartao">
          <div className="valor">{formatarMoeda(resumo.faturamento)}</div>
          <div className="rotulo">Faturamento do mês</div>
        </div>
        <div className="cartao">
          <div className="valor">{resumo.totalPedidos}</div>
          <div className="rotulo">Pedidos no mês</div>
        </div>
        <div className="cartao">
          <div className="valor">{formatarMoeda(ticketMedio)}</div>
          <div className="rotulo">Ticket médio</div>
        </div>
      </div>

      <div className="cartao">
        <h3>Vendas por dia</h3>
        {resumo.porDia.length === 0 && <p style={{ color: '#888' }}>Nenhuma venda neste mês.</p>}
        {resumo.porDia
          .slice()
          .reverse()
          .map((d) => {
            const largura = maiorFaturamento > 0 ? Math.round((d.faturamento / maiorFaturamento) * 100) : 0;
            const aberto = diaAberto === d.dia;
            const pedidosDoDia = pedidosDoMes
              .filter((p) => p.status !== 'cancelado' && diaBR(p.criado_em) === d.dia)
              .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
            return (
              <Fragment key={d.dia}>
                <div
                  className="dia-linha"
                  onClick={() => setDiaAberto(aberto ? null : d.dia)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="dia-data">
                    {aberto ? '▾' : '▸'} {formatarDiaLabel(d.dia)}
                  </div>
                  <div className="dia-barra-fundo">
                    <div className="dia-barra" style={{ width: largura + '%' }} />
                  </div>
                  <div className="dia-valores">
                    {formatarMoeda(d.faturamento)} · {d.pedidos} pedido{d.pedidos === 1 ? '' : 's'}
                  </div>
                </div>
                {aberto && (
                  <div style={{ background: '#faf7f2', borderRadius: 8, padding: '6px 12px', margin: '4px 0 10px' }}>
                    {pedidosDoDia.length === 0 && <p style={{ color: '#888' }}>Carregando pedidos...</p>}
                    {pedidosDoDia.map((p) => (
                      <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>
                            <strong>
                              {new Date(p.criado_em).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </strong>{' '}
                            — {p.mesa || 'sem mesa'}
                          </span>
                          <span>
                            <strong>{formatarMoeda(p.total)}</strong>{' '}
                            <span style={{ color: '#888', fontSize: '0.8rem' }}>({p.status})</span>
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#555' }}>
                          {p.itens
                            .map(
                              (i) =>
                                `${i.quantidade}x ${i.nome_prato}${i.opcoes ? ` (${i.opcoes})` : ''}${i.observacao ? ` [obs: ${i.observacao}]` : ''}`,
                            )
                            .join(', ')}
                        </div>
                        {p.observacao && (
                          <div style={{ fontSize: '0.85rem', color: '#7a5a12' }}>Obs: {p.observacao}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Fragment>
            );
          })}
      </div>
    </>
  );
}

const ESTOQUE_BAIXO = 10;

function AbaEstoque({ gatilhoAtualizacao }) {
  const [dados, setDados] = useState(null); // { itens, cardapio }
  const [rascunhos, setRascunhos] = useState({}); // quantidade digitada por item
  const [entradas, setEntradas] = useState({}); // "entrada" digitada por item
  const [novoNome, setNovoNome] = useState('');
  const [novaQtd, setNovaQtd] = useState('');
  const [editando, setEditando] = useState(null); // "prato:ID" ou "opcao:ID" em edição
  const [linhas, setLinhas] = useState([]); // [{ itemId, unidades }] da edição
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    api('/estoque')
      .then(setDados)
      .catch((err) => alert(err.message));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, gatilhoAtualizacao]);

  async function chamar(caminho, opcoes) {
    try {
      const r = await api(caminho, opcoes);
      carregar();
      return r;
    } catch (err) {
      alert(err.message);
      return null;
    }
  }

  async function criarItem() {
    if (!novoNome.trim()) return alert('Dê um nome ao item.');
    const r = await chamar('/estoque', {
      method: 'POST',
      body: JSON.stringify({ nome: novoNome, quantidade: novaQtd }),
    });
    if (r) {
      setNovoNome('');
      setNovaQtd('');
    }
  }

  async function salvarQuantidade(item) {
    const r = await chamar('/estoque', {
      method: 'PATCH',
      body: JSON.stringify({ id: item.id, quantidade: rascunhos[item.id] }),
    });
    if (r) {
      setRascunhos(({ [item.id]: _descartado, ...resto }) => resto);
    }
  }

  async function darEntrada(item) {
    const n = Number(entradas[item.id]);
    if (!Number.isInteger(n) || n === 0) return alert('Digite quantas unidades entraram (ex: 30).');
    const r = await chamar('/estoque', { method: 'PATCH', body: JSON.stringify({ id: item.id, somar: n }) });
    if (r) setEntradas(({ [item.id]: _descartado, ...resto }) => resto);
  }

  async function renomear(item) {
    const nome = prompt('Novo nome do item:', item.nome);
    if (nome === null || !nome.trim()) return;
    await chamar('/estoque', { method: 'PATCH', body: JSON.stringify({ id: item.id, nome }) });
  }

  async function excluirItem(item) {
    if (!confirm(`Excluir o item "${item.nome}"? Os pratos e opções que gastam dele deixam de controlar esse item.`)) return;
    await chamar('/estoque?id=' + item.id, { method: 'DELETE' });
  }

  async function lerNomes() {
    if (
      !confirm(
        'O sistema vai ler os nomes das opções e dos pratos (ex: "3 kibe de carne", "2 Espetos de Kafta", "Qtd: 3 un") e montar o que cada um gasta. Só preenche o que ainda está vazio e cria itens SEM quantidade (nada vira "esgotado" até você digitar). Continuar?',
      )
    )
      return;
    setOcupado(true);
    const r = await chamar('/estoque/auto', { method: 'POST' });
    setOcupado(false);
    if (r) alert(`Pronto: ${r.itensCriados} itens criados e ${r.ligacoes} ligações montadas. Confira abaixo e digite as quantidades.`);
  }

  function abrirEdicao(tipo, id, consumo) {
    setEditando(`${tipo}:${id}`);
    setLinhas(consumo.length ? consumo.map((c) => ({ ...c })) : [{ itemId: '', unidades: 1 }]);
  }

  async function salvarEdicao() {
    const [tipo, id] = editando.split(':');
    const consumo = linhas
      .filter((l) => l.itemId)
      .map((l) => ({ itemId: Number(l.itemId), unidades: Number(l.unidades) || 1 }));
    const r = await chamar('/estoque/consumo', { method: 'PUT', body: JSON.stringify({ tipo, id: Number(id), consumo }) });
    if (r) setEditando(null);
  }

  if (!dados) return <div className="vazio">Carregando estoque...</div>;
  const { itens, cardapio } = dados;
  const nomeDoItem = (id) => itens.find((i) => i.id === id)?.nome || '?';

  // (função comum, não componente: assim os campos não perdem o foco a cada tecla)
  function renderConsumo({ tipo, id, nome, consumo, filho }) {
    const chave = `${tipo}:${id}`;
    const aberto = editando === chave;
    return (
      <div className={'linha-consumo' + (filho ? ' filha' : '')}>
        <div className="resumo-consumo">
          <span className="nome-estoque">{nome}</span>
          <span className="chips-consumo">
            {consumo.length === 0 ? (
              <span className="selo-estoque sem">não controla</span>
            ) : (
              consumo.map((c) => (
                <span className="selo-estoque ok" key={c.itemId}>
                  {c.unidades} × {nomeDoItem(c.itemId)}
                </span>
              ))
            )}
          </span>
          <button className="btn-secundario" type="button" onClick={() => (aberto ? setEditando(null) : abrirEdicao(tipo, id, consumo))}>
            {aberto ? 'Fechar' : 'Editar'}
          </button>
        </div>
        {aberto && (
          <div className="editor-consumo">
            <div className="dica-consumo">Gasta, a cada porção pedida:</div>
            {linhas.map((l, i) => (
              <div className="linha-form" key={i} style={{ marginBottom: 4 }}>
                <input
                  type="number"
                  min="1"
                  value={l.unidades}
                  style={{ maxWidth: 80 }}
                  onChange={(e) => setLinhas((atual) => atual.map((x, j) => (j === i ? { ...x, unidades: e.target.value } : x)))}
                />
                <span>un. de</span>
                <select
                  value={l.itemId}
                  onChange={(e) => setLinhas((atual) => atual.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}
                >
                  <option value="">Escolha o item...</option>
                  {itens.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.nome}
                    </option>
                  ))}
                </select>
                <button className="btn-secundario" type="button" onClick={() => setLinhas((atual) => atual.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <div className="linha-form" style={{ marginBottom: 0 }}>
              <button className="btn-secundario" type="button" onClick={() => setLinhas((atual) => [...atual, { itemId: '', unidades: 1 }])}>
                + Outro item
              </button>
              <button className="btn" type="button" onClick={salvarEdicao}>
                Salvar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="cartao">
        <h3>Como funciona o estoque</h3>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#555', lineHeight: 1.45 }}>
          <b>1.</b> Cadastre os <b>itens</b> que você tem na cozinha e quantas <b>unidades</b> (ex: Kibe de carne = 120,
          Espeto de Kafta = 40). <b>2.</b> Diga o que cada prato e cada opção <b>gasta</b>: a opção "3 kibe de carne"
          gasta 3 un. de Kibe de carne; "1 Espeto de Kafta e 1 Espeto de Frango" gasta 1 de cada. <b>3.</b> A cada
          pedido o sistema <b>desconta sozinho</b>. Quando o item acaba, as escolhas que dependem dele aparecem como{' '}
          <b>Esgotado</b> para o cliente. Pedido <b>cancelado ou excluído devolve</b>. Item com quantidade em branco = sem
          controle.
        </p>
        <div style={{ marginTop: 10 }}>
          <button className="btn" type="button" onClick={lerNomes} disabled={ocupado}>
            {ocupado ? 'Lendo...' : 'Ler os nomes do cardápio e montar sozinho'}
          </button>
        </div>
      </div>

      <div className="cartao">
        <h3>Itens em estoque</h3>
        {itens.length === 0 && (
          <p style={{ color: '#888', fontSize: '0.9rem' }}>
            Nenhum item ainda. Use o botão acima para o sistema montar a partir do cardápio, ou adicione abaixo.
          </p>
        )}
        {itens.map((item) => {
          const q = item.id in rascunhos ? rascunhos[item.id] : item.quantidade === null ? '' : String(item.quantidade);
          const alterado = item.id in rascunhos;
          const estado =
            item.quantidade === null ? 'sem' : item.quantidade === 0 ? 'zero' : item.quantidade <= ESTOQUE_BAIXO ? 'baixo' : 'ok';
          const rotulo = { sem: 'Sem controle', zero: 'ESGOTADO', baixo: 'Acabando', ok: 'Em estoque' }[estado];
          return (
            <div className="linha-estoque" key={item.id}>
              <div className="nome-estoque">
                {item.nome} <span className={'selo-estoque ' + estado}>{rotulo}</span>
              </div>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="unidades"
                value={q}
                onChange={(e) => setRascunhos((atual) => ({ ...atual, [item.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') salvarQuantidade(item);
                }}
              />
              <button className="btn" type="button" disabled={!alterado} onClick={() => salvarQuantidade(item)}>
                Salvar
              </button>
              <input
                type="number"
                step="1"
                className="input-un"
                placeholder="+ entrada"
                title="Chegou mercadoria? Digite quantas unidades entraram e clique em +"
                value={entradas[item.id] ?? ''}
                onChange={(e) => setEntradas((atual) => ({ ...atual, [item.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') darEntrada(item);
                }}
              />
              <button className="btn-secundario" type="button" onClick={() => darEntrada(item)}>
                +
              </button>
              <button className="btn-secundario" type="button" onClick={() => renomear(item)}>
                Renomear
              </button>
              <button className="btn-perigo" type="button" onClick={() => excluirItem(item)}>
                Excluir
              </button>
            </div>
          );
        })}
        <div className="linha-form" style={{ marginTop: 12 }}>
          <input type="text" placeholder="Novo item (ex: Kibe de carne)" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
          <input
            type="number"
            min="0"
            placeholder="Unidades"
            value={novaQtd}
            onChange={(e) => setNovaQtd(e.target.value)}
            style={{ maxWidth: 120 }}
          />
          <button className="btn" type="button" onClick={criarItem}>
            Adicionar item
          </button>
        </div>
      </div>

      <div className="cartao">
        <h3>O que cada prato e opção gasta</h3>
        {cardapio.map((cat) => (
          <div key={cat.id} style={{ marginBottom: 12 }}>
            <div className="grupo-estoque" style={{ marginLeft: 0 }}>
              {cat.nome}
            </div>
            {cat.pratos.map((prato) => (
              <div key={prato.id} className="bloco-estoque">
                {renderConsumo({ tipo: 'prato', id: prato.id, nome: prato.nome, consumo: prato.consumo })}
                {prato.grupos.map((g) => (
                  <div key={g.id}>
                    <div className="grupo-estoque">{g.nome}</div>
                    {g.opcoes.map((o) => (
                      <Fragment key={o.id}>
                        {renderConsumo({ tipo: 'opcao', id: o.id, nome: o.nome, consumo: o.consumo, filho: true })}
                      </Fragment>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function AbaCardapio() {
  const [categorias, setCategorias] = useState([]);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');

  const carregar = useCallback(() => {
    api('/cardapio').then(setCategorias);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function adicionarCategoria() {
    if (!novaCategoriaNome.trim()) return;
    await api('/categorias', { method: 'POST', body: JSON.stringify({ nome: novaCategoriaNome.trim() }) });
    setNovaCategoriaNome('');
    carregar();
  }

  async function moverCategoria(idx, dir) {
    const ids = categorias.map((c) => c.id);
    const destino = idx + dir;
    if (destino < 0 || destino >= ids.length) return;
    [ids[idx], ids[destino]] = [ids[destino], ids[idx]];
    try {
      await api('/cardapio/ordem', { method: 'POST', body: JSON.stringify({ tipo: 'categorias', ids }) });
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function excluirCategoria(id) {
    try {
      await api('/categorias/' + id, { method: 'DELETE' });
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <h3>Nova categoria</h3>
        <div className="linha-form">
          <input
            type="text"
            placeholder="Nome da categoria"
            value={novaCategoriaNome}
            onChange={(e) => setNovaCategoriaNome(e.target.value)}
          />
          <button className="btn" onClick={adicionarCategoria} type="button">
            Adicionar
          </button>
        </div>
      </div>

      {categorias.map((cat, idx) => (
        <CategoriaBloco
          key={cat.id}
          categoria={cat}
          onExcluir={excluirCategoria}
          onAtualizar={carregar}
          podeSubir={idx > 0}
          podeDescer={idx < categorias.length - 1}
          onMover={(dir) => moverCategoria(idx, dir)}
        />
      ))}
    </>
  );
}

function CategoriaBloco({ categoria, onExcluir, onAtualizar, podeSubir, podeDescer, onMover }) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [preco, setPreco] = useState('');
  const [tempoPreparo, setTempoPreparo] = useState('');
  const [peso, setPeso] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [novoPratoId, setNovoPratoId] = useState(null);
  const [observacaoPrato, setObservacaoPrato] = useState('');

  async function adicionarPrato() {
    if (!nome || !preco) return alert('Preencha nome e preço do prato.');
    const criado = await api('/pratos', {
      method: 'POST',
      body: JSON.stringify({
        categoriaId: categoria.id,
        nome,
        descricao,
        preco,
        tempoPreparo,
        peso,
        quantidade,
        observacao: observacaoPrato,
      }),
    });
    setObservacaoPrato('');
    setNovoPratoId(criado.id);
    setNome('');
    setDescricao('');
    setPreco('');
    setTempoPreparo('');
    setPeso('');
    setQuantidade('');
    onAtualizar();
  }

  async function moverPrato(idx, dir) {
    const ids = categoria.pratos.map((p) => p.id);
    const destino = idx + dir;
    if (destino < 0 || destino >= ids.length) return;
    [ids[idx], ids[destino]] = [ids[destino], ids[idx]];
    try {
      await api('/cardapio/ordem', { method: 'POST', body: JSON.stringify({ tipo: 'pratos', ids }) });
      onAtualizar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function renomear() {
    const novoNome = prompt('Novo nome da categoria:', categoria.nome);
    if (novoNome === null) return;
    if (!novoNome.trim()) return alert('O nome não pode ficar vazio.');
    try {
      await api('/categorias/' + categoria.id, { method: 'PATCH', body: JSON.stringify({ nome: novoNome.trim() }) });
      onAtualizar();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="cartao categoria-bloco">
      <h3>
        {categoria.nome}
        <span>
          <button
            className="btn-secundario"
            onClick={() => onMover(-1)}
            disabled={!podeSubir}
            type="button"
            title="Subir categoria"
            style={{ marginRight: 4 }}
          >
            ↑
          </button>
          <button
            className="btn-secundario"
            onClick={() => onMover(1)}
            disabled={!podeDescer}
            type="button"
            title="Descer categoria"
            style={{ marginRight: 8 }}
          >
            ↓
          </button>
          <button className="btn-secundario" onClick={renomear} type="button" style={{ marginRight: 8 }}>
            Renomear
          </button>
          <button className="btn-perigo" onClick={() => onExcluir(categoria.id)} type="button">
            Excluir categoria
          </button>
        </span>
      </h3>
      <div>
        {categoria.pratos.length === 0 && <p style={{ color: '#888', fontSize: '0.9rem' }}>Nenhum prato ainda.</p>}
        {categoria.pratos.map((p, idx) => (
          <PratoLinha
            key={p.id}
            podeSubir={idx > 0}
            podeDescer={idx < categoria.pratos.length - 1}
            onMover={(dir) => moverPrato(idx, dir)}
            prato={p}
            irmaos={categoria.pratos}
            abrirOpcoes={p.id === novoPratoId}
            onAtualizar={onAtualizar}
          />
        ))}
      </div>
      <div className="linha-form" style={{ marginTop: 10 }}>
        <input type="text" placeholder="Nome do prato" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input
          type="text"
          placeholder="Descrição (opcional)"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
        <input
          type="number"
          placeholder="Preço"
          step="0.01"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          style={{ maxWidth: 100 }}
        />
        <input
          type="number"
          placeholder="Preparo (min)"
          min="0"
          value={tempoPreparo}
          onChange={(e) => setTempoPreparo(e.target.value)}
          style={{ maxWidth: 120 }}
        />
        <input
          type="text"
          placeholder="Peso (ex: 300g)"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
          style={{ maxWidth: 130 }}
        />
        <input
          type="text"
          placeholder="Qtd (ex: 6 unid.)"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          style={{ maxWidth: 130 }}
        />
        <input
          type="text"
          placeholder="Observação do prato (cliente e cozinha veem)"
          value={observacaoPrato}
          onChange={(e) => setObservacaoPrato(e.target.value)}
          maxLength={200}
        />
        <button className="btn" onClick={adicionarPrato} type="button">
          Adicionar prato
        </button>
      </div>
      <p style={{ fontSize: '0.85rem', color: '#666', margin: '6px 0 0' }}>
        Dica: arroz, proteína, pastas, salada e adicionais são cadastrados depois de criar o prato, no botão{' '}
        <b>Opções</b> que aparece na linha dele (abre sozinho ao criar).
      </p>
    </div>
  );
}

const SUGESTOES_GRUPO = [
  { nome: 'Arroz', tipo: 'unica' },
  { nome: 'Proteína', tipo: 'unica' },
  { nome: 'Pastas', tipo: 'unica' },
  { nome: 'Salada', tipo: 'unica' },
  { nome: 'Adicionais', tipo: 'extra' },
  {
    nome: 'Gelo e limão',
    tipo: 'unica',
    opcoes: [
      { nome: 'Com gelo e limão', precoAdicional: '' },
      { nome: 'Só o copo', precoAdicional: '' },
    ],
  },
];

function EditorOpcoes({ prato, irmaos, onFechar }) {
  const [grupos, setGrupos] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [copiarDe, setCopiarDe] = useState('');

  useEffect(() => {
    api('/pratos/' + prato.id + '/opcoes')
      .then((lista) =>
        setGrupos(
          lista.map((g) => ({
            nome: g.nome,
            tipo: g.tipo,
            opcoes: g.opcoes.map((o) => ({
              nome: o.nome,
              descricao: o.descricao || '',
              precoAdicional: String(o.precoAdicional || ''),
              id: o.id, // para a opção não perder o que consome do estoque ao salvar
              ativo: o.ativo !== false,
            })),
          })),
        ),
      )
      .catch((err) => {
        alert(err.message);
        onFechar();
      });
  }, [prato.id]);

  function mudarGrupo(gi, mudanca) {
    setGrupos((atual) => atual.map((g, i) => (i === gi ? { ...g, ...mudanca } : g)));
  }
  function mudarOpcao(gi, oi, mudanca) {
    setGrupos((atual) =>
      atual.map((g, i) =>
        i === gi ? { ...g, opcoes: g.opcoes.map((o, j) => (j === oi ? { ...o, ...mudanca } : o)) } : g,
      ),
    );
  }
  function novaOpcao() {
    return { nome: '', descricao: '', precoAdicional: '' };
  }

  // Liga/desliga uma opção ("acabou"). Se ela já está salva, vale na hora, sem precisar clicar em Salvar.
  async function alternarAtiva(gi, oi) {
    const opcao = grupos[gi].opcoes[oi];
    const novoValor = opcao.ativo === false;
    if (opcao.id) {
      try {
        await api('/opcoes/' + opcao.id, { method: 'PATCH', body: JSON.stringify({ ativo: novoValor }) });
      } catch (err) {
        return alert(err.message);
      }
    }
    mudarOpcao(gi, oi, { ativo: novoValor });
  }

  async function copiar() {
    if (!copiarDe) return;
    if (grupos.length && !confirm('Isso troca as opções que estão na tela pelas do outro prato. Continuar?')) return;
    try {
      const lista = await api('/pratos/' + copiarDe + '/opcoes');
      setGrupos(
        lista.map((g) => ({
          nome: g.nome,
          tipo: g.tipo,
          opcoes: g.opcoes.map((o) => ({
            nome: o.nome,
            descricao: o.descricao || '',
            precoAdicional: String(o.precoAdicional || ''),
          })),
        })),
      );
    } catch (err) {
      alert(err.message);
    }
  }

  async function salvar(paraTodos = false) {
    if (
      paraTodos &&
      !confirm(
        `Isso salva estas opções em "${prato.nome}" e também em TODOS os outros pratos desta categoria (${outros.length}), trocando as opções que eles já têm. Continuar?`,
      )
    ) {
      return;
    }
    setSalvando(true);
    try {
      const corpo = JSON.stringify({ grupos });
      await api('/pratos/' + prato.id + '/opcoes', { method: 'PUT', body: corpo });
      if (paraTodos) {
        // os outros pratos recebem as opções como novas (sem herdar o consumo de estoque deste prato)
        const semEstoque = JSON.stringify({
          grupos: grupos.map((g) => ({ ...g, opcoes: g.opcoes.map((o) => ({ ...o, id: undefined })) })),
        });
        for (const p of outros) await api('/pratos/' + p.id + '/opcoes', { method: 'PUT', body: semEstoque });
      }
      onFechar(paraTodos ? 'todos' : true);
    } catch (err) {
      alert(err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!grupos) return <div style={{ padding: 10, color: '#888' }}>Carregando opções...</div>;

  const outros = (irmaos || []).filter((p) => p.id !== prato.id);

  return (
    <div style={{ background: '#faf7f2', padding: 12, borderRadius: 8, margin: '4px 0 10px' }}>
      <strong>Opções de “{prato.nome}”</strong>
      <p style={{ fontSize: '0.85rem', color: '#666', margin: '4px 0 10px' }}>
        <b>Escolher 1</b>: o cliente é obrigado a escolher uma opção do grupo (ex: Arroz). <b>Adicional</b>: o cliente
        marca quantos quiser e paga o valor extra de cada um.
      </p>

      {grupos.map((g, gi) => (
        <div key={gi} style={{ background: '#fff', border: '1px solid #e5ddd0', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div className="linha-form" style={{ marginBottom: 6 }}>
            <input
              type="text"
              placeholder="Nome do grupo (ex: Arroz)"
              value={g.nome}
              onChange={(e) => mudarGrupo(gi, { nome: e.target.value })}
            />
            <select value={g.tipo} onChange={(e) => mudarGrupo(gi, { tipo: e.target.value })}>
              <option value="unica">Escolher 1 (obrigatório)</option>
              <option value="extra">Adicional (cobrado à parte)</option>
            </select>
            <button
              className="btn-perigo"
              type="button"
              onClick={() => setGrupos((atual) => atual.filter((_, i) => i !== gi))}
            >
              Remover grupo
            </button>
          </div>
          {g.opcoes.map((o, oi) => (
            <div key={oi} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed #e5ddd0' }}>
              <div className="linha-form" style={{ marginBottom: 4 }}>
                <input
                  type="text"
                  placeholder="Opção (ex: Arroz branco)"
                  value={o.nome}
                  onChange={(e) => mudarOpcao(gi, oi, { nome: e.target.value })}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={g.tipo === 'extra' ? 'Valor a mais (R$)' : 'Valor a mais (opcional)'}
                  value={o.precoAdicional}
                  onChange={(e) => mudarOpcao(gi, oi, { precoAdicional: e.target.value })}
                  style={{ maxWidth: 160 }}
                />
                <button
                  className={o.ativo === false ? 'btn-perigo' : 'btn-secundario'}
                  type="button"
                  title={o.ativo === false ? 'Acabou — clique para voltar a oferecer' : 'Clique quando acabar'}
                  onClick={() => alternarAtiva(gi, oi)}
                >
                  {o.ativo === false ? '⛔ Acabou (ativar)' : '✔ Disponível'}
                </button>
                <button
                  className="btn-secundario"
                  type="button"
                  onClick={() => mudarGrupo(gi, { opcoes: g.opcoes.filter((_, j) => j !== oi) })}
                >
                  ✕
                </button>
              </div>
              <input
                type="text"
                placeholder="Descrição da opção (opcional — o cliente vê ao escolher)"
                maxLength={200}
                value={o.descricao || ''}
                onChange={(e) => mudarOpcao(gi, oi, { descricao: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
          ))}
          <button
            className="btn-secundario"
            type="button"
            onClick={() => mudarGrupo(gi, { opcoes: [...g.opcoes, novaOpcao()] })}
          >
            + Adicionar opção
          </button>
        </div>
      ))}

      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: '0.85rem', color: '#666' }}>Adicionar grupo: </span>
        {SUGESTOES_GRUPO.map((s) => (
          <button
            key={s.nome}
            className="btn-secundario"
            type="button"
            style={{ marginRight: 6, marginBottom: 4 }}
            onClick={() =>
              setGrupos((atual) => [...atual, { ...s, opcoes: s.opcoes ? s.opcoes.map((o) => ({ ...o })) : [novaOpcao()] }])
            }
          >
            + {s.nome}
          </button>
        ))}
        <button
          className="btn-secundario"
          type="button"
          style={{ marginBottom: 4 }}
          onClick={() => setGrupos((atual) => [...atual, { nome: '', tipo: 'unica', opcoes: [novaOpcao()] }])}
        >
          + Outro
        </button>
      </div>

      {outros.length > 0 && (
        <div className="linha-form">
          <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)}>
            <option value="">Copiar opções de outro prato...</option>
            {outros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <button className="btn-secundario" type="button" onClick={copiar} disabled={!copiarDe}>
            Copiar
          </button>
        </div>
      )}

      <div className="linha-form" style={{ marginBottom: 0 }}>
        <button className="btn" type="button" onClick={() => salvar(false)} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar opções'}
        </button>
        {outros.length > 0 && (
          <button className="btn-secundario" type="button" onClick={() => salvar(true)} disabled={salvando}>
            Salvar e aplicar a todos desta categoria
          </button>
        )}
        <button className="btn-secundario" type="button" onClick={() => onFechar()}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function PratoLinha({ prato, irmaos, abrirOpcoes, onAtualizar, podeSubir, podeDescer, onMover }) {
  const inputFotoRef = useRef(null);

  const [editandoOpcoes, setEditandoOpcoes] = useState(!!abrirOpcoes);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({});

  function abrirEdicao() {
    setForm({
      nome: prato.nome,
      descricao: prato.descricao || '',
      preco: String(prato.preco),
      tempoPreparo: String(prato.tempo_preparo || 0),
      peso: prato.peso || '',
      quantidade: prato.quantidade || '',
      observacao: prato.observacao || '',
    });
    setEditando(true);
  }

  async function salvarEdicao() {
    if (!form.nome.trim() || form.preco === '') return alert('Preencha nome e preço do prato.');
    try {
      await api('/pratos/' + prato.id, { method: 'PATCH', body: JSON.stringify(form) });
      setEditando(false);
      onAtualizar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function alternarAtivo() {
    await api('/pratos/' + prato.id, { method: 'PATCH', body: JSON.stringify({ ativo: !prato.ativo }) });
    onAtualizar();
  }

  async function excluir() {
    if (!confirm('Excluir este prato?')) return;
    await api('/pratos/' + prato.id, { method: 'DELETE' });
    onAtualizar();
  }

  async function enviarFoto(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    const formData = new FormData();
    formData.append('foto', arquivo);
    try {
      const resp = await fetch('/api/admin/pratos/' + prato.id + '/foto', { method: 'POST', body: formData });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || 'Erro ao enviar imagem.');
      onAtualizar();
    } catch (err) {
      alert(err.message);
    }
    e.target.value = '';
  }

  async function removerFoto() {
    if (!confirm('Remover a foto deste prato?')) return;
    await api('/pratos/' + prato.id + '/foto', { method: 'DELETE' });
    onAtualizar();
  }

  if (editando) {
    const campo = (chave, placeholder, extra = {}) => (
      <input
        type="text"
        placeholder={placeholder}
        value={form[chave]}
        onChange={(e) => setForm({ ...form, [chave]: e.target.value })}
        {...extra}
      />
    );
    return (
      <div className="prato-linha" style={{ background: '#faf7f2', padding: 10, borderRadius: 8 }}>
        <div className="linha-form" style={{ width: '100%', marginBottom: 0 }}>
          {campo('nome', 'Nome do prato')}
          {campo('descricao', 'Descrição (opcional)')}
          {campo('preco', 'Preço', { type: 'number', step: '0.01', style: { maxWidth: 100 } })}
          {campo('tempoPreparo', 'Preparo (min)', { type: 'number', min: '0', style: { maxWidth: 120 } })}
          {campo('peso', 'Peso (ex: 300g)', { style: { maxWidth: 130 } })}
          {campo('quantidade', 'Qtd (ex: 6 unid.)', { style: { maxWidth: 130 } })}
          {campo('observacao', 'Observação do prato (cliente e cozinha veem)', { maxLength: 200 })}
          <button className="btn" onClick={salvarEdicao} type="button">
            Salvar
          </button>
          <button className="btn-secundario" onClick={() => setEditando(false)} type="button">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className={'prato-linha' + (prato.ativo ? '' : ' inativo')}>
      {prato.foto ? (
        <img className="prato-thumb" src={prato.foto} alt="" />
      ) : (
        <div className="prato-thumb prato-thumb-vazia">sem foto</div>
      )}
      <div className="info">
        <strong>{prato.nome}</strong> — {formatarMoeda(prato.preco)}
        {prato.tempo_preparo ? <span className="badge-tempo">⏱ {prato.tempo_preparo} min</span> : null}
        {prato.peso ? <span className="badge-tempo">⚖ {prato.peso}</span> : null}
        {prato.quantidade ? <span className="badge-tempo">🍽 {prato.quantidade}</span> : null}
        {prato.descricao && <div style={{ fontSize: '0.85rem', color: '#777' }}>{prato.descricao}</div>}
        {prato.observacao && (
          <div style={{ fontSize: '0.85rem', color: '#7a5a12' }}>Obs: {prato.observacao}</div>
        )}
      </div>
      <button className="btn-secundario" onClick={() => inputFotoRef.current.click()} type="button">
        {prato.foto ? 'Trocar foto' : 'Adicionar foto'}
      </button>
      <input type="file" accept="image/*" ref={inputFotoRef} style={{ display: 'none' }} onChange={enviarFoto} />
      {prato.foto && (
        <button className="btn-secundario" onClick={removerFoto} type="button">
          Remover foto
        </button>
      )}
      <button className="btn-secundario" onClick={abrirEdicao} type="button">
        Editar
      </button>
      <button className="btn-secundario" onClick={() => onMover(-1)} disabled={!podeSubir} type="button" title="Subir prato">
        ↑
      </button>
      <button className="btn-secundario" onClick={() => onMover(1)} disabled={!podeDescer} type="button" title="Descer prato">
        ↓
      </button>
      <button className="btn-secundario" onClick={() => setEditandoOpcoes((v) => !v)} type="button">
        Opções
      </button>
      <button className="btn-secundario" onClick={alternarAtivo} type="button">
        {prato.ativo ? 'Desativar' : 'Ativar'}
      </button>
      <button className="btn-perigo" onClick={excluir} type="button">
        Excluir
      </button>
    </div>
    {editandoOpcoes && (
      <EditorOpcoes
        prato={prato}
        irmaos={irmaos}
        onFechar={(salvou) => {
          setEditandoOpcoes(false);
          if (salvou === 'todos') alert('Opções salvas neste prato e em todos da categoria!');
          else if (salvou) alert('Opções salvas!');
        }}
      />
    )}
    </>
  );
}

function QrItem({ mesa, url, selecionado }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, 300, 300);
      ctx.fillStyle = '#2b2b2b';
      ctx.font = 'bold 28px -apple-system, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Mesa ' + mesa, canvas.width / 2, 332);
    };
    img.src = '/api/admin/qrcode?url=' + encodeURIComponent(url);
  }, [mesa, url]);

  return (
    <div className={'qr-item' + (selecionado ? ' selecionado-impressao' : '')} id={'qr-item-' + mesa}>
      <canvas ref={canvasRef} width={300} height={340} />
    </div>
  );
}

function AbaQrCodes() {
  const [de, setDe] = useState(1);
  const [ate, setAte] = useState(10);
  const [gerados, setGerados] = useState([]);
  const [endereco, setEndereco] = useState('');
  const [mesaSelecionada, setMesaSelecionada] = useState(null);
  const gridRef = useRef(null);

  function gerar() {
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    setEndereco(base);
    const lista = [];
    for (let mesa = de; mesa <= ate; mesa++) lista.push(mesa);
    setGerados(lista);
  }

  useEffect(() => {
    if (mesaSelecionada === null) return;
    window.print();
    const limpar = () => setMesaSelecionada(null);
    window.addEventListener('afterprint', limpar, { once: true });
    return () => window.removeEventListener('afterprint', limpar);
  }, [mesaSelecionada]);

  return (
    <>
      <div className="cartao">
        <h3>Gerar QR Codes por mesa</h3>
        <div className="linha-form">
          <input type="number" placeholder="Da mesa nº" value={de} min={1} onChange={(e) => setDe(Number(e.target.value) || 1)} />
          <input
            type="number"
            placeholder="Até a mesa nº"
            value={ate}
            min={1}
            onChange={(e) => setAte(Number(e.target.value) || 1)}
          />
          <button className="btn" onClick={gerar} type="button">
            Gerar
          </button>
        </div>
        {endereco && <p style={{ fontSize: '0.85rem', color: '#666' }}>Endereço usado nos QR Codes: {endereco}/</p>}
      </div>

      <div className={'qr-grid' + (mesaSelecionada !== null ? ' imprimindo-um' : '')} ref={gridRef}>
        {gerados.map((mesa) => (
          <div key={mesa}>
            <QrItem mesa={mesa} url={`${endereco}/?mesa=${mesa}`} selecionado={mesaSelecionada === mesa} />
            <button
              className="btn-secundario btn-imprimir-um"
              type="button"
              onClick={() => setMesaSelecionada(mesa)}
            >
              Imprimir
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function AbaConfig({ config, onConfigAtualizado }) {
  const [nomeLoja, setNomeLoja] = useState(config.nomeLoja);
  const [msgNome, setMsgNome] = useState({ texto: '', cor: '' });
  const [novaSenha, setNovaSenha] = useState('');
  const [msgSenha, setMsgSenha] = useState('');
  const [acessos, setAcessos] = useState([]);
  const inputLogoRef = useRef(null);

  useEffect(() => {
    api('/acessos').then(setAcessos);
  }, []);

  async function salvarNome() {
    try {
      await api('/config', { method: 'POST', body: JSON.stringify({ nomeLoja }) });
      setMsgNome({ texto: 'Nome salvo com sucesso.', cor: '#1a7a3d' });
      onConfigAtualizado((atual) => ({ ...atual, nomeLoja }));
    } catch (err) {
      setMsgNome({ texto: err.message, cor: '#a3352b' });
    }
  }

  async function enviarLogo(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    const formData = new FormData();
    formData.append('logo', arquivo);
    try {
      const resp = await fetch('/api/admin/logo', { method: 'POST', body: formData });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || 'Erro ao enviar logo.');
      onConfigAtualizado((atual) => ({ ...atual, logoUrl: dados.logoUrl }));
    } catch (err) {
      alert(err.message);
    }
    e.target.value = '';
  }

  async function trocarSenha() {
    try {
      await api('/senha', { method: 'POST', body: JSON.stringify({ novaSenha }) });
      setMsgSenha('Senha alterada com sucesso.');
      setNovaSenha('');
    } catch (err) {
      setMsgSenha(err.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <h3>Personalização</h3>
        <div className="linha-form">
          <input type="text" placeholder="Nome do restaurante" value={nomeLoja} onChange={(e) => setNomeLoja(e.target.value)} />
          <button className="btn" onClick={salvarNome} type="button">
            Salvar nome
          </button>
        </div>
        <div className="erro" style={{ color: msgNome.cor }}>
          {msgNome.texto}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
          {config.logoUrl && <img src={config.logoUrl} className="logo-preview" alt="Logo atual" />}
          <div>
            <button className="btn-secundario" onClick={() => inputLogoRef.current.click()} type="button">
              Enviar logo
            </button>
            <input type="file" accept="image/*" ref={inputLogoRef} style={{ display: 'none' }} onChange={enviarLogo} />
          </div>
        </div>
      </div>

      <div className="cartao">
        <h3>Trocar senha do painel</h3>
        <div className="linha-form">
          <input
            type="password"
            placeholder="Nova senha"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
          />
          <button className="btn" onClick={trocarSenha} type="button">
            Salvar
          </button>
        </div>
        <div className="erro">{msgSenha}</div>
      </div>

      <div className="cartao">
        <h3>Histórico de acessos ao painel</h3>
        <p style={{ fontSize: '0.85rem', color: '#666', marginTop: 0 }}>
          Como a senha é única e compartilhada, isso mostra apenas quando e de qual aparelho (endereço na rede)
          alguém entrou — não o nome da pessoa.
        </p>
        <table>
          <thead>
            <tr>
              <th>Data e hora</th>
              <th>Aparelho (IP)</th>
            </tr>
          </thead>
          <tbody>
            {acessos.length === 0 && (
              <tr>
                <td colSpan={2} style={{ textAlign: 'center', color: '#888' }}>
                  Nenhum acesso registrado ainda.
                </td>
              </tr>
            )}
            {acessos.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>{a.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

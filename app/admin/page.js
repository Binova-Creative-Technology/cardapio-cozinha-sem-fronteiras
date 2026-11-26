'use client';

import { Fragment, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { reduzirImagem } from '@/lib/imagem';

function formatarMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Ícone de traço único (desenhado no globals.css)
function I({ n, s }) {
  return <span className={'i i-' + n} style={s ? { '--s': s + 'px' } : undefined} aria-hidden="true" />;
}

// Rótulo e cor de cada status de pedido
const STATUS_ADM = {
  recebido: ['Recebido', 'brand'],
  'em preparo': ['Em preparo', 'warn'],
  pronto: ['Pronto', 'ok'],
  entregue: ['Entregue', 'info'],
  cancelado: ['Cancelado', 'neutral'],
};

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
        document.title = c.nomeLoja + ': Painel';
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
    <div className="login">
      <div className="art wine">{config.logoUrl && <img src={config.logoUrl} alt="Logo" />}</div>
      <div className="lado-form">
        <form
          className="stagger"
          onSubmit={(e) => {
            e.preventDefault();
            entrar();
          }}
        >
          <h1 style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>{config.nomeLoja}</h1>
          <div className="field">
            <label htmlFor="senha" style={{ fontSize: 14 }}>Senha</label>
            <div className="input-wrap">
              <I n="lock" />
              <input
                id="senha"
                className="input"
                style={{ height: 56 }}
                type="password"
                autoComplete="current-password"
                placeholder="Senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            {erro && (
              <div className="erro" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <I n="alert" s={16} />
                {erro}
              </div>
            )}
          </div>
          <button className="btn block" style={{ height: 56 }} disabled={entrando} type="submit">
            Entrar
          </button>
        </form>
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

    // uma checagem por vez (aviso, reconexão e reserva podem chegar juntos; o alarme não pode tocar 2x)
    let checando = false;
    let deNovo = false;
    const verificar = async () => {
      if (checando) {
        deNovo = true;
        return;
      }
      checando = true;
      try {
        await checarNovidades();
      } finally {
        checando = false;
        if (deNovo) {
          deNovo = false;
          verificar();
        }
      }
    };
    const checarNovidades = async () => {
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
                body: `Mesa ${f.mesa} quer fechar a conta: ${formatarMoeda(f.total)}`,
              });
            }
          });
          ultimoIdFechamento.current = ultimoId;
          carregarFechamentos();
        }
      } catch (e) {
        /* tenta de novo no próximo ciclo */
      }
    };

    // O servidor avisa na hora (SSE) quando chega pedido ou pedido de conta; a checagem a cada
    // 60 s fica só de reserva (conexão caiu, servidor reiniciou). Ao reconectar, confere de novo.
    const intervalo = setInterval(verificar, 60000);
    let fonte = null;
    if (window.EventSource) {
      fonte = new EventSource('/api/admin/eventos');
      fonte.onopen = verificar;
      fonte.onmessage = (e) => {
        try {
          const { canal } = JSON.parse(e.data);
          if (canal === 'pedido' || canal === 'fechamento') verificar();
        } catch {}
      };
    }

    return () => {
      clearInterval(intervalo);
      fonte?.close();
    };
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
    <div className="adm">
      <aside className="side">
        <div className="brand">
          {config.logoUrl && <img src={config.logoUrl} alt="Logo" />}
          <b>{config.nomeLoja}</b>
        </div>
        <nav className="side-nav" aria-label="Seções do painel">
          {[
            ['pedidos', 'Pedidos', 'receipt'],
            ['relatorio', 'Relatório', 'chart'],
            ['cardapio', 'Cardápio', 'book'],
            ['estoque', 'Estoque', 'box'],
            ['whatsapp', 'WhatsApp', 'chat'],
            ['qrcodes', 'QR Codes', 'qr'],
            ['config', 'Configurações', 'sliders'],
          ].map(([id, rotulo, icone]) => (
            <button key={id} className={'nav' + (aba === id ? ' on' : '')} onClick={() => setAba(id)} type="button">
              <I n={icone} />
              {rotulo}
            </button>
          ))}
        </nav>
        <label className="store-toggle">
          <b>{lojaAberta ? 'Loja aberta' : 'Loja fechada'}</b>
          <input className="sr-only" type="checkbox" checked={lojaAberta} onChange={(e) => alternarLoja(e.target.checked)} />
          <span className={'switch' + (lojaAberta ? ' on' : '')} aria-hidden="true" />
        </label>
        <button className="nav sair" onClick={sair} type="button" style={{ color: '#E2C2B8', marginTop: 6 }}>
          <I n="logout" />
          Sair
        </button>
      </aside>

      <main className="main">
        <div className="main-inner">
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
        {aba === 'whatsapp' && <AbaWhatsapp />}
        {aba === 'qrcodes' && <AbaQrCodes />}
        {aba === 'config' && <AbaConfig config={config} onConfigAtualizado={onConfigAtualizado} />}
        </div>
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

// A equipe monta um pedido novo dentro de uma comanda (adicionar algo que o cliente pediu depois).
function ModalAdicionarItens({ mesa, onFechar, onCriado }) {
  const [cardapio, setCardapio] = useState(null);
  const [catId, setCatId] = useState('');
  const [pratoSel, setPratoSel] = useState(null);
  const [escolhas, setEscolhas] = useState({});
  const [qtd, setQtd] = useState(1);
  const [obs, setObs] = useState('');
  const [lista, setLista] = useState([]); // linhas já montadas
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    fetch('/api/cardapio')
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) throw new Error();
        // só o que dá para pedir agora (o que acabou nem aparece)
        const visivel = data
          .map((c) => ({ ...c, pratos: c.pratos.filter((p) => p.estoque !== 0) }))
          .filter((c) => c.pratos.length > 0);
        setCardapio(visivel);
        if (visivel[0]) setCatId(String(visivel[0].id));
      })
      .catch(() => setErro('Não foi possível carregar o cardápio.'));
  }, []);

  function abrirPrato(prato) {
    setPratoSel(prato);
    setEscolhas({});
    setQtd(1);
    setObs('');
    setErro('');
  }

  const gruposDe = (prato) =>
    prato.grupos
      .map((g) => ({ ...g, opcoes: g.opcoes.filter((o) => o.estoque !== 0 && o.ativo !== false) }))
      .filter((g) => g.opcoes.length > 0);

  function marcar(g, o) {
    setEscolhas((atual) => {
      const marcadas = atual[g.id] || [];
      if (g.tipo === 'unica') return { ...atual, [g.id]: [o.id] };
      return { ...atual, [g.id]: marcadas.includes(o.id) ? marcadas.filter((x) => x !== o.id) : [...marcadas, o.id] };
    });
  }

  function adicionarNaLista() {
    const grupos = gruposDe(pratoSel);
    const faltando = grupos.find((g) => g.tipo === 'unica' && !(escolhas[g.id] || []).length);
    if (faltando) return setErro(`Escolha uma opção de "${faltando.nome}".`);
    const opcoes = grupos.flatMap((g) => g.opcoes.filter((o) => (escolhas[g.id] || []).includes(o.id)));
    setLista((atual) => [
      ...atual,
      {
        pratoId: pratoSel.id,
        nome: pratoSel.nome.trim(),
        quantidade: qtd,
        opcoes: opcoes.map((o) => o.id),
        textoOpcoes: opcoes.map((o) => o.nome).join(' · '),
        observacao: obs.trim(),
      },
    ]);
    setPratoSel(null);
  }

  async function enviar() {
    if (lista.length === 0) return;
    setEnviando(true);
    setErro('');
    try {
      const r = await api('/pedidos/novo', {
        method: 'POST',
        body: JSON.stringify({
          mesa,
          itens: lista.map((l) => ({ pratoId: l.pratoId, quantidade: l.quantidade, opcoes: l.opcoes, observacao: l.observacao })),
        }),
      });
      onCriado(r);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const categoria = cardapio?.find((c) => String(c.id) === catId);

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-label="Adicionar à comanda">
        <div className="modal-cab">
          <h3>Adicionar à comanda: {mesa}</h3>
        </div>
        <div className="modal-corpo">
          {!cardapio && !erro && <div className="vazio">Carregando cardápio...</div>}

          {cardapio && !pratoSel && (
            <>
              <select className="select" value={catId} onChange={(e) => setCatId(e.target.value)} style={{ width: '100%', height: 46 }} aria-label="Categoria">
                {cardapio.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 8 }}>
                {categoria?.pratos.map((p) => (
                  <div className="est-row" key={p.id}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontWeight: 600 }}>{p.nome.trim()}</b>{' '}
                      <span className="money muted" style={{ fontSize: 13.5 }}>{formatarMoeda(p.preco)}</span>
                    </span>
                    <button className="btn sm soft" type="button" onClick={() => abrirPrato(p)}>
                      Escolher
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {pratoSel && (
            <>
              <h4 style={{ fontSize: 17, fontWeight: 600 }}>{pratoSel.nome.trim()}</h4>
              {gruposDe(pratoSel).map((g) => (
                <div key={g.id}>
                  <div className="grp-h">
                    <h4>{g.nome}</h4>
                    <span className={'tag ' + (g.tipo === 'unica' ? 'brand' : 'neutral')}>{g.tipo === 'unica' ? 'Escolha 1' : 'Opcional'}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {g.opcoes.map((o) => {
                      const marcada = (escolhas[g.id] || []).includes(o.id);
                      return (
                        <label className={'opt' + (g.tipo === 'unica' ? '' : ' sq') + (marcada ? ' on' : '')} key={o.id} style={{ minHeight: 50 }}>
                          <input
                            className="sr-only"
                            type={g.tipo === 'unica' ? 'radio' : 'checkbox'}
                            name={'adm-grupo-' + g.id}
                            checked={marcada}
                            onChange={() => marcar(g, o)}
                          />
                          <span className="mark"><I n="check" /></span>
                          <span className="opt-txt"><span className="o-nm">{o.nome}</span></span>
                          {o.precoAdicional > 0 && <span className="o-pr money">+ {formatarMoeda(o.precoAdicional)}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="linha-qtd">
                <span>Quantidade</span>
                <span className="stepper light">
                  <button type="button" aria-label="Diminuir" onClick={() => setQtd((q) => Math.max(1, q - 1))}>
                    <I n="minus" s={18} />
                  </button>
                  <span className="n">{qtd}</span>
                  <button type="button" aria-label="Aumentar" onClick={() => setQtd((q) => Math.min(99, q + 1))}>
                    <I n="plus" s={18} />
                  </button>
                </span>
              </div>
              <input
                className="input"
                style={{ marginTop: 14, height: 46, fontSize: 14 }}
                type="text"
                placeholder="Observação deste prato (opcional)"
                aria-label="Observação deste prato"
                maxLength={200}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </>
          )}

          {lista.length > 0 && !pratoSel && (
            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 14, background: 'var(--surface-2)' }}>
              <b style={{ fontFamily: 'var(--f-d)', fontWeight: 600 }}>Vai para a comanda:</b>
              {lista.map((l, i) => (
                <div className="it" key={i}>
                  <span className="qty">{l.quantidade}×</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{l.nome}</span>
                    {l.textoOpcoes && <span className="muted" style={{ display: 'block', fontSize: 13 }}>{l.textoOpcoes}</span>}
                    {l.observacao && <span style={{ display: 'block', fontSize: 13, color: 'var(--warn)' }}>Obs: {l.observacao}</span>}
                  </span>
                  <button className="mini" type="button" aria-label="Tirar da lista" onClick={() => setLista((a) => a.filter((_, j) => j !== i))}>
                    <I n="x" s={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {erro && (
            <p className="erro" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <I n="alert" s={16} />
              {erro}
            </p>
          )}
        </div>

        {pratoSel ? (
          <div className="acoes">
            <button className="btn md line" type="button" onClick={() => setPratoSel(null)}>
              Voltar
            </button>
            <button className="btn md" type="button" onClick={adicionarNaLista}>
              <I n="plus" s={18} />
              Colocar na lista
            </button>
          </div>
        ) : (
          <div className="acoes">
            <button className="btn md line" type="button" onClick={onFechar}>
              Cancelar
            </button>
            <button className="btn md" type="button" disabled={lista.length === 0 || enviando} onClick={enviar}>
              <I n="send" s={18} />
              {enviando ? 'Enviando...' : 'Enviar para a cozinha'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
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
  const [adicionandoMesa, setAdicionandoMesa] = useState(null);

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

  // Conta (fechamento) que encerrou o pedido, ou null se a comanda ainda está aberta.
  function fechamentoDe(p) {
    const criado = new Date(p.criado_em).getTime();
    const achados = concluidos
      .filter((f) => {
        const t = new Date(f.criado_em).getTime();
        return f.mesa === p.mesa && t >= criado && t - criado < 18 * 3600000;
      })
      .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
    return achados.length ? achados[0].id : null;
  }

  // Um cliente que pede várias vezes aparece como UMA comanda (mesa + dia + conta), não como vários pedidos.
  const comandas = (() => {
    const mapa = new Map();
    for (const p of pedidos) {
      // (a lista vem do pedido mais novo para o mais antigo)
      const dia = diaBR(p.criado_em);
      const fid = p.mesa ? fechamentoDe(p) : null;
      const chave = p.mesa ? `${dia}|${p.mesa}|${fid ?? 'aberta'}` : `${dia}|sem-mesa|${p.id}`;
      if (!mapa.has(chave)) mapa.set(chave, { chave, dia, mesa: p.mesa, fechamentoId: fid, pedidos: [] });
      mapa.get(chave).pedidos.push(p);
    }
    return [...mapa.values()].map((g) => ({ ...g, pedidos: [...g.pedidos].reverse() }));
  })();

  // Tira 1 unidade ('menos') ou o prato todo ('tirar') de um pedido; o estoque volta e os valores se refazem.
  async function ajustarItem(item, acao, pedido) {
    if (acao === 'tirar' && !confirm(`Tirar "${item.nome_prato.trim()}" (${item.quantidade}x) deste pedido?`)) return;
    try {
      if (acao === 'menos') {
        await api(`/itens/${item.id}`, { method: 'PATCH', body: JSON.stringify({ delta: -1 }) });
      } else {
        const r = await api(`/itens/${item.id}`, { method: 'DELETE' });
        if (r.pedidoRemovido && pedido) {
          setExpandidoId(null);
          alert('Esse era o único item: o pedido foi removido.');
        }
      }
      carregarPedidos(mes);
    } catch (err) {
      alert(err.message);
    }
  }

  async function excluirPedido(p) {
    const resumoPedido = `Pedido nº ${p.id}, ${p.mesa || 'sem mesa'}, ${formatarMoeda(p.total)}`;
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
      <div className="topbar">
        <h1>Pedidos</h1>
        <select className="select" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
          {meses.map((m) => (
            <option key={m} value={m}>
              {formatarMesLabel(m)}
            </option>
          ))}
        </select>
        <button className="btn sm line" type="button" onClick={alternarVendas}>
          <I n={mostrarVendas ? 'eye-off' : 'eye'} />
          {mostrarVendas ? 'Tampar valor das vendas' : 'Mostrar valor das vendas'}
        </button>
      </div>

      {fechamentosPendentes.length > 0 && (
        <section className="alert-bar rise" id="cartao-fechamentos">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 12 }}>
            <span className="ic"><I n="concierge" s={22} /></span>
            <h3 style={{ fontSize: 17, fontWeight: 600 }}>Contas para fechar</h3>
          </div>
          {fechamentosPendentes.map((f) => {
            const hora = new Date(f.criado_em).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div className="bill" key={f.id}>
                <b style={{ fontFamily: 'var(--f-d)', fontWeight: 600, fontSize: 16, minWidth: 120 }}>Mesa {f.mesa}</b>
                <span style={{ color: '#EBCFC6', fontSize: 14 }}>às {hora}</span>
                <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <span className="money" style={{ fontFamily: 'var(--f-d)', fontWeight: 700, fontSize: 18, color: 'var(--gold-soft)' }}>
                    {formatarMoeda(f.total)}
                  </span>
                  <small style={{ display: 'block', color: '#EBCFC6', fontSize: 12 }}>já com 10% de serviço</small>
                </span>
                <button className="btn sm on-wine" onClick={() => onImprimirConta(f.id)} type="button">
                  <I n="printer" s={18} />
                  Imprimir conta
                </button>
                <button className="btn sm gold" onClick={() => onConcluirFechamento(f.id)} type="button">
                  <I n="check" s={18} />
                  Concluído
                </button>
              </div>
            );
          })}
        </section>
      )}

      <div className="kpis stagger">
        <div className="kpi">
          <div className="k"><I n="wallet" s={16} />Faturamento do mês</div>
          <div className="v money">{mostrarVendas ? formatarMoeda(resumo.faturamento) : tampado}</div>
        </div>
        <div className="kpi">
          <div className="k"><I n="receipt" s={16} />Pedidos no mês</div>
          <div className="v">{resumo.totalPedidos}</div>
        </div>
      </div>

      <div>
        <div>
          <div>
            {comandas.length === 0 && <div className="panel vazio">Nenhum pedido neste mês.</div>}
            {comandas.map((g, idxGrupo) => {
              const horaDe = (iso) =>
                new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
              const validos = g.pedidos.filter((x) => x.status !== 'cancelado');
              const totalGrupo = validos.reduce((soma, x) => soma + Number(x.total), 0);
              const totalItens = validos.reduce((soma, x) => soma + x.itens.reduce((s, i) => s + i.quantidade, 0), 0);
              const fechadoGrupo = g.fechamentoId !== null && validos.length > 0;
              const primeiro = g.pedidos[0];
              const ultimo = g.pedidos[g.pedidos.length - 1];
              const novoDia = idxGrupo === 0 || comandas[idxGrupo - 1].dia !== g.dia;
              const hojeBR = diaBR(new Date().toISOString());
              const doDia = comandas.filter((x) => x.dia === g.dia);
              const totalDoDia = doDia.reduce(
                (soma, c) => soma + c.pedidos.filter((x) => x.status !== 'cancelado').reduce((s, x) => s + Number(x.total), 0),
                0,
              );
              const comandasDoDia = doDia.filter((c) => c.pedidos.some((x) => x.status !== 'cancelado')).length;
              const aberto = expandidoId === g.chave;
              const piscando = !fechadoGrupo && g.pedidos.some((x) => x.status === 'recebido');
              const resumoStatus = {};
              for (const x of validos) resumoStatus[x.status] = (resumoStatus[x.status] || 0) + 1;

              const alternar = () => setExpandidoId(aberto ? null : g.chave);
              return (
                <Fragment key={g.chave}>
                  {novoDia && (
                    <div className="dayhead">
                      <h4>
                        {g.dia === hojeBR ? 'Hoje, ' : ''}
                        {formatarDiaLabel(g.dia)}
                      </h4>
                      <span className="muted money" style={{ fontSize: 13.5 }}>
                        {comandasDoDia} {comandasDoDia === 1 ? 'comanda' : 'comandas'}, {mostrarVendas ? formatarMoeda(totalDoDia) : tampado}
                      </span>
                    </div>
                  )}
                  <div className={'cmd' + (piscando ? ' novo' : '')}>
                    <div
                      className="cmd-row"
                      role="button"
                      tabIndex={0}
                      aria-expanded={aberto}
                      onClick={alternar}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          alternar();
                        }
                      }}
                    >
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {piscando && <span className="badge-novo">NOVO</span>}
                        <span className="money" style={{ fontWeight: 600, fontSize: 14 }}>
                          {horaDe(primeiro.criado_em)}
                          {g.pedidos.length > 1 && horaDe(ultimo.criado_em) !== horaDe(primeiro.criado_em) && (
                            <span className="muted"> → {horaDe(ultimo.criado_em)}</span>
                          )}
                        </span>
                      </span>
                      <span className="mesa">{g.mesa || '-'}</span>
                      <span className="muted hide-m" style={{ fontSize: 13.5 }}>
                        {g.pedidos.length} {g.pedidos.length === 1 ? 'pedido' : 'pedidos'}, {totalItens} {totalItens === 1 ? 'item' : 'itens'}
                      </span>
                      <span className="money" style={{ fontFamily: 'var(--f-d)', fontWeight: 600, fontSize: 15.5 }}>
                        {formatarMoeda(totalGrupo)}
                      </span>
                      <span className="hide-m" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {fechadoGrupo ? (
                          <span className="tag ok"><I n="check" />Fechado</span>
                        ) : validos.length === 0 ? (
                          <span className="tag neutral">Cancelado</span>
                        ) : (
                          Object.entries(resumoStatus).map(([st, n]) => (
                            <span key={st} className={'tag ' + (STATUS_ADM[st]?.[1] || 'neutral')}>
                              {g.pedidos.length > 1 ? `${n}× ` : ''}
                              {STATUS_ADM[st]?.[0] || st}
                            </span>
                          ))
                        )}
                      </span>
                      <span className="hide-m" style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                        {!fechadoGrupo && validos.length > 0 && g.mesa && (
                          <button className="btn sm soft" onClick={() => onFecharConta(g.mesa)} type="button">
                            <I n="wallet" s={17} />
                            Fechar conta
                          </button>
                        )}
                      </span>
                      <span className={'chev' + (aberto ? ' up' : '')}><I n="chev-d" /></span>
                    </div>
                    {aberto && (
                      <div className="cmd-body">
                        {g.pedidos.map((p) => {
                          const cancelado = p.status === 'cancelado';
                          const novoP = p.status === 'recebido' && !fechadoGrupo;
                          return (
                            <div key={p.id} className={'ped' + (novoP ? ' novo' : '')} style={{ opacity: cancelado ? 0.55 : 1 }}>
                              <div className="ped-h">
                                <b style={{ fontFamily: 'var(--f-d)', fontWeight: 600 }}>Pedido nº {p.id}</b>
                                <span className="muted" style={{ fontSize: 13.5 }}>{horaDe(p.criado_em)}</span>
                                {novoP && <span className="badge-novo">NOVO</span>}
                                <span style={{ flex: 1 }} />
                                {fechadoGrupo && !cancelado ? (
                                  <span className="tag ok"><I n="check" />Fechado</span>
                                ) : (
                                  <select
                                    className="st-sel"
                                    aria-label="Status do pedido"
                                    value={p.status}
                                    onChange={(e) => alterarStatus(p.id, e.target.value)}
                                  >
                                    {['recebido', 'em preparo', 'pronto', 'entregue', 'cancelado'].map((s) => (
                                      <option key={s} value={s}>
                                        {STATUS_ADM[s][0]}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                {!cancelado && (
                                  <button className="btn sm line" onClick={() => onImprimirCozinha(p)} type="button">
                                    <I n="printer" s={17} />
                                    Imprimir cozinha
                                  </button>
                                )}
                                <button className="btn sm danger" onClick={() => excluirPedido(p)} type="button">
                                  <I n="trash" s={16} />
                                  Excluir
                                </button>
                              </div>
                              {p.itens.map((i) => (
                                <div className="it" key={i.id}>
                                  <span className="qty">{i.quantidade}×</span>
                                  <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                                    <span style={{ fontWeight: 600 }}>
                                      {i.nome_prato}
                                      {i.porcao ? ` (${i.porcao})` : ''}
                                    </span>
                                    {i.opcoes && <span className="muted" style={{ display: 'block', fontSize: 13 }}>{i.opcoes}</span>}
                                    {i.observacao && (
                                      <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 13, color: 'var(--brand-ink)', fontWeight: 600 }}>
                                        <I n="note" s={14} />
                                        Obs: {i.observacao}
                                      </span>
                                    )}
                                  </span>
                                  <span className="money muted" style={{ fontSize: 13 }}>{formatarMoeda(i.preco_unitario)} cada</span>
                                  <b className="money" style={{ minWidth: 86, textAlign: 'right' }}>{formatarMoeda(i.subtotal)}</b>
                                  {!fechadoGrupo && !cancelado && (
                                    <span style={{ display: 'flex', gap: 6 }}>
                                      {i.quantidade > 1 && (
                                        <button
                                          className="btn sm line"
                                          type="button"
                                          title="Tirar 1 unidade"
                                          style={{ height: 32, padding: '0 10px' }}
                                          onClick={() => ajustarItem(i, 'menos')}
                                        >
                                          Tirar 1
                                        </button>
                                      )}
                                      <button
                                        className="btn sm danger"
                                        type="button"
                                        style={{ height: 32, padding: '0 10px' }}
                                        onClick={() => ajustarItem(i, 'tirar', p)}
                                      >
                                        Tirar
                                      </button>
                                    </span>
                                  )}
                                </div>
                              ))}
                              {p.observacao && (
                                <p style={{ marginTop: 8, fontSize: 14, color: 'var(--warn)' }}>
                                  <b>Observação:</b> {p.observacao}
                                </p>
                              )}
                            </div>
                          );
                        })}
                        {!fechadoGrupo && validos.length > 0 && g.mesa && (
                          <div className="linha">
                            <button className="btn sm" type="button" onClick={() => setAdicionandoMesa(g.mesa)}>
                              <I n="plus" s={17} />
                              Adicionar à comanda ({g.mesa})
                            </button>
                            <button className="btn sm soft so-m" type="button" onClick={() => onFecharConta(g.mesa)}>
                              <I n="wallet" s={17} />
                              Fechar conta
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {adicionandoMesa && (
        <ModalAdicionarItens
          mesa={adicionandoMesa}
          onFechar={() => setAdicionandoMesa(null)}
          onCriado={(r) => {
            setAdicionandoMesa(null);
            carregarPedidos(mes);
            alert(`Pedido nº ${r.pedidoId} criado na comanda. Use "Imprimir" na linha dele para mandar para a cozinha.`);
          }}
        />
      )}
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
      <div className="topbar">
        <h1>Relatório</h1>
        <select className="select" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
          {meses.map((m) => (
            <option key={m} value={m}>
              {formatarMesLabel(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="kpis stagger">
        <div className="kpi">
          <div className="k"><I n="wallet" s={16} />Faturamento do mês</div>
          <div className="v money">{formatarMoeda(resumo.faturamento)}</div>
        </div>
        <div className="kpi">
          <div className="k"><I n="receipt" s={16} />Pedidos no mês</div>
          <div className="v">{resumo.totalPedidos}</div>
        </div>
        <div className="kpi">
          <div className="k"><I n="trend" s={16} />Ticket médio</div>
          <div className="v money">{formatarMoeda(ticketMedio)}</div>
        </div>
      </div>

      <section className="panel rise">
        <div className="panel-h"><h3>Vendas por dia</h3></div>
        {resumo.porDia.length === 0 && <p className="muted">Nenhuma venda neste mês.</p>}
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
                <button className="dayrow" type="button" aria-expanded={aberto} onClick={() => setDiaAberto(aberto ? null : d.dia)}>
                  <span className={'chev' + (aberto ? ' up' : '')}><I n="chev-d" /></span>
                  <b>{formatarDiaLabel(d.dia)}</b>
                  <div className="bar-bg">
                    <div className="bar" style={{ width: largura + '%' }} />
                  </div>
                  <span className="dia-valor" style={{ textAlign: 'right' }}>
                    <b className="money">{formatarMoeda(d.faturamento)}</b>
                    <span className="muted" style={{ fontSize: 13.5 }}>
                      {' '}
                      em {d.pedidos} pedido{d.pedidos === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>
                {aberto && (
                  <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '6px 18px', margin: '8px 0 10px', animation: 'expand .4s var(--out)' }}>
                    {pedidosDoDia.length === 0 && <p className="muted" style={{ padding: '10px 0' }}>Carregando pedidos...</p>}
                    {pedidosDoDia.map((p) => (
                      <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                        <div className="row">
                          <span>
                            <b className="money">
                              {new Date(p.criado_em).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </b>
                            <span style={{ marginLeft: 10 }}>{p.mesa || 'sem mesa'}</span>
                          </span>
                          <span>
                            <b className="money">{formatarMoeda(p.total)}</b>
                            <span className="muted" style={{ fontSize: 12.5, marginLeft: 6 }}>({STATUS_ADM[p.status]?.[0] || p.status})</span>
                          </span>
                        </div>
                        <p className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>
                          {p.itens
                            .map(
                              (i) =>
                                `${i.quantidade}x ${i.nome_prato}${i.opcoes ? ` (${i.opcoes})` : ''}${i.observacao ? ` [obs: ${i.observacao}]` : ''}`,
                            )
                            .join(', ')}
                        </p>
                        {p.observacao && <p style={{ fontSize: 13.5, color: 'var(--warn)' }}>Obs: {p.observacao}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </Fragment>
            );
          })}
      </section>
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
      <div>
        <div className={'cons' + (filho ? ' filha' : '')}>
          <span className="nm">{nome}</span>
          <span style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            {consumo.length === 0 ? (
              <span className="cchip sem">não controla</span>
            ) : (
              consumo.map((c) => (
                <span className="cchip" key={c.itemId}>
                  {c.unidades} × {nomeDoItem(c.itemId)}
                </span>
              ))
            )}
          </span>
          <button className="btn sm line" type="button" onClick={() => (aberto ? setEditando(null) : abrirEdicao(tipo, id, consumo))}>
            {aberto ? 'Fechar' : 'Editar'}
          </button>
        </div>
        {aberto && (
          <div className="editor-box" style={{ marginLeft: filho ? 26 : 0 }}>
            <p className="hint" style={{ marginBottom: 8 }}>Gasta, a cada porção pedida:</p>
            {linhas.map((l, i) => (
              <div className="linha" key={i} style={{ marginBottom: 6 }}>
                <input
                  className="in"
                  type="number"
                  min="1"
                  value={l.unidades}
                  style={{ width: 80 }}
                  aria-label="Unidades"
                  onChange={(e) => setLinhas((atual) => atual.map((x, j) => (j === i ? { ...x, unidades: e.target.value } : x)))}
                />
                <span className="muted" style={{ fontSize: 14 }}>un. de</span>
                <select
                  className="in"
                  style={{ width: 240 }}
                  aria-label="Item"
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
                <button className="mini" type="button" aria-label="Remover" onClick={() => setLinhas((atual) => atual.filter((_, j) => j !== i))}>
                  <I n="x" s={16} />
                </button>
              </div>
            ))}
            <div className="linha" style={{ marginTop: 10 }}>
              <button className="btn sm line" type="button" onClick={() => setLinhas((atual) => [...atual, { itemId: '', unidades: 1 }])}>
                <I n="plus" s={15} />
                Outro item
              </button>
              <button className="btn sm" type="button" onClick={salvarEdicao}>
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
      <div className="topbar"><h1>Estoque</h1></div>
      <section className="panel rise">
        <div className="panel-h"><h3>Como funciona o estoque</h3></div>
        <p style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 900 }}>
          <b>1.</b> Cadastre os <b>itens</b> que você tem na cozinha e quantas <b>unidades</b> (ex: Kibe de carne = 120,
          Espeto de Kafta = 40). <b>2.</b> Diga o que cada prato e cada opção <b>gasta</b>: a opção "3 kibe de carne"
          gasta 3 un. de Kibe de carne; "1 Espeto de Kafta e 1 Espeto de Frango" gasta 1 de cada. <b>3.</b> A cada
          pedido o sistema <b>desconta sozinho</b>. Quando o item acaba, as escolhas que dependem dele aparecem como{' '}
          <b>Esgotado</b> para o cliente. Pedido <b>cancelado ou excluído devolve</b>. Item com quantidade em branco = sem
          controle.
        </p>
        <button className="btn md" style={{ marginTop: 14 }} type="button" onClick={lerNomes} disabled={ocupado}>
          <I n="book" s={18} />
          {ocupado ? 'Lendo...' : 'Ler os nomes do cardápio e montar sozinho'}
        </button>
      </section>

      <section className="panel rise">
        <div className="panel-h"><h3>Itens em estoque</h3></div>
        {itens.length === 0 && (
          <p className="muted" style={{ fontSize: 14 }}>
            Nenhum item ainda. Use o botão acima para o sistema montar a partir do cardápio, ou adicione abaixo.
          </p>
        )}
        {itens.map((item) => {
          const q = item.id in rascunhos ? rascunhos[item.id] : item.quantidade === null ? '' : String(item.quantidade);
          const alterado = item.id in rascunhos;
          const estado =
            item.quantidade === null ? 'sem' : item.quantidade === 0 ? 'zero' : item.quantidade <= ESTOQUE_BAIXO ? 'baixo' : 'ok';
          const rotulo = { sem: 'Sem controle', zero: 'ESGOTADO', baixo: 'Acabando', ok: 'Em estoque' }[estado];
          const cor = { sem: 'neutral', zero: 'danger', baixo: 'warn', ok: 'ok' }[estado];
          return (
            <div className="est-row" key={item.id}>
              <span className="nm">
                {item.nome} <span className={'tag ' + cor}>{rotulo}</span>
              </span>
              <input
                className="in"
                style={{ width: 110 }}
                aria-label={'Quantidade de ' + item.nome}
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
              <button className="btn sm" type="button" disabled={!alterado} onClick={() => salvarQuantidade(item)}>
                Salvar
              </button>
              <input
                type="number"
                step="1"
                className="in"
                style={{ width: 110 }}
                aria-label={'Entrada de ' + item.nome}
                placeholder="+ entrada"
                title="Chegou mercadoria? Digite quantas unidades entraram e clique em +"
                value={entradas[item.id] ?? ''}
                onChange={(e) => setEntradas((atual) => ({ ...atual, [item.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') darEntrada(item);
                }}
              />
              <button className="btn sm line" type="button" aria-label="Dar entrada" title="Dar entrada" style={{ width: 40, padding: 0 }} onClick={() => darEntrada(item)}>
                <I n="plus" s={17} />
              </button>
              <button className="btn sm line" type="button" onClick={() => renomear(item)}>
                Renomear
              </button>
              <button className="btn sm danger" type="button" onClick={() => excluirItem(item)}>
                Excluir
              </button>
            </div>
          );
        })}
        <div className="linha" style={{ marginTop: 14 }}>
          <input
            className="in"
            style={{ flex: '1 1 260px' }}
            type="text"
            aria-label="Novo item"
            placeholder="Novo item (ex: Kibe de carne)"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
          />
          <input
            className="in"
            type="number"
            min="0"
            aria-label="Unidades"
            placeholder="Unidades"
            value={novaQtd}
            onChange={(e) => setNovaQtd(e.target.value)}
            style={{ width: 120 }}
          />
          <button className="btn md" type="button" onClick={criarItem}>
            <I n="plus" s={18} />
            Adicionar item
          </button>
        </div>
      </section>

      <section className="panel rise">
        <div className="panel-h" style={{ marginBottom: 0 }}><h3>O que cada prato e opção gasta</h3></div>
        {cardapio.map((cat) => (
          <div key={cat.id} style={{ marginBottom: 12 }}>
            <div className="cat-est">{cat.nome}</div>
            {cat.pratos.map((prato) => (
              <div key={prato.id} style={{ borderBottom: '1px solid var(--line)' }}>
                {renderConsumo({ tipo: 'prato', id: prato.id, nome: prato.nome, consumo: prato.consumo })}
                {prato.grupos.map((g) => (
                  <div key={g.id}>
                    <div className="grp-est">{g.nome}</div>
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
      </section>
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

  const [otimizando, setOtimizando] = useState(''); // texto de progresso

  // Diminui as fotos já enviadas (as grandes gastam muito tráfego do banco a cada cliente)
  async function otimizarFotos() {
    const comFoto = categorias.flatMap((c) => c.pratos).filter((p) => p.foto);
    if (!confirm(`Diminuir o tamanho de ${comFoto.length} fotos? A qualidade continua boa no celular. Deixe esta tela aberta até terminar.`)) return;
    let reduzidas = 0;
    let falhas = 0;
    let economia = 0;
    for (let i = 0; i < comFoto.length; i++) {
      const prato = comFoto[i];
      setOtimizando(`Otimizando ${i + 1} de ${comFoto.length}...`);
      try {
        const resp = await fetch(prato.foto);
        if (!resp.ok) throw new Error();
        const blob = await resp.blob();
        if (blob.size < 200 * 1024) continue; // já está pequena
        const original = new File([blob], 'foto.' + (blob.type.split('/')[1] || 'jpg'), { type: blob.type });
        const menor = await reduzirImagem(original);
        if (menor === original) continue;
        const formData = new FormData();
        formData.append('foto', menor);
        const envio = await fetch('/api/admin/pratos/' + prato.id + '/foto', { method: 'POST', body: formData });
        if (!envio.ok) throw new Error();
        reduzidas += 1;
        economia += original.size - menor.size;
      } catch {
        falhas += 1;
      }
    }
    setOtimizando('');
    carregar();
    alert(
      `Pronto: ${reduzidas} fotos diminuídas (${(economia / 1048576).toFixed(1)} MB a menos por cliente que vê o cardápio todo).` +
        (falhas ? `\n${falhas} não puderam ser otimizadas (tente de novo mais tarde).` : ''),
    );
  }

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
      <div className="topbar"><h1>Cardápio</h1></div>
      <section className="panel rise">
        <div className="panel-h"><h3>Fotos</h3></div>
        <p style={{ fontSize: '0.9rem', color: '#666', margin: '0 0 10px' }}>
          Fotos grandes gastam o limite de tráfego do banco e podem tirar o sistema do ar. As fotos novas já são
          diminuídas sozinhas; use o botão para diminuir as que já foram enviadas.
        </p>
        <div>
          <button className="btn md" type="button" onClick={otimizarFotos} disabled={!!otimizando}>
            {otimizando || 'Otimizar fotos já enviadas'}
          </button>
        </div>
      </section>

      <section className="panel rise">
        <div className="panel-h"><h3>Nova categoria</h3></div>
        <div className="linha" style={{ maxWidth: 560 }}>
          <input
            className="in"
            style={{ flex: 1 }}
            type="text"
            aria-label="Nome da categoria"
            placeholder="Nome da categoria"
            value={novaCategoriaNome}
            onChange={(e) => setNovaCategoriaNome(e.target.value)}
          />
          <button className="btn md" onClick={adicionarCategoria} type="button">
            <I n="plus" s={18} />
            Adicionar
          </button>
        </div>
      </section>

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
    <section className="panel rise">
      <div className="panel-h">
        <h3 style={{ fontSize: 19, marginRight: 'auto' }}>{categoria.nome}</h3>
        <button className="mini" onClick={() => onMover(-1)} disabled={!podeSubir} type="button" title="Subir categoria" aria-label="Subir categoria">
          <I n="chev-u" />
        </button>
        <button className="mini" onClick={() => onMover(1)} disabled={!podeDescer} type="button" title="Descer categoria" aria-label="Descer categoria">
          <I n="chev-d" />
        </button>
        <button className="btn sm line" onClick={renomear} type="button">
          Renomear
        </button>
        <button className="btn sm danger" onClick={() => onExcluir(categoria.id)} type="button">
          Excluir categoria
        </button>
      </div>
      <div>
        {categoria.pratos.length === 0 && <p className="muted" style={{ fontSize: 14 }}>Nenhum prato ainda.</p>}
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
      <div className="linha" style={{ marginTop: 14 }}>
        <input className="in" style={{ flex: '2 1 180px' }} aria-label="Nome do prato" type="text" placeholder="Nome do prato" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input
          className="in"
          style={{ flex: '2 1 180px' }}
          aria-label="Descrição"
          type="text"
          placeholder="Descrição (opcional)"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
        <input
          className="in"
          aria-label="Preço"
          type="number"
          placeholder="Preço"
          step="0.01"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          style={{ width: 110 }}
        />
        <input
          className="in"
          aria-label="Preparo em minutos"
          type="number"
          placeholder="Preparo (min)"
          min="0"
          value={tempoPreparo}
          onChange={(e) => setTempoPreparo(e.target.value)}
          style={{ width: 130 }}
        />
        <input
          className="in"
          aria-label="Peso"
          type="text"
          placeholder="Peso (ex: 300g)"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
          style={{ width: 140 }}
        />
        <input
          className="in"
          aria-label="Quantidade"
          type="text"
          placeholder="Qtd (ex: 6 unid.)"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          style={{ width: 140 }}
        />
      </div>
      <div className="linha" style={{ marginTop: 8 }}>
        <input
          className="in"
          style={{ flex: '1 1 320px' }}
          aria-label="Observação do prato"
          type="text"
          placeholder="Observação do prato (cliente e cozinha veem)"
          value={observacaoPrato}
          onChange={(e) => setObservacaoPrato(e.target.value)}
          maxLength={200}
        />
        <button className="btn md" onClick={adicionarPrato} type="button">
          <I n="plus" s={18} />
          Adicionar prato
        </button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Dica: arroz, proteína, pastas, salada e adicionais são cadastrados depois de criar o prato, no botão <b>Opções</b> que
        aparece na linha dele (abre sozinho ao criar).
      </p>
    </section>
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

  if (!grupos) return <div className="editor-box muted">Carregando opções...</div>;

  const outros = (irmaos || []).filter((p) => p.id !== prato.id);

  return (
    <div className="editor-box">
      <h4 style={{ fontSize: 16, fontWeight: 600 }}>Opções de “{prato.nome}”</h4>
      <p className="hint" style={{ margin: '4px 0 14px' }}>
        <b>Escolher 1</b>: o cliente é obrigado a escolher uma opção do grupo (ex: Arroz). <b>Adicional</b>: o cliente
        marca quantos quiser e paga o valor extra de cada um.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {grupos.map((g, gi) => (
          <div className="og" key={gi}>
            <div className="linha">
              <input
                className="in"
                style={{ flex: '1 1 200px', fontWeight: 600 }}
                type="text"
                aria-label="Nome do grupo"
                placeholder="Nome do grupo (ex: Arroz)"
                value={g.nome}
                onChange={(e) => mudarGrupo(gi, { nome: e.target.value })}
              />
              <select className="in" aria-label="Tipo do grupo" value={g.tipo} onChange={(e) => mudarGrupo(gi, { tipo: e.target.value })}>
                <option value="unica">Escolher 1 (obrigatório)</option>
                <option value="extra">Adicional (cobrado à parte)</option>
              </select>
              <button className="btn sm danger" style={{ height: 42 }} type="button" onClick={() => setGrupos((atual) => atual.filter((_, i) => i !== gi))}>
                Remover grupo
              </button>
            </div>
            {g.opcoes.map((o, oi) => (
              <div className="orow" key={oi}>
                <div className="linha">
                  <input
                    className="in"
                    style={{ flex: '1 1 200px' }}
                    type="text"
                    aria-label="Opção"
                    placeholder="Opção (ex: Arroz branco)"
                    value={o.nome}
                    onChange={(e) => mudarOpcao(gi, oi, { nome: e.target.value })}
                  />
                  <input
                    className="in"
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label="Valor a mais"
                    placeholder={g.tipo === 'extra' ? 'Valor a mais (R$)' : 'Valor a mais (opcional)'}
                    value={o.precoAdicional}
                    onChange={(e) => mudarOpcao(gi, oi, { precoAdicional: e.target.value })}
                    style={{ width: 170 }}
                  />
                  <button
                    className={'avail ' + (o.ativo === false ? 'no' : 'ok')}
                    type="button"
                    title={o.ativo === false ? 'Acabou, clique para voltar a oferecer' : 'Clique quando acabar'}
                    onClick={() => alternarAtiva(gi, oi)}
                  >
                    <I n={o.ativo === false ? 'x' : 'check'} s={14} />
                    {o.ativo === false ? 'Acabou (ativar)' : 'Disponível'}
                  </button>
                  <button
                    className="mini"
                    style={{ width: 42, height: 42 }}
                    type="button"
                    aria-label="Remover opção"
                    onClick={() => mudarGrupo(gi, { opcoes: g.opcoes.filter((_, j) => j !== oi) })}
                  >
                    <I n="x" s={16} />
                  </button>
                </div>
                <input
                  className="in"
                  style={{ width: '100%', marginTop: 6 }}
                  type="text"
                  aria-label="Descrição da opção"
                  placeholder="Descrição da opção (opcional, o cliente vê ao escolher)"
                  maxLength={200}
                  value={o.descricao || ''}
                  onChange={(e) => mudarOpcao(gi, oi, { descricao: e.target.value })}
                />
              </div>
            ))}
            <button className="btn sm line" style={{ marginTop: 8 }} type="button" onClick={() => mudarGrupo(gi, { opcoes: [...g.opcoes, novaOpcao()] })}>
              <I n="plus" s={15} />
              Adicionar opção
            </button>
          </div>
        ))}
      </div>

      <div className="linha" style={{ marginTop: 14 }}>
        <span className="hint">Adicionar grupo:</span>
        {SUGESTOES_GRUPO.map((s) => (
          <button
            key={s.nome}
            className="btn sm line"
            style={{ height: 34 }}
            type="button"
            onClick={() =>
              setGrupos((atual) => [...atual, { ...s, opcoes: s.opcoes ? s.opcoes.map((o) => ({ ...o })) : [novaOpcao()] }])
            }
          >
            + {s.nome}
          </button>
        ))}
        <button
          className="btn sm line"
          style={{ height: 34 }}
          type="button"
          onClick={() => setGrupos((atual) => [...atual, { nome: '', tipo: 'unica', opcoes: [novaOpcao()] }])}
        >
          + Outro
        </button>
      </div>

      {outros.length > 0 && (
        <div className="linha" style={{ marginTop: 14 }}>
          <select className="in" style={{ flex: '0 1 320px' }} aria-label="Copiar opções de outro prato" value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)}>
            <option value="">Copiar opções de outro prato...</option>
            {outros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <button className="btn sm line" style={{ height: 42 }} type="button" onClick={copiar} disabled={!copiarDe}>
            Copiar
          </button>
        </div>
      )}

      <div className="linha" style={{ marginTop: 14 }}>
        <button className="btn md" type="button" onClick={() => salvar(false)} disabled={salvando}>
          <I n="check" s={18} />
          {salvando ? 'Salvando...' : 'Salvar opções'}
        </button>
        {outros.length > 0 && (
          <button className="btn md line" type="button" onClick={() => salvar(true)} disabled={salvando}>
            Salvar e aplicar a todos desta categoria
          </button>
        )}
        <button className="btn md ghost" type="button" onClick={() => onFechar()}>
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
    formData.append('foto', await reduzirImagem(arquivo));
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
        className="in"
        type="text"
        aria-label={placeholder}
        placeholder={placeholder}
        value={form[chave]}
        onChange={(e) => setForm({ ...form, [chave]: e.target.value })}
        {...extra}
      />
    );
    return (
      <div className="editor-box">
        <div className="linha">
          {campo('nome', 'Nome do prato', { style: { flex: '2 1 180px' } })}
          {campo('descricao', 'Descrição (opcional)', { style: { flex: '2 1 180px' } })}
          {campo('preco', 'Preço', { type: 'number', step: '0.01', style: { width: 110 } })}
          {campo('tempoPreparo', 'Preparo (min)', { type: 'number', min: '0', style: { width: 130 } })}
          {campo('peso', 'Peso (ex: 300g)', { style: { width: 140 } })}
          {campo('quantidade', 'Qtd (ex: 6 unid.)', { style: { width: 140 } })}
        </div>
        <div className="linha" style={{ marginTop: 8 }}>
          {campo('observacao', 'Observação do prato (cliente e cozinha veem)', { maxLength: 200, style: { flex: '1 1 320px' } })}
          <button className="btn md" onClick={salvarEdicao} type="button">
            <I n="check" s={18} />
            Salvar
          </button>
          <button className="btn md ghost" onClick={() => setEditando(false)} type="button">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className={'drow' + (prato.ativo ? '' : ' inativo')}>
      {prato.foto ? <img className="thumb" src={prato.foto} alt="" /> : <span className="thumb vazia">sem foto</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontFamily: 'var(--f-d)', fontWeight: 600, fontSize: 15.5 }}>{prato.nome}</b>
          <span className="money" style={{ fontWeight: 600, color: 'var(--brand-ink)' }}>{formatarMoeda(prato.preco)}</span>
          {!prato.ativo && <span className="tag neutral">Desativado</span>}
        </div>
        {(prato.tempo_preparo || prato.peso || prato.quantidade) ? (
          <div className="meta">
            {prato.tempo_preparo ? <span><I n="clock" />{prato.tempo_preparo} min</span> : null}
            {prato.peso ? <span><I n="scale" />{prato.peso}</span> : null}
            {prato.quantidade ? <span><I n="portion" />{prato.quantidade}</span> : null}
          </div>
        ) : null}
        {prato.descricao && <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{prato.descricao}</p>}
        {prato.observacao && <p style={{ fontSize: 13.5, color: 'var(--warn)', marginTop: 2 }}>Obs: {prato.observacao}</p>}
        <div className="acts">
          <button className="btn sm soft" onClick={() => setEditandoOpcoes((v) => !v)} type="button">
            <I n="sliders" s={15} />
            Opções
          </button>
          <button className="btn sm line" onClick={abrirEdicao} type="button">
            <I n="pencil" s={15} />
            Editar
          </button>
          <button className="btn sm line" onClick={() => inputFotoRef.current.click()} type="button">
            <I n="image" s={15} />
            {prato.foto ? 'Trocar foto' : 'Adicionar foto'}
          </button>
          <input type="file" accept="image/*" ref={inputFotoRef} style={{ display: 'none' }} onChange={enviarFoto} />
          {prato.foto && (
            <button className="btn sm line" onClick={removerFoto} type="button">
              Remover foto
            </button>
          )}
          <button className="mini" onClick={() => onMover(-1)} disabled={!podeSubir} type="button" title="Subir prato" aria-label="Subir prato">
            <I n="chev-u" s={18} />
          </button>
          <button className="mini" onClick={() => onMover(1)} disabled={!podeDescer} type="button" title="Descer prato" aria-label="Descer prato">
            <I n="chev-d" s={18} />
          </button>
          <button className="btn sm line" onClick={alternarAtivo} type="button">
            {prato.ativo ? 'Desativar' : 'Ativar'}
          </button>
          <button className="btn sm danger" onClick={excluir} type="button">
            <I n="trash" s={15} />
            Excluir
          </button>
        </div>
      </div>
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
      <div className="topbar"><h1>QR Codes</h1></div>
      <div className="panel">
        <div className="panel-h"><h3>Gerar QR Codes por mesa</h3></div>
        <div className="linha-form">
          <div className="field" style={{ width: 160 }}>
            <label htmlFor="qr-de">Da mesa nº</label>
            <input id="qr-de" className="input" style={{ height: 46 }} type="number" placeholder="Da mesa nº" value={de} min={1} onChange={(e) => setDe(Number(e.target.value) || 1)} />
          </div>
          <div className="field" style={{ width: 160 }}>
            <label htmlFor="qr-ate">Até a mesa nº</label>
            <input
              id="qr-ate"
              className="input"
              style={{ height: 46 }}
              type="number"
              placeholder="Até a mesa nº"
              value={ate}
              min={1}
              onChange={(e) => setAte(Number(e.target.value) || 1)}
            />
          </div>
          <button className="btn md" onClick={gerar} type="button">
            Gerar
          </button>
        </div>
        {endereco && <p className="hint" style={{ marginTop: 12 }}>Endereço usado nos QR Codes: {endereco}/</p>}
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

const ROTULO_ZAP = { pendente: 'na fila', enviando: 'enviando...', enviada: 'enviada', erro: 'erro' };

function AbaWhatsapp() {
  const [dados, setDados] = useState(null);
  const [form, setForm] = useState(null); // edição da configuração
  const [salvando, setSalvando] = useState(false);
  const [telefoneTeste, setTelefoneTeste] = useState('');

  const carregar = useCallback(async () => {
    try {
      const d = await api('/whatsapp');
      setDados(d);
      setForm((atual) => atual || { ...d.config });
    } catch {}
  }, []);

  useEffect(() => {
    carregar();
    // o servidor avisa quando o estado do WhatsApp ou a fila mudam; checagem lenta só de reserva
    const timer = setInterval(carregar, 30000);
    let fonte = null;
    if (window.EventSource) {
      fonte = new EventSource('/api/admin/eventos');
      fonte.onopen = carregar;
      fonte.onmessage = (e) => {
        try {
          if (JSON.parse(e.data).canal === 'whatsapp') carregar();
        } catch {}
      };
    }
    return () => {
      clearInterval(timer);
      fonte?.close();
    };
  }, [carregar]);

  async function salvar() {
    setSalvando(true);
    try {
      await api('/whatsapp', { method: 'POST', body: JSON.stringify(form) });
      alert('Configuração salva!');
      carregar();
    } catch (err) {
      alert(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function acao(corpo, mensagemOk) {
    try {
      const r = await api('/whatsapp/acao', { method: 'POST', body: JSON.stringify(corpo) });
      if (mensagemOk) {
        alert(
          mensagemOk +
            (r.avisoDesligado ? '\n\nAtenção: o envio automático está DESLIGADO acima, então ela só sai depois que você ligar.' : ''),
        );
      }
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  if (!dados || !form) return <div className="vazio">Carregando...</div>;
  const { estado, mensagens, token } = dados;
  const urlDoSistema = typeof window !== 'undefined' ? window.location.origin : '';

  let situacao;
  if (!estado.online) {
    situacao = (
      <div className="zap-estado ruim">
        <I n="alert" s={20} />
        <span>
          <strong>O programa do WhatsApp não está ligado.</strong> Ele precisa ficar aberto no computador do restaurante (veja
          "Como instalar" mais abaixo). Enquanto isso, as mensagens ficam na fila e saem quando ele ligar.
        </span>
      </div>
    );
  } else if (estado.status === 'aguardando_qr') {
    situacao = (
      <div className="zap-estado atencao" style={{ display: 'block' }}>
        <strong>Conecte o seu WhatsApp:</strong> no celular, abra o WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar um
        aparelho</b> e aponte a câmera para este QR Code.
        <div style={{ marginTop: 10 }}>
          <img
            src={'/api/admin/qrcode?url=' + encodeURIComponent(estado.qr)}
            alt="QR Code do WhatsApp"
            style={{ width: 260, maxWidth: '100%', background: '#fff', padding: 8, borderRadius: 8 }}
          />
        </div>
        <div style={{ fontSize: '0.8rem', marginTop: 6 }}>O QR muda sozinho a cada poucos segundos; se não ler, espere o próximo.</div>
      </div>
    );
  } else if (estado.status === 'conectado') {
    situacao = (
      <div className="zap-estado ok">
        <I n="ok" s={20} />
        <span>
          <strong>WhatsApp conectado</strong>
          {estado.numero ? ` (número ${estado.numero})` : ''}. As mensagens saem sozinhas.
        </span>
      </div>
    );
  } else {
    situacao = (
      <div className="zap-estado atencao">
        <I n="clock" s={20} />
        <span>O programa está ligado, mas o WhatsApp ainda não conectou ({estado.status}). Aguarde alguns segundos.</span>
      </div>
    );
  }

  const zapSelo = { enviada: 'ok', erro: 'danger' };

  return (
    <>
      <div className="topbar"><h1>WhatsApp</h1></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>
          <section className="panel rise">
            <div className="panel-h"><h3>Conexão com o WhatsApp</h3></div>
            {situacao}
            <a className="btn md line" style={{ marginTop: 14 }} href="https://web.whatsapp.com" target="_blank" rel="noopener noreferrer">
              <I n="ext" s={17} />
              Abrir o WhatsApp Web
            </a>
            <p className="hint" style={{ marginTop: 6 }}>
              Abre em outra aba (o WhatsApp não deixa aparecer dentro de outro site). Serve para conversar com os clientes; é
              separado do envio automático.
            </p>
          </section>

          <section className="panel rise" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="panel-h" style={{ margin: 0 }}><h3>Mensagem de agradecimento</h3></div>
            <p style={{ fontSize: 14.5, color: 'var(--ink-2)' }}>
              Quando você clica em <b>Concluído</b> na conta, o sistema manda esta mensagem para o WhatsApp que o cliente
              informou (só se ele informou).
            </p>
            <label className="check">
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              <span>
                <b>Enviar automaticamente</b> depois que a conta é concluída
              </span>
            </label>
            <input
              className="input"
              style={{ height: 46, fontSize: 14 }}
              type="text"
              aria-label="Link para avaliar no Google"
              placeholder="Link para avaliar no Google (https://...)"
              value={form.linkGoogle}
              onChange={(e) => setForm({ ...form, linkGoogle: e.target.value })}
            />
            <input
              className="input"
              style={{ height: 46, fontSize: 14 }}
              type="text"
              aria-label="Link do Instagram"
              placeholder="Link do Instagram (https://instagram.com/...)"
              value={form.linkInstagram}
              onChange={(e) => setForm({ ...form, linkInstagram: e.target.value })}
            />
            <textarea
              className="input"
              rows={9}
              aria-label="Texto da mensagem"
              style={{ fontSize: 14.5, lineHeight: 1.5 }}
              value={form.mensagem}
              onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
            />
            <p className="hint">
              Pode usar: <b>{'{nome}'}</b> (primeiro nome do cliente), <b>{'{loja}'}</b>, <b>{'{google}'}</b> e <b>{'{instagram}'}</b>.
            </p>
            <div className="linha">
              <button className="btn md" type="button" onClick={salvar} disabled={salvando}>
                <I n="check" s={18} />
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
              <button className="btn md line" type="button" onClick={() => setForm({ ...form, mensagem: dados.mensagemPadrao })}>
                <I n="refresh" s={18} />
                Voltar ao texto padrão
              </button>
            </div>
          </section>

          <section className="panel rise">
            <div className="panel-h"><h3>Testar</h3></div>
            <div className="linha">
              <input
                className="input"
                style={{ flex: '1 1 260px', height: 46, fontSize: 14 }}
                type="tel"
                aria-label="WhatsApp para teste"
                placeholder="Seu WhatsApp com DDD: (11) 91234-5678"
                value={telefoneTeste}
                onChange={(e) => setTelefoneTeste(e.target.value)}
              />
              <button
                className="btn md"
                type="button"
                onClick={() => acao({ acao: 'teste', telefone: telefoneTeste }, 'Mensagem de teste colocada na fila.')}
              >
                <I n="send" s={18} />
                Enviar mensagem de teste
              </button>
            </div>
          </section>
        </div>

        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <section className="panel rise">
            <div className="panel-h"><h3>Últimas mensagens</h3></div>
            {mensagens.length === 0 && <p className="muted" style={{ fontSize: 14 }}>Nenhuma ainda.</p>}
            {mensagens.map((m) => (
              <div className="msg" key={m.id}>
                <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <b style={{ fontSize: 14.5 }}>{m.nome || '-'}</b> <small className="muted">({m.telefone})</small>
                  {m.erro && <small style={{ display: 'block', color: 'var(--danger)' }}>{m.erro}</small>}
                </span>
                <span className={'tag ' + (zapSelo[m.status] || 'warn')}>{ROTULO_ZAP[m.status] || m.status}</span>
                <small className="muted">
                  {new Date(m.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })}
                </small>
                <a
                  className="btn sm line"
                  href={`https://web.whatsapp.com/send?phone=${m.telefone}&text=${encodeURIComponent(m.texto || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abre a conversa no WhatsApp Web com a mensagem pronta; é só apertar Enviar"
                >
                  Abrir conversa
                </a>
                {m.status === 'erro' && (
                  <button className="btn sm line" type="button" onClick={() => acao({ acao: 'reenviar', id: m.id })}>
                    Tentar de novo
                  </button>
                )}
                {(m.status === 'erro' || m.status === 'pendente') && (
                  <button className="btn sm danger" type="button" onClick={() => acao({ acao: 'cancelar', id: m.id })}>
                    Cancelar
                  </button>
                )}
              </div>
            ))}
          </section>

          <section className="panel rise">
            <div className="panel-h"><h3>Como instalar o programa do WhatsApp</h3></div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
              <li>
                No computador do restaurante (precisa ficar ligado e com internet), abra a pasta <b>whatsapp-worker</b> do
                projeto e siga o arquivo <b>LEIA-ME.md</b> dela.
              </li>
              <li>Quando ele pedir, informe estes dois dados:</li>
            </ol>
            <div className="dado">
              <small>Endereço do sistema</small>
              <code>{urlDoSistema}</code>
            </div>
            <div className="dado">
              <small>Chave de acesso (não mostre para ninguém)</small>
              <code>{token}</code>
            </div>
            <ol start={3} style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
              <li>
                Ao abrir, o programa mostra o <b>QR Code aqui nesta tela</b>. Leia com o WhatsApp do número que vai mandar as
                mensagens.
              </li>
            </ol>
          </section>
        </div>
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
    formData.append('logo', await reduzirImagem(arquivo, { maximo: 500, tipo: 'image/png' }));
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
      <div className="topbar"><h1>Configurações</h1></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 460px', minWidth: 0 }}>
          <section className="panel rise" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="panel-h" style={{ margin: 0 }}><h3>Personalização</h3></div>
            <div className="linha">
              <input
                className="input"
                style={{ flex: '1 1 240px', height: 46 }}
                type="text"
                aria-label="Nome do restaurante"
                placeholder="Nome do restaurante"
                value={nomeLoja}
                onChange={(e) => setNomeLoja(e.target.value)}
              />
              <button className="btn md" onClick={salvarNome} type="button">
                Salvar nome
              </button>
            </div>
            {msgNome.texto && (
              <div className="erro" style={{ color: msgNome.cor }}>
                {msgNome.texto}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {config.logoUrl && (
                <img src={config.logoUrl} alt="Logo atual" style={{ width: 105, height: 70, borderRadius: 12, objectFit: 'cover', boxShadow: 'var(--sh-1)' }} />
              )}
              <button className="btn md line" onClick={() => inputLogoRef.current.click()} type="button">
                <I n="upload" s={18} />
                Enviar logo
              </button>
              <input type="file" accept="image/*" ref={inputLogoRef} style={{ display: 'none' }} onChange={enviarLogo} />
            </div>
          </section>

          <section className="panel rise">
            <div className="panel-h"><h3>Trocar senha do painel</h3></div>
            <div className="linha">
              <div className="input-wrap" style={{ flex: '1 1 240px' }}>
                <I n="lock" />
                <input
                  className="input"
                  style={{ height: 46 }}
                  type="password"
                  autoComplete="new-password"
                  aria-label="Nova senha"
                  placeholder="Nova senha"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                />
              </div>
              <button className="btn md" onClick={trocarSenha} type="button">
                Salvar
              </button>
            </div>
            {msgSenha && <div className="erro" style={{ marginTop: 8 }}>{msgSenha}</div>}
          </section>
        </div>

        <section className="panel rise" style={{ flex: '1 1 420px', minWidth: 0 }}>
          <div className="panel-h" style={{ marginBottom: 6 }}><h3>Histórico de acessos ao painel</h3></div>
          <p className="hint" style={{ marginBottom: 10 }}>
            Como a senha é única e compartilhada, isso mostra apenas quando e de qual aparelho (endereço na rede) alguém
            entrou, não o nome da pessoa.
          </p>
          <div className="table-box">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Aparelho (IP)</th>
                </tr>
              </thead>
              <tbody>
                {acessos.length === 0 && (
                  <tr>
                    <td colSpan={2} className="muted" style={{ textAlign: 'center' }}>
                      Nenhum acesso registrado ainda.
                    </td>
                  </tr>
                )}
                {acessos.map((a) => (
                  <tr key={a.id}>
                    <td className="money">{new Date(a.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="money">{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

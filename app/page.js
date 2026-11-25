'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const SITE_RESTAURANTE = 'https://www.emporiosemfronteiras.com.br/';

function formatarMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function definirFavicon(url) {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

const STATUS_ROTULO = {
  recebido: 'Recebido',
  'em preparo': 'Em preparo',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const STATUS_SELO = {
  recebido: ['brand', 'check'],
  'em preparo': ['warn', 'chef'],
  pronto: ['ok', 'utensils'],
  entregue: ['info', 'ok'],
  cancelado: ['neutral', 'x'],
};

// Ícone de traço único (desenhado no globals.css)
function I({ n, s, flip }) {
  return <span className={'i i-' + n + (flip ? ' flip' : '')} style={s ? { '--s': s + 'px' } : undefined} aria-hidden="true" />;
}

function lembrarComanda(mesa, id) {
  try {
    localStorage.setItem('csf_comanda_' + mesa, id);
  } catch (e) {
    /* navegador sem armazenamento */
  }
}

function comandaLembrada(mesa) {
  try {
    return localStorage.getItem('csf_comanda_' + mesa);
  } catch (e) {
    return null;
  }
}

function PaginaCliente() {
  const params = useSearchParams();
  const mesaUrl = params.get('mesa') || '';

  const [config, setConfig] = useState({ nomeLoja: 'Cozinha Sem Fronteiras', logoUrl: '' });
  const [tela, setTela] = useState(mesaUrl ? 'carregando' : 'escolha'); // carregando | escolha | mesa | detalhe | comanda | pedido
  const [comandas, setComandas] = useState([]);
  const [modo, setModo] = useState(null); // local | levar
  const [mesaAtual, setMesaAtual] = useState(mesaUrl);
  const [nomeComanda, setNomeComanda] = useState('');
  const [mostrarFormComanda, setMostrarFormComanda] = useState(false);

  const [cardapio, setCardapio] = useState([]);
  const [carregandoCardapio, setCarregandoCardapio] = useState(true);
  const [lojaAberta, setLojaAberta] = useState(true);
  const [carrinho, setCarrinho] = useState({}); // { [pratoId]: { prato, quantidade } }

  const [cliente, setCliente] = useState({ nome: '', whatsapp: '' }); // contato informado (opcional)
  const [whatsappCampo, setWhatsappCampo] = useState('');
  const [pratoEscolhendo, setPratoEscolhendo] = useState(null);
  const [pratoVendo, setPratoVendo] = useState(null); // foto ampliada
  const [avisoRetirados, setAvisoRetirados] = useState('');
  const [categoriaAtiva, setCategoriaAtiva] = useState(null); // aba do cardápio
  const [modalRevisao, setModalRevisao] = useState(false);
  const [modalFecharConta, setModalFecharConta] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(({ nomeLoja, logoUrl }) => {
        setConfig({ nomeLoja, logoUrl });
        document.title = nomeLoja;
        if (logoUrl) definirFavicon(logoUrl);
      })
      .catch(() => {});
  }, []);

  // Lembra o nome e o WhatsApp neste aparelho (para não digitar de novo no próximo pedido)
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem('csf_cliente') || 'null');
      if (salvo && typeof salvo === 'object') {
        setCliente({ nome: String(salvo.nome || ''), whatsapp: String(salvo.whatsapp || '') });
        setNomeComanda(String(salvo.nome || ''));
        setWhatsappCampo(String(salvo.whatsapp || ''));
      }
    } catch {}
  }, []);

  // Ao abrir o QR da mesa: se já há comandas abertas nela, vai direto para elas.
  useEffect(() => {
    if (!mesaUrl) return;
    fetch('/api/mesa?mesa=' + encodeURIComponent(mesaUrl))
      .then((r) => r.json())
      .then((dados) => {
        const lista = dados.comandas || [];
        setComandas(lista);
        if (!lista.length) return setTela('escolha');
        const lembrada = comandaLembrada(mesaUrl);
        if (lembrada && lista.some((c) => c.id === lembrada)) {
          setModo('local');
          setMesaAtual(lembrada);
          setTela('detalhe');
        } else {
          setTela('mesa');
        }
      })
      .catch(() => setTela('escolha'));
  }, [mesaUrl]);

  function escolherLocal() {
    setTela(mesaUrl && comandas.length ? 'mesa' : 'comanda');
  }

  function escolherLevar() {
    setTela('levar');
  }

  // Valida o WhatsApp (opcional). Devolve { ok, numero } — numero = só dígitos, ou '' se deixou em branco.
  function lerWhatsapp() {
    const digitos = whatsappCampo.replace(/\D/g, '');
    if (!digitos) return { ok: true, numero: '' };
    const semPais = digitos.startsWith('55') && digitos.length >= 12 ? digitos.slice(2) : digitos;
    if (semPais.length !== 10 && semPais.length !== 11) {
      alert('WhatsApp inválido. Digite com DDD, por exemplo (11) 91234-5678, ou deixe em branco.');
      return { ok: false };
    }
    return { ok: true, numero: semPais };
  }

  function guardarCliente(nome, numero) {
    const novo = { nome, whatsapp: numero };
    setCliente(novo);
    try {
      localStorage.setItem('csf_cliente', JSON.stringify(novo));
    } catch {}
  }

  function confirmarLevar() {
    const nome = nomeComanda.replace(/\s+/g, ' ').trim();
    if (!nome) return alert('Digite seu nome para identificar o pedido.');
    const w = lerWhatsapp();
    if (!w.ok) return;
    guardarCliente(nome, w.numero);
    setModo('levar');
    setMesaAtual('');
    entrarNoPedido();
  }

  function abrirComanda(id) {
    setModo('local');
    setMesaAtual(id);
    lembrarComanda(mesaUrl, id);
    setTela('detalhe');
  }

  // Comanda junta (mesa toda) ou separada: os dois pedem nome + WhatsApp (o WhatsApp é opcional)
  function confirmarComanda() {
    const tipo = mostrarFormComanda; // 'junta' | 'separada'
    const nome = nomeComanda.replace(/\s+/g, ' ').trim();
    if (!nome) return alert('Digite seu nome para identificar sua comanda.');
    const w = lerWhatsapp();
    if (!w.ok) return;

    let id;
    if (tipo === 'separada') {
      const repetido = comandas.some((c) => c.tipo === 'separada' && c.nome.toLowerCase() === nome.toLowerCase());
      if (repetido) {
        return alert(
          `Já existe uma comanda "${nome}" nesta mesa. Se for a sua, volte e toque no seu nome na lista; se for outra pessoa, acrescente uma inicial ou sobrenome (ex: ${nome} S.).`
        );
      }
      id = mesaUrl ? `${mesaUrl} - ${nome}` : nome;
    } else {
      id = mesaUrl;
    }

    guardarCliente(nome, w.numero);
    setModo('local');
    setMesaAtual(id);
    if (mesaUrl) lembrarComanda(mesaUrl, id);
    entrarNoPedido();
  }

  function entrarNoPedido() {
    setTela('pedido');
    fetch('/api/status')
      .then((r) => r.json())
      .then(({ aberto }) => setLojaAberta(aberto))
      .catch(() => {});
    setCarregandoCardapio(true);
    fetch('/api/cardapio')
      .then((r) => r.json())
      .then((data) => setCardapio(data))
      .catch(() => setCardapio(null))
      .finally(() => setCarregandoCardapio(false));
  }

  // Enquanto o cliente está pedindo, o cardápio se atualiza sozinho: o que acabou some,
  // e o que ele já tinha escolhido e acabou sai do pedido (com aviso).
  useEffect(() => {
    if (tela !== 'pedido') return;
    let ativo = true;
    const atualizar = () => {
      fetch('/api/cardapio')
        .then((r) => r.json())
        .then((data) => {
          if (!ativo || !Array.isArray(data)) return;
          setCardapio(data);
          const porId = new Map(data.flatMap((cat) => cat.pratos).map((p) => [p.id, p]));
          setCarrinho((atual) => {
            const retirados = [];
            const novo = {};
            for (const [chave, item] of Object.entries(atual)) {
              const prato = porId.get(item.prato.id);
              const opcoesAtuais = prato ? prato.grupos.flatMap((g) => g.opcoes) : [];
              const sumiu =
                !prato ||
                pratoEsgotado(prato) ||
                item.opcoes.some((o) => {
                  const atualOpcao = opcoesAtuais.find((x) => x.id === o.id);
                  return !atualOpcao || atualOpcao.estoque === 0 || atualOpcao.ativo === false;
                });
              if (sumiu && item.quantidade > 0) retirados.push(item.prato.nome.trim());
              else novo[chave] = item;
            }
            if (retirados.length) setAvisoRetirados(`Acabou e saiu do seu pedido: ${[...new Set(retirados)].join(', ')}.`);
            return retirados.length ? novo : atual;
          });
        })
        .catch(() => {});
    };
    // 1 vez por minuto, e só com a tela aberta (economiza o tráfego do banco)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') atualizar();
    }, 60000);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [tela]);

  // Cada linha do carrinho é um prato + as opções escolhidas (mesmo prato com
  // opções diferentes vira linhas diferentes).
  function alterarPorChave(chave, delta) {
    setCarrinho((atual) => {
      const item = atual[chave];
      if (!item) return atual;
      return { ...atual, [chave]: { ...item, quantidade: Math.max(0, item.quantidade + delta) } };
    });
  }

  function alterarObservacao(chave, observacao) {
    setCarrinho((atual) => (atual[chave] ? { ...atual, [chave]: { ...atual[chave], observacao } } : atual));
  }

  function alterarQuantidade(prato, delta) {
    setCarrinho((atual) => {
      // prefixo "p": chaves só com números fariam o JavaScript reordenar o carrinho pelo id
      const chave = `p${prato.id}`;
      const item = atual[chave] || { chave, prato, opcoes: [], precoUnit: Number(prato.preco), quantidade: 0 };
      let quantidade = Math.max(0, item.quantidade + delta);
      if (delta > 0 && prato.estoque !== null && prato.estoque !== undefined) {
        const outras = Object.values(atual)
          .filter((i) => i.prato.id === prato.id && i.chave !== chave)
          .reduce((soma, i) => soma + i.quantidade, 0);
        quantidade = Math.min(quantidade, Math.max(0, prato.estoque - outras));
      }
      return { ...atual, [chave]: { ...item, quantidade } };
    });
  }

  function adicionarComOpcoes(prato, opcoes, quantidade) {
    const chave = `${prato.id}|${opcoes.map((o) => o.id).sort((a, b) => a - b).join(',')}`;
    const precoUnit = Number(prato.preco) + opcoes.reduce((soma, o) => soma + o.precoAdicional, 0);
    setCarrinho((atual) => {
      const item = atual[chave] || { chave, prato, opcoes, precoUnit, quantidade: 0 };
      return { ...atual, [chave]: { ...item, quantidade: item.quantidade + quantidade } };
    });
    setPratoEscolhendo(null);
  }

  // Prato que acabou (estoque zerado ou sem opção obrigatória) some do cardápio sozinho;
  // quando o estoque volta, ele volta.
  const cardapioVisivel = Array.isArray(cardapio)
    ? cardapio
        .map((cat) => ({ ...cat, pratos: cat.pratos.filter((p) => !pratoEsgotado(p)) }))
        .filter((cat) => cat.pratos.length > 0)
    : cardapio;
  const categoriaAtual = Array.isArray(cardapioVisivel)
    ? cardapioVisivel.find((c) => c.id === categoriaAtiva) || cardapioVisivel[0]
    : undefined;

  const itensCarrinho = Object.values(carrinho).filter((i) => i.quantidade > 0);
  const totalCarrinho = itensCarrinho.reduce((acc, i) => acc + i.precoUnit * i.quantidade, 0);
  const unidadesCarrinho = itensCarrinho.reduce((acc, i) => acc + i.quantidade, 0);
  // Quantas unidades ainda dá para pedir deste prato com estas opções (considera o que já está no carrinho)
  const limiteQuantidade = (prato, opcoesIds) => {
    let limite = 99;
    if (prato.estoque !== null && prato.estoque !== undefined) {
      limite = Math.min(limite, prato.estoque - quantidadeDoPrato(prato.id));
    }
    for (const g of prato.grupos || []) {
      for (const o of g.opcoes) {
        if (!opcoesIds.includes(o.id) || o.estoque === null || o.estoque === undefined) continue;
        const usado = itensCarrinho
          .filter((i) => i.opcoes.some((x) => x.id === o.id))
          .reduce((soma, i) => soma + i.quantidade, 0);
        limite = Math.min(limite, o.estoque - usado);
      }
    }
    return Math.max(0, limite);
  };
  const quantidadeDoPrato = (pratoId) =>
    itensCarrinho.filter((i) => i.prato.id === pratoId).reduce((soma, i) => soma + i.quantidade, 0);

  function limparCarrinho() {
    setCarrinho({});
  }

  const mesaLabel =
    modo === 'local' ? (mesaAtual ? 'Mesa ' + mesaAtual : 'Comer no local') : modo === 'levar' ? 'Para levar' : '';

  return (
    <>
      {/* Filtro que deixa só o dourado da logo (o fundo vermelho do arquivo fica transparente) */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="so-dourado" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 4.2 0 0 -0.25" />
        </filter>
      </svg>

      {tela === 'escolha' && (
        <div className="wine tela-entrada-fundo">
          <div className="tela-entrada">
            <div className="rise" style={{ marginTop: 'auto' }}>
              {config.logoUrl && (
                <div className="logo-entrada">
                  <img src={config.logoUrl} alt={config.nomeLoja} />
                </div>
              )}
              {mesaUrl ? (
                <>
                  <p className="entrada-sub">Você está na</p>
                  <h1 className="mesa-num">Mesa {mesaUrl}</h1>
                </>
              ) : (
                <h1 className="entrada-nome">{config.nomeLoja}</h1>
              )}
              <p className="entrada-pergunta">Como você quer pedir?</p>
            </div>
            <div className="entrada-opcoes stagger">
              <button className="choice" onClick={escolherLocal} type="button">
                <span className="tile"><I n="utensils" s={26} /></span>
                <span className="choice-txt"><b>Comer aqui na mesa</b><small>O pedido chega até você</small></span>
                <I n="chev-r" />
              </button>
              <button className="choice" onClick={escolherLevar} type="button">
                <span className="tile"><I n="bag" s={26} /></span>
                <span className="choice-txt"><b>Retirar no balcão</b><small>Para levar quando ficar pronto</small></span>
                <I n="chev-r" />
              </button>
              <button className="link-site" onClick={() => window.open(SITE_RESTAURANTE, '_blank')} type="button">
                <I n="globe" s={18} />
                Conheça nosso site
              </button>
            </div>
          </div>
        </div>
      )}

      {tela === 'carregando' && <div className="vazio">Carregando...</div>}

      {tela === 'mesa' && (
        <div className="tela">
          <div className="wine topo-vinho">
            <div className="topo-linha">
              <button className="icon-btn on-wine" onClick={() => setTela('escolha')} type="button" aria-label="Voltar ao início">
                <I n="back" />
              </button>
              {config.logoUrl && <img src={config.logoUrl} className="marca-mini" alt="" />}
            </div>
            <div className="rise">
              <h1 className="mesa-titulo">Mesa {mesaUrl}</h1>
              <p>Comandas abertas. Toque na sua.</p>
            </div>
          </div>
          <div className="lista-comandas stagger">
            {comandas.map((c) => (
              <button className="cmd-card" key={c.id} onClick={() => abrirComanda(c.id)} type="button">
                <span className="av">{c.tipo === 'junta' ? <I n="users" s={22} /> : c.nome.trim().charAt(0).toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{c.tipo === 'junta' ? 'Conta da mesa (junta)' : c.nome}</b>
                  <span className="cmd-meta">
                    <span className="muted">
                      {c.pedidos} {c.pedidos === 1 ? 'pedido' : 'pedidos'}
                    </span>
                    {c.pendente && (
                      <span className="tag warn"><I n="concierge" />Conta solicitada</span>
                    )}
                  </span>
                </span>
                <I n="chev-r" />
              </button>
            ))}
            <button className="nova-comanda" onClick={() => setTela('comanda')} type="button">
              <I n="plus" />
              Nova comanda
            </button>
            <button className="link-voltar" onClick={() => setTela('escolha')} type="button">
              <I n="back" s={18} />
              Voltar ao início
            </button>
          </div>
        </div>
      )}

      {tela === 'detalhe' && (
        <DetalheComanda
          config={config}
          comandaId={mesaAtual}
          mesaUrl={mesaUrl}
          temOutras={comandas.some((c) => c.id !== mesaAtual)}
          onPedirMais={entrarNoPedido}
          onTrocar={() => setTela(comandas.length ? 'mesa' : 'escolha')}
        />
      )}

      {tela === 'levar' && (
        <div className="tela">
          <div className="wine topo-levar">
            <button className="icon-btn on-wine" onClick={() => setTela('escolha')} type="button" aria-label="Voltar">
              <I n="back" />
            </button>
            <div className="rise">
              <span className="selo-icone"><I n="bag" s={28} /></span>
              <h1>Comida para levar</h1>
            </div>
          </div>
          <div className="conteudo">
            <FormContato
              titulo="Para quem é o pedido?"
              nome={nomeComanda}
              setNome={setNomeComanda}
              whatsapp={whatsappCampo}
              setWhatsapp={setWhatsappCampo}
              onContinuar={confirmarLevar}
            />
          </div>
        </div>
      )}

      {tela === 'comanda' && (
        <div className="tela">
          <div className="barra-simples">
            <button
              className="icon-btn"
              onClick={() => {
                setMostrarFormComanda(false);
                setTela(comandas.length ? 'mesa' : 'escolha');
              }}
              type="button"
              aria-label="Voltar"
            >
              <I n="back" />
            </button>
            {mesaUrl && <span className="tag brand"><I n="utensils" />Mesa {mesaUrl}</span>}
          </div>
          <div className="conteudo">
            <div className="rise">
              <h1>Comer no local</h1>
              <p className="muted" style={{ marginTop: 6 }}>A conta da mesa vai ser junta ou separada?</p>
            </div>
            <div className="tipos stagger">
              <button
                className={'kind' + (mostrarFormComanda === 'junta' ? ' on' : '')}
                onClick={() => setMostrarFormComanda('junta')}
                type="button"
              >
                {mostrarFormComanda === 'junta' && <span className="tick"><I n="check" s={13} /></span>}
                <span className="tile"><I n="users" s={22} /></span>
                <b>Comanda junta</b>
                <small>Mesa toda</small>
              </button>
              <button
                className={'kind' + (mostrarFormComanda === 'separada' ? ' on' : '')}
                onClick={() => setMostrarFormComanda('separada')}
                type="button"
              >
                {mostrarFormComanda === 'separada' && <span className="tick"><I n="check" s={13} /></span>}
                <span className="tile"><I n="user" s={22} /></span>
                <b>Comanda separada</b>
                <small>Só a minha</small>
              </button>
            </div>

            {mostrarFormComanda && (
              <FormContato
                titulo={mostrarFormComanda === 'junta' ? 'Quem está abrindo a comanda da mesa?' : 'Sua comanda'}
                nome={nomeComanda}
                setNome={setNomeComanda}
                whatsapp={whatsappCampo}
                setWhatsapp={setWhatsappCampo}
                onContinuar={confirmarComanda}
              />
            )}
          </div>
        </div>
      )}

      {tela === 'pedido' && (
        <div>
          <header className="appbar wine">
            <div className="appbar-row">
              {config.logoUrl && <img src={config.logoUrl} className="brand-mark" alt="" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ttl">{config.nomeLoja}</div>
                <div className="sub">
                  <I n={modo === 'levar' ? 'bag' : 'utensils'} s={13} />
                  {mesaLabel}
                </div>
              </div>
            </div>
            {modo === 'local' && mesaAtual && (
              <div className="appbar-acoes">
                <button className="btn sm on-wine" onClick={() => setTela('detalhe')} type="button">
                  <I n="receipt" s={16} />
                  Minha conta
                </button>
                <button className="btn sm on-wine" onClick={() => setModalFecharConta(true)} type="button">
                  <I n="wallet" s={16} />
                  Fechar conta
                </button>
              </div>
            )}
            {Array.isArray(cardapioVisivel) && cardapioVisivel.length > 0 ? (
              <nav className="chips" aria-label="Categorias">
                {cardapioVisivel.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={'chip' + (cat.id === categoriaAtual?.id ? ' on' : '')}
                    onClick={() => {
                      setCategoriaAtiva(cat.id);
                      window.scrollTo({ top: 0 });
                    }}
                  >
                    {cat.nome}
                  </button>
                ))}
              </nav>
            ) : (
              <div className="appbar-fim" />
            )}
          </header>

          {!lojaAberta && (
            <div className="aviso-faixa">
              <I n="info" s={18} />
              O restaurante não está aceitando pedidos no momento. Fale com a equipe.
            </div>
          )}

          {avisoRetirados && (
            <button className="aviso-faixa" onClick={() => setAvisoRetirados('')} type="button">
              <I n="alert" s={18} />
              <span>
                {avisoRetirados} <u>Fechar</u>
              </span>
            </button>
          )}

          <main className="cardapio-main">
            {carregandoCardapio && <div className="vazio">Carregando cardápio...</div>}
            {!carregandoCardapio && cardapio === null && (
              <div className="vazio">Não foi possível carregar o cardápio. Verifique sua conexão.</div>
            )}
            {!carregandoCardapio && cardapioVisivel && cardapioVisivel.length === 0 && (
              <div className="vazio">Cardápio ainda não disponível. Fale com a equipe.</div>
            )}
            {!carregandoCardapio &&
              cardapio &&
              (categoriaAtual ? [categoriaAtual] : []).map((cat) => (
                <section key={cat.id}>
                  <h2 className="cat-titulo">{cat.nome}</h2>
                  <div className="lista-pratos stagger" key={cat.id}>
                    {cat.pratos.map((prato) => {
                      const esgotado = pratoEsgotado(prato);
                      const temOpcoes = prato.grupos && prato.grupos.length > 0;
                      const qtdSimples = carrinho[`p${prato.id}`]?.quantidade || 0;
                      return (
                        <article className="dish" key={prato.id}>
                          <div className="dish-info">
                            <div className="nm">{prato.nome}</div>
                            {prato.descricao && <div className="ds">{prato.descricao}</div>}
                            {(prato.peso || prato.quantidade || prato.tempo_preparo) ? (
                              <div className="meta">
                                {prato.peso && <span><I n="scale" />{prato.peso}</span>}
                                {prato.quantidade && <span><I n="portion" />{prato.quantidade}</span>}
                                {prato.tempo_preparo ? <span><I n="clock" />{prato.tempo_preparo} min</span> : null}
                              </div>
                            ) : null}
                            {prato.observacao && (
                              <span className="tag warn tag-aviso"><I n="alert" />{prato.observacao}</span>
                            )}
                            <div className="dish-rodape">
                              <span className="pr money">{formatarMoeda(prato.preco)}</span>
                              {esgotado ? (
                                <span className="tag danger">Esgotado</span>
                              ) : prato.estoque > 0 && prato.estoque <= 5 ? (
                                <span className="tag danger">Restam {prato.estoque}</span>
                              ) : null}
                              <span className="dish-acao">
                                {esgotado ? (
                                  <span className="indisponivel">Indisponível</span>
                                ) : temOpcoes ? (
                                  <>
                                    <button className="btn sm" type="button" onClick={() => setPratoEscolhendo(prato)}>
                                      Escolher
                                    </button>
                                    {quantidadeDoPrato(prato.id) > 0 && (
                                      <span className="no-pedido">{quantidadeDoPrato(prato.id)} no pedido</span>
                                    )}
                                  </>
                                ) : qtdSimples === 0 ? (
                                  <button
                                    className="add-fab"
                                    type="button"
                                    aria-label="Aumentar"
                                    disabled={limiteQuantidade(prato, []) <= 0}
                                    onClick={() => alterarQuantidade(prato, 1)}
                                  >
                                    <I n="plus" />
                                  </button>
                                ) : (
                                  <span className="stepper">
                                    <button type="button" aria-label="Diminuir" onClick={() => alterarQuantidade(prato, -1)}>
                                      <I n="minus" s={18} />
                                    </button>
                                    <span className="n">{qtdSimples}</span>
                                    <button
                                      type="button"
                                      aria-label="Aumentar"
                                      disabled={limiteQuantidade(prato, []) <= 0}
                                      onClick={() => alterarQuantidade(prato, 1)}
                                    >
                                      <I n="plus" s={18} />
                                    </button>
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                          {prato.foto && (
                            <button className="dish-foto" type="button" onClick={() => setPratoVendo(prato)} aria-label={'Ver foto de ' + prato.nome}>
                              <img src={prato.foto} alt={prato.nome} loading="lazy" />
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
          </main>

          {itensCarrinho.length > 0 && (
            <div className="cartbar">
              <span className="count">{unidadesCarrinho}</span>
              <div style={{ lineHeight: 1.2 }}>
                <div className="cb-rot">Total</div>
                <div className="cb-total money">{formatarMoeda(totalCarrinho)}</div>
              </div>
              <button className="go" onClick={() => setModalRevisao(true)} type="button">
                Ver pedido
                <I n="chev-r" s={18} />
              </button>
            </div>
          )}

          {pratoVendo && (
            <div className="overlay" onClick={() => setPratoVendo(null)}>
              <div className="modal modal-foto" onClick={(e) => e.stopPropagation()}>
                <img className="foto-grande" src={pratoVendo.foto} alt={pratoVendo.nome} />
                <div className="modal-corpo">
                  <h3 style={{ fontSize: 24, fontWeight: 700 }}>{pratoVendo.nome}</h3>
                  <p className="preco-grande money">
                    {formatarMoeda(pratoVendo.preco)}
                    {pratoVendo.grupos && pratoVendo.grupos.length > 0 ? ' (a partir de)' : ''}
                  </p>
                  {pratoVendo.descricao && <p className="descricao-grande">{pratoVendo.descricao}</p>}
                  {pratoVendo.observacao && (
                    <div className="aviso-box"><I n="alert" s={18} /><span>{pratoVendo.observacao}</span></div>
                  )}
                  {pratoVendo.peso || pratoVendo.quantidade || pratoVendo.tempo_preparo ? (
                    <div className="facts">
                      {pratoVendo.peso && <div className="fact"><I n="scale" />{pratoVendo.peso}</div>}
                      {pratoVendo.quantidade && <div className="fact"><I n="portion" />{pratoVendo.quantidade}</div>}
                      {pratoVendo.tempo_preparo ? <div className="fact"><I n="clock" />{pratoVendo.tempo_preparo} min</div> : null}
                    </div>
                  ) : null}
                </div>
                <div className="acoes">
                  <button className="btn line" type="button" onClick={() => setPratoVendo(null)}>
                    Fechar
                  </button>
                  <button
                    className="btn"
                    type="button"
                    style={{ flex: 2 }}
                    disabled={pratoEsgotado(pratoVendo)}
                    onClick={() => {
                      const prato = pratoVendo;
                      setPratoVendo(null);
                      if (prato.grupos && prato.grupos.length > 0) setPratoEscolhendo(prato);
                      else alterarQuantidade(prato, 1);
                    }}
                  >
                    {pratoVendo.grupos && pratoVendo.grupos.length > 0 ? 'Escolher opções' : 'Adicionar ao pedido'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {pratoEscolhendo && (
            <ModalOpcoes
              prato={pratoEscolhendo}
              limiteQuantidade={limiteQuantidade}
              onFechar={() => setPratoEscolhendo(null)}
              onAdicionar={adicionarComOpcoes}
            />
          )}

          {modalRevisao && (
            <ModalRevisarPedido
              itens={itensCarrinho}
              onAlterar={alterarPorChave}
              onObservacao={alterarObservacao}
              total={totalCarrinho}
              modo={modo}
              mesaAtual={mesaAtual}
              cliente={cliente}
              onFechar={() => setModalRevisao(false)}
              onSucesso={() => {
                setModalRevisao(false);
                limparCarrinho();
              }}
            />
          )}

          {modalFecharConta && <ModalFecharConta mesaAtual={mesaAtual} onFechar={() => setModalFecharConta(false)} />}
        </div>
      )}
    </>
  );
}

// Nome + WhatsApp (o WhatsApp é opcional). O aviso explica para que o número é usado.
function FormContato({ titulo, nome, setNome, whatsapp, setWhatsapp, onContinuar }) {
  return (
    <div className="form-contato rise">
      {titulo && <h2>{titulo}</h2>}
      <div className="field">
        <label htmlFor="cliente-nome">Seu nome</label>
        <div className="input-wrap">
          <I n="user" />
          <input id="cliente-nome" className="input" type="text" placeholder="Seu nome" autoComplete="given-name" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="cliente-zap">
          WhatsApp <span className="opcional">(opcional)</span>
        </label>
        <div className="input-wrap">
          <I n="chat" />
          <input
            id="cliente-zap"
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 91234-5678"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
        </div>
        <p className="hint">
          Informe seu WhatsApp para receber as últimas novidades da loja. Não é obrigatório: se preferir, pode deixar em branco.
        </p>
      </div>
      <button className="btn block" onClick={onContinuar} type="button">
        Continuar
        <I n="back" flip />
      </button>
    </div>
  );
}

// Prato sem estoque, ou com um grupo obrigatório em que todas as opções acabaram
function pratoEsgotado(prato) {
  if (prato.estoque === 0) return true;
  return (prato.grupos || []).some(
    (g) => g.tipo === 'unica' && g.opcoes.length > 0 && g.opcoes.every((o) => o.estoque === 0 || o.ativo === false),
  );
}

function ModalOpcoes({ prato, onFechar, onAdicionar, limiteQuantidade }) {
  const [escolhas, setEscolhas] = useState({}); // { [grupoId]: [opcaoId, ...] }
  const [quantidade, setQuantidade] = useState(1);
  const [erro, setErro] = useState('');

  function marcar(grupo, opcao) {
    setErro('');
    setEscolhas((atual) => {
      const marcadas = atual[grupo.id] || [];
      if (grupo.tipo === 'unica') return { ...atual, [grupo.id]: [opcao.id] };
      return {
        ...atual,
        [grupo.id]: marcadas.includes(opcao.id) ? marcadas.filter((id) => id !== opcao.id) : [...marcadas, opcao.id],
      };
    });
  }

  // Opção que acabou (desativada ou sem estoque) nem aparece para o cliente
  const grupos = prato.grupos
    .map((g) => ({ ...g, opcoes: g.opcoes.filter((o) => o.estoque !== 0 && o.ativo !== false) }))
    .filter((g) => g.opcoes.length > 0);

  const selecionadas = grupos.flatMap((g) => g.opcoes.filter((o) => (escolhas[g.id] || []).includes(o.id)).map((o) => ({ ...o, grupo: g.nome })));
  const precoUnit = Number(prato.preco) + selecionadas.reduce((soma, o) => soma + o.precoAdicional, 0);
  const limite = limiteQuantidade(prato, selecionadas.map((o) => o.id));

  function confirmar() {
    const faltando = grupos.find((g) => g.tipo === 'unica' && !(escolhas[g.id] || []).length);
    if (faltando) {
      setErro(`Escolha uma opção de "${faltando.nome}".`);
      return;
    }
    if (quantidade > limite) {
      setErro(limite > 0 ? `Só temos ${limite} disponível com essa escolha.` : 'Essa escolha acabou. Tente outra opção.');
      return;
    }
    onAdicionar(prato, selecionadas, quantidade);
  }

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-label={prato.nome}>
        <div className="grab" />
        <div className="modal-cab">
          <h3>{prato.nome}</h3>
          <button className="icon-btn" type="button" onClick={onFechar} aria-label="Voltar">
            <I n="x" />
          </button>
        </div>
        <div className="modal-corpo" style={{ paddingTop: 0 }}>
          {grupos.map((g) => {
            const unica = g.tipo === 'unica';
            const escolhido = (escolhas[g.id] || []).length > 0;
            return (
              <div key={g.id}>
                <div className="grp-h">
                  <h4>{g.nome}</h4>
                  {unica ? (
                    escolhido ? (
                      <span className="tag ok"><I n="check" />Escolhido</span>
                    ) : (
                      <span className="tag brand">Escolha 1 (obrigatório)</span>
                    )
                  ) : (
                    <span className="tag neutral">Opcional, valor à parte</span>
                  )}
                </div>
                {!unica && <p className="hint" style={{ margin: '-4px 0 10px' }}>Marque quantos quiser.</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {g.opcoes.map((o) => {
                    const marcada = (escolhas[g.id] || []).includes(o.id);
                    const acabou = o.estoque === 0 || o.ativo === false;
                    return (
                      <label className={'opt' + (unica ? '' : ' sq') + (marcada ? ' on' : '') + (acabou ? ' esgotada' : '')} key={o.id}>
                        <input
                          className="sr-only"
                          type={unica ? 'radio' : 'checkbox'}
                          name={'grupo-' + g.id}
                          checked={marcada}
                          disabled={acabou}
                          onChange={() => marcar(g, o)}
                        />
                        <span className="mark"><I n="check" /></span>
                        <span className="opt-txt">
                          <span className="o-nm">{o.nome}</span>
                          {o.descricao && <span className="o-ds">{o.descricao}</span>}
                        </span>
                        {acabou ? (
                          <span className="o-pr">Esgotado</span>
                        ) : (
                          o.precoAdicional > 0 && <span className="o-pr money">+ {formatarMoeda(o.precoAdicional)}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {erro && (
            <p className="erro" style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
              <I n="alert" s={16} />
              {erro}
            </p>
          )}
        </div>
        <div className="acoes">
          <span className="stepper light grande">
            <button type="button" aria-label="Diminuir" onClick={() => setQuantidade((q) => Math.max(1, q - 1))}>
              <I n="minus" />
            </button>
            <span className="n">{quantidade}</span>
            <button
              type="button"
              aria-label="Aumentar"
              disabled={quantidade >= limite}
              onClick={() => setQuantidade((q) => Math.min(limite, q + 1))}
            >
              <I n="plus" />
            </button>
          </span>
          <button className="btn" type="button" onClick={confirmar}>
            Adicionar {formatarMoeda(precoUnit * quantidade)}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalRevisarPedido({ itens, total, modo, mesaAtual, cliente, onFechar, onSucesso, onAlterar, onObservacao }) {
  const paraLevar = modo === 'levar';
  const [valorCampo, setValorCampo] = useState(paraLevar ? cliente?.nome || '' : mesaAtual);
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(null);

  async function enviarPedido() {
    if (paraLevar && !valorCampo.trim()) {
      setErro('Informe seu nome para identificar o pedido.');
      return;
    }
    setEnviando(true);
    setErro('');
    const mesaValor = paraLevar ? `Para levar: ${valorCampo.trim()}` : valorCampo;

    try {
      const resp = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesa: mesaValor,
          observacao,
          clienteNome: cliente?.nome || '',
          clienteWhatsapp: cliente?.whatsapp || '',
          itens: itens.map((i) => ({
            pratoId: i.prato.id,
            quantidade: i.quantidade,
            opcoes: i.opcoes.map((o) => o.id),
            observacao: i.observacao || '',
          })),
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || 'Erro ao enviar pedido');
      setSucesso(dados);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (sucesso) {
    return (
      <div className="overlay">
        <div className="modal wine modal-vinho" role="dialog" aria-label="Pedido enviado">
          <div className="seal">
            <span className="disc" />
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#33070A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h3>Pedido enviado!</h3>
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className="tag gold">Pedido nº {sucesso.pedidoId}</span>
            <span className="tag gold money">Total {formatarMoeda(sucesso.total)}</span>
          </div>
          <p style={{ color: '#F1D8CF', fontSize: 16, marginTop: 14 }}>Aguarde, a equipe já foi avisada.</p>
          <button className="btn block white" type="button" onClick={onSucesso}>
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-label="Confirmar pedido">
        <div className="grab" />
        <div className="modal-cab">
          <h3>Confirmar pedido</h3>
          <button className="icon-btn" type="button" onClick={onFechar} aria-label="Voltar">
            <I n="x" />
          </button>
        </div>
        <div className="modal-corpo" style={{ background: 'var(--bg)' }}>
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {itens.map((i) => (
              <div className="linha-it" key={i.chave}>
                <div className="linha-it-topo">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{i.prato.nome}</div>
                    {i.opcoes.length > 0 && (
                      <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{i.opcoes.map((o) => o.nome).join(', ')}</div>
                    )}
                    <div className="money" style={{ marginTop: 6, fontWeight: 600, color: 'var(--brand-ink)' }}>
                      {formatarMoeda(i.precoUnit * i.quantidade)}
                    </div>
                  </div>
                  <span className="stepper light">
                    <button type="button" aria-label="Diminuir" onClick={() => onAlterar(i.chave, -1)}>
                      <I n="minus" s={18} />
                    </button>
                    <span className="n">{i.quantidade}</span>
                    <button type="button" aria-label="Aumentar" onClick={() => onAlterar(i.chave, 1)}>
                      <I n="plus" s={18} />
                    </button>
                  </span>
                </div>
                <input
                  type="text"
                  className="input"
                  style={{ height: 42, fontSize: 14, marginTop: 10, background: 'var(--surface-2)' }}
                  placeholder="Observação deste prato (ex: sem cebola)"
                  aria-label={'Observação de ' + i.prato.nome}
                  maxLength={200}
                  value={i.observacao || ''}
                  onChange={(e) => onObservacao(i.chave, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="field" style={{ marginTop: 18 }}>
            <label htmlFor="pedido-campo">{paraLevar ? 'Seu nome' : 'Número da mesa'}</label>
            <input id="pedido-campo" className="input" type="text" value={valorCampo} onChange={(e) => setValorCampo(e.target.value)} />
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="pedido-obs">Observações</label>
            <textarea
              id="pedido-obs"
              className="input"
              placeholder="Observações (ex: sem cebola)"
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
          {erro && <p className="erro" style={{ marginTop: 12 }}>{erro}</p>}
        </div>
        <div className="row" style={{ padding: '14px 22px 0', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Total</span>
          <span className="money" style={{ fontFamily: 'var(--f-d)', fontWeight: 700, fontSize: 22 }}>{formatarMoeda(total)}</span>
        </div>
        <div className="acoes" style={{ borderTop: 0 }}>
          <button className="btn line" type="button" onClick={onFechar}>
            Voltar
          </button>
          <button className="btn" type="button" style={{ flex: 2 }} disabled={enviando || itens.length === 0} onClick={enviarPedido}>
            <I n="send" />
            {enviando ? 'Enviando...' : 'Enviar pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalFecharConta({ mesaAtual, onFechar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(null);

  useEffect(() => {
    fetch('/api/comanda?id=' + encodeURIComponent(mesaAtual))
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) throw new Error(d.erro);
        setDados(d);
      })
      .catch((err) => setErro(err.message));
  }, [mesaAtual]);

  async function confirmar() {
    setEnviando(true);
    try {
      const resp = await fetch('/api/conta/fechar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesa: mesaAtual }),
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.erro || 'Erro ao chamar para fechar a conta.');
      setSucesso(d);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (erro && !dados) {
    return (
      <div className="overlay">
        <div className="modal" role="dialog" aria-label="Fechar conta">
          <div className="modal-corpo">
            <p className="erro">{erro}</p>
          </div>
          <div className="acoes">
            <button className="btn line" type="button" onClick={onFechar}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div className="overlay">
        <div className="modal wine modal-vinho" role="dialog" aria-label="Equipe avisada">
          <div className="sino"><I n="concierge" s={52} /></div>
          <h3>Equipe avisada!</h3>
          <p style={{ color: '#F1D8CF', fontSize: 15.5, marginTop: 10 }}>Alguém vai até sua mesa para fechar a conta.</p>
          <div className="total-card">
            <div className="row" style={{ fontSize: 14.5, color: 'var(--ink-2)' }}>
              <span>Subtotal</span>
              <span className="money">{formatarMoeda(sucesso.subtotal)}</span>
            </div>
            <div className="row" style={{ fontSize: 14.5, color: 'var(--ink-2)', marginTop: 6 }}>
              <span>Taxa de serviço (10%)</span>
              <span className="money">{formatarMoeda(sucesso.taxaServico)}</span>
            </div>
            <div className="dash" />
            <div className="row" style={{ alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--f-d)', fontWeight: 600, fontSize: 17 }}>Total</span>
              <span className="money" style={{ fontFamily: 'var(--f-d)', fontWeight: 800, fontSize: 32, color: 'var(--brand-ink)' }}>
                {formatarMoeda(sucesso.total)}
              </span>
            </div>
          </div>
          <button className="btn block on-wine" type="button" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    );
  }

  if (!dados) return null;

  const total = dados.subtotal + dados.taxaServico;

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-label="Fechar conta">
        <div className="grab" />
        <div className="modal-cab">
          <h3>Fechar conta</h3>
          <button className="icon-btn" type="button" onClick={onFechar} aria-label="Voltar">
            <I n="x" />
          </button>
        </div>
        <div className="modal-corpo" style={{ background: 'var(--bg)' }}>
          <div className="recibo rise">
            <h2 style={{ fontSize: 18, fontWeight: 600, textAlign: 'center' }}>Mesa {mesaAtual}</h2>
            <div className="dash" />
            {dados.pedidos
              .filter((p) => p.status !== 'cancelado')
              .flatMap((p) => p.itens)
              .map((i, idx) => (
                <div className="r-li" key={idx}>
                  <span className="q">{i.quantidade}×</span>
                  <span style={{ flex: 1 }}>
                    {i.nome}
                    {i.opcoes && <small className="muted" style={{ display: 'block', fontSize: 12.5 }}>{i.opcoes}</small>}
                  </span>
                  <span className="money">{formatarMoeda(i.subtotal)}</span>
                </div>
              ))}
            {dados.subtotal <= 0 && <p className="erro">Ainda não há pedidos nesta comanda.</p>}
            <div className="dash" />
            <div className="row" style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              <span>Subtotal dos pedidos</span>
              <span className="money">{formatarMoeda(dados.subtotal)}</span>
            </div>
            <div className="row" style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 6 }}>
              <span>Taxa de serviço (10%)</span>
              <span className="money">{formatarMoeda(dados.taxaServico)}</span>
            </div>
            <div className="row" style={{ marginTop: 14, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--f-d)', fontWeight: 600, fontSize: 16 }}>Total a pagar</span>
              <span className="total-grande money">{formatarMoeda(total)}</span>
            </div>
          </div>
          {dados.fechamentoPendente && (
            <div className="aviso-box"><I n="concierge" s={18} /><span>A conta já foi solicitada. A equipe está a caminho.</span></div>
          )}
          {erro && <p className="erro" style={{ marginTop: 12 }}>{erro}</p>}
        </div>
        <div className="acoes">
          <button className="btn" type="button" disabled={enviando || dados.subtotal <= 0} onClick={confirmar}>
            <I n="concierge" />
            {enviando ? 'Enviando...' : 'Chamar para fechar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetalheComanda({ config, comandaId, mesaUrl, temOutras, onPedirMais, onTrocar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [fechando, setFechando] = useState(false);

  useEffect(() => {
    let ativo = true;
    function carregar() {
      fetch('/api/comanda?id=' + encodeURIComponent(comandaId))
        .then((r) => r.json())
        .then((d) => {
          if (!ativo) return;
          if (d.erro) throw new Error(d.erro);
          setDados(d);
          setErro('');
        })
        .catch((err) => ativo && setErro(err.message));
    }
    carregar();
    const intervalo = setInterval(carregar, 10000);
    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, [comandaId, fechando]);

  const nome = mesaUrl && comandaId.startsWith(mesaUrl + ' - ') ? comandaId.slice(mesaUrl.length + 3) : '';
  const titulo = mesaUrl ? (nome ? `Mesa ${mesaUrl} - ${nome}` : `Mesa ${mesaUrl} (conta junta)`) : comandaId;

  return (
    <div className="tela">
      <header className="appbar wine" style={{ paddingBottom: 18 }}>
        <div className="appbar-row">
          {config.logoUrl && <img src={config.logoUrl} className="brand-mark" alt="" />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ttl">{config.nomeLoja}</div>
            <div className="sub">{titulo}</div>
          </div>
        </div>
      </header>

      <main className="stagger" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {erro && <p className="erro">{erro}</p>}
        {!dados && !erro && <div className="vazio">Carregando...</div>}
        {dados && dados.pedidos.length === 0 && <div className="vazio">Nenhum pedido nesta comanda ainda.</div>}
        {dados &&
          dados.pedidos.map((p) => {
            const [cor, icone] = STATUS_SELO[p.status] || ['neutral', 'info'];
            return (
              <div className="ord" key={p.id} style={{ opacity: p.status === 'cancelado' ? 0.55 : 1 }}>
                <div className="ord-h">
                  <b>Pedido {new Date(p.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b>
                  <span className={'tag ' + cor} style={{ marginLeft: 'auto' }}>
                    <I n={icone} />
                    {STATUS_ROTULO[p.status] || p.status}
                  </span>
                </div>
                <div style={{ marginTop: 6 }}>
                  {p.itens.map((i, idx) => (
                    <div className="li" key={idx}>
                      <span className="q">{i.quantidade}×</span>
                      <span style={{ flex: 1 }}>
                        {i.nome}
                        {i.opcoes && <span className="muted" style={{ display: 'block', fontSize: 13 }}>{i.opcoes}</span>}
                        {i.observacao && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--warn)' }}>
                            <I n="note" s={13} />
                            Obs: {i.observacao}
                          </span>
                        )}
                      </span>
                      <span className="money">{formatarMoeda(i.subtotal)}</span>
                    </div>
                  ))}
                </div>
                {p.observacao && <p style={{ color: 'var(--warn)', fontSize: 13.5, marginTop: 6 }}>Obs: {p.observacao}</p>}
              </div>
            );
          })}

        {dados && dados.subtotal > 0 && (
          <div className="sum">
            <div className="row">
              <span>Subtotal</span>
              <span className="money">{formatarMoeda(dados.subtotal)}</span>
            </div>
            <div className="row" style={{ marginTop: 4 }}>
              <span>Taxa de serviço (10%)</span>
              <span className="money">{formatarMoeda(dados.taxaServico)}</span>
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,.14)', margin: '12px 0' }} />
            <div className="row total">
              <span>Total</span>
              <span className="total-v money">{formatarMoeda(dados.subtotal + dados.taxaServico)}</span>
            </div>
          </div>
        )}

        {dados && dados.fechamentoPendente && (
          <div className="aviso-box" style={{ marginTop: 0 }}>
            <I n="concierge" s={18} />
            <span>Conta solicitada. A equipe está a caminho.</span>
          </div>
        )}

        {temOutras && (
          <button className="link-voltar" type="button" onClick={onTrocar} style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>
            <I n="back" s={18} />
            Ver outras comandas da mesa
          </button>
        )}
      </main>

      <div className="rodape-fixo">
        <button className="btn block" type="button" onClick={onPedirMais}>
          <I n="plus" />
          Pedir mais
        </button>
        <button className="btn block line" type="button" disabled={!dados || dados.subtotal <= 0} onClick={() => setFechando(true)}>
          <I n="wallet" />
          Fechar conta
        </button>
      </div>

      {fechando && <ModalFecharConta mesaAtual={comandaId} onFechar={() => setFechando(false)} />}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="vazio">Carregando...</div>}>
      <PaginaCliente />
    </Suspense>
  );
}

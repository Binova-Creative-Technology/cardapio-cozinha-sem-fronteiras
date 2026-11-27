'use client';

// Cardápio só para olhar (link para enviar aos clientes): sem carrinho e sem pedido.
import { useEffect, useState } from 'react';

function formatarMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function I({ n, s }) {
  return <span className={'i i-' + n} style={s ? { '--s': s + 'px' } : undefined} aria-hidden="true" />;
}

const disponivel = (o) => o.estoque !== 0 && o.ativo !== false;

// O que acabou não aparece (igual ao cardápio da mesa)
function pratoVisivel(prato) {
  if (prato.estoque === 0) return false;
  return !(prato.grupos || []).some((g) => g.tipo === 'unica' && g.opcoes.length > 0 && !g.opcoes.some(disponivel));
}

export default function CardapioParaVer() {
  const [config, setConfig] = useState({ nomeLoja: 'Cozinha Sem Fronteiras', logoUrl: '' });
  const [cardapio, setCardapio] = useState(undefined); // undefined = carregando, null = erro
  const [categoriaAtiva, setCategoriaAtiva] = useState(null);
  const [vendo, setVendo] = useState(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(({ nomeLoja, logoUrl }) => {
        if (nomeLoja) setConfig({ nomeLoja, logoUrl });
      })
      .catch(() => {});
    fetch('/api/cardapio')
      .then((r) => r.json())
      .then((data) => setCardapio(Array.isArray(data) ? data : null))
      .catch(() => setCardapio(null));
  }, []);

  const categorias = (cardapio || [])
    .map((c) => ({ ...c, pratos: c.pratos.filter(pratoVisivel) }))
    .filter((c) => c.pratos.length > 0);
  const atual = categorias.find((c) => c.id === categoriaAtiva) || categorias[0];

  return (
    <div>
      <header className="appbar wine">
        <div className="appbar-row">
          {config.logoUrl && <img src={config.logoUrl} className="brand-mark" alt="" />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ttl">{config.nomeLoja}</div>
            <div className="sub">
              <I n="utensils" s={13} />
              Cardápio
            </div>
          </div>
        </div>
        {categorias.length > 0 ? (
          <nav className="chips" aria-label="Categorias">
            {categorias.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={'chip' + (cat.id === atual?.id ? ' on' : '')}
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

      <main className="cardapio-main" style={{ paddingBottom: 40 }}>
        {cardapio === undefined && <div className="vazio">Carregando cardápio...</div>}
        {cardapio === null && <div className="vazio">Não foi possível carregar o cardápio. Tente de novo daqui a pouco.</div>}
        {Array.isArray(cardapio) && categorias.length === 0 && <div className="vazio">Cardápio ainda não disponível.</div>}

        {atual && (
          <section key={atual.id}>
            <h2 className="cat-titulo">{atual.nome}</h2>
            <div className="lista-pratos stagger">
              {atual.pratos.map((prato) => (
                <article
                  className="dish"
                  key={prato.id}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setVendo(prato)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setVendo(prato);
                  }}
                >
                  <div className="dish-info">
                    <div className="nm">{prato.nome}</div>
                    {prato.descricao && <div className="ds">{prato.descricao}</div>}
                    {prato.peso || prato.quantidade || prato.tempo_preparo ? (
                      <div className="meta">
                        {prato.peso && (
                          <span>
                            <I n="scale" />
                            {prato.peso}
                          </span>
                        )}
                        {prato.quantidade && (
                          <span>
                            <I n="portion" />
                            {prato.quantidade}
                          </span>
                        )}
                        {prato.tempo_preparo ? (
                          <span>
                            <I n="clock" />
                            {prato.tempo_preparo} min
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {prato.observacao && (
                      <span className="tag warn tag-aviso">
                        <I n="alert" />
                        {prato.observacao}
                      </span>
                    )}
                    <div className="dish-rodape">
                      <span className="pr money">{formatarMoeda(prato.preco)}</span>
                    </div>
                  </div>
                  {prato.foto && (
                    <div className="dish-foto">
                      <img src={prato.foto} alt={prato.nome} loading="lazy" />
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {vendo && (
        <div className="overlay" onClick={() => setVendo(null)}>
          <div className="modal modal-foto" onClick={(e) => e.stopPropagation()}>
            {vendo.foto && <img className="foto-grande" src={vendo.foto} alt={vendo.nome} />}
            <div className="modal-corpo">
              <h3 style={{ fontSize: 24, fontWeight: 700 }}>{vendo.nome}</h3>
              <p className="preco-grande money">{formatarMoeda(vendo.preco)}</p>
              {vendo.descricao && <p className="descricao-grande">{vendo.descricao}</p>}
              {vendo.observacao && (
                <div className="aviso-box">
                  <I n="alert" s={18} />
                  <span>{vendo.observacao}</span>
                </div>
              )}
              {vendo.peso || vendo.quantidade || vendo.tempo_preparo ? (
                <div className="facts">
                  {vendo.peso && (
                    <div className="fact">
                      <I n="scale" />
                      {vendo.peso}
                    </div>
                  )}
                  {vendo.quantidade && (
                    <div className="fact">
                      <I n="portion" />
                      {vendo.quantidade}
                    </div>
                  )}
                  {vendo.tempo_preparo ? (
                    <div className="fact">
                      <I n="clock" />
                      {vendo.tempo_preparo} min
                    </div>
                  ) : null}
                </div>
              ) : null}
              {(vendo.grupos || []).map((g) => {
                const opcoes = g.opcoes.filter(disponivel);
                if (!opcoes.length) return null;
                return (
                  <div key={g.id} style={{ marginTop: 16 }}>
                    <strong>{g.nome}</strong>
                    <span style={{ color: '#777', fontSize: 13 }}>
                      {' '}
                      — {g.tipo === 'unica' ? 'escolha 1' : 'adicionais'}
                    </span>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
                      {opcoes.map((o) => (
                        <li key={o.id}>
                          {o.nome}
                          {o.precoAdicional > 0 ? ` (+ ${formatarMoeda(o.precoAdicional)})` : ''}
                          {o.descricao && <div style={{ color: '#777', fontSize: 13 }}>{o.descricao}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <div className="acoes">
              <button className="btn block" type="button" onClick={() => setVendo(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

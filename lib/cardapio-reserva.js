// CARDÁPIO DE RESERVA — cópia tirada do banco em 25/11/2026.
// Só é mostrado ao cliente quando o banco de dados está fora do ar (sem fotos e sem enviar pedido:
// o cliente mostra a tela ao atendente). Quando o banco volta, o cardápio normal volta sozinho.

const op = (id, nome, descricao = '', precoAdicional = 0) => ({ id, nome, descricao, precoAdicional, ativo: true, estoque: null });
const grupo = (id, nome, opcoes, tipo = 'unica') => ({ id, nome, tipo, opcoes });
const prato = (id, nome, preco, { descricao = '', peso = '', quantidade = '1 un', observacao = '', grupos = [] } = {}) => ({
  id,
  nome,
  descricao,
  preco,
  foto: '',
  tempo_preparo: 0,
  peso,
  quantidade,
  observacao,
  estoque: null,
  grupos,
});

const ACOMPANHA = 'Acompanha Batata Frita e Molho da casa';
const CARNE =
  'Massa macia assada, recheada com carne moída temperada, cebola, tomate, pimentão e uma combinação especial de especiarias árabes.';

export const CARDAPIO_RESERVA = [
  {
    id: 1,
    nome: 'Salgados arabes',
    pratos: [
      prato(7, 'Kibe frito de carne', 15, { descricao: 'Bolinho crocante feito de trigo, carne moída, temperos sírios', peso: '120g', quantidade: '3 un' }),
      prato(13, 'Bolinho de Abóbora Vegano', 15, { descricao: 'Kibe vegano feito com abóbora e trigo para kibe, recheado com cebola, grão-de-bico, sumac e temperos árabes.', peso: '120', quantidade: '3 un' }),
      prato(8, 'Esfirra fechada de carne', 15, { descricao: CARNE, peso: '120', quantidade: '3 un' }),
      prato(45, 'Esfiha de carne aberta', 15, { descricao: CARNE, peso: '120g', quantidade: '3 un' }),
      prato(10, 'Esfirra de Queijo Árabe', 15, { descricao: 'Massa macia assada, recheada com queijo árabe tradicional e salsa fresca, levemente salgado e muito saboroso.', peso: '120', quantidade: '3 un' }),
    ],
  },
  {
    id: 5,
    nome: 'Entradas Árabes',
    pratos: [
      prato(16, 'Pasta de Grão de Bico', 20, { descricao: 'Creme suave de grão de bico com tahine, limão, azeite de oliva e temperos árabes.', peso: '150' }),
      prato(14, 'Coalhada seca', 20, { descricao: 'Pasta árabe cremosa, preparada artesanalmente com iogurte natural cuidadosamente coado, com sabor levemente ácido', peso: '150' }),
      prato(15, 'Pasta de Pimentão Vermelho com Nozes', 20, { descricao: 'Creme de pimentão vermelho assado, nozes, azeite de oliva, alho e especiarias árabes.', peso: '150', observacao: 'Pouco picante' }),
      prato(17, 'Pasta de Alho', 20, { descricao: 'Creme suave feito com leite, alho, óleo e sal.', peso: '150' }),
      prato(19, 'Salada de Tabule', 22, { descricao: 'Salada tradicional árabe feita com trigo para kibe, tomate, salsa, hortelã fresca e limão, temperada com azeite leve, refrescante e cheia de sabor.', peso: '150' }),
      prato(18, 'Baba Ghanoush', 20, { descricao: 'Pasta cremosa feita com berinjela assada e defumada, tahine, alho, limão e azeite de oliva', peso: '150' }),
    ],
  },
  {
    id: 8,
    nome: 'Pão Sirio',
    pratos: [prato(37, 'Pão sirio', 2, { descricao: 'Pão tradicional árabe, macio e leve', observacao: 'Tamanho grande' })],
  },
  {
    id: 6,
    nome: 'Sanduíche Árabe',
    pratos: [
      prato(23, 'Shawarma de Frango', 38, {
        descricao: 'Sanduíche árabe no pão sírio, recheado com fatias de frango marinado e assado no espeto, servido com pasta de alho tradicional, picles e molho especial.',
        peso: '150g',
        observacao: ACOMPANHA,
        grupos: [grupo(41, 'Adicionais', [op(125, 'Melaço de Romã', '', 3)], 'extra')],
      }),
      prato(41, 'Shawarma de Carne', 48, { descricao: 'Sanduíche árabe no pão sírio, recheado com carne bovina marinada em especiarias árabes, servida com pasta de alho e picles', peso: '150', observacao: ACOMPANHA }),
      prato(24, 'Sanduíche de Kafta Defumada', 42, {
        descricao: 'Pão sírio de 22cm recheado com kafta defumado, pasta à escolha, tomate fresco, anéis de cebola, alface crocante, picles e molho especial da casa.',
        peso: '150',
        observacao: ACOMPANHA,
        grupos: [grupo(74, 'Pasta a escolher', [op(228, 'Pasta de Grão de Bico'), op(229, 'Pasta de Alho')])],
      }),
      prato(25, 'Sanduíche de Falafel', 38, { descricao: 'Pão sírio recheado com bolinhos de grão-de-bico fritos (falafel), salada fresca, picles, cebola e molho de tahine', peso: '150', observacao: ACOMPANHA }),
      prato(27, 'Sanduíche de Batata Frita', 35, { descricao: 'Batata frita crocante, temperada com nosso tempero especial, acompanhada de ketchup, pasta de alho cremosa, repolho fresco e picles, tudo servido no tradicional pão sírio.', peso: '120' }),
    ],
  },
  {
    id: 2,
    nome: 'Pratos Árabes',
    pratos: [
      prato(40, 'Prato Árabe Tradicional', 40, {
        descricao: 'Monte seu prato árabe! Escolha sua proteína, acompanhada de arroz temperado, salada fresca e uma de nossas deliciosas pastas árabes. Uma refeição completa, saborosa e preparada com tradição.',
        peso: '500',
        grupos: [
          grupo(75, 'Arroz', [op(230, 'Arroz com lentilha'), op(231, 'Arroz branco com amendoim')]),
          grupo(76, 'Proteína', [
            op(232, '2 Espetos de Kafta'),
            op(233, '2 Espetos de Frango'),
            op(234, '1 Espeto de Kafta e 1 Espeto de frango'),
            op(235, '3 Kibe de Carne'),
            op(236, '3 kibe de abóbora'),
            op(237, '3 Falafel'),
          ]),
          grupo(77, 'Pastas', [
            op(238, 'Pasta de alho'),
            op(239, 'Pasta de grão de bico'),
            op(240, 'Colhada seca'),
            op(241, 'Baba ghanoush'),
            op(242, 'Pasta de pimentão'),
          ]),
          grupo(78, 'Salada', [
            op(243, 'Salada de Fattoush', 'Salada preparada com alface, tomate, pepino e cebola, acompanhada de pedaços crocantes de pão sírio torrado. Temperada com azeite, limão e melaço de romã.'),
            op(244, 'Salada de tabule', 'Feita principalmente de trigo, tomate, cebola, salsa, hortelã e outras ervas, com suco de limão, azeite e vários temperos'),
          ]),
        ],
      }),
      prato(28, 'Charuto de Folha de Repolho', 30, { descricao: 'Folhas de repolho recheadas com arroz, carne e especiarias, cozidas em molho de tomate e alho, com um toque de limão.', peso: '250' }),
    ],
  },
  {
    id: 3,
    nome: 'Bebidas',
    pratos: [
      prato(43, 'Suco de Água de Rosa', 15, { descricao: 'Bebida refrescante com leve aroma floral de água de rosas, muito apreciada na culinária do Oriente Médio.', peso: '300 ml' }),
      prato(5, 'Coca-Cola 350 ml', 8, { grupos: [grupo(15, 'Normal ou Zero', [op(34, 'Normal'), op(35, 'Zero')])] }),
      prato(30, 'Guaraná Antarctica 350 ml', 8, { grupos: [grupo(79, 'Normal ou Zero', [op(245, 'Normal')])] }),
      prato(32, 'Cerveja Heineken Long Neck', 12, { descricao: 'Com Álcool' }),
      prato(44, 'Cerveja Stella Artois Long Neck', 12, { descricao: 'Com Álcool' }),
      prato(33, 'Suco Del Valle 290 ml', 8, { grupos: [grupo(49, 'Sabor', [op(145, 'Uva'), op(146, 'Manga')])] }),
      prato(35, 'Água natural 510 ml', 4),
    ],
  },
  {
    id: 7,
    nome: 'Doces Árabes',
    pratos: [
      prato(39, 'Maamoul de tamara', 10, { descricao: 'Biscoito árabe tradicional, preparado com massa delicada e recheado exclusivamente com tâmaras, levemente adoçado e aromatizado com especiarias suaves.', quantidade: '2 un' }),
    ],
  },
];

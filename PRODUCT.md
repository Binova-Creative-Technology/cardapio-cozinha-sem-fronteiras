# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Cliente do restaurante** — escaneia o QR Code da mesa (ou pede para levar) no próprio celular, muitas vezes com uma mão, conversando, com pressa ou com fome. Quer ver o cardápio, montar o pedido, acompanhar a comanda e pedir a conta sem chamar ninguém.
- **Equipe do restaurante** — dono e atendentes usam o painel tanto no computador do balcão (com impressora térmica de 50 mm ligada) quanto no celular/tablet circulando pelo salão. Precisam perceber pedido novo na hora, mudar status, imprimir para a cozinha, fechar contas e manter cardápio e estoque.

## Product Purpose

Sistema de pedidos por QR Code para o restaurante Cozinha Sem Fronteiras: cardápio digital, pedidos por mesa (comanda junta ou separada) e para levar, fechamento de conta com taxa de serviço de 10%, e painel administrativo completo. Sucesso = cliente pede sozinho em poucos toques e a equipe nunca perde um pedido.

## Positioning

Feito sob medida para um restaurante de culinária árabe/do mundo ("Cozinha بلا حدود · Sem Fronteiras"): comandas por mesa que juntam vários pedidos do mesmo cliente, estoque que esgota pratos e opções sozinho, recibo para impressora térmica e agradecimento por WhatsApp ao fechar a conta.

## Operating Context

- Cliente: celular, rede móvel, salão do restaurante; entra por `/?mesa=N`.
- Equipe: navegador desktop e celular; alarme sonoro + notificação do navegador para pedido novo e pedido de conta; impressão de comanda de cozinha e de conta em impressora térmica 50 mm; programa whatsapp-worker rodando à parte.
- Telas do cliente: escolha (comer no local / para levar / site), comandas abertas da mesa, comanda junta ou separada + contato, para levar + contato, cardápio por categoria, foto do prato, opções do prato, revisar pedido, pedido enviado, minha comanda, fechar conta.
- Telas da equipe: login, Pedidos (contas para fechar, resumo do mês, comandas por dia), Relatório, Cardápio (categorias, pratos, opções), Estoque, WhatsApp, QR Codes, Configurações.

## Capabilities and Constraints

- Next.js + Supabase; todo o front em `app/page.js` e `app/admin/page.js` com CSS em `app/globals.css`.
- Status de pedido: recebido, em preparo, pronto, entregue, cancelado.
- Valores de vendas ficam ocultos por padrão no painel.
- Recibo térmico tem layout próprio e não deve mudar.
- Nome da loja e logo são configuráveis pelo painel.

## Brand Commitments

- Cor vinho/vermelho terroso (#a3352b e família) é a assinatura e deve permanecer.
- Logo: talheres cruzados sobre um globo, dourado sobre vermelho, com "Cozinha", "بلا حدود" e "SEM FRONTEIRAS" (`public/uploads/logo-1790120827897.jpeg`).
- Simplicidade para o cliente: poucos toques do QR Code até o pedido enviado.

## Evidence on Hand

- Logo e uma foto de prato em `public/uploads/`. Não há fotos de ambiente, depoimentos nem números de clientes; não inventar.

## Product Principles

1. O cliente nunca deve se perder: um próximo passo óbvio em cada tela.
2. Pedido novo é impossível de ignorar no painel, mas sem caos visual permanente.
3. Mesma ação, mesmo lugar, nos dois tamanhos de tela da equipe.
4. Estoque e disponibilidade são verdade em tempo real; o cliente não pede o que acabou.

## Accessibility & Inclusion

Uso em celular com uma mão e em salão com pouca luz: alvos de toque ≥ 44 px, contraste AA, texto legível sem zoom.

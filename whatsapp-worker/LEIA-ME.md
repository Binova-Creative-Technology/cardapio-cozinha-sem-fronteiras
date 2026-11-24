# Programa do WhatsApp (agradecimento depois que o cliente paga)

Este programa fica ligado **no computador do restaurante**. Ele pega no sistema as mensagens de agradecimento que estão na
fila e manda pelo WhatsApp que você conectou com um QR Code. O site (na Vercel) não consegue fazer isso sozinho, por isso
existe este programa à parte.

## Antes de começar (leia, é importante)

- **Método não oficial.** Conectar o WhatsApp por QR Code e mandar mensagens por programa **não é permitido pelas regras do
  WhatsApp**. Existe risco de o número ser **bloqueado**, principalmente se mandar para quem nunca falou com você.
  Por isso o programa só manda para quem **informou o próprio número**, **uma mensagem por conta**, com pausas e um limite por
  hora.
- **Use de preferência um número só do restaurante** (um chip/WhatsApp Business dedicado), não o seu pessoal.
- O computador precisa ficar **ligado, com internet** e com este programa **aberto**. Se estiver desligado, as mensagens
  esperam na fila e saem quando ele voltar (depois de 3 tentativas com falha, a mensagem fica marcada com erro).
- O cliente é avisado na tela de que, se informar o WhatsApp, receberá uma mensagem de agradecimento (e pode deixar em branco).

## Instalação (uma vez só)

1. Instale o **Node.js** (versão 18 ou mais nova) se ainda não tiver: https://nodejs.org
2. Nesta pasta (`whatsapp-worker`), **copie** o arquivo `.env.exemplo` e renomeie a cópia para `.env`.
3. Abra o `.env` no Bloco de Notas e preencha:
   - `SISTEMA_URL`: o endereço do site (já vem preenchido).
   - `CHAVE`: copie na aba **WhatsApp** do painel, no quadro "Como instalar o programa do WhatsApp" (campo *Chave de acesso*).
4. Dê dois cliques em **`iniciar.bat`**. Na primeira vez ele instala o que falta (precisa de internet) e abre.

## Conectar o WhatsApp (uma vez só)

1. Com o programa aberto, entre no painel do restaurante → aba **WhatsApp**.
2. Vai aparecer um **QR Code**. No celular: WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** → aponte a câmera.
3. Quando aparecer **"✔ WhatsApp conectado"**, está pronto. A conexão fica salva na pasta `auth` (não apague, não envie para
   ninguém); nas próximas vezes não precisa ler o QR de novo.

## Configurar a mensagem

Na aba **WhatsApp** do painel: cole o link para avaliar no Google, o link do Instagram, ajuste o texto, marque
**Enviar automaticamente** e clique em **Salvar**. Use **Enviar mensagem de teste** com o seu número para ver como chega.

## Como funciona no dia a dia

1. O cliente informa nome e WhatsApp ao abrir a comanda (o WhatsApp é opcional).
2. Quando você clica em **Concluído** na conta paga, a mensagem entra na fila.
3. Este programa envia em poucos segundos (com uma pausa de 20 a 45 segundos entre uma mensagem e outra, no máximo 20 por hora).
4. A aba **WhatsApp** mostra cada mensagem como *na fila*, *enviada ✔* ou *erro* (com o motivo e o botão **Tentar de novo**).

## Deixar abrir sozinho quando o computador ligar (opcional)

Aperte `Windows + R`, digite `shell:startup`, Enter, e coloque ali um **atalho** para o `iniciar.bat`.

## Problemas comuns

| O que aparece | O que fazer |
| --- | --- |
| Painel diz "O programa do WhatsApp não está ligado" | Abra o `iniciar.bat` e deixe a janela aberta. |
| "Chave de acesso recusada" | Copie a chave de novo do painel para o `.env`. |
| Pediu QR de novo | Alguém saiu do aparelho no celular. Leia o QR de novo. |
| Mensagem com erro "não tem WhatsApp" | O número que o cliente digitou não tem WhatsApp. |

# Deixar o programa do WhatsApp sempre ligado no Railway

Assim ele não depende do computador do restaurante: roda na nuvem 24 horas, reinicia sozinho se cair e a conexão com o
WhatsApp fica guardada num "volume" (você lê o QR **uma vez só**).

> **Importante:** use **só um** lugar de cada vez. Se for usar o Railway, **feche o `iniciar.bat`** do computador (dois
> programas com o mesmo WhatsApp se derrubam).

## O que muda em relação ao computador

- **Custo:** o Railway é pago (o plano Hobby custa uns US$ 5 por mês, com o uso incluído; confira o preço atual no site).
- **Risco de bloqueio do número:** continua sendo o método não oficial do WhatsApp. Rodando em servidor na nuvem (IP de
  datacenter) o risco é **um pouco maior** do que no computador do restaurante. Use um número dedicado ao restaurante e
  mantenha os limites padrão do programa.
- O QR Code continua aparecendo **na aba WhatsApp do painel** (não precisa de tela nenhuma no Railway).

## Passo a passo

1. Entre em https://railway.com e faça login com o GitHub.
2. **New Project → Deploy from GitHub repo** e escolha o repositório `cardapio-cozinha-sem-fronteiras`.
3. Abra o serviço criado → **Settings → Source → Root Directory** e coloque: `whatsapp-worker`
   (sem isso o Railway tenta publicar o site inteiro).
4. Ainda em **Settings**, confira que o comando de início é `node index.js` (já vem do arquivo `railway.json`).
5. Aba **Variables**, crie estas três:

   | Nome | Valor |
   | --- | --- |
   | `SISTEMA_URL` | `https://restaurante.emporiosemfronteiras.com.br` |
   | `CHAVE` | a *Chave de acesso* que aparece na aba **WhatsApp** do painel |
   | `AUTH_DIR` | `/data/auth` |

6. **Volume (essencial):** no serviço, clique em **+ Add → Volume** (ou clique com o botão direito na tela do projeto →
   *Volume*) e monte em **`/data`**. É onde a conexão do WhatsApp fica guardada; sem ele, a cada reinício seria preciso ler
   o QR de novo.
7. Faça o **Deploy**. Em alguns instantes o painel (aba **WhatsApp**) mostra o **QR Code**.
8. No celular: WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** → leia o QR.
9. Quando aparecer **"✔ WhatsApp conectado"**, pronto. Use **Enviar mensagem de teste** para conferir.

## Dia a dia

- Nada a fazer: ele fica ligado sozinho. Atualizações do programa saem quando você publica uma nova versão no GitHub
  (o Railway publica sozinho se estiver ligado ao repositório).
- Veja o que está acontecendo em **Deployments → View logs** no Railway (cada mensagem enviada aparece lá).
- Para parar o envio sem desligar nada: desmarque **Enviar automaticamente** na aba WhatsApp do painel.
- Se o WhatsApp pedir QR de novo (alguém saiu do aparelho pelo celular), o programa gera um QR novo sozinho; é só ler outra vez.

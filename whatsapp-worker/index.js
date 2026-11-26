// Programa que envia no WhatsApp as mensagens de agradecimento do sistema do restaurante.
// Roda no computador do restaurante (precisa ficar ligado e com internet).
//
//  1. Busca no sistema a próxima mensagem da fila.
//  2. Manda pelo WhatsApp que você conectou com o QR Code (mostrado na aba "WhatsApp" do painel).
//  3. Avisa o sistema se deu certo.
//
// Leia o LEIA-ME.md antes de usar.

const fs = require('fs');
const http = require('http');
const path = require('path');
const pino = require('pino');
const baileys = require('@whiskeysockets/baileys');

const makeWASocket = baileys.default || baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

// ---------------------------------------------------------------------------
// Configuração (arquivo .env nesta pasta)
// ---------------------------------------------------------------------------
function lerEnv() {
  const caminho = path.join(__dirname, '.env');
  const valores = {};
  if (fs.existsSync(caminho)) {
    for (const linha of fs.readFileSync(caminho, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return valores;
}

const env = { ...lerEnv(), ...process.env };
const SISTEMA_URL = String(env.SISTEMA_URL || '').replace(/\/+$/, '');
const CHAVE = String(env.CHAVE || '');
// Limites para não parecer robô e reduzir o risco de bloqueio do número
const MAX_POR_HORA = Number(env.MAX_POR_HORA) || 20;
const PAUSA_MIN_S = Number(env.PAUSA_MIN_S) || 20;
const PAUSA_MAX_S = Number(env.PAUSA_MAX_S) || 45;

if (!SISTEMA_URL || !CHAVE) {
  console.error('Faltou configurar. Copie o arquivo ".env.exemplo" para ".env" e preencha SISTEMA_URL e CHAVE (veja o LEIA-ME.md).');
  process.exit(1);
}

// Onde fica a sessão do WhatsApp. Na nuvem (Railway) aponte AUTH_DIR para o volume, ex: /data/auth
const PASTA_AUTH = env.AUTH_DIR ? path.resolve(env.AUTH_DIR) : path.join(__dirname, 'auth');

// Apaga o conteúdo da pasta (e não a pasta em si, que pode ser um volume montado)
function limparSessao() {
  try {
    for (const nome of fs.readdirSync(PASTA_AUTH)) {
      fs.rmSync(path.join(PASTA_AUTH, nome), { recursive: true, force: true });
    }
  } catch {
    // pasta ainda não existe: nada a limpar
  }
}
const logger = pino({ level: 'silent' });

function log(...partes) {
  console.log(new Date().toLocaleString('pt-BR'), '-', ...partes);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Espera até `ms` ou até o sistema avisar (webhook POST /acordar) que entrou mensagem na fila.
let acordar = () => {};
const esperarOuAcordar = (ms) =>
  new Promise((r) => {
    const t = setTimeout(r, ms);
    acordar = () => {
      clearTimeout(t);
      r();
    };
  });
const aleatorio = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

// ---------------------------------------------------------------------------
// Conversa com o sistema do restaurante
// ---------------------------------------------------------------------------
async function sistema(caminho, opcoes = {}) {
  const resp = await fetch(SISTEMA_URL + caminho, {
    ...opcoes,
    headers: { Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
  });
  if (resp.status === 401) throw new Error('Chave de acesso recusada. Confira a CHAVE no arquivo .env (copie de novo do painel).');
  if (!resp.ok) throw new Error('Sistema respondeu ' + resp.status);
  return resp.json();
}

let estado = 'iniciando'; // iniciando | aguardando_qr | conectado | desconectado
let qrAtual = '';
let numeroConectado = '';

async function reportarEstado() {
  try {
    await sistema('/api/whatsapp/worker/estado', {
      method: 'POST',
      body: JSON.stringify({ status: estado, qr: qrAtual, numero: numeroConectado }),
    });
  } catch (err) {
    log('Não consegui avisar o sistema:', err.message);
  }
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------
let sock = null;
let reconectando = false;

async function conectar() {
  reconectando = false;
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_AUTH);
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    // usa a versão embutida na biblioteca
  }

  estado = 'iniciando';
  qrAtual = '';
  await reportarEstado();

  sock = makeWASocket({
    auth: state,
    version,
    logger,
    printQRInTerminal: false,
    browser: ['Cozinha Sem Fronteiras', 'Chrome', '1.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      estado = 'aguardando_qr';
      qrAtual = qr;
      log('Aguardando você ler o QR Code na aba WhatsApp do painel.');
      await reportarEstado();
    }

    if (connection === 'open') {
      estado = 'conectado';
      qrAtual = '';
      numeroConectado = String(sock.user?.id || '').split(':')[0].split('@')[0];
      log('WhatsApp conectado (número ' + numeroConectado + ').');
      await reportarEstado();
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      estado = 'desconectado';
      qrAtual = '';
      await reportarEstado();

      if (codigo === DisconnectReason.loggedOut) {
        // saiu pelo celular ("Aparelhos conectados" -> sair): apaga a sessão e pede um QR novo
        log('O WhatsApp foi desconectado pelo celular. Vou gerar um QR Code novo.');
        limparSessao();
        numeroConectado = '';
      } else {
        log('Conexão caiu (código ' + codigo + '). Reconectando...');
      }
      if (!reconectando) {
        reconectando = true;
        await dormir(4000);
        conectar().catch((err) => log('Erro ao reconectar:', err.message));
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Envio das mensagens da fila
// ---------------------------------------------------------------------------
const enviadasNaHora = []; // horários (ms) dos envios da última hora

function podeEnviarAgora() {
  const umaHoraAtras = Date.now() - 3600000;
  while (enviadasNaHora.length && enviadasNaHora[0] < umaHoraAtras) enviadasNaHora.shift();
  return enviadasNaHora.length < MAX_POR_HORA;
}

async function enviarUma() {
  if (estado !== 'conectado' || !sock) return false;
  if (!podeEnviarAgora()) return false;

  const { mensagem } = await sistema('/api/whatsapp/worker/proxima');
  if (!mensagem) return false;

  const relatar = (corpo) =>
    sistema('/api/whatsapp/worker/resultado', { method: 'POST', body: JSON.stringify({ id: mensagem.id, ...corpo }) }).catch((err) =>
      log('Não consegui relatar o resultado:', err.message),
    );

  try {
    const consulta = await sock.onWhatsApp(mensagem.telefone + '@s.whatsapp.net');
    const alvo = Array.isArray(consulta) ? consulta[0] : null;
    if (!alvo || !alvo.exists) {
      log('Número sem WhatsApp:', mensagem.telefone);
      await relatar({ ok: false, definitivo: true, erro: 'Esse número não tem WhatsApp.' });
      return true;
    }

    // "digitando..." por alguns segundos, como uma pessoa
    try {
      await sock.presenceSubscribe(alvo.jid);
      await sock.sendPresenceUpdate('composing', alvo.jid);
      await dormir(aleatorio(2000, 4500));
      await sock.sendPresenceUpdate('paused', alvo.jid);
    } catch {
      // presença é só enfeite; segue sem ela
    }

    await sock.sendMessage(alvo.jid, { text: mensagem.texto });
    enviadasNaHora.push(Date.now());
    log('Mensagem enviada para ' + mensagem.telefone + '.');
    await relatar({ ok: true });
  } catch (err) {
    log('Falha ao enviar para ' + mensagem.telefone + ':', err.message);
    await relatar({ ok: false, erro: err.message });
  }
  return true;
}

async function lacoDeEnvio() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let enviou = false;
    try {
      enviou = await enviarUma();
    } catch (err) {
      log('Erro no envio:', err.message);
    }
    // depois de enviar, espera um tempo aleatório antes da próxima (não dá para pular: parece robô).
    // Sem nada na fila, espera o aviso do sistema (webhook) ou olha de novo em 2 min, por garantia.
    if (enviou) await dormir(aleatorio(PAUSA_MIN_S, PAUSA_MAX_S) * 1000);
    else await esperarOuAcordar(120000);
  }
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
log('Programa do WhatsApp iniciado. Sistema:', SISTEMA_URL);

// sinal de vida (o painel considera o programa "ligado" se ouvir isso a cada minuto)
setInterval(reportarEstado, 30000);

conectar().catch((err) => {
  log('Erro ao iniciar:', err.message);
  process.exit(1);
});
lacoDeEnvio();

// Webhook: o sistema chama POST /acordar (com a mesma chave) quando coloca mensagem na fila.
// Só sobe se houver PORT (no Railway); no computador do restaurante continua só com a checagem.
if (env.PORT) {
  http
    .createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/acordar' && req.headers.authorization === 'Bearer ' + CHAVE) {
        acordar();
        res.writeHead(204).end();
      } else {
        res.writeHead(req.url === '/' ? 200 : 404).end();
      }
    })
    .listen(Number(env.PORT), '::', () => log('Aguardando avisos do sistema na porta ' + env.PORT + '.'));
}

process.on('SIGINT', async () => {
  estado = 'desconectado';
  await reportarEstado();
  process.exit(0);
});
process.on('unhandledRejection', (err) => log('Erro não tratado:', err && err.message ? err.message : err));

import { AwsClient } from 'aws4fetch';

// Fotos e logo num bucket S3 do Railway (privado). O app entrega os arquivos em /api/fotos/<nome>.
// Mesma forma que o Storage do Supabase usa nas rotas: from(bucket).upload/remove/getPublicUrl.

export const NOME_VALIDO = /^[A-Za-z0-9._-]{1,200}$/;

let s3 = null;
function cliente() {
  if (!s3) {
    s3 = new AwsClient({
      accessKeyId: process.env.BUCKET_ACCESS_KEY_ID,
      secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY,
      service: 's3',
      region: process.env.BUCKET_REGION || 'auto',
    });
  }
  return s3;
}

// virtual-host: https://<bucket>.<host>/<arquivo>
function urlDo(nome) {
  const base = new URL(process.env.BUCKET_ENDPOINT);
  return `${base.protocol}//${process.env.BUCKET_NAME}.${base.host}/${encodeURIComponent(nome)}`;
}

export async function baixarArquivo(nome) {
  if (!NOME_VALIDO.test(nome)) return null;
  const r = await cliente().fetch(urlDo(nome));
  return r.ok ? r : null;
}

export const armazenamentoBucket = {
  from: () => ({
    async upload(nome, bytes, { contentType } = {}) {
      if (!NOME_VALIDO.test(nome)) return { error: { message: 'Nome de arquivo inválido.' } };
      // assina e envia o corpo inteiro com content-length: no servidor do Next um Request assinado
      // sairia em pedaços (chunked) e o bucket recusa com 411
      const assinado = await cliente().sign(urlDo(nome), {
        method: 'PUT',
        headers: { 'content-type': contentType || 'application/octet-stream' },
        body: bytes, // entra no hash da assinatura
      });
      const r = await fetch(assinado.url, { method: 'PUT', headers: assinado.headers, body: bytes });
      return r.ok ? { error: null } : { error: { message: `Falha ao salvar a foto (${r.status}).` } };
    },
    async remove(nomes) {
      for (const nome of nomes) {
        if (NOME_VALIDO.test(nome)) await cliente().fetch(urlDo(nome), { method: 'DELETE' }).catch(() => {});
      }
      return { error: null };
    },
    getPublicUrl: (nome) => ({ data: { publicUrl: `/api/fotos/${nome}` } }),
  }),
};

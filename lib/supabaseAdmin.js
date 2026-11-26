import { createClient } from '@supabase/supabase-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { armazenamentoBucket } from './armazenamento';

// Cliente do banco — acesso total. Só pode ser importado em código que roda no
// servidor (app/api/**), nunca em componentes de cliente ("use client").
//
// Dois modos:
// - POSTGREST_URL definido (Railway): fala direto com o PostgREST da rede privada.
// - senão (Supabase): NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
let client = null;

// Sem BUCKET_NAME (ex.: teste local) o upload responde erro amigável.
// Com BUCKET_NAME as fotos vão para o bucket do Railway (lib/armazenamento.js).
const semArmazenamento = {
  from: () => ({
    upload: async () => ({ error: { message: 'Envio de fotos desativado temporariamente.' } }),
    remove: async () => ({ error: null }),
    getPublicUrl: () => ({ data: { publicUrl: '' } }),
  }),
};

export function supabaseAdmin() {
  if (client) return client;

  if (process.env.POSTGREST_URL) {
    const rest = new PostgrestClient(process.env.POSTGREST_URL);
    client = {
      from: (tabela) => rest.from(tabela),
      rpc: (fn, args) => rest.rpc(fn, args),
      storage: process.env.BUCKET_NAME ? armazenamentoBucket : semArmazenamento,
    };
    return client;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Banco não configurado: defina POSTGREST_URL, ou NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export const UPLOADS_BUCKET = 'csf-uploads';

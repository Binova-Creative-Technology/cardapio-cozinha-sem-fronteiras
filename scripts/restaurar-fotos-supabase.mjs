// Traz as fotos dos pratos do Storage do Supabase para o bucket do Railway.
// Usa a tabela csf_fotos_supabase (prato_id, foto) criada na migração.
// Rodar quando o Storage do Supabase voltar a responder:
//   railway run -s app node scripts/restaurar-fotos-supabase.mjs "<DATABASE_PUBLIC_URL do Postgres do Railway>"
import pg from 'pg';
import { armazenamentoBucket } from '../lib/armazenamento.js';

const db = new pg.Client({ connectionString: process.argv[2], ssl: { rejectUnauthorized: false } });
await db.connect();
const bucket = armazenamentoBucket.from('csf-uploads');
const { rows } = await db.query('select prato_id, foto from csf_fotos_supabase order by prato_id');

let ok = 0;
for (const { prato_id, foto } of rows) {
  const nome = foto.split('/').pop();
  const r = await fetch(foto);
  if (!r.ok) { console.log(`prato ${prato_id}: Supabase respondeu ${r.status}, pulei`); continue; }
  const { error } = await bucket.upload(nome, new Uint8Array(await r.arrayBuffer()), { contentType: r.headers.get('content-type') || 'image/jpeg' });
  if (error) { console.log(`prato ${prato_id}: ${error.message}`); continue; }
  // só preenche se ninguém colocou outra foto nesse meio tempo
  await db.query(`update csf_pratos set foto = $1 where id = $2 and coalesce(foto, '') = ''`, [`/api/fotos/${nome}`, prato_id]);
  await db.query('delete from csf_fotos_supabase where prato_id = $1', [prato_id]);
  ok++;
}
console.log(`${ok} de ${rows.length} fotos restauradas.`);
await db.end();

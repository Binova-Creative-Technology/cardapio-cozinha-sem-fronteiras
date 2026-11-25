// Diminui a foto no navegador antes de enviar. Fotos de celular têm vários MB e cada cliente
// baixa todas elas: isso estoura o limite de tráfego do banco. (Usar só em código de navegador.)
export async function reduzirImagem(arquivo, { maximo = 900, qualidade = 0.8, tipo = 'image/jpeg' } = {}) {
  // SVG e GIF (animado) ficam como estão
  if (!arquivo || arquivo.type === 'image/svg+xml' || arquivo.type === 'image/gif') return arquivo;
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (tipo === 'image/jpeg') {
      // JPEG não tem transparência: fundo branco
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, largura, altura);
    }
    ctx.drawImage(bitmap, 0, 0, largura, altura);

    const blob = await new Promise((ok) => canvas.toBlob(ok, tipo, qualidade));
    if (!blob || blob.size >= arquivo.size) return arquivo; // já era menor
    const extensao = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `foto.${extensao}`, { type: blob.type });
  } catch {
    return arquivo; // navegador não conseguiu ler: envia o original
  }
}

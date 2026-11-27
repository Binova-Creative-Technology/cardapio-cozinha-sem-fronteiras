// Título e descrição que aparecem na prévia quando o link do cardápio é enviado no WhatsApp
export const metadata = {
  title: 'Cardápio — Cozinha Sem Fronteiras',
  description: 'Veja nosso cardápio com fotos e preços.',
  openGraph: {
    title: 'Cardápio — Cozinha Sem Fronteiras',
    description: 'Veja nosso cardápio com fotos e preços.',
    type: 'website',
    locale: 'pt_BR',
  },
};

export default function CardapioLayout({ children }) {
  return children;
}

import './globals.css';

export const metadata = {
  title: 'AgentAZ - Assistente de IA',
  description: 'Assistente de inteligência artificial powered by Azure AI. Converse com nosso agente inteligente para obter respostas rápidas e precisas.',
  keywords: 'IA, inteligência artificial, chatbot, Azure AI, assistente virtual',
  openGraph: {
    title: 'AgentAZ - Assistente de IA',
    description: 'Assistente de inteligência artificial powered by Azure AI.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

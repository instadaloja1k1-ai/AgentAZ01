import { NextResponse } from 'next/server';

const SYSTEM_PROMPT = `Você é o AgentAZ, um assistente de inteligência artificial amigável e prestativo. 
Você responde em Português do Brasil de forma clara, objetiva e educada.
Você pode ajudar com diversos assuntos como programação, escrita, análise, matemática, e conversas gerais.
Sempre seja útil e, quando não souber algo, admita honestamente.`;

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, settings } = body;

    // Use settings from request or environment variables
    const endpoint = settings?.endpoint || process.env.AZURE_ENDPOINT;
    const apiKey = settings?.apiKey || process.env.AZURE_API_KEY;
    const deploymentName = settings?.deploymentName || process.env.AZURE_DEPLOYMENT_NAME;
    const apiVersion = settings?.apiVersion || process.env.AZURE_API_VERSION || '2024-06-01';

    // If Azure is not configured, return a helpful mock response
    if (!endpoint || !apiKey || !deploymentName) {
      return NextResponse.json({
        message: getMockResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    // Build Azure OpenAI API URL
    const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

    const azureMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.slice(-20), // Keep last 20 messages for context
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: azureMessages,
        max_tokens: 2048,
        temperature: 0.7,
        top_p: 0.95,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Azure API Error:', response.status, errorData);
      return NextResponse.json(
        { error: `Erro na API do Azure (${response.status}). Verifique suas configurações.` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || 'Sem resposta do modelo.';

    return NextResponse.json({ message: assistantMessage });
  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor. Tente novamente.' },
      { status: 500 }
    );
  }
}

// Mock responses when Azure is not configured
function getMockResponse(userMessage) {
  const msg = userMessage.toLowerCase();

  if (msg.includes('olá') || msg.includes('oi') || msg.includes('hey') || msg.includes('hello')) {
    return 'Olá! 👋 Sou o AgentAZ, seu assistente de IA. Estou funcionando em modo de demonstração porque o Azure AI ainda não foi configurado.\n\nPara me conectar ao Azure AI, clique em ⚙️ Configurações e preencha seus dados do Azure OpenAI.\n\nEnquanto isso, posso responder com mensagens pré-definidas para demonstrar a interface!';
  }

  if (msg.includes('configurar') || msg.includes('config') || msg.includes('azure') || msg.includes('conectar')) {
    return '⚙️ **Como configurar o Azure AI:**\n\n1. Acesse o [Azure Portal](https://portal.azure.com)\n2. Crie um recurso de Azure OpenAI\n3. Faça o deploy de um modelo (ex: GPT-4)\n4. Copie o **Endpoint** e a **Chave da API**\n5. Clique em ⚙️ Configurações aqui no chat\n6. Preencha os campos e clique em Salvar\n\n💡 Você também pode configurar via variáveis de ambiente na Vercel!';
  }

  if (msg.includes('python') || msg.includes('programação') || msg.includes('código') || msg.includes('programa')) {
    return '💻 **Programação com Python**\n\nPython é uma linguagem excelente para começar! Aqui está um exemplo simples:\n\n```python\n# Olá Mundo\nprint("Olá, mundo!")\n\n# Uma função simples\ndef saudacao(nome):\n    return f"Olá, {nome}! Bem-vindo ao Python!"\n\nprint(saudacao("Desenvolvedor"))\n```\n\n⚠️ *Estou em modo demonstração. Configure o Azure AI para respostas completas e personalizadas!*';
  }

  if (msg.includes('email') || msg.includes('e-mail') || msg.includes('escrever')) {
    return '📧 **Modelo de E-mail Profissional:**\n\nAssunto: [Sua necessidade]\n\nPrezado(a) [Nome],\n\nEspero que esteja bem. Escrevo para [motivo do contato].\n\n[Conteúdo principal da mensagem]\n\nAguardo seu retorno.\n\nAtenciosamente,\n[Seu nome]\n\n⚠️ *Estou em modo demonstração. Configure o Azure AI para gerar e-mails personalizados!*';
  }

  return '🤖 Obrigado pela sua mensagem! Estou operando em **modo demonstração** pois o Azure AI ainda não foi configurado.\n\nPara aproveitar todo o meu potencial:\n1. Clique em ⚙️ **Configurações**\n2. Insira seus dados do Azure OpenAI\n3. Comece a conversar com IA de verdade!\n\nExperimente me perguntar sobre:\n- 💻 Programação\n- 📧 Escrita de e-mails\n- ⚙️ Como configurar o Azure AI\n- 👋 Dizer olá!';
}

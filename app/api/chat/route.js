import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, settings } = body;

    // Credentials loaded from environment variables (set in Vercel dashboard)\r\n    const endpoint = settings?.endpoint || process.env.AZURE_ENDPOINT;\r\n    const apiKey = settings?.apiKey || process.env.AZURE_API_KEY;\r\n    const agentId = settings?.agentId || process.env.AZURE_AGENT_ID;

    // If Azure is not configured, return a helpful mock response
    if (!endpoint || !apiKey) {
      return NextResponse.json({
        message: getMockResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    if (!agentId) {
      return NextResponse.json(
        { error: 'Agent ID não configurado. Vá em ⚙️ Configurações e preencha o Agent ID.' },
        { status: 400 }
      );
    }

    const baseUrl = endpoint.replace(/\/$/, '');
    const apiVersion = 'v1';
    const headers = {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    };

    // ── Step 1: Create a new thread ──
    const threadRes = await fetch(`${baseUrl}/threads?api-version=${apiVersion}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    if (!threadRes.ok) {
      const errText = await threadRes.text();
      console.error('Failed to create thread:', threadRes.status, errText);
      return NextResponse.json(
        { error: `Erro ao criar thread (${threadRes.status}). Verifique o Endpoint.` },
        { status: threadRes.status }
      );
    }

    const thread = await threadRes.json();
    const threadId = thread.id;

    // ── Step 2: Add conversation history to the thread ──
    const recentMessages = messages.slice(-10);
    for (const msg of recentMessages) {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      const addMsgRes = await fetch(
        `${baseUrl}/threads/${threadId}/messages?api-version=${apiVersion}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ role, content: msg.content }),
        }
      );
      if (!addMsgRes.ok) {
        console.warn(`Failed to add message (role: ${role}):`, await addMsgRes.text());
      }
    }

    // ── Step 3: Run the agent on the thread ──
    const runRes = await fetch(
      `${baseUrl}/threads/${threadId}/runs?api-version=${apiVersion}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ assistant_id: agentId }),
      }
    );

    if (!runRes.ok) {
      const errText = await runRes.text();
      console.error('Failed to create run:', runRes.status, errText);
      return NextResponse.json(
        { error: `Erro ao executar o agente (${runRes.status}). Verifique o Agent ID.` },
        { status: runRes.status }
      );
    }

    const run = await runRes.json();
    const runId = run.id;
    let status = run.status;

    // ── Step 4: Poll for completion (max ~60s) ──
    const maxPolls = 60;
    let polls = 0;
    while (['queued', 'in_progress', 'requires_action'].includes(status) && polls < maxPolls) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(
        `${baseUrl}/threads/${threadId}/runs/${runId}?api-version=${apiVersion}`,
        { method: 'GET', headers }
      );
      if (!pollRes.ok) {
        console.error('Poll failed:', pollRes.status);
        break;
      }
      const pollData = await pollRes.json();
      status = pollData.status;
      polls++;
    }

    if (status !== 'completed') {
      console.error('Run did not complete. Final status:', status);
      return NextResponse.json(
        { error: `O agente não conseguiu responder (status: ${status}). Tente novamente.` },
        { status: 500 }
      );
    }

    // ── Step 5: Retrieve the assistant's response ──
    const listRes = await fetch(
      `${baseUrl}/threads/${threadId}/messages?api-version=${apiVersion}&order=desc&limit=1`,
      { method: 'GET', headers }
    );

    if (!listRes.ok) {
      return NextResponse.json(
        { error: 'Erro ao buscar a resposta do agente.' },
        { status: 500 }
      );
    }

    const listData = await listRes.json();
    const assistantMsg = listData.data?.find((m) => m.role === 'assistant');
    const responseText =
      assistantMsg?.content?.[0]?.text?.value ||
      assistantMsg?.content?.[0]?.text ||
      'Sem resposta do agente.';

    // Cleanup: delete the thread (fire-and-forget)
    fetch(`${baseUrl}/threads/${threadId}?api-version=${apiVersion}`, {
      method: 'DELETE',
      headers,
    }).catch(() => {});

    return NextResponse.json({ message: responseText });
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

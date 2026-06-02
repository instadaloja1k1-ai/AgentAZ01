import { NextResponse } from 'next/server';

// Cache the agent instructions so we don't fetch on every request
let cachedInstructions = null;
let cachedModel = null;

async function getAgentDefinition(endpoint, apiKey, agentId) {
  if (cachedInstructions && cachedModel) {
    return { instructions: cachedInstructions, model: cachedModel };
  }

  try {
    const base = endpoint.replace(/\/$/, '');
    const res = await fetch(`${base}/agents/${agentId}?api-version=v1`, {
      method: 'GET',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error(`Agent fetch failed: ${res.status}`);

    const data = await res.json();
    const def  = data?.versions?.latest?.definition;

    cachedInstructions = def?.instructions || 'Você é um assistente útil e prestativo.';
    cachedModel        = def?.model        || 'gpt-4.1';

    return { instructions: cachedInstructions, model: cachedModel };
  } catch (err) {
    console.warn('Could not fetch agent definition, using defaults:', err.message);
    return {
      instructions: 'Você é um assistente útil e prestativo.',
      model: 'gpt-4.1',
    };
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages } = body;

    // All credentials come from server-side environment variables only
    const endpoint = process.env.AZURE_ENDPOINT;
    const apiKey   = process.env.AZURE_API_KEY;
    const agentId  = process.env.AZURE_AGENT_ID;
    // Azure OpenAI resource name (e.g. "projewt8-resource")
    const resource = process.env.AZURE_OPENAI_RESOURCE;

    if (!endpoint || !apiKey || !agentId || !resource) {
      console.error('Azure credentials not fully configured in environment variables.');
      return NextResponse.json(
        { error: 'O serviço está temporariamente indisponível. Tente novamente em instantes.' },
        { status: 503 }
      );
    }

    // ── Step 1: Get agent instructions & model ──
    const { instructions, model } = await getAgentDefinition(endpoint, apiKey, agentId);

    // ── Step 2: Build messages array with system prompt ──
    const recentMessages = messages.slice(-20);
    const chatMessages = [
      { role: 'system', content: instructions },
      ...recentMessages.map(m => ({ role: m.role, content: m.content })),
    ];

    // ── Step 3: Call Azure OpenAI Chat Completions ──
    const completionsUrl = `https://${resource}.openai.azure.com/openai/deployments/${model}/chat/completions?api-version=2024-10-21`;

    const completionsRes = await fetch(completionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: chatMessages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!completionsRes.ok) {
      const errText = await completionsRes.text();
      console.error('Chat completions failed:', completionsRes.status, errText);
      return NextResponse.json(
        { error: 'Não consegui gerar uma resposta. Tente novamente.' },
        { status: 503 }
      );
    }

    const completionsData = await completionsRes.json();
    const responseText =
      completionsData?.choices?.[0]?.message?.content ||
      'Não obtive resposta. Tente novamente.';

    return NextResponse.json({ message: responseText });

  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: 'Erro interno. Tente novamente em instantes.' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages } = body;

    // All credentials come from server-side environment variables only
    const endpoint = process.env.AZURE_ENDPOINT;
    const apiKey   = process.env.AZURE_API_KEY;
    const agentId  = process.env.AZURE_AGENT_ID;

    if (!endpoint || !apiKey || !agentId) {
      console.error('Azure credentials not configured in environment variables.');
      return NextResponse.json(
        { error: 'O serviço está temporariamente indisponível. Tente novamente em instantes.' },
        { status: 503 }
      );
    }

    const baseUrl    = endpoint.replace(/\/$/, '');
    const apiVersion = 'v1';
    const headers    = {
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
        { error: 'Não consegui iniciar a conversa. Tente novamente.' },
        { status: 503 }
      );
    }

    const thread   = await threadRes.json();
    const threadId = thread.id;

    // ── Step 2: Add conversation history (last 10 messages) ──
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

    // ── Step 3: Run the agent ──
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
        { error: 'Não consegui acionar o agente. Tente novamente.' },
        { status: 503 }
      );
    }

    const run    = await runRes.json();
    const runId  = run.id;
    let   status = run.status;

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
        { error: 'O agente demorou para responder. Tente novamente.' },
        { status: 504 }
      );
    }

    // ── Step 5: Retrieve the assistant's latest message ──
    const listRes = await fetch(
      `${baseUrl}/threads/${threadId}/messages?api-version=${apiVersion}&order=desc&limit=1`,
      { method: 'GET', headers }
    );

    if (!listRes.ok) {
      return NextResponse.json(
        { error: 'Erro ao buscar a resposta. Tente novamente.' },
        { status: 503 }
      );
    }

    const listData    = await listRes.json();
    const assistantMsg = listData.data?.find((m) => m.role === 'assistant');
    const responseText =
      assistantMsg?.content?.[0]?.text?.value ||
      assistantMsg?.content?.[0]?.text ||
      'Não obtive resposta. Tente novamente.';

    // Cleanup thread (fire-and-forget)
    fetch(`${baseUrl}/threads/${threadId}?api-version=${apiVersion}`, {
      method: 'DELETE',
      headers,
    }).catch(() => {});

    return NextResponse.json({ message: responseText });

  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: 'Erro interno. Tente novamente em instantes.' },
      { status: 500 }
    );
  }
}

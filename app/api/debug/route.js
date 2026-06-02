import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    AZURE_ENDPOINT: process.env.AZURE_ENDPOINT ? { exists: true, length: process.env.AZURE_ENDPOINT.length } : null,
    AZURE_API_KEY: process.env.AZURE_API_KEY ? { exists: true, length: process.env.AZURE_API_KEY.length } : null,
    AZURE_AGENT_ID: process.env.AZURE_AGENT_ID ? { exists: true, length: process.env.AZURE_AGENT_ID.length } : null,
    AZURE_OPENAI_RESOURCE: process.env.AZURE_OPENAI_RESOURCE ? { exists: true, length: process.env.AZURE_OPENAI_RESOURCE.length } : null,
    envKeys: Object.keys(process.env).filter(k => k.startsWith('AZURE_') || k.includes('RESOURCE')),
  });
}

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createModuleLogger } from '@/lib/logger';

const logger = createModuleLogger('openai-text');

export async function POST(req: Request) {
  try {
    const { model, instructions, input, messages } = await req.json();

    // If messages are provided, use them as input array
    // Initialize only during the request, not while Next.js collects build data.
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API is not configured' }, { status: 503 });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.create({
      model,
      input: messages || input,
      instructions: instructions,
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    logger.error(error, 'Error in /openai/text');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 
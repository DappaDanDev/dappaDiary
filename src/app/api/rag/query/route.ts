import { NextRequest, NextResponse } from 'next/server';
import { createRagAgent, queryRagAgent } from '@/lib/rag/agents/rag-agent';
import { findRelevantChunks } from '@/lib/rag/document-processor';
import { processRagQuery } from '@/lib/rag/lilypad-service';

export async function POST(req: NextRequest) {
  try {
    // Parse the request body
    const body = await req.json();
    const { documentId, query } = body;

    if (!documentId || !query) {
      return NextResponse.json(
        { error: 'Document ID and query are required' },
        { status: 400 }
      );
    }

    // Check if we should use the agent or direct RAG
    const useAgent = body.useAgent === true;

    let response: string;

    if (useAgent) {
      // Use the LangGraphJS agent
      const agent = createRagAgent(documentId);
      response = await queryRagAgent(agent, query);
    } else {
      // Use direct RAG without the agent
      const relevantChunks = await findRelevantChunks(documentId, query);
      const context = relevantChunks.map(({ chunkText, similarity }) => 
        `[Similarity Score: ${similarity.toFixed(2)}]\n${chunkText}`
      ).join('\n\n');
      
      response = await processRagQuery(query, context);
    }

    // Return the response
    return NextResponse.json({ response });
  } catch (error) {
    console.error('Error querying RAG system:', error);
    return NextResponse.json(
      { error: `Failed to query RAG system: ${error}` },
      { status: 500 }
    );
  }
} 
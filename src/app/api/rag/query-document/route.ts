import { NextRequest, NextResponse } from 'next/server';
import { findRelevantChunks } from '@/lib/rag/document-processor';

export async function POST(req: NextRequest) {
  try {
    // Parse the request body
    const body = await req.json();
    const { documentId, query, topK = 3 } = body;

    if (!documentId || !query) {
      return NextResponse.json(
        { error: 'Document ID and query are required' },
        { status: 400 }
      );
    }

    // Find relevant chunks using vector similarity search
    const relevantChunks = await findRelevantChunks(documentId, query, topK);

    // Format the results for the response
    const formattedChunks = relevantChunks.map(chunk => ({
      text: chunk.chunkText,
      similarity: chunk.similarity,
    }));

    // Return the relevant chunks with their similarity scores
    return NextResponse.json({
      documentId,
      query,
      chunks: formattedChunks
    });
  } catch (error) {
    console.error('Error querying document:', error);
    return NextResponse.json(
      { error: `Failed to query document: ${error}` },
      { status: 500 }
    );
  }
} 
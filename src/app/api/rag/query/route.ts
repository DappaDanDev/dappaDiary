"use server";

import { NextRequest, NextResponse } from 'next/server';
import { StorachaRAGFlow } from '@/lib/rag/agents/storacha-rag-flow';

// The document ID and chunk map CID from the terminal output
const DEFAULT_DOCUMENT_ID = "ec0427e4-7f3f-4b27-a768-7d8cb2aa7779";
const DEFAULT_CHUNK_MAP_CID = "bafkreiezoevub4p7zpkrb6xvlzbrfv3extdwyusco6exy3qie4mtnsuxjq";

/**
 * API endpoint for RAG queries
 * @param request The Next.js request object
 * @returns Response with the answer
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { query, documentId = DEFAULT_DOCUMENT_ID } = body;
    
    if (!query) {
      console.error("[RAG API] Missing query parameter");
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }
    
    console.log(`[RAG API] Processing query: "${query}" for document: ${documentId}`);
    
    // Create RAG flow with the correct chunk map CID
    const chunkMapCID = documentId === DEFAULT_DOCUMENT_ID 
      ? DEFAULT_CHUNK_MAP_CID 
      : body.chunkMapCID || DEFAULT_CHUNK_MAP_CID;
    
    const ragFlow = new StorachaRAGFlow(documentId, chunkMapCID);
    
    // Process the query
    const result = await ragFlow.query(query);
    
    // Return the result
    return NextResponse.json({
      answer: result.answer,
      documentId,
      chunkMapCID,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[RAG API] Error processing query:", error);
    return NextResponse.json(
      { 
        error: "Failed to process query", 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 
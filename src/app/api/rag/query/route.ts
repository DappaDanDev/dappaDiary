"use server";

import { NextRequest, NextResponse } from 'next/server';
import { StorachaRAGFlow } from '@/lib/rag/agents/storacha-rag-flow';

/**
 * API endpoint for RAG queries
 * @param request The Next.js request object
 * @returns Response with the answer
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { query, documentId } = body;
    
    if (!query) {
      console.error("[RAG API] Missing query parameter");
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }
    
    if (!documentId) {
      console.error("[RAG API] Missing documentId parameter");
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }
    
    console.log(`[RAG API] Processing query: "${query}" for document: ${documentId}`);
    
    // Create RAG flow with just the document ID
    // The StorachaRetriever will automatically look up the latest chunk map CID from the document registry
    const ragFlow = new StorachaRAGFlow(documentId, null);
    
    // Process the query
    const result = await ragFlow.query(query);
    
    // Log the complete result for debugging
    console.log(`[RAG API] Query result:`, JSON.stringify(result, null, 2));
    
    // Return the result
    return NextResponse.json({
      answer: result.answer,
      documentId,
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
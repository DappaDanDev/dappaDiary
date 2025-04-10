"use server";

import { NextRequest } from "next/server";
import { StorachaRAGFlow } from "@/lib/rag/agents/storacha-rag-flow";

// The document ID and chunk map CID from the terminal output
const DEFAULT_DOCUMENT_ID = "ec0427e4-7f3f-4b27-a768-7d8cb2aa7779";
const DEFAULT_CHUNK_MAP_CID = "bafkreiezoevub4p7zpkrb6xvlzbrfv3extdwyusco6exy3qie4mtnsuxjq";

/**
 * Streaming API endpoint for RAG queries
 * @param request The Next.js request object
 * @returns Streaming response with the answer
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { query, documentId = DEFAULT_DOCUMENT_ID } = body;
    
    if (!query) {
      console.error("[RAG Stream API] Missing query parameter");
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[RAG Stream API] Streaming response for query: "${query}" for document: ${documentId}`);
    
    // Create RAG flow with the correct chunk map CID
    const chunkMapCID = documentId === DEFAULT_DOCUMENT_ID 
      ? DEFAULT_CHUNK_MAP_CID 
      : body.chunkMapCID || DEFAULT_CHUNK_MAP_CID;
    
    const ragFlow = new StorachaRAGFlow(documentId, chunkMapCID);
    
    // Get the streaming response
    const stream = await ragFlow.streamQuery(query);
    
    // Create a readable stream
    const textEncoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send the preamble
          controller.enqueue(textEncoder.encode('event: start\ndata: {"status":"started"}\n\n'));
          
          // Stream each update
          for await (const chunk of stream) {
            // Send progress updates for retrieval 
            if (chunk.context) {
              controller.enqueue(
                textEncoder.encode(`event: context\ndata: ${JSON.stringify({
                  status: "context_retrieved",
                  contextSize: chunk.context.length,
                  documentId,
                  chunkMapCID
                })}\n\n`)
              );
            }
            
            // Send answer chunks as they come in
            if (chunk.answer) {
              controller.enqueue(
                textEncoder.encode(`event: answer\ndata: ${JSON.stringify({
                  status: "answer",
                  answer: chunk.answer
                })}\n\n`)
              );
            }
            
            // Send error updates
            if (chunk.error) {
              controller.enqueue(
                textEncoder.encode(`event: error\ndata: ${JSON.stringify({
                  status: "error",
                  error: chunk.error
                })}\n\n`)
              );
            }
          }
          
          // Send completion event
          controller.enqueue(textEncoder.encode('event: end\ndata: {"status":"completed"}\n\n'));
          controller.close();
        } catch (error) {
          console.error("[RAG Stream API] Error in stream controller:", error);
          controller.enqueue(
            textEncoder.encode(`event: error\ndata: ${JSON.stringify({
              status: "error",
              error: error instanceof Error ? error.message : String(error)
            })}\n\n`)
          );
          controller.close();
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("[RAG Stream API] Error processing streaming query:", error);
    return new Response(
      JSON.stringify({ 
        error: "Failed to process streaming query", 
        details: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Configuration for streaming (needed for Next.js Edge runtime)
export const config = {
  runtime: 'edge',
}; 
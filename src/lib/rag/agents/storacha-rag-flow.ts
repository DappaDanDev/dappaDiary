import { StateGraph, Annotation } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "openai";
import { StorachaRetriever } from "../storacha-retriever";
import { z } from "zod";

// Define interface for chunk data
interface ChunkData {
  documentId: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  embeddingModel: string;
  timestamp: string;
}

// Initialize Lilypad OpenAI client
const lilypadClient = new OpenAI({
  baseURL: 'https://anura-testnet.lilypad.tech/api/v1',
  apiKey: process.env.ANURA_API_KEY || 'placeholder-key',
});

// State definition using Annotations
const RAGStateAnnotation = Annotation.Root({
  question: Annotation<string>(),
  context: Annotation<ChunkData[]>(),
  answer: Annotation<string>(),
  error: Annotation<string | null>(),
});

// RAG prompt template with comprehensive instructions
const promptTemplate = ChatPromptTemplate.fromMessages([
  ["system", `You are a helpful assistant that answers questions based on the provided context. 
Your task is to answer questions using ONLY the information from the provided document chunks.
If the context doesn't contain enough information to answer the question, acknowledge this limitation and don't make up information.
Include specific details from the context to support your answer.
If quoting directly, cite the specific chunk number (e.g., "According to Chunk 3...").`],
  ["human", "{question}"],
  ["system", "Here is relevant context to help answer the question:\n\n{context}"],
  ["human", "Based on the context, answer my question thoroughly and accurately."]
]);

/**
 * StorachaRAGFlow - A LangGraphJS workflow for retrieving context from Storacha
 * and generating responses using Lilypad
 */
export class StorachaRAGFlow {
  private documentId: string;
  private fallbackChunkMapCID: string | null;
  private graph: any; // Using any type to avoid build errors
  private modelName: string;
  private maxTokens: number;
  
  /**
   * @param documentId The document ID to retrieve chunks from
   * @param fallbackChunkMapCID Optional fallback CID of the chunk map in Storacha
   * @param modelName The Lilypad model to use
   * @param maxTokens Maximum tokens for the response
   */
  constructor(
    documentId: string,
    fallbackChunkMapCID: string | null = null,
    modelName: string = "llama3.1:8b",
    maxTokens: number = 1000
  ) {
    this.documentId = documentId;
    this.fallbackChunkMapCID = fallbackChunkMapCID;
    this.modelName = modelName;
    this.maxTokens = maxTokens;
    
    // Initialize the graph
    this.graph = this.buildGraph();
  }
  
  /**
   * Build the LangGraph workflow
   */
  private buildGraph() {
    // Create a new state graph
    const graph = new StateGraph(RAGStateAnnotation)
      .addNode("retrieveContext", this.retrieveContextNode.bind(this))
      .addNode("generateResponse", this.generateResponseNode.bind(this))
      .addEdge("__start__", "retrieveContext")
      .addEdge("retrieveContext", "generateResponse")
      .addEdge("generateResponse", "__end__");
    
    return graph.compile();
  }
  
  /**
   * Node for retrieving relevant context from Storacha
   */
  private async retrieveContextNode(state: typeof RAGStateAnnotation.State) {
    console.log("[StorachaRAGFlow] Retrieving context for query:", state.question);
    
    try {
      // Create retriever with document ID and optional fallback chunk map CID
      // The retriever will automatically look up the latest chunk map CID from the document registry
      const retriever = new StorachaRetriever(this.documentId, this.fallbackChunkMapCID);
      const topChunks = await retriever.retrieveSimilarChunks(state.question, 3);
      
      console.log(`[StorachaRAGFlow] Retrieved ${topChunks.length} chunks`);
      
      if (topChunks.length === 0) {
        console.warn("[StorachaRAGFlow] No compatible chunks found - this may be due to embedding dimension mismatch");
        return {
          context: [],
          error: "No compatible chunks found - this may be due to embedding dimension mismatch between query and stored chunks"
        };
      }
      
      return { 
        context: topChunks,
        error: null
      };
    } catch (error) {
      console.error("[StorachaRAGFlow] Error in context retrieval:", error);
      
      // Return error in state
      return { 
        context: [],
        error: `Error retrieving context: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Node for generating a response using retrieved context
   */
  private async generateResponseNode(state: typeof RAGStateAnnotation.State) {
    console.log("[StorachaRAGFlow] Generating response with context");
    
    // If there was an error in retrieval, handle it
    if (state.error) {
      console.error(`[StorachaRAGFlow] Cannot generate response due to previous error: ${state.error}`);
      return { 
        answer: `I encountered an error while retrieving information: ${state.error}. Please try again later.`
      };
    }
    
    // If no context was found
    if (!state.context || state.context.length === 0) {
      console.warn("[StorachaRAGFlow] No context chunks retrieved");
      return { 
        answer: "I don't have enough information to answer that question based on the available documents."
      };
    }
    
    try {
      // Format context into a string
      const contextString = state.context
        .map(chunk => `Chunk ${chunk.chunkIndex}: ${chunk.text}`)
        .join("\n\n");
      
      // Log the formatted context
      console.log(`[StorachaRAGFlow] Formatted context (first 500 chars): ${contextString.substring(0, 500)}...`);
      console.log(`[StorachaRAGFlow] Context length: ${contextString.length} chars, ${state.context.length} chunks`);
      
      // Ensure context is not empty
      if (!contextString.trim()) {
        console.warn("[StorachaRAGFlow] Context is empty after formatting.");
        return { 
          answer: "I don't have enough information to answer that question based on the available documents."
        };
      }
      
      // Create a completely different approach to RAG context integration
      // Format the messages to follow standard RAG patterns
      const formattedContext = state.context
        .map((chunk, index) => `CHUNK ${chunk.chunkIndex}: ${chunk.text.trim()}`)
        .join("\n\n");
        
      const messages = [
        {
          role: "system" as const,
          content: `You are a helpful AI assistant that answers questions based only on the provided context. 
If the answer isn't in the context, admit you don't know. Don't make up information.`
        },
        {
          role: "user" as const,
          content: `Use the following context to answer my question. Only use information from these sources.

CONTEXT:
${formattedContext}

QUESTION: ${state.question}`
        }
      ];
      
      // Log the request for debugging
      console.log(`[StorachaRAGFlow] Calling Lilypad API with model: ${this.modelName}`);
      console.log(`[StorachaRAGFlow] Request payload:`, JSON.stringify({
        model: this.modelName,
        messages: messages,
        max_tokens: this.maxTokens,
        temperature: 0.2
      }, null, 2).substring(0, 1000) + "...");
      
      // Call Lilypad to generate response
      const response = await lilypadClient.chat.completions.create({
        model: this.modelName,
        messages: messages,
        max_tokens: this.maxTokens,
        temperature: 0.2
      });
      
      console.log(`[StorachaRAGFlow] Response received from Lilypad API`);
      console.log(`[StorachaRAGFlow] Response content: ${response.choices[0]?.message?.content}`);
      
      const responseContent = response.choices[0]?.message?.content || 
        "I couldn't generate a response based on the available information.";
      
      return { answer: responseContent };
    } catch (error) {
      console.error("[StorachaRAGFlow] Error generating response:", error);
      // Print more detailed error information
      if (error instanceof Error) {
        console.error("[StorachaRAGFlow] Error message:", error.message);
        console.error("[StorachaRAGFlow] Error stack:", error.stack);
        if ('status' in error) {
          console.error("[StorachaRAGFlow] Status code:", (error as any).status);
        }
      }
      
      return { 
        answer: `I encountered an error while generating a response: ${error instanceof Error ? error.message : String(error)}. Please try again later.`
      };
    }
  }
  
  /**
   * Query the RAG system
   * @param question The user's question
   * @returns Object containing the answer
   */
  async query(question: string) {
    console.log(`[StorachaRAGFlow] Processing query: "${question}"`);
    try {
      // Run the graph with the question
      const result = await this.graph.invoke({ 
        question,
        context: [],
        answer: "",
        error: null
      });
      
      return {
        answer: result.answer,
        questionProcessed: question,
        documentId: this.documentId,
        error: result.error
      };
    } catch (error) {
      console.error("[StorachaRAGFlow] Error in query execution:", error);
      return {
        answer: `An error occurred while processing your query: ${error instanceof Error ? error.message : String(error)}`,
        questionProcessed: question,
        documentId: this.documentId,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Stream the response from the RAG system
   * @param question The user's question
   * @returns Async generator of state updates
   */
  async streamQuery(question: string) {
    console.log(`[StorachaRAGFlow] Streaming response for query: "${question}"`);
    try {
      // Stream the response using any type to avoid linter errors
      return await this.graph.stream({ 
        question,
        context: [],
        answer: "",
        error: null
      }, {
        streamMode: "updates" // Only send updates to the state
      });
    } catch (error) {
      console.error("[StorachaRAGFlow] Error in stream execution:", error);
      
      // Create an ad-hoc generator to return the error
      async function* errorGenerator() {
        yield {
          error: error instanceof Error ? error.message : String(error),
          answer: `An error occurred while processing your query: ${error instanceof Error ? error.message : String(error)}`
        };
      }
      
      return errorGenerator();
    }
  }
} 
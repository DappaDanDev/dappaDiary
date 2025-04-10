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
  private chunkMapCID: string;
  private graph: any; // Using any type to avoid build errors
  private modelName: string;
  private maxTokens: number;
  
  /**
   * @param documentId The document ID to retrieve chunks from
   * @param chunkMapCID The CID of the chunk map in Storacha
   * @param modelName The Lilypad model to use
   * @param maxTokens Maximum tokens for the response
   */
  constructor(
    documentId: string,
    chunkMapCID: string,
    modelName: string = "anthropic/claude-3-haiku",
    maxTokens: number = 1000
  ) {
    this.documentId = documentId;
    this.chunkMapCID = chunkMapCID;
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
      // Create retriever and get relevant chunks
      const retriever = new StorachaRetriever(this.documentId, this.chunkMapCID);
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
      
      // Manually create the messages for OpenAI
      // Using type assertion to bypass TypeScript errors
      const messages = [
        {
          role: "system" as const,
          content: `You are a helpful assistant that answers questions based on the provided context. 
Your task is to answer questions using ONLY the information from the provided document chunks.
If the context doesn't contain enough information to answer the question, acknowledge this limitation and don't make up information.
Include specific details from the context to support your answer.
If quoting directly, cite the specific chunk number (e.g., "According to Chunk 3...").`
        },
        {
          role: "user" as const,
          content: state.question
        },
        {
          role: "system" as const,
          content: `Here is relevant context to help answer the question:\n\n${contextString}`
        },
        {
          role: "user" as const,
          content: "Based on the context, answer my question thoroughly and accurately."
        }
      ];
      
      // Call Lilypad to generate response
      const response = await lilypadClient.chat.completions.create({
        model: this.modelName,
        messages: messages as any, // Type assertion to bypass TypeScript errors
        max_tokens: this.maxTokens,
        temperature: 0.2, // Lower temperature for more factual responses
      });
      
      const responseContent = response.choices[0]?.message?.content || 
        "I couldn't generate a response based on the available information.";
      
      return { answer: responseContent };
    } catch (error) {
      console.error("[StorachaRAGFlow] Error generating response:", error);
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
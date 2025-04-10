import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { findRelevantChunks } from '../document-processor';
import { processRagQuery } from '../lilypad-service';
import { ChatOpenAI } from '@langchain/openai';

/**
 * RAG Agent interface
 */
interface RagAgent {
  query(question: string): Promise<string>;
  reset(): string;
  getMessages(): Array<HumanMessage | AIMessage | SystemMessage>;
}

/**
 * Create a RAG agent that processes queries
 * Uses direct API communication rather than LangGraphJS
 */
export function createRagAgent(documentId: string): RagAgent {
  // Initialize the OpenAI model with the Lilypad endpoint for completions
  const model = new ChatOpenAI({
    modelName: 'llama3.1:8b',
    configuration: {
      baseURL: 'https://anura-testnet.lilypad.tech/api/v1',
      apiKey: process.env.ANURA_API_KEY || 'placeholder-key',
    }
  });

  // Define the system message for the agent
  const systemMessage = new SystemMessage({
    content: `You are a helpful AI assistant that answers questions using the provided context 
from a document. Your goal is to provide accurate information based on the context.
If the answer isn't in the context, say you don't know. Don't make up information.`
  });

  // State to maintain across interactions
  let messages: Array<HumanMessage | AIMessage | SystemMessage> = [systemMessage];

  // Return the agent object with query method
  return {
    /**
     * Query the RAG agent with a user question
     */
    async query(question: string): Promise<string> {
      console.log(`Querying RAG agent with: "${question}"`);
      
      try {
        // Add the user query to messages
        const userMessage = new HumanMessage(question);
        messages.push(userMessage);
        
        // Step 1: Retrieve context from document
        console.log(`Retrieving context for query: "${question}" using documentId: ${documentId}`);
        const relevantChunks = await findRelevantChunks(documentId, question, 3);
        
        // Format context
        const context = relevantChunks.map(({ chunkText, similarity }) => 
          `[Similarity Score: ${similarity.toFixed(2)}]\n${chunkText}`
        ).join('\n\n');
        
        console.log(`Retrieved context length: ${context.length} characters`);
        
        // Step 2: Generate response using the context
        console.log(`Generating response with context length: ${context.length}`);
        const response = await processRagQuery(question, context);
        
        // Add AI response to messages
        const aiMessage = new AIMessage(response);
        messages.push(aiMessage);
        
        console.log(`Generated response length: ${response.length} characters`);
        return response;
      } catch (error) {
        console.error('Error in RAG agent:', error);
        const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
        
        // Add error message to conversation
        const aiMessage = new AIMessage(errorMessage);
        messages.push(aiMessage);
        
        return errorMessage;
      }
    },
    
    /**
     * Reset the conversation history
     */
    reset(): string {
      messages = [systemMessage];
      return "Conversation history has been reset.";
    },
    
    /**
     * Get the current conversation history
     */
    getMessages(): Array<HumanMessage | AIMessage | SystemMessage> {
      return [...messages];
    }
  };
}

/**
 * Query the RAG agent with a user question
 * Convenience wrapper around agent.query
 */
export async function queryRagAgent(agent: RagAgent, question: string): Promise<string> {
  return agent.query(question);
} 
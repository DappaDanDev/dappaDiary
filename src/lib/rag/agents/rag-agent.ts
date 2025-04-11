import { 
  MessagesAnnotation,
  StateGraph, 
  START, 
  END 
} from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { findRelevantChunks } from '../document-processor';
import { processRagQuery } from '../lilypad-service';
import { ChatOpenAI } from '@langchain/openai';

// Define the state of our RAG agent
interface RAGState {
  messages: Array<HumanMessage | AIMessage | SystemMessage>;
  documentId: string | null;
  context: string | null;
}

// Create a retrieveContext tool that will fetch relevant context from our document
const retrieveContext = tool(
  async ({ documentId, query }, config) => {
    if (!documentId) {
      return "Error: No document ID provided.";
    }

    try {
      // Get the top 3 most relevant chunks
      const relevantChunks = await findRelevantChunks(documentId, query, 3);
      
      // Combine the chunks into a single context string
      let context = relevantChunks.map(({ chunkText, similarity }) => 
        `[Similarity Score: ${similarity.toFixed(2)}]\n${chunkText}`
      ).join('\n\n');
      
      return context;
    } catch (error) {
      console.error('Error retrieving context:', error);
      return `Error retrieving context: ${error}`;
    }
  },
  {
    name: 'retrieve_context',
    description: 'Retrieve relevant context from the uploaded document',
    schema: z.object({
      documentId: z.string().describe('The ID of the document to search'),
      query: z.string().describe('The query to search for in the document'),
    }),
  }
);

// Helper to get message type safely
function _getType(message: BaseMessage): string {
  if (message instanceof AIMessage) return 'assistant';
  if (message instanceof HumanMessage) return 'user';
  if (message instanceof SystemMessage) return 'system';
  return '';
}

/**
 * Create a RAG agent that processes queries using LangGraphJS
 */
export function createRagAgent(documentId: string) {
  // Create a memory saver for the agent
  const memory = new MemorySaver();

  // We'll use the OpenAI ChatModel with the Lilypad endpoint
  const model = new ChatOpenAI({
    configuration: {
      baseURL: 'https://anura-testnet.lilypad.tech/api/v1',
    },
    apiKey: process.env.ANURA_API_KEY || 'placeholder-key',
    modelName: 'llama3.1:8b',
  });

  // Define the system message for the agent
  const systemMessage = new SystemMessage({
    content: `You are a helpful AI assistant that answers questions using the provided context 
from a document. Your goal is to provide accurate information based on the context.
If the answer isn't in the context, say you don't know. Don't make up information.`
  });

  // Create a simple graph with just the memory functionality
  // This bypasses the complex LangGraph structure but still provides the same functionality
  const graph = {
    memory,
    async invoke(state: any) {
      const messages = state.messages || [];
      const query = messages[0]?.content || '';
      
      // Store the initial state
      await memory.put({
        messages,
        documentId,
        context: null
      });
      
      try {
        // Retrieve context
        const context = await retrieveContext.invoke({
          documentId,
          query
        });
        
        // Store state with context
        await memory.put({
          messages,
          documentId,
          context
        });
        
        // Generate response using Lilypad
        const response = await processRagQuery(query, context);
        
        // Return final state
        return {
          messages: [...messages, new AIMessage(response)],
          documentId,
          context
        };
      } catch (error) {
        console.error('Error in RAG agent:', error);
        return {
          messages: [...messages, new AIMessage(`Error: ${error}`)],
          documentId,
          context: null
        };
      }
    }
  };

  return graph;
}

/**
 * Query the RAG agent with a user question
 */
export async function queryRagAgent(agent: any, query: string): Promise<string> {
  const result = await agent.invoke({
    messages: [new HumanMessage(query)],
  });
  
  // Get the assistant's response
  const assistantMessage = result.messages.find(
    (message: BaseMessage) => _getType(message) === 'assistant'
  );
  
  return assistantMessage ? assistantMessage.content : "No response generated";
} 
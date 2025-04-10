import { 
  MessagesAnnotation, 
  StateGraph, 
  START, 
  END 
} from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
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

// Function to decide which node to go to next
function decideNextStep(state: RAGState): "retrieve" | "generate" | typeof END {
  // If we don't have context yet, retrieve it
  if (!state.context) {
    return "retrieve";
  }
  
  // If we have context, generate a response
  if (state.context && !state.messages.some(m => m.role === 'assistant')) {
    return "generate";
  }
  
  // If we've already generated a response, we're done
  return END;
}

/**
 * Create a RAG agent that processes queries using LangGraphJS
 */
export function createRagAgent(documentId: string) {
  // Create a memory saver for the agent
  const memory = new MemorySaver();

  // We'll use the OpenAI ChatModel with the Lilypad endpoint
  const model = new ChatOpenAI({
    baseURL: 'https://anura-testnet.lilypad.tech/api/v1',
    apiKey: process.env.ANURA_API_KEY || 'placeholder-key',
    modelName: 'llama3.1:8b',
  });

  // Define the system message for the agent
  const systemMessage = new SystemMessage({
    content: `You are a helpful AI assistant that answers questions using the provided context 
from a document. Your goal is to provide accurate information based on the context.
If the answer isn't in the context, say you don't know. Don't make up information.`
  });

  // Node for retrieving context
  const retrieveContextNode = async (state: RAGState): Promise<Partial<RAGState>> => {
    if (!state.documentId) {
      return {
        messages: [
          ...state.messages,
          new AIMessage("Error: No document ID available for retrieval.")
        ]
      };
    }

    // Get the latest user message
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage.role !== 'user') {
      return {
        messages: [
          ...state.messages,
          new AIMessage("Error: Expected a user message.")
        ]
      };
    }

    // Use the retrieve_context tool to get relevant context
    const query = lastMessage.content as string;
    try {
      const context = await retrieveContext.invoke({
        documentId: state.documentId,
        query
      });

      return {
        context,
      };
    } catch (error) {
      console.error('Error retrieving context:', error);
      return {
        messages: [
          ...state.messages,
          new AIMessage(`Error retrieving context: ${error}`)
        ]
      };
    }
  };

  // Node for generating a response
  const generateResponseNode = async (state: RAGState): Promise<Partial<RAGState>> => {
    if (!state.context) {
      return {
        messages: [
          ...state.messages,
          new AIMessage("Error: No context available for generating a response.")
        ]
      };
    }

    // Get the latest user message
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage.role !== 'user') {
      return {
        messages: [
          ...state.messages,
          new AIMessage("Error: Expected a user message.")
        ]
      };
    }

    const query = lastMessage.content as string;
    try {
      // Use the Lilypad service to process the RAG query
      const response = await processRagQuery(query, state.context);
      
      return {
        messages: [
          ...state.messages,
          new AIMessage(response)
        ]
      };
    } catch (error) {
      console.error('Error generating response:', error);
      return {
        messages: [
          ...state.messages,
          new AIMessage(`Error generating response: ${error}`)
        ]
      };
    }
  };

  // Create the graph
  const workflow = new StateGraph<RAGState>({
    channels: {
      messages: MessagesAnnotation,
      documentId: { value: documentId },
      context: { value: null },
    },
  })
    .addNode("retrieve", retrieveContextNode)
    .addNode("generate", generateResponseNode)
    .addEdge(START, "retrieve")
    .addConditionalEdges("retrieve", decideNextStep)
    .addEdge("generate", END);

  // Compile the graph
  return workflow.compile({
    checkpointer: memory,
  });
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
    (message: AIMessage | HumanMessage | SystemMessage) => message.role === 'assistant'
  );
  
  return assistantMessage ? assistantMessage.content : "No response generated";
} 
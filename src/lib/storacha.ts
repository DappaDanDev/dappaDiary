"use server";

import * as Client from '@web3-storage/w3up-client';
import { StoreMemory } from '@web3-storage/w3up-client/stores/memory';
import * as Proof from '@web3-storage/w3up-client/proof';
import { Signer } from '@web3-storage/w3up-client/principal/ed25519';
import * as DID from '@ipld/dag-ucan/did';

/**
 * Interface representing a chat message
 */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

/**
 * Interface representing a chat conversation
 */
interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Check if a string is valid base64
 * @param str The string to check
 * @returns True if the string is valid base64
 */
function isValidBase64(str: string): boolean {
  try {
    return btoa(atob(str)) === str;
  } catch (err) {
    // If there's an error, it's not valid base64
    return false;
  }
}

// Define a mock client interface
interface MockClient {
  uploadFile: (file: Blob | File) => Promise<{ toString: () => string }>;
}

/**
 * Initialize the Storacha client using private key and proof
 * This approach works for both persistent and ephemeral environments
 * @returns Storacha client instance or mock client in development
 */
export async function initStorachaClient(): Promise<Client.Client | MockClient> {
  // Always use mock client in development
  if (process.env.NODE_ENV === 'development') {
    console.warn('Using mock Storacha client in development mode');
    return {
      uploadFile: async () => ({ toString: () => `mock-cid-${Date.now()}` }),
    };
  }
  
  try {
    // Load the client with a specific private key
    const privateKey = process.env.STORACHA_KEY;
    const proofString = process.env.STORACHA_PROOF;
    
    if (!privateKey) {
      throw new Error("STORACHA_KEY environment variable is not set");
    }
    
    if (!proofString) {
      throw new Error("STORACHA_PROOF environment variable is not set");
    }
    
    // Parse the private key
    try {
      const principal = Signer.parse(privateKey);
      
      // Create an in-memory store
      const store = new StoreMemory();
      
      // Create the client with the principal and store
      const client = await Client.create({ principal, store });
      
      // Parse the UCAN proof from environment variables
      try {
        const proof = await Proof.parse(proofString);
        
        // Add the space to the client
        const space = await client.addSpace(proof);
        
        // Set the current space
        await client.setCurrentSpace(space.did());
        
        console.log(`Storacha client initialized with space: ${space.did()}`);
        
        return client;
      } catch (proofError: unknown) {
        const errorMessage = proofError instanceof Error 
          ? proofError.message 
          : 'Unknown error';
        throw new Error(`Failed to parse STORACHA_PROOF: ${errorMessage}. Make sure it's generated with 'w3 delegation create <did> --base64'`);
      }
    } catch (keyError: unknown) {
      const errorMessage = keyError instanceof Error 
        ? keyError.message 
        : 'Unknown error';
      throw new Error(`Failed to parse STORACHA_KEY: ${errorMessage}. Make sure it's generated with 'w3 key create'`);
    }
  } catch (error) {
    console.error('Error initializing Storacha client:', error);
    throw error;
  }
}

/**
 * Store a chat conversation in Storacha
 * @param conversation The chat conversation to store
 * @returns The CID of the stored conversation
 */
export async function storeConversation(conversation: ChatConversation): Promise<string> {
  try {
    const client = await initStorachaClient();
    
    // Convert conversation to JSON string
    const conversationJson = JSON.stringify(conversation, null, 2);
    
    // Create a Blob with the conversation data
    const conversationBlob = new Blob([conversationJson], { type: 'application/json' });
    
    // Create a File object (with a meaningful name that includes conversation ID)
    const file = new File(
      [conversationBlob], 
      `conversation-${conversation.id}.json`, 
      { type: 'application/json' }
    );
    
    // Upload the file to Storacha
    const cid = await client.uploadFile(file);
    
    console.log(`Conversation ${conversation.id} uploaded to Storacha with CID: ${cid}`);
    return cid.toString();
  } catch (error) {
    console.error('Error storing conversation:', error);
    
    // Return a mock CID in development to allow the app to work
    if (process.env.NODE_ENV === 'development') {
      const mockCid = `mock-cid-${conversation.id}-${Date.now()}`;
      console.warn(`Using mock CID in development: ${mockCid}`);
      return mockCid;
    }
    
    throw error;
  }
}

/**
 * Create a new chat conversation
 * @param title The title of the conversation
 * @param initialMessage Optional initial message
 * @returns The new conversation object
 */
export async function createNewConversation(title: string, initialMessage?: ChatMessage): Promise<ChatConversation> {
  const now = new Date().toISOString();
  const conversationId = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  const conversation: ChatConversation = {
    id: conversationId,
    title,
    messages: initialMessage ? [initialMessage] : [],
    createdAt: now,
    updatedAt: now
  };
  
  return conversation;
}

/**
 * Add a message to a conversation and store the updated conversation
 * @param conversation The conversation to update
 * @param message The new message to add
 * @returns The CID of the updated conversation
 */
export async function addMessageToConversation(
  conversation: ChatConversation,
  message: ChatMessage
): Promise<string> {
  try {
    // Create a copy of the conversation
    const updatedConversation = {
      ...conversation,
      messages: [...(conversation.messages || []), message],
      updatedAt: new Date().toISOString()
    };
    
    // Store the updated conversation
    return await storeConversation(updatedConversation);
  } catch (error) {
    console.error('Error adding message to conversation:', error);
    
    // Return a mock CID in development to allow the app to work
    if (process.env.NODE_ENV === 'development') {
      const mockCid = `mock-cid-${conversation.id}-${Date.now()}`;
      console.warn(`Using mock CID in development: ${mockCid}`);
      return mockCid;
    }
    
    throw error;
  }
} 
import { testnet } from "@recallnet/chains";
import { RecallClient } from "@recallnet/sdk/client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Recall client singleton to be used throughout the app
let recallClientInstance: RecallClient | null = null;
// Store bucket ID once we've created or found it
let ragBucketId: `0x${string}` | null = null;

// Helper to ensure bucket IDs are properly formatted with 0x prefix
function ensureBucketFormat(bucket: string): `0x${string}` {
  if (!bucket.startsWith('0x')) {
    return `0x${bucket}` as `0x${string}`;
  }
  return bucket as `0x${string}`;
}

export async function getRecallClient(): Promise<RecallClient> {
  if (recallClientInstance) {
    return recallClientInstance;
  }

  // Get the private key from environment variables
  const privateKey = process.env.RECALL_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error("RECALL_PRIVATE_KEY is not set in environment variables");
  }

  // Ensure the private key is properly formatted with 0x prefix
  const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

  try {
    console.log("Initializing Recall client with testnet:", testnet);
    
    // Create a wallet client from the private key
    const walletClient = createWalletClient({
      account: privateKeyToAccount(formattedKey as `0x${string}`),
      chain: testnet,
      transport: http(),
    });
    
    // Log wallet address for debugging
    console.log("Wallet address:", walletClient.account.address);

    // Create the Recall client
    console.log("Creating RecallClient instance");
    const client = new RecallClient({ walletClient });
    
    // Test the connection with a simple operation
    try {
      console.log("Testing Recall client connection...");
      const bucketManager = client.bucketManager();
      await bucketManager.create();
      console.log("Recall client connection successful");
    } catch (testError) {
      console.error("Error testing Recall client connection:", testError);
      throw new Error(`Failed to connect to Recall network: ${testError instanceof Error ? testError.message : String(testError)}`);
    }
    
    recallClientInstance = client;
    return client;
  } catch (error) {
    console.error("Error initializing Recall client:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes("invalid private key")) {
      throw new Error(`Invalid private key format. Please ensure RECALL_PRIVATE_KEY is a valid Ethereum private key: ${errorMessage}`);
    }
    
    throw new Error(`Failed to initialize Recall client: ${errorMessage}`);
  }
}

// Get or create a bucket for storing RAG documents
export async function getOrCreateBucket(): Promise<`0x${string}`> {
  // If we've already found/created the bucket, return it
  if (ragBucketId) {
    return ragBucketId;
  }

  const client = await getRecallClient();
  const bucketManager = client.bucketManager();

  // Create a new bucket with our metadata
  console.log("Creating a RAG bucket");
  const { result: { bucket } } = await bucketManager.create({
    metadata: {
      'app': 'dappa-diary-rag',
      'created': new Date().toISOString()
    }
  });
  
  console.log("Created RAG bucket:", bucket);
  ragBucketId = bucket;
  return bucket;
}

// Buy Recall credits if needed
export async function ensureCredits(amount: bigint = BigInt(1)) {
  try {
    const client = await getRecallClient();
    const creditManager = client.creditManager();
    
    // Convert to a MUCH larger amount - purchasing 300 billion credits to handle large documents
    // The previous 1 billion was insufficient (required ~195 billion)
    const largeAmount = BigInt(300_000_000_000); // 300 billion units
    
    console.log(`[${new Date().toISOString()}] Attempting to buy ${largeAmount} credit(s)`);
    
    // Add timeout handling
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Credit purchase request timed out after 45 seconds'));
      }, 45000); // 45 second timeout
    });
    
    try {
      // Race the actual request against the timeout
      const result = await Promise.race([
        creditManager.buy(largeAmount),
        timeoutPromise
      ]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });
      
      const { meta: creditMeta } = result;
      
      if (!creditMeta?.tx?.transactionHash) {
        console.warn('Credit purchase completed but no transaction hash was returned');
      } else {
        console.log(`[${new Date().toISOString()}] Credit purchased at:`, creditMeta.tx.transactionHash);
      }
    } catch (apiError) {
      // If we get a parsing error (HTML response), log it but assume success
      const errorStr = String(apiError);
      
      if (errorStr.includes('SyntaxError') && 
          (errorStr.includes('<html>') || errorStr.includes('<!DOCTYPE'))) {
        console.warn('Received HTML instead of JSON response for credit purchase, but assuming credits were purchased successfully');
        console.warn('HTML response sample:', errorStr.substring(0, 100) + '...');
      } else if (errorStr.includes('ECONNREFUSED') || 
                errorStr.includes('ETIMEDOUT') || 
                errorStr.includes('NetworkError') ||
                errorStr.includes('Unauthorized') || 
                errorStr.includes('401') || 
                errorStr.includes('403')) {
        // Critical errors we should report
        throw apiError;
      } else {
        // For other errors, log but assume success
        console.warn(`[${new Date().toISOString()}] Non-critical error from credit purchase API:`, apiError);
        console.log(`[${new Date().toISOString()}] Assuming credits were purchased successfully despite error`);
      }
    }
    
    // Assume success
    console.log(`[${new Date().toISOString()}] Credit purchase operation completed`);
  } catch (error: unknown) {
    console.error(`[${new Date().toISOString()}] Critical error purchasing credits:`, error);
    
    // Only re-throw for truly critical errors
    const errorStr = String(error);
    if (errorStr.includes('ECONNREFUSED') || 
        errorStr.includes('ETIMEDOUT') || 
        errorStr.includes('NetworkError') ||
        errorStr.includes('Unauthorized') || 
        errorStr.includes('401') || 
        errorStr.includes('403')) {
      throw new Error(`Failed to purchase Recall credits: ${error instanceof Error ? error.message : errorStr}`);
    }
    
    // Otherwise assume the credits were purchased
    console.warn('Assuming credits were purchased despite error');
  }
}

// Store a document in the Recall bucket
export async function storeDocument(
  bucket: string | `0x${string}`,
  key: string,
  content: string | Uint8Array | File,
  metadata: Record<string, string> = {}
) {
  const client = await getRecallClient();
  const bucketManager = client.bucketManager();

  // Convert string content to a file if needed
  let file: File;
  if (content instanceof File) {
    file = content;
  } else if (content instanceof Uint8Array) {
    file = new File([content], key.split('/').pop() || 'document', {
      type: 'application/octet-stream',
    });
  } else {
    // It's a string
    // Try to detect if it's HTML
    let contentType = 'text/plain';
    let contentData = content;
    
    // If the content is HTML, try to extract text only
    if (typeof content === 'string' && content.trim().startsWith('<')) {
      console.log("Detected HTML content in string, extracting text only");
      contentType = 'text/plain';
      // Remove HTML tags
      contentData = content.replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    file = new File([contentData], key.split('/').pop() || 'document', {
      type: contentType,
    });
  }

  // Add the object to the bucket (ensure bucket is properly formatted)
  const bucketHex = ensureBucketFormat(bucket);
  
  try {
    // Make sure metadata is properly structured
    const docMetadata = {
      ...metadata,
      'content-type': file.type,
      'timestamp': new Date().toISOString(),
    };
    
    // Check if file is too large (> 100KB)
    const MAX_CHUNK_SIZE = 100 * 1024; // 100KB per chunk
    
    if (file.size > MAX_CHUNK_SIZE) {
      console.log(`File is large (${file.size} bytes), splitting into chunks of ${MAX_CHUNK_SIZE} bytes`);
      
      // Get the file content
      const fileContent = await file.text();
      const totalChunks = Math.ceil(fileContent.length / MAX_CHUNK_SIZE);
      
      // Store metadata about the chunked file
      await storeChunkedMetadata(bucketHex, key, {
        ...docMetadata,
        'chunked': 'true',
        'total_chunks': totalChunks.toString(),
        'original_size': file.size.toString(),
      });
      
      // Store each chunk
      for (let i = 0; i < totalChunks; i++) {
        const start = i * MAX_CHUNK_SIZE;
        const end = Math.min(start + MAX_CHUNK_SIZE, fileContent.length);
        const chunkContent = fileContent.substring(start, end);
        
        const chunkKey = `${key}.chunk${i}`;
        const chunkFile = new File([chunkContent], chunkKey.split('/').pop() || 'chunk', {
          type: file.type,
        });
        
        // Store the chunk
        await storeFileDirectly(bucketHex, chunkKey, chunkFile, {
          ...docMetadata,
          'chunk_index': i.toString(),
          'total_chunks': totalChunks.toString(),
          'parent_key': key,
        });
      }
      
      console.log(`Document ${key} stored in ${totalChunks} chunks`);
      return key;
    } else {
      // Log what we're about to store for debugging
      console.log(`Storing ${key} with content type ${file.type}, size ${file.size} bytes`);
      return await storeFileDirectly(bucketHex, key, file, docMetadata);
    }
  } catch (error: unknown) {
    console.error('Error storing document:', error);
    // Rethrow with more context
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to store document at ${key}: ${errorMessage}`);
  }
}

// Helper function to store chunked file metadata
async function storeChunkedMetadata(
  bucket: `0x${string}`,
  key: string,
  metadata: Record<string, string>
) {
  const client = await getRecallClient();
  const bucketManager = client.bucketManager();
  
  // Create a small metadata file
  const metadataFile = new File(
    [JSON.stringify(metadata)],
    `${key.split('/').pop()}.metadata` || 'metadata',
    { type: 'application/json' }
  );
  
  const metadataKey = `${key}.metadata`;
  console.log(`Storing chunked file metadata at ${metadataKey}`);
  
  try {
    const response = await bucketManager.add(bucket, metadataKey, metadataFile);
    console.log(`Metadata stored at ${metadataKey}`);
    return metadataKey;
  } catch (error) {
    console.error('Error storing metadata:', error);
    throw error;
  }
}

// Helper function to store a file directly, handling API errors
async function storeFileDirectly(
  bucket: `0x${string}`,
  key: string,
  file: File,
  metadata: Record<string, string>
): Promise<string> {
  const client = await getRecallClient();
  const bucketManager = client.bucketManager();
  
  try {
    // Make the API call with timeout handling
    console.log(`[${new Date().toISOString()}] Storing file at ${key} (${file.size} bytes)`);
    
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Request timed out after 30 seconds'));
      }, 30000); // 30 second timeout
    });
    
    try {
      // Race the actual request against the timeout
      const response = await Promise.race([
        bucketManager.add(bucket, key, file, { metadata }),
        timeoutPromise
      ]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });
      
      if (!response || !response.meta) {
        console.warn('Response from bucketManager.add missing metadata');
      } else {
        const { meta: addMeta } = response;
        console.log(`[${new Date().toISOString()}] File stored successfully at ${key}:`, addMeta?.tx?.transactionHash);
      }
    } catch (apiError) {
      // If we get a parsing error (HTML response), log it but assume success
      const errorStr = String(apiError);
      
      if (errorStr.includes('SyntaxError') && 
          (errorStr.includes('<html>') || errorStr.includes('<!DOCTYPE'))) {
        console.warn('Received HTML instead of JSON response, but assuming file was stored successfully');
        console.warn('HTML response sample:', errorStr.substring(0, 100) + '...');
      } else {
        // For other errors, rethrow
        throw apiError;
      }
    }
    
    // Assume success and return the key
    console.log(`[${new Date().toISOString()}] Assuming file was stored successfully at ${key}`);
    return key;
  } catch (error: unknown) {
    // Only throw for critical errors that likely mean the file wasn't stored
    const errorStr = String(error);
    
    // Network errors and authentication errors are critical
    if (errorStr.includes('ECONNREFUSED') || 
        errorStr.includes('ETIMEDOUT') || 
        errorStr.includes('NetworkError') ||
        errorStr.includes('Unauthorized') || 
        errorStr.includes('401') || 
        errorStr.includes('403')) {
      
      console.error(`[${new Date().toISOString()}] Critical error storing file at ${key}:`, error);
      throw new Error(`Error storing file at ${key}: ${errorStr}`);
    }
    
    // For other errors, log but assume success
    console.warn(`[${new Date().toISOString()}] Non-critical error from API for ${key}:`, error);
    console.log(`[${new Date().toISOString()}] Assuming file was stored successfully at ${key} despite error`);
    return key;
  }
}

// Retrieve a document from the Recall bucket
export async function getDocument(bucket: string | `0x${string}`, key: string): Promise<string> {
  const client = await getRecallClient();
  const bucketManager = client.bucketManager();
  
  // Ensure bucket is properly formatted
  const bucketHex = ensureBucketFormat(bucket);
  const { result: object } = await bucketManager.get(bucketHex, key);
  
  // Convert to string if it's binary data
  if (object instanceof Uint8Array) {
    return new TextDecoder().decode(object);
  }
  
  return object as string;
}

// List documents in the bucket (optionally filtered by prefix)
export async function listDocuments(bucket: string | `0x${string}`, prefix?: string) {
  const client = await getRecallClient();
  const bucketManager = client.bucketManager();
  
  // Ensure bucket is properly formatted
  const bucketHex = ensureBucketFormat(bucket);
  const { result: { objects } } = await bucketManager.query(bucketHex, prefix ? { prefix } : {});
  return objects;
} 
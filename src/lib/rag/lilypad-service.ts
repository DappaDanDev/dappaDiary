import { OpenAI } from "openai";
// Dynamically import the module for server-side usage
let EmbeddingPipelineSingleton: any;

// Define interfaces for the pipeline types
interface ProgressCallback {
  status: string;
  progress?: number;
  [key: string]: any;
}

interface EmbeddingResult {
  data: Float32Array | number[];
  dims: number[];
}

// No need for additional type assertions
// Use the imported module directly

// Initialize OpenAI client with Lilypad/Anura endpoint per the docs
const lilypadClient = new OpenAI({
  baseURL: 'https://anura-testnet.lilypad.tech/api/v1',
  apiKey: process.env.ANURA_API_KEY || 'placeholder-key',
});

let embeddingWorker: Worker;

// Initialize the embedding worker
function getEmbeddingWorker() {
  if (typeof window === 'undefined') {
    throw new Error('Embedding worker can only be initialized in browser environment');
  }
  
  if (!embeddingWorker) {
    // Create the worker
    embeddingWorker = new Worker(new URL('./embedding.worker.js', import.meta.url));
  }
  
  return embeddingWorker;
}

/**
 * Create embeddings for an array of texts
 * This function automatically chooses between client-side (web worker) 
 * and server-side (Transformers.js) embedding generation based on the environment
 */
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    console.log(`Generating embeddings for ${texts.length} texts using server-side Transformers.js`);
    return await createServerSideEmbeddings(texts);
  }

  console.log(`Generating embeddings for ${texts.length} texts using client-side web worker`);
  return await createClientSideEmbeddings(texts);
}

/**
 * Generate embeddings using Transformers.js (server-side)
 */
async function createServerSideEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    // Ensure the singleton is loaded dynamically
    if (!EmbeddingPipelineSingleton) {
      EmbeddingPipelineSingleton = (await import('./embedding-pipeline.js')).default;
    }
    
    if (typeof EmbeddingPipelineSingleton === 'undefined' || !EmbeddingPipelineSingleton) {
       throw new Error('Failed to load EmbeddingPipelineSingleton dynamically.');
    }

    console.log("Starting server-side embedding generation");
    console.log("EmbeddingPipelineSingleton type:", typeof EmbeddingPipelineSingleton);
    
    // Check if getInstance exists before calling Object.keys
    if (typeof EmbeddingPipelineSingleton !== 'function' || !EmbeddingPipelineSingleton.getInstance) {
       console.error("EmbeddingPipelineSingleton is not a valid class or does not have getInstance method", EmbeddingPipelineSingleton);
       throw new Error('EmbeddingPipelineSingleton is not properly loaded or structured.');
    }
    // This console log might still fail if the dynamic import returns an unexpected structure,
    // but we added checks before it.
    // console.log("EmbeddingPipelineSingleton methods:", Object.keys(EmbeddingPipelineSingleton)); 
    
    // Get the embedding pipeline instance
    const extractor = await EmbeddingPipelineSingleton.getInstance((progress: ProgressCallback) => {
      console.log(`Loading model: ${progress.status}`);
    });
    
    console.log(`Processing ${texts.length} texts with Transformers.js`);
    
    // Generate embeddings for each text
    const allEmbeddings: number[][] = [];
    
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      console.log(`Processing text ${i + 1}/${texts.length} (length: ${text.length.toLocaleString()} chars)`);
      
      try {
        // Generate embedding
        const result = await extractor(text);
        
        // Extract the embedding data
        if (result && result.data) {
          // Convert from TypedArray to regular array
          allEmbeddings.push(Array.from(result.data));
        } else {
          console.error("Unexpected result format:", result);
          throw new Error(`Unexpected result format from Transformers.js: ${JSON.stringify(result)}`);
        }
      } catch (textError) {
        console.error(`Error processing text ${i + 1}:`, textError);
        throw textError;
      }
    }
    
    return allEmbeddings;
  } catch (error) {
    console.error("Error generating server-side embeddings:", error);
    if (error instanceof Error) {
      console.error("Error stack:", error.stack);
    }
    throw new Error(`Failed to generate server-side embeddings: ${error}`);
  }
}

/**
 * Generate embeddings using Transformers.js (client-side)
 */
async function createClientSideEmbeddings(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 20; // Process in smaller batches
  const batches: string[][] = [];
  
  // Split texts into batches
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Processing ${texts.length} chunks in ${batches.length} batches of up to ${BATCH_SIZE} chunks each`);
  
  // Process all batches and combine results
  const allEmbeddings: number[][] = [];
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} chunks`);
    
    // Generate embeddings for this batch
    const batchEmbeddings = await generateEmbeddingsWithWorker(batch, `batch-${batchIndex}`);
    allEmbeddings.push(...batchEmbeddings);
  }
  
  return allEmbeddings;
}

/**
 * Generate embeddings for a batch of texts using the web worker
 */
async function generateEmbeddingsWithWorker(texts: string[], batchId: string): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    const worker = getEmbeddingWorker();
    
    // Set up the message handler
    const messageHandler = (event: MessageEvent) => {
      const { status, batchId: responseBatchId, embeddings, error } = event.data;
      
      // Only process messages for our batch
      if (responseBatchId !== batchId) return;
      
      if (status === 'complete') {
        // Remove the event listener when done
        worker.removeEventListener('message', messageHandler);
        resolve(embeddings);
      } else if (status === 'error') {
        // Remove the event listener on error
        worker.removeEventListener('message', messageHandler);
        reject(new Error(error));
      } else if (status === 'progress' || status === 'loading' || status === 'processing') {
        // Log progress but don't resolve/reject yet
        console.log(`Embedding worker: ${event.data.message}`);
      }
    };
    
    // Add the message listener
    worker.addEventListener('message', messageHandler);
    
    // Post the message to start processing
    worker.postMessage({ texts, batchId });
  });
}

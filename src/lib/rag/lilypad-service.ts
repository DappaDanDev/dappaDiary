import { OpenAI } from "openai";

// Initialize OpenAI client with Lilypad/Anura endpoint per the docs
const lilypadClient = new OpenAI({
  baseURL: 'https://anura-testnet.lilypad.tech/api/v1',
  apiKey: process.env.ANURA_API_KEY || 'placeholder-key',
});

/**
 * Create embeddings using the Lilypad API
 * Uses the sentence-transformers/all-MiniLM-L6-v2 model directly
 */
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5000; // 5 seconds
  const BATCH_SIZE = 20; // Process in smaller batches to avoid overloading the API
  
  try {
    // Process texts in smaller batches to avoid overloading the API
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      batches.push(texts.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`Processing ${texts.length} chunks in ${batches.length} batches of up to ${BATCH_SIZE} chunks each`);
    
    // Process each batch with retries
    const allEmbeddings: number[][] = [];
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} chunks`);
      
      let retryCount = 0;
      let success = false;
      let lastError;
      
      while (retryCount < MAX_RETRIES && !success) {
        try {
          if (retryCount > 0) {
            console.log(`Retry ${retryCount}/${MAX_RETRIES} for batch ${batchIndex + 1}...`);
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          }
          
          console.log(`Generating embeddings with model: sentence-transformers/all-MiniLM-L6-v2`);
          
          // Direct fetch call to ensure we're using the model correctly
          const response = await fetch('https://anura-testnet.lilypad.tech/api/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.ANURA_API_KEY || 'placeholder-key'}`
            },
            body: JSON.stringify({
              model: "sentence-transformers/all-MiniLM-L6-v2",
              input: batch
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API responded with status: ${response.status}, ${errorText}`);
          }
          
          const result = await response.json();
          
          // Extract embeddings from response
          if (result.data && Array.isArray(result.data)) {
            allEmbeddings.push(...result.data.map((item: any) => item.embedding));
          } else {
            throw new Error(`Unexpected response format: ${JSON.stringify(result)}`);
          }
          
          console.log(`Successfully processed batch ${batchIndex + 1}/${batches.length}`);
          success = true;
          
        } catch (error) {
          lastError = error;
          retryCount++;
          
          // Check if it's a temporary error
          const errorStr = String(error);
          if (errorStr.includes('520') || errorStr.includes('504') || errorStr.includes('503') || errorStr.includes('Connection')) {
            console.warn(`Temporary server error when processing batch ${batchIndex + 1}. Will retry. Error: ${errorStr.substring(0, 100)}...`);
          } else {
            // For other errors, don't retry
            console.error(`Non-retryable error when processing batch ${batchIndex + 1}:`, error);
            throw error;
          }
        }
      }
      
      if (!success) {
        // We've exhausted our retries
        console.error(`Failed to process batch ${batchIndex + 1} after ${MAX_RETRIES} retries. Last error:`, lastError);
        throw lastError;
      }
    }
    
    return allEmbeddings;
  } catch (error) {
    console.error("Error creating embeddings:", error);
    throw new Error(`Failed to create embeddings: ${error}`);
  }
}

/**
 * Generate an embedding for a single text using the chat completions API
 */
async function generateEmbeddingForText(text: string): Promise<number[]> {
  try {
    // Create a special prompt that asks the model to return a JSON array of numbers
    const response = await lilypadClient.chat.completions.create({
      model: "llama3.1:8b", // Using Llama 3.1 8B model which is confirmed to work
      messages: [
        { 
          role: "system", 
          content: `You are a vector embedding service. 
For the given text, return ONLY a JSON array of 384 numbers between -1 and 1 that semantically represent the text. 
Do not include any explanation, only return the JSON array.` 
        },
        { role: "user", content: text }
      ],
      temperature: 0.0,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "[]";
    
    // Try to parse the response as JSON
    try {
      // Extract the JSON array from the response which might contain extra text
      const arrayPattern = /\[[\s\S]*?\]/;
      const jsonMatch = content.match(arrayPattern);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      
      // Parse the embedding array
      const embedding = JSON.parse(jsonStr);
      
      // Validate that we got an array of numbers
      if (Array.isArray(embedding) && embedding.length > 0 && typeof embedding[0] === 'number') {
        // If the array is too short or too long, resize it to 384 dimensions
        const DIMENSIONS = 384;
        if (embedding.length !== DIMENSIONS) {
          const resized = new Array(DIMENSIONS).fill(0);
          for (let i = 0; i < Math.min(embedding.length, DIMENSIONS); i++) {
            resized[i] = embedding[i];
          }
          return resized;
        }
        return embedding;
      } else {
        // If we didn't get a valid embedding, generate a fallback
        console.warn(`Invalid embedding format received: ${jsonStr.substring(0, 100)}...`);
        return createSimpleEmbedding(text, 384);
      }
    } catch (parseError) {
      console.error(`Error parsing embedding JSON: ${parseError}`);
      console.error(`Raw content: ${content.substring(0, 100)}...`);
      // Use simple embedding as fallback
      return createSimpleEmbedding(text, 384);
    }
  } catch (error) {
    console.error(`Error generating embedding via chat completions: ${error}`);
    // Use simple embedding as fallback
    return createSimpleEmbedding(text, 384);
  }
}

/**
 * Fallback method to generate embeddings using the chat completions API
 * Some AI providers don't have dedicated embedding endpoints and use the LLM to generate embeddings
 */
async function generateEmbeddingsViaChatCompletions(texts: string[]): Promise<number[][]> {
  console.log(`Generating embeddings via chat completions for ${texts.length} texts`);
  const embeddings: number[][] = [];
  
  for (const text of texts) {
    try {
      // Create a special prompt that asks the model to return a JSON array of numbers
      const response = await lilypadClient.chat.completions.create({
        model: "llama3.1:8b", // Using Llama 3.1 8B model which is confirmed to work
        messages: [
          { 
            role: "system", 
            content: `You are a vector embedding service. 
For the given text, return ONLY a JSON array of 384 numbers between -1 and 1 that semantically represent the text. 
Do not include any explanation, only return the JSON array.` 
          },
          { role: "user", content: text }
        ],
        temperature: 0.0,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "[]";
      
      // Try to parse the response as JSON
      try {
        // Extract the JSON array from the response which might contain extra text
        // Use a regex pattern compatible with ES2015 (no 's' flag)
        const arrayPattern = /\[[\s\S]*?\]/;
        const jsonMatch = content.match(arrayPattern);
        const jsonStr = jsonMatch ? jsonMatch[0] : content;
        
        // Parse the embedding array
        const embedding = JSON.parse(jsonStr);
        
        // Validate that we got an array of numbers
        if (Array.isArray(embedding) && embedding.length > 0 && typeof embedding[0] === 'number') {
          // If the array is too short or too long, resize it to 384 dimensions
          const DIMENSIONS = 384;
          if (embedding.length !== DIMENSIONS) {
            const resized = new Array(DIMENSIONS).fill(0);
            for (let i = 0; i < Math.min(embedding.length, DIMENSIONS); i++) {
              resized[i] = embedding[i];
            }
            embeddings.push(resized);
          } else {
            embeddings.push(embedding);
          }
        } else {
          // If we didn't get a valid embedding, generate a fallback
          console.warn(`Invalid embedding format received: ${jsonStr.substring(0, 100)}...`);
          embeddings.push(createSimpleEmbedding(text, 384));
        }
      } catch (parseError) {
        console.error(`Error parsing embedding JSON: ${parseError}`);
        console.error(`Raw content: ${content.substring(0, 100)}...`);
        // Use simple embedding as fallback
        embeddings.push(createSimpleEmbedding(text, 384));
      }
    } catch (error) {
      console.error(`Error generating embedding via chat completions: ${error}`);
      // Use simple embedding as fallback
      embeddings.push(createSimpleEmbedding(text, 384));
    }
  }
  
  return embeddings;
}

/**
 * Extract text from documents based on file type
 * This is a simple implementation - in a production environment, 
 * you'd want more robust text extraction for various file types
 */
export async function extractTextFromDocument(file: File): Promise<string> {
  try {
    // PDFs need special handling - we might be getting raw binary or html
    if (file.type.includes('application/pdf')) {
      console.log("Processing PDF file");
      // For simplicity, we're just extracting as text but adding some metadata
      // In a real app, you'd use a PDF parsing library like pdf.js
      const rawText = await file.text();
      
      // If the extracted content looks like HTML (which can happen with some PDF viewers)
      if (rawText.trim().startsWith('<')) {
        console.log("Detected HTML content in PDF, extracting text only");
        // Basic HTML text extraction - in production, use a proper HTML parser
        return rawText.replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      return rawText;
    }
    
    // For plain text files
    if (file.type.includes('text/')) {
      return await file.text();
    }
    
    // For image files, you could integrate OCR - not implemented here
    if (file.type.includes('image/')) {
      throw new Error("Image OCR not implemented in this version");
    }
    
    // Default to treating as plain text with warning
    console.warn(`Unsupported file type: ${file.type}, treating as plain text`);
    return await file.text();
  } catch (error) {
    console.error("Error extracting text:", error);
    throw new Error(`Failed to extract text from document: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Process a RAG query using Lilypad's Llama3 model and provided context
 */
export async function processRagQuery(
  query: string, 
  context: string,
): Promise<string> {
  try {
    // Create a system prompt with the context
    const systemPrompt = `You are a helpful assistant that uses the retrieved context to answer user questions. 
Base your answers on the following context information and cite your sources. 
If you cannot find the information in the context, say so clearly, but try to be helpful.

CONTEXT:
${context}`;

    const response = await lilypadClient.chat.completions.create({
      model: "llama3.1:8b", // Using Llama 3.1 8B model from Lilypad
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query }
      ],
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || "No response generated";
  } catch (error) {
    console.error("Error processing RAG query:", error);
    throw new Error(`Failed to process RAG query: ${error}`);
  }
}

/**
 * Split text into chunks for embedding and storage
 * This is a simple implementation - in production you'd want more sophisticated chunking
 */
export function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  const chunks: string[] = [];
  
  // Split by paragraphs first
  const paragraphs = text.split(/\n\s*\n/);
  
  let currentChunk = "";
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed max size, save current chunk and start a new one
    if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    
    // If the paragraph itself is too long, split it further by sentences
    if (paragraph.length > maxChunkSize) {
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = "";
        }
        currentChunk += sentence + " ";
      }
    } else {
      currentChunk += paragraph + "\n\n";
    }
  }
  
  // Add the last chunk if there's anything left
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Create a simple embedding using a deterministic hashing approach
 * This is a fallback method when all other embedding approaches fail
 */
function createSimpleEmbedding(text: string, dimensions: number = 384): number[] {
  // Normalize and clean the text
  const normalizedText = text.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Create a simple hash-based embedding
  const embedding = new Array(dimensions).fill(0);
  
  // Simple word-level tokenization
  const words = normalizedText.split(/\W+/).filter(word => word.length > 0);
  
  // Fill the embedding array with pseudo-random but deterministic values based on words
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // Create a simple hash for each word
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(j);
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Use the hash to determine the position and value in the embedding array
    const position = Math.abs(hash) % dimensions;
    
    // Add a scaled value based on position in the document (earlier words get higher weight)
    const scaleFactor = 1.0 - (i / words.length * 0.5);
    embedding[position] += (hash % 10) / 10 * scaleFactor;
  }
  
  // Normalize the embedding vector to unit length
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }
  
  return embedding;
} 
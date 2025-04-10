import { createEmbeddings, chunkText, extractTextFromDocument } from './lilypad-service';
import { getOrCreateBucket, storeDocument, ensureCredits, getRecallClient } from './recall-client';
import { v4 as uuidv4 } from 'uuid';

interface DocumentMetadata {
  title: string;
  filename: string;
  uploadedAt: string;
  fileType: string;
  fileSize: number;
  chunkCount: number;
}

/**
 * Process an uploaded document for RAG
 * 1. Extract text
 * 2. Chunk the text
 * 3. Create embeddings with Lilypad
 * 4. Store chunks and embeddings in Recall
 */
export async function processDocument(file: File): Promise<string> {
  try {
    // First, ensure we have enough credits in Recall
    await ensureCredits(BigInt(1));
    
    // Get or create our bucket
    const bucket = await getOrCreateBucket();
    
    // Extract text from the document
    console.log(`Extracting text from ${file.name}...`);
    const text = await extractTextFromDocument(file);
    
    // Generate document ID
    const documentId = uuidv4();
    const documentKey = `documents/${documentId}`;
    
    // Store the original text
    await storeDocument(bucket, documentKey, text, {
      'original': 'true',
      'filename': file.name,
      'fileType': file.type,
      'fileSize': file.size.toString(),
    });
    
    // Chunk the text for embeddings
    console.log('Chunking text...');
    const chunks = chunkText(text);
    console.log(`Created ${chunks.length} chunks`);
    
    // Create embeddings for each chunk using Lilypad
    console.log('Creating embeddings with Lilypad...');
    const embeddings = await createEmbeddings(chunks);
    
    // Store each chunk with its embedding
    for (let i = 0; i < chunks.length; i++) {
      const chunkKey = `chunks/${documentId}/${i}`;
      const chunkText = chunks[i];
      
      // Store the chunk text
      await storeDocument(bucket, chunkKey, chunkText, {
        'documentId': documentId,
        'chunkIndex': i.toString(),
        'chunkCount': chunks.length.toString(),
      });
      
      // Store the chunk embedding
      const embeddingKey = `embeddings/${documentId}/${i}`;
      const embeddingJson = JSON.stringify(embeddings[i]);
      await storeDocument(bucket, embeddingKey, embeddingJson, {
        'documentId': documentId,
        'chunkIndex': i.toString(),
        'embeddingModel': 'sentence-transformers/all-MiniLM-L6-v2',
      });
    }
    
    // Store document metadata
    const metadata: DocumentMetadata = {
      title: file.name,
      filename: file.name,
      uploadedAt: new Date().toISOString(),
      fileType: file.type,
      fileSize: file.size,
      chunkCount: chunks.length,
    };
    
    await storeDocument(bucket, `metadata/${documentId}`, JSON.stringify(metadata));
    
    console.log(`Document processed and stored with ID: ${documentId}`);
    return documentId;
  } catch (error: unknown) {
    console.error('Error processing document:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to process document: ${errorMessage}`);
  }
}

/**
 * Find the most relevant chunks for a query using vector similarity
 */
export async function findRelevantChunks(
  documentId: string,
  query: string,
  topK: number = 3
): Promise<{ chunkText: string; similarity: number }[]> {
  // In a real implementation, you would:
  // 1. Get the query embedding from Lilypad
  // 2. Get all chunk embeddings for the document from Recall
  // 3. Compute cosine similarity between query and chunks
  // 4. Return the top K chunks
  
  // For now, this is a placeholder implementation
  // Actual implementation would require vector similarity search
  
  // Get query embedding
  const queryEmbedding = (await createEmbeddings([query]))[0];
  
  // Get or create our bucket
  const bucket = await getOrCreateBucket();
  
  // Find all embeddings for this document
  const { result: { objects } } = await (await getRecallClient()).bucketManager().query(bucket, { 
    prefix: `embeddings/${documentId}/` 
  });
  
  // For each embedding, compute similarity with query
  const similarities: { chunkIndex: number; similarity: number }[] = [];
  
  for (const obj of objects) {
    const key = obj.key;
    const chunkIndex = parseInt(key.split('/').pop() || '0', 10);
    
    // Get the embedding
    const { result: embeddingJson } = await (await getRecallClient()).bucketManager().get(bucket, key);
    const embeddingStr = embeddingJson instanceof Uint8Array 
      ? new TextDecoder().decode(embeddingJson) 
      : embeddingJson as string;
    
    // Safely parse JSON
    let embedding: number[];
    try {
      embedding = JSON.parse(embeddingStr);
      if (!Array.isArray(embedding)) {
        console.warn(`Embedding at ${key} is not an array, skipping`);
        continue;
      }
    } catch (error) {
      console.error(`Error parsing embedding JSON at ${key}:`, error);
      console.error(`Raw content: ${embeddingStr.substring(0, 100)}...`);
      continue; // Skip this embedding and move to the next one
    }
    
    // Compute cosine similarity
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    similarities.push({ chunkIndex, similarity });
  }
  
  // Sort by similarity (descending)
  similarities.sort((a, b) => b.similarity - a.similarity);
  
  // Get the top K chunks
  const topChunks = similarities.slice(0, topK);
  
  // Get the text for each chunk
  const results: { chunkText: string; similarity: number }[] = [];
  
  for (const { chunkIndex, similarity } of topChunks) {
    const chunkKey = `chunks/${documentId}/${chunkIndex}`;
    const { result: chunkData } = await (await getRecallClient()).bucketManager().get(bucket, chunkKey);
    const chunkText = chunkData instanceof Uint8Array 
      ? new TextDecoder().decode(chunkData) 
      : chunkData as string;
    
    results.push({ chunkText, similarity });
  }
  
  return results;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
} 
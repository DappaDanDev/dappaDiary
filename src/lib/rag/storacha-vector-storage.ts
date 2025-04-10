import { initStorachaClient } from '../storacha';
import { v4 as uuidv4 } from 'uuid';

/**
 * Interface for document chunks with embeddings
 */
export interface ChunkWithEmbedding {
  text: string;
  embedding: number[];
  index: number;
}

/**
 * Interface for document metadata
 */
export interface DocumentMetadata {
  title: string;
  filename: string;
  uploadedAt: string;
  fileType: string;
  fileSize: number;
  chunkCount: number;
}

/**
 * Store a document's text content in Storacha
 * @param documentId The document ID
 * @param text The document text content
 * @param metadata Additional metadata for the document
 * @returns The CID of the stored document
 */
export async function storeDocumentText(
  documentId: string,
  text: string,
  metadata: Record<string, string> = {}
): Promise<string> {
  try {
    const client = await initStorachaClient();
    
    // Create a blob with the document text
    const textBlob = new Blob([text], { type: 'text/plain' });
    
    // Create a file object with a meaningful name
    const file = new File(
      [textBlob],
      `document-${documentId}.txt`,
      { type: 'text/plain' }
    );
    
    // Upload the file to Storacha
    const cid = await client.uploadFile(file);
    
    console.log(`Document ${documentId} text uploaded to Storacha with CID: ${cid}`);
    return cid.toString();
  } catch (error) {
    console.error('Error storing document text:', error);
    throw error;
  }
}

/**
 * Store document metadata in Storacha
 * @param documentId The document ID
 * @param metadata The document metadata
 * @returns The CID of the stored metadata
 */
export async function storeDocumentMetadata(
  documentId: string,
  metadata: DocumentMetadata
): Promise<string> {
  try {
    const client = await initStorachaClient();
    
    // Convert metadata to JSON string
    const metadataJson = JSON.stringify(metadata, null, 2);
    
    // Create a blob with the metadata
    const metadataBlob = new Blob([metadataJson], { type: 'application/json' });
    
    // Create a file object with a meaningful name
    const file = new File(
      [metadataBlob],
      `metadata-${documentId}.json`,
      { type: 'application/json' }
    );
    
    // Upload the file to Storacha
    const cid = await client.uploadFile(file);
    
    console.log(`Document ${documentId} metadata uploaded to Storacha with CID: ${cid}`);
    return cid.toString();
  } catch (error) {
    console.error('Error storing document metadata:', error);
    throw error;
  }
}

/**
 * Store a chunk's text and embedding in Storacha
 * @param documentId The document ID
 * @param chunkIndex The chunk index
 * @param text The chunk text
 * @param embedding The chunk embedding vector
 * @returns The CID of the stored chunk
 */
export async function storeChunk(
  documentId: string,
  chunkIndex: number,
  text: string,
  embedding: number[]
): Promise<string> {
  try {
    const client = await initStorachaClient();
    
    // Create object with chunk data
    const chunkData = {
      documentId,
      chunkIndex,
      text,
      embedding,
      embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
      timestamp: new Date().toISOString()
    };
    
    // Convert chunk data to JSON string
    const chunkJson = JSON.stringify(chunkData, null, 2);
    
    // Create a blob with the chunk data
    const chunkBlob = new Blob([chunkJson], { type: 'application/json' });
    
    // Create a file object with a meaningful name
    const file = new File(
      [chunkBlob],
      `chunk-${documentId}-${chunkIndex}.json`,
      { type: 'application/json' }
    );
    
    // Upload the file to Storacha
    const cid = await client.uploadFile(file);
    
    console.log(`Chunk ${chunkIndex} for document ${documentId} uploaded to Storacha with CID: ${cid}`);
    return cid.toString();
  } catch (error) {
    console.error('Error storing chunk:', error);
    throw error;
  }
}

/**
 * Store index of document CIDs for tracking all documents
 * @param documents Map of document IDs to their CIDs
 * @returns The CID of the stored index
 */
export async function storeDocumentIndex(
  documents: Record<string, string>
): Promise<string> {
  try {
    const client = await initStorachaClient();
    
    // Convert document index to JSON string
    const indexJson = JSON.stringify(documents, null, 2);
    
    // Create a blob with the index data
    const indexBlob = new Blob([indexJson], { type: 'application/json' });
    
    // Create a file object with a meaningful name and timestamp to avoid collisions
    const file = new File(
      [indexBlob],
      `document-index-${Date.now()}.json`,
      { type: 'application/json' }
    );
    
    // Upload the file to Storacha
    const cid = await client.uploadFile(file);
    
    console.log(`Document index uploaded to Storacha with CID: ${cid}`);
    return cid.toString();
  } catch (error) {
    console.error('Error storing document index:', error);
    throw error;
  }
}

/**
 * Fetch all document IDs from the index
 * @param indexCid The CID of the document index
 * @returns Map of document IDs to their CIDs
 */
export async function fetchDocumentIndex(indexCid: string): Promise<Record<string, string>> {
  try {    
    // Fetch the index file from Storacha via IPFS gateway
    const response = await fetch(`https://${indexCid}.ipfs.dweb.link`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch document index: ${response.statusText}`);
    }
    
    // Parse the index JSON
    const index = await response.json();
    
    return index;
  } catch (error) {
    console.error('Error fetching document index:', error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param a First vector
 * @param b Second vector
 * @returns Cosine similarity score
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must be of the same length');
  }
  
  let dotProduct = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    aMagnitude += a[i] * a[i];
    bMagnitude += b[i] * b[i];
  }
  
  aMagnitude = Math.sqrt(aMagnitude);
  bMagnitude = Math.sqrt(bMagnitude);
  
  if (aMagnitude === 0 || bMagnitude === 0) {
    return 0;
  }
  
  return dotProduct / (aMagnitude * bMagnitude);
}

/**
 * Find chunks relevant to a query
 * @param documentId The document ID
 * @param query The query text
 * @param queryEmbedding The query embedding
 * @param topK Number of results to return
 * @param chunkCids Map of chunk indices to their CIDs
 * @returns Array of relevant chunks with their similarity scores
 */
export async function findRelevantChunks(
  documentId: string,
  query: string,
  queryEmbedding: number[],
  topK: number = 3,
  chunkCids: Record<string, string>
): Promise<{ chunkText: string; similarity: number }[]> {
  // Array to store chunks with their similarity scores
  const scoredChunks: { chunkText: string; similarity: number }[] = [];
  
  // Fetch each chunk and calculate similarity
  for (const [indexStr, cid] of Object.entries(chunkCids)) {
    try {
      // Fetch the chunk data from IPFS
      const response = await fetch(`https://${cid}.ipfs.dweb.link`);
      
      if (!response.ok) {
        console.warn(`Failed to fetch chunk ${indexStr} for document ${documentId}`);
        continue;
      }
      
      // Parse the chunk data
      const chunkData = await response.json();
      
      // Calculate similarity between query and chunk
      const similarity = cosineSimilarity(queryEmbedding, chunkData.embedding);
      
      // Add to results
      scoredChunks.push({
        chunkText: chunkData.text,
        similarity
      });
    } catch (error) {
      console.error(`Error processing chunk ${indexStr} for document ${documentId}:`, error);
      continue;
    }
  }
  
  // Sort chunks by similarity (descending)
  scoredChunks.sort((a, b) => b.similarity - a.similarity);
  
  // Return top K results
  return scoredChunks.slice(0, topK);
}

/**
 * Store a document's chunks and their CIDs for a given document
 * @param documentId The document ID  
 * @param chunkCids Map of chunk indices to their CIDs
 * @returns The CID of the stored chunk map
 */
export async function storeChunkMap(
  documentId: string,
  chunkCids: Record<string, string>
): Promise<string> {
  try {
    const client = await initStorachaClient();
    
    // Convert chunk map to JSON string
    const mapJson = JSON.stringify(chunkCids, null, 2);
    
    // Create a blob with the chunk map
    const mapBlob = new Blob([mapJson], { type: 'application/json' });
    
    // Create a file object with a meaningful name
    const file = new File(
      [mapBlob],
      `chunks-map-${documentId}.json`,
      { type: 'application/json' }
    );
    
    // Upload the file to Storacha
    const cid = await client.uploadFile(file);
    
    console.log(`Chunk map for document ${documentId} uploaded to Storacha with CID: ${cid}`);
    return cid.toString();
  } catch (error) {
    console.error('Error storing chunk map:', error);
    throw error;
  }
}

/**
 * Fetch a document's chunk map
 * @param chunkMapCid The CID of the chunk map
 * @returns Map of chunk indices to their CIDs
 */
export async function fetchChunkMap(chunkMapCid: string): Promise<Record<string, string>> {
  try {
    // Fetch the chunk map file from Storacha via IPFS gateway
    const response = await fetch(`https://${chunkMapCid}.ipfs.dweb.link`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch chunk map: ${response.statusText}`);
    }
    
    // Parse the chunk map JSON
    const chunkMap = await response.json();
    
    return chunkMap;
  } catch (error) {
    console.error('Error fetching chunk map:', error);
    throw error;
  }
} 
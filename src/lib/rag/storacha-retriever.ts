import { initStorachaClient } from "../storacha";
import { createEmbeddings } from "./lilypad-service";
import { cosineDistance } from "./utils/vector-utils";

/**
 * Interface representing a chunk of text with its embedding
 */
interface ChunkData {
  documentId: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  embeddingModel: string;
  timestamp: string;
}

/**
 * Interface representing a mapping of document chunks
 */
interface ChunkMapEntry {
  documentId: string;
  chunkCIDs: string[];
}

/**
 * Class for retrieving documents from Storacha and ranking them by relevance
 */
export class StorachaRetriever {
  private documentId: string;
  private chunkMapCID: string;
  private space: string;
  private cacheEnabled: boolean;
  private chunkCache: Map<string, ChunkData>;

  /**
   * @param documentId The ID of the document to retrieve
   * @param chunkMapCID The CID of the chunk map in Storacha
   * @param enableCache Whether to cache chunks in memory
   */
  constructor(documentId: string, chunkMapCID: string, enableCache = true) {
    this.documentId = documentId;
    this.chunkMapCID = chunkMapCID;
    this.space = "did:key:z6MkfsA7fpPPQHUSv2TSzHjmGpwFVfVrszF72tQP1AuL2qvr";
    this.cacheEnabled = enableCache;
    this.chunkCache = new Map();
  }

  /**
   * Retrieve chunks similar to the query
   * @param query The search query
   * @param topK The number of top chunks to return
   * @returns Array of chunks sorted by relevance
   */
  async retrieveSimilarChunks(query: string, topK: number = 3): Promise<ChunkData[]> {
    console.log(`[StorachaRetriever] Retrieving top ${topK} chunks for query: "${query}"`);
    
    try {
      // Generate embedding for the query
      const queryEmbeddings = await createEmbeddings([query]);
      if (!queryEmbeddings || queryEmbeddings.length === 0) {
        throw new Error("Failed to generate query embedding");
      }
      const queryEmbedding = queryEmbeddings[0];
      console.log(`[StorachaRetriever] Generated query embedding with ${queryEmbedding.length} dimensions`);
      
      // Get chunk map from Storacha
      const chunkCIDs = await this.getChunkCIDs();
      console.log(`[StorachaRetriever] Retrieved ${chunkCIDs.length} chunk CIDs`);
      
      // Get all chunks for the document
      const chunkPromises = chunkCIDs.map(cid => this.getChunkByCID(cid));
      const chunks = await Promise.all(chunkPromises);
      
      // Log embedding dimensions for debugging
      console.log(`[StorachaRetriever] Retrieved ${chunks.length} chunks`);
      if (chunks.length > 0) {
        const firstChunkEmbeddingLength = chunks[0].embedding.length;
        console.log(`[StorachaRetriever] First chunk has embedding with ${firstChunkEmbeddingLength} dimensions`);
      }
      
      // Filter chunks with compatible embedding dimensions
      const compatibleChunks = chunks.filter(chunk => {
        const isCompatible = chunk.embedding.length === queryEmbedding.length;
        if (!isCompatible) {
          console.log(`[StorachaRetriever] Skipping chunk ${chunk.chunkIndex} due to mismatched embedding dimensions: ${chunk.embedding.length} vs ${queryEmbedding.length}`);
        }
        return isCompatible;
      });
      
      console.log(`[StorachaRetriever] Found ${compatibleChunks.length} chunks with compatible embeddings`);
      
      // If no compatible chunks, return empty array
      if (compatibleChunks.length === 0) {
        console.warn("[StorachaRetriever] No chunks with compatible embedding dimensions found");
        return [];
      }
      
      // Calculate similarity scores
      const scoredChunks = compatibleChunks.map(chunk => ({
        chunk,
        score: cosineDistance(queryEmbedding, chunk.embedding)
      }));
      
      // Sort by similarity and take top K
      const topChunks = scoredChunks
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(({ chunk, score }) => {
          console.log(`[StorachaRetriever] Chunk ${chunk.chunkIndex} score: ${score.toFixed(4)}`);
          return chunk;
        });
      
      return topChunks;
    } catch (error) {
      console.error("[StorachaRetriever] Error retrieving similar chunks:", error);
      throw new Error(`Failed to retrieve similar chunks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get chunk CIDs from Storacha
   * @returns Array of chunk CIDs
   */
  private async getChunkCIDs(): Promise<string[]> {
    try {
      // Retrieve the chunk map from Storacha using its CID
      console.log(`[StorachaRetriever] Fetching chunk map with CID: ${this.chunkMapCID}`);
      const response = await fetch(`https://w3s.link/ipfs/${this.chunkMapCID}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      const rawData = await response.json();
      console.log(`[StorachaRetriever] Raw chunk map data:`, JSON.stringify(rawData).substring(0, 200) + '...');
      
      // Handle different chunk map formats
      let chunkCIDs: string[] = [];
      
      // Case 1: If it's an object with numeric keys (like what we're seeing in the error)
      if (typeof rawData === 'object' && !Array.isArray(rawData)) {
        // Extract values from the object's numeric keys
        chunkCIDs = Object.values(rawData).map(value => String(value));
      } 
      // Case 2: If it's an object with a chunkCIDs array property
      else if (rawData && typeof rawData === 'object' && Array.isArray(rawData.chunkCIDs)) {
        chunkCIDs = rawData.chunkCIDs;
      }
      // Case 3: If it's just an array
      else if (Array.isArray(rawData)) {
        chunkCIDs = rawData;
      }
      
      if (chunkCIDs.length === 0) {
        throw new Error(`Could not extract chunk CIDs from response: ${JSON.stringify(rawData)}`);
      }
      
      console.log(`[StorachaRetriever] Extracted ${chunkCIDs.length} chunk CIDs`);
      return chunkCIDs;
    } catch (error) {
      console.error("[StorachaRetriever] Error fetching chunk CIDs:", error);
      throw new Error(`Failed to fetch chunk CIDs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a chunk by its CID
   * @param cid The CID of the chunk
   * @returns The chunk data
   */
  private async getChunkByCID(cid: string): Promise<ChunkData> {
    // Check cache first if enabled
    if (this.cacheEnabled && this.chunkCache.has(cid)) {
      return this.chunkCache.get(cid)!;
    }
    
    try {
      // Retrieve the chunk from Storacha using its CID
      const response = await fetch(`https://w3s.link/ipfs/${cid}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      const chunkData = await response.json();
      
      // Log the raw structure for debugging
      console.log(`[StorachaRetriever] Raw chunk data structure for CID ${cid.substring(0, 10)}...:`);
      console.log(JSON.stringify(chunkData).substring(0, 200) + '...');
      
      // Look for embeddings in different possible locations/formats
      let embedding: number[] = [];
      
      if (Array.isArray(chunkData.embedding)) {
        embedding = chunkData.embedding;
        console.log(`[StorachaRetriever] Found embedding in 'embedding' field with length ${embedding.length}`);
      } else if (chunkData.vector && Array.isArray(chunkData.vector)) {
        embedding = chunkData.vector;
        console.log(`[StorachaRetriever] Found embedding in 'vector' field with length ${embedding.length}`);
      } else if (typeof chunkData === 'object' && chunkData !== null) {
        // Look for any array property that might be an embedding
        for (const key of Object.keys(chunkData)) {
          const value = chunkData[key];
          if (Array.isArray(value) && value.length > 100 && typeof value[0] === 'number') {
            embedding = value;
            console.log(`[StorachaRetriever] Found potential embedding in '${key}' field with length ${embedding.length}`);
            break;
          }
        }
      }
      
      // Validate the chunk data structure, being more lenient
      if (!chunkData) {
        throw new Error(`Empty or invalid chunk data for CID ${cid}`);
      }
      
      // Create a default chunk if structure doesn't match exactly
      const validatedChunk: ChunkData = {
        documentId: chunkData.documentId || this.documentId,
        chunkIndex: chunkData.chunkIndex || 0,
        text: chunkData.text || chunkData.content || (typeof chunkData === 'string' ? chunkData : JSON.stringify(chunkData)),
        embedding: embedding,
        embeddingModel: chunkData.embeddingModel || chunkData.model || "sentence-transformers/all-MiniLM-L6-v2",
        timestamp: chunkData.timestamp || new Date().toISOString()
      };
      
      // Cache the chunk if enabled
      if (this.cacheEnabled) {
        this.chunkCache.set(cid, validatedChunk);
      }
      
      return validatedChunk;
    } catch (error) {
      console.error(`[StorachaRetriever] Error fetching chunk with CID ${cid}:`, error);
      throw new Error(`Failed to fetch chunk with CID ${cid}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear the chunk cache
   */
  clearCache(): void {
    this.chunkCache.clear();
  }
} 
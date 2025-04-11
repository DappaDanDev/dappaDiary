import { initStorachaClient } from "../storacha";
import { createEmbeddings } from "./lilypad-service";
import { cosineDistance } from "./utils/vector-utils";
import { findDocumentById } from "./document-registry";

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
  private chunkMapCID: string | null;
  private space: string;
  private cacheEnabled: boolean;
  private chunkCache: Map<string, ChunkData>;

  /**
   * @param documentId The ID of the document to retrieve
   * @param fallbackChunkMapCID Optional fallback CID of the chunk map in Storacha
   * @param enableCache Whether to cache chunks in memory
   */
  constructor(documentId: string, fallbackChunkMapCID: string | null = null, enableCache = true) {
    this.documentId = documentId;
    this.chunkMapCID = fallbackChunkMapCID;
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
      // Get chunk map from Storacha
      const chunkCIDs = await this.getChunkCIDs();
      console.log(`[StorachaRetriever] Retrieved ${chunkCIDs.length} chunk CIDs`);
      
      // Get all chunks for the document
      const chunkPromises = chunkCIDs.map(cid => this.getChunkByCID(cid));
      const chunks = await Promise.all(chunkPromises);
      
      console.log(`[StorachaRetriever] Retrieved ${chunks.length} chunks`);
      
      // Check if we have PDF content by looking for PDF markers
      const isPDF = chunks.some(chunk => 
        chunk.text.includes('%PDF') || 
        chunk.text.includes('endobj') || 
        chunk.text.includes('xref')
      );
      
      if (isPDF) {
        console.log(`[StorachaRetriever] Detected PDF content, using fallback text similarity matching`);
        return this.retrieveChunksByTextSimilarity(query, chunks, topK);
      }
      
      // For non-PDF documents, try the embedding approach first
      try {
        // Generate embedding for the query
        const queryEmbeddings = await createEmbeddings([query]);
        if (!queryEmbeddings || queryEmbeddings.length === 0) {
          throw new Error("Failed to generate query embedding");
        }
        const queryEmbedding = queryEmbeddings[0];
        console.log(`[StorachaRetriever] Generated query embedding with ${queryEmbedding.length} dimensions`);
        
        // Filter chunks with compatible embedding dimensions
        const compatibleChunks = chunks.filter(chunk => {
          const isCompatible = chunk.embedding.length === queryEmbedding.length;
          if (!isCompatible) {
            console.log(`[StorachaRetriever] Skipping chunk ${chunk.chunkIndex} due to mismatched embedding dimensions: ${chunk.embedding.length} vs ${queryEmbedding.length}`);
          }
          return isCompatible;
        });
        
        console.log(`[StorachaRetriever] Found ${compatibleChunks.length} chunks with compatible embeddings`);
        
        // If no compatible chunks, fall back to text similarity
        if (compatibleChunks.length === 0) {
          console.warn("[StorachaRetriever] No chunks with compatible embedding dimensions found, using text similarity fallback");
          return this.retrieveChunksByTextSimilarity(query, chunks, topK);
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
        console.error("[StorachaRetriever] Error using embedding similarity, falling back to text similarity:", error);
        return this.retrieveChunksByTextSimilarity(query, chunks, topK);
      }
    } catch (error) {
      console.error("[StorachaRetriever] Error retrieving similar chunks:", error);
      throw new Error(`Failed to retrieve similar chunks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Fallback method to retrieve chunks by simple text similarity
   * This is used when embedding dimensions don't match or for PDF content
   */
  private retrieveChunksByTextSimilarity(query: string, chunks: ChunkData[], topK: number): ChunkData[] {
    console.log(`[StorachaRetriever] Using text similarity for ${chunks.length} chunks`);
    
    try {
      // Normalize query by converting to lowercase and removing non-alphanumeric chars
      const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
      const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length > 2);
      
      // For each chunk, calculate a simple score based on word overlap
      const scoredChunks = chunks.map(chunk => {
        // Try to normalize text content to handle binary data better
        let chunkText = chunk.text || '';
        
        // Skip binary content (common in PDFs)
        if (chunkText.includes('\u0000') || chunkText.includes('\ufffd')) {
          chunkText = this.cleanPdfText(chunkText);
        }
        
        // Convert to lowercase and tokenize
        const normalizedText = chunkText.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
        const chunkWords = normalizedText.split(/\s+/).filter(word => word.length > 2);
        
        // Calculate simple score based on word overlap
        let matchScore = 0;
        
        // Give points for each query word found in the chunk
        for (const queryWord of queryWords) {
          if (chunkWords.includes(queryWord)) {
            matchScore += 1;
          }
        }
        
        // Check if entire phrases match
        if (normalizedText.includes(normalizedQuery)) {
          matchScore += 5; // Bonus for exact phrase match
        }
        
        return { chunk, score: matchScore };
      });
      
      // Sort by score and take top K
      const topChunks = scoredChunks
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(({ chunk, score }) => {
          console.log(`[StorachaRetriever] Text similarity - Chunk ${chunk.chunkIndex} score: ${score}`);
          return chunk;
        });
      
      // If we didn't find any matches, just return some chunks
      if (topChunks.every(chunk => {
        const matchingScored = scoredChunks.find(sc => sc.chunk === chunk);
        return matchingScored?.score === 0;
      })) {
        console.log(`[StorachaRetriever] No good text matches found, returning first ${topK} chunks`);
        return chunks.slice(0, topK);
      }
      
      return topChunks;
    } catch (error) {
      console.error("[StorachaRetriever] Error in text similarity fallback:", error);
      // Return some chunks anyway rather than failing completely
      return chunks.slice(0, topK);
    }
  }
  
  /**
   * Clean PDF text to extract meaningful content
   */
  private cleanPdfText(text: string): string {
    // If input is not a string or empty, return placeholder
    if (!text || typeof text !== 'string') {
      return '[No text content available]';
    }
    
    // If text already contains page markers (processed PDF), return as is
    if (text.includes('--- Page ') && !text.includes('\ufffd') && !text.includes('\u0000')) {
      return text;
    }
    
    // Extract text that looks like it might be readable
    const cleanedText = text
      .replace(/[\x00-\x1F\x7F-\xFF]/g, ' ') // Remove control and non-ASCII chars
      .replace(/\\u[0-9a-fA-F]{4}/g, ' ')    // Remove Unicode escape sequences
      .replace(/endobj|obj|stream|endstream|xref|trailer|startxref/g, ' ') // Remove PDF syntax
      .replace(/%PDF-[0-9.]+/g, ' ')         // Remove PDF version marker
      .replace(/\s+/g, ' ')                  // Normalize whitespace
      .trim();
      
    // If we have a reasonable amount of text after basic cleaning, return it
    if (cleanedText.length > 100) {
      return cleanedText;
    }
      
    // Extract words that look like actual text (3+ alphanumeric chars)
    const textMatches = cleanedText.match(/[a-zA-Z0-9]{3,}/g) || [];
    const extractedText = textMatches.join(' ');
    
    // If we have enough content after extracting words, return it
    if (extractedText.length > 50) {
      return extractedText;
    }
    
    // Last fallback: return original text with basic cleanup
    return text
      .replace(/[^\x20-\x7E\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || '[No readable content found]';
  }

  /**
   * Get chunk CIDs from Storacha
   * @returns Array of chunk CIDs
   */
  private async getChunkCIDs(): Promise<string[]> {
    try {
      // First try to get the latest chunk map CID from the document registry
      let chunkMapCID = this.chunkMapCID;
      console.log(`[StorachaRetriever] Looking up document with ID: ${this.documentId}`);
      const document = await findDocumentById(this.documentId);
      
      console.log(`[StorachaRetriever] Document lookup result:`, document ? 'Found document' : 'Document not found');
      
      if (document && document.processing && document.processing.chunkMapCid) {
        // Use the document's chunk map CID from the registry
        chunkMapCID = document.processing.chunkMapCid;
        console.log(`[StorachaRetriever] Using chunk map CID from document registry: ${chunkMapCID}`);
      } else if (!chunkMapCID) {
        throw new Error(`No chunk map CID available for document ${this.documentId}`);
      } else {
        console.log(`[StorachaRetriever] Document not found in registry, using fallback chunk map CID: ${chunkMapCID}`);
      }
      
      // Retrieve the chunk map from Storacha using its CID
      console.log(`[StorachaRetriever] Fetching chunk map with CID: ${chunkMapCID}`);
      const response = await fetch(`https://w3s.link/ipfs/${chunkMapCID}`);
      
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
      
      // Get the text content, checking for PDF-specific content markers
      let text = '';
      if (typeof chunkData.text === 'string') {
        text = chunkData.text;
      } else if (chunkData.content && typeof chunkData.content === 'string') {
        text = chunkData.content;
      } else if (typeof chunkData === 'string') {
        text = chunkData;
      } else {
        // If no recognizable text field, try to stringify
        text = JSON.stringify(chunkData);
      }
      
      // If it's already a processed PDF page (has the page marker)
      if (text.includes('--- Page ') && !text.includes('\ufffd') && !text.includes('\u0000')) {
        // No need for additional processing
        console.log(`[StorachaRetriever] Found preprocessed PDF content for chunk with CID ${cid.substring(0, 10)}...`);
      } 
      // If it's binary/PDF content, clean it
      else if (text.includes('\u0000') || text.includes('\ufffd') || text.includes('%PDF')) {
        console.log(`[StorachaRetriever] Found binary/PDF content that needs cleaning for chunk with CID ${cid.substring(0, 10)}...`);
        text = this.cleanPdfText(text);
      }
      
      // Validate the chunk data structure, being more lenient
      if (!chunkData) {
        throw new Error(`Empty or invalid chunk data for CID ${cid}`);
      }
      
      // Create a default chunk if structure doesn't match exactly
      const validatedChunk: ChunkData = {
        documentId: chunkData.documentId || this.documentId,
        chunkIndex: chunkData.chunkIndex || 0,
        text: text || (typeof chunkData === 'string' ? chunkData : JSON.stringify(chunkData)),
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
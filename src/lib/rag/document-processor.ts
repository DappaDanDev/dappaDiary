import { createEmbeddings } from './lilypad-service';
import { v4 as uuidv4 } from 'uuid';
import {
  storeDocumentText,
  storeDocumentMetadata,
  storeChunk,
  storeChunkMap,
  storeDocumentIndex,
  findRelevantChunks as findRelevantChunksInStoracha,
  DocumentMetadata,
  cosineSimilarity
} from './storacha-vector-storage';
import {
  generateContentHash,
  findDocumentByHash,
  addDocumentToRegistry,
  ProcessedDocument
} from './document-registry';
import { extractTextFromPDF } from './pdf-processor';

// Text chunking function 
function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  // Split text into paragraphs
  const paragraphs = text.split(/\n\s*\n/);
  
  // Initialize chunks
  const chunks: string[] = [];
  let currentChunk = '';
  
  // Process each paragraph
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed the max chunk size,
    // start a new chunk (unless the current chunk is empty)
    if (currentChunk && currentChunk.length + paragraph.length > maxChunkSize) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    
    currentChunk += paragraph + '\n\n';
    
    // If the current chunk is already too large, force a break
    if (currentChunk.length > maxChunkSize) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
  }
  
  // Add the final chunk if it's not empty
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// Extract text from documents with PDF handling
async function extractTextFromDocument(file: File): Promise<string> {
  console.log(`Extracting text from ${file.name} (${file.type})...`);
  
  // Check if this is a PDF file
  if (file.type === 'application/pdf') {
    console.log(`Detected PDF document, using PDF processor...`);
    try {
      // Convert File to Buffer for PDF processing
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Use PDF-specific extraction
      return await extractTextFromPDF(buffer);
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      // Fallback to regular text extraction if PDF processing fails
      return await file.text();
    }
  }
  
  // Regular text extraction for non-PDF files
  return await file.text();
}

// Global tracking of document indices for this session
let documentIndexCid: string | null = null;
let documentIndices: Record<string, Record<string, string>> = {};

// Function to get the flattened document index for storage
function getFlattenedDocumentIndex(): Record<string, string> {
  const flattened: Record<string, string> = {};
  
  // For each document ID, add its metadata and chunkMap CIDs
  for (const [docId, cidMap] of Object.entries(documentIndices)) {
    flattened[`${docId}_text`] = cidMap.text;
    flattened[`${docId}_metadata`] = cidMap.metadata;
    flattened[`${docId}_chunkMap`] = cidMap.chunkMap;
  }
  
  return flattened;
}

/**
 * Process an uploaded document for RAG
 * 1. Extract text
 * 2. Chunk the text
 * 3. Create embeddings with Transformers.js
 * 4. Store chunks and embeddings in Storacha
 * 
 * @param file The file to process
 * @param skipDeduplication Whether to skip checking for duplicate documents
 * @returns The document ID
 */
export async function processDocument(file: File, skipDeduplication: boolean = false): Promise<string> {
  try {
    // Extract text from the document for hashing
    console.log(`Extracting text from ${file.name}...`);
    const text = await extractTextFromDocument(file);
    
    // Generate a hash of the document content
    const contentHash = generateContentHash(text);
    console.log(`Document content hash: ${contentHash}`);
    
    // Check if this document has been processed before (unless skipDeduplication is true)
    if (!skipDeduplication) {
      const existingDocument = await findDocumentByHash(contentHash);
      if (existingDocument) {
        console.log(`Document with hash ${contentHash} already exists with ID: ${existingDocument.id}`);
        
        // Make sure we have the document in our local indices
        if (!documentIndices[existingDocument.id]) {
          documentIndices[existingDocument.id] = {
            text: existingDocument.id + '_text', // These are placeholders
            metadata: existingDocument.id + '_metadata',
            chunkMap: existingDocument.processing.chunkMapCid
          };
        }
        
        return existingDocument.id;
      }
    } else {
      console.log('Skipping deduplication check as requested');
    }
    
    // If not found or skipping deduplication, proceed with normal processing
    console.log('Processing document as new...');
    
    // Generate document ID
    const documentId = uuidv4();
    
    // Start time tracking for processing metrics
    const processingStartTime = Date.now();
    
    // Store the original text in Storacha
    const textCid = await storeDocumentText(documentId, text, {
      'original': 'true',
      'filename': file.name,
      'fileType': file.type,
      'fileSize': file.size.toString(),
    });
    
    // Chunk the text for embeddings
    console.log('Chunking text...');
    const chunks = chunkText(text);
    console.log(`Created ${chunks.length} chunks`);
    
    // Create embeddings for each chunk using Transformers.js
    console.log('Creating embeddings with Transformers.js...');
    const embeddings = await createEmbeddings(chunks);
    
    // Store each chunk with its embedding and track the CIDs
    const chunkCids: Record<string, string> = {};
    
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const embedding = embeddings[i];
      
      // Store the chunk with its embedding in Storacha
      const chunkCid = await storeChunk(documentId, i, chunkText, embedding);
      
      // Track the CID
      chunkCids[i.toString()] = chunkCid;
    }
    
    // Store the map of chunk CIDs
    const chunkMapCid = await storeChunkMap(documentId, chunkCids);
    
    // Store document metadata
    const metadata: DocumentMetadata = {
      title: file.name,
      filename: file.name,
      uploadedAt: new Date().toISOString(),
      fileType: file.type,
      fileSize: file.size,
      chunkCount: chunks.length,
    };
    
    const metadataCid = await storeDocumentMetadata(documentId, metadata);
    
    // Update the document indices
    if (!documentIndices[documentId]) {
      documentIndices[documentId] = {};
    }
    
    documentIndices[documentId] = {
      text: textCid,
      metadata: metadataCid,
      chunkMap: chunkMapCid
    };
    
    // Store the updated document index
    documentIndexCid = await storeDocumentIndex(getFlattenedDocumentIndex());
    
    // Calculate total processing time
    const processingEndTime = Date.now();
    const processingTime = processingEndTime - processingStartTime;
    
    // Add document to registry for future deduplication
    const processedDocument: ProcessedDocument = {
      id: documentId,
      contentHash,
      metadata: {
        title: file.name,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadedAt: new Date().toISOString()
      },
      processing: {
        chunkCount: chunks.length,
        chunkMapCid,
        processingTime
      }
    };
    
    await addDocumentToRegistry(processedDocument);
    
    console.log(`Document processed and stored with ID: ${documentId}`);
    console.log(`Processing time: ${processingTime}ms`);
    console.log(`Document index CID: ${documentIndexCid}`);
    
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
  try {
    // Get query embedding from Transformers.js
    const queryEmbedding = (await createEmbeddings([query]))[0];
    
    // Make sure we have the document in our indices
    if (!documentIndices[documentId]) {
      throw new Error(`Document ${documentId} not found in the index. Make sure to process it first.`);
    }
    
    // Get the chunk map CID
    const chunkMapCid = documentIndices[documentId].chunkMap;
    
    // Fetch the chunk map
    const response = await fetch(`https://${chunkMapCid}.ipfs.dweb.link`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch chunk map: ${response.statusText}`);
    }
    
    // Parse the chunk map JSON
    const chunkCids = await response.json();
    
    // Find relevant chunks using our Storacha implementation
    return await findRelevantChunksInStoracha(
      documentId,
      query,
      queryEmbedding,
      topK,
      chunkCids
    );
  } catch (error) {
    console.error(`Error finding relevant chunks for document ${documentId}:`, error);
    throw error;
  }
}

/**
 * Get a list of all available documents with their metadata
 * @returns Array of document IDs and metadata
 */
export async function getAvailableDocuments(): Promise<{ id: string; metadata: DocumentMetadata }[]> {
  try {
    const documents: { id: string; metadata: DocumentMetadata }[] = [];
    
    // If we don't have any documents processed in this session, and no index CID,
    // return an empty array
    if (!documentIndexCid && Object.keys(documentIndices).length === 0) {
      return documents;
    }
    
    // For each document in our indices
    for (const [docId, cidMap] of Object.entries(documentIndices)) {
      try {
        // Fetch the metadata
        const metadataCid = cidMap.metadata;
        const response = await fetch(`https://${metadataCid}.ipfs.dweb.link`);
        
        if (!response.ok) {
          console.warn(`Failed to fetch metadata for document ${docId}`);
          continue;
        }
        
        const metadata = await response.json();
        documents.push({ id: docId, metadata });
      } catch (error) {
        console.error(`Error fetching metadata for document ${docId}:`, error);
        continue;
      }
    }
    
    return documents;
  } catch (error) {
    console.error('Error getting available documents:', error);
    return [];
  }
}

/**
 * Load document indices from a stored CID
 * @param indexCid The CID of the document index
 * @returns Whether the loading was successful
 */
export async function loadDocumentIndices(indexCid: string): Promise<boolean> {
  try {
    // Fetch the index file from Storacha via IPFS gateway
    const response = await fetch(`https://${indexCid}.ipfs.dweb.link`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch document index: ${response.statusText}`);
    }
    
    // Parse the index JSON
    const flattenedIndex = await response.json();
    
    // Unflatten the index into our document indices structure
    const reconstructedIndices: Record<string, Record<string, string>> = {};
    
    // Process each key in the flattened index
    for (const [key, value] of Object.entries(flattenedIndex)) {
      // Keys are in the format "{documentId}_{type}" where type is one of: text, metadata, chunkMap
      const [docId, type] = key.split('_');
      
      if (!docId || !type) {
        console.warn(`Invalid key format in document index: ${key}`);
        continue;
      }
      
      // Initialize the document entry if it doesn't exist
      if (!reconstructedIndices[docId]) {
        reconstructedIndices[docId] = {
          text: '',
          metadata: '',
          chunkMap: ''
        };
      }
      
      // Set the CID for the appropriate type
      reconstructedIndices[docId][type] = value as string;
    }
    
    // Update our global indices
    documentIndices = reconstructedIndices;
    documentIndexCid = indexCid;
    
    console.log(`Loaded ${Object.keys(documentIndices).length} documents from index CID: ${indexCid}`);
    return true;
  } catch (error) {
    console.error('Error loading document indices:', error);
    return false;
  }
}

/**
 * Directly get the full document text without using embeddings
 * Use this for podcast generation instead of vector search to avoid timeouts
 * @param documentId The document ID
 * @returns The full document text
 */
export async function getFullDocumentText(documentId: string): Promise<string> {
  try {
    console.log(`[DocumentProcessor] Getting full document text for ${documentId}`);
    
    // Get the document text CID from storage
    const client = await fetch(`https://w3s.link/ipfs/${documentId}_text`);
    
    if (!client.ok) {
      // Try looking up in the document indices we have in memory
      if (documentIndices[documentId] && documentIndices[documentId].text) {
        const textCid = documentIndices[documentId].text;
        const textResponse = await fetch(`https://w3s.link/ipfs/${textCid}`);
        
        if (!textResponse.ok) {
          throw new Error(`Failed to fetch document text: ${textResponse.statusText}`);
        }
        
        return await textResponse.text();
      }
      
      throw new Error(`Failed to fetch document text: ${client.statusText}`);
    }
    
    return await client.text();
  } catch (error) {
    console.error(`[DocumentProcessor] Error getting full document text:`, error);
    throw error;
  }
} 
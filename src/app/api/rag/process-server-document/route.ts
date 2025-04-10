import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import PipelineSingleton from '../../../../lib/rag/embedding-pipeline.js';
import { 
  storeDocumentText, 
  storeDocumentMetadata, 
  storeChunk, 
  storeChunkMap, 
  storeDocumentIndex, 
  DocumentMetadata 
} from '@/lib/rag/storacha-vector-storage';

// Function to break text into chunks
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

export async function POST(req: NextRequest) {
  try {
    // Check if we have form data with a file
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Extract text from the document
    console.log(`Extracting text from ${file.name}...`);
    const text = await file.text();
    
    // Generate document ID
    const documentId = uuidv4();
    
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
    
    // Create embeddings for each chunk using the pipeline directly
    console.log(`Creating embeddings with Transformers.js...`);
    
    // Get the embedding pipeline
    const extractor = await (PipelineSingleton as any).getInstance();
    
    // Generate embeddings for each chunk
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunkText.length} chars)`);
      
      const result = await extractor(chunkText);
      
      if (result && result.data) {
        // Convert from TypedArray to regular array
        embeddings.push(Array.from(result.data));
      } else {
        throw new Error(`Unexpected result format from Transformers.js`);
      }
    }
    
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
    
    // Create a record of the document for the index
    // Convert complex object to simple string record to match the function parameter type
    const documentIndices: Record<string, string> = {};
    documentIndices[documentId] = JSON.stringify({
      text: textCid,
      metadata: metadataCid,
      chunkMap: chunkMapCid
    });
    
    // Store the document index
    const documentIndexCid = await storeDocumentIndex(documentIndices);
    
    // Return the document ID for future reference
    return NextResponse.json({ 
      documentId,
      documentIndexCid,
      chunkCount: chunks.length
    });
  } catch (error) {
    console.error('Error processing document:', error);
    return NextResponse.json(
      { error: `Failed to process document: ${error}` },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false, // Don't parse the body, we'll use formData
  },
}; 
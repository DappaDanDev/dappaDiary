import { NextRequest, NextResponse } from 'next/server';
import { generateContentHash, findDocumentByHash } from '@/lib/rag/document-registry';

/**
 * Endpoint to check if a document with a specific hash already exists
 * This allows clients to avoid uploading duplicates
 */
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

    // Extract text for hashing
    const text = await file.text();
    
    // Generate content hash
    const contentHash = generateContentHash(text);
    
    // Check if document exists
    const existingDocument = await findDocumentByHash(contentHash);
    
    if (existingDocument) {
      // Document exists, return its details
      return NextResponse.json({
        exists: true,
        documentId: existingDocument.id,
        metadata: existingDocument.metadata,
        processingStats: {
          chunkCount: existingDocument.processing.chunkCount,
          processingTime: existingDocument.processing.processingTime
        }
      });
    } else {
      // Document doesn't exist
      return NextResponse.json({
        exists: false,
        contentHash
      });
    }
  } catch (error) {
    console.error('Error checking document:', error);
    return NextResponse.json(
      { error: `Failed to check document: ${error}` },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false, // Don't parse the body, we'll use formData
  },
}; 
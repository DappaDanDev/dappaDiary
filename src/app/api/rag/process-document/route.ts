import { NextRequest, NextResponse } from 'next/server';
import { processDocument } from '@/lib/rag/document-processor';
import { generateContentHash, findDocumentByHash } from '@/lib/rag/document-registry';

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

    // Process the document (now with built-in deduplication)
    const documentId = await processDocument(file);

    // Check if the checksum parameter was provided for client-side deduplication checks
    const skipDeduplication = formData.get('skipDeduplication') === 'true';
    
    // Return with appropriate status
    return NextResponse.json({ 
      documentId,
      message: "Document processed successfully"
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
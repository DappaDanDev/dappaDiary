import { NextRequest, NextResponse } from 'next/server';
import { processDocument } from '@/lib/rag/document-processor';

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

    // Process the document
    const documentId = await processDocument(file);

    // Return the document ID for future reference
    return NextResponse.json({ documentId });
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
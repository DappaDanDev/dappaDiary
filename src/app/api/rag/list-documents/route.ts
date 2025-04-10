import { NextRequest, NextResponse } from 'next/server';
import { getAvailableDocuments } from '@/lib/rag/document-processor';

export async function GET(req: NextRequest) {
  try {
    // Get all available documents with their metadata
    const documents = await getAvailableDocuments();

    // Return the document list
    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Error listing documents:', error);
    return NextResponse.json(
      { error: `Failed to list documents: ${error}` },
      { status: 500 }
    );
  }
} 
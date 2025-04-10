import { NextRequest, NextResponse } from 'next/server';
import { loadDocumentIndices } from '@/lib/rag/document-processor';

export async function POST(req: NextRequest) {
  try {
    // Parse the request body
    const body = await req.json();
    const { indexCid } = body;

    if (!indexCid) {
      return NextResponse.json(
        { error: 'Index CID is required' },
        { status: 400 }
      );
    }

    // Load document indices from the provided CID
    const success = await loadDocumentIndices(indexCid);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to load document indices' },
        { status: 500 }
      );
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: `Successfully loaded document indices from CID: ${indexCid}`
    });
  } catch (error) {
    console.error('Error loading document indices:', error);
    return NextResponse.json(
      { error: `Failed to load document indices: ${error}` },
      { status: 500 }
    );
  }
} 
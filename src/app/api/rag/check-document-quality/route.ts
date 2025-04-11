import { NextRequest, NextResponse } from 'next/server';
import { StorachaRetriever } from '@/lib/rag/storacha-retriever';

export async function POST(req: NextRequest) {
  try {
    const { documentId, chunkMapCid } = await req.json();
    
    if (!documentId || !chunkMapCid) {
      return NextResponse.json(
        { error: 'Both documentId and chunkMapCid are required' },
        { status: 400 }
      );
    }
    
    // Create a retriever to check the document's quality
    const retriever = new StorachaRetriever(documentId, chunkMapCid);
    const qualityReport = await retriever.checkDocumentQuality();
    
    return NextResponse.json({
      documentId,
      ...qualityReport,
      recommendation: qualityReport.needsReprocessing 
        ? "This document has binary PDF chunks and should be reprocessed with the new PDF parser" 
        : "Document chunks are in good quality, no reprocessing needed"
    });
  } catch (error) {
    console.error('Error checking document quality:', error);
    return NextResponse.json(
      { error: `Failed to check document quality: ${error}` },
      { status: 500 }
    );
  }
} 
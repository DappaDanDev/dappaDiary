import { NextRequest, NextResponse } from 'next/server';
import { PodcastAgent } from '@/lib/podcast/podcast-agent';
import { getPodcastForDocument } from '@/lib/podcast/podcast-storage';
import { getFullDocumentText } from '@/lib/rag/document-processor';

export const maxDuration = 300; // 5 minute timeout for podcast generation

/**
 * API route to generate a podcast from a document
 */
export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();
    const { documentId } = body;
    
    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`[PodcastAPI] Generating podcast for document ${documentId}`);
    
    // Check if podcast already exists for this document
    const existingPodcast = await getPodcastForDocument(documentId);
    if (existingPodcast && existingPodcast.script) {
      console.log(`[PodcastAPI] Found existing podcast script for document ${documentId}`);
      
      return NextResponse.json({
        success: true,
        message: 'Podcast script retrieved successfully',
        podcast: {
          documentId,
          script: existingPodcast.script
        }
      });
    }
    
    // Get the document content
    let documentContent: string;
    try {
      // First try to get the full text directly (faster)
      documentContent = await getFullDocumentText(documentId);
      console.log(`[PodcastAPI] Retrieved document content directly, length: ${documentContent.length}`);
    } catch (error) {
      console.error(`[PodcastAPI] Error retrieving document directly:`, error);
      
      // Fallback to using findRelevantChunks
      const { findRelevantChunks } = await import('@/lib/rag/document-processor');
      const chunks = await findRelevantChunks(documentId, "summary overview", 10);
      
      if (!chunks || chunks.length === 0) {
        return NextResponse.json(
          { error: 'Document not found or has no content' },
          { status: 404 }
        );
      }
      
      // Combine chunks to get document content
      documentContent = chunks.map(chunk => chunk.chunkText).join('\n');
      console.log(`[PodcastAPI] Retrieved document content via chunks, length: ${documentContent.length}`);
    }
    
    // Generate podcast script (no audio)
    console.log(`[PodcastAPI] Creating new podcast agent for document ${documentId}`);
    const podcastAgent = new PodcastAgent(documentId, documentContent);
    const result = await podcastAgent.generatePodcastScript(); // Updated to use the script-only method
    
    if (result.error || !result.script) {
      console.error(`[PodcastAPI] Error generating podcast script: ${result.error}`);
      return NextResponse.json(
        { error: result.error || 'Failed to generate podcast script' },
        { status: 500 }
      );
    }
    
    console.log(`[PodcastAPI] Podcast script generated successfully`);
    
    // Return the podcast script info
    return NextResponse.json({
      success: true,
      message: 'Podcast script generated successfully',
      podcast: {
        documentId,
        script: result.script
      }
    });
  } catch (error) {
    console.error('[PodcastAPI] Error processing request:', error);
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

/**
 * API route to get podcast information for a document
 */
export async function GET(req: NextRequest) {
  try {
    // Get document ID from query parameters
    const url = new URL(req.url);
    const documentId = url.searchParams.get('documentId');
    
    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`[PodcastAPI] Getting podcast for document ${documentId}`);
    
    // Get podcast metadata for the document
    const podcast = await getPodcastForDocument(documentId);
    
    if (!podcast) {
      return NextResponse.json(
        { error: 'Podcast not found for this document' },
        { status: 404 }
      );
    }
    
    // Return podcast information (script only, no audio)
    return NextResponse.json({
      message: 'Podcast found',
      podcast: {
        ...podcast,
        script: podcast.script || ''
      }
    });
  } catch (error) {
    console.error('[PodcastAPI] Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 
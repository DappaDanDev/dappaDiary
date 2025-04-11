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
    if (existingPodcast && existingPodcast.audioCid) {
      console.log(`[PodcastAPI] Found existing podcast for document ${documentId}`);
      const audioUrl = `https://w3s.link/ipfs/${existingPodcast.audioCid}`;
      
      return NextResponse.json({
        success: true,
        message: 'Podcast retrieved successfully',
        podcast: {
          documentId,
          audioUrl,
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
    
    // Generate podcast
    console.log(`[PodcastAPI] Creating new podcast agent for document ${documentId}`);
    const podcastAgent = new PodcastAgent(documentId, documentContent);
    const result = await podcastAgent.generatePodcast();
    
    if (result.error || !result.audioUrl) {
      console.error(`[PodcastAPI] Error generating podcast: ${result.error}`);
      return NextResponse.json(
        { error: result.error || 'Failed to generate podcast audio' },
        { status: 500 }
      );
    }
    
    console.log(`[PodcastAPI] Podcast generated successfully with URL: ${result.audioUrl}`);
    
    // Return the podcast info
    return NextResponse.json({
      success: true,
      message: 'Podcast generated successfully',
      podcast: {
        documentId,
        audioUrl: result.audioUrl,
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
    
    // Return podcast information
    return NextResponse.json({
      message: 'Podcast found',
      podcast: {
        ...podcast,
        audioUrl: podcast.audioCid ? `https://w3s.link/ipfs/${podcast.audioCid}` : null
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
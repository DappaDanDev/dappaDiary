import { initStorachaClient } from '../storacha';
import { v4 as uuidv4 } from 'uuid';

/**
 * Interface for podcast metadata
 */
export interface PodcastMetadata {
  id: string;
  documentId: string;
  title: string;
  description: string;
  duration: number;
  script: string;
  createdAt: string;
  audioCid: string | null;
}

/**
 * Interface for podcast document mapping
 */
export interface PodcastDocumentMap {
  [documentId: string]: {
    podcastId: string;
    audioCid: string;
    metadataCid: string;
    createdAt: string;
  }
}

/**
 * Store podcast audio in Storacha
 * @param documentId The document ID the podcast is based on
 * @param audioBuffer The audio file buffer
 * @param script The podcast script
 * @returns The CID of the stored audio and metadata
 */
export async function storePodcastAudio(
  documentId: string,
  audioBuffer: Buffer,
  script: string,
  title: string = "Generated Podcast"
): Promise<{ audioCid: string; metadataCid: string; podcastId: string }> {
  try {
    console.log(`[PodcastStorage] Storing podcast audio for document ${documentId}`);
    
    const client = await initStorachaClient();
    const podcastId = `podcast-${uuidv4()}`;
    
    // Create a blob with the audio data
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
    
    // Create a file object with a meaningful name
    const audioFile = new File(
      [audioBlob],
      `podcast-${podcastId}.wav`,
      { type: 'audio/wav' }
    );
    
    // Upload the audio file to Storacha
    const audioCid = await client.uploadFile(audioFile);
    console.log(`[PodcastStorage] Audio uploaded with CID: ${audioCid}`);
    
    // Create metadata object
    const metadata: PodcastMetadata = {
      id: podcastId,
      documentId,
      title,
      description: `Podcast generated from document ${documentId}`,
      duration: Math.ceil(audioBuffer.length / (44100 * 2)), // Rough estimate of duration in seconds
      script,
      createdAt: new Date().toISOString(),
      audioCid: audioCid.toString()
    };
    
    // Convert metadata to JSON string
    const metadataJson = JSON.stringify(metadata, null, 2);
    
    // Create a blob with the metadata
    const metadataBlob = new Blob([metadataJson], { type: 'application/json' });
    
    // Create a file object with a meaningful name
    const metadataFile = new File(
      [metadataBlob],
      `podcast-metadata-${podcastId}.json`,
      { type: 'application/json' }
    );
    
    // Upload the metadata file to Storacha
    const metadataCid = await client.uploadFile(metadataFile);
    console.log(`[PodcastStorage] Metadata uploaded with CID: ${metadataCid}`);
    
    // Update podcast document map
    await updatePodcastDocumentMap(documentId, podcastId, audioCid.toString(), metadataCid.toString());
    
    return {
      audioCid: audioCid.toString(),
      metadataCid: metadataCid.toString(),
      podcastId
    };
  } catch (error) {
    console.error('[PodcastStorage] Error storing podcast audio:', error);
    throw error;
  }
}

/**
 * Update the podcast document map
 * @param documentId The document ID
 * @param podcastId The podcast ID
 * @param audioCid The audio CID
 * @param metadataCid The metadata CID
 * @returns The CID of the updated map
 */
async function updatePodcastDocumentMap(
  documentId: string,
  podcastId: string,
  audioCid: string,
  metadataCid: string
): Promise<string> {
  try {
    const client = await initStorachaClient();
    let podcastMap: PodcastDocumentMap = {};
    
    // Try to fetch existing map
    try {
      // This is a placeholder - in a real implementation, we would fetch and update the map
      // For now, we'll just create a new map each time
      console.log(`[PodcastStorage] Creating new podcast document map`);
    } catch (error) {
      console.log(`[PodcastStorage] No existing podcast map found, creating new one`);
    }
    
    // Update the map with new podcast
    podcastMap[documentId] = {
      podcastId,
      audioCid,
      metadataCid,
      createdAt: new Date().toISOString()
    };
    
    // Convert map to JSON string
    const mapJson = JSON.stringify(podcastMap, null, 2);
    
    // Create a blob with the map data
    const mapBlob = new Blob([mapJson], { type: 'application/json' });
    
    // Create a file object with a meaningful name and timestamp to avoid collisions
    const mapFile = new File(
      [mapBlob],
      `podcast-map-${Date.now()}.json`,
      { type: 'application/json' }
    );
    
    // Upload the file to Storacha
    const mapCid = await client.uploadFile(mapFile);
    
    console.log(`[PodcastStorage] Podcast map uploaded with CID: ${mapCid}`);
    return mapCid.toString();
  } catch (error) {
    console.error('[PodcastStorage] Error updating podcast document map:', error);
    throw error;
  }
}

/**
 * Get podcast metadata for a document
 * @param documentId The document ID
 * @returns Podcast metadata or null if not found
 */
export async function getPodcastForDocument(documentId: string): Promise<PodcastMetadata | null> {
  try {
    // This is a placeholder - in a real implementation, we would:
    // 1. Fetch the podcast document map
    // 2. Look up the metadata CID for the document
    // 3. Fetch the metadata from Storacha
    console.log(`[PodcastStorage] Looking up podcast for document ${documentId}`);
    
    // For testing purposes, return null (not found)
    return null;
  } catch (error) {
    console.error(`[PodcastStorage] Error getting podcast for document:`, error);
    return null;
  }
}

/**
 * Get podcast metadata by ID
 * @param podcastId The podcast ID
 * @returns Podcast metadata or null if not found
 */
export async function getPodcastById(podcastId: string): Promise<PodcastMetadata | null> {
  try {
    // This is a placeholder - in a real implementation, we would fetch the metadata from Storacha
    console.log(`[PodcastStorage] Looking up podcast with ID ${podcastId}`);
    
    // For testing purposes, return null (not found)
    return null;
  } catch (error) {
    console.error(`[PodcastStorage] Error getting podcast by ID:`, error);
    return null;
  }
}

/**
 * Get podcast audio URL
 * @param audioCid The audio CID
 * @returns The URL to access the audio file
 */
export function getPodcastAudioUrl(audioCid: string): string {
  return `https://w3s.link/ipfs/${audioCid}`;
}

/**
 * Delete a podcast
 * @param podcastId The podcast ID
 * @returns True if successful, false otherwise
 */
export async function deletePodcast(podcastId: string): Promise<boolean> {
  try {
    // This is a placeholder - in a real implementation, we would:
    // 1. Fetch podcast metadata
    // 2. Remove podcast from document map
    // 3. Update document map in Storacha
    console.log(`[PodcastStorage] Deleting podcast with ID ${podcastId}`);
    
    // Note: We can't actually delete files from IPFS/Storacha,
    // but we can remove them from our indices
    
    return true;
  } catch (error) {
    console.error(`[PodcastStorage] Error deleting podcast:`, error);
    return false;
  }
} 
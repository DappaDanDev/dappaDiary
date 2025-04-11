import { initStorachaClient } from '../storacha';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

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
  localFilePath: string;
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
    title: string;
    timestamp: string;
    localFilePath: string;
  }
}

/**
 * Store podcast audio in Storacha
 * @param documentId Document ID
 * @param audioBuffer Audio buffer
 * @param script Podcast script
 * @param title Podcast title
 * @returns Storacha CIDs
 */
export async function storePodcastAudio(
  documentId: string,
  audioBuffer: Buffer,
  script: string,
  title: string
): Promise<{ audioCid: string; metadataCid: string }> {
  console.log(`[PodcastStorage] Storing podcast audio for document ${documentId}`);
  
  try {
    // Generate local podcast filepath
    const podcastDir = path.join(process.cwd(), 'podcasts');
    const localFilename = `podcast-${documentId}.wav`;
    const localFilePath = path.join(podcastDir, localFilename);
    
    // Save the podcast locally
    if (!fs.existsSync(podcastDir)) {
      fs.mkdirSync(podcastDir, { recursive: true });
    }
    fs.writeFileSync(localFilePath, audioBuffer);
    console.log(`[PodcastStorage] Saved podcast audio locally to ${localFilePath}`);
    
    // Initialize Storacha client
    const storachaClient = await initStorachaClient();
    
    // Upload audio to Storacha
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
    const audioFile = new File([audioBlob], `podcast-${documentId}.wav`, { type: 'audio/wav' });
    const audioCid = await storachaClient.uploadFile(audioFile);
    console.log(`[PodcastStorage] Audio uploaded with CID: ${audioCid}`);
    
    // Create metadata for the podcast
    const metadata = {
      documentId,
      title,
      script,
      timestamp: new Date().toISOString(),
      audioCid: audioCid.toString(),
      localFilePath,
    };
    
    // Convert metadata to JSON
    const metadataJson = JSON.stringify(metadata);
    
    // Upload metadata to Storacha
    const metadataBlob = new Blob([metadataJson], { type: 'application/json' });
    const metadataFile = new File([metadataBlob], `podcast-metadata-${documentId}.json`, { type: 'application/json' });
    const metadataCid = await storachaClient.uploadFile(metadataFile);
    console.log(`[PodcastStorage] Metadata uploaded with CID: ${metadataCid}`);
    
    // Update podcast document map
    await updatePodcastDocumentMap(documentId, {
      audioCid: audioCid.toString(),
      metadataCid: metadataCid.toString(),
      title,
      timestamp: new Date().toISOString(),
      localFilePath,
    });
    
    return {
      audioCid: audioCid.toString(),
      metadataCid: metadataCid.toString(),
    };
  } catch (error) {
    console.error('[PodcastStorage] Error storing podcast:', error);
    throw error;
  }
}

/**
 * Update the podcast document map
 * @param documentId The document ID
 * @param podcastInfo The podcast information
 * @returns The CID of the updated map
 */
async function updatePodcastDocumentMap(
  documentId: string,
  podcastInfo: {
    audioCid: string;
    metadataCid: string;
    title: string;
    timestamp: string;
    localFilePath: string;
  }
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
      podcastId: `podcast-${uuidv4()}`,
      audioCid: podcastInfo.audioCid,
      metadataCid: podcastInfo.metadataCid,
      createdAt: new Date().toISOString(),
      title: podcastInfo.title,
      timestamp: podcastInfo.timestamp,
      localFilePath: podcastInfo.localFilePath,
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

/**
 * Store a reference to externally hosted podcast audio (e.g., from fal.ai)
 * @param documentId Document ID
 * @param audioUrl URL to the audio file
 * @param script Podcast script
 * @param title Podcast title
 * @returns Storage result with ID and metadata CID
 */
export async function storePodcastAudioReference(
  documentId: string,
  audioUrl: string,
  script: string,
  title: string
): Promise<{ id: string; metadataCid: string }> {
  console.log(`[PodcastStorage] Storing podcast audio reference for document ${documentId}`);
  
  try {
    // Generate a unique ID for this podcast
    const podcastId = `podcast-${uuidv4()}`;
    
    // Initialize Storacha client
    const storachaClient = await initStorachaClient();
    
    // Create metadata for the podcast
    const metadata: Partial<PodcastMetadata> = {
      id: podcastId,
      documentId,
      title,
      script,
      createdAt: new Date().toISOString(),
      // For external audio, we don't have a CID but store the URL in the metadata
      audioCid: null, // No IPFS CID for externally hosted audio
      localFilePath: "", // No local file for externally hosted audio
      description: `Podcast generated for document ${documentId}`,
      duration: 0, // Duration unknown for externally hosted audio
    };
    
    // Convert metadata to JSON
    const metadataJson = JSON.stringify(metadata);
    
    // Upload metadata to Storacha
    const metadataBlob = new Blob([metadataJson], { type: 'application/json' });
    const metadataFile = new File(
      [metadataBlob], 
      `podcast-metadata-${documentId}.json`, 
      { type: 'application/json' }
    );
    const metadataCid = await storachaClient.uploadFile(metadataFile);
    console.log(`[PodcastStorage] Metadata uploaded with CID: ${metadataCid}`);
    
    // Update podcast document map with audio URL instead of CID
    await updatePodcastDocumentMap(documentId, {
      audioCid: audioUrl, // Using the URL directly in place of a CID
      metadataCid: metadataCid.toString(),
      title,
      timestamp: new Date().toISOString(),
      localFilePath: "", // No local file for externally hosted audio
    });
    
    return {
      id: podcastId,
      metadataCid: metadataCid.toString(),
    };
  } catch (error) {
    console.error('[PodcastStorage] Error storing podcast reference:', error);
    throw error;
  }
} 
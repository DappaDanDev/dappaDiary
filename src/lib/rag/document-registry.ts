import crypto from 'crypto';
import { initStorachaClient } from '../storacha';

/**
 * Interface representing a processed document entry in the registry
 */
export interface ProcessedDocument {
  id: string;              // Document ID assigned during processing
  contentHash: string;     // SHA-256 hash of document content
  metadata: {              // Original document metadata
    title: string;
    filename: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: string;    // ISO timestamp
  };
  processing: {
    chunkCount: number;
    chunkMapCid: string;   // CID of chunk map in Storacha
    processingTime: number; // In milliseconds
  }
}

/**
 * Map of document registry entries by CID
 */
interface DocumentRegistry {
  documents: Record<string, ProcessedDocument>;
  lastUpdated: string;
}

// Registry CID storage key in localStorage (for client-side) or in memory (for server-side)
const REGISTRY_CID_KEY = 'document-registry-cid';

// In-memory cache of the document registry
let registryCache: DocumentRegistry | null = null;

// Server-side in-memory storage
const globalStorage: Record<string, string> = {};

/**
 * Generate a SHA-256 hash of document content
 * @param content Document content to hash
 * @returns SHA-256 hash as hex string
 */
export function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Store the document registry in Storacha
 * @param registry Document registry to store
 * @returns CID of the stored registry
 */
export async function storeDocumentRegistry(registry: DocumentRegistry): Promise<string> {
  try {
    const client = await initStorachaClient();
    
    // Convert registry to JSON string
    const registryJson = JSON.stringify(registry, null, 2);
    
    // Create a blob with the registry data
    const registryBlob = new Blob([registryJson], { type: 'application/json' });
    
    // Create a file object with a meaningful name
    const file = new File(
      [registryBlob],
      `document-registry-${Date.now()}.json`,
      { type: 'application/json' }
    );
    
    // Upload the file to Storacha
    const cid = await client.uploadFile(file);
    
    // Store the CID in localStorage (client-side) or global variable (server-side)
    if (typeof window !== 'undefined') {
      localStorage.setItem(REGISTRY_CID_KEY, cid.toString());
    } else {
      globalStorage[REGISTRY_CID_KEY] = cid.toString();
    }
    
    console.log(`Document registry uploaded to Storacha with CID: ${cid}`);
    return cid.toString();
  } catch (error) {
    console.error('Error storing document registry:', error);
    throw error;
  }
}

/**
 * Load the document registry from Storacha
 * @returns The document registry
 */
export async function loadDocumentRegistry(): Promise<DocumentRegistry> {
  // Return cached registry if available
  if (registryCache) {
    return registryCache;
  }
  
  try {
    // Get the CID from localStorage (client-side) or global variable (server-side)
    let registryCid: string | null = null;
    
    if (typeof window !== 'undefined') {
      registryCid = localStorage.getItem(REGISTRY_CID_KEY);
    } else {
      registryCid = globalStorage[REGISTRY_CID_KEY] || null;
    }
    
    // If no CID is found, create a new registry
    if (!registryCid) {
      const newRegistry: DocumentRegistry = {
        documents: {},
        lastUpdated: new Date().toISOString()
      };
      
      // Store the new registry
      await storeDocumentRegistry(newRegistry);
      
      // Cache the registry
      registryCache = newRegistry;
      
      return newRegistry;
    }
    
    // Fetch the registry file from Storacha via IPFS gateway
    const response = await fetch(`https://${registryCid}.ipfs.dweb.link`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch document registry: ${response.statusText}`);
    }
    
    // Parse the registry JSON
    const registry: DocumentRegistry = await response.json();
    
    // Cache the registry
    registryCache = registry;
    
    return registry;
  } catch (error) {
    console.error('Error loading document registry:', error);
    
    // If error, create a new registry
    const newRegistry: DocumentRegistry = {
      documents: {},
      lastUpdated: new Date().toISOString()
    };
    
    // Cache the registry
    registryCache = newRegistry;
    
    return newRegistry;
  }
}

/**
 * Check if a document exists in the registry by its content hash
 * @param contentHash Content hash of the document
 * @returns The document if found, null otherwise
 */
export async function findDocumentByHash(contentHash: string): Promise<ProcessedDocument | null> {
  // Load the registry
  const registry = await loadDocumentRegistry();
  
  // Check if the registry has any documents
  if (!registry.documents) {
    return null;
  }
  
  // Search for the document by content hash
  for (const docId in registry.documents) {
    if (registry.documents[docId].contentHash === contentHash) {
      return registry.documents[docId];
    }
  }
  
  return null;
}

/**
 * Add a processed document to the registry
 * @param document Processed document to add
 * @returns CID of the updated registry
 */
export async function addDocumentToRegistry(document: ProcessedDocument): Promise<string> {
  // Load the registry
  const registry = await loadDocumentRegistry();
  
  // Add the document to the registry
  registry.documents[document.id] = document;
  
  // Update the last updated timestamp
  registry.lastUpdated = new Date().toISOString();
  
  // Store the updated registry
  return await storeDocumentRegistry(registry);
} 
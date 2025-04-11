import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { Document } from "langchain/document";

/**
 * Interface for Document type returned by PDFLoader
 */
interface PDFDocument {
  pageContent: string;
  metadata: {
    loc: {
      pageNumber: number;
      [key: string]: any;
    };
    [key: string]: any;
  };
}

/**
 * Extract text content from a PDF file buffer
 * @param pdfBuffer PDF file as a Buffer
 * @returns The extracted text content as a string
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    // Create a blob from the buffer
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    
    // Use the PDFLoader with the blob directly
    const loader = new PDFLoader(blob);
    
    // Load the PDF documents
    const docs = await loader.load();
    
    console.log(`[PDF Processor] Extracted ${docs.length} pages from PDF`);
    
    // Combine all page contents into a single string with page markers
    const textContent = docs.map((doc: Document) => {
      const pageNum = doc.metadata?.loc?.pageNumber || 'unknown';
      return `--- Page ${pageNum} ---\n${doc.pageContent.trim()}`;
    }).join('\n\n');
    
    return textContent;
  } catch (error) {
    console.error("[PDF Processor] Error extracting text from PDF:", error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
} 
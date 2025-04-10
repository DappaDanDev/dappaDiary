"use client";
import React, { useState } from "react";
import { FileUpload } from "@/components/ui/file-upload";

interface FileUploadDemoProps {
  onFileUpload?: (file: File) => void;
  onDocumentProcessed?: (documentId: string) => void;
}

export function FileUploadDemo({ onFileUpload, onDocumentProcessed }: FileUploadDemoProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const handleFileUpload = async (uploadedFiles: File[]) => {
    if (uploadedFiles.length > 0) {
      setFiles(uploadedFiles);
      console.log("Files uploaded:", uploadedFiles);
      
      // If onFileUpload callback is provided, pass the first file to it
      if (onFileUpload && uploadedFiles[0]) {
        onFileUpload(uploadedFiles[0]);
      }
      
      // Process the file for RAG
      await processFileForRAG(uploadedFiles[0]);
    }
  };
  
  const processFileForRAG = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Create a FormData object to send the file to the backend
      const formData = new FormData();
      formData.append('file', file);
      
      // Send the file to the API for processing
      const response = await fetch('/api/rag/process-document', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process document');
      }
      
      const result = await response.json();
      console.log('Document processed:', result);
      
      setDocumentId(result.documentId);
      
      // If onDocumentProcessed callback is provided, pass the document ID to it
      if (onDocumentProcessed) {
        onDocumentProcessed(result.documentId);
      }
    } catch (error) {
      console.error('Error processing document:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto min-h-96 border border-dashed bg-background border-neutral-200 dark:border-neutral-800 rounded-lg">
      <FileUpload onChange={handleFileUpload} />
      
      {isProcessing && (
        <div className="text-center mt-4 pb-4">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            Processing document for RAG... This may take a moment.
          </p>
        </div>
      )}
      
      {error && (
        <div className="text-center mt-4 pb-4">
          <p className="text-sm text-red-600 dark:text-red-400">
            Error: {error}
          </p>
        </div>
      )}
      
      {documentId && !isProcessing && (
        <div className="text-center mt-4 pb-4">
          <p className="text-sm text-green-600 dark:text-green-400">
            Document processed successfully! Document ID: {documentId.substring(0, 8)}...
          </p>
        </div>
      )}
      
      {files.length > 0 && !isProcessing && !documentId && (
        <div className="text-center mt-4 pb-4">
          <p className="text-sm text-green-600 dark:text-green-400">
            Document uploaded successfully! Click to process for RAG.
          </p>
          <button
            onClick={() => processFileForRAG(files[0])}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Process Document
          </button>
        </div>
      )}
    </div>
  );
} 
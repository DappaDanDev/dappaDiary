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
    <div className="w-full max-w-4xl mx-auto min-h-96 border border-dashed bg-white border-purple-200 rounded-lg p-4">
      <FileUpload onChange={handleFileUpload} />
      
      {isProcessing && (
        <div className="text-center mt-4 pb-4">
          <p className="text-sm text-purple-600 flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Sprinkling AI magic on your document... Just a moment! ✨
          </p>
        </div>
      )}
      
      {error && (
        <div className="text-center mt-4 pb-4">
          <p className="text-sm text-red-600">
            Oopsie! Something went wrong: {error}
          </p>
        </div>
      )}
      
      {documentId && !isProcessing && (
        <div className="text-center mt-4 pb-4">
          <p className="text-sm text-purple-600">
            Yay! Document processed successfully! 🎉 ID: {documentId.substring(0, 8)}...
          </p>
        </div>
      )}
      
      {files.length > 0 && !isProcessing && !documentId && (
        <div className="text-center mt-4 pb-4">
          <p className="text-sm text-purple-600">
            Document uploaded successfully! ✨ Ready to make some magic?
          </p>
          <button
            onClick={() => processFileForRAG(files[0])}
            className="mt-2 px-6 py-2 bg-[#A9C99F] hover:bg-[#95B386] text-white rounded-full hover:shadow-md transition-all"
          >
            Process Document ✨
          </button>
        </div>
      )}
    </div>
  );
} 
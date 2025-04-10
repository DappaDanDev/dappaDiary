"use client";
import React, { useState } from "react";
import { FileUpload } from "@/components/ui/file-upload";

export function FileUploadDemo({ onFileUpload }: { onFileUpload?: (file: File) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  
  const handleFileUpload = (uploadedFiles: File[]) => {
    if (uploadedFiles.length > 0) {
      setFiles(uploadedFiles);
      console.log("Files uploaded:", uploadedFiles);
      
      // If onFileUpload callback is provided, pass the first file to it
      if (onFileUpload && uploadedFiles[0]) {
        onFileUpload(uploadedFiles[0]);
      }
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto min-h-96 border border-dashed bg-background border-neutral-200 dark:border-neutral-800 rounded-lg">
      <FileUpload onChange={handleFileUpload} />
      {files.length > 0 && (
        <div className="text-center mt-4 pb-4">
          <p className="text-sm text-green-600 dark:text-green-400">
            Document uploaded successfully! You can now start your conversation.
          </p>
        </div>
      )}
    </div>
  );
} 
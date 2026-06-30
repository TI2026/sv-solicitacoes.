/**
 * Magic Number file validation
 * Validates the true type of a file by reading its first few bytes
 */

// Magic numbers for allowed file types
const MAGIC_NUMBERS = {
  // Images
  jpeg: [[0xFF, 0xD8, 0xFF]],
  png: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  webp: [[0x52, 0x49, 0x46, 0x46]], // RIFF
  
  // Documents
  pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
};

export type AllowedFileType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export async function validateFileMagicNumber(file: File, allowedTypes: AllowedFileType[]): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onloadend = (e) => {
      if (!e.target?.result) {
        resolve(false);
        return;
      }
      
      const arr = new Uint8Array(e.target.result as ArrayBuffer).subarray(0, 8);
      const hexBytes = Array.from(arr);
      
      let isValid = false;

      // Helper to check if array starts with specific bytes
      const startsWithBytes = (fileBytes: number[], magicBytes: number[]) => {
        if (fileBytes.length < magicBytes.length) return false;
        for (let i = 0; i < magicBytes.length; i++) {
          if (fileBytes[i] !== magicBytes[i]) return false;
        }
        return true;
      };

      for (const type of allowedTypes) {
        let signatures: number[][] = [];
        
        switch (type) {
          case 'image/jpeg': signatures = MAGIC_NUMBERS.jpeg; break;
          case 'image/png': signatures = MAGIC_NUMBERS.png; break;
          case 'image/webp': signatures = MAGIC_NUMBERS.webp; break;
          case 'application/pdf': signatures = MAGIC_NUMBERS.pdf; break;
        }

        for (const sig of signatures) {
          if (startsWithBytes(hexBytes, sig)) {
            // For WEBP, additionally check WEBP characters at offset 8
            if (type === 'image/webp') {
              if (file.size >= 12) {
                const reader2 = new FileReader();
                reader2.onloadend = (e2) => {
                  if (!e2.target?.result) return resolve(false);
                  const arr2 = new Uint8Array(e2.target.result as ArrayBuffer);
                  // Check WEBP characters: 57 45 42 50
                  if (arr2[8] === 0x57 && arr2[9] === 0x45 && arr2[10] === 0x42 && arr2[11] === 0x50) {
                    resolve(true);
                  } else {
                    resolve(false);
                  }
                };
                reader2.readAsArrayBuffer(file.slice(0, 12));
                return; // Wait for inner reader
              }
            } else {
              isValid = true;
              break;
            }
          }
        }
        if (isValid) break;
      }

      resolve(isValid);
    };
    
    // We only need the first 8 bytes for most magic numbers
    reader.readAsArrayBuffer(file.slice(0, 8));
  });
}

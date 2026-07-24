const fs = require('fs');
const paths = [
  'src/modules/admissions/components/AdmissionDetailContent.tsx',
  'src/modules/admissions/components/ExamAttachmentUpload.tsx',
  'src/modules/admissions/pages/CandidateDetailPage.tsx',
  'src/modules/fleet/components/FleetDetailContent.tsx',
  'src/modules/fleet/contexts/FleetDetailContext.tsx',
  'src/components/ExportReportDialog.tsx'
];

paths.forEach(p => {
  if (!fs.existsSync(p)) return;
  let content = fs.readFileSync(p, 'utf8');
  let original = content;
  
  if (content.includes('window.open')) {
    // Replace window.open with openSecureWindow
    content = content.replace(/window\.open\(([^,]+)(?:,\s*'[^']+')?(?:,\s*'[^']+')?\)/g, 'openSecureWindow($1)');
    
    // Replace const w = window.open(...) -> const w = openSecureWindow(...)
    // Actually openSecureWindow doesn't return anything, so if there's const w =, remove it or just let it be void.
    content = content.replace(/const \w+\s*=\s*openSecureWindow/g, 'openSecureWindow');

    if (content !== original && !content.includes('import { openSecureWindow }')) {
      content = 'import { openSecureWindow } from "@/utils/urlSecurity";\n' + content;
      fs.writeFileSync(p, content);
      console.log('Fixed ' + p);
    } else if (content !== original) {
      fs.writeFileSync(p, content);
      console.log('Fixed ' + p);
    }
  }
});

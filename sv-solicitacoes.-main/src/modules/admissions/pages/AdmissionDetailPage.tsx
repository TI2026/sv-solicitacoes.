import { AdmissionDetailProvider } from '../contexts/AdmissionDetailContext';
import { AdmissionDetailContent } from '../components/AdmissionDetailContent';

export default function AdmissionDetailPage() {
  return (
    <AdmissionDetailProvider>
      <AdmissionDetailContent />
    </AdmissionDetailProvider>
  );
}

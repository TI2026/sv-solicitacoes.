import { FleetDetailProvider } from '../contexts/FleetDetailContext';
import { FleetDetailContent } from '../components/FleetDetailContent';

export default function FleetDetailPage() {
  return (
    <FleetDetailProvider>
      <FleetDetailContent />
    </FleetDetailProvider>
  );
}

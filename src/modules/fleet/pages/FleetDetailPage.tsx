import { FleetDetailProvider } from '../contexts/FleetDetailContext';
import { FleetDetailContent } from '../components/FleetDetailContent';
import type { FleetBusinessModule } from '../requestRoutes';

export default function FleetDetailPage({ requestType }: { requestType?: FleetBusinessModule }) {
  return (
    <FleetDetailProvider expectedType={requestType}>
      <FleetDetailContent />
    </FleetDetailProvider>
  );
}

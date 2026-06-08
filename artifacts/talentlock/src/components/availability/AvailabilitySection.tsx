import { useGetFreelancerAvailability } from "@workspace/api-client-react";
import { AvailabilityCalendar } from "./AvailabilityCalendar";

interface AvailabilitySectionProps {
  freelancerId: number;
}

export function AvailabilitySection({ freelancerId }: AvailabilitySectionProps) {
  const { data, isLoading, isError, refetch } = useGetFreelancerAvailability(freelancerId, {
    query: { enabled: !!freelancerId } as any,
  });

  return (
    <section className="space-y-4">
      <AvailabilityCalendar
        blocks={data?.blocks ?? []}
        nextAvailableDate={data?.nextAvailableDate ?? null}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
      />
    </section>
  );
}

import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getBillingStatus } from "@/lib/stripe.functions";

export function useBillingStatus(enabled: boolean) {
  const fetchBilling = useServerFn(getBillingStatus);
  return useQuery({
    queryKey: ["billing-status"],
    queryFn: () => fetchBilling(),
    enabled,
  });
}

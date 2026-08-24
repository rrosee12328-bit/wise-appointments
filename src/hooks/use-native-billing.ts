import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { installNativeBillingBridge } from "@/lib/native-billing";

export function useNativeBillingBridge(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    return installNativeBillingBridge(userId, () => {
      void queryClient.invalidateQueries({ queryKey: ["billing-status"] });
    });
  }, [queryClient, userId]);
}

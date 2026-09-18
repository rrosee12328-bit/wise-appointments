import type { Provider } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isNativeMobile } from "@/lib/native-billing";

const NATIVE_AUTH_CALLBACK = "co.jeylink.app://auth/callback";

function oauthError(url: URL) {
  return url.searchParams.get("error_description") ?? url.searchParams.get("error");
}

async function finishNativeOAuth(callbackUrl: string) {
  const url = new URL(callbackUrl);
  const error = oauthError(url);
  if (error) throw new Error(error);

  const code = url.searchParams.get("code");
  if (!code) throw new Error("The sign-in response did not include an authorization code.");

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

export async function signInWithOAuth(provider: Extract<Provider, "apple" | "google">) {
  if (!isNativeMobile()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
    return;
  }

  const [{ App }, { Browser }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/browser"),
  ]);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: NATIVE_AUTH_CALLBACK,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error("The sign-in service did not return an authorization URL.");

  let callbackReceived = false;
  let resolveCallback: (() => void) | undefined;
  let rejectCallback: ((error: Error) => void) | undefined;
  const callback = new Promise<void>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const appListener = await App.addListener("appUrlOpen", ({ url }) => {
    if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return;
    callbackReceived = true;
    void Browser.close().catch(() => undefined);
    void finishNativeOAuth(url).then(resolveCallback, rejectCallback);
  });
  const browserListener = await Browser.addListener("browserFinished", () => {
    if (!callbackReceived) rejectCallback?.(new Error("Sign-in was canceled."));
  });

  try {
    await Browser.open({ url: data.url, presentationStyle: "popover" });
    await callback;
  } finally {
    await appListener.remove();
    await browserListener.remove();
  }
}

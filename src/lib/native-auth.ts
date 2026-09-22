import type { Provider } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isNativeMobile } from "@/lib/native-billing";

export const NATIVE_AUTH_CALLBACK = "co.jeylink.app://auth/callback";

let nativeOAuthInProgress = false;

export function emailConfirmationRedirect() {
  return isNativeMobile() ? NATIVE_AUTH_CALLBACK : `${window.location.origin}/`;
}

function oauthError(url: URL) {
  return url.searchParams.get("error_description") ?? url.searchParams.get("error");
}

async function finishNativeOAuth(callbackUrl: string) {
  const url = new URL(callbackUrl);
  const error = oauthError(url);
  if (error) throw new Error(error);

  const code = url.searchParams.get("code");
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return;
  }

  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const fragmentError = fragment.get("error_description") ?? fragment.get("error");
  if (fragmentError) throw new Error(fragmentError);

  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) throw sessionError;
    return;
  }

  throw new Error("The sign-in response did not include an authorization code.");
}

export function listenForNativeAuthCallbacks() {
  if (!isNativeMobile()) return () => undefined;

  let removed = false;
  let remove: (() => void) | undefined;

  const handle = async (url: string) => {
    if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return;
    if (nativeOAuthInProgress) return;
    try {
      await finishNativeOAuth(url);
      window.location.replace("/");
    } catch (error) {
      console.error(error);
    }
  };

  void (async () => {
    const { App } = await import("@capacitor/app");
    const listener = await App.addListener("appUrlOpen", ({ url }) => {
      void handle(url);
    });
    if (removed) {
      void listener.remove();
    } else {
      remove = () => void listener.remove();
    }

    try {
      const launch = await App.getLaunchUrl();
      if (launch?.url) await handle(launch.url);
    } catch {
      // no launch URL available
    }
  })();

  return () => {
    removed = true;
    remove?.();
  };
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
  nativeOAuthInProgress = true;
  try {
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
  } finally {
    nativeOAuthInProgress = false;
  }
}

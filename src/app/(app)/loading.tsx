import { AppLoading } from "@/components/app-shell/app-loading";

/** Shell-level fallback (sign-in → workspace, org switch): branded loader. */
export default function Loading() {
  return <AppLoading />;
}

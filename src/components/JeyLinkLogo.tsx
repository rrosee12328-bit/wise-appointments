import { cn } from "@/lib/utils";

type JeyLinkLogoProps = {
  className?: string;
  imageClassName?: string;
};

export function JeyLinkLogo({ className, imageClassName }: JeyLinkLogoProps) {
  return (
    <span className={cn("inline-flex items-center bg-transparent", className)}>
      <img
        src="/jey-link-logo-light.png"
        alt="Jey Link"
        className={cn("block h-12 w-auto dark:hidden", imageClassName)}
      />
      <img
        src="/jey-link-logo-dark.png"
        alt="Jey Link"
        className={cn("hidden h-12 w-auto dark:block", imageClassName)}
      />
    </span>
  );
}

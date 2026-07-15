/** Shared page header for the auth forms: big centered title + quiet subtitle. */
export function AuthHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8 space-y-3 text-center">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}

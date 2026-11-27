interface FieldErrorProps {
  id: string;
  message?: string | null;
  className?: string;
}

export function fieldBorderClass(invalid: boolean): string {
  return invalid
    ? "border-error bg-error-container/20"
    : "border-outline-variant focus:border-primary";
}

export function FieldError({ id, message, className }: FieldErrorProps) {
  if (!message) return null;

  return (
    <p
      id={id}
      className={`flex items-start gap-gutter-xs font-body text-body-sm text-error${className ? ` ${className}` : ""}`}
    >
      <span
        className="material-symbols-outlined text-body-md mt-[2px] shrink-0"
        aria-hidden="true"
      >
        error
      </span>
      <span>
        <span className="visually-hidden">Error: </span>
        {message}
      </span>
    </p>
  );
}

import * as React from "react"

import { cn } from "@/lib/utils"

const textareaBaseStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  backgroundColor: 'white',
  minHeight: '4rem',
  transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
};

const Textarea = React.memo(function Textarea({ className, style, ...props }: React.ComponentProps<"textarea">) {
  const finalStyle = React.useMemo(() => ({
    ...textareaBaseStyle,
    ...style
  }), [style]);

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      style={finalStyle}
      {...props}
    />
  )
});

export { Textarea }

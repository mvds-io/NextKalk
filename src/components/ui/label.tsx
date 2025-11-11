"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "@/lib/utils"

const labelBaseStyle = {
  fontSize: '0.875rem',
  fontWeight: '500',
  marginBottom: '0.5rem',
  display: 'block',
  color: '#374151',
};

const Label = React.memo(function Label({
  className,
  style,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const finalStyle = React.useMemo(() => ({
    ...labelBaseStyle,
    ...style
  }), [style]);

  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      style={finalStyle}
      {...props}
    />
  )
});

export { Label }

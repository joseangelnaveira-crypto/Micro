import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold transition-all disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:shadow-md border border-primary',
        destructive: 'bg-transparent text-destructive border border-destructive hover:bg-destructive/10',
        outline: 'border border-input bg-transparent text-foreground hover:border-secondary/60 hover:text-foreground',
        secondary: 'bg-transparent text-secondary border border-secondary hover:bg-secondary/10',
        ghost: 'bg-transparent text-muted-foreground border border-transparent hover:border-input hover:text-foreground',
        link: 'text-secondary underline-offset-4 hover:underline',
        google: 'bg-card text-foreground border border-input hover:shadow-md',
      },
      size: {
        default: 'h-11 px-6 py-2 has-[>svg]:px-5',
        sm: 'h-9 rounded-full gap-1.5 px-4 has-[>svg]:px-3.5',
        lg: 'h-12 rounded-full px-8 has-[>svg]:px-6 text-base',
        icon: 'size-10',
        auto: 'h-10 px-4 w-auto',
      },
      block: {
        true: 'w-full',
        false: 'w-auto',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      block: false,
    },
  }
);

function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, block, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

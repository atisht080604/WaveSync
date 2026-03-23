import { forwardRef } from 'react';
import { cn } from '../lib/utils';
import './Input.css';

export const Input = forwardRef(({ className, type = 'text', ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn('input-base', className)}
      ref={ref}
      {...props}
    />
  );
});

Input.displayName = 'Input';

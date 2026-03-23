import { cn } from '../lib/utils';
import './Button.css';

export function Button({ variant = 'primary', className, children, ...props }) {
  const baseStyles = 'btn-base';
  
  const variants = {
    primary: 'btn-primary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
}

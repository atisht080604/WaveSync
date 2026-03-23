import { cn } from '../lib/utils';
import './Card.css';

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('card-base', className)} {...props}>
      {children}
    </div>
  );
}
